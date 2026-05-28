<?php
if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('str_ends_with')) {
    function str_ends_with($haystack, $needle) {
        $haystack = (string) $haystack;
        $needle = (string) $needle;
        if ($needle === '') {
            return true;
        }
        return substr($haystack, -strlen($needle)) === $needle;
    }
}

final class Nevari_Helpers {
    public static function payment_gateway_defaults(): array {
        return [
            'active_gateway' => 'woocommerce',
            'mode' => 'test',
            'paystack' => [
                'public_key' => '',
                'secret_key' => '',
                'webhook_secret' => '',
            ],
            'stripe' => [
                'publishable_key' => '',
                'secret_key' => '',
                'webhook_secret' => '',
            ],
            'flutterwave' => [
                'public_key' => '',
                'secret_key' => '',
                'encryption_key' => '',
                'webhook_secret' => '',
            ],
        ];
    }

    public static function payment_gateway_settings(): array {
        $stored = get_option('nevari_payment_gateway_settings', []);
        $stored = is_array($stored) ? $stored : [];
        return array_replace_recursive(self::payment_gateway_defaults(), $stored);
    }

    public static function google_meet_oauth_defaults(): array {
        return [
            'enabled' => false,
            'client_id' => '',
            'client_secret' => '',
            'refresh_token' => '',
            'calendar_id' => 'primary',
            'connected_email' => '',
            'token_updated_at' => '',
        ];
    }

    public static function google_meet_oauth_settings(): array {
        $stored = get_option('nevari_google_meet_oauth_settings', []);
        $stored = is_array($stored) ? $stored : [];
        return array_replace(self::google_meet_oauth_defaults(), $stored);
    }

    public static function google_meet_oauth_configured(): bool {
        $settings = self::google_meet_oauth_settings();
        return !empty($settings['enabled'])
            && !empty($settings['client_id'])
            && !empty($settings['client_secret'])
            && !empty($settings['refresh_token']);
    }

    public static function google_meet_oauth_redirect_uri(): string {
        return admin_url('admin-post.php?action=nevari_google_meet_oauth_callback');
    }

    public static function google_meet_oauth_scope(): string {
        return 'https://www.googleapis.com/auth/meetings.space.created';
    }

    public static function google_meet_oauth_authorize_url(string $state): string {
        return add_query_arg([
            'client_id' => (string) (self::google_meet_oauth_settings()['client_id'] ?? ''),
            'redirect_uri' => self::google_meet_oauth_redirect_uri(),
            'response_type' => 'code',
            'scope' => self::google_meet_oauth_scope(),
            'access_type' => 'offline',
            'prompt' => 'consent',
            'include_granted_scopes' => 'true',
            'state' => $state,
        ], 'https://accounts.google.com/o/oauth2/v2/auth');
    }

    public static function google_meet_oauth_exchange_code(string $code): array {
        $settings = self::google_meet_oauth_settings();
        if (empty($settings['client_id']) || empty($settings['client_secret']) || $code === '') {
            return ['success' => false, 'message' => 'Missing Google OAuth client credentials.'];
        }

        $response = wp_remote_post('https://oauth2.googleapis.com/token', [
            'timeout' => 15,
            'headers' => ['Content-Type' => 'application/x-www-form-urlencoded'],
            'body' => [
                'client_id' => (string) $settings['client_id'],
                'client_secret' => (string) $settings['client_secret'],
                'code' => $code,
                'redirect_uri' => self::google_meet_oauth_redirect_uri(),
                'grant_type' => 'authorization_code',
            ],
        ]);
        if (is_wp_error($response)) {
            return ['success' => false, 'message' => $response->get_error_message()];
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || !is_array($body)) {
            $message = is_array($body) && !empty($body['error_description'])
                ? (string) $body['error_description']
                : 'Google token exchange failed.';
            return ['success' => false, 'message' => $message];
        }

        $refresh_token = isset($body['refresh_token']) ? sanitize_text_field((string) $body['refresh_token']) : '';
        if ($refresh_token === '') {
            return ['success' => false, 'message' => 'Google did not return a refresh token. Re-consent may be required.'];
        }

        return [
            'success' => true,
            'refresh_token' => $refresh_token,
            'connected_email' => self::google_meet_oauth_extract_email($body['id_token'] ?? ''),
        ];
    }

    public static function google_meet_oauth_extract_email($id_token): string {
        if (!is_string($id_token) || $id_token === '') {
            return '';
        }
        $parts = explode('.', $id_token);
        if (count($parts) < 2) {
            return '';
        }
        $payload = json_decode(self::base64url_decode($parts[1]), true);
        if (!is_array($payload) || empty($payload['email'])) {
            return '';
        }
        return sanitize_email((string) $payload['email']);
    }

    public static function save_google_meet_refresh_token(string $refresh_token, string $connected_email = ''): void {
        $settings = self::google_meet_oauth_settings();
        $settings['refresh_token'] = sanitize_text_field($refresh_token);
        $settings['connected_email'] = $connected_email ? sanitize_email($connected_email) : '';
        $settings['token_updated_at'] = self::now();
        update_option('nevari_google_meet_oauth_settings', $settings, false);
    }

    public static function google_meet_link_for_appointment($appointment, ?WP_User $doctor = null, ?WP_User $patient = null): string {
        $result = self::google_meet_event_for_appointment($appointment, $doctor, $patient);
        return !empty($result['success']) ? (string) $result['meet_link'] : '';
    }

    public static function google_meet_event_for_appointment($appointment, ?WP_User $doctor = null, ?WP_User $patient = null): array {
        $existing_link = self::appointment_meeting_link($appointment);
        $existing_event_id = isset($appointment->google_calendar_event_id) ? sanitize_text_field((string) $appointment->google_calendar_event_id) : '';
        if ($existing_link !== '' && $existing_event_id !== '') {
            return [
                'success' => true,
                'meet_link' => $existing_link,
                'event_id' => $existing_event_id,
                'reused' => true,
            ];
        }
        if (!self::google_meet_oauth_configured()) {
            return ['success' => false, 'code' => 'google_credentials_missing', 'message' => 'Google Meet OAuth credentials are not configured.'];
        }
        $token = self::google_oauth_access_token();
        if ($token === '') {
            return ['success' => false, 'code' => 'google_access_token_failed', 'message' => 'Google access token could not be refreshed.'];
        }
        $start_ts = strtotime((string) ($appointment->start_at ?? '') . ' UTC');
        $end_ts = strtotime((string) ($appointment->end_at ?? '') . ' UTC');
        if (!$start_ts || !$end_ts || $end_ts <= $start_ts) {
            return ['success' => false, 'code' => 'invalid_appointment_time', 'message' => 'Appointment start/end time is invalid.'];
        }
        $response = wp_remote_post(
            'https://meet.googleapis.com/v2/spaces',
            [
                'timeout' => 20,
                'headers' => [
                    'Authorization' => 'Bearer ' . $token,
                    'Content-Type' => 'application/json',
                    'Accept' => 'application/json',
                ],
                'body' => '{}',
            ]
        );
        if (is_wp_error($response)) {
            return ['success' => false, 'code' => $response->get_error_code(), 'message' => $response->get_error_message()];
        }
        $code = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($code < 200 || $code >= 300 || !is_array($body)) {
            $message = 'Google Meet space creation failed.';
            if (is_array($body)) {
                $message = (string) ($body['error']['message'] ?? $body['error_description'] ?? $message);
            }
            return ['success' => false, 'code' => 'google_meet_api_error', 'status' => $code, 'message' => $message];
        }

        $candidates = [
            $body['meetingUri'] ?? '',
        ];
        foreach ($candidates as $link) {
            if (is_string($link) && preg_match('#^https://meet\.google\.com/#i', $link)) {
                return [
                    'success' => true,
                    'meet_link' => esc_url_raw($link),
                    'event_id' => isset($body['name']) ? sanitize_text_field((string) $body['name']) : '',
                    'space_name' => isset($body['name']) ? sanitize_text_field((string) $body['name']) : '',
                    'reused' => false,
                ];
            }
        }
        return ['success' => false, 'code' => 'google_meet_link_missing', 'message' => 'Google Meet API created a space without a direct Meet link.'];
    }

    private static function google_oauth_access_token(): string {
        $settings = self::google_meet_oauth_settings();
        if (empty($settings['client_id']) || empty($settings['client_secret']) || empty($settings['refresh_token'])) {
            return '';
        }
        $response = wp_remote_post('https://oauth2.googleapis.com/token', [
            'timeout' => 15,
            'headers' => ['Content-Type' => 'application/x-www-form-urlencoded'],
            'body' => [
                'client_id' => (string) $settings['client_id'],
                'client_secret' => (string) $settings['client_secret'],
                'refresh_token' => (string) $settings['refresh_token'],
                'grant_type' => 'refresh_token',
            ],
        ]);
        if (is_wp_error($response)) {
            return '';
        }
        $code = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($code < 200 || $code >= 300 || !is_array($body)) {
            return '';
        }
        return isset($body['access_token']) ? sanitize_text_field((string) $body['access_token']) : '';
    }

    public static function active_payment_gateway_configured(): bool {
        $settings = self::payment_gateway_settings();
        $active = isset($settings['active_gateway']) ? (string) $settings['active_gateway'] : 'woocommerce';
        if ($active === 'woocommerce') {
            return self::woocommerce_payment_gateway_configured();
        }
        if ($active === 'paystack') {
            return !empty($settings['paystack']['public_key']) && !empty($settings['paystack']['secret_key']);
        }
        if ($active === 'stripe') {
            return !empty($settings['stripe']['publishable_key']) && !empty($settings['stripe']['secret_key']);
        }
        if ($active === 'flutterwave') {
            return !empty($settings['flutterwave']['public_key']) && !empty($settings['flutterwave']['secret_key']);
        }
        return false;
    }

    public static function woocommerce_payment_gateway_configured(): bool {
        if (!function_exists('WC') || !WC()->payment_gateways()) {
            return false;
        }
        $available = WC()->payment_gateways()->get_available_payment_gateways();
        if (!empty($available)) {
            return true;
        }
        $gateways = WC()->payment_gateways()->payment_gateways();
        foreach ($gateways as $gateway) {
            if (isset($gateway->enabled) && $gateway->enabled === 'yes') {
                return true;
            }
        }
        return false;
    }

    public static function rate_limit_defaults(): array {
        return [
            'auth_login_ip' => ['limit' => 5, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_login_user' => ['limit' => 10, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_password_reset_ip' => ['limit' => 5, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_password_reset_user' => ['limit' => 5, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_register_ip' => ['limit' => 10, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_register_email' => ['limit' => 5, 'window' => HOUR_IN_SECONDS],
            'auth_refresh_ip' => ['limit' => 20, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_refresh_token' => ['limit' => 10, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_logout_ip' => ['limit' => 30, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_logout_token' => ['limit' => 10, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_verify_ip' => ['limit' => 10, 'window' => 15 * MINUTE_IN_SECONDS],
            'auth_verify_challenge' => ['limit' => 5, 'window' => 15 * MINUTE_IN_SECONDS],
            'pairing_verify' => ['limit' => 20, 'window' => 10 * MINUTE_IN_SECONDS],
            'pairing_register' => ['limit' => 20, 'window' => 10 * MINUTE_IN_SECONDS],
            'rest_orders_read' => ['limit' => 120, 'window' => MINUTE_IN_SECONDS],
            'rest_orders_show' => ['limit' => 180, 'window' => MINUTE_IN_SECONDS],
            'rest_orders_write' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],
            'rest_orders_action' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],
            'rest_products_read' => ['limit' => 120, 'window' => MINUTE_IN_SECONDS],
            'rest_products_show' => ['limit' => 180, 'window' => MINUTE_IN_SECONDS],
            'rest_products_write' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],
            'rest_terms_read' => ['limit' => 120, 'window' => MINUTE_IN_SECONDS],
            'rest_terms_write' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],
            'rest_doctors_read' => ['limit' => 120, 'window' => MINUTE_IN_SECONDS],
            'rest_doctors_show' => ['limit' => 180, 'window' => MINUTE_IN_SECONDS],
            'rest_doctors_write' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],
            'rest_appointments_read' => ['limit' => 120, 'window' => MINUTE_IN_SECONDS],
            'rest_appointments_show' => ['limit' => 180, 'window' => MINUTE_IN_SECONDS],
            'rest_appointments_write' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],
            'rest_prescriptions_read' => ['limit' => 120, 'window' => MINUTE_IN_SECONDS],
            'rest_prescriptions_show' => ['limit' => 180, 'window' => MINUTE_IN_SECONDS],
            'rest_prescriptions_write' => ['limit' => 20, 'window' => MINUTE_IN_SECONDS],
            'rest_emails_write' => ['limit' => 5, 'window' => MINUTE_IN_SECONDS],
            'rest_emails_templates_write' => ['limit' => 10, 'window' => MINUTE_IN_SECONDS],
            'rest_email_logs_read' => ['limit' => 60, 'window' => MINUTE_IN_SECONDS],
            'rest_audit_logs_read' => ['limit' => 60, 'window' => MINUTE_IN_SECONDS],
        ];
    }

    public static function rate_limit_settings(): array {
        $stored = get_option('nevari_rate_limit_settings', []);
        $stored = is_array($stored) ? $stored : [];
        return array_replace_recursive(self::rate_limit_defaults(), $stored);
    }

    public static function rate_limit_config(string $bucket, int $default_limit, int $default_window): array {
        $settings = self::rate_limit_settings();
        $bucket_settings = isset($settings[$bucket]) && is_array($settings[$bucket]) ? $settings[$bucket] : [];
        $limit = isset($bucket_settings['limit']) ? (int) $bucket_settings['limit'] : $default_limit;
        $window = isset($bucket_settings['window']) ? (int) $bucket_settings['window'] : $default_window;
        $limit = max(1, $limit);
        $window = max(1, $window);
        return ['limit' => $limit, 'window' => $window];
    }

    public static function table(string $name): string {
        global $wpdb;
        return $wpdb->prefix . 'nevari_' . $name;
    }

    public static function now(): string {
        return current_time('mysql', true);
    }

    public static function request_id(): string {
        if (!defined('NEVARI_REQUEST_ID')) {
            define('NEVARI_REQUEST_ID', 'req_' . wp_generate_uuid4());
        }
        return NEVARI_REQUEST_ID;
    }

    public static function dashboard_log(string $event, array $context = [], string $level = 'info'): void {
        $normalized_level = strtolower(trim($level));
        $debug_enabled = (defined('NEVARI_DASHBOARD_DEBUG') && NEVARI_DASHBOARD_DEBUG) || (defined('WP_DEBUG') && WP_DEBUG);
        if ($normalized_level !== 'error' && !$debug_enabled) {
            return;
        }

        $payload = array_merge([
            'request_id' => self::request_id(),
            'event' => $event,
            'level' => $normalized_level ?: 'info',
            'user_id' => get_current_user_id(),
            'timestamp' => self::now(),
        ], $context);

        $encoded = wp_json_encode($payload);
        if (!is_string($encoded) || $encoded === '') {
            $encoded = wp_json_encode([
                'request_id' => self::request_id(),
                'event' => $event,
                'level' => $normalized_level ?: 'info',
                'message' => 'Dashboard log encoding failed.',
            ]);
        }

        error_log('Nevari dashboard log ' . $encoded); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
    }

    public static function success($data = null, array $meta = [], int $status = 200): WP_REST_Response {
        $meta = array_merge(['request_id' => self::request_id()], $meta);
        return new WP_REST_Response([
            'success' => true,
            'data' => $data,
            'meta' => $meta,
        ], $status);
    }

    public static function error(string $code, string $message, int $status = 400, array $details = []): WP_REST_Response {
        return new WP_REST_Response([
            'success' => false,
            'error' => [
                'code' => $code,
                'message' => $message,
                'details' => $details,
            ],
            'meta' => ['request_id' => self::request_id()],
        ], $status);
    }

    public static function error_with_headers(string $code, string $message, int $status = 400, array $details = [], array $headers = []): WP_REST_Response {
        $response = self::error($code, $message, $status, $details);
        foreach ($headers as $name => $value) {
            $response->header((string) $name, (string) $value);
        }
        return $response;
    }

    public static function get_bearer_token(): ?string {
        $header = '';
        if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
            $header = sanitize_text_field(wp_unslash($_SERVER['HTTP_AUTHORIZATION']));
        } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
            $header = sanitize_text_field(wp_unslash($_SERVER['REDIRECT_HTTP_AUTHORIZATION']));
        }

        if (preg_match('/Bearer\s+(.*)$/i', $header, $matches)) {
            return trim($matches[1]);
        }
        return null;
    }

    public static function client_ip(): string {
        $remote_addr = !empty($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : '';
        if ($remote_addr && self::trusted_proxy_ip($remote_addr) && !empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ip = sanitize_text_field(wp_unslash($_SERVER['HTTP_X_FORWARDED_FOR']));
            return trim(explode(',', $ip)[0]);
        }
        if ($remote_addr) {
            return $remote_addr;
        }
        return 'unknown';
    }

    private static function trusted_proxy_ip(string $ip): bool {
        $configured = defined('NEVARI_TRUSTED_PROXY_IPS')
            ? (string) constant('NEVARI_TRUSTED_PROXY_IPS')
            : (string) getenv('NEVARI_TRUSTED_PROXY_IPS');
        $trusted = array_filter(array_map('trim', explode(',', $configured)));
        return in_array($ip, $trusted, true);
    }

    public static function rate_limit(string $bucket, int $limit, int $window_seconds, array $segments = []): ?WP_REST_Response {
        $config = self::rate_limit_config($bucket, $limit, $window_seconds);
        $state = self::rate_limit_state($bucket, $config['limit'], $config['window'], $segments);
        if (!empty($state['allowed'])) {
            return null;
        }
        return self::rate_limit_response($state);
    }

    private static function rate_limit_state(string $bucket, int $limit, int $window_seconds, array $segments = []): array {
        $limit = max(1, $limit);
        $window_seconds = max(1, $window_seconds);
        $now = time();
        $key = self::rate_limit_key($bucket, $segments);
        $state = get_transient($key);
        if (!is_array($state) || empty($state['reset_at']) || !isset($state['count'])) {
            $state = [
                'count' => 0,
                'reset_at' => $now + $window_seconds,
            ];
        }
        if ((int) $state['reset_at'] <= $now) {
            $state = [
                'count' => 0,
                'reset_at' => $now + $window_seconds,
            ];
        }

        $state['count'] = (int) $state['count'] + 1;
        $state['limit'] = $limit;
        $state['window_seconds'] = $window_seconds;
        $state['bucket'] = sanitize_key($bucket);
        $state['segments'] = array_map('sanitize_text_field', $segments);
        $state['allowed'] = $state['count'] <= $limit;
        $state['remaining'] = max(0, $limit - (int) $state['count']);
        $state['retry_after'] = max(1, (int) $state['reset_at'] - $now);

        set_transient($key, $state, $window_seconds);
        return $state;
    }

    private static function rate_limit_key(string $bucket, array $segments = []): string {
        $normalized_segments = array_map(static function ($segment) {
            return sanitize_text_field((string) $segment);
        }, $segments);
        return 'nevari_rl_' . substr(hash('sha256', sanitize_key($bucket) . '|' . implode('|', $normalized_segments)), 0, 32);
    }

    private static function rate_limit_response(array $state): WP_REST_Response {
        return self::error_with_headers(
            'too_many_requests',
            'Too many requests. Please try again later.',
            429,
            [
                'limit' => (int) ($state['limit'] ?? 0),
                'remaining' => (int) ($state['remaining'] ?? 0),
                'retry_after' => (int) ($state['retry_after'] ?? 60),
                'reset_at' => gmdate('c', (int) ($state['reset_at'] ?? time())),
            ],
            [
                'Retry-After' => (string) ((int) ($state['retry_after'] ?? 60)),
                'X-RateLimit-Limit' => (string) ((int) ($state['limit'] ?? 0)),
                'X-RateLimit-Remaining' => '0',
            ]
        );
    }

    public static function base64url_encode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function base64url_decode(string $data): string {
        $padding = strlen($data) % 4;
        if ($padding) {
            $data .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(strtr($data, '-_', '+/')) ?: '';
    }

    public static function jwt_secret(): string {
        $parts = [];
        foreach (['AUTH_KEY', 'SECURE_AUTH_KEY', 'LOGGED_IN_KEY', 'NONCE_KEY'] as $constant) {
            if (defined($constant)) {
                $parts[] = constant($constant);
            }
        }
        $parts[] = site_url();
        return hash('sha256', implode('|', $parts));
    }

    public static function current_user_roles(?int $user_id = null): array {
        $user_id = $user_id ?: get_current_user_id();
        $user = get_user_by('id', $user_id);
        return $user ? (array) $user->roles : [];
    }

    public static function is_store_admin(?int $user_id = null): bool {
        $user_id = $user_id ?: get_current_user_id();
        return user_can($user_id, 'nevari_manage_store') || user_can($user_id, 'manage_woocommerce') || user_can($user_id, 'manage_options');
    }

    public static function is_doctor(?int $user_id = null): bool {
        return in_array('doctor', self::current_user_roles($user_id), true);
    }

    public static function is_patient(?int $user_id = null): bool {
        return in_array('patient', self::current_user_roles($user_id), true) || in_array('customer', self::current_user_roles($user_id), true);
    }

    public static function user_summary(int $user_id): ?array {
        $user = get_user_by('id', $user_id);
        if (!$user) {
            return null;
        }
        return [
            'id' => (int) $user->ID,
            'email' => $user->user_email,
            'display_name' => $user->display_name,
            'roles' => array_values((array) $user->roles),
        ];
    }

    public static function get_json_params(WP_REST_Request $request): array {
        $params = $request->get_json_params();
        return is_array($params) ? $params : [];
    }

    public static function bool_param($value): bool {
        if (is_bool($value)) {
            return $value;
        }
        return in_array($value, ['1', 1, 'true', 'yes', 'on'], true);
    }

    public static function sanitize_text_or_null($value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return sanitize_text_field((string) $value);
    }

    public static function sanitize_long_text_or_null($value): ?string {
        if ($value === null || $value === '') {
            return null;
        }
        return wp_kses_post((string) $value);
    }

    public static function json_encode_safe($value): ?string {
        if ($value === null) {
            return null;
        }
        $json = wp_json_encode($value);
        return $json === false ? null : $json;
    }

    public static function json_decode_safe($value) {
        if (!$value || !is_string($value)) {
            return null;
        }
        $decoded = json_decode($value, true);
        return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
    }

    public static function normalize_datetime($value): ?string {
        if (!$value) {
            return null;
        }
        $timestamp = strtotime((string) $value);
        if (!$timestamp) {
            return null;
        }
        return gmdate('Y-m-d H:i:s', $timestamp);
    }

    public static function iso_datetime($mysql_datetime): ?string {
        if (!$mysql_datetime) {
            return null;
        }
        $timestamp = strtotime((string) $mysql_datetime . ' UTC');
        if (!$timestamp) {
            return null;
        }
        return gmdate('c', $timestamp);
    }

    public static function generate_prescription_number(): string {
        global $wpdb;
        $table = self::table('prescriptions');
        $next = (int) $wpdb->get_var("SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{$table}'");
        if ($next < 1) {
            $next = time();
        }
        return sprintf('RX-%s-%06d', gmdate('Y'), $next);
    }

    public static function product_requires_rx(int $product_id): bool {
        return self::bool_param(get_post_meta($product_id, '_nevari_rx_required', true));
    }

    public static function product_rules(int $product_id): array {
        $badges = wp_get_object_terms($product_id, 'nevari_product_badge', ['fields' => 'names']);
        if (is_wp_error($badges)) {
            $badges = [];
        }
        return [
            'rx_required' => self::bool_param(get_post_meta($product_id, '_nevari_rx_required', true)),
            'consultation_required' => self::bool_param(get_post_meta($product_id, '_nevari_consultation_required', true)),
            'otc' => self::bool_param(get_post_meta($product_id, '_nevari_otc', true)),
            'restricted_visibility' => self::bool_param(get_post_meta($product_id, '_nevari_restricted_visibility', true)),
            'badge_label' => (string) get_post_meta($product_id, '_nevari_badge_label', true),
            'badge_color' => (string) get_post_meta($product_id, '_nevari_badge_color', true),
            'badges' => array_values($badges),
            'dosage_form' => (string) get_post_meta($product_id, '_nevari_dosage_form', true),
            'strength' => (string) get_post_meta($product_id, '_nevari_strength', true),
            'active_ingredient' => (string) get_post_meta($product_id, '_nevari_active_ingredient', true),
        ];
    }

    public static function update_product_rules(int $product_id, array $rules): void {
        $bool_keys = [
            'rx_required' => '_nevari_rx_required',
            'consultation_required' => '_nevari_consultation_required',
            'otc' => '_nevari_otc',
            'restricted_visibility' => '_nevari_restricted_visibility',
        ];

        foreach ($bool_keys as $input => $meta_key) {
            if (array_key_exists($input, $rules)) {
                update_post_meta($product_id, $meta_key, self::bool_param($rules[$input]) ? '1' : '0');
            }
        }

        $string_keys = [
            'badge_label' => '_nevari_badge_label',
            'badge_color' => '_nevari_badge_color',
            'dosage_form' => '_nevari_dosage_form',
            'strength' => '_nevari_strength',
            'active_ingredient' => '_nevari_active_ingredient',
        ];

        foreach ($string_keys as $input => $meta_key) {
            if (array_key_exists($input, $rules)) {
                update_post_meta($product_id, $meta_key, sanitize_text_field((string) $rules[$input]));
            }
        }

        if (isset($rules['badge'])) {
            $badge = sanitize_key((string) $rules['badge']);
            if ($badge) {
                wp_set_object_terms($product_id, [$badge], 'nevari_product_badge', false);
            }
        }
    }

    public static function doctor_patient_link_exists(int $doctor_user_id, int $patient_user_id): bool {
        global $wpdb;
        $table = self::table('patient_doctor_links');
        $count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE doctor_user_id = %d AND patient_user_id = %d AND status = 'active'",
            $doctor_user_id,
            $patient_user_id
        ));
        return $count > 0;
    }

    public static function ensure_doctor_patient_link(int $doctor_user_id, int $patient_user_id, string $source = 'appointment'): void {
        global $wpdb;
        $table = self::table('patient_doctor_links');
        $existing = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$table} WHERE doctor_user_id = %d AND patient_user_id = %d",
            $doctor_user_id,
            $patient_user_id
        ));
        $now = self::now();
        if ($existing) {
            $wpdb->update($table, [
                'status' => 'active',
                'last_interaction_at' => $now,
            ], ['id' => $existing], ['%s', '%s'], ['%d']);
            return;
        }
        $wpdb->insert($table, [
            'patient_user_id' => $patient_user_id,
            'doctor_user_id' => $doctor_user_id,
            'source' => sanitize_key($source),
            'status' => 'active',
            'first_linked_at' => $now,
            'last_interaction_at' => $now,
        ], ['%d', '%d', '%s', '%s', '%s', '%s']);
    }

    public static function can_view_appointment($appointment): bool {
        $user_id = get_current_user_id();
        if (!$user_id || !$appointment) {
            return false;
        }
        if (self::is_store_admin($user_id)) {
            return true;
        }
        if (self::is_doctor($user_id) && (int) $appointment->doctor_user_id === $user_id) {
            return true;
        }
        if (self::is_patient($user_id) && (int) $appointment->patient_user_id === $user_id) {
            return true;
        }
        return false;
    }

    public static function can_view_prescription($prescription): bool {
        $user_id = get_current_user_id();
        if (!$user_id || !$prescription) {
            return false;
        }
        if (self::is_store_admin($user_id)) {
            return true;
        }
        if (self::is_patient($user_id)) {
            $visible = ['assigned_to_patient', 'partially_fulfilled', 'fulfilled', 'expired', 'cancelled'];
            return (int) $prescription->patient_user_id === $user_id && in_array((string) $prescription->status, $visible, true);
        }
        if (self::is_doctor($user_id)) {
            return (int) $prescription->doctor_user_id === $user_id || self::doctor_patient_link_exists($user_id, (int) $prescription->patient_user_id);
        }
        return false;
    }

    public static function find_valid_prescription_for_product(int $patient_user_id, int $product_id, float $quantity = 1) {
        global $wpdb;
        if (!$patient_user_id || !$product_id) {
            return null;
        }
        $p = self::table('prescriptions');
        $i = self::table('prescription_items');
        $now = self::now();
        return $wpdb->get_row($wpdb->prepare(
            "SELECT p.*, i.quantity AS prescribed_quantity, i.id AS prescription_item_id
             FROM {$p} p
             INNER JOIN {$i} i ON i.prescription_id = p.id
             WHERE p.patient_user_id = %d
               AND i.product_id = %d
               AND p.status IN ('assigned_to_patient', 'partially_fulfilled')
               AND p.valid_from <= %s
               AND (p.valid_until IS NULL OR p.valid_until >= %s)
               AND i.quantity >= %f
             ORDER BY p.valid_until IS NULL DESC, p.valid_until ASC, p.id DESC
             LIMIT 1",
            $patient_user_id,
            $product_id,
            $now,
            $now,
            $quantity
        ));
    }

    public static function patient_has_valid_prescription_for_product(int $patient_user_id, int $product_id, float $quantity = 1): bool {
        return (bool) self::find_valid_prescription_for_product($patient_user_id, $product_id, $quantity);
    }

    public static function format_appointment($row): array {
        global $wpdb;
        $order = null;
        if (!empty($row->order_id) && function_exists('wc_get_order')) {
            $order = wc_get_order((int) $row->order_id);
        }
        $review = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . self::table('appointment_reviews') . " WHERE appointment_id = %d LIMIT 1",
            (int) $row->id
        ));
        $doctor = self::user_summary((int) $row->doctor_user_id);
        $patient = self::user_summary((int) $row->patient_user_id);
        return [
            'id' => (int) $row->id,
            'patient_user_id' => (int) $row->patient_user_id,
            'doctor_user_id' => (int) $row->doctor_user_id,
            'order_id' => $row->order_id ? (int) $row->order_id : null,
            'doctor' => $doctor,
            'patient' => $patient,
            'type' => $row->type,
            'status' => $row->status,
            'payment_status' => self::appointment_payment_status($row, $order),
            'payment_required' => isset($row->payment_required) ? (bool) $row->payment_required : true,
            'start_at' => self::iso_datetime($row->start_at),
            'end_at' => self::iso_datetime($row->end_at),
            'timezone' => $row->timezone,
            'reason' => $row->reason,
            'symptoms' => self::json_decode_safe($row->symptoms),
            'intake_form' => self::json_decode_safe($row->intake_form),
            'doctor_notes' => $row->doctor_notes,
            'payment_completed_at' => isset($row->payment_completed_at) ? self::iso_datetime($row->payment_completed_at) : null,
            'completed_at' => self::iso_datetime($row->completed_at),
            'checkout_url' => $order && in_array(self::appointment_payment_status($row, $order), ['pending', 'failed'], true) ? $order->get_checkout_payment_url(false) : null,
            'calendar' => self::appointment_calendar_links($row),
            'google_meet_link' => self::appointment_meeting_link($row, $order),
            'meet_link' => self::appointment_meeting_link($row, $order),
            'google_calendar_event_id' => isset($row->google_calendar_event_id) && $row->google_calendar_event_id ? (string) $row->google_calendar_event_id : null,
            'google_meet_error' => isset($row->google_meet_error) && $row->google_meet_error ? (string) $row->google_meet_error : null,
            'google_meet_created_at' => isset($row->google_meet_created_at) ? self::iso_datetime($row->google_meet_created_at) : null,
            'review' => $review ? self::format_review_row($review) : null,
            'review_eligible' => $row->status === 'completed' && !$review,
            'created_at' => self::iso_datetime($row->created_at),
            'updated_at' => self::iso_datetime($row->updated_at),
        ];
    }

    public static function appointment_payment_status($appointment, $order = null): string {
        if ($order && is_object($order) && method_exists($order, 'is_paid')) {
            if ($order->is_paid()) {
                return 'paid';
            }
            $status = $order->get_status();
            if (in_array($status, ['failed', 'cancelled', 'refunded'], true)) {
                return $status;
            }
            return 'pending';
        }
        return isset($appointment->payment_status) && $appointment->payment_status ? (string) $appointment->payment_status : 'pending';
    }

    public static function doctor_consultation_fee(int $doctor_id): float {
        $profile_ids = get_posts([
            'post_type' => 'nevari_doctor_prof',
            'meta_key' => '_nevari_doctor_user_id',
            'meta_value' => $doctor_id,
            'fields' => 'ids',
            'numberposts' => 1,
        ]);
        $profile_id = $profile_ids ? (int) $profile_ids[0] : 0;
        return $profile_id ? (float) get_post_meta($profile_id, '_nevari_consultation_fee', true) : 0.0;
    }

    public static function appointment_calendar_links($appointment): array {
        $appointment_id = (int) $appointment->id;
        $title = rawurlencode('Nevari Appointment');
        $details = rawurlencode('Nevari doctor consultation appointment');
        $start = gmdate('Ymd\THis\Z', strtotime((string) $appointment->start_at . ' UTC'));
        $end = gmdate('Ymd\THis\Z', strtotime((string) $appointment->end_at . ' UTC'));
        return [
            'ics_url' => rest_url(NEVARI_PHARMACY_REST_NS . '/appointments/' . $appointment_id . '/calendar'),
            'google_url' => 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' . $title . '&dates=' . $start . '/' . $end . '&details=' . $details,
            'outlook_url' => 'https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=' . $title . '&startdt=' . rawurlencode(self::iso_datetime($appointment->start_at)) . '&enddt=' . rawurlencode(self::iso_datetime($appointment->end_at)) . '&body=' . $details,
        ];
    }

    public static function appointment_meeting_link($appointment, $order = null): string {
        foreach (['google_meet_link', 'meet_link', 'meeting_url'] as $field) {
            if (isset($appointment->{$field}) && self::is_google_meet_url((string) $appointment->{$field})) {
                return esc_url_raw((string) $appointment->{$field});
            }
        }
        if ($order && is_object($order) && method_exists($order, 'get_meta')) {
            foreach (['_nevari_google_meet_link', '_nevari_meet_link', '_nevari_meeting_url'] as $meta_key) {
                $value = $order->get_meta($meta_key);
                if ($value && self::is_google_meet_url((string) $value)) {
                    return esc_url_raw((string) $value);
                }
            }
        }
        return '';
    }

    private static function is_google_meet_url(string $value): bool {
        return (bool) preg_match('#^https://meet\.google\.com/[a-z0-9-]+#i', trim($value));
    }

    public static function appointment_ics_filename($appointment): string {
        return 'nevari-appointment-' . (int) $appointment->id . '.ics';
    }

    public static function appointment_ics_content($appointment, string $doctor_name = '', string $patient_name = ''): string {
        $uid = 'nevari-appointment-' . (int) $appointment->id . '@' . wp_parse_url(home_url(), PHP_URL_HOST);
        $summary = self::ics_escape('Nevari Appointment - ' . ($doctor_name ?: 'Doctor Consultation'));
        $description = self::ics_escape('Patient: ' . $patient_name . '\nDoctor: ' . $doctor_name . '\nReason: ' . (string) $appointment->reason);
        $dt_start = gmdate('Ymd\THis\Z', strtotime((string) $appointment->start_at . ' UTC'));
        $dt_end = gmdate('Ymd\THis\Z', strtotime((string) $appointment->end_at . ' UTC'));
        $dt_stamp = gmdate('Ymd\THis\Z');
        return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Nevari//Appointments//EN\r\nCALSCALE:GREGORIAN\r\nBEGIN:VEVENT\r\nUID:{$uid}\r\nDTSTAMP:{$dt_stamp}\r\nDTSTART:{$dt_start}\r\nDTEND:{$dt_end}\r\nSUMMARY:{$summary}\r\nDESCRIPTION:{$description}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
    }

    public static function format_review_row($row): array {
        return [
            'id' => (int) $row->id,
            'appointment_id' => (int) $row->appointment_id,
            'doctor_user_id' => (int) $row->doctor_user_id,
            'patient_user_id' => (int) $row->patient_user_id,
            'patient' => self::user_summary((int) $row->patient_user_id),
            'rating' => (int) $row->rating,
            'review_text' => $row->review_text,
            'status' => $row->status,
            'created_at' => self::iso_datetime($row->created_at),
            'updated_at' => self::iso_datetime($row->updated_at),
        ];
    }

    public static function doctor_review_summary(int $doctor_id): array {
        global $wpdb;
        $table = self::table('appointment_reviews');
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT rating, COUNT(*) AS count FROM {$table} WHERE doctor_user_id = %d AND status = 'approved' GROUP BY rating",
            $doctor_id
        ));
        $distribution = [1 => 0, 2 => 0, 3 => 0, 4 => 0, 5 => 0];
        $total = 0;
        $weighted = 0;
        foreach ($rows ?: [] as $row) {
            $rating = max(1, min(5, (int) $row->rating));
            $count = (int) $row->count;
            $distribution[$rating] = $count;
            $total += $count;
            $weighted += $rating * $count;
        }
        return [
            'average' => $total > 0 ? round($weighted / $total, 1) : 0,
            'count' => $total,
            'distribution' => $distribution,
        ];
    }

    private static function ics_escape(string $value): string {
        return str_replace(["\\", ";", ",", "\r\n", "\n", "\r"], ["\\\\", "\;", "\,", "\\n", "\\n", "\\n"], $value);
    }

    public static function format_prescription($row, bool $include_items = true): array {
        global $wpdb;
        $data = [
            'id' => (int) $row->id,
            'prescription_number' => $row->prescription_number,
            'patient_user_id' => (int) $row->patient_user_id,
            'doctor_user_id' => (int) $row->doctor_user_id,
            'appointment_id' => $row->appointment_id ? (int) $row->appointment_id : null,
            'order_id' => $row->order_id ? (int) $row->order_id : null,
            'status' => $row->status,
            'diagnosis' => $row->diagnosis,
            'instructions' => $row->instructions,
            'valid_from' => self::iso_datetime($row->valid_from),
            'valid_until' => self::iso_datetime($row->valid_until),
            'issued_at' => self::iso_datetime($row->issued_at),
            'assigned_at' => self::iso_datetime($row->assigned_at),
            'fulfilled_at' => self::iso_datetime($row->fulfilled_at),
            'created_at' => self::iso_datetime($row->created_at),
            'updated_at' => self::iso_datetime($row->updated_at),
        ];

        if ($include_items) {
            $items_table = self::table('prescription_items');
            $items = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$items_table} WHERE prescription_id = %d ORDER BY id ASC", (int) $row->id));
            $data['items'] = array_map(static function ($item) {
                $product_name = function_exists('wc_get_product') ? (($p = wc_get_product((int) $item->product_id)) ? $p->get_name() : null) : get_the_title((int) $item->product_id);
                return [
                    'id' => (int) $item->id,
                    'product_id' => (int) $item->product_id,
                    'variation_id' => $item->variation_id ? (int) $item->variation_id : null,
                    'product_name' => $product_name,
                    'dosage' => $item->dosage,
                    'quantity' => (float) $item->quantity,
                    'unit' => $item->unit,
                    'frequency' => $item->frequency,
                    'duration_days' => $item->duration_days ? (int) $item->duration_days : null,
                    'refills_allowed' => (int) $item->refills_allowed,
                    'refills_used' => (int) $item->refills_used,
                    'substitution_allowed' => (bool) $item->substitution_allowed,
                    'notes' => $item->notes,
                ];
            }, $items ?: []);
        }

        return $data;
    }

    public static function pagination_meta(int $page, int $per_page, int $total): array {
        return [
            'pagination' => [
                'page' => $page,
                'per_page' => $per_page,
                'total' => $total,
                'total_pages' => $per_page > 0 ? (int) ceil($total / $per_page) : 1,
            ],
        ];
    }
}
