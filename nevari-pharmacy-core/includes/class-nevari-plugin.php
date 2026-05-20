<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Plugin {
    private static $instance = null;

    public static function instance(): self {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init(): void {
        add_action('init', [$this, 'register_post_types']);
        add_action('init', [$this, 'register_taxonomies']);
        add_action('init', [$this, 'register_product_meta']);

        Nevari_Audit::init();
        Nevari_Auth::init();
        Nevari_Rest::init();
        Nevari_Admin::init();
        Nevari_Emails::init();

        $this->register_woocommerce_hooks();
    }

    public function register_post_types(): void {
        register_post_type('nevari_doctor_profile', [
            'label' => __('Doctor Profiles', 'nevari-pharmacy-core'),
            'labels' => [
                'name' => __('Doctor Profiles', 'nevari-pharmacy-core'),
                'singular_name' => __('Doctor Profile', 'nevari-pharmacy-core'),
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => false,
            'show_in_rest' => false,
            'supports' => ['title', 'editor', 'thumbnail'],
            'capability_type' => 'post',
        ]);
    }

    public function register_taxonomies(): void {
        register_taxonomy('nevari_doctor_specialty', ['nevari_doctor_profile'], [
            'label' => __('Doctor Specialties', 'nevari-pharmacy-core'),
            'public' => false,
            'show_ui' => true,
            'show_in_rest' => false,
            'hierarchical' => true,
        ]);

        register_taxonomy('nevari_doctor_language', ['nevari_doctor_profile'], [
            'label' => __('Doctor Languages', 'nevari-pharmacy-core'),
            'public' => false,
            'show_ui' => true,
            'show_in_rest' => false,
            'hierarchical' => false,
        ]);

        register_taxonomy('nevari_doctor_location', ['nevari_doctor_profile'], [
            'label' => __('Doctor Locations', 'nevari-pharmacy-core'),
            'public' => false,
            'show_ui' => true,
            'show_in_rest' => false,
            'hierarchical' => true,
        ]);

        if (post_type_exists('product')) {
            register_taxonomy('nevari_product_badge', ['product'], [
                'label' => __('Pharmacy Product Badges', 'nevari-pharmacy-core'),
                'public' => false,
                'show_ui' => true,
                'show_in_rest' => false,
                'hierarchical' => false,
            ]);
        }
    }

    public function register_product_meta(): void {
        if (!function_exists('register_post_meta')) {
            return;
        }

        $boolean_meta = [
            '_nevari_rx_required',
            '_nevari_consultation_required',
            '_nevari_otc',
            '_nevari_restricted_visibility',
        ];

        foreach ($boolean_meta as $key) {
            register_post_meta('product', $key, [
                'single' => true,
                'type' => 'boolean',
                'show_in_rest' => false,
                'auth_callback' => static function () {
                    return current_user_can('edit_products') || current_user_can('nevari_manage_products');
                },
            ]);
        }

        foreach (['_nevari_badge_label', '_nevari_badge_color', '_nevari_dosage_form', '_nevari_strength', '_nevari_active_ingredient'] as $key) {
            register_post_meta('product', $key, [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'sanitize_callback' => 'sanitize_text_field',
                'auth_callback' => static function () {
                    return current_user_can('edit_products') || current_user_can('nevari_manage_products');
                },
            ]);
        }
    }

    private function register_woocommerce_hooks(): void {
        add_action('woocommerce_new_order', static function ($order_id) {
            Nevari_Audit::log('orders', 'woocommerce', 'order.created', 'success', [
                'object_type' => 'shop_order',
                'object_id' => (int) $order_id,
                'order_id' => (int) $order_id,
                'message' => 'WooCommerce order created.',
            ]);
        }, 10, 1);

        add_action('woocommerce_order_status_changed', static function ($order_id, $old_status, $new_status) {
            Nevari_Audit::log('orders', 'woocommerce', 'order.status_changed', 'success', [
                'object_type' => 'shop_order',
                'object_id' => (int) $order_id,
                'order_id' => (int) $order_id,
                'message' => sprintf('Order status changed from %s to %s.', $old_status, $new_status),
                'metadata' => [
                    'old_status' => $old_status,
                    'new_status' => $new_status,
                ],
            ]);
        }, 10, 3);

        add_action('woocommerce_payment_complete', static function ($order_id) {
            Nevari_Audit::log('payments', 'woocommerce', 'payment.completed', 'success', [
                'object_type' => 'shop_order',
                'object_id' => (int) $order_id,
                'order_id' => (int) $order_id,
                'message' => 'WooCommerce payment completed.',
            ]);
        }, 10, 1);

        add_filter('woocommerce_add_to_cart_validation', [$this, 'validate_rx_add_to_cart'], 10, 3);
        add_action('woocommerce_checkout_process', [$this, 'validate_rx_checkout']);
        add_action('woocommerce_checkout_create_order_line_item', [$this, 'add_rx_order_item_meta'], 10, 4);
    }

    public function validate_rx_add_to_cart($passed, $product_id, $quantity) {
        if (!$passed || !Nevari_Helpers::product_requires_rx((int) $product_id)) {
            return $passed;
        }

        $user_id = get_current_user_id();
        if (!$user_id || !Nevari_Helpers::patient_has_valid_prescription_for_product($user_id, (int) $product_id, (float) $quantity)) {
            wc_add_notice(__('This product requires a valid prescription before purchase.', 'nevari-pharmacy-core'), 'error');
            Nevari_Audit::log('orders', 'woocommerce', 'order.rx_validation_failed', 'error', [
                'product_id' => (int) $product_id,
                'related_user_id' => (int) $user_id,
                'message' => 'Patient attempted to add RX product without a valid prescription.',
            ]);
            return false;
        }

        return $passed;
    }

    public function validate_rx_checkout(): void {
        if (!function_exists('WC') || !WC()->cart) {
            return;
        }

        $user_id = get_current_user_id();
        foreach (WC()->cart->get_cart() as $cart_item) {
            $product_id = isset($cart_item['product_id']) ? (int) $cart_item['product_id'] : 0;
            $quantity = isset($cart_item['quantity']) ? (float) $cart_item['quantity'] : 1;
            if ($product_id && Nevari_Helpers::product_requires_rx($product_id) && !Nevari_Helpers::patient_has_valid_prescription_for_product($user_id, $product_id, $quantity)) {
                wc_add_notice(__('Your cart contains a prescription-only product without a valid prescription.', 'nevari-pharmacy-core'), 'error');
                Nevari_Audit::log('orders', 'woocommerce', 'order.rx_validation_failed', 'error', [
                    'product_id' => $product_id,
                    'related_user_id' => (int) $user_id,
                    'message' => 'Checkout blocked because RX validation failed.',
                ]);
            }
        }
    }

    public function add_rx_order_item_meta($item, $cart_item_key, $values, $order): void {
        $product_id = isset($values['product_id']) ? (int) $values['product_id'] : 0;
        if (!$product_id || !Nevari_Helpers::product_requires_rx($product_id)) {
            return;
        }
        $item->add_meta_data('_nevari_rx_required', 'yes', true);
        $prescription = Nevari_Helpers::find_valid_prescription_for_product((int) $order->get_user_id(), $product_id, isset($values['quantity']) ? (float) $values['quantity'] : 1);
        if ($prescription) {
            $item->add_meta_data('_nevari_prescription_id', (int) $prescription->id, true);
        }
    }
}
