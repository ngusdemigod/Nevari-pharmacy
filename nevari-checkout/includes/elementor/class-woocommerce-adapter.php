<?php
/**
 * WooCommerce data adapter for the commerce widgets.
 */

namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

final class WooCommerce_Adapter {
    private $core;

    public function __construct($core) {
        $this->core = $core;
    }

    public function cart_available() {
        if (!function_exists('WC')) {
            return false;
        }

        if (!WC()->cart && function_exists('wc_load_cart')) {
            wc_load_cart();
        }

        return (bool) WC()->cart;
    }

    public function get_cart_view_data() {
        if (!$this->cart_available()) {
            return array('available' => false, 'empty' => true, 'items' => array(), 'snapshot' => array());
        }

        $items = array();
        foreach (WC()->cart->get_cart() as $cart_item_key => $cart_item) {
            $product = isset($cart_item['data']) ? $cart_item['data'] : null;
            if (!$product || !$product->exists() || !apply_filters('woocommerce_cart_item_visible', true, $cart_item, $cart_item_key)) {
                continue;
            }

            $quantity = max(1, absint($cart_item['quantity']));
            $maximum  = $product->get_max_purchase_quantity();
            $maximum  = $maximum > 0 ? $maximum : 9999;
            $image_id = $product->get_image_id();

            $items[] = array(
                'key'           => $cart_item_key,
                'name'          => $product->get_name(),
                'url'           => $product->is_visible() ? $product->get_permalink($cart_item) : '',
                'image'         => $image_id ? wp_get_attachment_image_url($image_id, 'woocommerce_thumbnail') : wc_placeholder_img_src('woocommerce_thumbnail'),
                'quantity'      => $quantity,
                'minimum'       => max(1, (int) $product->get_min_purchase_quantity()),
                'maximum'       => max(1, (int) $maximum),
                'current_price' => wc_price((float) wc_get_price_to_display($product)),
                'regular_price' => $this->regular_price_html($product),
                'remove_url'    => wc_get_cart_remove_url($cart_item_key),
            );
        }

        $data = array(
            'available' => true,
            'empty'     => WC()->cart->is_empty(),
            'items'     => $items,
            'snapshot'  => $this->get_cart_snapshot(),
        );

        return apply_filters('nevari_elementor_cart_view_data', $data, WC()->cart);
    }

    private function regular_price_html($product) {
        $regular = (float) $product->get_regular_price();
        $current = (float) $product->get_price();

        return $regular > 0 && $regular > $current ? wc_price($regular) : '';
    }

    public function get_cart_snapshot() {
        if (!$this->cart_available()) {
            return array('empty' => true, 'items' => array());
        }

        WC()->cart->calculate_totals();
        $totals = WC()->cart->get_totals();
        $threshold = $this->get_free_shipping_threshold();
        $items_total = (float) WC()->cart->get_cart_contents_total();
        $shipping = (float) WC()->cart->get_shipping_total() + (float) WC()->cart->get_shipping_tax();
        $discount = (float) WC()->cart->get_discount_total() + (float) WC()->cart->get_discount_tax();
        $fee_total = (float) WC()->cart->get_fee_total();
        $tax_total = (float) WC()->cart->get_total_tax();
        $tip_total = method_exists($this->core, 'get_checkout_tip_amount_for_widgets')
            ? (float) $this->core->get_checkout_tip_amount_for_widgets()
            : 0;
        $service_fee = max(0, $fee_total - $tip_total);
        $progress = $threshold > 0 ? min(100, ($items_total / $threshold) * 100) : 100;

        if ($threshold > 0 && $items_total < $threshold) {
            $progress_message = sprintf(
                __('Add %s more to unlock free delivery', 'nevari-checkout'),
                wp_strip_all_tags(wc_price($threshold - $items_total))
            );
        } else {
            $progress_message = __('Free delivery unlocked for this order', 'nevari-checkout');
        }

        $item_data = array();
        foreach (WC()->cart->get_cart() as $key => $cart_item) {
            $product = isset($cart_item['data']) ? $cart_item['data'] : null;
            if (!$product || !$product->exists()) {
                continue;
            }
            $maximum = (int) $product->get_max_purchase_quantity();
            $item_data[$key] = array(
                'quantity' => max(1, absint($cart_item['quantity'])),
                'minimum'  => max(1, (int) $product->get_min_purchase_quantity()),
                'maximum'  => $maximum > 0 ? $maximum : 9999,
            );
        }

        return array(
            'empty'            => WC()->cart->is_empty(),
            'cartHash'         => WC()->cart->get_cart_hash(),
            'items'            => $item_data,
            'itemsTotalHtml'   => wc_price($items_total),
            'shippingHtml'     => wc_price($shipping),
            'serviceFeeHtml'   => wc_price($service_fee),
            'discountHtml'     => wc_price($discount),
            'taxHtml'          => wc_price($tax_total),
            'tipHtml'          => wc_price($tip_total),
            'subtotalHtml'     => wc_price(isset($totals['total']) ? (float) $totals['total'] : 0),
            'totalHtml'        => wc_price(isset($totals['total']) ? (float) $totals['total'] : 0),
            'progress'         => round($progress, 2),
            'progressMessage'  => $progress_message,
            'appliedCoupons'   => array_values(WC()->cart->get_applied_coupons()),
        );
    }

    public function get_checkout_view_data() {
        $cart = $this->get_cart_view_data();
        $gateways = array();

        if ($this->cart_available() && WC()->payment_gateways()) {
            foreach (WC()->payment_gateways()->get_available_payment_gateways() as $gateway_id => $gateway) {
                if (!empty($gateway->has_fields)) {
                    continue;
                }
                $gateways[] = array(
                    'id'          => sanitize_key($gateway_id),
                    'title'       => wp_strip_all_tags($gateway->get_title()),
                    'description' => wp_strip_all_tags($gateway->get_description()),
                    'icon'        => $gateway->get_icon(),
                    'chosen'      => !empty($gateway->chosen),
                );
                if (count($gateways) >= 9) {
                    break;
                }
            }
        }

        $gateways = apply_filters('nevari_elementor_payment_methods', $gateways);
        $data = array(
            'cart'     => $cart,
            'gateways' => array_slice(is_array($gateways) ? $gateways : array(), 0, 9),
            'customer' => $this->get_customer_defaults(),
        );

        return apply_filters('nevari_elementor_checkout_view_data', $data, WC()->cart);
    }

    private function get_customer_defaults() {
        $customer = function_exists('WC') ? WC()->customer : null;
        if (!$customer) {
            return array('full_name' => '', 'email' => '', 'address' => '');
        }

        return array(
            'full_name' => trim($customer->get_billing_first_name() . ' ' . $customer->get_billing_last_name()),
            'email'     => $customer->get_billing_email(),
            'address'   => $customer->get_billing_address_1(),
        );
    }

    public function get_free_shipping_threshold() {
        $configured = (float) get_option('nevari_free_shipping_threshold', 0);
        if ($configured > 0) {
            return $configured;
        }

        if (!class_exists('WC_Shipping_Zones')) {
            return 0;
        }

        $base = wc_get_base_location();
        $package = array(
            'contents'    => $this->cart_available() ? WC()->cart->get_cart() : array(),
            'destination' => array(
                'country'  => isset($base['country']) ? $base['country'] : '',
                'state'    => isset($base['state']) ? $base['state'] : '',
                'postcode' => WC()->countries->get_base_postcode(),
                'city'     => WC()->countries->get_base_city(),
            ),
        );
        $zone = \WC_Shipping_Zones::get_zone_matching_package($package);
        $amounts = array();
        foreach ($zone ? $zone->get_shipping_methods(true) : array() as $method) {
            if ('free_shipping' === $method->id && 'yes' === $method->enabled) {
                $minimum = (float) $method->get_option('min_amount', 0);
                if ($minimum > 0) {
                    $amounts[] = $minimum;
                }
            }
        }

        return $amounts ? min($amounts) : 0;
    }

    public function resolve_order_from_request() {
        $order_id = absint(get_query_var('order-received'));
        if (!$order_id && isset($_GET['order_id'])) {
            $order_id = absint(wp_unslash($_GET['order_id']));
        }
        $order_key = isset($_GET['key']) ? sanitize_text_field(wp_unslash($_GET['key'])) : '';

        return $this->get_authorized_order($order_id, $order_key);
    }

    public function get_authorized_order($order_id, $order_key = '') {
        $order = $order_id ? wc_get_order($order_id) : false;
        if (!$order) {
            return new \WP_Error('nevari_order_missing', __('Order not found.', 'nevari-checkout'), array('status' => 404));
        }

        $customer_id = (int) $order->get_customer_id();
        $owned = is_user_logged_in() && $customer_id > 0 && get_current_user_id() === $customer_id;
        $keyed = $order_key && hash_equals((string) $order->get_order_key(), (string) $order_key);

        if (!$owned && !$keyed) {
            return new \WP_Error('nevari_order_forbidden', __('This order is not available.', 'nevari-checkout'), array('status' => 403));
        }

        return $order;
    }

    public function create_order_poll_token($order) {
        $expires = time() + HOUR_IN_SECONDS;
        $message = $order->get_id() . '|' . $order->get_order_key() . '|' . $expires;

        return $expires . '.' . hash_hmac('sha256', $message, wp_salt('auth'));
    }

    public function get_authorized_order_for_poll($order_id, $token) {
        $order = $order_id ? wc_get_order($order_id) : false;
        if (!$order) {
            return new \WP_Error('nevari_order_missing', __('Order not found.', 'nevari-checkout'), array('status' => 404));
        }
        $customer_id = (int) $order->get_customer_id();
        if (is_user_logged_in() && $customer_id > 0 && get_current_user_id() === $customer_id) {
            return $order;
        }
        $parts = explode('.', (string) $token, 2);
        $expires = isset($parts[0]) ? absint($parts[0]) : 0;
        if (2 !== count($parts) || !$expires || $expires < time() || $expires > time() + HOUR_IN_SECONDS + MINUTE_IN_SECONDS) {
            return new \WP_Error('nevari_order_forbidden', __('This order is not available.', 'nevari-checkout'), array('status' => 403));
        }
        $message  = $order->get_id() . '|' . $order->get_order_key() . '|' . $expires;
        $expected = hash_hmac('sha256', $message, wp_salt('auth'));
        if (!hash_equals($expected, (string) $parts[1])) {
            return new \WP_Error('nevari_order_forbidden', __('This order is not available.', 'nevari-checkout'), array('status' => 403));
        }

        return $order;
    }

    public function get_order_view_data($order) {
        $items = array();
        foreach ($order->get_items() as $item) {
            $product = $item->get_product();
            $image_id = $product ? $product->get_image_id() : 0;
            $items[] = array(
                'name'          => $item->get_name(),
                'image'         => $image_id ? wp_get_attachment_image_url($image_id, 'woocommerce_thumbnail') : wc_placeholder_img_src('woocommerce_thumbnail'),
                'quantity'      => max(1, (int) $item->get_quantity()),
                'current_price' => wc_price((float) $item->get_total()),
                'regular_price' => (float) $item->get_subtotal() > (float) $item->get_total() ? wc_price((float) $item->get_subtotal()) : '',
            );
        }

        $status = $order->get_status();
        $final_statuses = array('completed', 'cancelled', 'refunded', 'failed');
        $stage = 'placed';
        if ('completed' === $status) {
            $stage = 'completed';
        } elseif (in_array($status, array('processing'), true) || $order->is_paid()) {
            $stage = 'processing';
        } elseif (in_array($status, array('cancelled', 'refunded', 'failed'), true)) {
            $stage = 'exception';
        }

        $milestones = apply_filters(
            'nevari_elementor_order_milestones',
            array(
                array('key' => 'placed', 'label' => __('Order Placed', 'nevari-checkout'), 'date' => $order->get_date_created()),
                array('key' => 'processing', 'label' => __('Processing', 'nevari-checkout'), 'date' => $order->get_date_paid()),
                array('key' => 'completed', 'label' => __('Completed', 'nevari-checkout'), 'date' => $order->get_date_completed()),
            ),
            $order
        );

        $data = array(
            'id'              => $order->get_id(),
            'number'          => $order->get_order_number(),
            'status'          => $status,
            'status_label'    => wc_get_order_status_name($status),
            'stage'           => $stage,
            'final'           => in_array($status, $final_statuses, true),
            'items'           => $items,
            'milestones'      => $milestones,
            'shipping_html'   => wc_price((float) $order->get_shipping_total()),
            'total_html'      => $order->get_formatted_order_total(),
            'payment_heading' => $order->is_paid() ? __('Paid With', 'nevari-checkout') : __('Payment Method', 'nevari-checkout'),
            'payment_title'   => $order->get_payment_method_title(),
            'address'         => $order->get_billing_address_1(),
        );

        return apply_filters('nevari_elementor_order_progress_view_data', $data, $order);
    }
}
