<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Audit {
    public static function init(): void {
        add_action('wp_login', [__CLASS__, 'log_login_success'], 10, 2);
        add_action('wp_login_failed', [__CLASS__, 'log_login_failed'], 10, 1);
        add_action('password_reset', [__CLASS__, 'log_password_reset'], 10, 2);
    }

    public static function log_login_success(string $user_login, WP_User $user): void {
        self::log('security', 'wordpress', 'auth.login_success', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'User logged in successfully.',
        ]);
    }

    public static function log_login_failed(string $username): void {
        self::log('security', 'wordpress', 'auth.login_failed', 'error', [
            'severity' => 'warning',
            'message' => 'Login failed.',
            'error_code' => 'invalid_credentials',
            'metadata' => ['username' => sanitize_text_field($username)],
        ]);
    }

    public static function log_password_reset(WP_User $user, $new_pass): void {
        self::log('security', 'wordpress', 'user.password_reset', 'success', [
            'actor_user_id' => (int) $user->ID,
            'related_user_id' => (int) $user->ID,
            'message' => 'User password was reset.',
        ]);
    }

    public static function log(string $category, string $source, string $action, string $status, array $args = []): void {
        global $wpdb;
        $table = Nevari_Helpers::table('audit_logs');

        $actor_user_id = array_key_exists('actor_user_id', $args) ? $args['actor_user_id'] : get_current_user_id();
        $roles = $actor_user_id ? Nevari_Helpers::current_user_roles((int) $actor_user_id) : [];
        $actor_role = $args['actor_role'] ?? ($roles ? reset($roles) : null);

        $ip = '';
        if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
            $ip = sanitize_text_field(wp_unslash($_SERVER['HTTP_X_FORWARDED_FOR']));
            $ip = trim(explode(',', $ip)[0]);
        } elseif (!empty($_SERVER['REMOTE_ADDR'])) {
            $ip = sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR']));
        }

        $user_agent = !empty($_SERVER['HTTP_USER_AGENT']) ? substr(sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])), 0, 1000) : null;
        $metadata = isset($args['metadata']) ? Nevari_Helpers::json_encode_safe($args['metadata']) : null;

        $data = [
            'event_uuid' => $args['event_uuid'] ?? wp_generate_uuid4(),
            'category' => sanitize_key($category),
            'source' => sanitize_key($source),
            'action' => sanitize_text_field($action),
            'status' => in_array($status, ['success', 'error'], true) ? $status : 'success',
            'severity' => sanitize_key($args['severity'] ?? ($status === 'error' ? 'error' : 'info')),
            'actor_user_id' => $actor_user_id ? (int) $actor_user_id : null,
            'actor_role' => $actor_role ? sanitize_key((string) $actor_role) : null,
            'actor_ip' => $ip ?: null,
            'user_agent' => $user_agent,
            'object_type' => isset($args['object_type']) ? sanitize_key((string) $args['object_type']) : null,
            'object_id' => isset($args['object_id']) ? (int) $args['object_id'] : null,
            'related_user_id' => isset($args['related_user_id']) ? (int) $args['related_user_id'] : null,
            'order_id' => isset($args['order_id']) ? (int) $args['order_id'] : null,
            'product_id' => isset($args['product_id']) ? (int) $args['product_id'] : null,
            'appointment_id' => isset($args['appointment_id']) ? (int) $args['appointment_id'] : null,
            'prescription_id' => isset($args['prescription_id']) ? (int) $args['prescription_id'] : null,
            'email_log_id' => isset($args['email_log_id']) ? (int) $args['email_log_id'] : null,
            'request_id' => $args['request_id'] ?? Nevari_Helpers::request_id(),
            'message' => isset($args['message']) ? sanitize_text_field((string) $args['message']) : null,
            'error_code' => isset($args['error_code']) ? sanitize_key((string) $args['error_code']) : null,
            'error_message' => isset($args['error_message']) ? sanitize_textarea_field((string) $args['error_message']) : null,
            'metadata' => $metadata,
            'created_at' => Nevari_Helpers::now(),
        ];

        $formats = [
            '%s', '%s', '%s', '%s', '%s', '%s',
            '%d', '%s', '%s', '%s', '%s', '%d',
            '%d', '%d', '%d', '%d', '%d', '%d',
            '%s', '%s', '%s', '%s', '%s', '%s',
        ];

        $result = $wpdb->insert($table, $data, $formats);
        if (false === $result && defined('WP_DEBUG') && WP_DEBUG) {
            error_log('Nevari audit insert failed: ' . $wpdb->last_error); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
        }
    }

    public static function query(array $args = []): array {
        global $wpdb;
        $table = Nevari_Helpers::table('audit_logs');
        $page = max(1, (int) ($args['page'] ?? 1));
        $per_page = min(100, max(1, (int) ($args['per_page'] ?? 20)));
        $offset = ($page - 1) * $per_page;
        $where = ['1=1'];
        $params = [];

        foreach (['category', 'status', 'source', 'action', 'severity'] as $field) {
            if (!empty($args[$field])) {
                $where[] = "{$field} = %s";
                $params[] = sanitize_text_field((string) $args[$field]);
            }
        }

        foreach (['actor_user_id', 'order_id', 'appointment_id', 'prescription_id', 'email_log_id'] as $field) {
            if (!empty($args[$field])) {
                $where[] = "{$field} = %d";
                $params[] = (int) $args[$field];
            }
        }

        if (!empty($args['date_from'])) {
            $date_from = Nevari_Helpers::normalize_datetime($args['date_from']);
            if ($date_from) {
                $where[] = 'created_at >= %s';
                $params[] = $date_from;
            }
        }

        if (!empty($args['date_to'])) {
            $date_to = Nevari_Helpers::normalize_datetime($args['date_to']);
            if ($date_to) {
                $where[] = 'created_at <= %s';
                $params[] = $date_to;
            }
        }

        if (!empty($args['search'])) {
            $like = '%' . $wpdb->esc_like(sanitize_text_field((string) $args['search'])) . '%';
            $where[] = '(message LIKE %s OR error_message LIKE %s OR action LIKE %s)';
            $params[] = $like;
            $params[] = $like;
            $params[] = $like;
        }

        $where_sql = implode(' AND ', $where);
        $count_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}";
        $total = (int) $wpdb->get_var($params ? $wpdb->prepare($count_sql, $params) : $count_sql);

        $sql = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY created_at DESC, id DESC LIMIT %d OFFSET %d";
        $query_params = array_merge($params, [$per_page, $offset]);
        $rows = $wpdb->get_results($wpdb->prepare($sql, $query_params));

        return [
            'items' => array_map([__CLASS__, 'format'], $rows ?: []),
            'total' => $total,
            'page' => $page,
            'per_page' => $per_page,
        ];
    }

    public static function format($row): array {
        return [
            'id' => (int) $row->id,
            'event_uuid' => $row->event_uuid,
            'category' => $row->category,
            'source' => $row->source,
            'action' => $row->action,
            'status' => $row->status,
            'severity' => $row->severity,
            'actor_user_id' => $row->actor_user_id ? (int) $row->actor_user_id : null,
            'actor_role' => $row->actor_role,
            'actor_ip' => $row->actor_ip,
            'object_type' => $row->object_type,
            'object_id' => $row->object_id ? (int) $row->object_id : null,
            'related_user_id' => $row->related_user_id ? (int) $row->related_user_id : null,
            'order_id' => $row->order_id ? (int) $row->order_id : null,
            'product_id' => $row->product_id ? (int) $row->product_id : null,
            'appointment_id' => $row->appointment_id ? (int) $row->appointment_id : null,
            'prescription_id' => $row->prescription_id ? (int) $row->prescription_id : null,
            'email_log_id' => $row->email_log_id ? (int) $row->email_log_id : null,
            'request_id' => $row->request_id,
            'message' => $row->message,
            'error_code' => $row->error_code,
            'error_message' => $row->error_message,
            'metadata' => Nevari_Helpers::json_decode_safe($row->metadata),
            'created_at' => Nevari_Helpers::iso_datetime($row->created_at),
        ];
    }
}
