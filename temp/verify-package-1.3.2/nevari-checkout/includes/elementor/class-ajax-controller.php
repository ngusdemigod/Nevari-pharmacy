<?php
/**
 * Purpose-specific AJAX endpoints for the commerce widgets.
 */

namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

final class Ajax_Controller {
    private $adapter;

    public function __construct(WooCommerce_Adapter $adapter) {
        $this->adapter = $adapter;

        $legacy = array(
            'nevari_get_cart_total'         => 'get_cart_total',
            'nevari_update_cart_quantity'   => 'update_cart_quantity',
            'nevari_apply_checkout_coupon'  => 'apply_coupon',
            'nevari_remove_checkout_coupon' => 'remove_coupon',
        );
        foreach ($legacy as $action => $method) {
            foreach (array('wp_ajax_' . $action, 'wp_ajax_nopriv_' . $action) as $hook) {
                remove_all_actions($hook);
                add_action($hook, array($this, $method));
            }
        }

        foreach (array('wp_ajax_nevari_remove_cart_item', 'wp_ajax_nopriv_nevari_remove_cart_item') as $hook) {
            add_action($hook, array($this, 'remove_cart_item'));
        }
        foreach (array('wp_ajax_nevari_get_order_progress', 'wp_ajax_nopriv_nevari_get_order_progress') as $hook) {
            add_action($hook, array($this, 'get_order_progress'));
        }
    }

    private function require_post() {
        if ('POST' !== strtoupper(isset($_SERVER['REQUEST_METHOD']) ? sanitize_text_field(wp_unslash($_SERVER['REQUEST_METHOD'])) : '')) {
            wp_send_json_error(array('message' => __('Invalid request.', 'nevari-checkout')), 405);
        }
    }

    private function require_cart($nonce_action) {
        $this->require_post();
        check_ajax_referer($nonce_action, 'nonce');
        if (!$this->adapter->cart_available() || !WC()->session) {
            wp_send_json_error(array('message' => __('Cart is unavailable.', 'nevari-checkout')), 400);
        }
    }

    public function get_cart_total() {
        $this->require_cart('nevari-cart-total');
        $snapshot = $this->adapter->get_cart_snapshot();
        wp_send_json_success(array('total_html' => $snapshot['totalHtml'], 'snapshot' => $snapshot));
    }

    public function update_cart_quantity() {
        $this->require_cart('nevari-update-cart');
        $key = isset($_POST['cart_item_key']) ? wc_clean(wp_unslash($_POST['cart_item_key'])) : '';
        $quantity = isset($_POST['quantity']) && !is_array($_POST['quantity']) ? absint(wp_unslash($_POST['quantity'])) : 0;
        $item = $key && WC()->cart->find_product_in_cart($key) ? WC()->cart->get_cart_item($key) : false;
        $product = $item && isset($item['data']) ? $item['data'] : false;
        if (!$product || !$product->exists()) {
            wp_send_json_error(array('message' => __('Cart item could not be found.', 'nevari-checkout')), 404);
        }
        $minimum = max(1, (int) $product->get_min_purchase_quantity());
        $maximum = (int) $product->get_max_purchase_quantity();
        $maximum = $maximum > 0 ? $maximum : 9999;
        if ($product->is_sold_individually()) {
            $minimum = 1;
            $maximum = 1;
        }
        if ($quantity < $minimum || $quantity > $maximum || !$product->has_enough_stock($quantity)) {
            wp_send_json_error(array('message' => __('That quantity is not available.', 'nevari-checkout')), 400);
        }
        if (!WC()->cart->set_quantity($key, $quantity, true)) {
            wp_send_json_error(array('message' => __('The cart could not be updated.', 'nevari-checkout')), 400);
        }
        WC()->cart->calculate_totals();
        wp_send_json_success(array('snapshot' => $this->adapter->get_cart_snapshot()));
    }

    public function apply_coupon() {
        $this->require_cart('nevari-checkout-coupon');
        if (!$this->within_rate_limit('coupon', 12)) {
            wp_send_json_error(array('message' => __('Please wait before trying another coupon.', 'nevari-checkout')), 429);
        }
        $code = isset($_POST['coupon_code']) && !is_array($_POST['coupon_code']) ? wc_format_coupon_code(wp_unslash($_POST['coupon_code'])) : '';
        if (!$code || strlen($code) > 50 || !wc_get_coupon_id_by_code($code) || !WC()->cart->apply_coupon($code)) {
            wc_clear_notices();
            wp_send_json_error(array('message' => __('Coupon could not be applied.', 'nevari-checkout')), 400);
        }
        WC()->cart->calculate_totals();
        wp_send_json_success(array('message' => __('Coupon applied.', 'nevari-checkout'), 'snapshot' => $this->adapter->get_cart_snapshot()));
    }

    public function remove_coupon() {
        $this->require_cart('nevari-checkout-coupon');
        $code = isset($_POST['coupon_code']) && !is_array($_POST['coupon_code']) ? wc_format_coupon_code(wp_unslash($_POST['coupon_code'])) : '';
        if (!$code || strlen($code) > 50 || !in_array($code, WC()->cart->get_applied_coupons(), true)) {
            wp_send_json_error(array('message' => __('Coupon could not be removed.', 'nevari-checkout')), 400);
        }
        WC()->cart->remove_coupon($code);
        WC()->cart->calculate_totals();
        wp_send_json_success(array('message' => __('Coupon removed.', 'nevari-checkout'), 'snapshot' => $this->adapter->get_cart_snapshot()));
    }

    public function remove_cart_item() {
        $this->require_cart('nevari-update-cart');

        $key = isset($_POST['cart_item_key']) ? wc_clean(wp_unslash($_POST['cart_item_key'])) : '';
        if (!$key || !WC()->cart->find_product_in_cart($key)) {
            wp_send_json_error(array('message' => __('Cart item could not be found.', 'nevari-checkout')), 404);
        }

        if (!WC()->cart->remove_cart_item($key)) {
            wp_send_json_error(array('message' => __('The item could not be removed.', 'nevari-checkout')), 400);
        }

        WC()->cart->calculate_totals();
        wp_send_json_success(array('removedKey' => $key, 'snapshot' => $this->adapter->get_cart_snapshot()));
    }

    public function get_order_progress() {
        $this->require_post();
        check_ajax_referer('nevari-order-progress', 'nonce');

        $order_id = isset($_POST['order_id']) ? absint(wp_unslash($_POST['order_id'])) : 0;
        $poll_token = isset($_POST['poll_token']) && !is_array($_POST['poll_token']) ? sanitize_text_field(wp_unslash($_POST['poll_token'])) : '';
        if (!$order_id || strlen($poll_token) > 100) {
            wp_send_json_error(array('message' => __('Order is unavailable.', 'nevari-checkout')), 400);
        }

        $rate_key = 'nevari_order_poll_' . md5($order_id . '|' . $this->client_ip());
        $count = (int) get_transient($rate_key);
        if ($count >= 8) {
            wp_send_json_error(array('message' => __('Please wait before checking again.', 'nevari-checkout')), 429);
        }
        set_transient($rate_key, $count + 1, MINUTE_IN_SECONDS);

        $order = $this->adapter->get_authorized_order_for_poll($order_id, $poll_token);
        if (is_wp_error($order)) {
            $error_data = $order->get_error_data();
            $status = isset($error_data['status']) ? (int) $error_data['status'] : 403;
            wp_send_json_error(array('message' => __('Order is unavailable.', 'nevari-checkout')), $status);
        }

        $cache_key = 'order_progress_' . $order->get_id() . '_' . sanitize_key($order->get_status());
        $data = wp_cache_get($cache_key, 'nevari_checkout');
        if (false === $data) {
            $data = $this->adapter->get_order_view_data($order);
            wp_cache_set($cache_key, $data, 'nevari_checkout', 15);
        }
        wp_send_json_success(
            array(
                'status'      => $data['status'],
                'statusLabel' => $data['status_label'],
                'stage'       => $data['stage'],
                'final'       => $data['final'],
                'milestones'  => array_map(
                    static function ($milestone) {
                        return array(
                            'key'   => $milestone['key'],
                            'label' => $milestone['label'],
                            'date'  => !empty($milestone['date']) && is_object($milestone['date']) ? $milestone['date']->date_i18n(get_option('date_format') . ' ' . get_option('time_format')) : '',
                        );
                    },
                    $data['milestones']
                ),
            )
        );
    }

    private function within_rate_limit($purpose, $maximum) {
        $identity = WC()->session ? WC()->session->get_customer_id() : $this->client_ip();
        $key = 'nevari_' . sanitize_key($purpose) . '_' . md5((string) $identity . '|' . $this->client_ip());
        $count = (int) get_transient($key);
        if ($count >= $maximum) {
            return false;
        }
        set_transient($key, $count + 1, MINUTE_IN_SECONDS);

        return true;
    }

    private function client_ip() {
        return isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : 'unknown';
    }
}

