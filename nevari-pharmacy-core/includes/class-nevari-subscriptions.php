<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Subscriptions {
    private const PLAN_KEY = 'nevari_access_pro';
    private const PLAN_NAME = 'Nevari Access Pro';
    private const PLAN_INTERVAL = 'monthly';
    private const PLAN_AMOUNT_KOBO = 1000;
    private const PLAN_CURRENCY = 'NGN';

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/subscriptions/me', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'me'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/subscriptions/admin', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'admin'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/subscriptions/admin', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'save_admin_plan'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);

        foreach (['initialize', 'verify', 'cancel'] as $action) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/subscriptions/' . $action, [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, $action],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ]);
        }
    }

    public static function auth_required(): bool {
        return Nevari_Auth::api_session_required();
    }

    public static function store_admin_required(): bool {
        return Nevari_Helpers::is_store_admin();
    }

    private static function default_plan_definition(): array {
        return [
            'plan_key' => self::PLAN_KEY,
            'name' => self::PLAN_NAME,
            'amount_kobo' => self::PLAN_AMOUNT_KOBO,
            'currency' => self::PLAN_CURRENCY,
            'interval_unit' => self::PLAN_INTERVAL,
            'status' => 'active',
            'metadata' => [],
        ];
    }

    private static function normalize_plan_definition(?object $row = null): array {
        $definition = self::default_plan_definition();
        if (!$row) {
            return $definition;
        }

        $metadata = [];
        if (!empty($row->metadata)) {
            $decoded = json_decode((string) $row->metadata, true);
            if (is_array($decoded)) {
                $metadata = $decoded;
            }
        }

        return [
            'plan_key' => sanitize_key((string) ($row->plan_key ?? $definition['plan_key'])),
            'name' => (string) ($row->name ?? $definition['name']),
            'amount_kobo' => max(0, (int) ($row->amount_kobo ?? $definition['amount_kobo'])),
            'currency' => strtoupper(sanitize_text_field((string) ($row->currency ?? $definition['currency']))) ?: $definition['currency'],
            'interval_unit' => sanitize_key((string) ($row->interval_unit ?? $definition['interval_unit'])) ?: $definition['interval_unit'],
            'status' => sanitize_key((string) ($row->status ?? $definition['status'])) ?: $definition['status'],
            'metadata' => $metadata,
            'plan_code' => sanitize_text_field((string) ($row->plan_code ?? '')),
        ];
    }

    private static function current_plan_definition(): array {
        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$plans_table} WHERE plan_key = %s LIMIT 1",
            self::PLAN_KEY
        ));
        return self::normalize_plan_definition($row);
    }

    private static function amount_to_kobo($value): int {
        $raw = is_string($value) || is_numeric($value) ? (string) $value : '';
        $normalized = preg_replace('/[^0-9.]/', '', $raw ?? '');
        if ($normalized === '' || $normalized === null) {
            return 0;
        }
        return (int) round(((float) $normalized) * 100);
    }

    private static function response_from_wp_error($error): WP_REST_Response {
        $data = is_wp_error($error) ? $error->get_error_data() : [];
        $status = is_array($data) && isset($data['status']) ? (int) $data['status'] : 400;
        $payload = is_array($data) ? $data : [];
        return Nevari_Helpers::error(is_wp_error($error) ? $error->get_error_code() : 'error', is_wp_error($error) ? $error->get_error_message() : 'Request failed.', $status, $payload);
    }

    private static function verify_protected_action(array $params, int $expected_user_id = 0) {
        global $wpdb;

        $challenge_id = isset($params['challenge_id']) ? sanitize_text_field((string) $params['challenge_id']) : '';
        $code = isset($params['code']) ? preg_replace('/\D+/', '', (string) $params['code']) : '';
        if (!$challenge_id || strlen($code) !== 6) {
            return new WP_Error('validation_error', 'challenge_id and six-digit code are required.', ['status' => 422]);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            return new WP_Error('untrusted_frontend', 'This frontend is not paired with the pharmacy installation.', ['status' => 403]);
        }

        $table = Nevari_Helpers::table('login_challenges');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE challenge_uuid = %s AND consumed_at IS NULL AND expires_at > %s LIMIT 1",
            $challenge_id,
            Nevari_Helpers::now()
        ));
        if (!$row || $row->frontend_type !== $frontend['frontend_type'] || $row->frontend_origin !== $frontend['frontend_origin']) {
            return new WP_Error('invalid_verification_code', 'Verification code is invalid or expired.', ['status' => 401]);
        }
        if ($expected_user_id > 0 && (int) $row->user_id !== $expected_user_id) {
            return new WP_Error('forbidden', 'Unauthorized user', ['status' => 403]);
        }
        if ((int) $row->attempts >= 5) {
            return new WP_Error('verification_locked', 'Verification challenge is locked.', ['status' => 429]);
        }

        $wpdb->update($table, ['attempts' => (int) $row->attempts + 1], ['id' => (int) $row->id], ['%d'], ['%d']);
        if (!hash_equals((string) $row->code_hash, hash('sha256', $code))) {
            Nevari_Audit::log('security', 'nevari', 'subscription.verification_failed', 'error', [
                'related_user_id' => (int) $row->user_id,
                'severity' => 'warning',
                'message' => 'Subscription protection code failed.',
            ]);
            return new WP_Error('invalid_verification_code', 'Verification code is invalid or expired.', ['status' => 401]);
        }

        $wpdb->update($table, ['consumed_at' => Nevari_Helpers::now()], ['id' => (int) $row->id], ['%s'], ['%d']);

        return [
            'user_id' => (int) $row->user_id,
            'frontend' => $frontend,
            'challenge_id' => $challenge_id,
        ];
    }

    public static function save_admin_plan(WP_REST_Request $request): WP_REST_Response {
        if (!Nevari_Helpers::is_store_admin()) {
            return Nevari_Helpers::error('forbidden', 'Store admin access is required.', 403);
        }

        $user_id = Nevari_Auth::api_session_user_id();
        $params = Nevari_Helpers::get_json_params($request);
        $verification = self::verify_protected_action($params, $user_id);
        if (is_wp_error($verification)) {
            return self::response_from_wp_error($verification);
        }

        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $now = Nevari_Helpers::now();

        $plan_name = sanitize_text_field((string) ($params['plan_name'] ?? $params['planName'] ?? self::PLAN_NAME));
        $amount_kobo = self::amount_to_kobo($params['amount_kobo'] ?? $params['amount'] ?? 0);
        $currency = strtoupper(sanitize_text_field((string) ($params['currency'] ?? self::PLAN_CURRENCY))) ?: self::PLAN_CURRENCY;
        $interval_unit = sanitize_key((string) ($params['interval'] ?? $params['interval_unit'] ?? self::PLAN_INTERVAL)) ?: self::PLAN_INTERVAL;
        $metadata = [
            'plan_name' => $plan_name,
            'plan_slug' => sanitize_text_field((string) ($params['plan_key'] ?? $params['planSlug'] ?? self::PLAN_KEY)),
            'amount' => $amount_kobo > 0 ? $amount_kobo / 100 : 0,
            'amount_kobo' => $amount_kobo,
            'currency' => $currency,
            'interval' => $interval_unit,
            'public_key' => sanitize_text_field((string) ($params['public_key'] ?? '')),
            'manage_billing_url' => esc_url_raw((string) ($params['manage_billing_url'] ?? '')),
            'notifications_enabled' => !empty($params['notifications_enabled']),
            'auto_renew' => !empty($params['auto_renew']),
            'cancellation_window_days' => sanitize_text_field((string) ($params['cancellation_window_days'] ?? '')),
        ];

        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$plans_table} WHERE plan_key = %s LIMIT 1",
            self::PLAN_KEY
        ));

        $plan_data = [
            'plan_key' => self::PLAN_KEY,
            'plan_code' => $existing && !empty($existing->plan_code) ? sanitize_text_field((string) $existing->plan_code) : null,
            'name' => $plan_name !== '' ? $plan_name : self::PLAN_NAME,
            'amount_kobo' => $amount_kobo > 0 ? $amount_kobo : self::PLAN_AMOUNT_KOBO,
            'currency' => $currency,
            'interval_unit' => $interval_unit,
            'status' => 'active',
            'metadata' => wp_json_encode($metadata),
            'updated_at' => $now,
        ];

        if ($existing) {
            $wpdb->update($plans_table, $plan_data, ['id' => (int) $existing->id]);
        } else {
            $plan_data['created_at'] = $now;
            $wpdb->insert($plans_table, $plan_data);
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $secret_key = (string) ($settings['paystack']['secret_key'] ?? '');
        $paystack_synced = false;
        if ($secret_key !== '') {
            $plan = self::ensure_paystack_plan($secret_key, self::current_plan_definition());
            if (is_wp_error($plan)) {
                self::storefront_log('subscription.admin.save_paystack_error', 'error', [
                    'user_id' => $user_id,
                    'error_code' => $plan->get_error_code(),
                    'error_message' => $plan->get_error_message(),
                ], $plan->get_error_message());
                return self::response_from_wp_error($plan);
            }
            $paystack_synced = true;
        }

        self::storefront_log('subscription.admin.saved', 'success', [
            'user_id' => $user_id,
            'plan_key' => self::PLAN_KEY,
            'amount_kobo' => $amount_kobo > 0 ? $amount_kobo : self::PLAN_AMOUNT_KOBO,
            'currency' => $currency,
            'interval_unit' => $interval_unit,
            'paystack_synced' => $paystack_synced,
        ]);

        return Nevari_Helpers::success([
            'plan' => self::current_plan_definition(),
            'paystack_synced' => $paystack_synced,
        ]);
    }

    public static function me(): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        return Nevari_Helpers::success(self::subscription_payload_for_user($user_id));
    }

    public static function admin(): WP_REST_Response {
        if (!Nevari_Helpers::is_store_admin()) {
            return Nevari_Helpers::error('forbidden', 'Store admin access is required.', 403);
        }

        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $users_table = $wpdb->users;

        $plan_rows = $wpdb->get_results("SELECT * FROM {$plans_table} ORDER BY id ASC");
        $latest_subscription_ids = $wpdb->get_results("SELECT user_id, MAX(id) AS id FROM {$subscriptions_table} GROUP BY user_id");
        $latest_ids = array_map(static fn($row) => (int) $row->id, $latest_subscription_ids ?: []);
        $subscription_rows = [];
        if ($latest_ids) {
            $placeholders = implode(',', array_fill(0, count($latest_ids), '%d'));
            $subscription_rows = $wpdb->get_results($wpdb->prepare(
                "SELECT s.*, u.display_name, u.user_email FROM {$subscriptions_table} s LEFT JOIN {$users_table} u ON u.ID = s.user_id WHERE s.id IN ({$placeholders}) ORDER BY s.id DESC",
                ...$latest_ids
            ));
        }

        $total_users = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$users_table}");
        $active_subscriptions = 0;
        $past_due_subscriptions = 0;
        $cancelled_subscriptions = 0;
        $renewals_this_month = 0;
        $active_amount_kobo = 0;
        $plan_counts = [];
        $users = [];

        $month_start = gmdate('Y-m-01 00:00:00');
        $next_month_start = gmdate('Y-m-01 00:00:00', strtotime('+1 month'));

        foreach ($subscription_rows ?: [] as $row) {
            $status = self::effective_subscription_status($row);
            $plan_key = sanitize_key((string) $row->plan_key);
            $plan_counts[$plan_key] = ($plan_counts[$plan_key] ?? 0) + 1;
            if (in_array($status, ['active', 'trialing'], true)) {
                $active_subscriptions++;
                $active_amount_kobo += (int) ($row->amount_kobo ?? 0);
            } elseif ($status === 'past_due') {
                $past_due_subscriptions++;
            } elseif ($status === 'cancelled') {
                $cancelled_subscriptions++;
            }

            $renewal_date = !empty($row->renewal_date) ? (string) $row->renewal_date : '';
            if ($renewal_date && $renewal_date >= $month_start && $renewal_date < $next_month_start) {
                $renewals_this_month++;
            }

            $is_paid = in_array($status, ['active', 'trialing'], true);
            $display_name = trim((string) ($row->display_name ?? ''));
            $email = trim((string) ($row->user_email ?? ''));
            $user_name = $display_name !== '' ? $display_name : ($email !== '' ? $email : 'Subscriber');
            $amount_value = $is_paid ? number_format(((int) ($row->amount_kobo ?? 0)) / 100, 0) : '0';
            $users[] = [
                'id' => (int) $row->id,
                'user_id' => (int) $row->user_id,
                'name' => $user_name,
                'email' => $email,
                'plan' => $is_paid ? self::PLAN_NAME : 'Free',
                'plan_name' => $is_paid ? self::PLAN_NAME : 'Free',
                'status' => self::status_label($status),
                'statusTone' => self::status_tone($status),
                'renewal' => !empty($row->renewal_date) ? gmdate('M j, Y', strtotime((string) $row->renewal_date)) : 'Not scheduled',
                'renewal_date' => !empty($row->renewal_date) ? gmdate('M j, Y', strtotime((string) $row->renewal_date)) : 'Not scheduled',
                'amount' => $is_paid ? 'NGN ' . $amount_value : 'NGN 0',
                'amount_label' => $is_paid ? 'NGN ' . $amount_value : 'NGN 0',
                'ref' => $row->reference ? sanitize_text_field((string) $row->reference) : '—',
                'gateway_ref' => $row->reference ? sanitize_text_field((string) $row->reference) : '—',
                'reference' => $row->reference ? sanitize_text_field((string) $row->reference) : '—',
                'action' => $is_paid ? 'Edit' : 'Upgrade',
                'accent' => self::accent_for_status($status),
            ];
        }

        $free_users = max(0, $total_users - $active_subscriptions - $cancelled_subscriptions - $past_due_subscriptions);
        $plans = [
            [
                'name' => 'Free',
                'slug' => 'FR',
                'price' => 'NGN 0',
                'billing' => 'Free',
                'users' => $free_users,
                'note' => 'No billing frequency',
                'featured' => false,
                'entitlements' => [],
            ],
        ];

        foreach ($plan_rows ?: [] as $row) {
            $plan_key = sanitize_key((string) $row->plan_key);
            $billing = trim((string) ($row->interval_unit ?? ''));
            $amount_kobo = (int) ($row->amount_kobo ?? 0);
            $plans[] = [
                'name' => (string) ($row->name ?: $row->plan_key ?: 'Subscription plan'),
                'slug' => strtoupper(substr(preg_replace('/[^a-z0-9]/i', '', $plan_key) ?: 'PL', 0, 3)),
                'price' => $amount_kobo > 0 ? sprintf('%s %s', (string) ($row->currency ?: self::PLAN_CURRENCY), number_format($amount_kobo / 100, 0)) : 'NGN 0',
                'billing' => $billing !== '' ? ucfirst($billing) : 'Manual',
                'users' => (int) ($plan_counts[$plan_key] ?? 0),
                'note' => $billing !== '' ? ucfirst($billing) . ' billing frequency' : 'Managed from the database',
                'featured' => $plan_key === self::PLAN_KEY,
                'entitlements' => $plan_key === self::PLAN_KEY ? ['therapy_management'] : [],
            ];
        }

        return Nevari_Helpers::success([
            'plans' => $plans,
            'users' => $users,
            'total_subscriptions' => count($subscription_rows ?: []),
            'active_subscriptions' => $active_subscriptions,
            'past_due_subscriptions' => $past_due_subscriptions,
            'cancelled_subscriptions' => $cancelled_subscriptions,
            'renewals_this_month' => $renewals_this_month,
            'total_pages' => max(1, (int) ceil(max(count($users), 1) / 5)),
            'active_plan_amount_label' => $active_amount_kobo > 0 ? sprintf('%s %s', self::PLAN_CURRENCY, number_format($active_amount_kobo / 100, 0)) : '—',
        ]);
    }

    public static function initialize(WP_REST_Request $request): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        $user = get_userdata($user_id);
        $plan_definition = self::current_plan_definition();
        $plan_amount_kobo = $plan_definition['amount_kobo'] > 0 ? (int) $plan_definition['amount_kobo'] : self::PLAN_AMOUNT_KOBO;
        $plan_currency = $plan_definition['currency'] ?: self::PLAN_CURRENCY;
        self::storefront_log('subscription.initialize.start', 'success', [
            'user_id' => $user_id,
        ]);
        if (!$user || !is_email($user->user_email)) {
            self::storefront_log('subscription.initialize.invalid_user', 'error', [
                'user_id' => $user_id,
                'has_user' => (bool) $user,
            ], 'A valid account email is required before subscribing.');
            return Nevari_Helpers::error('invalid_user', 'A valid account email is required before subscribing.', 400);
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $secret_key = (string) ($settings['paystack']['secret_key'] ?? '');
        if ($secret_key === '') {
            self::storefront_log('subscription.initialize.paystack_missing', 'error', [
                'user_id' => $user_id,
            ], 'Paystack secret key is not configured.');
            return Nevari_Helpers::error('paystack_not_configured', 'Paystack secret key is not configured.', 500);
        }

        $plan = self::ensure_paystack_plan($secret_key, $plan_definition);
        if (is_wp_error($plan)) {
            self::storefront_log('subscription.initialize.plan_error', 'error', [
                'user_id' => $user_id,
                'error_code' => $plan->get_error_code(),
                'error_message' => $plan->get_error_message(),
            ], $plan->get_error_message());
            return Nevari_Helpers::error('paystack_plan_error', $plan->get_error_message(), 502);
        }

        $reference = 'nevari_sub_' . wp_generate_uuid4();
        $now = Nevari_Helpers::now();
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $payments_table = Nevari_Helpers::table('subscription_payments');
        global $wpdb;

        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$payments_table} WHERE user_id = %d AND status = %s ORDER BY id DESC LIMIT 1",
            $user_id,
            'pending'
        ));
        if ($existing && !empty($existing->reference)) {
            $reference = sanitize_text_field((string) $existing->reference);
        } else {
            $wpdb->insert($payments_table, [
                'user_id' => $user_id,
                'subscription_id' => 0,
                'reference' => $reference,
                'gateway' => 'paystack',
                'amount_kobo' => $plan_amount_kobo,
                'currency' => $plan_currency,
                'status' => 'pending',
                'payload' => wp_json_encode([
                    'source' => 'subscription_initialize',
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $response = wp_remote_post('https://api.paystack.co/transaction/initialize', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $secret_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode([
                'email' => $user->user_email,
                'amount' => $plan_amount_kobo,
                'currency' => $plan_currency,
                'reference' => $reference,
                'plan' => $plan['plan_code'],
                'metadata' => [
                    'source' => 'nevari_access_pro',
                    'user_id' => $user_id,
                    'plan_key' => self::PLAN_KEY,
                ],
            ]),
        ]);

        if (is_wp_error($response)) {
            self::storefront_log('subscription.initialize.request_error', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
                'error_message' => $response->get_error_message(),
            ], $response->get_error_message());
            return Nevari_Helpers::error('paystack_initialize_failed', $response->get_error_message(), 502);
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || empty($body['status']) || empty($body['data']['access_code'])) {
            $message = is_array($body) ? (string) ($body['message'] ?? 'Paystack initialization failed.') : 'Paystack initialization failed.';
            self::storefront_log('subscription.initialize.response_error', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
                'status' => $status,
                'body_keys' => is_array($body) ? array_keys($body) : [],
            ], $message);
            return Nevari_Helpers::error('paystack_initialize_failed', $message, 502);
        }

        $wpdb->update($payments_table, [
            'payload' => wp_json_encode($body),
            'updated_at' => $now,
        ], [
            'reference' => $reference,
        ]);

        $active_subscription = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$subscriptions_table} WHERE user_id = %d ORDER BY id DESC LIMIT 1",
            $user_id
        ));

        self::storefront_log('subscription.initialize.success', 'success', [
            'user_id' => $user_id,
            'reference' => $reference,
            'plan_code' => $plan['plan_code'],
        ]);
        return Nevari_Helpers::success([
            'access_code' => sanitize_text_field((string) $body['data']['access_code']),
            'reference' => $reference,
            'amount' => $plan_amount_kobo,
            'currency' => $plan_currency,
            'email' => $user->user_email,
            'plan_code' => $plan['plan_code'],
            'subscription_status' => $active_subscription ? sanitize_key((string) $active_subscription->status) : 'none',
        ]);
    }

    public static function verify(WP_REST_Request $request): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        $reference = sanitize_text_field((string) $request->get_param('reference'));
        $plan_definition = self::current_plan_definition();
        $plan_amount_kobo = $plan_definition['amount_kobo'] > 0 ? (int) $plan_definition['amount_kobo'] : self::PLAN_AMOUNT_KOBO;
        $plan_currency = $plan_definition['currency'] ?: self::PLAN_CURRENCY;
        self::storefront_log('subscription.verify.start', 'success', [
            'user_id' => $user_id,
            'reference' => $reference,
        ]);
        if ($reference === '') {
            self::storefront_log('subscription.verify.missing_reference', 'error', [
                'user_id' => $user_id,
            ], 'A Paystack reference is required.');
            return Nevari_Helpers::error('missing_reference', 'A Paystack reference is required.', 400);
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $secret_key = (string) ($settings['paystack']['secret_key'] ?? '');
        if ($secret_key === '') {
            self::storefront_log('subscription.verify.paystack_missing', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
            ], 'Paystack secret key is not configured.');
            return Nevari_Helpers::error('paystack_not_configured', 'Paystack secret key is not configured.', 500);
        }

        global $wpdb;
        $payments_table = Nevari_Helpers::table('subscription_payments');
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $payment = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$payments_table} WHERE reference = %s AND user_id = %d LIMIT 1",
            $reference,
            $user_id
        ));
        if (!$payment) {
            self::storefront_log('subscription.verify.payment_missing', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
            ], 'Subscription payment reference was not found for this user.');
            return Nevari_Helpers::error('subscription_payment_not_found', 'Subscription payment reference was not found for this user.', 404);
        }

        if ((string) $payment->status === 'success') {
            return Nevari_Helpers::success(self::subscription_payload_for_user($user_id));
        }

        $response = wp_remote_get('https://api.paystack.co/transaction/verify/' . rawurlencode($reference), [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $secret_key,
            ],
        ]);

        if (is_wp_error($response)) {
            self::storefront_log('subscription.verify.request_error', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
                'error_message' => $response->get_error_message(),
            ], $response->get_error_message());
            return Nevari_Helpers::error('paystack_verify_failed', $response->get_error_message(), 502);
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        $data = is_array($body) ? ($body['data'] ?? []) : [];
        if ($status < 200 || $status >= 300 || !is_array($data)) {
            $message = is_array($body) ? (string) ($body['message'] ?? 'Paystack verification failed.') : 'Paystack verification failed.';
            self::storefront_log('subscription.verify.response_error', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
                'status' => $status,
                'body_keys' => is_array($body) ? array_keys($body) : [],
            ], $message);
            return Nevari_Helpers::error('paystack_verify_failed', $message, 502);
        }

        $transaction_status = sanitize_key((string) ($data['status'] ?? ''));
        $amount = (int) ($data['amount'] ?? 0);
        $currency = sanitize_text_field((string) ($data['currency'] ?? ''));
        $metadata_user_id = (int) ($data['metadata']['user_id'] ?? 0);
        $verified_reference = sanitize_text_field((string) ($data['reference'] ?? ''));
        if ($transaction_status !== 'success' || $amount !== $plan_amount_kobo || strtoupper($currency) !== $plan_currency || $metadata_user_id !== $user_id || $verified_reference !== $reference) {
            self::storefront_log('subscription.verify.mismatch', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
                'status' => $transaction_status,
                'amount' => $amount,
                'currency' => $currency,
                'metadata_user_id' => $metadata_user_id,
                'verified_reference' => $verified_reference,
            ], 'The verified transaction did not match the expected subscription payment.');
            return Nevari_Helpers::error('subscription_verification_mismatch', 'The verified transaction did not match the expected subscription payment.', 400, [
                'status' => $transaction_status,
                'amount' => $amount,
                'currency' => $currency,
                'metadata_user_id' => $metadata_user_id,
            ]);
        }

        $now = Nevari_Helpers::now();
        $paid_at = !empty($data['paid_at']) ? gmdate('Y-m-d H:i:s', strtotime((string) $data['paid_at'])) : $now;
        $renewal_date = gmdate('Y-m-d H:i:s', strtotime('+1 month', strtotime($paid_at)));
        $subscription_code = sanitize_text_field((string) ($data['subscription']['subscription_code'] ?? $data['authorization']['authorization_code'] ?? ''));
        $customer_code = sanitize_text_field((string) ($data['customer']['customer_code'] ?? ''));
        $plan_code = sanitize_text_field((string) ($data['plan_object']['plan_code'] ?? $data['plan']['plan_code'] ?? ''));

        $existing_subscription = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$subscriptions_table} WHERE user_id = %d ORDER BY id DESC LIMIT 1",
            $user_id
        ));

        $subscription_data = [
            'user_id' => $user_id,
            'plan_key' => self::PLAN_KEY,
            'plan_code' => $plan_code,
            'reference' => $reference,
            'subscription_code' => $subscription_code,
            'customer_code' => $customer_code,
            'status' => 'active',
            'amount_kobo' => $plan_amount_kobo,
            'currency' => $plan_currency,
            'renewal_date' => $renewal_date,
            'starts_at' => $paid_at,
            'ends_at' => null,
            'cancelled_at' => null,
            'metadata' => wp_json_encode($data),
            'updated_at' => $now,
        ];

        if ($existing_subscription) {
            $wpdb->update($subscriptions_table, $subscription_data, ['id' => (int) $existing_subscription->id]);
            $subscription_id = (int) $existing_subscription->id;
        } else {
            $subscription_data['created_at'] = $now;
            $wpdb->insert($subscriptions_table, $subscription_data);
            $subscription_id = (int) $wpdb->insert_id;
        }

        $wpdb->update($payments_table, [
            'subscription_id' => $subscription_id,
            'status' => 'success',
            'paystack_subscription_code' => $subscription_code,
            'verified_at' => $now,
            'payload' => wp_json_encode($data),
            'updated_at' => $now,
        ], [
            'reference' => $reference,
        ]);

        self::storefront_log('subscription.verify.success', 'success', [
            'user_id' => $user_id,
            'reference' => $reference,
            'subscription_id' => $subscription_id,
            'has_subscription_code' => $subscription_code !== '',
        ]);
        return Nevari_Helpers::success(self::subscription_payload_for_user($user_id));
    }

    public static function cancel(): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        self::storefront_log('subscription.cancel.start', 'success', [
            'user_id' => $user_id,
        ]);
        global $wpdb;
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $subscription = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$subscriptions_table} WHERE user_id = %d ORDER BY id DESC LIMIT 1",
            $user_id
        ));
        if (!$subscription) {
            self::storefront_log('subscription.cancel.no_subscription', 'error', [
                'user_id' => $user_id,
            ], 'No subscription record was found for the current user.');
            return Nevari_Helpers::success(self::subscription_payload_for_user($user_id));
        }

        $now = Nevari_Helpers::now();
        $ends_at = !empty($subscription->renewal_date) ? (string) $subscription->renewal_date : $now;
        $wpdb->update($subscriptions_table, [
            'status' => 'active',
            'ends_at' => $ends_at,
            'cancelled_at' => $now,
            'updated_at' => $now,
        ], [
            'id' => (int) $subscription->id,
        ]);

        self::storefront_log('subscription.cancel.success', 'success', [
            'user_id' => $user_id,
            'subscription_id' => (int) $subscription->id,
            'ends_at' => $ends_at,
        ]);
        return Nevari_Helpers::success(self::subscription_payload_for_user($user_id));
    }

    private static function ensure_paystack_plan(string $secret_key, array $plan_definition = []) {
        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$plans_table} WHERE plan_key = %s LIMIT 1",
            self::PLAN_KEY
        ));
        if ($existing && !empty($existing->plan_code)) {
            return [
                'plan_code' => sanitize_text_field((string) $existing->plan_code),
            ];
        }

        $definition = !empty($plan_definition) ? $plan_definition : self::current_plan_definition();
        $amount_kobo = !empty($definition['amount_kobo']) ? (int) $definition['amount_kobo'] : self::PLAN_AMOUNT_KOBO;
        $currency = !empty($definition['currency']) ? (string) $definition['currency'] : self::PLAN_CURRENCY;
        $interval = !empty($definition['interval_unit']) ? (string) $definition['interval_unit'] : self::PLAN_INTERVAL;
        $name = !empty($definition['name']) ? (string) $definition['name'] : self::PLAN_NAME;

        $response = wp_remote_post('https://api.paystack.co/plan', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $secret_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode([
                'name' => $name,
                'interval' => $interval,
                'amount' => $amount_kobo,
                'currency' => $currency,
                'description' => $name . ' subscription',
            ]),
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || empty($body['status']) || empty($body['data']['plan_code'])) {
            $message = is_array($body) ? (string) ($body['message'] ?? 'Unable to create the Paystack subscription plan.') : 'Unable to create the Paystack subscription plan.';
            return new WP_Error('paystack_plan_error', $message);
        }

        $now = Nevari_Helpers::now();
        $plan_code = sanitize_text_field((string) $body['data']['plan_code']);
        if ($existing) {
            $wpdb->update($plans_table, [
                'plan_code' => $plan_code,
                'name' => $name,
                'amount_kobo' => $amount_kobo,
                'currency' => $currency,
                'interval_unit' => $interval,
                'status' => 'active',
                'metadata' => wp_json_encode($body['data']),
                'updated_at' => $now,
            ], ['id' => (int) $existing->id]);
        } else {
            $wpdb->insert($plans_table, [
                'plan_key' => self::PLAN_KEY,
                'plan_code' => $plan_code,
                'name' => $name,
                'amount_kobo' => $amount_kobo,
                'currency' => $currency,
                'interval_unit' => $interval,
                'status' => 'active',
                'metadata' => wp_json_encode($body['data']),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        return [
            'plan_code' => $plan_code,
        ];
    }

    private static function subscription_payload_for_user(int $user_id): array {
        global $wpdb;
        $table = Nevari_Helpers::table('subscriptions');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE user_id = %d ORDER BY id DESC LIMIT 1",
            $user_id
        ));

        if (!$row) {
            return self::base_payload();
        }

        $status = self::effective_subscription_status($row);
        $plan_definition = self::current_plan_definition();
        $current_amount = $plan_definition['amount_kobo'] > 0 ? (int) round(((int) $plan_definition['amount_kobo']) / 100) : (int) round(self::PLAN_AMOUNT_KOBO / 100);
        return [
            'plan' => $status === 'active' || $status === 'trialing' ? self::PLAN_NAME : 'Free',
            'plan_key' => $status === 'active' || $status === 'trialing' ? self::PLAN_KEY : 'free',
            'status' => $status ?: 'none',
            'renewal_date' => !empty($row->renewal_date) ? gmdate('M j, Y', strtotime((string) $row->renewal_date)) : '',
            'amount' => $current_amount,
            'currency' => $plan_definition['currency'] ?: self::PLAN_CURRENCY,
            'interval' => $plan_definition['interval_unit'] === 'manual' ? 'month' : $plan_definition['interval_unit'],
            'paystack_subscription_code' => sanitize_text_field((string) $row->subscription_code),
            'subscription_code_masked' => self::mask_code((string) $row->subscription_code),
            'manage_billing_url' => '',
            'entitlements' => self::entitlements_for_status($status),
        ];
    }

    private static function entitlements_for_status(string $status): array {
        return in_array($status, ['active', 'trialing'], true) ? ['therapy_management'] : [];
    }

    private static function effective_subscription_status(object $row): string {
        $status = sanitize_key((string) ($row->status ?? ''));
        if (!in_array($status, ['active', 'trialing'], true)) {
            return $status ?: 'none';
        }

        $ends_at = !empty($row->ends_at) ? strtotime((string) $row->ends_at) : false;
        if ($ends_at && $ends_at <= strtotime(Nevari_Helpers::now())) {
            return 'cancelled';
        }

        return $status;
    }

    private static function status_label(string $status): string {
        if ($status === '' || $status === 'none') {
            return 'Free';
        }
        return ucwords(str_replace(['_', '-'], ' ', $status));
    }

    private static function status_tone(string $status): string {
        return match ($status) {
            'active', 'trialing' => 'confirmed',
            'past_due' => 'pending',
            'cancelled' => 'cancelled',
            default => 'draft',
        };
    }

    private static function accent_for_status(string $status): string {
        return match ($status) {
            'active', 'trialing' => 'primary',
            'past_due' => 'accent',
            'cancelled' => 'danger',
            default => 'soft',
        };
    }

    private static function base_payload(): array {
        $plan_definition = self::current_plan_definition();
        $current_amount = $plan_definition['amount_kobo'] > 0 ? (int) round(((int) $plan_definition['amount_kobo']) / 100) : (int) round(self::PLAN_AMOUNT_KOBO / 100);
        return [
            'plan' => 'Free',
            'plan_key' => 'free',
            'status' => 'none',
            'renewal_date' => '',
            'amount' => $current_amount,
            'currency' => $plan_definition['currency'] ?: self::PLAN_CURRENCY,
            'interval' => $plan_definition['interval_unit'] === 'manual' ? 'month' : $plan_definition['interval_unit'],
            'paystack_subscription_code' => '',
            'subscription_code_masked' => '',
            'manage_billing_url' => '',
            'entitlements' => [],
        ];
    }

    private static function mask_code(string $value): string {
        $raw = trim($value);
        if ($raw === '') {
            return '';
        }
        if (strlen($raw) <= 8) {
            return $raw;
        }
        return substr($raw, 0, 4) . '...' . substr($raw, -4);
    }

    private static function storefront_log(string $event, string $status, array $context = [], string $message = ''): void {
        if (!class_exists('Nevari_Audit')) {
            return;
        }

        $payload = $context;
        if ($message !== '') {
            $payload['message'] = $message;
        }
        $payload['dashboard'] = 'customer';

        Nevari_Audit::log('dashboard', 'customer', $event, in_array($status, ['success', 'error'], true) ? $status : 'success', $payload);
    }
}
