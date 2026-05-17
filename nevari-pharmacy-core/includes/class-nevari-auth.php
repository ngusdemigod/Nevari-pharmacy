<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Auth {
    public static function init(): void {
        add_filter('determine_current_user', [__CLASS__, 'determine_current_user'], 20, 1);
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/login', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'login'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/refresh', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'refresh'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/password-reset', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'password_reset'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/logout', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'logout'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/me', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'me'],
            'permission_callback' => static function () {
                return is_user_logged_in();
            },
        ]);
    }

    public static function determine_current_user($user_id) {
        if ($user_id) {
            return $user_id;
        }
        $token = Nevari_Helpers::get_bearer_token();
        if (!$token) {
            return $user_id;
        }
        $payload = self::decode_jwt($token);
        if (!$payload || empty($payload['sub']) || empty($payload['type']) || $payload['type'] !== 'access') {
            Nevari_Audit::log('security', 'nevari', 'auth.invalid_token', 'error', [
                'severity' => 'warning',
                'error_code' => 'invalid_token',
                'message' => 'Invalid bearer token used.',
            ]);
            return $user_id;
        }
        if (!Nevari_Connections::validate_token_context($payload)) {
            Nevari_Audit::log('security', 'nevari', 'auth.invalid_frontend_context', 'error', [
                'severity' => 'warning',
                'error_code' => 'invalid_frontend_context',
                'message' => 'Access token was used from an untrusted frontend context.',
            ]);
            return $user_id;
        }
        if (!self::user_can_access_frontend((int) $payload['sub'], (string) $payload['frontend_type'])) {
            return $user_id;
        }
        return (int) $payload['sub'];
    }

    public static function login(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $username = isset($params['username']) ? sanitize_text_field((string) $params['username']) : '';
        $password = isset($params['password']) ? (string) $params['password'] : '';
        $ip = Nevari_Helpers::client_ip();
        $username_key = $username ? sanitize_user(strtolower($username), true) : 'unknown';

        if ($response = Nevari_Helpers::rate_limit('auth_login_ip', 5, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_login_user', 10, 15 * MINUTE_IN_SECONDS, [$username_key])) {
            return $response;
        }

        if (!$username || !$password) {
            return Nevari_Helpers::error('validation_error', 'Username and password are required.', 422);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            Nevari_Audit::log('security', 'nevari', 'auth.untrusted_frontend', 'error', [
                'severity' => 'warning',
                'error_code' => 'untrusted_frontend',
                'message' => 'Login attempt from an untrusted frontend.',
                'metadata' => [
                    'frontend_type' => $params['frontend_type'] ?? null,
                    'frontend_url' => $params['frontend_url'] ?? null,
                ],
            ]);
            return Nevari_Helpers::error('untrusted_frontend', 'This frontend is not paired with the pharmacy installation.', 403);
        }

        $user = wp_authenticate($username, $password);
        if (is_wp_error($user)) {
            Nevari_Audit::log('security', 'nevari', 'auth.login_failed', 'error', [
                'severity' => 'warning',
                'error_code' => 'invalid_credentials',
                'message' => 'API login failed.',
                'metadata' => ['username' => $username],
            ]);
            return Nevari_Helpers::error('invalid_credentials', 'Invalid username or password.', 401);
        }

        if (!self::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            Nevari_Audit::log('security', 'nevari', 'auth.forbidden_access', 'error', [
                'actor_user_id' => (int) $user->ID,
                'related_user_id' => (int) $user->ID,
                'error_code' => 'role_not_allowed',
                'message' => 'User role is not allowed to access Nevari API.',
            ]);
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }

        $tokens = self::issue_token_pair((int) $user->ID, $frontend);
        Nevari_Audit::log('security', 'nevari', 'auth.login_success', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'API login successful.',
            'metadata' => [
                'frontend_type' => $frontend['frontend_type'],
                'frontend_origin' => $frontend['frontend_origin'],
            ],
        ]);

        return Nevari_Helpers::success([
            'access_token' => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'],
            'expires_in' => $tokens['expires_in'],
            'frontend' => [
                'type' => $frontend['frontend_type'],
                'origin' => $frontend['frontend_origin'],
                'url' => $frontend['frontend_url'],
            ],
            'user' => self::format_user($user),
        ]);
    }

    public static function password_reset(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $username = isset($params['username']) ? sanitize_text_field((string) $params['username']) : '';
        $ip = Nevari_Helpers::client_ip();
        $username_key = $username ? sanitize_user(strtolower($username), true) : 'unknown';

        if ($response = Nevari_Helpers::rate_limit('auth_password_reset_ip', 5, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_password_reset_user', 5, 15 * MINUTE_IN_SECONDS, [$username_key])) {
            return $response;
        }
        if (!$username) {
            return Nevari_Helpers::error('validation_error', 'Username or email is required.', 422);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            return Nevari_Helpers::error('untrusted_frontend', 'This frontend is not paired with the pharmacy installation.', 403);
        }

        $reset_user = self::find_user_by_login_or_email($username);
        if (!$reset_user || !self::user_can_access_frontend($reset_user, (string) $frontend['frontend_type'])) {
            Nevari_Audit::log('security', 'nevari', 'auth.password_reset_requested', 'success', [
                'message' => 'Password reset requested.',
                'metadata' => [
                    'frontend_type' => $frontend['frontend_type'],
                    'frontend_origin' => $frontend['frontend_origin'],
                    'result' => 'ineligible_or_unknown_user',
                ],
            ]);
            return Nevari_Helpers::success(['submitted' => true]);
        }

        $result = retrieve_password($username);
        if (is_wp_error($result)) {
            Nevari_Audit::log('security', 'nevari', 'auth.password_reset_requested', 'success', [
                'message' => 'Password reset requested.',
                'metadata' => [
                    'frontend_type' => $frontend['frontend_type'],
                    'frontend_origin' => $frontend['frontend_origin'],
                    'result' => $result->get_error_code(),
                ],
            ]);
            return Nevari_Helpers::success(['submitted' => true]);
        }

        Nevari_Audit::log('security', 'nevari', 'auth.password_reset_requested', 'success', [
            'message' => 'Password reset requested.',
            'metadata' => [
                'frontend_type' => $frontend['frontend_type'],
                'frontend_origin' => $frontend['frontend_origin'],
            ],
        ]);

        return Nevari_Helpers::success(['submitted' => true]);
    }

    public static function refresh(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $refresh_token = isset($params['refresh_token']) ? sanitize_text_field((string) $params['refresh_token']) : '';
        $ip = Nevari_Helpers::client_ip();
        $token_key = $refresh_token ? substr(hash('sha256', $refresh_token), 0, 16) : 'unknown';

        if ($response = Nevari_Helpers::rate_limit('auth_refresh_ip', 20, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_refresh_token', 10, 15 * MINUTE_IN_SECONDS, [$token_key])) {
            return $response;
        }
        if (!$refresh_token) {
            return Nevari_Helpers::error('validation_error', 'refresh_token is required.', 422);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            return Nevari_Helpers::error('untrusted_frontend', 'This frontend is not paired with the pharmacy installation.', 403);
        }

        $table = Nevari_Helpers::table('refresh_tokens');
        $hash = hash('sha256', $refresh_token);
        $now = Nevari_Helpers::now();
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE token_hash = %s AND revoked_at IS NULL AND expires_at > %s LIMIT 1",
            $hash,
            $now
        ));

        if (!$row) {
            Nevari_Audit::log('security', 'nevari', 'auth.refresh_failed', 'error', [
                'severity' => 'warning',
                'error_code' => 'invalid_refresh_token',
                'message' => 'Refresh token was invalid or expired.',
            ]);
            return Nevari_Helpers::error('invalid_refresh_token', 'Refresh token is invalid or expired.', 401);
        }

        $user = get_user_by('id', (int) $row->user_id);
        if (!$user) {
            return Nevari_Helpers::error('invalid_refresh_token', 'Refresh token user no longer exists.', 401);
        }
        if (!self::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            $wpdb->update($table, ['revoked_at' => $now], ['id' => (int) $row->id], ['%s'], ['%d']);
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }

        $wpdb->update($table, ['revoked_at' => $now], ['id' => (int) $row->id], ['%s'], ['%d']);
        $tokens = self::issue_token_pair((int) $user->ID, $frontend);

        Nevari_Audit::log('security', 'nevari', 'auth.refresh_success', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'Access token refreshed.',
        ]);

        return Nevari_Helpers::success([
            'access_token' => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'],
            'expires_in' => $tokens['expires_in'],
            'frontend' => [
                'type' => $frontend['frontend_type'],
                'origin' => $frontend['frontend_origin'],
                'url' => $frontend['frontend_url'],
            ],
            'user' => self::format_user($user),
        ]);
    }

    public static function logout(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $refresh_token = isset($params['refresh_token']) ? sanitize_text_field((string) $params['refresh_token']) : '';
        $ip = Nevari_Helpers::client_ip();
        $token_key = $refresh_token ? substr(hash('sha256', $refresh_token), 0, 16) : 'unknown';

        if ($response = Nevari_Helpers::rate_limit('auth_logout_ip', 30, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_logout_token', 10, 15 * MINUTE_IN_SECONDS, [$token_key])) {
            return $response;
        }
        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            return Nevari_Helpers::error('untrusted_frontend', 'This frontend is not paired with the pharmacy installation.', 403);
        }
        if ($refresh_token) {
            $row = $wpdb->get_row($wpdb->prepare(
                "SELECT id, user_id FROM " . Nevari_Helpers::table('refresh_tokens') . " WHERE token_hash = %s LIMIT 1",
                hash('sha256', $refresh_token)
            ));
            if ($row) {
                $current_user_id = get_current_user_id();
                if (!$current_user_id || (int) $row->user_id !== $current_user_id) {
                    return Nevari_Helpers::error('forbidden', 'You cannot revoke another user\'s refresh token.', 403);
                }
                $wpdb->update(
                    Nevari_Helpers::table('refresh_tokens'),
                    ['revoked_at' => Nevari_Helpers::now()],
                    ['id' => (int) $row->id],
                    ['%s'],
                    ['%d']
                );
            }
        }
        Nevari_Audit::log('security', 'nevari', 'auth.logout', 'success', [
            'actor_user_id' => get_current_user_id() ?: null,
            'message' => 'API logout requested.',
        ]);
        return Nevari_Helpers::success(['logged_out' => true]);
    }

    public static function me(WP_REST_Request $request): WP_REST_Response {
        $user = wp_get_current_user();
        return Nevari_Helpers::success([
            'user' => self::format_user($user),
            'frontend' => [
                'type' => !empty($_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE']) ? sanitize_key(wp_unslash($_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE'])) : null,
                'origin' => !empty($_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN']) ? sanitize_text_field(wp_unslash($_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN'])) : null,
            ],
        ]);
    }

    private static function issue_token_pair(int $user_id, array $frontend): array {
        global $wpdb;
        $expires_in = (int) apply_filters('nevari_access_token_ttl', 15 * MINUTE_IN_SECONDS);
        $access_token = self::encode_jwt([
            'iss' => site_url(),
            'sub' => $user_id,
            'type' => 'access',
            'aud' => $frontend['frontend_origin'],
            'frontend_type' => $frontend['frontend_type'],
            'frontend_origin' => $frontend['frontend_origin'],
            'iat' => time(),
            'exp' => time() + $expires_in,
        ]);

        $refresh_token = Nevari_Helpers::base64url_encode(random_bytes(32));
        $refresh_ttl = (int) apply_filters('nevari_refresh_token_ttl', 30 * DAY_IN_SECONDS);
        $wpdb->insert(Nevari_Helpers::table('refresh_tokens'), [
            'user_id' => $user_id,
            'token_hash' => hash('sha256', $refresh_token),
            'user_agent' => !empty($_SERVER['HTTP_USER_AGENT']) ? substr(sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])), 0, 1000) : null,
            'ip_address' => !empty($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : null,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $refresh_ttl),
            'revoked_at' => null,
            'created_at' => Nevari_Helpers::now(),
        ], ['%d', '%s', '%s', '%s', '%s', '%s', '%s']);

        return [
            'access_token' => $access_token,
            'refresh_token' => $refresh_token,
            'expires_in' => $expires_in,
        ];
    }

    public static function encode_jwt(array $payload): string {
        $header = ['typ' => 'JWT', 'alg' => 'HS256'];
        $segments = [
            Nevari_Helpers::base64url_encode(wp_json_encode($header)),
            Nevari_Helpers::base64url_encode(wp_json_encode($payload)),
        ];
        $signature = hash_hmac('sha256', implode('.', $segments), Nevari_Helpers::jwt_secret(), true);
        $segments[] = Nevari_Helpers::base64url_encode($signature);
        return implode('.', $segments);
    }

    public static function decode_jwt(string $jwt): ?array {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }
        [$encoded_header, $encoded_payload, $encoded_signature] = $parts;
        $signature = Nevari_Helpers::base64url_decode($encoded_signature);
        $expected = hash_hmac('sha256', $encoded_header . '.' . $encoded_payload, Nevari_Helpers::jwt_secret(), true);
        if (!hash_equals($expected, $signature)) {
            return null;
        }
        $payload = json_decode(Nevari_Helpers::base64url_decode($encoded_payload), true);
        if (!is_array($payload)) {
            return null;
        }
        if (!empty($payload['exp']) && time() > (int) $payload['exp']) {
            return null;
        }
        return $payload;
    }

    private static function user_can_access_frontend($user, string $frontend_type): bool {
        $resolved_user = $user instanceof WP_User ? $user : get_user_by('id', (int) $user);
        if (!$resolved_user) {
            return false;
        }

        if ($frontend_type === 'storefront') {
            return (bool) array_intersect(['administrator', 'shop_manager'], (array) $resolved_user->roles);
        }

        $allowed_roles = ['patient', 'customer', 'doctor', 'store_admin', 'administrator', 'shop_manager'];
        return (bool) array_intersect($allowed_roles, (array) $resolved_user->roles);
    }

    private static function find_user_by_login_or_email(string $username): ?WP_User {
        $user = strpos($username, '@') !== false ? get_user_by('email', $username) : get_user_by('login', $username);
        return $user instanceof WP_User ? $user : null;
    }

    public static function format_user(WP_User $user): array {
        $all_caps = array_keys(array_filter((array) $user->allcaps));
        return [
            'id' => (int) $user->ID,
            'email' => $user->user_email,
            'display_name' => $user->display_name,
            'roles' => array_values((array) $user->roles),
            'capabilities' => array_values(array_filter($all_caps, static function ($cap) {
                return strpos($cap, 'nevari_') === 0 || in_array($cap, ['manage_woocommerce', 'edit_products', 'edit_shop_orders'], true);
            })),
        ];
    }
}
