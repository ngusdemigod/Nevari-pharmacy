<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Paystack {
    public const WC_GATEWAY_ID = 'nevari_paystack';
    public const META_SOURCE = '_nevari_wc_paystack_gateway_source';
    public const META_REFERENCE = '_nevari_wc_paystack_reference';
    public const META_CALLBACK_TOKEN = '_nevari_wc_paystack_callback_token';
    public const META_STATUS = '_nevari_wc_paystack_status';
    public const META_INITIALIZED_AT = '_nevari_wc_paystack_initialized_at';
    public const META_VERIFICATION_CHANNEL = '_nevari_wc_paystack_verification_channel';
    public const META_VERIFIED_AT = '_nevari_wc_paystack_verified_at';
    public const META_TRANSACTION_ID = '_nevari_wc_paystack_transaction_id';
    public const META_LAST_ERROR = '_nevari_wc_paystack_last_error';

    public static function init(): void {
        if (!class_exists('WooCommerce')) {
            return;
        }

        if (class_exists('WC_Payment_Gateway') && !class_exists('Nevari_WC_Paystack_Gateway')) {
            require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-wc-paystack-gateway.php';
        }

        add_filter('woocommerce_payment_gateways', [__CLASS__, 'register_woocommerce_gateway']);
        add_action('woocommerce_api_' . self::WC_GATEWAY_ID, [__CLASS__, 'handle_woocommerce_callback']);
    }

    public static function register_woocommerce_gateway(array $gateways): array {
        if (class_exists('WC_Payment_Gateway') && !class_exists('Nevari_WC_Paystack_Gateway')) {
            require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-wc-paystack-gateway.php';
        }
        if (class_exists('WC_Payment_Gateway') && !in_array('Nevari_WC_Paystack_Gateway', $gateways, true)) {
            $gateways[] = 'Nevari_WC_Paystack_Gateway';
        }

        return $gateways;
    }

    public static function settings(): array {
        return Nevari_Helpers::payment_gateway_settings();
    }

    public static function is_configured(): bool {
        $settings = self::settings();
        return !empty($settings['paystack']['public_key']) && !empty($settings['paystack']['secret_key']);
    }

    public static function webhook_secret(): string {
        $settings = self::settings();
        $secret = trim((string) ($settings['paystack']['webhook_secret'] ?? ''));
        if ($secret !== '') {
            return $secret;
        }

        return trim((string) ($settings['paystack']['secret_key'] ?? ''));
    }

    public static function supported_currencies(): array {
        $currencies = apply_filters('nevari_paystack_supported_currencies', ['NGN', 'GHS', 'ZAR', 'USD']);
        if (!is_array($currencies)) {
            return ['NGN', 'GHS', 'ZAR', 'USD'];
        }

        return array_values(array_unique(array_filter(array_map(static function ($currency) {
            $currency = strtoupper(trim((string) $currency));
            return preg_match('/^[A-Z]{3}$/', $currency) ? $currency : '';
        }, $currencies))));
    }

    public static function currency_supported(string $currency): bool {
        $currency = strtoupper(trim($currency));
        return $currency !== '' && in_array($currency, self::supported_currencies(), true);
    }

    public static function initialize_payment(string $reference, string $callback_url, array $metadata, float $amount, string $currency, string $email, string $customer_name, string $title) {
        $settings = self::settings();
        $secret_key = trim((string) ($settings['paystack']['secret_key'] ?? ''));
        if ($secret_key === '') {
            return new WP_Error('paystack_not_configured', 'Paystack secret key is not configured.');
        }

        $amount_kobo = (int) round(max(0, $amount) * 100);
        if ($amount_kobo < 100) {
            return new WP_Error('paystack_amount_invalid', 'Paystack amount must be at least the smallest currency unit.');
        }

        $response = wp_remote_post('https://api.paystack.co/transaction/initialize', [
            'headers' => [
                'Authorization' => 'Bearer ' . $secret_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode([
                'email' => sanitize_email($email ?: get_option('admin_email')),
                'amount' => $amount_kobo,
                'currency' => strtoupper(trim($currency)),
                'reference' => sanitize_text_field($reference),
                'callback_url' => esc_url_raw($callback_url),
                'metadata' => self::sanitize_metadata($metadata),
            ]),
            'timeout' => 30,
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($body)) {
            return new WP_Error('gateway_response_invalid', 'Gateway returned an invalid response.');
        }

        $payment_url = is_array($body['data'] ?? null) ? (string) ($body['data']['authorization_url'] ?? '') : '';
        $resolved_reference = is_array($body['data'] ?? null) ? (string) ($body['data']['reference'] ?? $reference) : $reference;
        if ($payment_url === '' || $resolved_reference === '') {
            return new WP_Error('gateway_initialize_failed', 'Gateway did not return a payment URL.');
        }

        return [
            'gateway' => 'paystack',
            'payment_url' => esc_url_raw($payment_url),
            'reference' => sanitize_text_field($resolved_reference),
        ];
    }

    public static function verify_payment(string $reference, float $expected_amount, string $expected_currency, array $expected_metadata) {
        $settings = self::settings();
        $secret_key = trim((string) ($settings['paystack']['secret_key'] ?? ''));
        if ($secret_key === '') {
            return new WP_Error('paystack_not_configured', 'Paystack secret key is not configured.');
        }

        $response = wp_remote_get('https://api.paystack.co/transaction/verify/' . rawurlencode($reference), [
            'headers' => ['Authorization' => 'Bearer ' . $secret_key],
            'timeout' => 30,
        ]);
        if (is_wp_error($response)) {
            return $response;
        }

        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($body)) {
            return new WP_Error('gateway_response_invalid', 'Gateway verification returned an invalid response.');
        }

        $status = strtolower((string) (($body['data']['status'] ?? '')));
        if ($status !== 'success') {
            return new WP_Error('payment_not_verified', 'Gateway has not verified this payment as successful.');
        }

        $verified_reference = sanitize_text_field((string) ($body['data']['reference'] ?? ''));
        if ($verified_reference === '' || !hash_equals($verified_reference, sanitize_text_field($reference))) {
            return new WP_Error('payment_reference_mismatch', 'Gateway payment reference is missing or invalid.');
        }

        $paid_amount = ((float) ($body['data']['amount'] ?? 0)) / 100;
        if (abs($paid_amount - $expected_amount) > 0.00001) {
            return new WP_Error('payment_amount_mismatch', 'Gateway payment amount does not match this order.');
        }

        $currency = strtoupper((string) ($body['data']['currency'] ?? ''));
        if ($currency === '' || !hash_equals(strtoupper($expected_currency), $currency)) {
            return new WP_Error('payment_currency_mismatch', 'Gateway payment currency does not match this order.');
        }

        $metadata = is_array($body['data']['metadata'] ?? null) ? $body['data']['metadata'] : [];
        foreach ($expected_metadata as $key => $value) {
            if ((string) ($metadata[$key] ?? '') !== (string) $value) {
                return new WP_Error('payment_metadata_mismatch', 'Gateway payment metadata does not match this order.');
            }
        }

        return [
            'paid' => true,
            'reference' => $verified_reference,
            'transaction_id' => sanitize_text_field((string) (($body['data']['id'] ?? '') ?: $verified_reference)),
            'payload' => $body,
        ];
    }

    public static function process_woocommerce_payment($order) {
        if (!$order || !is_object($order) || !method_exists($order, 'get_id')) {
            return new WP_Error('invalid_order', 'Order could not be loaded for Paystack payment.');
        }
        if (!self::is_configured()) {
            return new WP_Error('paystack_not_configured', 'Paystack is not configured.');
        }

        $currency = strtoupper((string) ($order->get_currency() ?: get_woocommerce_currency()));
        if (!self::currency_supported($currency)) {
            return new WP_Error('unsupported_currency', 'The store currency is not supported by this Paystack gateway.');
        }
        if (!$order->needs_payment()) {
            return new WP_Error('payment_not_required', 'This order does not require payment.');
        }

        $reference = self::build_reference($order);
        $callback_token = wp_generate_password(32, false, false);
        $callback_url = self::gateway_callback_url($order, $callback_token);
        $metadata = [
            'order_id' => (int) $order->get_id(),
            'order_key' => (string) $order->get_order_key(),
            'source' => 'woocommerce_order_checkout',
            'gateway_source' => 'nevari_paystack',
        ];
        $initialized = self::initialize_payment(
            $reference,
            $callback_url,
            $metadata,
            (float) $order->get_total(),
            $currency,
            (string) $order->get_billing_email(),
            trim((string) $order->get_formatted_billing_full_name()),
            'Order ' . $order->get_order_number()
        );
        if (is_wp_error($initialized)) {
            self::mark_order_payment_failed($order, $initialized->get_error_message(), 'initialize');
            return $initialized;
        }

        self::mark_order_payment_initialized(
            $order,
            sanitize_text_field((string) ($initialized['reference'] ?? $reference)),
            $callback_token
        );

        return [
            'result' => 'success',
            'redirect' => (string) $initialized['payment_url'],
        ];
    }

    public static function verify_and_complete_woocommerce_order($order, string $reference, string $channel = 'callback') {
        if (!$order || !is_object($order) || !method_exists($order, 'get_id')) {
            return new WP_Error('order_not_found', 'Order not found.');
        }

        $stored_reference = sanitize_text_field((string) $order->get_meta(self::META_REFERENCE));
        if ($stored_reference === '' || !hash_equals($stored_reference, sanitize_text_field($reference))) {
            return new WP_Error('payment_context_mismatch', 'Payment does not match the initialized order transaction.');
        }

        $existing_transaction_id = sanitize_text_field((string) $order->get_meta(self::META_TRANSACTION_ID));
        if (!$order->needs_payment() && $existing_transaction_id !== '') {
            return [
                'paid' => true,
                'transaction_id' => $existing_transaction_id,
                'reference' => $stored_reference,
            ];
        }

        $result = self::verify_payment(
            $stored_reference,
            (float) $order->get_total(),
            strtoupper((string) ($order->get_currency() ?: get_woocommerce_currency())),
            [
                'order_id' => (int) $order->get_id(),
                'order_key' => (string) $order->get_order_key(),
                'source' => 'woocommerce_order_checkout',
                'gateway_source' => 'nevari_paystack',
            ]
        );
        if (is_wp_error($result)) {
            self::mark_order_payment_failed($order, $result->get_error_message(), $channel);
            return $result;
        }

        self::complete_woocommerce_order_payment(
            $order,
            $stored_reference,
            sanitize_text_field((string) ($result['transaction_id'] ?? $stored_reference)),
            $channel
        );

        return [
            'paid' => true,
            'transaction_id' => sanitize_text_field((string) ($result['transaction_id'] ?? $stored_reference)),
            'reference' => $stored_reference,
        ];
    }

    public static function webhook_signature_valid(WP_REST_Request $request, string $raw_body): bool {
        $secret = self::webhook_secret();
        $signature = trim((string) $request->get_header('x-paystack-signature'));
        return $secret !== '' && $signature !== '' && hash_equals(hash_hmac('sha512', $raw_body, $secret), $signature);
    }

    public static function get_order_for_reference(string $reference) {
        if ($reference === '' || !function_exists('wc_get_orders')) {
            return null;
        }

        $orders = wc_get_orders([
            'limit' => 1,
            'meta_key' => self::META_REFERENCE,
            'meta_value' => sanitize_text_field($reference),
        ]);

        return $orders ? $orders[0] : null;
    }

    public static function handle_woocommerce_callback(): void {
        if (!function_exists('wc_get_order')) {
            wp_safe_redirect(home_url('/'));
            exit;
        }

        $order_id = isset($_GET['order_id']) ? absint(wp_unslash($_GET['order_id'])) : 0;
        $order_key = isset($_GET['key']) ? wc_clean(wp_unslash($_GET['key'])) : '';
        $token = isset($_GET['token']) ? sanitize_text_field(wp_unslash($_GET['token'])) : '';
        $reference = isset($_GET['reference']) ? sanitize_text_field(wp_unslash($_GET['reference'])) : '';
        if ($reference === '' && isset($_GET['trxref'])) {
            $reference = sanitize_text_field(wp_unslash($_GET['trxref']));
        }

        $order = $order_id > 0 ? wc_get_order($order_id) : null;
        if (!$order || !$order_key || !hash_equals((string) $order->get_order_key(), $order_key)) {
            if (function_exists('wc_add_notice')) {
                wc_add_notice(__('We could not locate the order for this Paystack callback.', 'nevari-pharmacy-core'), 'error');
            }
            wp_safe_redirect(function_exists('wc_get_checkout_url') ? wc_get_checkout_url() : home_url('/'));
            exit;
        }

        $stored_token = sanitize_text_field((string) $order->get_meta(self::META_CALLBACK_TOKEN));
        if ($stored_token === '' || $token === '' || !hash_equals($stored_token, $token) || $reference === '') {
            self::mark_order_payment_failed($order, 'Callback token or reference validation failed.', 'callback');
            if (function_exists('wc_add_notice')) {
                wc_add_notice(__('We could not confirm your Paystack payment yet. Please try again or contact support if you were charged.', 'nevari-pharmacy-core'), 'error');
            }
            wp_safe_redirect($order->get_checkout_payment_url(false));
            exit;
        }

        $result = self::verify_and_complete_woocommerce_order($order, $reference, 'callback');
        if (is_wp_error($result)) {
            if (function_exists('wc_add_notice')) {
                wc_add_notice(__('We could not confirm your Paystack payment yet. Please try again or contact support if you were charged.', 'nevari-pharmacy-core'), 'error');
            }
            wp_safe_redirect($order->get_checkout_payment_url(false));
            exit;
        }

        wp_safe_redirect($order->get_checkout_order_received_url());
        exit;
    }

    public static function gateway_callback_url($order, string $callback_token): string {
        $base_url = function_exists('WC') ? WC()->api_request_url(self::WC_GATEWAY_ID) : add_query_arg('wc-api', self::WC_GATEWAY_ID, home_url('/'));
        return add_query_arg([
            'order_id' => (int) $order->get_id(),
            'key' => (string) $order->get_order_key(),
            'token' => $callback_token,
        ], $base_url);
    }

    public static function build_reference($order): string {
        return sprintf(
            'NVH-WCP-%d-%s',
            (int) $order->get_id(),
            strtoupper(wp_generate_password(10, false, false))
        );
    }

    private static function mark_order_payment_initialized($order, string $reference, string $callback_token): void {
        $order->update_meta_data(self::META_SOURCE, 'nevari_paystack');
        $order->update_meta_data(self::META_REFERENCE, $reference);
        $order->update_meta_data(self::META_CALLBACK_TOKEN, $callback_token);
        $order->update_meta_data(self::META_STATUS, 'initialized');
        $order->update_meta_data(self::META_INITIALIZED_AT, Nevari_Helpers::now());
        $order->delete_meta_data(self::META_LAST_ERROR);
        $order->save();

        $order->add_order_note(__('Nevari Paystack payment initialized. Customer redirected to Paystack hosted checkout.', 'nevari-pharmacy-core'));
        Nevari_Audit::log('payments', 'nevari', 'woocommerce.paystack.initialized', 'success', [
            'object_type' => 'shop_order',
            'object_id' => (int) $order->get_id(),
            'order_id' => (int) $order->get_id(),
            'message' => 'Nevari Paystack gateway initialized for WooCommerce order.',
        ]);
    }

    private static function complete_woocommerce_order_payment($order, string $reference, string $transaction_id, string $channel): void {
        $existing_transaction_id = sanitize_text_field((string) $order->get_meta(self::META_TRANSACTION_ID));
        if (!$order->needs_payment() && $existing_transaction_id !== '') {
            return;
        }

        if ($order->needs_payment()) {
            $order->payment_complete($transaction_id);
        }
        $order->set_transaction_id($transaction_id);
        $order->update_meta_data(self::META_STATUS, 'paid');
        $order->update_meta_data(self::META_TRANSACTION_ID, $transaction_id);
        $order->update_meta_data(self::META_REFERENCE, $reference);
        $order->update_meta_data(self::META_VERIFIED_AT, Nevari_Helpers::now());
        $order->update_meta_data(self::META_VERIFICATION_CHANNEL, sanitize_key($channel));
        $order->delete_meta_data(self::META_LAST_ERROR);
        $order->save();

        $order->add_order_note(sprintf(
            'Payment verified via Nevari Paystack (%s). Reference: %s. Transaction ID: %s',
            sanitize_text_field($channel),
            $reference,
            $transaction_id
        ));
        Nevari_Audit::log('payments', 'nevari', 'woocommerce.paystack.paid', 'success', [
            'object_type' => 'shop_order',
            'object_id' => (int) $order->get_id(),
            'order_id' => (int) $order->get_id(),
            'message' => sprintf('WooCommerce order payment verified by Nevari Paystack via %s.', $channel),
            'metadata' => [
                'reference' => $reference,
                'transaction_id' => $transaction_id,
                'channel' => $channel,
            ],
        ]);
    }

    private static function mark_order_payment_failed($order, string $message, string $channel): void {
        if (!$order || !is_object($order) || !method_exists($order, 'get_id')) {
            return;
        }

        $order->update_meta_data(self::META_STATUS, 'verification_failed');
        $order->update_meta_data(self::META_VERIFICATION_CHANNEL, sanitize_key($channel));
        $order->update_meta_data(self::META_LAST_ERROR, sanitize_text_field($message));
        $order->save();

        $order->add_order_note(sprintf(
            'Nevari Paystack verification did not complete via %s. Reason: %s',
            sanitize_text_field($channel),
            sanitize_text_field($message)
        ));
        Nevari_Audit::log('payments', 'nevari', 'woocommerce.paystack.verification_failed', 'error', [
            'object_type' => 'shop_order',
            'object_id' => (int) $order->get_id(),
            'order_id' => (int) $order->get_id(),
            'message' => 'WooCommerce order payment could not be verified through Nevari Paystack.',
            'metadata' => [
                'channel' => $channel,
            ],
        ]);
    }

    private static function sanitize_metadata(array $metadata): array {
        $clean = [];
        foreach ($metadata as $key => $value) {
            $normalized_key = sanitize_key((string) $key);
            if ($normalized_key === '') {
                continue;
            }
            if (is_scalar($value) || $value === null) {
                $clean[$normalized_key] = sanitize_text_field((string) $value);
            }
        }

        return $clean;
    }
}
