<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Connections {
    private static $last_authorization_error = [
        'code' => 'untrusted_frontend',
        'message' => 'This frontend request is not authorized for the pharmacy installation.',
    ];

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/connections/status', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'frontend_status'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function frontend_types(): array {
        return [
            'custom_frontend' => __('Custom Frontend', 'nevari-pharmacy-core'),
            'storefront' => __('Storefront Dashboard', 'nevari-pharmacy-core'),
            'doctors_dashboard' => __('Doctor Dashboard', 'nevari-pharmacy-core'),
            'pharmacist_dashboard' => __('Pharmacist Dashboard', 'nevari-pharmacy-core'),
            'patient_dashboard' => __('Patient Dashboard', 'nevari-pharmacy-core'),
        ];
    }

    public static function create_pairing_code(string $frontend_type, int $generated_by): array {
        throw new InvalidArgumentException('Frontend pairing has been removed. Use NEVARI_PROXY_SIGNING_SECRET and the shared frontend base URL instead.');
    }

    public static function recent_pairing_sessions(int $limit = 10): array {
        return [];
    }

    public static function trusted_frontends(): array {
        return [];
    }

    public static function trusted_frontend_for_type(string $frontend_type): ?array {
        $frontend_type = sanitize_key($frontend_type);
        if (!isset(self::frontend_types()[$frontend_type])) {
            return null;
        }

        $base_url = Nevari_Helpers::shared_frontend_base_url();
        $origin = self::normalize_origin($base_url);
        if (!$origin) {
            return null;
        }

        return [
            'id' => 0,
            'frontend_type' => $frontend_type,
            'frontend_origin' => $origin,
            'frontend_url' => self::frontend_url_for_type($frontend_type),
            'trust_status' => 'signed_origin',
            'paired_by' => 0,
            'pairing_session_id' => null,
            'paired_at' => null,
            'last_seen_at' => null,
            'created_at' => null,
            'updated_at' => null,
        ];
    }

    public static function revoke_frontend(int $connection_id): bool {
        return false;
    }

    public static function delete_revoked_frontend(int $connection_id): bool {
        return false;
    }

    public static function frontend_status(WP_REST_Request $request): WP_REST_Response {
        $frontend_type = sanitize_key((string) ($request->get_param('frontend_type') ?: ($_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE'] ?? '')));
        $frontend = self::resolve_request_frontend(['frontend_type' => $frontend_type]);
        if (!$frontend) {
            return self::status_response(Nevari_Helpers::error('unauthorized_frontend', 'This frontend request is not authorized.', 403));
        }

        return self::status_response(Nevari_Helpers::success([
            'authorized' => true,
            'site_name' => get_bloginfo('name'),
            'site_logo' => self::site_logo_url(),
            'site_url' => home_url(),
            'frontend_type' => $frontend['frontend_type'],
            'frontend_origin' => $frontend['frontend_origin'],
        ]));
    }

    public static function resolve_request_frontend(array $params = []): ?array {
        self::set_authorization_error('untrusted_frontend', 'This frontend request is not authorized for the pharmacy installation.');
        $frontend_type = !empty($params['frontend_type']) ? sanitize_key((string) $params['frontend_type']) : '';
        $explicit_origin = !empty($params['frontend_origin']) ? (string) $params['frontend_origin'] : '';
        $header_type = !empty($_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE']) ? sanitize_key(wp_unslash($_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE'])) : '';
        $header_origin = !empty($_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN']) ? self::normalize_origin((string) wp_unslash($_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN'])) : null;

        if ($frontend_type === '') {
            $frontend_type = $header_type;
        }
        if ($frontend_type === '' || !isset(self::frontend_types()[$frontend_type])) {
            self::set_authorization_error('invalid_frontend_type', 'The frontend type header is missing or invalid.');
            return null;
        }

        $verified_origin = self::verified_proxy_origin($frontend_type);
        if (!$verified_origin) {
            return null;
        }

        $provided_origin = self::normalize_origin($explicit_origin);
        if ($provided_origin && $provided_origin !== 'null' && $provided_origin !== $verified_origin) {
            self::set_authorization_error('frontend_origin_mismatch', 'The frontend origin in the request body did not match the signed frontend origin.');
            return null;
        }
        if ($header_origin && $header_origin !== $verified_origin) {
            self::set_authorization_error('frontend_origin_mismatch', 'The frontend origin header did not match the signed frontend origin.');
            return null;
        }

        return [
            'id' => 0,
            'frontend_type' => $frontend_type,
            'frontend_origin' => $verified_origin,
            'frontend_url' => !empty($params['frontend_url']) ? (string) $params['frontend_url'] : self::frontend_url_for_type($frontend_type),
            'trust_status' => 'signed_origin',
            'paired_by' => 0,
            'pairing_session_id' => null,
            'paired_at' => null,
            'last_seen_at' => null,
            'created_at' => null,
            'updated_at' => null,
        ];
    }

    public static function validate_token_context(array $payload): bool {
        if (empty($payload['frontend_type']) || empty($payload['frontend_origin'])) {
            return false;
        }
        $frontend_type = sanitize_key((string) $payload['frontend_type']);
        $frontend_origin = self::normalize_origin((string) $payload['frontend_origin']);

        return isset(self::frontend_types()[$frontend_type]) && (bool) $frontend_origin;
    }

    public static function normalize_origin(string $value): ?string {
        $value = trim($value);
        if ($value === '') {
            return null;
        }
        if ($value === 'null') {
            return 'null';
        }

        $parts = wp_parse_url($value);
        if (empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }

        $origin = strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']);
        if (!empty($parts['port'])) {
            $origin .= ':' . (int) $parts['port'];
        }

        return $origin;
    }

    public static function request_authorization_error(): array {
        return is_array(self::$last_authorization_error)
            ? self::$last_authorization_error
            : ['code' => 'untrusted_frontend', 'message' => 'This frontend request is not authorized for the pharmacy installation.'];
    }

    private static function site_logo_url(): ?string {
        $logo_id = (int) get_theme_mod('custom_logo');
        return $logo_id ? (wp_get_attachment_image_url($logo_id, 'medium') ?: null) : null;
    }

    private static function status_response($response): WP_REST_Response {
        if ($response instanceof WP_REST_Response) {
            $rest_response = $response;
        } else {
            $rest_response = rest_ensure_response($response);
        }

        $rest_response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        $rest_response->header('Vary', 'Origin, X-Nevari-Frontend-Type, X-Nevari-Frontend-Origin');
        return $rest_response;
    }

    private static function verified_proxy_origin(string $frontend_type): ?string {
        if (empty($_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN'])) {
            self::set_authorization_error('missing_frontend_origin', 'The signed frontend origin header is missing.');
            return null;
        }

        $origin = self::normalize_origin((string) wp_unslash($_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN']));
        $timestamp = !empty($_SERVER['HTTP_X_NEVARI_PROXY_TIMESTAMP']) ? (int) wp_unslash($_SERVER['HTTP_X_NEVARI_PROXY_TIMESTAMP']) : 0;
        $signature = !empty($_SERVER['HTTP_X_NEVARI_PROXY_SIGNATURE']) ? strtolower(sanitize_text_field(wp_unslash($_SERVER['HTTP_X_NEVARI_PROXY_SIGNATURE']))) : '';
        $secret = self::proxy_signing_secret();

        if (!$origin || $origin === 'null') {
            self::set_authorization_error('invalid_frontend_origin', 'The signed frontend origin is invalid.');
            return null;
        }
        if (!$frontend_type) {
            self::set_authorization_error('invalid_frontend_type', 'The frontend type header is missing or invalid.');
            return null;
        }
        if (!$timestamp || !$signature) {
            self::set_authorization_error('missing_frontend_signature', 'The signed frontend timestamp or signature header is missing.');
            return null;
        }
        if (!$secret) {
            self::set_authorization_error('missing_proxy_secret', 'NEVARI_PROXY_SIGNING_SECRET is not configured in the WordPress runtime.');
            return null;
        }
        if (abs(time() - $timestamp) > 300) {
            self::set_authorization_error('expired_frontend_signature', 'The frontend signature is expired. Check server time and retry.');
            return null;
        }

        $expected = hash_hmac('sha256', $timestamp . "\n" . $frontend_type . "\n" . $origin, $secret);
        if (!hash_equals($expected, $signature)) {
            self::set_authorization_error('invalid_frontend_signature', 'The frontend signature is invalid. Check that NEVARI_PROXY_SIGNING_SECRET matches in WordPress and the dashboard.');
            return null;
        }

        return $origin;
    }

    private static function proxy_signing_secret(): string {
        if (defined('NEVARI_PROXY_SIGNING_SECRET')) {
            return trim((string) constant('NEVARI_PROXY_SIGNING_SECRET'));
        }
        return trim((string) getenv('NEVARI_PROXY_SIGNING_SECRET'));
    }

    private static function set_authorization_error(string $code, string $message): void {
        self::$last_authorization_error = [
            'code' => sanitize_key($code),
            'message' => (string) $message,
        ];
    }

    private static function frontend_url_for_type(string $frontend_type): string {
        $base = rtrim(Nevari_Helpers::shared_frontend_base_url(), '/');
        $path_map = [
            'custom_frontend' => '/admin/storefront',
            'storefront' => '/admin/storefront',
            'doctors_dashboard' => '/admin/doctor',
            'pharmacist_dashboard' => '/admin/pharmacist',
            'patient_dashboard' => '/dashboard',
        ];
        $path = $path_map[$frontend_type] ?? '/';
        return $base . $path;
    }
}
