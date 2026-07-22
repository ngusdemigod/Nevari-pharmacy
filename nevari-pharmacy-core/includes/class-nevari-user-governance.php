<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_User_Governance {
    private const ROLES = ['patient', 'customer', 'doctor', 'pharmacist', 'nurse'];
    private const STATUSES = ['pending_review', 'approved', 'declined', 'banned'];
    private const BACKFILL_HOOK = 'nevari_user_governance_backfill';

    public static function init(): void {
        self::ensure_schema();
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_action(self::BACKFILL_HOOK, [__CLASS__, 'backfill_existing_users']);
        add_filter('wp_authenticate_user', [__CLASS__, 'guard_wordpress_authentication'], 30, 2);
        add_action('admin_init', [__CLASS__, 'prevent_nurse_dashboard_access']);
        add_filter('show_admin_bar', [__CLASS__, 'hide_nurse_admin_bar']);
        if (!get_option('nevari_user_governance_backfill_complete') && !wp_next_scheduled(self::BACKFILL_HOOK)) {
            wp_schedule_single_event(time() + 15, self::BACKFILL_HOOK);
        }
    }

    public static function ensure_schema(): void {
        if (get_option('nevari_user_governance_schema_version') === NEVARI_PHARMACY_VERSION) {
            return;
        }
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $table = self::table();
        $charset = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE {$table} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            managed_role VARCHAR(24) NOT NULL,
            account_status VARCHAR(24) NOT NULL DEFAULT 'approved',
            previous_status VARCHAR(24) NULL,
            phone VARCHAR(40) NULL,
            license_number VARCHAR(80) NULL,
            consented_at DATETIME NULL,
            decision_reason VARCHAR(500) NULL,
            decided_by BIGINT UNSIGNED NOT NULL DEFAULT 0,
            decided_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY user_id (user_id),
            KEY role_status (managed_role,account_status),
            KEY status_updated (account_status,updated_at)
        ) {$charset};");
        self::backfill_existing_users();
        update_option('nevari_user_governance_schema_version', NEVARI_PHARMACY_VERSION, false);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/auth/register-nurse', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'register_nurse'],
            'permission_callback' => '__return_true',
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/admin/users', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'users_index'],
            'permission_callback' => [__CLASS__, 'admin_permission'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/admin/nurses', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'nurses_index'],
            'permission_callback' => [__CLASS__, 'admin_permission'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/admin/users/(?P<id>\d+)/(?P<action>approve|decline|ban|unban)', [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => [__CLASS__, 'mutate_user'],
            'permission_callback' => [__CLASS__, 'target_permission'],
        ]);
    }

    public static function admin_permission(): bool {
        return Nevari_Auth::api_session_required()
            && Nevari_Helpers::is_store_admin(Nevari_Auth::api_session_user_id());
    }

    public static function target_permission(WP_REST_Request $request): bool {
        if (!self::admin_permission()) {
            return false;
        }
        $actor_id = Nevari_Auth::api_session_user_id();
        $target = get_user_by('id', absint($request['id']));
        return $target instanceof WP_User
            && (int) $target->ID !== $actor_id
            && !array_intersect(['administrator', 'shop_manager', 'store_admin'], (array) $target->roles)
            && self::managed_role($target) !== '';
    }

    public static function can_authenticate(int $user_id): bool {
        global $wpdb;
        $status = $wpdb->get_var($wpdb->prepare(
            'SELECT account_status FROM ' . self::table() . ' WHERE user_id = %d',
            $user_id
        ));
        return !$status || $status === 'approved';
    }

    public static function guard_wordpress_authentication($user, $password) {
        if ($user instanceof WP_User && !self::can_authenticate((int) $user->ID)) {
            return new WP_Error('invalid_credentials', __('Invalid username or password.', 'nevari-pharmacy-core'));
        }
        return $user;
    }

    public static function prevent_nurse_dashboard_access(): void {
        if (!wp_doing_ajax() && current_user_can('read') && in_array('nurse', Nevari_Helpers::current_user_roles(), true)) {
            wp_safe_redirect(home_url('/'));
            exit;
        }
    }

    public static function hide_nurse_admin_bar($show): bool {
        return in_array('nurse', Nevari_Helpers::current_user_roles(), true) ? false : (bool) $show;
    }

    public static function is_assignable_nurse(int $user_id): bool {
        $user = get_user_by('id', $user_id);
        if (!$user || !in_array('nurse', (array) $user->roles, true)) {
            return false;
        }
        global $wpdb;
        return 'approved' === $wpdb->get_var($wpdb->prepare(
            "SELECT account_status FROM " . self::table() . " WHERE user_id = %d AND managed_role = 'nurse'",
            $user_id
        ));
    }

    public static function register_nurse(WP_REST_Request $request): WP_REST_Response {
        if (strlen((string) $request->get_body()) > 16384) {
            return Nevari_Helpers::error('invalid_request', 'The application could not be accepted.', 413);
        }
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];
        $allowed = ['first_name', 'last_name', 'email', 'phone', 'license_number', 'password', 'consent'];
        if (array_diff(array_keys($body), $allowed)) {
            return Nevari_Helpers::error('invalid_request', 'The application could not be accepted.', 422);
        }

        $email = sanitize_email((string) ($body['email'] ?? ''));
        $ip = Nevari_Helpers::client_ip();
        if ($response = Nevari_Helpers::rate_limit('nurse_registration_ip', 5, HOUR_IN_SECONDS, [$ip])) {
            return $response;
        }
        if ($response = Nevari_Helpers::rate_limit('nurse_registration_email', 3, HOUR_IN_SECONDS, [hash('sha256', strtolower($email))])) {
            return $response;
        }

        $first_name = substr(sanitize_text_field((string) ($body['first_name'] ?? '')), 0, 80);
        $last_name = substr(sanitize_text_field((string) ($body['last_name'] ?? '')), 0, 80);
        $phone = substr(sanitize_text_field((string) ($body['phone'] ?? '')), 0, 40);
        $license = strtoupper(substr(sanitize_text_field((string) ($body['license_number'] ?? '')), 0, 80));
        $password = (string) ($body['password'] ?? '');
        $valid = $first_name !== '' && $last_name !== '' && is_email($email)
            && preg_match('/^[+0-9][0-9 ()-]{7,24}$/', $phone)
            && preg_match('/^[A-Z0-9][A-Z0-9\/-]{4,39}$/', $license)
            && strlen($password) >= 12 && preg_match('/[A-Z]/', $password)
            && preg_match('/[a-z]/', $password) && preg_match('/\d/', $password)
            && rest_sanitize_boolean($body['consent'] ?? false);
        if (!$valid) {
            return Nevari_Helpers::error('invalid_request', 'Please check the application fields and try again.', 422);
        }

        if (email_exists($email)) {
            return Nevari_Helpers::success([
                'message' => 'If the application can be accepted, it will be sent for review.',
            ], [], 202);
        }

        $user_id = wp_insert_user([
            'user_login' => $email,
            'user_email' => $email,
            'user_pass' => $password,
            'first_name' => $first_name,
            'last_name' => $last_name,
            'display_name' => trim($first_name . ' ' . $last_name),
            'role' => 'nurse',
        ]);
        if (is_wp_error($user_id)) {
            return Nevari_Helpers::error('registration_failed', 'The application could not be accepted.', 422);
        }

        global $wpdb;
        $now = Nevari_Helpers::now();
        $wpdb->replace(self::table(), [
            'user_id' => (int) $user_id,
            'managed_role' => 'nurse',
            'account_status' => 'pending_review',
            'phone' => $phone,
            'license_number' => $license,
            'consented_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        self::audit('nurse.registration_submitted', (int) $user_id, 0);
        self::notify_admins('nurse_admin_review', 'Nurse registration requires review', (int) $user_id);
        self::notify_user((int) $user_id, 'nurse_registration_received', 'Your nurse registration was received');
        return Nevari_Helpers::success([
            'message' => 'Your application was received and is awaiting review.',
        ], [], 201);
    }

    public static function users_index(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $page = max(1, absint($request->get_param('page')));
        $per_page = min(50, max(1, absint($request->get_param('per_page')) ?: 20));
        $role = sanitize_key((string) $request->get_param('role'));
        $status = sanitize_key((string) $request->get_param('status'));
        $search = substr(sanitize_text_field((string) $request->get_param('search')), 0, 80);
        if ($role && !in_array($role, self::ROLES, true)) {
            return Nevari_Helpers::error('invalid_role', 'Invalid role filter.', 422);
        }
        if ($status && !in_array($status, self::STATUSES, true)) {
            return Nevari_Helpers::error('invalid_status', 'Invalid status filter.', 422);
        }

        $where = ['1 = 1'];
        $args = [];
        if ($role) {
            $where[] = 'g.managed_role = %s';
            $args[] = $role;
        }
        if ($status) {
            $where[] = 'g.account_status = %s';
            $args[] = $status;
        }
        if ($search) {
            $like = '%' . $wpdb->esc_like($search) . '%';
            $where[] = '(u.display_name LIKE %s OR u.user_email LIKE %s)';
            $args[] = $like;
            $args[] = $like;
        }
        $clause = implode(' AND ', $where);
        $offset = ($page - 1) * $per_page;
        $select = "SELECT g.user_id,g.managed_role,g.account_status,g.phone,g.license_number,g.decision_reason,g.updated_at,u.display_name,u.user_email FROM "
            . self::table() . " g INNER JOIN {$wpdb->users} u ON u.ID = g.user_id WHERE {$clause} ORDER BY g.updated_at DESC LIMIT %d OFFSET %d";
        $rows = $wpdb->get_results($wpdb->prepare($select, array_merge($args, [$per_page, $offset])), ARRAY_A) ?: [];
        $count = "SELECT COUNT(*) FROM " . self::table() . " g INNER JOIN {$wpdb->users} u ON u.ID = g.user_id WHERE {$clause}";
        $total = (int) ($args ? $wpdb->get_var($wpdb->prepare($count, $args)) : $wpdb->get_var($count));
        return Nevari_Helpers::success([
            'items' => $rows,
            'pagination' => ['page' => $page, 'per_page' => $per_page, 'total' => $total, 'pages' => (int) ceil($total / $per_page)],
        ]);
    }

    public static function nurses_index(WP_REST_Request $request): WP_REST_Response {
        $request->set_param('role', 'nurse');
        $request->set_param('status', 'approved');
        return self::users_index($request);
    }

    public static function mutate_user(WP_REST_Request $request): WP_REST_Response {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];
        if (array_diff(array_keys($body), ['reason'])) {
            return Nevari_Helpers::error('unexpected_fields', 'Unexpected request fields were supplied.', 422);
        }
        $target_id = absint($request['id']);
        $action = sanitize_key((string) $request['action']);
        $reason = substr(sanitize_text_field((string) ($body['reason'] ?? '')), 0, 500);
        global $wpdb;
        $wpdb->query('START TRANSACTION');
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . self::table() . ' WHERE user_id = %d FOR UPDATE',
            $target_id
        ), ARRAY_A);
        if (!$row) {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('not_managed', 'This user is not managed.', 404);
        }
        $role = self::managed_role(get_user_by('id', $target_id));
        if (!$role || $role !== $row['managed_role']) {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('role_changed', 'The user role changed. Refresh and try again.', 409);
        }
        if (in_array($action, ['approve', 'decline'], true) && $role !== 'nurse') {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('invalid_action', 'Only nurse applications use approval decisions.', 422);
        }
        $next = ['approve' => 'approved', 'decline' => 'declined', 'ban' => 'banned', 'unban' => 'approved'][$action];
        $now = Nevari_Helpers::now();
        $wpdb->update(self::table(), [
            'previous_status' => $row['account_status'],
            'account_status' => $next,
            'decision_reason' => $reason,
            'decided_by' => Nevari_Auth::api_session_user_id(),
            'decided_at' => $now,
            'updated_at' => $now,
        ], ['user_id' => $target_id]);
        if (in_array($next, ['declined', 'banned'], true)) {
            self::revoke_sessions($target_id);
        }
        if ($role === 'nurse' && $next === 'banned') {
            self::flag_reassignment($target_id);
        }
        $wpdb->query('COMMIT');
        self::audit('user.' . $action, $target_id, Nevari_Auth::api_session_user_id());
        $template_key = ['approve' => 'nurse_approved', 'decline' => 'nurse_declined', 'ban' => 'nurse_ban', 'unban' => 'nurse_unban'][$action];
        self::notify_user($target_id, $template_key, 'Your Nevari nurse account status was updated');
        return Nevari_Helpers::success(['user_id' => $target_id, 'status' => $next]);
    }

    private static function table(): string {
        return Nevari_Helpers::table('user_governance');
    }

    private static function managed_role($user): string {
        if (!$user instanceof WP_User) {
            return '';
        }
        foreach (self::ROLES as $role) {
            if (in_array($role, (array) $user->roles, true)) {
                return $role;
            }
        }
        return '';
    }

    public static function backfill_existing_users(): void {
        global $wpdb;
        $cursor = absint(get_option('nevari_user_governance_backfill_cursor', 0));
        $ids = $wpdb->get_col($wpdb->prepare("SELECT ID FROM {$wpdb->users} WHERE ID > %d ORDER BY ID ASC LIMIT 100", $cursor));
        foreach ($ids as $id) {
            $user = get_user_by('id', (int) $id);
            $role = self::managed_role($user);
            if ($role) {
                $status = $role === 'doctor' && get_user_meta($user->ID, '_nevari_doctor_disabled', true) ? 'banned' : 'approved';
                $wpdb->query($wpdb->prepare(
                    'INSERT IGNORE INTO ' . self::table() . ' (user_id,managed_role,account_status,created_at,updated_at) VALUES (%d,%s,%s,%s,%s)',
                    $user->ID,
                    $role,
                    $status,
                    Nevari_Helpers::now(),
                    Nevari_Helpers::now()
                ));
            }
            update_option('nevari_user_governance_backfill_cursor', (int) $id, false);
        }
        if (count($ids) < 100) {
            update_option('nevari_user_governance_backfill_complete', Nevari_Helpers::now(), false);
            return;
        }
        wp_schedule_single_event(time() + 10, self::BACKFILL_HOOK);
    }

    private static function revoke_sessions(int $user_id): void {
        global $wpdb;
        $now = Nevari_Helpers::now();
        $wpdb->query($wpdb->prepare(
            "UPDATE " . Nevari_Helpers::table('session_families') . " SET status = 'revoked', revoked_at = %s WHERE user_id = %d AND status = 'active'",
            $now,
            $user_id
        ));
        $wpdb->query($wpdb->prepare(
            'UPDATE ' . Nevari_Helpers::table('refresh_tokens') . ' SET revoked_at = %s WHERE user_id = %d AND revoked_at IS NULL',
            $now,
            $user_id
        ));
    }

    private static function flag_reassignment(int $user_id): void {
        global $wpdb;
        $table = Nevari_Helpers::table('nurse_requests');
        $wpdb->query($wpdb->prepare(
            "UPDATE {$table} SET action_required = 1, action_reason = 'assigned_nurse_unavailable', updated_at = %s WHERE assigned_nurse_user_id = %d AND status NOT IN ('completed','declined','cancelled')",
            Nevari_Helpers::now(),
            $user_id
        ));
        self::notify_admins('nurse_reassignment_required', 'A Nurse Request requires reassignment', $user_id);
    }

    private static function notify_admins(string $template_key, string $subject, int $user_id): void {
        $admins = get_users(['role__in' => ['administrator', 'shop_manager', 'store_admin'], 'fields' => ['ID', 'user_email'], 'number' => 100]);
        foreach ($admins as $admin) {
            Nevari_Emails::queue_or_send([
                'template_key' => $template_key,
                'recipient_user_id' => (int) $admin->ID,
                'recipient_email' => $admin->user_email,
                'subject' => $subject,
                'body_html' => '<p>An item requires action in the Store Admin dashboard.</p>',
                'related_object_type' => 'user_governance',
                'related_object_id' => $user_id,
            ], false);
        }
    }

    private static function notify_user(int $user_id, string $template_key, string $subject): void {
        $user = get_user_by('id', $user_id);
        if (!$user) {
            return;
        }
        Nevari_Emails::queue_or_send([
            'template_key' => $template_key,
            'recipient_user_id' => $user_id,
            'recipient_email' => $user->user_email,
            'subject' => $subject,
            'body_html' => '<p>Your Nevari nurse account status has been updated.</p>',
            'related_object_type' => 'user_governance',
            'related_object_id' => $user_id,
        ], false);
    }

    private static function audit(string $action, int $target_id, int $actor_id): void {
        Nevari_Audit::log('security', 'nevari', $action, 'success', [
            'actor_user_id' => $actor_id ?: null,
            'related_user_id' => $target_id,
            'object_type' => 'user_governance',
            'object_id' => $target_id,
            'message' => 'Managed user status event recorded.',
        ]);
    }
}
