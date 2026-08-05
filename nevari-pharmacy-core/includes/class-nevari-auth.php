<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Auth {
    private const RESEND_CODE_COOLDOWN_SECONDS = 60;

    private static int $api_session_resolution_depth = 0;

    public static function init(): void {
        add_filter('determine_current_user', [__CLASS__, 'determine_current_user'], 20, 1);
        add_filter('retrieve_password_notification_email', [__CLASS__, 'use_dashboard_native_reset_email'], 20, 4);
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function use_dashboard_native_reset_email(array $email, string $reset_key, string $user_login, WP_User $user): array {
        $frontend_type = self::frontend_type_for_user($user);
        $frontend = $frontend_type ? Nevari_Connections::trusted_frontend_for_type($frontend_type) : null;
        if (!$frontend || !self::user_role_can_access_frontend($user, $frontend_type)) {
            return $email;
        }

        $reset_url = self::dashboard_password_reset_url($frontend, $user, $reset_key);
        if ($reset_url === '') {
            $email['message'] = "A password reset was requested for your Nevari account, but the dashboard reset page is currently unavailable. Please contact support.\r\n";
            return $email;
        }

        $display_name = $user->display_name ?: $user_login;
        $email['subject'] = 'Reset your Nevari dashboard password';
        $email['message'] = sprintf(
            "Hello %1\$s,\r\n\r\nUse this dashboard link to reset your password:\r\n%2\$s\r\n\r\nIf you did not request this, you can ignore this email.\r\n",
            $display_name,
            $reset_url
        );
        return $email;
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/login', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'login'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/google-config', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'google_config'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/google-login', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'google_login'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/verify-code', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'verify_code'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/resend-code', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'resend_code'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/request-verification-code', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'request_verification_code'],
            'permission_callback' => [__CLASS__, 'api_session_required'],
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/password-reset/confirm', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'password_reset_confirm'],
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

    public static function is_resolving_api_session_user(): bool {
        return self::$api_session_resolution_depth > 0;
    }

    public static function api_session_user_id(): int {
        if (self::is_resolving_api_session_user()) {
            return 0;
        }
        self::$api_session_resolution_depth++;
        try {
            $token = Nevari_Helpers::get_bearer_token();
            if (!$token) {
                return 0;
            }
            $payload = self::decode_jwt($token);
            if (!$payload || empty($payload['sub']) || empty($payload['type']) || $payload['type'] !== 'access') {
                Nevari_Audit::log('security', 'nevari', 'auth.invalid_token', 'error', [
                    'actor_user_id' => 0,
                    'severity' => 'warning',
                    'error_code' => 'invalid_token',
                    'message' => 'Invalid bearer token used.',
                ]);
                return 0;
            }
            if (!Nevari_Connections::validate_token_context($payload)) {
                Nevari_Audit::log('security', 'nevari', 'auth.invalid_frontend_context', 'error', [
                    'actor_user_id' => 0,
                    'severity' => 'warning',
                    'error_code' => 'invalid_frontend_context',
                    'message' => 'Access token was used from an untrusted frontend context.',
                ]);
                return 0;
            }
            if (class_exists('Nevari_SSO') && !Nevari_SSO::is_session_family_active(self::session_family_from_payload($payload))) {
                Nevari_Audit::log('security', 'nevari', 'auth.revoked_session_family', 'error', [
                    'actor_user_id' => !empty($payload['sub']) ? (int) $payload['sub'] : 0,
                    'severity' => 'warning',
                    'error_code' => 'session_family_revoked',
                    'message' => 'Access token was used after the session family had been revoked.',
                ]);
                return 0;
            }
            if (!self::user_can_access_frontend((int) $payload['sub'], (string) $payload['frontend_type'])) {
                return 0;
            }
            return (int) $payload['sub'];
        } finally {
            self::$api_session_resolution_depth = max(0, self::$api_session_resolution_depth - 1);
        }
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
            $frontend_error = Nevari_Connections::request_authorization_error();
            Nevari_Audit::log('security', 'nevari', 'auth.untrusted_frontend', 'error', [
                'severity' => 'warning',
                'error_code' => $frontend_error['code'] ?? 'untrusted_frontend',
                'message' => $frontend_error['message'] ?? 'Login attempt from an untrusted frontend.',
                'metadata' => [
                    'frontend_type' => $params['frontend_type'] ?? null,
                    'frontend_url' => $params['frontend_url'] ?? null,
                ],
            ]);
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
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

        return self::complete_authenticated_session($user, $frontend, $params, [
            'verification_action' => 'auth.verification_code_sent',
            'verification_message' => 'Login verification code sent.',
            'success_action' => 'auth.login_success',
            'success_message' => 'API login successful.',
            'issued_for' => 'direct_login',
        ]);
    }

    public static function google_config(WP_REST_Request $request): WP_REST_Response {
        $params = $request->get_params();
        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $client_id = self::google_signin_client_id();
        return Nevari_Helpers::success([
            'enabled' => $client_id !== '',
            'client_id' => $client_id,
        ]);
    }

    public static function google_login(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $credential = isset($params['credential']) ? sanitize_text_field((string) $params['credential']) : '';
        $ip = Nevari_Helpers::client_ip();

        if ($response = Nevari_Helpers::rate_limit('auth_google_login_ip', 12, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if (!$credential) {
            return Nevari_Helpers::error('validation_error', 'Google credential is required.', 422);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $google_payload = self::verify_google_id_token($credential);
        if (is_wp_error($google_payload)) {
            return Nevari_Helpers::error($google_payload->get_error_code(), $google_payload->get_error_message(), 401);
        }

        $email = sanitize_email((string) ($google_payload['email'] ?? ''));
        if (!$email || !is_email($email)) {
            return Nevari_Helpers::error('google_email_missing', 'Google did not return a valid email address.', 401);
        }

        $user = get_user_by('email', $email);
        if (!$user && (string) $frontend['frontend_type'] === 'patient_dashboard') {
            $given_name = sanitize_text_field((string) ($google_payload['given_name'] ?? ''));
            $family_name = sanitize_text_field((string) ($google_payload['family_name'] ?? ''));
            $display_name = self::preferred_customer_display_name($given_name, $family_name, $email);
            $email_parts = explode('@', $email);
            $user_id = wp_insert_user([
                'user_login' => sanitize_user($email_parts[0] . '_' . wp_generate_password(4, false)),
                'user_email' => $email,
                'user_pass' => wp_generate_password(32, true),
                'display_name' => $display_name,
                'first_name' => $given_name,
                'last_name' => $family_name,
                'role' => 'customer',
            ]);
            if (is_wp_error($user_id)) {
                return Nevari_Helpers::error('customer_create_failed', $user_id->get_error_message(), 400);
            }
            update_user_meta((int) $user_id, 'billing_email', $email);
            $user = get_user_by('id', (int) $user_id);
        }

        if (!$user || !self::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            Nevari_Audit::log('security', 'nevari', 'auth.google_forbidden', 'error', [
                'severity' => 'warning',
                'error_code' => 'role_not_allowed',
                'message' => 'Google login was blocked because the user is not allowed for the requested frontend.',
                'metadata' => [
                    'email_hash' => hash('sha256', strtolower($email)),
                    'frontend_type' => $frontend['frontend_type'],
                ],
            ]);
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }

        self::store_google_profile($user, $google_payload);
        return self::complete_authenticated_session($user, $frontend, $params, [
            'verification_action' => 'auth.verification_code_sent',
            'verification_message' => 'Google login verification code sent.',
            'success_action' => 'auth.google_login_success',
            'success_message' => 'Google login successful.',
            'issued_for' => 'google_login',
            'source_app' => 'google_login',
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
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
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
        $sso_transaction_id = isset($params['sso_transaction_id']) ? sanitize_text_field((string) $params['sso_transaction_id']) : '';
        $issue_context = class_exists('Nevari_SSO') && $sso_transaction_id !== ''
            ? Nevari_SSO::consume_dashboard_verification_context($sso_transaction_id, (int) $user->ID, $frontend)
            : [];
        if (is_wp_error($issue_context)) {
            return Nevari_Helpers::error($issue_context->get_error_code(), $issue_context->get_error_message(), 403);
        }
        return self::build_authenticated_success_response($user, $frontend, $params, is_array($issue_context) ? $issue_context : [], [
            'success_action' => 'auth.login_success',
            'success_message' => 'API login successful after email verification.',
            'issued_for' => 'verified_login',
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
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $reset_user = self::find_user_by_login_or_email($username);
        if ($reset_user instanceof WP_User && self::user_can_access_frontend($reset_user, (string) $frontend['frontend_type'])) {
            $reset_key = get_password_reset_key($reset_user);
            if (!is_wp_error($reset_key)) {
                $email_result = self::send_dashboard_password_reset_email($reset_user, self::dashboard_password_reset_url($frontend, $reset_user, (string) $reset_key));
                if (is_wp_error($email_result)) {
                    Nevari_Audit::log('emails', 'nevari', 'auth.password_reset_notification_failed', 'error', [
                        'related_user_id' => (int) $reset_user->ID,
                        'message' => 'Password reset email could not be queued.',
                        'error_code' => sanitize_key($email_result->get_error_code()),
                        'metadata' => ['frontend_type' => sanitize_key((string) $frontend['frontend_type'])],
                    ]);
                }
            } else {
                Nevari_Audit::log('security', 'nevari', 'auth.password_reset_key_failed', 'error', [
                    'related_user_id' => (int) $reset_user->ID,
                    'message' => 'Password reset key could not be created.',
                    'error_code' => sanitize_key($reset_key->get_error_code()),
                    'metadata' => ['frontend_type' => sanitize_key((string) $frontend['frontend_type'])],
                ]);
            }
        }

        Nevari_Audit::log('security', 'nevari', 'auth.password_reset_requested', 'success', [
            'message' => 'Password reset requested.',
            'metadata' => [
                'frontend_type' => $frontend['frontend_type'],
                'frontend_origin' => $frontend['frontend_origin'],
                'username_hash' => hash('sha256', strtolower($username)),
            ],
        ]);

        return Nevari_Helpers::success([
            'message' => 'If an account exists for that username, a password reset link has been sent.',
        ]);
    }

    public static function password_reset_confirm(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $login = isset($params['login']) ? sanitize_text_field((string) $params['login']) : '';
        $key = isset($params['key']) ? sanitize_text_field((string) $params['key']) : '';
        $password = isset($params['password']) ? (string) $params['password'] : '';
        $ip = Nevari_Helpers::client_ip();

        if ($response = Nevari_Helpers::rate_limit('auth_password_reset_confirm_ip', 5, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_password_reset_confirm_login', 5, 15 * MINUTE_IN_SECONDS, [sanitize_user(strtolower($login), true) ?: 'unknown'])) {
            return $response;
        }
        if ($login === '' || $key === '' || $password === '') {
            return Nevari_Helpers::error('validation_error', 'Login, reset key, and password are required.', 422);
        }
        if (strlen($password) < 8) {
            return Nevari_Helpers::error('validation_error', 'Password must be at least 8 characters.', 422, ['field' => 'password']);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $user = check_password_reset_key($key, $login);
        if (is_wp_error($user) || !($user instanceof WP_User)) {
            return Nevari_Helpers::error('invalid_reset_link', 'This password reset link is invalid or has expired.', 400);
        }
        if (!self::user_role_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }

        reset_password($user, $password);
        clean_user_cache($user);

        $first_name = (string) get_user_meta((int) $user->ID, 'first_name', true);
        $last_name = (string) get_user_meta((int) $user->ID, 'last_name', true);
        $display_name = self::preferred_customer_display_name($first_name, $last_name, (string) $user->user_email);
        if ($display_name !== '' && strtolower(trim((string) $user->display_name)) === 'customer') {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $display_name]);
        }

        Nevari_Audit::log('security', 'nevari', 'auth.password_reset_confirmed', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'Password reset completed from dashboard reset flow.',
            'metadata' => [
                'frontend_type' => $frontend['frontend_type'],
                'frontend_origin' => $frontend['frontend_origin'],
            ],
        ]);

        self::send_password_changed_notification($user, $frontend);

        return Nevari_Helpers::success([
            'message' => 'Password reset successful.',
        ]);
    }

    public static function register_customer(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $ip = Nevari_Helpers::client_ip();
        if ($response = Nevari_Helpers::rate_limit('auth_register_ip', 10, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend || $frontend['frontend_type'] !== 'patient_dashboard') {
            return Nevari_Helpers::error('forbidden', 'Customer registration is available only from the customer dashboard.', 403);
        }

        $email = isset($params['email']) ? sanitize_email((string) $params['email']) : '';
        $first_name = isset($params['first_name']) ? sanitize_text_field((string) $params['first_name']) : '';
        $last_name = isset($params['last_name']) ? sanitize_text_field((string) $params['last_name']) : '';
        $password = isset($params['password']) ? (string) $params['password'] : '';
        $display_name = self::preferred_customer_display_name($first_name, $last_name, $email);

        if (!$email || !is_email($email) || strlen($password) < 8) {
            return Nevari_Helpers::error('validation_error', 'A valid email and an 8+ character password are required.', 422);
        }
        if ($response = Nevari_Helpers::rate_limit('auth_register_email', 5, HOUR_IN_SECONDS, [strtolower($email)])) {
            return $response;
        }
        if (email_exists($email)) {
            Nevari_Audit::log('security', 'nevari', 'auth.customer_registration_submitted', 'success', [
                'message' => 'Customer registration request processed.',
                'metadata' => ['result' => 'existing_account'],
            ]);
            return Nevari_Helpers::success(['created' => true], [], 201);
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

        $user = get_user_by('id', (int) $user_id);
        if (!$user instanceof WP_User) {
            return Nevari_Helpers::error('customer_create_failed', 'The customer account could not be loaded after registration.', 500);
        }

        Nevari_Audit::log('security', 'nevari', 'auth.customer_registered', 'success', [
            'related_user_id' => (int) $user_id,
            'message' => 'Customer self-registration completed.',
        ]);

        return self::complete_authenticated_session($user, $frontend, $params, [
            'verification_action' => 'auth.verification_code_sent',
            'verification_message' => 'Registration verification code sent.',
            'success_action' => 'auth.customer_registered',
            'success_message' => 'Customer self-registration completed.',
            'issued_for' => 'customer_registration',
            'source_app' => 'customer_registration',
            'status' => 201,
        ]);
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
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
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
        if (class_exists('Nevari_SSO') && !Nevari_SSO::is_session_family_active(isset($row->session_family_uuid) ? (string) $row->session_family_uuid : '')) {
            $wpdb->update($table, ['revoked_at' => $now], ['id' => (int) $row->id], ['%s'], ['%d']);
            return Nevari_Helpers::error('session_revoked', 'Your session has expired. Please sign in again.', 401);
        }
        if (!self::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            $wpdb->update($table, ['revoked_at' => $now], ['id' => (int) $row->id], ['%s'], ['%d']);
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }
        if (!empty($row->frontend_type) && (string) $row->frontend_type !== (string) $frontend['frontend_type']) {
            $wpdb->update($table, ['revoked_at' => $now], ['id' => (int) $row->id], ['%s'], ['%d']);
            return Nevari_Helpers::error('invalid_refresh_token', 'Refresh token context is invalid.', 401);
        }
        if (!empty($row->frontend_origin) && (string) $row->frontend_origin !== (string) $frontend['frontend_origin']) {
            $wpdb->update($table, ['revoked_at' => $now], ['id' => (int) $row->id], ['%s'], ['%d']);
            return Nevari_Helpers::error('invalid_refresh_token', 'Refresh token context is invalid.', 401);
        }

        $wpdb->update($table, ['revoked_at' => $now], ['id' => (int) $row->id], ['%s'], ['%d']);
        $tokens = self::issue_token_pair((int) $user->ID, $frontend, [
            'session_family_uuid' => isset($row->session_family_uuid) ? (string) $row->session_family_uuid : '',
            'issued_for' => 'refresh',
        ]);

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
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }
        $current_payload = self::current_token_payload();
        $session_family_uuid = self::session_family_from_payload($current_payload);
        if ($refresh_token) {
            $row = $wpdb->get_row($wpdb->prepare(
                "SELECT id, user_id, session_family_uuid FROM " . Nevari_Helpers::table('refresh_tokens') . " WHERE token_hash = %s LIMIT 1",
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
                if (!$session_family_uuid && !empty($row->session_family_uuid)) {
                    $session_family_uuid = (string) $row->session_family_uuid;
                }
            }
        }
        if (class_exists('Nevari_SSO') && $session_family_uuid !== '') {
            Nevari_SSO::revoke_session_family($session_family_uuid, [
                'actor_user_id' => get_current_user_id() ?: null,
                'reason' => 'api_logout',
            ]);
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

    public static function resend_code(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $challenge_id = isset($params['challenge_id']) ? sanitize_text_field((string) $params['challenge_id']) : '';
        $ip = Nevari_Helpers::client_ip();

        if ($response = Nevari_Helpers::rate_limit('auth_resend_ip', 5, 15 * MINUTE_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('auth_resend_challenge', 3, 15 * MINUTE_IN_SECONDS, [$challenge_id ?: 'unknown'])) {
            return $response;
        }
        if (!$challenge_id) {
            return Nevari_Helpers::error('validation_error', 'challenge_id is required.', 422);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
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

        $created_at = strtotime((string) $row->created_at . ' UTC');
        $elapsed = $created_at ? max(0, time() - $created_at) : self::RESEND_CODE_COOLDOWN_SECONDS;
        if ($elapsed < self::RESEND_CODE_COOLDOWN_SECONDS) {
            $retry_after = self::RESEND_CODE_COOLDOWN_SECONDS - $elapsed;
            return Nevari_Helpers::error(
                'verification_resend_cooldown',
                sprintf('Please wait %d seconds before requesting another code.', $retry_after),
                429,
                ['retry_after' => $retry_after]
            );
        }

        $user = get_user_by('id', (int) $row->user_id);
        if (!$user || !self::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }

        $challenge = self::create_login_challenge($user, $frontend);
        if (is_wp_error($challenge)) {
            return Nevari_Helpers::error($challenge->get_error_code(), $challenge->get_error_message(), 500);
        }

        $wpdb->update($table, ['consumed_at' => Nevari_Helpers::now()], ['id' => (int) $row->id], ['%s'], ['%d']);

        Nevari_Audit::log('security', 'nevari', 'auth.verification_code_resent', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'Login verification code resent.',
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
            'resend_cooldown' => self::RESEND_CODE_COOLDOWN_SECONDS,
        ]);
    }

    public static function request_verification_code(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $user_id = self::api_session_user_id();
        $user = $user_id ? get_user_by('id', $user_id) : null;
        if (!$user || !self::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            return Nevari_Helpers::error('forbidden', 'Unauthorized user', 403);
        }

        $challenge = self::create_login_challenge($user, $frontend);
        if (is_wp_error($challenge)) {
            return Nevari_Helpers::error($challenge->get_error_code(), $challenge->get_error_message(), 500);
        }

        Nevari_Audit::log('security', 'nevari', 'auth.verification_code_requested', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'Verification code requested for protected storefront action.',
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
            'resend_cooldown' => self::RESEND_CODE_COOLDOWN_SECONDS,
        ]);
    }

    private static function complete_authenticated_session(WP_User $user, array $frontend, array $params, array $options = []): WP_REST_Response {
        if (self::login_requires_email_verification($frontend)) {
            $challenge = self::create_login_challenge($user, $frontend);
            if (is_wp_error($challenge)) {
                return Nevari_Helpers::error($challenge->get_error_code(), $challenge->get_error_message(), 500);
            }

            Nevari_Audit::log('security', 'nevari', $options['verification_action'] ?? 'auth.verification_code_sent', 'success', [
                'actor_user_id' => (int) $user->ID,
                'related_user_id' => (int) $user->ID,
                'message' => $options['verification_message'] ?? 'Verification code sent.',
                'metadata' => [
                    'frontend_type' => $frontend['frontend_type'],
                    'frontend_origin' => $frontend['frontend_origin'],
                ],
            ]);

            return Nevari_Helpers::success([
                'verification_required' => true,
                'challenge_id' => $challenge['challenge_id'],
                'masked_email' => self::mask_email((string) $user->user_email),
                'sso_transaction_id' => isset($params['sso_transaction_id']) ? sanitize_text_field((string) $params['sso_transaction_id']) : '',
                'expires_in' => $challenge['expires_in'],
                'resend_cooldown' => self::RESEND_CODE_COOLDOWN_SECONDS,
            ], [], (int) ($options['status'] ?? 200));
        }

        return self::build_authenticated_success_response($user, $frontend, $params, [
            'issued_for' => sanitize_key((string) ($options['issued_for'] ?? 'direct_login')),
            'source_app' => sanitize_key((string) ($options['source_app'] ?? ($options['issued_for'] ?? 'direct_login'))),
        ], $options);
    }

    private static function build_authenticated_success_response(WP_User $user, array $frontend, array $params, array $issue_context = [], array $options = []): WP_REST_Response {
        $tokens = self::issue_token_pair((int) $user->ID, $frontend, $issue_context);

        $payload = [
            'access_token' => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'],
            'expires_in' => $tokens['expires_in'],
            'frontend' => [
                'type' => $frontend['frontend_type'],
                'origin' => $frontend['frontend_origin'],
                'url' => $frontend['frontend_url'],
            ],
            'user' => self::format_user($user),
        ];

        if (class_exists('Nevari_SSO')) {
            $wordpress_sso = Nevari_SSO::maybe_issue_wordpress_auth_code($user, $frontend, array_merge($params, [
                'session_family_uuid' => $tokens['session_family'] ?? '',
            ]));
            if (is_wp_error($wordpress_sso)) {
                return Nevari_Helpers::error($wordpress_sso->get_error_code(), $wordpress_sso->get_error_message(), 403);
            }
            if (is_array($wordpress_sso) && !empty($wordpress_sso['redirect_url'])) {
                $payload['redirect_url'] = (string) $wordpress_sso['redirect_url'];
                $payload['sso_exchange_required'] = true;
            }
        }

        Nevari_Audit::log('security', 'nevari', $options['success_action'] ?? 'auth.login_success', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => $options['success_message'] ?? 'Authentication successful.',
            'metadata' => [
                'frontend_type' => $frontend['frontend_type'],
                'frontend_origin' => $frontend['frontend_origin'],
            ],
        ]);

        self::send_dashboard_login_notification($user, $frontend);

        return Nevari_Helpers::success($payload, [], (int) ($options['status'] ?? 200));
    }

    public static function send_dashboard_login_notification(WP_User $user, array $frontend): void {
        $frontend_type = sanitize_key((string) ($frontend['frontend_type'] ?? 'dashboard'));
        $dashboard_labels = [
            'patient_dashboard' => 'Patient dashboard',
            'doctors_dashboard' => 'Doctor dashboard',
            'pharmacist_dashboard' => 'Pharmacist dashboard',
            'storefront' => 'Storefront dashboard',
        ];
        $dashboard_label = $dashboard_labels[$frontend_type] ?? 'Nevari dashboard';
        $login_time = wp_date('F j, Y \a\t g:i a T');
        $ip_address = sanitize_text_field(Nevari_Helpers::client_ip());
        $user_agent = isset($_SERVER['HTTP_USER_AGENT'])
            ? substr(sanitize_text_field(wp_unslash((string) $_SERVER['HTTP_USER_AGENT'])), 0, 255)
            : 'Unavailable';
        $display_name = $user->display_name ?: $user->user_login;
        $support_email = sanitize_email((string) get_option('admin_email'));

        $result = Nevari_Emails::queue_or_send([
            'recipient_user_id' => (int) $user->ID,
            'recipient_email' => $user->user_email,
            'subject' => 'New sign-in to your Nevari dashboard',
            'body_html' => sprintf(
                '<p>Hello %1$s,</p><p>A successful sign-in to your %2$s was recorded.</p><p><strong>Time:</strong> %3$s<br><strong>IP address:</strong> %4$s<br><strong>Device:</strong> %5$s</p><p>If this was not you, reset your password immediately%6$s.</p>',
                esc_html($display_name),
                esc_html($dashboard_label),
                esc_html($login_time),
                esc_html($ip_address ?: 'Unavailable'),
                esc_html($user_agent),
                $support_email ? ' and contact us at ' . esc_html($support_email) : ''
            ),
            'body_text' => sprintf(
                "Hello %1$s,\n\nA successful sign-in to your %2$s was recorded.\n\nTime: %3$s\nIP address: %4$s\nDevice: %5$s\n\nIf this was not you, reset your password immediately%6$s.",
                $display_name,
                $dashboard_label,
                $login_time,
                $ip_address ?: 'Unavailable',
                $user_agent,
                $support_email ? ' and contact us at ' . $support_email : ''
            ),
            'related_object_type' => 'dashboard_login',
            'related_object_id' => (int) $user->ID,
        ], true);

        if (is_wp_error($result)) {
            Nevari_Audit::log('emails', 'nevari', 'auth.login_notification_failed', 'error', [
                'related_user_id' => (int) $user->ID,
                'message' => 'Dashboard login succeeded, but its security notification could not be queued.',
                'error_code' => sanitize_key($result->get_error_code()),
                'metadata' => ['frontend_type' => $frontend_type],
            ]);
        }
    }

    public static function frontend_requires_email_verification(string $frontend_type): bool {
        return $frontend_type === 'storefront';
    }

    private static function login_requires_email_verification(array $frontend): bool {
        $frontend_type = (string) ($frontend['frontend_type'] ?? '');
        if (!self::frontend_requires_email_verification($frontend_type)) {
            return false;
        }

        if ($frontend_type !== 'storefront') {
            return true;
        }

        $frontend_url = strtolower((string) ($frontend['frontend_url'] ?? ''));
        $frontend_origin = strtolower((string) ($frontend['frontend_origin'] ?? ''));
        if (
            strpos($frontend_url, '/admin/storefront') !== false
            || strpos($frontend_origin, 'dash.nevarihealth.com') !== false
        ) {
            return false;
        }

        return true;
    }

    public static function create_login_challenge(WP_User $user, array $frontend) {
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

    public static function user_can_access_frontend($user, string $frontend_type): bool {
        $resolved_user = $user instanceof WP_User ? $user : get_user_by('id', (int) $user);
        if (!$resolved_user) {
            return false;
        }

        if (class_exists('Nevari_User_Governance') && !Nevari_User_Governance::can_authenticate((int) $resolved_user->ID)) {
            return false;
        }

        return self::user_role_can_access_frontend($resolved_user, $frontend_type);
    }

    private static function user_role_can_access_frontend($user, string $frontend_type): bool {
        $resolved_user = $user instanceof WP_User ? $user : get_user_by('id', (int) $user);
        if (!$resolved_user) {
            return false;
        }

        if ($frontend_type === 'storefront') {
            return (bool) array_intersect(['administrator', 'shop_manager', 'store_admin', 'nurse'], (array) $resolved_user->roles);
        }

        if ($frontend_type === 'doctors_dashboard') {
            return in_array('doctor', (array) $resolved_user->roles, true);
        }
        if ($frontend_type === 'pharmacist_dashboard') {
            return in_array('pharmacist', (array) $resolved_user->roles, true);
        }

        if ($frontend_type === 'patient_dashboard') {
            return (bool) array_intersect(['patient', 'customer', 'subscriber'], (array) $resolved_user->roles);
        }

        return false;
    }

    public static function preferred_customer_display_name(string $first_name, string $last_name, string $email): string {
        $normalized_last_name = sanitize_text_field($last_name);
        if ($normalized_last_name !== '') {
            return $normalized_last_name;
        }

        $normalized_first_name = sanitize_text_field($first_name);
        if ($normalized_first_name !== '') {
            return $normalized_first_name;
        }

        return self::email_local_part($email);
    }

    private static function email_local_part(string $email): string {
        $normalized_email = sanitize_email($email);
        if (!$normalized_email || strpos($normalized_email, '@') === false) {
            return '';
        }
        [$local] = explode('@', $normalized_email, 2);
        return sanitize_text_field((string) preg_replace('/[._-]+/', ' ', $local));
    }

    public static function request_dashboard_password_reset_for_user(WP_User $user) {
        $frontend_type = self::frontend_type_for_user($user);
        $frontend = $frontend_type ? Nevari_Connections::trusted_frontend_for_type($frontend_type) : null;
        if (!$frontend || !self::user_role_can_access_frontend($user, $frontend_type)) {
            return new WP_Error('reset_frontend_unavailable', 'A dashboard reset destination is not available for this user.');
        }

        $reset_key = get_password_reset_key($user);
        if (is_wp_error($reset_key)) {
            return $reset_key;
        }

        $reset_url = self::dashboard_password_reset_url($frontend, $user, (string) $reset_key);
        $result = self::send_dashboard_password_reset_email($user, $reset_url);
        if (is_wp_error($result)) {
            return $result;
        }
        $delivery_status = '';
        if (is_numeric($result)) {
            global $wpdb;
            $delivery_status = (string) $wpdb->get_var($wpdb->prepare(
                'SELECT status FROM ' . Nevari_Helpers::table('email_logs') . ' WHERE id = %d',
                (int) $result
            ));
        }

        return [
            'frontend_type' => $frontend_type,
            'queued' => $delivery_status !== 'failed',
            'warning' => $delivery_status === 'failed' ? 'The reset request was recorded, but the email could not be delivered.' : '',
        ];
    }

    private static function frontend_type_for_user(WP_User $user): string {
        $roles = (array) $user->roles;
        if (in_array('doctor', $roles, true)) {
            return 'doctors_dashboard';
        }
        if (in_array('pharmacist', $roles, true)) {
            return 'pharmacist_dashboard';
        }
        if (array_intersect(['administrator', 'shop_manager', 'store_admin', 'nurse'], $roles)) {
            return 'storefront';
        }
        if (array_intersect(['patient', 'customer', 'subscriber'], $roles)) {
            return 'patient_dashboard';
        }
        return '';
    }

    private static function dashboard_password_reset_url(array $frontend, WP_User $user, string $reset_key): string {
        $frontend_type = sanitize_key((string) ($frontend['frontend_type'] ?? ''));
        $trusted_frontend = $frontend_type ? Nevari_Connections::trusted_frontend_for_type($frontend_type) : null;
        $origin = $trusted_frontend ? untrailingslashit((string) ($trusted_frontend['frontend_origin'] ?? '')) : '';
        if ($origin === '' || !wp_http_validate_url($origin) || in_array($origin, [untrailingslashit(home_url()), untrailingslashit(site_url())], true)) {
            return '';
        }
        return $origin . '/reset-password?' . http_build_query([
            'login' => $user->user_login,
            'key' => $reset_key,
            'frontend_type' => $frontend_type,
        ]);
    }

    private static function send_dashboard_password_reset_email(WP_User $user, string $reset_url) {
        if ($reset_url === '' || !wp_http_validate_url($reset_url) || strpos($reset_url, '/reset-password?') === false) {
            return new WP_Error('reset_frontend_unavailable', 'The dashboard password reset destination is unavailable.');
        }
        $display_name = self::preferred_customer_display_name(
            (string) get_user_meta((int) $user->ID, 'first_name', true),
            (string) get_user_meta((int) $user->ID, 'last_name', true),
            (string) $user->user_email
        ) ?: $user->user_login;

        return Nevari_Emails::queue_or_send([
            'recipient_user_id' => (int) $user->ID,
            'recipient_email' => $user->user_email,
            'subject' => 'Reset your Nevari dashboard password',
            'body_html' => sprintf(
                '<p>Hello %1$s,</p><p>We received a request to reset your password.</p><p><a href="%2$s">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>',
                esc_html($display_name),
                esc_url($reset_url)
            ),
            'body_text' => sprintf("Hello %1$s,\n\nUse this link to reset your password:\n%2$s\n\nIf you did not request this, you can ignore this email.", $display_name, $reset_url),
            'related_object_type' => 'password_reset',
            'related_object_id' => (int) $user->ID,
        ], true);
    }

    private static function send_password_changed_notification(WP_User $user, array $frontend): void {
        $display_name = $user->display_name ?: $user->user_login;
        $changed_at = wp_date('F j, Y \a\t g:i a T');
        $support_email = sanitize_email((string) get_option('admin_email'));
        $result = Nevari_Emails::queue_or_send([
            'recipient_user_id' => (int) $user->ID,
            'recipient_email' => $user->user_email,
            'subject' => 'Your Nevari password was changed',
            'body_html' => sprintf(
                '<p>Hello %1$s,</p><p>Your Nevari dashboard password was changed on %2$s.</p><p>If you did not make this change, contact us immediately%3$s.</p>',
                esc_html($display_name),
                esc_html($changed_at),
                $support_email ? ' at ' . esc_html($support_email) : ''
            ),
            'body_text' => sprintf(
                "Hello %1$s,\n\nYour Nevari dashboard password was changed on %2$s.\n\nIf you did not make this change, contact us immediately%3$s.",
                $display_name,
                $changed_at,
                $support_email ? ' at ' . $support_email : ''
            ),
            'related_object_type' => 'password_change',
            'related_object_id' => (int) $user->ID,
        ], true);
        if (is_wp_error($result)) {
            Nevari_Audit::log('emails', 'nevari', 'auth.password_change_notification_failed', 'error', [
                'related_user_id' => (int) $user->ID,
                'message' => 'Password changed, but its security notification could not be queued.',
                'error_code' => sanitize_key($result->get_error_code()),
                'metadata' => ['frontend_type' => sanitize_key((string) ($frontend['frontend_type'] ?? ''))],
            ]);
        }
    }

    private static function find_user_by_login_or_email(string $username): ?WP_User {
        $user = strpos($username, '@') !== false ? get_user_by('email', $username) : get_user_by('login', $username);
        return $user instanceof WP_User ? $user : null;
    }

    public static function format_user(WP_User $user): array {
        $all_caps = array_keys(array_filter((array) $user->allcaps));
        $avatar_url = esc_url_raw((string) get_user_meta((int) $user->ID, '_nevari_customer_profile_image_url', true));
        if ($avatar_url === '') {
            $avatar_url = esc_url_raw((string) get_user_meta((int) $user->ID, 'nevari_google_picture', true));
        }
        if ($avatar_url === '') {
            $avatar_url = get_avatar_url((int) $user->ID, ['size' => 128]) ?: '';
        }
        $first_name = (string) get_user_meta((int) $user->ID, 'first_name', true);
        $last_name = (string) get_user_meta((int) $user->ID, 'last_name', true);
        $display_name = trim((string) $user->display_name);
        $analytics_uuid = sanitize_text_field((string) get_user_meta((int) $user->ID, 'nevari_analytics_uuid', true));
        if (!preg_match('/^[a-f0-9-]{36}$/i', $analytics_uuid)) {
            $analytics_uuid = wp_generate_uuid4();
            update_user_meta((int) $user->ID, 'nevari_analytics_uuid', $analytics_uuid);
        }
        if ($display_name === '' || strtolower($display_name) === 'customer') {
            $display_name = self::preferred_customer_display_name($first_name, $last_name, (string) $user->user_email);
        }
        return [
            'id' => (int) $user->ID,
            'email' => $user->user_email,
            'display_name' => $display_name,
            'first_name' => $first_name,
            'last_name' => $last_name,
            'avatar_url' => $avatar_url,
            'roles' => array_values((array) $user->roles),
            'capabilities' => array_values(array_filter($all_caps, static function ($cap) {
                return strpos($cap, 'nevari_') === 0 || in_array($cap, ['manage_woocommerce', 'edit_products', 'edit_shop_orders'], true);
            })),
            'storefront_permissions' => class_exists('Nevari_User_Governance')
                ? Nevari_User_Governance::permission_keys_for_user((int) $user->ID)
                : [],
            'analytics_uuid' => $analytics_uuid,
        ];
    }

    private static function google_signin_client_id(): string {
        $settings = Nevari_Helpers::google_meet_oauth_settings();
        $client_id = !empty($settings['client_id']) ? sanitize_text_field((string) $settings['client_id']) : '';
        $client_id = (string) apply_filters('nevari_google_signin_client_id', $client_id);
        return sanitize_text_field($client_id);
    }

    private static function verify_google_id_token(string $credential) {
        $client_id = self::google_signin_client_id();
        if ($client_id === '') {
            return new WP_Error('google_signin_not_configured', 'Google sign-in is not configured.');
        }

        $response = wp_remote_get(add_query_arg(['id_token' => $credential], 'https://oauth2.googleapis.com/tokeninfo'), [
            'timeout' => 10,
        ]);
        if (is_wp_error($response)) {
            return new WP_Error('google_token_verification_failed', $response->get_error_message());
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $payload = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || !is_array($payload)) {
            return new WP_Error('google_token_verification_failed', 'Google credential could not be verified.');
        }

        $audience = isset($payload['aud']) ? sanitize_text_field((string) $payload['aud']) : '';
        $issuer = isset($payload['iss']) ? (string) $payload['iss'] : '';
        $expires_at = isset($payload['exp']) ? (int) $payload['exp'] : 0;
        $email_verified = isset($payload['email_verified'])
            ? filter_var($payload['email_verified'], FILTER_VALIDATE_BOOLEAN)
            : false;

        if (!hash_equals($client_id, $audience)) {
            return new WP_Error('google_token_audience_mismatch', 'Google credential is not intended for this application.');
        }
        if (!in_array($issuer, ['accounts.google.com', 'https://accounts.google.com'], true)) {
            return new WP_Error('google_token_issuer_invalid', 'Google credential issuer is invalid.');
        }
        if ($expires_at > 0 && time() >= $expires_at) {
            return new WP_Error('google_token_expired', 'Google credential has expired.');
        }
        if (!$email_verified) {
            return new WP_Error('google_email_unverified', 'Google account email is not verified.');
        }

        return $payload;
    }

    private static function store_google_profile(WP_User $user, array $payload): void {
        $sub = isset($payload['sub']) ? sanitize_text_field((string) $payload['sub']) : '';
        $picture = isset($payload['picture']) ? esc_url_raw((string) $payload['picture']) : '';
        $given_name = isset($payload['given_name']) ? sanitize_text_field((string) $payload['given_name']) : '';
        $family_name = isset($payload['family_name']) ? sanitize_text_field((string) $payload['family_name']) : '';
        $name = isset($payload['name']) ? sanitize_text_field((string) $payload['name']) : '';

        if ($sub !== '') {
            update_user_meta((int) $user->ID, 'nevari_google_sub', $sub);
        }
        if ($picture !== '') {
            update_user_meta((int) $user->ID, 'nevari_google_picture', $picture);
        }
        if ($given_name !== '' && get_user_meta((int) $user->ID, 'first_name', true) === '') {
            update_user_meta((int) $user->ID, 'first_name', $given_name);
        }
        if ($family_name !== '' && get_user_meta((int) $user->ID, 'last_name', true) === '') {
            update_user_meta((int) $user->ID, 'last_name', $family_name);
        }
        $preferred_display_name = self::preferred_customer_display_name($given_name, $family_name, (string) $user->user_email);
        if ($preferred_display_name !== '' && in_array(strtolower(trim((string) $user->display_name)), ['', 'customer'], true)) {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $preferred_display_name]);
        } elseif ($name !== '' && trim((string) $user->display_name) === '') {
            wp_update_user(['ID' => (int) $user->ID, 'display_name' => $name]);
        }
    }

    public static function current_token_payload(): ?array {
        $token = Nevari_Helpers::get_bearer_token();
        if (!$token) {
            return null;
        }

        $payload = self::decode_jwt($token);
        return is_array($payload) ? $payload : null;
    }

    public static function current_session_family_uuid(): string {
        return self::session_family_from_payload(self::current_token_payload());
    }

    public static function session_family_from_payload(?array $payload): string {
        if (!is_array($payload) || empty($payload['session_family'])) {
            return '';
        }

        return sanitize_text_field((string) $payload['session_family']);
    }

    public static function issue_token_pair(int $user_id, array $frontend, array $options = []): array {
        global $wpdb;
        $expires_in = (int) apply_filters('nevari_access_token_ttl', 15 * MINUTE_IN_SECONDS);
        $session_family_uuid = !empty($options['session_family_uuid'])
            ? sanitize_text_field((string) $options['session_family_uuid'])
            : (class_exists('Nevari_SSO') ? Nevari_SSO::create_session_family($user_id, $frontend, $options) : wp_generate_uuid4());
        $issued_for = !empty($options['issued_for']) ? sanitize_key((string) $options['issued_for']) : 'direct_login';

        $access_token = self::encode_jwt([
            'iss' => site_url(),
            'sub' => $user_id,
            'type' => 'access',
            'aud' => $frontend['frontend_origin'],
            'frontend_type' => $frontend['frontend_type'],
            'frontend_origin' => $frontend['frontend_origin'],
            'session_family' => $session_family_uuid,
            'issued_for' => $issued_for,
            'iat' => time(),
            'exp' => time() + $expires_in,
        ]);

        $refresh_token = Nevari_Helpers::base64url_encode(random_bytes(32));
        $refresh_ttl = (int) apply_filters('nevari_refresh_token_ttl', 30 * DAY_IN_SECONDS);
        $wpdb->insert(Nevari_Helpers::table('refresh_tokens'), [
            'user_id' => $user_id,
            'token_hash' => hash('sha256', $refresh_token),
            'session_family_uuid' => $session_family_uuid,
            'frontend_type' => $frontend['frontend_type'],
            'frontend_origin' => $frontend['frontend_origin'],
            'user_agent' => !empty($_SERVER['HTTP_USER_AGENT']) ? substr(sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])), 0, 1000) : null,
            'ip_address' => Nevari_Helpers::client_ip(),
            'expires_at' => gmdate('Y-m-d H:i:s', time() + $refresh_ttl),
            'revoked_at' => null,
            'created_at' => Nevari_Helpers::now(),
        ], ['%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s']);

        if (class_exists('Nevari_SSO')) {
            Nevari_SSO::touch_last_role($user_id, (string) $frontend['frontend_type']);
        }

        return [
            'access_token' => $access_token,
            'refresh_token' => $refresh_token,
            'expires_in' => $expires_in,
            'session_family' => $session_family_uuid,
        ];
    }
}
