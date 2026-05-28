<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Connections {
    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/connections/verify', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'verify_pairing'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/connections/register', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'register_frontend'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/connections/status', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'frontend_status'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function frontend_types(): array {
        return [
            'custom_frontend' => __('Custom Frontend', 'nevari-pharmacy-core'),
        ];
    }

    public static function create_pairing_code(string $frontend_type, int $generated_by): array {
        global $wpdb;

        if (!isset(self::frontend_types()[$frontend_type])) {
            throw new InvalidArgumentException('Invalid frontend type.');
        }

        $session_uuid = wp_generate_uuid4();
        $base_url = self::pairing_base_url();
        $url_segment = self::encode_pairing_base_url($base_url);
        $secret_segment = strtoupper(wp_generate_password(16, false, false));
        $raw_code = sprintf('NV1.%s.%s', $url_segment, $secret_segment);
        $now = Nevari_Helpers::now();
        $expires_at = gmdate('Y-m-d H:i:s', time() + (10 * MINUTE_IN_SECONDS));

        $wpdb->insert(Nevari_Helpers::table('pairing_sessions'), [
            'session_uuid' => $session_uuid,
            'frontend_type' => $frontend_type,
            'code_hash' => hash('sha256', $raw_code),
            'code_hint' => substr($secret_segment, -4),
            'requested_origin' => null,
            'verified_origin' => null,
            'generated_by' => $generated_by,
            'status' => 'pending',
            'expires_at' => $expires_at,
            'verified_at' => null,
            'used_at' => null,
            'created_at' => $now,
        ]);

        Nevari_Audit::log('security', 'nevari', 'connection.pairing_generated', 'success', [
            'actor_user_id' => $generated_by,
            'message' => 'One-time pairing code generated.',
            'metadata' => [
                'frontend_type' => $frontend_type,
                'session_uuid' => $session_uuid,
                'expires_at' => Nevari_Helpers::iso_datetime($expires_at),
            ],
        ]);

        return [
            'session_uuid' => $session_uuid,
            'frontend_type' => $frontend_type,
            'code' => $raw_code,
            'expires_at' => Nevari_Helpers::iso_datetime($expires_at),
            'site_url' => $base_url,
        ];
    }

    public static function recent_pairing_sessions(int $limit = 10): array {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('pairing_sessions') . " ORDER BY created_at DESC LIMIT %d",
            max(1, $limit)
        ));

        return array_map([__CLASS__, 'format_pairing_session'], $rows ?: []);
    }

    public static function trusted_frontends(): array {
        global $wpdb;
        $rows = $wpdb->get_results("SELECT * FROM " . Nevari_Helpers::table('frontend_connections') . " ORDER BY updated_at DESC, created_at DESC");
        return array_map([__CLASS__, 'format_frontend_connection'], $rows ?: []);
    }

    public static function revoke_frontend(int $connection_id): bool {
        global $wpdb;
        $updated = $wpdb->update(
            Nevari_Helpers::table('frontend_connections'),
            [
                'trust_status' => 'revoked',
                'updated_at' => Nevari_Helpers::now(),
            ],
            ['id' => $connection_id],
            ['%s', '%s'],
            ['%d']
        );
        return $updated !== false;
    }

    public static function delete_revoked_frontend(int $connection_id): bool {
        global $wpdb;

        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('frontend_connections') . " WHERE id = %d LIMIT 1",
            $connection_id
        ));
        if (!$row || $row->trust_status !== 'revoked') {
            return false;
        }

        $deleted = $wpdb->delete(
            Nevari_Helpers::table('frontend_connections'),
            ['id' => $connection_id],
            ['%d']
        );
        if ($deleted === false) {
            return false;
        }

        Nevari_Audit::log('security', 'nevari', 'connection.frontend_deleted', 'success', [
            'actor_user_id' => get_current_user_id() ?: null,
            'message' => 'Revoked frontend domain was permanently deleted.',
            'metadata' => [
                'connection_id' => $connection_id,
                'frontend_type' => (string) $row->frontend_type,
                'frontend_origin' => (string) $row->frontend_origin,
            ],
        ]);

        return true;
    }

    public static function verify_pairing(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('pairing_verify', 20, 10 * MINUTE_IN_SECONDS, [Nevari_Helpers::client_ip()])) {
            return $response;
        }

        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $code = isset($params['pairing_code']) ? self::normalize_pairing_code((string) $params['pairing_code']) : '';
        $frontend_type = isset($params['frontend_type']) ? sanitize_key((string) $params['frontend_type']) : '';
        $frontend_url = isset($params['frontend_url']) ? trim((string) $params['frontend_url']) : '';
        $provided_origin = !empty($params['frontend_origin']) ? self::normalize_origin((string) $params['frontend_origin']) : self::normalize_origin($frontend_url);
        $frontend_origin = self::verified_proxy_origin($frontend_type);

        if (!$code || !$frontend_type || !$frontend_origin) {
            return Nevari_Helpers::error('validation_error', 'pairing_code, frontend_type, and a valid request origin are required.', 422);
        }

        if (!isset(self::frontend_types()[$frontend_type])) {
            return Nevari_Helpers::error('invalid_frontend_type', 'Unsupported frontend type.', 422);
        }

        if ($provided_origin && $provided_origin !== 'null' && $provided_origin !== $frontend_origin) {
            Nevari_Audit::log('security', 'nevari', 'connection.origin_mismatch', 'error', [
                'severity' => 'warning',
                'message' => 'Pairing request origin did not match the supplied frontend origin.',
                'metadata' => [
                    'request_origin' => $frontend_origin,
                    'frontend_origin' => $frontend_origin,
                    'frontend_type' => $frontend_type,
                ],
            ]);
            return Nevari_Helpers::error('origin_mismatch', 'The pairing request origin did not match the supplied frontend URL.', 403);
        }

        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('pairing_sessions') . " WHERE code_hash = %s LIMIT 1",
            hash('sha256', $code)
        ));

        if (!$row) {
            self::log_pairing_failure('connection.pairing_not_found', $frontend_type, $frontend_origin, 'Pairing code was not found.');
            return Nevari_Helpers::error('pairing_not_found', 'Pairing code is invalid.', 404);
        }

        if ($row->frontend_type !== $frontend_type) {
            self::log_pairing_failure('connection.frontend_type_mismatch', $frontend_type, $frontend_origin, 'Pairing code frontend type mismatch.');
            return Nevari_Helpers::error('frontend_type_mismatch', 'Pairing code does not match this frontend type.', 409);
        }

        if ($row->status === 'used' || !empty($row->used_at)) {
            self::log_pairing_failure('connection.pairing_reused', $frontend_type, $frontend_origin, 'Pairing code was already used.');
            return Nevari_Helpers::error('pairing_used', 'This pairing code has already been used.', 409);
        }

        if (strtotime((string) $row->expires_at) <= time()) {
            self::log_pairing_failure('connection.pairing_expired', $frontend_type, $frontend_origin, 'Pairing code expired.');
            return Nevari_Helpers::error('pairing_expired', 'This pairing code has expired.', 410);
        }

        $wpdb->update(Nevari_Helpers::table('pairing_sessions'), [
            'requested_origin' => $frontend_origin,
            'verified_origin' => $frontend_origin,
            'verified_at' => Nevari_Helpers::now(),
            'status' => 'verified',
        ], ['id' => (int) $row->id], ['%s', '%s', '%s', '%s'], ['%d']);

        Nevari_Audit::log('security', 'nevari', 'connection.pairing_verified', 'success', [
            'message' => 'Pairing code verified successfully.',
            'metadata' => [
                'frontend_type' => $frontend_type,
                'frontend_origin' => $frontend_origin,
                'session_uuid' => $row->session_uuid,
            ],
        ]);

        return Nevari_Helpers::success([
            'pairing_session_id' => $row->session_uuid,
            'frontend_type' => $frontend_type,
            'frontend_origin' => $frontend_origin,
            'site_name' => get_bloginfo('name'),
            'site_logo' => self::site_logo_url(),
            'site_url' => home_url(),
            'connection_status' => 'verified',
        ]);
    }

    public static function register_frontend(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('pairing_register', 20, 10 * MINUTE_IN_SECONDS, [Nevari_Helpers::client_ip()])) {
            return $response;
        }

        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $session_uuid = isset($params['pairing_session_id']) ? sanitize_text_field((string) $params['pairing_session_id']) : '';
        $frontend_type = isset($params['frontend_type']) ? sanitize_key((string) $params['frontend_type']) : '';
        $frontend_url = isset($params['frontend_url']) ? trim((string) $params['frontend_url']) : '';
        $provided_origin = !empty($params['frontend_origin']) ? self::normalize_origin((string) $params['frontend_origin']) : self::normalize_origin($frontend_url);
        $frontend_origin = self::verified_proxy_origin($frontend_type);

        if (!$session_uuid || !$frontend_type || !$frontend_origin) {
            return Nevari_Helpers::error('validation_error', 'pairing_session_id, frontend_type, and a valid request origin are required.', 422);
        }

        if ($provided_origin && $provided_origin !== 'null' && $provided_origin !== $frontend_origin) {
            return Nevari_Helpers::error('origin_mismatch', 'The registration request origin did not match the supplied frontend URL.', 403);
        }

        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('pairing_sessions') . " WHERE session_uuid = %s LIMIT 1",
            $session_uuid
        ));

        if (!$row) {
            return Nevari_Helpers::error('pairing_session_not_found', 'Pairing session was not found.', 404);
        }

        if ($row->frontend_type !== $frontend_type) {
            return Nevari_Helpers::error('frontend_type_mismatch', 'Pairing session does not match this frontend type.', 409);
        }

        if (!in_array($row->status, ['verified', 'pending'], true)) {
            return Nevari_Helpers::error('pairing_invalid_state', 'Pairing session is not available for registration.', 409);
        }

        if (strtotime((string) $row->expires_at) <= time()) {
            return Nevari_Helpers::error('pairing_expired', 'This pairing session has expired.', 410);
        }

        $now = Nevari_Helpers::now();
        $wpdb->replace(Nevari_Helpers::table('frontend_connections'), [
            'frontend_type' => $frontend_type,
            'frontend_origin' => $frontend_origin,
            'frontend_url' => $frontend_url ?: $frontend_origin,
            'trust_status' => 'trusted',
            'paired_by' => (int) $row->generated_by,
            'pairing_session_id' => (int) $row->id,
            'paired_at' => $now,
            'last_seen_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $wpdb->update(Nevari_Helpers::table('pairing_sessions'), [
            'status' => 'used',
            'used_at' => $now,
            'verified_origin' => $frontend_origin,
        ], ['id' => (int) $row->id], ['%s', '%s', '%s'], ['%d']);

        Nevari_Audit::log('security', 'nevari', 'connection.frontend_registered', 'success', [
            'message' => 'Frontend registered as trusted.',
            'metadata' => [
                'frontend_type' => $frontend_type,
                'frontend_origin' => $frontend_origin,
                'frontend_url' => $frontend_url,
                'session_uuid' => $session_uuid,
            ],
        ]);

        return Nevari_Helpers::success([
            'site_name' => get_bloginfo('name'),
            'site_logo' => self::site_logo_url(),
            'site_url' => home_url(),
            'frontend_type' => $frontend_type,
            'frontend_origin' => $frontend_origin,
            'connection_status' => 'trusted',
        ]);
    }

    public static function frontend_status(WP_REST_Request $request): WP_REST_Response {
        $frontend_type = sanitize_key((string) ($request->get_param('frontend_type') ?: ($_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE'] ?? '')));
        if (!$frontend_type || !self::verified_proxy_origin($frontend_type)) {
            return self::status_response(
                Nevari_Helpers::error('invalid_request_origin', 'A verified frontend request origin is required.', 403)
            );
        }
        $frontend = $frontend_type ? self::resolve_request_frontend(['frontend_type' => $frontend_type]) : null;
        if (!$frontend) {
            return self::status_response(Nevari_Helpers::success(['paired' => false]));
        }
        return self::status_response(Nevari_Helpers::success([
            'paired' => true,
            'site_name' => get_bloginfo('name'),
            'site_logo' => self::site_logo_url(),
            'site_url' => home_url(),
            'frontend_type' => $frontend_type,
            'frontend_origin' => $frontend['frontend_origin'],
        ]));
    }

    public static function resolve_request_frontend(array $params = []): ?array {
        $frontend_type = !empty($params['frontend_type']) ? sanitize_key((string) $params['frontend_type']) : '';
        $explicit_origin = !empty($params['frontend_origin']) ? (string) $params['frontend_origin'] : '';
        $header_type = !empty($_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE']) ? sanitize_key(wp_unslash($_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE'])) : '';
        if (!$frontend_type) {
            $frontend_type = $header_type;
        }
        $frontend_origin = self::verified_proxy_origin($frontend_type);
        $provided_origin = self::normalize_origin($explicit_origin);

        if ($provided_origin && $provided_origin !== 'null' && $provided_origin !== $frontend_origin) {
            return null;
        }

        if (!$frontend_type || !$frontend_origin) {
            return null;
        }

        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('frontend_connections') . " WHERE frontend_type = %s AND frontend_origin = %s AND trust_status = 'trusted' LIMIT 1",
            $frontend_type,
            $frontend_origin
        ));

        if (!$row && in_array($frontend_type, ['storefront', 'doctors_dashboard', 'patient_dashboard'], true)) {
            $row = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM " . Nevari_Helpers::table('frontend_connections') . " WHERE frontend_type = 'custom_frontend' AND frontend_origin = %s AND trust_status = 'trusted' LIMIT 1",
                $frontend_origin
            ));
            if ($row) {
                $row->frontend_type = $frontend_type;
            }
        }

        if (!$row) {
            return null;
        }

        $wpdb->update(Nevari_Helpers::table('frontend_connections'), [
            'last_seen_at' => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => (int) $row->id], ['%s', '%s'], ['%d']);

        return self::format_frontend_connection($row);
    }

    public static function validate_token_context(array $payload): bool {
        if (empty($payload['frontend_type']) || empty($payload['frontend_origin'])) {
            return false;
        }

        $resolved = self::resolve_request_frontend([
            'frontend_type' => $payload['frontend_type'],
            'frontend_origin' => $payload['frontend_origin'],
        ]);

        if (!$resolved) {
            return false;
        }

        return $resolved['frontend_type'] === $payload['frontend_type']
            && $resolved['frontend_origin'] === $payload['frontend_origin'];
    }

    private static function site_logo_url(): ?string {
        $logo_id = (int) get_theme_mod('custom_logo');
        return $logo_id ? (wp_get_attachment_image_url($logo_id, 'medium') ?: null) : null;
    }

    private static function status_response(WP_REST_Response $response): WP_REST_Response {
        $response->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        $response->header('Vary', 'Origin, X-Nevari-Frontend-Type, X-Nevari-Frontend-Origin');
        return $response;
    }

    private static function verified_proxy_origin(string $frontend_type): ?string {
        $request_origin = !empty($_SERVER['HTTP_ORIGIN'])
            ? self::normalize_origin((string) wp_unslash($_SERVER['HTTP_ORIGIN']))
            : null;
        if (!$request_origin || $request_origin === 'null') {
            return null;
        }

        if (empty($_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN'])) {
            return null;
        }
        $origin = self::normalize_origin((string) wp_unslash($_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN']));
        $timestamp = !empty($_SERVER['HTTP_X_NEVARI_PROXY_TIMESTAMP']) ? (int) wp_unslash($_SERVER['HTTP_X_NEVARI_PROXY_TIMESTAMP']) : 0;
        $signature = !empty($_SERVER['HTTP_X_NEVARI_PROXY_SIGNATURE']) ? strtolower(sanitize_text_field(wp_unslash($_SERVER['HTTP_X_NEVARI_PROXY_SIGNATURE']))) : '';
        $secret = self::proxy_signing_secret();

        if (!$origin || $origin === 'null' || !$frontend_type || !$timestamp || !$signature || !$secret) {
            return null;
        }
        if ($origin !== $request_origin) {
            return null;
        }
        if (abs(time() - $timestamp) > 300) {
            return null;
        }

        $expected = hash_hmac('sha256', $timestamp . "\n" . $frontend_type . "\n" . $origin, $secret);
        return hash_equals($expected, $signature) ? $origin : null;
    }

    private static function proxy_signing_secret(): string {
        if (defined('NEVARI_PROXY_SIGNING_SECRET')) {
            return trim((string) constant('NEVARI_PROXY_SIGNING_SECRET'));
        }
        return trim((string) getenv('NEVARI_PROXY_SIGNING_SECRET'));
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

        $origin = strtolower($parts['scheme']) . '://' . strtolower($parts['host']);
        if (!empty($parts['port'])) {
            $origin .= ':' . (int) $parts['port'];
        }

        return $origin;
    }

    private static function format_pairing_session($row): array {
        return [
            'id' => (int) $row->id,
            'session_uuid' => $row->session_uuid,
            'frontend_type' => $row->frontend_type,
            'code_hash_prefix' => !empty($row->code_hash) ? substr((string) $row->code_hash, 0, 12) : '',
            'code_hint' => $row->code_hint,
            'requested_origin' => $row->requested_origin,
            'verified_origin' => $row->verified_origin,
            'status' => $row->status,
            'expires_at' => Nevari_Helpers::iso_datetime($row->expires_at),
            'verified_at' => Nevari_Helpers::iso_datetime($row->verified_at),
            'used_at' => Nevari_Helpers::iso_datetime($row->used_at),
            'created_at' => Nevari_Helpers::iso_datetime($row->created_at),
        ];
    }

    private static function format_frontend_connection($row): array {
        return [
            'id' => (int) $row->id,
            'frontend_type' => $row->frontend_type,
            'frontend_origin' => $row->frontend_origin,
            'frontend_url' => $row->frontend_url,
            'trust_status' => $row->trust_status,
            'paired_by' => (int) $row->paired_by,
            'pairing_session_id' => $row->pairing_session_id ? (int) $row->pairing_session_id : null,
            'paired_at' => Nevari_Helpers::iso_datetime($row->paired_at),
            'last_seen_at' => Nevari_Helpers::iso_datetime($row->last_seen_at),
            'created_at' => Nevari_Helpers::iso_datetime($row->created_at),
            'updated_at' => Nevari_Helpers::iso_datetime($row->updated_at),
        ];
    }

    private static function log_pairing_failure(string $action, string $frontend_type, string $frontend_origin, string $message): void {
        Nevari_Audit::log('security', 'nevari', $action, 'error', [
            'severity' => 'warning',
            'message' => $message,
            'metadata' => [
                'frontend_type' => $frontend_type,
                'frontend_origin' => $frontend_origin,
            ],
        ]);
    }

    private static function pairing_base_url(): string {
        return untrailingslashit(home_url());
    }

    private static function encode_pairing_base_url(string $base_url): string {
        return rtrim(strtr(base64_encode($base_url), '+/', '-_'), '=');
    }

    private static function normalize_pairing_code(string $code): string {
        $code = trim(sanitize_text_field($code));
        if ($code === '') {
            return '';
        }

        $parts = explode('.', $code);
        if (count($parts) < 3) {
            return $code;
        }

        $parts[0] = strtoupper((string) $parts[0]);
        $parts[2] = strtoupper((string) $parts[2]);

        return implode('.', $parts);
    }
}
