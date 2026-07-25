<?php
/**
 * Canonical checkout lifecycle and legacy compatibility bridge.
 */

namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

final class Checkout_Service {
    private $core;
    private $adapter;
    private $renderer;

    public function __construct($core, WooCommerce_Adapter $adapter, Commerce_Renderer $renderer) {
        $this->core     = $core;
        $this->adapter  = $adapter;
        $this->renderer = $renderer;

        $this->replace_legacy_hooks();
        add_filter('the_content', array($this, 'replace_cart_content'), 999);
        add_filter('the_content', array($this, 'replace_checkout_content'), 999);
        add_filter('the_content', array($this, 'replace_order_content'), 1000);
        add_shortcode('nevari_cart', array($this, 'cart_shortcode'));
        add_shortcode('nevari_cart_page', array($this, 'cart_shortcode'));
        add_shortcode('nevari_checkout', array($this, 'checkout_shortcode'));
        add_shortcode('nevari_checkout_page', array($this, 'checkout_shortcode'));

        add_filter('woocommerce_checkout_posted_data', array($this, 'normalize_posted_data'));
        add_filter('woocommerce_checkout_fields', array($this, 'checkout_fields'));

        add_action('woocommerce_checkout_process', array($this, 'validate_checkout'));
        add_action('woocommerce_checkout_create_order', array($this, 'populate_order'), 20, 2);
        add_action('woocommerce_checkout_order_created', array($this, 'remember_created_order'));
        add_filter('woocommerce_create_order', array($this, 'reuse_pending_order'), 10, 2);
        add_filter('woocommerce_get_return_url', array($this, 'success_return_url'), 10, 2);
        add_action('woocommerce_checkout_update_order_review', array($this, 'update_tip_session'));
        add_action('woocommerce_cart_calculate_fees', array($this, 'apply_tip_fee'), 20);
    }

    private function replace_legacy_hooks() {
        remove_filter('the_content', array($this->core, 'replace_cart_page_content'), 999);
        remove_filter('the_content', array($this->core, 'replace_checkout_page_content'), 999);
        remove_filter('the_content', array($this->core, 'replace_thankyou_page_content'), 1000);
        remove_filter('woocommerce_checkout_fields', array($this->core, 'make_default_fields_optional'));
        remove_action('wp_enqueue_scripts', array($this->core, 'enqueue_assets'));
        remove_action('woocommerce_checkout_process', array($this->core, 'validate_custom_fields'));
        remove_action('woocommerce_checkout_create_order', array($this->core, 'save_custom_fields'), 20);
        remove_action('woocommerce_checkout_update_order_review', array($this->core, 'update_tip_session_from_checkout'));
        remove_action('woocommerce_cart_calculate_fees', array($this->core, 'apply_tip_fee'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_product_assets'));
    }

    public function enqueue_product_assets() {
        if (function_exists('is_product') && is_product()) {
            $this->core->enqueue_assets();
        }
    }

    private function is_primary_content() {
        return !is_admin() && is_main_query() && in_the_loop();
    }

    private function contains_widget($content, $slug) {
        return false !== strpos((string) $content, 'elementor-widget-' . $slug)
            || false !== strpos((string) $content, '&quot;widgetType&quot;:&quot;' . $slug . '&quot;');
    }

    public function replace_cart_content($content) {
        if (!$this->is_primary_content() || !function_exists('is_cart') || !is_cart() || $this->contains_widget($content, 'nevari-cart')) {
            return $content;
        }

        return $this->renderer->render_cart();
    }

    public function replace_checkout_content($content) {
        if (!$this->is_primary_content() || !function_exists('is_checkout') || !is_checkout() || function_exists('is_order_received_page') && is_order_received_page() || $this->contains_widget($content, 'nevari-checkout')) {
            return $content;
        }

        return $this->renderer->render_checkout();
    }

    public function replace_order_content($content) {
        if (!$this->is_primary_content() || !function_exists('is_order_received_page') || !is_order_received_page() || $this->contains_widget($content, 'nevari-order-progress')) {
            return $content;
        }

        return $this->renderer->render_order_progress();
    }

    public function cart_shortcode() {
        return $this->renderer->render_cart();
    }

    public function checkout_shortcode() {
        return $this->renderer->render_checkout();
    }

    public function checkout_fields($fields) {
        if (isset($fields['billing']['billing_phone'])) {
            $fields['billing']['billing_phone']['required'] = false;
        }

        return $fields;
    }

    public function normalize_posted_data($data) {
        $full_name = $this->posted_text('nevari_full_name');
        $parts = preg_split('/\s+/u', trim($full_name), 2);
        $base = wc_get_base_location();
        $address = $this->posted_text('nevari_delivery_address');
        $data['billing_first_name'] = isset($parts[0]) ? $parts[0] : '';
        $data['billing_last_name'] = isset($parts[1]) ? $parts[1] : '';
        $data['billing_address_1'] = $address;
        $data['billing_country'] = isset($base['country']) ? $base['country'] : '';
        $data['billing_state'] = isset($base['state']) ? $base['state'] : '';
        $data['billing_city'] = WC()->countries->get_base_city();
        $data['billing_postcode'] = WC()->countries->get_base_postcode();
        $data['shipping_first_name'] = $data['billing_first_name'];
        $data['shipping_last_name'] = $data['billing_last_name'];
        $data['shipping_address_1'] = $address;
        $data['shipping_country'] = $data['billing_country'];
        $data['shipping_state'] = $data['billing_state'];
        $data['shipping_city'] = $data['billing_city'];
        $data['shipping_postcode'] = $data['billing_postcode'];

        return $data;
    }

    public function validate_checkout() {
        $full_name = $this->posted_text('nevari_full_name');
        $email     = $this->posted_text('billing_email');
        $address   = $this->posted_text('nevari_delivery_address');

        if ($this->text_length($full_name) < 2 || $this->text_length($full_name) > 150) {
            wc_add_notice(__('Please enter a full name between 2 and 150 characters.', 'nevari-checkout'), 'error');
        }
        if ($this->text_length($email) > 254 || !is_email($email)) {
            wc_add_notice(__('Please enter a valid email address.', 'nevari-checkout'), 'error');
        }
        if ($this->text_length($address) < 5 || $this->text_length($address) > 255) {
            wc_add_notice(__('Please enter a delivery address between 5 and 255 characters.', 'nevari-checkout'), 'error');
        }
        if (!$this->valid_checkout_token($this->posted_text('nevari_checkout_token'))) {
            wc_add_notice(__('Your checkout session has expired. Please refresh and try again.', 'nevari-checkout'), 'error');
        }
        if (!$this->read_tip_configuration($_POST)) {
            wc_add_notice(__('The selected delivery tip is invalid.', 'nevari-checkout'), 'error');
        }
    }

    public function populate_order($order, $data) {
        $full_name = $this->posted_text('nevari_full_name');
        $email     = sanitize_email($this->posted_text('billing_email'));
        $address   = $this->posted_text('nevari_delivery_address');
        $parts     = preg_split('/\s+/u', trim($full_name), 2);
        $first     = isset($parts[0]) ? $parts[0] : '';
        $last      = isset($parts[1]) ? $parts[1] : '';
        $base      = wc_get_base_location();

        $order->set_billing_first_name($first);
        $order->set_billing_last_name($last);
        $order->set_shipping_first_name($first);
        $order->set_shipping_last_name($last);
        $order->set_billing_email($email);
        $order->set_billing_address_1($address);
        $order->set_shipping_address_1($address);
        $order->set_billing_country(isset($base['country']) ? $base['country'] : '');
        $order->set_shipping_country(isset($base['country']) ? $base['country'] : '');
        $order->set_billing_state(isset($base['state']) ? $base['state'] : '');
        $order->set_shipping_state(isset($base['state']) ? $base['state'] : '');
        $order->set_billing_city(WC()->countries->get_base_city());
        $order->set_shipping_city(WC()->countries->get_base_city());
        $order->set_billing_postcode(WC()->countries->get_base_postcode());
        $order->set_shipping_postcode(WC()->countries->get_base_postcode());
        $order->update_meta_data('_nevari_checkout_full_name', $full_name);

        $token = $this->posted_text('nevari_checkout_token');
        if ($this->valid_checkout_token($token)) {
            $order->update_meta_data('_nevari_checkout_request_token', hash_hmac('sha256', $token, wp_salt('auth')));
        }

        $success_page = $this->valid_success_page(isset($_POST['nevari_success_page_id']) ? absint(wp_unslash($_POST['nevari_success_page_id'])) : 0);
        if ($success_page) {
            $order->update_meta_data('_nevari_elementor_success_page_id', $success_page);
        }

        $this->read_tip_configuration($_POST);
    }

    public function remember_created_order($order) {
        if (!WC()->session || !$order instanceof \WC_Order) {
            return;
        }
        $hash = (string) $order->get_meta('_nevari_checkout_request_token');
        if ($hash) {
            $pending = (array) WC()->session->get('nevari_pending_checkout_orders', array());
            $pending[$hash] = $order->get_id();
            WC()->session->set('nevari_pending_checkout_orders', array_slice($pending, -5, null, true));
        }
        WC()->session->set('nevari_checkout_token', wp_generate_password(32, false, false));
    }

    public function reuse_pending_order($order_id, $checkout) {
        if ($order_id || !WC()->session) {
            return $order_id;
        }
        $token = $this->posted_text('nevari_checkout_token');
        if (!$this->valid_checkout_token($token)) {
            return $order_id;
        }
        $hash = hash_hmac('sha256', $token, wp_salt('auth'));
        $pending = (array) WC()->session->get('nevari_pending_checkout_orders', array());
        $candidate = isset($pending[$hash]) ? wc_get_order(absint($pending[$hash])) : false;
        if ($candidate && $candidate->has_status('pending')) {
            return $candidate->get_id();
        }

        return $order_id;
    }

    public function success_return_url($return_url, $order) {
        if (!$order instanceof \WC_Order) {
            return $return_url;
        }
        $page_id = $this->valid_success_page(absint($order->get_meta('_nevari_elementor_success_page_id')));
        if (!$page_id) {
            return $return_url;
        }
        $url = add_query_arg(array('order_id' => $order->get_id(), 'key' => $order->get_order_key()), get_permalink($page_id));

        return wp_validate_redirect($url, $return_url);
    }

    public function update_tip_session($posted_data) {
        if (!WC()->session) {
            return;
        }
        parse_str((string) $posted_data, $parsed);
        $tip = $this->read_tip_configuration($parsed);
        WC()->session->set('nevari_selected_tip', $tip ? wc_format_decimal($tip['amount']) : '0');
        WC()->session->set('nevari_selected_tip_label', $tip ? sanitize_text_field(isset($parsed['nevari_selected_tip_label']) ? $parsed['nevari_selected_tip_label'] : '') : '');
    }

    public function apply_tip_fee($cart) {
        if ((is_admin() && !wp_doing_ajax()) || !WC()->session || !$cart instanceof \WC_Cart) {
            return;
        }
        $amount = (float) WC()->session->get('nevari_selected_tip', 0);
        if ($amount > 0 && $amount <= 100000) {
            $cart->add_fee(__('Delivery Tip', 'nevari-checkout'), $amount, false);
        }
    }

    private function read_tip_configuration($source) {
        $encoded   = isset($source['nevari_tip_config']) ? sanitize_text_field(wp_unslash($source['nevari_tip_config'])) : '';
        $signature = isset($source['nevari_tip_signature']) ? sanitize_text_field(wp_unslash($source['nevari_tip_signature'])) : '';
        $selected  = isset($source['nevari_selected_tip']) ? (float) wc_format_decimal(wp_unslash($source['nevari_selected_tip'])) : 0;
        if (!$encoded || strlen($encoded) > 2000 || !preg_match('/^[a-f0-9]{64}$/', $signature)) {
            return false;
        }
        $json = base64_decode($encoded, true);
        if (false === $json || !hash_equals(hash_hmac('sha256', $json, wp_salt('auth')), $signature)) {
            return false;
        }
        $config = json_decode($json, true);
        if (!is_array($config) || !isset($config['values'], $config['min'], $config['max']) || !is_array($config['values']) || count($config['values']) > 20) {
            return false;
        }
        $values = array_map('floatval', $config['values']);
        $minimum = max(0, (float) $config['min']);
        $maximum = min(100000, max($minimum, (float) $config['max']));
        if (0.0 === $selected) {
            return array('amount' => 0);
        }
        $preset = in_array($selected, $values, true);
        $custom = $selected >= $minimum && $selected <= $maximum;
        if ($selected < 0 || (!$preset && !$custom)) {
            return false;
        }

        return array('amount' => $selected);
    }

    private function valid_checkout_token($token) {
        return WC()->session && $token && strlen($token) <= 64 && hash_equals((string) WC()->session->get('nevari_checkout_token'), (string) $token);
    }

    private function valid_success_page($page_id) {
        if (!$page_id || 'publish' !== get_post_status($page_id) || 'page' !== get_post_type($page_id)) {
            return 0;
        }
        $url = get_permalink($page_id);
        return $url && wp_parse_url($url, PHP_URL_HOST) === wp_parse_url(home_url('/'), PHP_URL_HOST) ? $page_id : 0;
    }

    private function posted_text($key) {
        return isset($_POST[$key]) && !is_array($_POST[$key]) ? sanitize_text_field(wp_unslash($_POST[$key])) : '';
    }

    private function text_length($value) {
        return function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
    }
}
