<?php
if (!defined('ABSPATH')) {
    exit;
}

if (!class_exists('Nevari_WC_Paystack_Gateway') && class_exists('WC_Payment_Gateway')) {
    class Nevari_WC_Paystack_Gateway extends WC_Payment_Gateway {
        public function __construct() {
            $this->id = Nevari_Paystack::WC_GATEWAY_ID;
            $this->method_title = __('Nevari Paystack', 'nevari-pharmacy-core');
            $this->method_description = __('Hosted Paystack checkout powered by Nevari Pharmacy Core. Credentials are managed from Nevari Pharmacy > Payment Gateways.', 'nevari-pharmacy-core');
            $this->has_fields = false;
            $this->supports = ['products'];

            $this->init_form_fields();
            $this->init_settings();

            $this->title = (string) $this->get_option('title', __('Paystack', 'nevari-pharmacy-core'));
            $this->description = (string) $this->get_option('description', __('Pay securely with Paystack.', 'nevari-pharmacy-core'));
            $this->enabled = (string) $this->get_option('enabled', 'yes');

            add_action('woocommerce_update_options_payment_gateways_' . $this->id, [$this, 'process_admin_options']);
        }

        public function init_form_fields(): void {
            $this->form_fields = [
                'enabled' => [
                    'title' => __('Enable/Disable', 'nevari-pharmacy-core'),
                    'type' => 'checkbox',
                    'label' => __('Enable Nevari Paystack', 'nevari-pharmacy-core'),
                    'default' => 'yes',
                ],
                'title' => [
                    'title' => __('Title', 'nevari-pharmacy-core'),
                    'type' => 'text',
                    'default' => __('Paystack', 'nevari-pharmacy-core'),
                    'desc_tip' => true,
                ],
                'description' => [
                    'title' => __('Description', 'nevari-pharmacy-core'),
                    'type' => 'textarea',
                    'default' => __('You will be redirected to Paystack to complete your payment securely.', 'nevari-pharmacy-core'),
                ],
            ];
        }

        public function admin_options(): void {
            parent::admin_options();
            echo '<p>' . esc_html__('This gateway reuses the Paystack credentials configured in Nevari Pharmacy > Payment Gateways. Do not store separate secrets in WooCommerce.', 'nevari-pharmacy-core') . '</p>';
            echo '<p><strong>' . esc_html__('Paystack webhook URL:', 'nevari-pharmacy-core') . '</strong> <code>' . esc_html(rest_url(NEVARI_PHARMACY_REST_NS . '/payments/paystack/webhook')) . '</code></p>';
        }

        public function is_available(): bool {
            if ('yes' !== $this->enabled) {
                return false;
            }
            if (!Nevari_Paystack::is_configured()) {
                return false;
            }

            $currency = strtoupper((string) get_woocommerce_currency());
            if (!Nevari_Paystack::currency_supported($currency)) {
                return false;
            }

            return parent::is_available();
        }

        public function process_payment($order_id) {
            $order = wc_get_order($order_id);
            $result = Nevari_Paystack::process_woocommerce_payment($order);
            if (is_wp_error($result)) {
                wc_add_notice(__('We could not start the Paystack payment. Please try again or choose another payment method.', 'nevari-pharmacy-core'), 'error');
                return ['result' => 'fail'];
            }

            return $result;
        }
    }
}
