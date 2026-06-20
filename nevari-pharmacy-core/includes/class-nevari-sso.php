<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_SSO {
    private const TRANSACTION_TTL_SECONDS = 180;
    private const WORDPRESS_SSO_ACTION = 'nevari_sso_action';
    private const LAST_ROLE_META_KEY = 'nevari_last_frontend_role';
    private const ACTIVE_FAMILY_META_KEY = 'nevari_active_session_family';

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_action('init', [__CLASS__, 'handle_wordpress_sso_request']);
        add_action('wp_logout', [__CLASS__, 'handle_wordpress_logout']);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/sso/dashboard/start', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'start_dashboard_sso'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/sso/dashboard/exchange', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'exchange_dashboard_sso'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/sso/wordpress/start', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'start_wordpress_sso'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/sso/logout', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'global_logout'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/sso/status', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'status'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function create_session_family(int $user_id, array $frontend, array $context = []): string {
        global $wpdb;

        $family_uuid = wp_generate_uuid4();
        $now = Nevari_Helpers::now();
        $wpdb->insert(Nevari_Helpers::table('session_families'), [
            'family_uuid' => $family_uuid,
            'user_id' => $user_id,
            'source_app' => !empty($context['source_app']) ? sanitize_key((string) $context['source_app']) : 'direct_login',
            'frontend_type' => !empty($frontend['frontend_type']) ? sanitize_key((string) $frontend['frontend_type']) : '',
            'frontend_origin' => !empty($frontend['frontend_origin']) ? esc_url_raw((string) $frontend['frontend_origin']) : '',
            'status' => 'active',
            'revoked_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ], ['%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s']);

        update_user_meta($user_id, self::ACTIVE_FAMILY_META_KEY, $family_uuid);

        return $family_uuid;
    }

    public static function is_session_family_active(string $family_uuid): bool {
        if ($family_uuid === '') {
            return true;
        }

        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT status, revoked_at FROM ' . Nevari_Helpers::table('session_families') . ' WHERE family_uuid = %s LIMIT 1',
            $family_uuid
        ));

        if (!$row) {
            return false;
        }

        return (string) $row->status === 'active' && empty($row->revoked_at);
    }

    public static function revoke_session_family(string $family_uuid, array $context = []): bool {
        if ($family_uuid === '') {
            return false;
        }

        global $wpdb;
        $now = Nevari_Helpers::now();
        $wpdb->update(
            Nevari_Helpers::table('session_families'),
            [
                'status' => 'revoked',
                'revoked_at' => $now,
                'updated_at' => $now,
            ],
            ['family_uuid' => $family_uuid],
            ['%s', '%s', '%s'],
            ['%s']
        );
        $wpdb->query($wpdb->prepare(
            'UPDATE ' . Nevari_Helpers::table('refresh_tokens') . ' SET revoked_at = %s WHERE session_family_uuid = %s AND revoked_at IS NULL',
            $now,
            $family_uuid
        ));

        Nevari_Audit::log('security', 'nevari', 'sso.family_revoked', 'success', [
            'actor_user_id' => isset($context['actor_user_id']) ? (int) $context['actor_user_id'] : null,
            'message' => 'SSO session family revoked.',
            'metadata' => [
                'family_uuid' => $family_uuid,
                'reason' => isset($context['reason']) ? sanitize_key((string) $context['reason']) : 'logout',
            ],
        ]);

        return true;
    }

    public static function touch_last_role(int $user_id, string $frontend_type): void {
        if ($user_id <= 0 || !self::is_supported_frontend_type($frontend_type)) {
            return;
        }

        update_user_meta($user_id, self::LAST_ROLE_META_KEY, $frontend_type);
    }

    public static function resolve_target_frontend_type(int $user_id, string $requested = ''): string {
        if (self::is_supported_frontend_type($requested) && Nevari_Auth::user_can_access_frontend($user_id, $requested)) {
            return $requested;
        }

        $last_used = sanitize_key((string) get_user_meta($user_id, self::LAST_ROLE_META_KEY, true));
        if (self::is_supported_frontend_type($last_used) && Nevari_Auth::user_can_access_frontend($user_id, $last_used)) {
            return $last_used;
        }

        foreach (['storefront', 'doctors_dashboard', 'pharmacist_dashboard', 'patient_dashboard'] as $frontend_type) {
            if (Nevari_Auth::user_can_access_frontend($user_id, $frontend_type)) {
                return $frontend_type;
            }
        }

        return '';
    }

    public static function consume_dashboard_verification_context(string $transaction_uuid, int $user_id, array $frontend) {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Nevari_Helpers::table('sso_transactions') . ' WHERE transaction_uuid = %s LIMIT 1',
            $transaction_uuid
        ));

        if (!$row) {
            return new WP_Error('invalid_sso_transaction', 'The SSO transaction is invalid.');
        }
        if ((string) $row->status !== 'consumed' || !empty($row->completed_at)) {
            return new WP_Error('invalid_sso_transaction', 'The SSO transaction is no longer available.');
        }
        if ((int) $row->user_id !== $user_id) {
            return new WP_Error('forbidden', 'The SSO transaction does not belong to this user.');
        }
        if ((string) $row->target_app !== 'dashboard') {
            return new WP_Error('forbidden', 'The SSO transaction target is invalid.');
        }
        if ((string) $row->target_frontend_type !== (string) $frontend['frontend_type']) {
            return new WP_Error('forbidden', 'The SSO transaction frontend is invalid.');
        }
        if ((string) $row->verified_origin !== (string) $frontend['frontend_origin']) {
            return new WP_Error('forbidden', 'The SSO transaction origin is invalid.');
        }
        if (strtotime((string) $row->expires_at . ' UTC') <= time()) {
            return new WP_Error('expired_sso_transaction', 'The SSO transaction has expired.');
        }

        $family_uuid = sanitize_text_field((string) $row->session_family_uuid);
        if ($family_uuid === '') {
            $family_uuid = self::create_session_family($user_id, $frontend, [
                'source_app' => (string) $row->source_app,
            ]);
        }

        $wpdb->update(
            Nevari_Helpers::table('sso_transactions'),
            [
                'status' => 'completed',
                'session_family_uuid' => $family_uuid,
                'completed_at' => Nevari_Helpers::now(),
            ],
            ['id' => (int) $row->id],
            ['%s', '%s', '%s'],
            ['%d']
        );

        self::touch_last_role($user_id, (string) $row->target_frontend_type);

        return [
            'session_family_uuid' => $family_uuid,
            'issued_for' => 'sso_dashboard',
            'source_app' => (string) $row->source_app,
        ];
    }

    public static function start_dashboard_sso(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('sso_start', 20, 15 * MINUTE_IN_SECONDS, [Nevari_Helpers::client_ip()])) {
            return $response;
        }
        $user_id = self::authenticated_user_id();
        if ($user_id <= 0) {
            return Nevari_Helpers::error('forbidden', 'You must be signed in to start SSO.', 401);
        }

        $params = Nevari_Helpers::get_json_params($request);
        $target_frontend = self::resolve_target_frontend_type($user_id, isset($params['target_frontend_type']) ? sanitize_key((string) $params['target_frontend_type']) : '');
        if ($target_frontend === '') {
            return Nevari_Helpers::error('forbidden', 'No permitted dashboard role is available for this user.', 403);
        }

        $frontend = Nevari_Connections::trusted_frontend_for_type($target_frontend);
        if (!$frontend) {
            return Nevari_Helpers::error('untrusted_frontend', 'The dashboard frontend is not authorized for this pharmacy installation.', 403);
        }

        $return_path = self::sanitize_return_path(isset($params['return_path']) ? (string) $params['return_path'] : '');
        $source_app = self::current_source_app();
        $family_uuid = Nevari_Auth::current_session_family_uuid();
        if ($family_uuid === '') {
            $family_uuid = self::create_session_family($user_id, [
                'frontend_type' => $target_frontend,
                'frontend_origin' => (string) $frontend['frontend_origin'],
            ], ['source_app' => $source_app]);
        }

        $transaction = self::create_transaction([
            'source_app' => $source_app,
            'target_app' => 'dashboard',
            'target_frontend_type' => $target_frontend,
            'user_id' => $user_id,
            'verified_origin' => (string) $frontend['frontend_origin'],
            'post_login_path' => $return_path,
            'session_family_uuid' => $family_uuid,
        ]);

        self::touch_last_role($user_id, $target_frontend);

        return Nevari_Helpers::success([
            'transaction_id' => $transaction['transaction_uuid'],
            'state' => $transaction['state'],
            'frontend_type' => $target_frontend,
            'redirect_url' => untrailingslashit((string) $frontend['frontend_origin']) . '/sso/dashboard?transaction=' . rawurlencode($transaction['transaction_uuid']) . '&state=' . rawurlencode($transaction['state']) . '&frontend=' . rawurlencode($target_frontend),
            'expires_in' => self::TRANSACTION_TTL_SECONDS,
        ]);
    }

    public static function exchange_dashboard_sso(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('sso_exchange', 20, 15 * MINUTE_IN_SECONDS, [Nevari_Helpers::client_ip()])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $transaction_uuid = isset($params['transaction_id']) ? sanitize_text_field((string) $params['transaction_id']) : '';
        $state = isset($params['state']) ? sanitize_text_field((string) $params['state']) : '';
        if ($transaction_uuid === '' || $state === '') {
            return Nevari_Helpers::error('validation_error', 'transaction_id and state are required.', 422);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $transaction = self::load_transaction($transaction_uuid);
        if (!$transaction) {
            self::log_sso_failure('sso.exchange_not_found', $transaction_uuid, $frontend, 'The SSO transaction was not found.');
            return Nevari_Helpers::error('invalid_sso_transaction', 'The SSO transaction is invalid or expired.', 401);
        }
        if (!self::validate_transaction_state($transaction, $state)) {
            self::log_sso_failure('sso.exchange_state_mismatch', $transaction_uuid, $frontend, 'The SSO transaction state was invalid.');
            return Nevari_Helpers::error('invalid_sso_transaction', 'The SSO transaction is invalid or expired.', 401);
        }
        if (!self::validate_dashboard_transaction($transaction, $frontend)) {
            self::log_sso_failure('sso.exchange_context_mismatch', $transaction_uuid, $frontend, 'The SSO transaction context was invalid.');
            return Nevari_Helpers::error('invalid_sso_transaction', 'The SSO transaction is invalid or expired.', 401);
        }

        $user = get_user_by('id', (int) $transaction->user_id);
        if (!$user || !Nevari_Auth::user_can_access_frontend($user, (string) $frontend['frontend_type'])) {
            return Nevari_Helpers::error('forbidden', 'Unauthorized user.', 403);
        }

        global $wpdb;
        $wpdb->update(
            Nevari_Helpers::table('sso_transactions'),
            [
                'status' => 'consumed',
                'consumed_at' => Nevari_Helpers::now(),
            ],
            ['id' => (int) $transaction->id],
            ['%s', '%s'],
            ['%d']
        );

        Nevari_Audit::log('security', 'nevari', 'sso.dashboard_exchange', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'Dashboard SSO transaction exchanged successfully.',
            'metadata' => [
                'transaction_uuid' => $transaction_uuid,
                'frontend_type' => $frontend['frontend_type'],
                'frontend_origin' => $frontend['frontend_origin'],
            ],
        ]);

        if (!Nevari_Auth::frontend_requires_email_verification((string) $frontend['frontend_type'])) {
            $issue_context = self::consume_dashboard_verification_context($transaction_uuid, (int) $user->ID, $frontend);
            if (is_wp_error($issue_context)) {
                return Nevari_Helpers::error($issue_context->get_error_code(), $issue_context->get_error_message(), 403);
            }

            $tokens = Nevari_Auth::issue_token_pair((int) $user->ID, $frontend, is_array($issue_context) ? $issue_context : []);
            return Nevari_Helpers::success([
                'access_token' => $tokens['access_token'],
                'refresh_token' => $tokens['refresh_token'],
                'expires_in' => $tokens['expires_in'],
                'frontend' => [
                    'type' => $frontend['frontend_type'],
                    'origin' => $frontend['frontend_origin'],
                    'url' => $frontend['frontend_url'],
                ],
                'user' => Nevari_Auth::format_user($user),
            ]);
        }

        $challenge = Nevari_Auth::create_login_challenge($user, $frontend);
        if (is_wp_error($challenge)) {
            return Nevari_Helpers::error($challenge->get_error_code(), $challenge->get_error_message(), 500);
        }

        return Nevari_Helpers::success([
            'verification_required' => true,
            'challenge_id' => $challenge['challenge_id'],
            'masked_email' => self::mask_email((string) $user->user_email),
            'sso_transaction_id' => $transaction_uuid,
            'frontend_type' => $frontend['frontend_type'],
            'return_path' => !empty($transaction->post_login_path) ? (string) $transaction->post_login_path : self::dashboard_path_for_frontend((string) $frontend['frontend_type']),
            'expires_in' => $challenge['expires_in'],
            'resend_cooldown' => 60,
        ]);
    }

    public static function start_wordpress_sso(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('sso_start', 20, 15 * MINUTE_IN_SECONDS, [Nevari_Helpers::client_ip()])) {
            return $response;
        }
        $user_id = self::authenticated_user_id();
        if ($user_id <= 0) {
            return Nevari_Helpers::error('forbidden', 'You must be signed in to start SSO.', 401);
        }

        $params = Nevari_Helpers::get_json_params($request);
        $source_frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$source_frontend) {
            $frontend_error = Nevari_Connections::request_authorization_error();
            return Nevari_Helpers::error($frontend_error['code'] ?? 'untrusted_frontend', $frontend_error['message'] ?? 'This frontend request is not authorized for the pharmacy installation.', 403);
        }

        $family_uuid = Nevari_Auth::current_session_family_uuid();
        if ($family_uuid === '') {
            $family_uuid = self::create_session_family($user_id, $source_frontend, ['source_app' => 'dashboard']);
        }

        $return_path = self::sanitize_return_path(isset($params['return_path']) ? (string) $params['return_path'] : '');
        $transaction = self::create_transaction([
            'source_app' => 'dashboard',
            'target_app' => 'wordpress',
            'target_frontend_type' => sanitize_key((string) $source_frontend['frontend_type']),
            'user_id' => $user_id,
            'verified_origin' => (string) $source_frontend['frontend_origin'],
            'post_login_path' => $return_path,
            'session_family_uuid' => $family_uuid,
        ]);

        return Nevari_Helpers::success([
            'transaction_id' => $transaction['transaction_uuid'],
            'state' => $transaction['state'],
            'complete_url' => self::wordpress_sso_url([
                'action' => 'wordpress_complete',
                'transaction' => $transaction['transaction_uuid'],
                'state' => $transaction['state'],
            ]),
            'expires_in' => self::TRANSACTION_TTL_SECONDS,
        ]);
    }

    public static function global_logout(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('sso_logout', 20, 15 * MINUTE_IN_SECONDS, [Nevari_Helpers::client_ip()])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $refresh_token = isset($params['refresh_token']) ? sanitize_text_field((string) $params['refresh_token']) : '';
        $family_uuid = Nevari_Auth::current_session_family_uuid();

        if ($family_uuid === '' && $refresh_token !== '') {
            global $wpdb;
            $row = $wpdb->get_row($wpdb->prepare(
                'SELECT session_family_uuid, user_id FROM ' . Nevari_Helpers::table('refresh_tokens') . ' WHERE token_hash = %s LIMIT 1',
                hash('sha256', $refresh_token)
            ));
            if ($row) {
                $family_uuid = sanitize_text_field((string) $row->session_family_uuid);
            }
        }

        if ($family_uuid !== '') {
            self::revoke_session_family($family_uuid, [
                'actor_user_id' => self::authenticated_user_id() ?: null,
                'reason' => 'global_logout',
            ]);
        }

        return Nevari_Helpers::success([
            'logged_out' => true,
            'session_family_revoked' => $family_uuid !== '',
        ]);
    }

    public static function status(WP_REST_Request $request): WP_REST_Response {
        $user_id = self::authenticated_user_id();
        $payload = Nevari_Auth::current_token_payload();
        $family_uuid = Nevari_Auth::session_family_from_payload($payload);

        return Nevari_Helpers::success([
            'authenticated' => $user_id > 0,
            'user_id' => $user_id > 0 ? $user_id : null,
            'session_family' => $family_uuid ?: null,
            'session_family_active' => $family_uuid ? self::is_session_family_active($family_uuid) : false,
            'last_role' => $user_id > 0 ? sanitize_key((string) get_user_meta($user_id, self::LAST_ROLE_META_KEY, true)) : '',
        ]);
    }

    public static function handle_wordpress_sso_request(): void {
        $action = isset($_GET[self::WORDPRESS_SSO_ACTION]) ? sanitize_key(wp_unslash($_GET[self::WORDPRESS_SSO_ACTION])) : '';
        if ($action === 'dashboard_launch') {
            self::handle_dashboard_launch();
            return;
        }
        if ($action !== 'wordpress_complete') {
            return;
        }

        $transaction_uuid = isset($_GET['transaction']) ? sanitize_text_field(wp_unslash($_GET['transaction'])) : '';
        $state = isset($_GET['state']) ? sanitize_text_field(wp_unslash($_GET['state'])) : '';
        $transaction = self::load_transaction($transaction_uuid);
        if (!$transaction || !self::validate_transaction_state($transaction, $state)) {
            wp_die(esc_html__('This SSO request is invalid or expired.', 'nevari-pharmacy-core'), '', ['response' => 403]);
        }
        if ((string) $transaction->target_app !== 'wordpress' || (string) $transaction->status !== 'issued') {
            wp_die(esc_html__('This SSO request is no longer available.', 'nevari-pharmacy-core'), '', ['response' => 403]);
        }
        if (strtotime((string) $transaction->expires_at . ' UTC') <= time()) {
            wp_die(esc_html__('This SSO request has expired.', 'nevari-pharmacy-core'), '', ['response' => 403]);
        }

        $user = get_user_by('id', (int) $transaction->user_id);
        if (!$user) {
            wp_die(esc_html__('This SSO request could not be completed.', 'nevari-pharmacy-core'), '', ['response' => 403]);
        }

        global $wpdb;
        wp_set_current_user((int) $user->ID);
        wp_set_auth_cookie((int) $user->ID, false, is_ssl());
        $wpdb->update(
            Nevari_Helpers::table('sso_transactions'),
            [
                'status' => 'completed',
                'consumed_at' => Nevari_Helpers::now(),
                'completed_at' => Nevari_Helpers::now(),
            ],
            ['id' => (int) $transaction->id],
            ['%s', '%s', '%s'],
            ['%d']
        );
        update_user_meta((int) $user->ID, self::ACTIVE_FAMILY_META_KEY, sanitize_text_field((string) $transaction->session_family_uuid));
        self::touch_last_role((int) $user->ID, sanitize_key((string) $transaction->target_frontend_type));

        Nevari_Audit::log('security', 'nevari', 'sso.wordpress_complete', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'WordPress SSO completed successfully.',
            'metadata' => [
                'transaction_uuid' => $transaction_uuid,
                'session_family_uuid' => (string) $transaction->session_family_uuid,
            ],
        ]);

        $redirect_url = admin_url();
        if (!empty($transaction->post_login_path) && self::is_safe_relative_path((string) $transaction->post_login_path)) {
            $redirect_url = home_url((string) $transaction->post_login_path);
        }

        wp_safe_redirect($redirect_url);
        exit;
    }

    private static function handle_dashboard_launch(): void {
        $user_id = get_current_user_id();
        if ($user_id <= 0) {
            auth_redirect();
        }

        $target_frontend = self::resolve_target_frontend_type($user_id, isset($_GET['frontend']) ? sanitize_key(wp_unslash($_GET['frontend'])) : '');
        if ($target_frontend === '') {
            wp_die(esc_html__('No permitted dashboard role is available for this user.', 'nevari-pharmacy-core'), '', ['response' => 403]);
        }

        $frontend = Nevari_Connections::trusted_frontend_for_type($target_frontend);
        if (!$frontend) {
            wp_die(esc_html__('The dashboard frontend is not paired with this pharmacy installation.', 'nevari-pharmacy-core'), '', ['response' => 403]);
        }

        $family_uuid = sanitize_text_field((string) get_user_meta($user_id, self::ACTIVE_FAMILY_META_KEY, true));
        if ($family_uuid === '' || !self::is_session_family_active($family_uuid)) {
            $family_uuid = self::create_session_family($user_id, [
                'frontend_type' => $target_frontend,
                'frontend_origin' => (string) $frontend['frontend_origin'],
            ], ['source_app' => 'wordpress']);
        }

        $transaction = self::create_transaction([
            'source_app' => 'wordpress',
            'target_app' => 'dashboard',
            'target_frontend_type' => $target_frontend,
            'user_id' => $user_id,
            'verified_origin' => (string) $frontend['frontend_origin'],
            'post_login_path' => self::dashboard_path_for_frontend($target_frontend),
            'session_family_uuid' => $family_uuid,
        ]);

        $redirect_url = untrailingslashit((string) $frontend['frontend_origin']) . '/sso/dashboard?transaction=' . rawurlencode($transaction['transaction_uuid']) . '&state=' . rawurlencode($transaction['state']) . '&frontend=' . rawurlencode($target_frontend);
        wp_safe_redirect($redirect_url);
        exit;
    }

    public static function handle_wordpress_logout(): void {
        $user_id = get_current_user_id();
        if ($user_id <= 0) {
            return;
        }

        $family_uuid = sanitize_text_field((string) get_user_meta($user_id, self::ACTIVE_FAMILY_META_KEY, true));
        if ($family_uuid !== '') {
            self::revoke_session_family($family_uuid, [
                'actor_user_id' => $user_id,
                'reason' => 'wordpress_logout',
            ]);
        }
    }

    private static function authenticated_user_id(): int {
        $api_user = Nevari_Auth::api_session_user_id();
        if ($api_user > 0) {
            return $api_user;
        }

        return is_user_logged_in() ? (int) get_current_user_id() : 0;
    }

    private static function create_transaction(array $args): array {
        global $wpdb;

        $transaction_uuid = wp_generate_uuid4();
        $state = Nevari_Helpers::base64url_encode(random_bytes(24));
        $now = Nevari_Helpers::now();
        $expires_at = gmdate('Y-m-d H:i:s', time() + self::TRANSACTION_TTL_SECONDS);

        $wpdb->insert(Nevari_Helpers::table('sso_transactions'), [
            'transaction_uuid' => $transaction_uuid,
            'source_app' => sanitize_key((string) ($args['source_app'] ?? 'unknown')),
            'target_app' => sanitize_key((string) ($args['target_app'] ?? 'dashboard')),
            'target_frontend_type' => sanitize_key((string) ($args['target_frontend_type'] ?? '')),
            'user_id' => (int) ($args['user_id'] ?? 0),
            'verified_origin' => !empty($args['verified_origin']) ? esc_url_raw((string) $args['verified_origin']) : '',
            'state_hash' => hash('sha256', $state),
            'post_login_path' => !empty($args['post_login_path']) ? sanitize_text_field((string) $args['post_login_path']) : '',
            'session_family_uuid' => !empty($args['session_family_uuid']) ? sanitize_text_field((string) $args['session_family_uuid']) : '',
            'status' => 'issued',
            'expires_at' => $expires_at,
            'consumed_at' => null,
            'completed_at' => null,
            'created_at' => $now,
        ], ['%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s']);

        Nevari_Audit::log('security', 'nevari', 'sso.transaction_issued', 'success', [
            'actor_user_id' => (int) ($args['user_id'] ?? 0),
            'related_user_id' => (int) ($args['user_id'] ?? 0),
            'message' => 'SSO transaction issued.',
            'metadata' => [
                'transaction_uuid' => $transaction_uuid,
                'target_app' => sanitize_key((string) ($args['target_app'] ?? 'dashboard')),
                'target_frontend_type' => sanitize_key((string) ($args['target_frontend_type'] ?? '')),
            ],
        ]);

        return [
            'transaction_uuid' => $transaction_uuid,
            'state' => $state,
            'expires_at' => $expires_at,
        ];
    }

    private static function load_transaction(string $transaction_uuid) {
        global $wpdb;

        return $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . Nevari_Helpers::table('sso_transactions') . ' WHERE transaction_uuid = %s LIMIT 1',
            $transaction_uuid
        ));
    }

    private static function validate_transaction_state($transaction, string $state): bool {
        if (!$transaction || $state === '') {
            return false;
        }

        if (strtotime((string) $transaction->expires_at . ' UTC') <= time()) {
            return false;
        }

        return hash_equals((string) $transaction->state_hash, hash('sha256', $state));
    }

    private static function validate_dashboard_transaction($transaction, array $frontend): bool {
        if (!$transaction) {
            return false;
        }
        if ((string) $transaction->target_app !== 'dashboard') {
            return false;
        }
        if ((string) $transaction->status !== 'issued') {
            return false;
        }
        if ((string) $transaction->target_frontend_type !== (string) $frontend['frontend_type']) {
            return false;
        }
        if ((string) $transaction->verified_origin !== (string) $frontend['frontend_origin']) {
            return false;
        }

        return true;
    }

    private static function current_source_app(): string {
        if (is_user_logged_in()) {
            return 'wordpress';
        }

        return 'dashboard';
    }

    private static function is_supported_frontend_type(string $frontend_type): bool {
        return in_array($frontend_type, ['storefront', 'doctors_dashboard', 'pharmacist_dashboard', 'patient_dashboard'], true);
    }

    private static function sanitize_return_path(string $path): string {
        $path = trim($path);
        if (!self::is_safe_relative_path($path)) {
            return '';
        }

        return $path;
    }

    private static function is_safe_relative_path(string $path): bool {
        return $path !== ''
            && strpos($path, '://') === false
            && strpos($path, '//') !== 0
            && strpos($path, '..') === false
            && strpos($path, '/') === 0;
    }

    private static function dashboard_path_for_frontend(string $frontend_type): string {
        $map = [
            'storefront' => '/admin/storefront',
            'doctors_dashboard' => '/admin/doctor',
            'pharmacist_dashboard' => '/admin/pharmacist',
            'patient_dashboard' => '/dashboard',
        ];

        return isset($map[$frontend_type]) ? $map[$frontend_type] : '/dashboard';
    }

    private static function wordpress_sso_url(array $args): string {
        return add_query_arg([
            self::WORDPRESS_SSO_ACTION => isset($args['action']) ? sanitize_key((string) $args['action']) : '',
            'transaction' => isset($args['transaction']) ? sanitize_text_field((string) $args['transaction']) : '',
            'state' => isset($args['state']) ? sanitize_text_field((string) $args['state']) : '',
        ], home_url('/'));
    }

    private static function log_sso_failure(string $action, string $transaction_uuid, array $frontend, string $message): void {
        Nevari_Audit::log('security', 'nevari', $action, 'error', [
            'severity' => 'warning',
            'message' => $message,
            'metadata' => [
                'transaction_uuid' => $transaction_uuid,
                'frontend_type' => isset($frontend['frontend_type']) ? (string) $frontend['frontend_type'] : '',
                'frontend_origin' => isset($frontend['frontend_origin']) ? (string) $frontend['frontend_origin'] : '',
            ],
        ]);
    }

    private static function mask_email(string $email): string {
        if (!is_email($email)) {
            return '';
        }
        $parts = explode('@', $email, 2);
        $local = $parts[0];
        $visible = substr($local, 0, min(2, strlen($local)));
        return $visible . str_repeat('*', max(1, strlen($local) - strlen($visible))) . '@' . $parts[1];
    }
}
