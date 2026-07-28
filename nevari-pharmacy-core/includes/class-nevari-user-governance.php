<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_User_Governance {
    private const ROLES = ['patient', 'customer', 'subscriber', 'doctor', 'pharmacist', 'nurse', 'store_admin', 'shop_manager', 'administrator'];
    private const STAFF_ROLES = ['administrator', 'store_admin', 'shop_manager', 'doctor', 'pharmacist', 'nurse'];
    private const CUSTOM_PERMISSION_ROLES = ['administrator', 'store_admin', 'shop_manager'];
    private const PATIENT_ROLES = ['patient', 'customer', 'subscriber'];
    private const PERMISSIONS = [
        'products' => 'nevari_storefront_products',
        'orders' => 'nevari_storefront_orders',
        'payments' => 'nevari_storefront_payments',
        'patients' => 'nevari_storefront_patients',
        'consultations' => 'nevari_storefront_consultations',
        'mtm' => 'nevari_storefront_mtm',
        'iv-therapy' => 'nevari_storefront_iv_therapy',
        'nurse-requests' => 'nevari_storefront_nurse_requests',
        'logs' => 'nevari_storefront_logs',
        'staff' => 'nevari_storefront_staff',
        'subscriptions' => 'nevari_storefront_subscriptions',
        'analytics' => 'nevari_storefront_analytics',
    ];
    private const STATUSES = ['pending_review', 'approved', 'declined', 'banned', 'suspended'];
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
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'users_index'],
                'permission_callback' => [__CLASS__, 'admin_permission'],
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'create_user'],
                'permission_callback' => [__CLASS__, 'create_user_permission'],
            ],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/admin/nurses', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'nurses_index'],
            'permission_callback' => [__CLASS__, 'admin_permission'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/admin/users/(?P<id>\d+)/(?P<action>approve|decline|ban|unban|suspend|reset-password)', [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => [__CLASS__, 'mutate_user'],
            'permission_callback' => [__CLASS__, 'target_permission'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/admin/users/(?P<id>\d+)/access', [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => [__CLASS__, 'update_access'],
            'permission_callback' => [__CLASS__, 'administrator_target_permission'],
        ]);
    }

    public static function admin_permission(?WP_REST_Request $request = null): bool {
        $user_id = Nevari_Auth::api_session_user_id();
        $permission = $request && sanitize_key((string) $request->get_param('scope')) === 'patients' ? 'patients' : 'staff';
        return Nevari_Auth::api_session_required()
            && $user_id > 0
            && Nevari_Helpers::is_store_admin($user_id)
            && (
                in_array('administrator', Nevari_Helpers::current_user_roles($user_id), true)
                || self::user_has_permission($user_id, $permission)
            );
    }

    public static function create_user_permission(): bool {
        $actor_id = Nevari_Auth::api_session_user_id();
        return Nevari_Auth::api_session_required()
            && $actor_id > 0
            && Nevari_Helpers::is_store_admin($actor_id)
            && (
                in_array('administrator', Nevari_Helpers::current_user_roles($actor_id), true)
                || self::user_has_permission($actor_id, 'staff')
            );
    }

    public static function create_user(WP_REST_Request $request): WP_REST_Response {
        if (strlen((string) $request->get_body()) > 3145728) {
            return Nevari_Helpers::error('invalid_request', 'The user account could not be created.', 413);
        }
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];
        $allowed = [
            'first_name', 'last_name', 'email', 'phone', 'password', 'role', 'permissions',
            'avatar', 'specialty', 'license_number', 'location', 'weekly_capacity',
            'is_available', 'address',
        ];
        if (array_diff(array_keys($body), $allowed)) {
            return Nevari_Helpers::error('unexpected_fields', 'Unexpected request fields were supplied.', 422);
        }

        $actor_id = Nevari_Auth::api_session_user_id();
        $actor_is_administrator = in_array('administrator', Nevari_Helpers::current_user_roles($actor_id), true);
        $role = sanitize_key((string) ($body['role'] ?? ''));
        $role_map = ['administrator', 'store_admin', 'doctor', 'patient', 'nurse', 'pharmacist'];
        if (!in_array($role, $role_map, true) || ($role === 'administrator' && !$actor_is_administrator)) {
            self::audit_event('admin.user_created', 0, $actor_id, 'error', '', $role, 'authorization_failed');
            return Nevari_Helpers::error('forbidden_role', 'You cannot create the selected account role.', 403);
        }

        $first_name = substr(sanitize_text_field((string) ($body['first_name'] ?? '')), 0, 80);
        $last_name = substr(sanitize_text_field((string) ($body['last_name'] ?? '')), 0, 80);
        $email = sanitize_email((string) ($body['email'] ?? ''));
        $phone = substr(sanitize_text_field((string) ($body['phone'] ?? '')), 0, 40);
        $password = (string) ($body['password'] ?? '');
        $requires_phone = in_array($role, ['doctor', 'nurse', 'pharmacist'], true);
        $phone_valid = !$requires_phone || (bool) preg_match('/^[+0-9][0-9 ()-]{7,24}$/', $phone);
        $password_valid = strlen($password) >= 12
            && preg_match('/[A-Z]/', $password)
            && preg_match('/[a-z]/', $password)
            && preg_match('/\d/', $password)
            && preg_match('/[^A-Za-z0-9]/', $password);
        if ($first_name === '' || $last_name === '' || !is_email($email) || !$phone_valid || !$password_valid) {
            return Nevari_Helpers::error('invalid_request', 'Check the required fields and password requirements.', 422);
        }
        if (email_exists($email) || username_exists($email)) {
            return Nevari_Helpers::error('account_exists', 'An account already uses this email address.', 409);
        }

        $permissions = is_array($body['permissions'] ?? null)
            ? array_values(array_unique(array_map('sanitize_key', $body['permissions'])))
            : self::default_permissions_for_role($role);
        if (array_diff($permissions, array_keys(self::PERMISSIONS))) {
            return Nevari_Helpers::error('invalid_permissions', 'One or more permissions are invalid.', 422);
        }
        if ($role === 'administrator') {
            $permissions = array_keys(self::PERMISSIONS);
        } elseif ($role !== 'store_admin' || !$actor_is_administrator) {
            $permissions = self::default_permissions_for_role($role);
        }

        $user_id = wp_insert_user([
            'user_login' => $email,
            'user_email' => $email,
            'user_pass' => $password,
            'first_name' => $first_name,
            'last_name' => $last_name,
            'display_name' => trim($first_name . ' ' . $last_name),
            'role' => $role,
        ]);
        if (is_wp_error($user_id)) {
            self::audit_event('admin.user_created', 0, $actor_id, 'error', '', $role, 'creation_failed');
            return Nevari_Helpers::error('creation_failed', 'The user account could not be created.', 422);
        }

        $license = strtoupper(substr(sanitize_text_field((string) ($body['license_number'] ?? '')), 0, 80));
        $now = Nevari_Helpers::now();
        global $wpdb;
        $saved = $wpdb->replace(self::table(), [
            'user_id' => (int) $user_id,
            'managed_role' => $role,
            'account_status' => 'approved',
            'phone' => $phone,
            'license_number' => $license,
            'decided_by' => $actor_id,
            'decided_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        if ($saved === false) {
            require_once ABSPATH . 'wp-admin/includes/user.php';
            wp_delete_user((int) $user_id);
            return Nevari_Helpers::error('creation_failed', 'The user account could not be created.', 500);
        }

        $user = get_user_by('id', (int) $user_id);
        foreach (self::PERMISSIONS as $key => $capability) {
            in_array($key, $permissions, true) ? $user->add_cap($capability) : $user->remove_cap($capability);
        }
        update_user_meta((int) $user_id, 'billing_phone', $phone);
        update_user_meta((int) $user_id, 'billing_address_1', substr(sanitize_textarea_field((string) ($body['address'] ?? '')), 0, 300));
        update_user_meta((int) $user_id, '_nevari_specialty', substr(sanitize_text_field((string) ($body['specialty'] ?? '')), 0, 100));
        update_user_meta((int) $user_id, '_nevari_license_number', $license);
        update_user_meta((int) $user_id, '_nevari_location', substr(sanitize_text_field((string) ($body['location'] ?? '')), 0, 120));
        update_user_meta((int) $user_id, '_nevari_weekly_capacity', min(168, max(1, absint($body['weekly_capacity'] ?? 40))));
        update_user_meta((int) $user_id, '_nevari_is_available', rest_sanitize_boolean($body['is_available'] ?? true) ? '1' : '0');

        $avatar_result = self::save_created_user_avatar((int) $user_id, $body['avatar'] ?? null);
        if (is_wp_error($avatar_result)) {
            require_once ABSPATH . 'wp-admin/includes/user.php';
            wp_delete_user((int) $user_id);
            return Nevari_Helpers::error('invalid_avatar', $avatar_result->get_error_message(), 422);
        }

        self::audit_event('admin.user_created', (int) $user_id, $actor_id, 'success', '', $role, '', [
            'permissions_after' => $permissions,
        ]);
        return Nevari_Helpers::success([
            'user' => self::directory_user_summary((int) $user_id, $role, 'approved'),
        ], [], 201);
    }

    private static function save_created_user_avatar(int $user_id, $avatar) {
        if ($avatar === null || $avatar === '') {
            return true;
        }
        if (!is_array($avatar) || array_diff(array_keys($avatar), ['name', 'type', 'data'])) {
            return new WP_Error('invalid_avatar', 'Select one valid JPG, PNG, or WebP image.');
        }
        $name = sanitize_file_name((string) ($avatar['name'] ?? ''));
        $type = sanitize_mime_type((string) ($avatar['type'] ?? ''));
        $data = (string) ($avatar['data'] ?? '');
        $allowed = ['image/jpeg' => ['jpg', 'jpeg'], 'image/png' => ['png'], 'image/webp' => ['webp']];
        $extension = strtolower((string) pathinfo($name, PATHINFO_EXTENSION));
        if (!isset($allowed[$type]) || !in_array($extension, $allowed[$type], true) || !preg_match('/^data:' . preg_quote($type, '/') . ';base64,/', $data)) {
            return new WP_Error('invalid_avatar', 'Select one valid JPG, PNG, or WebP image.');
        }
        $binary = base64_decode(substr($data, strpos($data, ',') + 1), true);
        if ($binary === false || strlen($binary) < 1 || strlen($binary) > 2097152 || @getimagesizefromstring($binary) === false) {
            return new WP_Error('invalid_avatar', 'The avatar must be a valid image no larger than 2 MB.');
        }
        $upload = wp_upload_bits('nevari-user-' . $user_id . '.' . $extension, null, $binary);
        if (!empty($upload['error'])) {
            return new WP_Error('avatar_upload_failed', 'The avatar could not be saved.');
        }
        update_user_meta($user_id, '_nevari_customer_profile_image_url', esc_url_raw((string) $upload['url']));
        return true;
    }

    public static function target_permission(WP_REST_Request $request): bool {
        $actor_id = Nevari_Auth::api_session_user_id();
        $target_id = absint($request['id']);
        $target = get_user_by('id', $target_id);
        $target_role = $target instanceof WP_User ? self::primary_role($target) : '';
        $required_permission = in_array($target_role, self::PATIENT_ROLES, true) ? 'patients' : 'staff';
        $actor_is_administrator = in_array('administrator', Nevari_Helpers::current_user_roles($actor_id), true);
        $allowed = Nevari_Auth::api_session_required()
            && $actor_id > 0
            && Nevari_Helpers::is_store_admin($actor_id)
            && ($actor_is_administrator || self::user_has_permission($actor_id, $required_permission))
            && $target instanceof WP_User
            && (int) $target->ID !== $actor_id
            && !array_intersect(['administrator', 'shop_manager', 'store_admin'], (array) $target->roles)
            && $target_role !== '';
        if (!$allowed && $actor_id > 0) {
            self::audit_event(
                'user.' . sanitize_key((string) $request['action']),
                $target_id,
                $actor_id,
                'error',
                '',
                '',
                'authorization_failed'
            );
        }
        return $allowed;
    }

    public static function role_change_permission(WP_REST_Request $request): bool {
        $actor_id = Nevari_Auth::api_session_user_id();
        $target_id = absint($request['id']);
        $target = get_user_by('id', $target_id);
        $target_role = $target instanceof WP_User ? self::primary_role($target) : '';
        $required_permission = in_array($target_role, self::PATIENT_ROLES, true) ? 'patients' : 'staff';
        $actor_is_administrator = in_array('administrator', Nevari_Helpers::current_user_roles($actor_id), true);
        $allowed = Nevari_Auth::api_session_required()
            && $actor_id > 0
            && Nevari_Helpers::is_store_admin($actor_id)
            && ($actor_is_administrator || self::user_has_permission($actor_id, $required_permission))
            && $target instanceof WP_User
            && (int) $target->ID !== $actor_id
            && !in_array('administrator', (array) $target->roles, true)
            && $target_role !== '';
        if (!$allowed && $actor_id > 0) {
            self::audit_event('admin.user_role_changed', $target_id, $actor_id, 'error', $target_role, '', 'authorization_failed');
        }
        return $allowed;
    }

    public static function change_role(int $target_id, string $target_role, string $reason = '') {
        $target = get_user_by('id', $target_id);
        $target_role = sanitize_key($target_role);
        if (!$target instanceof WP_User || !in_array($target_role, array_merge(self::STAFF_ROLES, self::PATIENT_ROLES), true)) {
            return new WP_Error('role_change_invalid_target', 'The selected role is not available.');
        }

        $before_role = self::primary_role($target);
        $before_permissions = self::permission_keys_for_user($target_id);
        $permissions = self::default_permissions_for_role($target_role);
        $now = Nevari_Helpers::now();
        global $wpdb;
        $wpdb->query('START TRANSACTION');
        try {
            self::ensure_directory_row($target, $before_role);
            $role_update = wp_update_user([
                'ID' => $target_id,
                'role' => $target_role,
            ]);
            if (is_wp_error($role_update)) {
                throw new RuntimeException('The WordPress user role could not be updated.');
            }
            clean_user_cache($target_id);
            $target = get_user_by('id', $target_id);
            if (!$target instanceof WP_User || !in_array($target_role, (array) $target->roles, true)) {
                throw new RuntimeException('The WordPress user role update could not be verified.');
            }
            foreach (self::PERMISSIONS as $key => $capability) {
                if (in_array($key, $permissions, true)) {
                    $target->add_cap($capability);
                } else {
                    $target->remove_cap($capability);
                }
            }
            $updated = $wpdb->update(self::table(), [
                'managed_role' => $target_role,
                'previous_status' => null,
                'account_status' => 'approved',
                'decision_reason' => substr(sanitize_text_field($reason), 0, 500),
                'decided_by' => Nevari_Auth::api_session_user_id(),
                'decided_at' => $now,
                'updated_at' => $now,
            ], ['user_id' => $target_id]);
            if ($updated === false) {
                throw new RuntimeException('The governance directory could not be updated.');
            }
            self::revoke_sessions($target_id);
            $wpdb->query('COMMIT');
        } catch (Throwable $error) {
            $wpdb->query('ROLLBACK');
            clean_user_cache($target_id);
            self::audit_event('admin.user_role_changed', $target_id, Nevari_Auth::api_session_user_id(), 'error', $before_role, $target_role, 'mutation_failed');
            return new WP_Error('role_change_failed', 'The user role could not be updated.');
        }

        clean_user_cache($target_id);
        $updated_user = get_user_by('id', $target_id);
        self::audit_event('admin.user_role_changed', $target_id, Nevari_Auth::api_session_user_id(), 'success', $before_role, $target_role, '', [
            'permissions_before' => $before_permissions,
            'permissions_after' => $permissions,
            'reason' => substr(sanitize_text_field($reason), 0, 500),
        ]);
        $notification = self::notify_role_change($updated_user, $before_role, $target_role);
        return [
            'user' => self::directory_user_summary($target_id, $target_role, 'approved'),
            'from_role' => $before_role,
            'target_role' => $target_role,
            'notification' => $notification,
        ];
    }

    public static function audit_role_change_failure(int $target_id, string $before_role, string $target_role, string $failure_category): void {
        self::audit_event(
            'admin.user_role_changed',
            $target_id,
            Nevari_Auth::api_session_user_id(),
            'error',
            $before_role,
            $target_role,
            $failure_category
        );
    }

    private static function ensure_directory_row(WP_User $user, string $role): void {
        if ($role === '') {
            return;
        }
        global $wpdb;
        $now = Nevari_Helpers::now();
        $wpdb->query($wpdb->prepare(
            'INSERT IGNORE INTO ' . self::table() . ' (user_id,managed_role,account_status,created_at,updated_at) VALUES (%d,%s,%s,%s,%s)',
            (int) $user->ID,
            $role,
            $role === 'nurse' ? 'pending_review' : 'approved',
            $now,
            $now
        ));
    }

    public static function administrator_target_permission(WP_REST_Request $request): bool {
        $actor_id = Nevari_Auth::api_session_user_id();
        $actor = $actor_id ? get_user_by('id', $actor_id) : false;
        $target = get_user_by('id', absint($request['id']));
        return Nevari_Auth::api_session_required()
            && $actor instanceof WP_User
            && in_array('administrator', (array) $actor->roles, true)
            && $target instanceof WP_User
            && (int) $target->ID !== $actor_id
            && (bool) array_intersect(self::STAFF_ROLES, (array) $target->roles);
    }

    public static function permission_keys_for_user(int $user_id): array {
        $keys = [];
        foreach (self::PERMISSIONS as $key => $capability) {
            if (user_can($user_id, $capability)) {
                $keys[] = $key;
            }
        }
        return $keys;
    }

    public static function user_has_permission(int $user_id, string $key): bool {
        $capability = self::PERMISSIONS[sanitize_key($key)] ?? '';
        return $capability !== '' && user_can($user_id, $capability);
    }

    public static function default_permissions_for_role(string $role): array {
        $defaults = [
            'administrator' => array_keys(self::PERMISSIONS),
            'store_admin' => ['products', 'orders', 'payments', 'patients', 'consultations', 'mtm', 'iv-therapy', 'nurse-requests', 'logs', 'subscriptions', 'analytics'],
            'shop_manager' => ['products', 'orders', 'payments', 'patients', 'consultations', 'mtm', 'iv-therapy', 'nurse-requests', 'logs', 'subscriptions', 'analytics'],
            'pharmacist' => ['products', 'orders', 'payments', 'patients', 'mtm'],
            'doctor' => ['patients', 'consultations'],
            'nurse' => ['nurse-requests'],
        ];
        return $defaults[$role] ?? [];
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
        self::ensure_directory_rows();
        $page = max(1, absint($request->get_param('page')));
        $per_page = min(50, max(1, absint($request->get_param('per_page')) ?: 20));
        $role = sanitize_key((string) $request->get_param('role'));
        $scope = sanitize_key((string) $request->get_param('scope'));
        $status = sanitize_key((string) $request->get_param('status'));
        $search = substr(sanitize_text_field((string) $request->get_param('search')), 0, 80);
        if ($role && !in_array($role, self::ROLES, true)) {
            return Nevari_Helpers::error('invalid_role', 'Invalid role filter.', 422);
        }
        if ($scope && !in_array($scope, ['staff', 'patients'], true)) {
            return Nevari_Helpers::error('invalid_scope', 'Invalid user scope.', 422);
        }
        if ($status && !in_array($status, self::STATUSES, true)) {
            return Nevari_Helpers::error('invalid_status', 'Invalid status filter.', 422);
        }

        $where = ['1 = 1'];
        $args = [];
        if ($role) {
            $where[] = 'g.managed_role = %s';
            $args[] = $role;
        } elseif ($scope === 'staff') {
            $where[] = "g.managed_role IN ('administrator','store_admin','shop_manager','doctor','pharmacist','nurse')";
        } elseif ($scope === 'patients') {
            $where[] = "g.managed_role IN ('patient','customer','subscriber')";
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
        $select = "SELECT g.user_id,g.managed_role,g.account_status,g.phone,g.license_number,g.decision_reason,g.updated_at,u.display_name,u.user_email,u.user_registered AS date_joined FROM "
            . self::table() . " g INNER JOIN {$wpdb->users} u ON u.ID = g.user_id WHERE {$clause} ORDER BY g.updated_at DESC LIMIT %d OFFSET %d";
        $rows = $wpdb->get_results($wpdb->prepare($select, array_merge($args, [$per_page, $offset])), ARRAY_A) ?: [];
        foreach ($rows as &$row) {
            $user_id = (int) ($row['user_id'] ?? 0);
            $appointment_patients = $wpdb->get_col($wpdb->prepare(
                'SELECT DISTINCT patient_user_id FROM ' . Nevari_Helpers::table('appointments') . ' WHERE doctor_user_id = %d AND patient_user_id > 0',
                $user_id
            ));
            $prescription_patients = $wpdb->get_col($wpdb->prepare(
                'SELECT DISTINCT patient_user_id FROM ' . Nevari_Helpers::table('prescriptions') . ' WHERE doctor_user_id = %d AND patient_user_id > 0',
                $user_id
            ));
            $row['linked_patients'] = count(array_unique(array_map('intval', array_merge($appointment_patients ?: [], $prescription_patients ?: []))));
            $summary = Nevari_Helpers::user_summary($user_id) ?: [];
            $row['avatar_url'] = $summary['avatar_url'] ?? '';
            $row['permissions'] = self::permission_keys_for_user($user_id);
            $row['roles'] = [$row['managed_role']];
            $row['last_activity'] = $wpdb->get_var($wpdb->prepare(
                'SELECT MAX(created_at) FROM ' . Nevari_Helpers::table('audit_logs') . ' WHERE actor_user_id = %d OR related_user_id = %d',
                $user_id,
                $user_id
            )) ?: $row['date_joined'];
            if ($scope === 'patients') {
                $row['orders'] = function_exists('wc_get_customer_order_count') ? (int) wc_get_customer_order_count($user_id) : 0;
                $row['spend'] = function_exists('wc_get_customer_total_spent') ? (float) wc_get_customer_total_spent($user_id) : 0.0;
                $row['appointments'] = (int) $wpdb->get_var($wpdb->prepare(
                    'SELECT COUNT(*) FROM ' . Nevari_Helpers::table('appointments') . ' WHERE patient_user_id = %d',
                    $user_id
                ));
                $last_appointment = $wpdb->get_var($wpdb->prepare(
                    'SELECT MAX(updated_at) FROM ' . Nevari_Helpers::table('appointments') . ' WHERE patient_user_id = %d',
                    $user_id
                ));
                $row['last_activity'] = $last_appointment ?: $row['date_joined'];
            }
        }
        unset($row);
        $count = "SELECT COUNT(*) FROM " . self::table() . " g INNER JOIN {$wpdb->users} u ON u.ID = g.user_id WHERE {$clause}";
        $total = (int) ($args ? $wpdb->get_var($wpdb->prepare($count, $args)) : $wpdb->get_var($count));
        return Nevari_Helpers::success([
            'items' => $rows,
            'pagination' => ['page' => $page, 'per_page' => $per_page, 'total' => $total, 'pages' => (int) ceil($total / $per_page)],
        ]);
    }

    private static function ensure_directory_rows(): void {
        global $wpdb;
        $users = get_users(['role__in' => array_merge(self::STAFF_ROLES, self::PATIENT_ROLES), 'fields' => 'all']);
        foreach ($users as $user) {
            $role = self::primary_role($user);
            if ($role === '') {
                continue;
            }
            $existing_role = (string) $wpdb->get_var($wpdb->prepare(
                'SELECT managed_role FROM ' . self::table() . ' WHERE user_id = %d',
                (int) $user->ID
            ));
            if ($existing_role !== '' && $existing_role !== $role) {
                $wpdb->update(self::table(), [
                    'managed_role' => $role,
                    'previous_status' => null,
                    'account_status' => $role === 'nurse' ? 'pending_review' : 'approved',
                    'updated_at' => Nevari_Helpers::now(),
                ], ['user_id' => (int) $user->ID]);
                self::revoke_sessions((int) $user->ID);
                self::audit_event('user.role_synchronized', (int) $user->ID, Nevari_Auth::api_session_user_id(), 'success', $existing_role, $role);
                continue;
            }
            $wpdb->query($wpdb->prepare(
                'INSERT IGNORE INTO ' . self::table() . ' (user_id,managed_role,account_status,created_at,updated_at) VALUES (%d,%s,%s,%s,%s)',
                (int) $user->ID,
                $role,
                $role === 'nurse' ? 'pending_review' : 'approved',
                Nevari_Helpers::now(),
                Nevari_Helpers::now()
            ));
        }
    }

    public static function nurses_index(WP_REST_Request $request): WP_REST_Response {
        $request->set_param('role', 'nurse');
        $request->set_param('status', 'approved');
        return self::users_index($request);
    }

    public static function update_access(WP_REST_Request $request): WP_REST_Response {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];
        if (array_diff(array_keys($body), ['role', 'permissions', 'reason'])) {
            return Nevari_Helpers::error('unexpected_fields', 'Unexpected request fields were supplied.', 422);
        }
        $target_id = absint($request['id']);
        $target = get_user_by('id', $target_id);
        if (!$target instanceof WP_User) {
            return Nevari_Helpers::error('not_found', 'This staff account was not found.', 404);
        }
        $role = isset($body['role']) ? sanitize_key((string) $body['role']) : self::primary_role($target);
        if (!in_array($role, self::STAFF_ROLES, true)) {
            return Nevari_Helpers::error('invalid_role', 'The selected staff role is not allowed.', 422);
        }
        $permissions = isset($body['permissions']) && is_array($body['permissions'])
            ? array_values(array_unique(array_map('sanitize_key', $body['permissions'])))
            : self::permission_keys_for_user($target_id);
        if (array_diff($permissions, array_keys(self::PERMISSIONS))) {
            return Nevari_Helpers::error('invalid_permissions', 'One or more permissions are invalid.', 422);
        }
        if ($role === 'administrator') {
            $permissions = array_keys(self::PERMISSIONS);
        } elseif (!in_array($role, self::CUSTOM_PERMISSION_ROLES, true)) {
            $permissions = self::default_permissions_for_role($role);
        }
        $before_role = self::primary_role($target);
        $before_permissions = self::permission_keys_for_user($target_id);
        if ($role !== $before_role) {
            $role_update = wp_update_user([
                'ID' => $target_id,
                'role' => $role,
            ]);
            if (is_wp_error($role_update)) {
                return Nevari_Helpers::error('role_change_failed', 'The WordPress user role could not be updated.', 409);
            }
            clean_user_cache($target_id);
            $target = get_user_by('id', $target_id);
            if (!$target instanceof WP_User || !in_array($role, (array) $target->roles, true)) {
                return Nevari_Helpers::error('role_change_failed', 'The WordPress user role update could not be verified.', 409);
            }
        }
        foreach (self::PERMISSIONS as $key => $capability) {
            if (in_array($key, $permissions, true)) {
                $target->add_cap($capability);
            } else {
                $target->remove_cap($capability);
            }
        }
        global $wpdb;
        $wpdb->update(self::table(), ['managed_role' => $role, 'updated_at' => Nevari_Helpers::now()], ['user_id' => $target_id]);
        self::revoke_sessions($target_id);
        Nevari_Audit::log('security', 'nevari', 'admin.staff_access_updated', 'success', [
            'actor_user_id' => Nevari_Auth::api_session_user_id(),
            'related_user_id' => $target_id,
            'object_type' => 'user',
            'object_id' => $target_id,
            'message' => 'Administrator updated a staff role or storefront permissions.',
            'metadata' => [
                'from_role' => $before_role,
                'to_role' => $role,
                'permissions_before' => $before_permissions,
                'permissions_after' => $permissions,
                'reason' => substr(sanitize_text_field((string) ($body['reason'] ?? '')), 0, 500),
            ],
        ]);
        $notification = $role !== $before_role
            ? self::notify_role_change($target, $before_role, $role)
            : self::notify_access_change($target, $role, $permissions);
        return Nevari_Helpers::success([
            'user' => array_merge(Nevari_Helpers::user_summary($target_id) ?: [], [
                'user_id' => $target_id,
                'managed_role' => $role,
                'permissions' => $permissions,
            ]),
            'notification' => $notification,
        ]);
    }

    public static function mutate_user(WP_REST_Request $request): WP_REST_Response {
        $body = $request->get_json_params();
        $body = is_array($body) ? $body : [];
        $target_id = absint($request['id']);
        $action = sanitize_key((string) $request['action']);
        if (array_diff(array_keys($body), ['reason'])) {
            self::audit_event('user.' . $action, $target_id, Nevari_Auth::api_session_user_id(), 'error', '', '', 'unexpected_fields');
            return Nevari_Helpers::error('unexpected_fields', 'Unexpected request fields were supplied.', 422);
        }
        $reason = substr(sanitize_text_field((string) ($body['reason'] ?? '')), 0, 500);
        global $wpdb;
        if ($action === 'reset-password') {
            $target = get_user_by('id', $target_id);
            if (!$target instanceof WP_User) {
                self::audit_event('user.password_reset_requested', $target_id, Nevari_Auth::api_session_user_id(), 'error', '', '', 'target_not_found');
                return Nevari_Helpers::error('not_found', 'This user was not found.', 404);
            }
            $result = Nevari_Auth::request_dashboard_password_reset_for_user($target);
            if (is_wp_error($result)) {
                self::audit_event('user.password_reset_requested', $target_id, Nevari_Auth::api_session_user_id(), 'error', '', '', 'notification_failed');
                return Nevari_Helpers::error('reset_failed', 'The dashboard password reset email could not be sent.', 500);
            }
            self::audit_event('user.password_reset_requested', $target_id, Nevari_Auth::api_session_user_id(), 'success');
            $notification = self::notify_actor_confirmation($target, 'password reset requested');
            if (empty($result['queued'])) {
                self::audit_event('user.password_reset_notification_failed', $target_id, Nevari_Auth::api_session_user_id(), 'error', '', '', 'notification_failed');
                $notification = [
                    'queued' => false,
                    'warning' => sanitize_text_field((string) ($result['warning'] ?? 'The reset request was recorded, but the email could not be delivered.')),
                ];
            }
            return Nevari_Helpers::success([
                'user' => self::directory_user_summary($target_id),
                'user_id' => $target_id,
                'status' => 'reset_requested',
                'frontend_type' => sanitize_key((string) ($result['frontend_type'] ?? '')),
                'notification' => $notification,
            ]);
        }
        $wpdb->query('START TRANSACTION');
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT * FROM ' . self::table() . ' WHERE user_id = %d FOR UPDATE',
            $target_id
        ), ARRAY_A);
        if (!$row) {
            $wpdb->query('ROLLBACK');
            self::audit_event('user.' . $action, $target_id, Nevari_Auth::api_session_user_id(), 'error', '', '', 'not_managed');
            return Nevari_Helpers::error('not_managed', 'This user is not managed.', 404);
        }
        $role = self::managed_role(get_user_by('id', $target_id));
        if (!$role || $role !== $row['managed_role']) {
            $wpdb->query('ROLLBACK');
            self::audit_event('user.' . $action, $target_id, Nevari_Auth::api_session_user_id(), 'error', (string) $row['managed_role'], $role, 'role_changed');
            return Nevari_Helpers::error('role_changed', 'The user role changed. Refresh and try again.', 409);
        }
        if (in_array($action, ['approve', 'decline'], true) && $role !== 'nurse') {
            $wpdb->query('ROLLBACK');
            self::audit_event('user.' . $action, $target_id, Nevari_Auth::api_session_user_id(), 'error', (string) $row['account_status'], '', 'invalid_action');
            return Nevari_Helpers::error('invalid_action', 'Only nurse applications use approval decisions.', 422);
        }
        $next = ['approve' => 'approved', 'decline' => 'declined', 'ban' => 'banned', 'unban' => 'approved', 'suspend' => 'suspended'][$action];
        $now = Nevari_Helpers::now();
        $updated = $wpdb->update(self::table(), [
            'previous_status' => $row['account_status'],
            'account_status' => $next,
            'decision_reason' => $reason,
            'decided_by' => Nevari_Auth::api_session_user_id(),
            'decided_at' => $now,
            'updated_at' => $now,
        ], ['user_id' => $target_id]);
        if ($updated === false) {
            $wpdb->query('ROLLBACK');
            self::audit_event('user.' . $action, $target_id, Nevari_Auth::api_session_user_id(), 'error', (string) $row['account_status'], $next, 'mutation_failed');
            return Nevari_Helpers::error('mutation_failed', 'The user account could not be updated.', 500);
        }
        if (in_array($next, ['declined', 'banned', 'suspended'], true)) {
            self::revoke_sessions($target_id);
        }
        if ($role === 'nurse' && $next === 'banned') {
            self::flag_reassignment($target_id);
        }
        $wpdb->query('COMMIT');
        self::audit_event(
            'user.' . $action,
            $target_id,
            Nevari_Auth::api_session_user_id(),
            'success',
            (string) $row['account_status'],
            $next,
            '',
            ['reason' => $reason]
        );
        $user_notification = self::notify_status_change($target_id, $next);
        $notification = self::notify_actor_confirmation(get_user_by('id', $target_id), $action);
        if (empty($user_notification['queued'])) {
            $notification = [
                'queued' => false,
                'warning' => $user_notification['warning'] ?: ($notification['warning'] ?? ''),
            ];
        }
        return Nevari_Helpers::success([
            'user' => self::directory_user_summary($target_id, $role, $next),
            'user_id' => $target_id,
            'status' => $next,
            'notification' => $notification,
        ]);
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

    private static function primary_role(WP_User $user): string {
        foreach (array_merge(self::STAFF_ROLES, self::PATIENT_ROLES) as $role) {
            if (in_array($role, (array) $user->roles, true)) {
                return $role;
            }
        }
        return '';
    }

    private static function notify_access_change(WP_User $target, string $role, array $permissions): array {
        $actor = get_user_by('id', Nevari_Auth::api_session_user_id());
        $summary = sprintf(
            'Your Nevari staff access was updated. Role: %s. Dashboard areas: %s.',
            ucwords(str_replace('_', ' ', $role)),
            $permissions ? implode(', ', $permissions) : 'none'
        );
        $target_result = Nevari_Emails::queue_or_send([
            'recipient_user_id' => (int) $target->ID,
            'subject' => 'Your Nevari staff access was updated',
            'body_html' => '<p>' . esc_html($summary) . '</p>',
            'body_text' => $summary,
            'related_object_type' => 'user',
            'related_object_id' => (int) $target->ID,
        ]);
        $actor_result = $actor instanceof WP_User ? Nevari_Emails::queue_or_send([
            'recipient_user_id' => (int) $actor->ID,
            'subject' => 'Nevari staff access update confirmed',
            'body_html' => '<p>' . esc_html(sprintf('You updated access for %s.', $target->display_name)) . '</p>',
            'body_text' => sprintf('You updated access for %s.', $target->display_name),
            'related_object_type' => 'user',
            'related_object_id' => (int) $target->ID,
        ]) : true;
        $failed = is_wp_error($target_result) || is_wp_error($actor_result);
        if ($failed) {
            Nevari_Audit::log('emails', 'nevari', 'admin.staff_access_notification_failed', 'error', [
                'actor_user_id' => Nevari_Auth::api_session_user_id(),
                'related_user_id' => (int) $target->ID,
                'object_type' => 'user',
                'object_id' => (int) $target->ID,
                'message' => 'Staff access was saved but a notification could not be queued.',
                'error_code' => 'notification_failed',
            ]);
        }
        return ['queued' => !$failed, 'warning' => $failed ? 'Access was saved, but a notification could not be queued.' : ''];
    }

    private static function notify_role_change($target, string $before_role, string $target_role): array {
        if (!$target instanceof WP_User) {
            return ['queued' => false, 'warning' => 'Role changed, but the notification recipient was unavailable.'];
        }
        $previous_role = ucwords(str_replace('_', ' ', $before_role));
        $new_role = ucwords(str_replace('_', ' ', $target_role));
        $target_result = Nevari_Emails::queue_or_send([
            'template_key' => 'account_role_updated',
            'recipient_user_id' => (int) $target->ID,
            'recipient_email' => $target->user_email,
            'variables' => [
                'display_name' => $target->display_name ?: $target->user_login,
                'previous_role' => $previous_role,
                'new_role' => $new_role,
                'support_email' => sanitize_email((string) get_option('admin_email')),
            ],
            'related_object_type' => 'user_governance',
            'related_object_id' => (int) $target->ID,
        ], false);
        $actor_result = self::notify_actor_confirmation($target, 'role change');
        $failed = is_wp_error($target_result) || empty($actor_result['queued']);
        if ($failed) {
            self::audit_event('admin.user_role_notification_failed', (int) $target->ID, Nevari_Auth::api_session_user_id(), 'error', $before_role, $target_role, 'notification_failed');
        }
        return [
            'queued' => !$failed,
            'warning' => $failed ? 'Role changed, but one or more notification emails could not be queued.' : '',
        ];
    }

    private static function notify_status_change(int $user_id, string $status): array {
        $user = get_user_by('id', $user_id);
        if (!$user instanceof WP_User) {
            return ['queued' => false, 'warning' => 'Status changed, but the notification recipient was unavailable.'];
        }
        $status_label = ucwords(str_replace('_', ' ', sanitize_key($status)));
        $message = sprintf('Your Nevari account status is now %s.', $status_label);
        $result = Nevari_Emails::queue_or_send([
            'recipient_user_id' => $user_id,
            'recipient_email' => $user->user_email,
            'subject' => 'Your Nevari account status was updated',
            'body_html' => '<p>' . esc_html($message) . '</p>',
            'body_text' => $message,
            'related_object_type' => 'user_governance',
            'related_object_id' => $user_id,
        ], false);
        if (is_wp_error($result)) {
            self::audit_event('admin.status_notification_failed', $user_id, Nevari_Auth::api_session_user_id(), 'error', '', $status, 'notification_failed');
            return ['queued' => false, 'warning' => 'Status changed, but the user notification could not be queued.'];
        }
        return ['queued' => true, 'warning' => ''];
    }

    private static function directory_user_summary(int $user_id, string $role = '', string $status = ''): array {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare(
            'SELECT managed_role,account_status,phone,license_number,updated_at FROM ' . self::table() . ' WHERE user_id = %d',
            $user_id
        ), ARRAY_A) ?: [];
        $summary = Nevari_Helpers::user_summary($user_id) ?: [];
        $user = get_user_by('id', $user_id);
        $resolved_role = $role ?: (string) ($row['managed_role'] ?? '');
        $resolved_status = $status ?: (string) ($row['account_status'] ?? 'approved');
        return array_merge($summary, [
            'user_id' => $user_id,
            'user_email' => $user instanceof WP_User ? $user->user_email : (string) ($summary['email'] ?? ''),
            'managed_role' => $resolved_role,
            'roles' => $resolved_role ? [$resolved_role] : [],
            'account_status' => $resolved_status,
            'phone' => (string) ($row['phone'] ?? ''),
            'license_number' => (string) ($row['license_number'] ?? ''),
            'permissions' => self::permission_keys_for_user($user_id),
            'last_activity' => (string) ($row['updated_at'] ?? ''),
        ]);
    }

    private static function notify_actor_confirmation($target, string $action): array {
        $actor = get_user_by('id', Nevari_Auth::api_session_user_id());
        if (!$actor instanceof WP_User || !$target instanceof WP_User) {
            return ['queued' => false, 'warning' => 'Action completed, but the confirmation recipient was unavailable.'];
        }
        $message = sprintf('You completed the “%s” action for %s.', sanitize_text_field($action), $target->display_name);
        $result = Nevari_Emails::queue_or_send([
            'recipient_user_id' => (int) $actor->ID,
            'subject' => 'Nevari administrator action confirmed',
            'body_html' => '<p>' . esc_html($message) . '</p>',
            'body_text' => $message,
            'related_object_type' => 'user',
            'related_object_id' => (int) $target->ID,
        ]);
        if (is_wp_error($result)) {
            Nevari_Audit::log('emails', 'nevari', 'admin.action_notification_failed', 'error', [
                'actor_user_id' => (int) $actor->ID,
                'related_user_id' => (int) $target->ID,
                'object_type' => 'user',
                'object_id' => (int) $target->ID,
                'message' => 'Administrator action completed but confirmation email could not be queued.',
                'error_code' => 'notification_failed',
            ]);
            return ['queued' => false, 'warning' => 'Action completed, but the confirmation email could not be queued.'];
        }
        return ['queued' => true, 'warning' => ''];
    }

    public static function backfill_existing_users(): void {
        global $wpdb;
        $cursor = absint(get_option('nevari_user_governance_backfill_cursor', 0));
        $ids = $wpdb->get_col($wpdb->prepare("SELECT ID FROM {$wpdb->users} WHERE ID > %d ORDER BY ID ASC LIMIT 100", $cursor));
        foreach ($ids as $id) {
            $user = get_user_by('id', (int) $id);
            $role = self::managed_role($user);
            if ($role) {
                $status = $role === 'nurse'
                    ? 'pending_review'
                    : ($role === 'doctor' && get_user_meta($user->ID, '_nevari_doctor_disabled', true) ? 'banned' : 'approved');
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
        self::audit_event($action, $target_id, $actor_id, 'success');
    }

    private static function audit_event(
        string $action,
        int $target_id,
        int $actor_id,
        string $outcome,
        string $before = '',
        string $after = '',
        string $failure_category = '',
        array $metadata = []
    ): void {
        $safe_metadata = $metadata;
        if ($before !== '') {
            $safe_metadata['before'] = sanitize_text_field($before);
        }
        if ($after !== '') {
            $safe_metadata['after'] = sanitize_text_field($after);
        }
        if ($failure_category !== '') {
            $safe_metadata['failure_category'] = sanitize_key($failure_category);
        }
        Nevari_Audit::log('security', 'nevari', $action, $outcome === 'error' ? 'error' : 'success', [
            'actor_user_id' => $actor_id ?: null,
            'related_user_id' => $target_id,
            'object_type' => 'user_governance',
            'object_id' => $target_id,
            'message' => $outcome === 'error' ? 'Managed user administrative action failed.' : 'Managed user administrative action completed.',
            'error_code' => $failure_category ?: null,
            'metadata' => $safe_metadata,
        ]);
    }
}
