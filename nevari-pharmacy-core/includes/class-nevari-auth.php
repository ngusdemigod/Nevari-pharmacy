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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/verify-code', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'verify_code'],
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/register-customer', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'register_customer'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/logout', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'logout'],
            'permission_callback' => [__CLASS__, 'api_session_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/me', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'me'],
            'permission_callback' => [__CLASS__, 'api_session_required'],
        ]);
    }

    public static function determine_current_user($user_id) {
        $api_user_id = self::api_session_user_id();
        return $api_user_id ?: $user_id;
    }

    public static function api_session_user_id(): int {
        $token = Nevari_Helpers::get_bearer_token();
        if (!$token) {
            return 0;
        }
        $payload = self::decode_jwt($token);
        if (!$payload || empty($payload['sub']) || empty($payload['type']) || $payload['type'] !== 'access') {
            Nevari_Audit::log('security', 'nevari', 'auth.invalid_token', 'error', [
                'severity' => 'warning',
                'error_code' => 'invalid_token',
                'message' => 'Invalid bearer token used.',
            ]);
            return 0;
        }
        if (!Nevari_Connections::validate_token_context($payload)) {
            Nevari_Audit::log('security', 'nevari', 'auth.invalid_frontend_context', 'error', [
                'severity' => 'warning',
                'error_code' => 'invalid_frontend_context',
                'message' => 'Access token was used from an untrusted frontend context.',
            ]);
            return 0;
        }
        if (!self::user_can_access_frontend((int) $payload['sub'], (string) $payload['frontend_type'])) {
            return 0;
        }
        return (int) $payload['sub'];
    }

    public static function api_session_required(): bool {
        return self::api_session_user_id() > 0;
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
                'metadata' => ['username_hash' => hash('sha256', strtolower($username))],
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

        if (self::frontend_requires_email_verification((string) $frontend['frontend_type'])) {
            $challenge = self::issue_login_challenge($user, $frontend);
            if (is_wp_error($challenge)) {
                return Nevari_Helpers::error($challenge->get_error_code(), $challenge->get_error_message(), 500);
            }

            Nevari_Audit::log('security', 'nevari', 'auth.verification_code_sent', 'success', [
                'actor_user_id' => (int) $user->ID,
                'related_user_id' => (int) $user->ID,
                'message' => 'Login verification code sent.',
                'metadata' => [
                    'frontend_type' => $frontend['frontend_type'],
                    'frontend_origin' => $frontend['frontend_origin'],
                ],
            ]);

            return Nevari_Helpers::success([
                'verification_required' => true,
                'challenge_id' => $challenge['challenge_id'],
                'masked_email' => self::mask_email((string) $user->user_email),
                'expires_in' => $challenge['expires_in'],
            ]);
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

    public static function verify_code(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $challenge_id = isset($params['challenge_id']) ? sanitize_text_field((string) $params['challenge_id']) : '';
        $code = isset($params['code']) ? preg_replace('/\D+/', '', (string) $params['code']) : '';
        $ip = Nevari_Helpers::client_ip();

        if ($response = Nevari_Helpers::rate_limit('auth_verify_ip', 10, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_verify_challenge', 5, 15 * MINUTE_IN_SECONDS, [$challenge_id ?: 'unknown'])) {
            return $response;
        }
        if (!$challenge_id || strlen($code) !== 6) {
            return Nevari_Helpers::error('validation_error', 'challenge_id and six-digit code are required.', 422);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            return Nevari_Helpers::error('untrusted_frontend', 'This frontend is not paired with the pharmacy installation.', 403);
        }

        $table = Nevari_Helpers::table('login_challenges');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE challenge_uuid = %s AND consumed_at IS NULL AND expires_at > %s LIMIT 1",
            $challenge_id,
            Nevari_Helpers::now()
        ));
        if (!$row || $row->frontend_type !== $frontend['frontend_type'] || $row->frontend_origin !== $frontend['frontend_origin']) {
            return Nevari_Helpers::error('invalid_verification_code', 'Verification code is invalid or expired.', 401);
        }
        if ((int) $row->attempts >= 5) {
            return Nevari_Helpers::error('verification_locked', 'Verification challenge is locked.', 429);
        }

        $wpdb->update($table, ['attempts' => (int) $row->attempts + 1], ['id' => (int) $row->id], ['%d'], ['%d']);
        if (!hash_equals((string) $row->code_hash, hash('sha256', $code))) {
            Nevari_Audit::log('security', 'nevari', 'auth.verification_failed', 'error', [
                'related_user_id' => (int) $row->user_id,
                'severity' => 'warning',
                'message' => 'Login verification code failed.',
            ]);
            return Nevari_Helpers::error('invalid_verification_code', 'Verification code is invalid or expired.', 401);
        }

        $user = get_user_by('id', (int) $row->user_id);
        if (!$user || !self::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }

        $wpdb->update($table, ['consumed_at' => Nevari_Helpers::now()], ['id' => (int) $row->id], ['%s'], ['%d']);
        $tokens = self::issue_token_pair((int) $user->ID, $frontend);
        Nevari_Audit::log('security', 'nevari', 'auth.login_success', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'API login successful after email verification.',
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

    public static function register_customer(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend || $frontend['frontend_type'] !== 'patient_dashboard') {
            return Nevari_Helpers::error('forbidden', 'Customer registration is available only from the customer dashboard.', 403);
        }

        $email = isset($params['email']) ? sanitize_email((string) $params['email']) : '';
        $first_name = isset($params['first_name']) ? sanitize_text_field((string) $params['first_name']) : '';
        $last_name = isset($params['last_name']) ? sanitize_text_field((string) $params['last_name']) : '';
        $password = isset($params['password']) ? (string) $params['password'] : '';
        $display_name = trim($first_name . ' ' . $last_name);

        if (!$email || !is_email($email) || !$display_name || strlen($password) < 8) {
            return Nevari_Helpers::error('validation_error', 'Valid name, email, and password with at least 8 characters are required.', 422);
        }
        if (email_exists($email)) {
            return Nevari_Helpers::error('email_exists', 'A user with this email already exists.', 409);
        }

        $email_parts = explode('@', $email);
        $user_id = wp_insert_user([
            'user_login' => sanitize_user($email_parts[0] . '_' . wp_generate_password(4, false)),
            'user_email' => $email,
            'user_pass' => $password,
            'display_name' => $display_name,
            'role' => 'customer',
        ]);
        if (is_wp_error($user_id)) {
            return Nevari_Helpers::error('customer_create_failed', $user_id->get_error_message(), 400);
        }

        update_user_meta((int) $user_id, 'first_name', $first_name);
        update_user_meta((int) $user_id, 'last_name', $last_name);
        update_user_meta((int) $user_id, 'billing_first_name', $first_name);
        update_user_meta((int) $user_id, 'billing_last_name', $last_name);
        update_user_meta((int) $user_id, 'billing_email', $email);

        Nevari_Audit::log('security', 'nevari', 'auth.customer_registered', 'success', [
            'related_user_id' => (int) $user_id,
            'message' => 'Customer self-registration completed.',
        ]);

        return Nevari_Helpers::success(['created' => true], [], 201);
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

    private static function frontend_requires_email_verification(string $frontend_type): bool {
        return in_array($frontend_type, ['storefront', 'doctors_dashboard'], true);
    }

    private static function issue_login_challenge(WP_User $user, array $frontend) {
        global $wpdb;
        $code = (string) random_int(100000, 999999);
        $expires_in = 10 * MINUTE_IN_SECONDS;
        $challenge_id = wp_generate_uuid4();
        $inserted = $wpdb->insert(Nevari_Helpers::table('login_challenges'), [
            'challenge_uuid' => $challenge_id,
            'user_id' => (int) $user->ID,
            'frontend_type' => $frontend['frontend_type'],
            'frontend_origin' => $frontend['frontend_origin'],
            'code_hash' => hash('sha256', $code),
            'attempts' => 0,
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $expires_in),
            'consumed_at' => null,
            'created_at' => Nevari_Helpers::now(),
        ], ['%s', '%d', '%s', '%s', '%s', '%d', '%s', '%s', '%s']);
        if (!$inserted) {
            return new WP_Error('verification_challenge_failed', 'Verification code could not be created.');
        }

        $email_id = Nevari_Emails::queue_or_send([
            'template_key' => 'login_verification_code',
            'recipient_user_id' => (int) $user->ID,
            'variables' => [
                'display_name' => $user->display_name ?: $user->user_login,
                'verification_code' => $code,
                'expires_minutes' => 10,
            ],
        ], true);
        if (is_wp_error($email_id)) {
            return $email_id;
        }

        return [
            'challenge_id' => $challenge_id,
            'expires_in' => $expires_in,
        ];
    }

    private static function mask_email(string $email): string {
        if (!is_email($email)) {
            return '';
        }
        [$local, $domain] = explode('@', $email, 2);
        $visible = substr($local, 0, min(2, strlen($local)));
        return $visible . str_repeat('*', max(1, strlen($local) - strlen($visible))) . '@' . $domain;
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

        if ($frontend_type === 'doctors_dashboard') {
            return in_array('doctor', (array) $resolved_user->roles, true);
        }

        if ($frontend_type === 'patient_dashboard') {
            return in_array('customer', (array) $resolved_user->roles, true);
        }

        return false;
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
