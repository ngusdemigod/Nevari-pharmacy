<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Admin {
    private const RATE_LIMIT_OPTION = 'nevari_rate_limit_settings';

    public static function init(): void {
        add_action('admin_menu', [__CLASS__, 'admin_menu']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue']);
    }

    public static function admin_menu(): void {
        add_menu_page(
            __('Nevari Pharmacy', 'nevari-pharmacy-core'),
            __('Nevari Pharmacy', 'nevari-pharmacy-core'),
            'nevari_manage_store',
            'nevari-pharmacy',
            [__CLASS__, 'render_connections_page'],
            'dashicons-shield-alt',
            56
        );

        add_submenu_page(
            'nevari-pharmacy',
            __('Connections', 'nevari-pharmacy-core'),
            __('Connections', 'nevari-pharmacy-core'),
            'nevari_manage_store',
            'nevari-pharmacy',
            [__CLASS__, 'render_connections_page']
        );

        add_submenu_page(
            'nevari-pharmacy',
            __('Audit Logs', 'nevari-pharmacy-core'),
            __('Audit Logs', 'nevari-pharmacy-core'),
            'nevari_read_audit_logs',
            'nevari-store',
            [__CLASS__, 'render_audit_page']
        );
    }

    public static function enqueue($hook): void {
        if (in_array($hook, ['toplevel_page_nevari-pharmacy', 'nevari-pharmacy_page_nevari-store'], true)) {
            wp_enqueue_style('nevari-admin', NEVARI_PHARMACY_URL . 'assets/admin.css', [], NEVARI_PHARMACY_VERSION);
        }
    }

    public static function render_connections_page(): void {
        if (!current_user_can('nevari_manage_store')) {
            wp_die(esc_html__('You do not have permission to view this page.', 'nevari-pharmacy-core'));
        }

        $generated = null;
        if ('POST' === strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') && isset($_POST['nevari_connections_action'])) {
            check_admin_referer('nevari_connections_action');
            $action = sanitize_key(wp_unslash($_POST['nevari_connections_action']));
            if ($action === 'generate_pairing_code') {
                $frontend_type = isset($_POST['frontend_type']) ? sanitize_key(wp_unslash($_POST['frontend_type'])) : '';
                try {
                    $generated = Nevari_Connections::create_pairing_code($frontend_type, get_current_user_id());
                } catch (InvalidArgumentException $exception) {
                    echo '<div class="notice notice-error"><p>' . esc_html($exception->getMessage()) . '</p></div>';
                }
            }
        }

        $pairings = Nevari_Connections::recent_pairing_sessions(8);
        $connections = Nevari_Connections::trusted_frontends();
        ?>
        <div class="wrap nevari-admin-wrap">
            <h1><?php echo esc_html__('Nevari Pharmacy Connections', 'nevari-pharmacy-core'); ?></h1>
            <p><?php echo esc_html__('Generate a one-time pairing code for each frontend application. The code includes this site URL, expires after 10 minutes, and is invalidated immediately after successful use.', 'nevari-pharmacy-core'); ?></p>

            <?php if ($generated) : ?>
                <div class="notice notice-success">
                    <p><strong><?php echo esc_html(Nevari_Connections::frontend_types()[$generated['frontend_type']] ?? $generated['frontend_type']); ?></strong></p>
                    <p><code style="font-size:18px;"><?php echo esc_html($generated['code']); ?></code></p>
                    <p><?php echo esc_html(sprintf(__('Site URL: %s', 'nevari-pharmacy-core'), $generated['site_url'])); ?></p>
                    <p><?php echo esc_html(sprintf(__('Expires at %s', 'nevari-pharmacy-core'), $generated['expires_at'])); ?></p>
                </div>
            <?php endif; ?>

            <div class="notice notice-info inline">
                <p><?php echo esc_html__('Debug tip: generate a new code, then confirm a fresh pending session appears below with a new session UUID and hash prefix. If verification still returns pairing_not_found, generation and verification are not using the same stored pairing record.', 'nevari-pharmacy-core'); ?></p>
            </div>

            <h2><?php echo esc_html__('Pair Frontend Applications', 'nevari-pharmacy-core'); ?></h2>
            <div class="nevari-connection-grid">
                <?php foreach (Nevari_Connections::frontend_types() as $key => $label) : ?>
                    <div class="card" style="max-width:420px; padding:20px; margin:0 20px 20px 0; display:inline-block; vertical-align:top;">
                        <h3><?php echo esc_html($label); ?></h3>
                        <p><?php echo esc_html__('Generate a one-time pairing code for this frontend.', 'nevari-pharmacy-core'); ?></p>
                        <form method="post">
                            <?php wp_nonce_field('nevari_connections_action'); ?>
                            <input type="hidden" name="nevari_connections_action" value="generate_pairing_code" />
                            <input type="hidden" name="frontend_type" value="<?php echo esc_attr($key); ?>" />
                            <?php submit_button(sprintf(__('Pair %s', 'nevari-pharmacy-core'), $label), 'primary', '', false); ?>
                        </form>
                    </div>
                <?php endforeach; ?>
            </div>

            <h2><?php echo esc_html__('Recent Pairing Sessions', 'nevari-pharmacy-core'); ?></h2>
            <table class="widefat striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e('Session', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Frontend', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Status', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Hint', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Hash Prefix', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Origin', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Created', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Verified', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Used', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Expires', 'nevari-pharmacy-core'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (!$pairings) : ?>
                        <tr><td colspan="10"><?php esc_html_e('No pairing sessions yet.', 'nevari-pharmacy-core'); ?></td></tr>
                    <?php else : ?>
                        <?php foreach ($pairings as $pairing) : ?>
                            <tr>
                                <td><code><?php echo esc_html($pairing['session_uuid']); ?></code></td>
                                <td><?php echo esc_html(Nevari_Connections::frontend_types()[$pairing['frontend_type']] ?? $pairing['frontend_type']); ?></td>
                                <td><?php echo esc_html($pairing['status']); ?></td>
                                <td><?php echo esc_html($pairing['code_hint'] ? '***' . $pairing['code_hint'] : ''); ?></td>
                                <td><code><?php echo esc_html($pairing['code_hash_prefix'] ? $pairing['code_hash_prefix'] . '...' : '-'); ?></code></td>
                                <td><?php echo esc_html($pairing['verified_origin'] ?: $pairing['requested_origin'] ?: '—'); ?></td>
                                <td><?php echo esc_html($pairing['created_at']); ?></td>
                                <td><?php echo esc_html($pairing['verified_at'] ?: '-'); ?></td>
                                <td><?php echo esc_html($pairing['used_at'] ?: '-'); ?></td>
                                <td><?php echo esc_html($pairing['expires_at']); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>

            <h2 style="margin-top:24px;"><?php echo esc_html__('Trusted Frontends', 'nevari-pharmacy-core'); ?></h2>
            <table class="widefat striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e('Frontend', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Origin', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('URL', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Trust', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Paired', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Last Seen', 'nevari-pharmacy-core'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (!$connections) : ?>
                        <tr><td colspan="6"><?php esc_html_e('No frontend applications have been paired yet.', 'nevari-pharmacy-core'); ?></td></tr>
                    <?php else : ?>
                        <?php foreach ($connections as $connection) : ?>
                            <tr>
                                <td><?php echo esc_html(Nevari_Connections::frontend_types()[$connection['frontend_type']] ?? $connection['frontend_type']); ?></td>
                                <td><code><?php echo esc_html($connection['frontend_origin']); ?></code></td>
                                <td><?php echo esc_html($connection['frontend_url']); ?></td>
                                <td><?php echo esc_html($connection['trust_status']); ?></td>
                                <td><?php echo esc_html($connection['paired_at']); ?></td>
                                <td><?php echo esc_html($connection['last_seen_at'] ?: '—'); ?></td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
        </div>
        <?php
    }

    public static function render_audit_page(): void {
        if (!current_user_can('nevari_read_audit_logs')) {
            wp_die(esc_html__('You do not have permission to view this page.', 'nevari-pharmacy-core'));
        }

        $tabs = [
            'orders' => 'ORDERS',
            'payments' => 'PAYMENTS',
            'security' => 'SECURITY',
            'consultation' => 'CONSULTATION',
            'emails' => 'EMAILS',
            'rate-limits' => 'RATE LIMITS',
        ];
        $active = isset($_GET['tab']) ? sanitize_key(wp_unslash($_GET['tab'])) : 'orders';
        if (!isset($tabs[$active])) {
            $active = 'orders';
        }

        if ($active === 'rate-limits' && 'POST' === strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') && self::can_manage_rate_limits()) {
            self::handle_rate_limit_settings_save();
        }

        $args = null;
        $result = null;
        $total_pages = 1;
        if ($active !== 'rate-limits') {
            $args = [
                'category' => $active,
                'status' => isset($_GET['status']) ? sanitize_key(wp_unslash($_GET['status'])) : '',
                'source' => isset($_GET['source']) ? sanitize_key(wp_unslash($_GET['source'])) : '',
                'search' => isset($_GET['s']) ? sanitize_text_field(wp_unslash($_GET['s'])) : '',
                'date_from' => isset($_GET['date_from']) ? sanitize_text_field(wp_unslash($_GET['date_from'])) : '',
                'date_to' => isset($_GET['date_to']) ? sanitize_text_field(wp_unslash($_GET['date_to'])) : '',
                'page' => isset($_GET['paged']) ? max(1, (int) $_GET['paged']) : 1,
                'per_page' => 25,
            ];
            $result = Nevari_Audit::query($args);
            $total_pages = max(1, (int) ceil($result['total'] / $result['per_page']));
        }

        ?>
        <div class="wrap nevari-admin-wrap">
            <h1><?php echo esc_html__('Nevari store', 'nevari-pharmacy-core'); ?></h1>
            <nav class="nav-tab-wrapper nevari-tabs">
                <?php foreach ($tabs as $key => $label) : ?>
                    <a class="nav-tab <?php echo $active === $key ? 'nav-tab-active' : ''; ?>" href="<?php echo esc_url(admin_url('admin.php?page=nevari-store&tab=' . $key)); ?>"><?php echo esc_html($label); ?></a>
                <?php endforeach; ?>
            </nav>

            <?php if ($active === 'rate-limits') : ?>
                <?php self::render_rate_limit_settings_tab(); ?>
            <?php else : ?>
                <form method="get" class="nevari-audit-filters">
                    <input type="hidden" name="page" value="nevari-store" />
                    <input type="hidden" name="tab" value="<?php echo esc_attr($active); ?>" />
                    <select name="status">
                        <option value=""><?php esc_html_e('All statuses', 'nevari-pharmacy-core'); ?></option>
                        <option value="success" <?php selected($args['status'], 'success'); ?>>Success</option>
                        <option value="error" <?php selected($args['status'], 'error'); ?>>Error</option>
                    </select>
                    <select name="source">
                        <option value=""><?php esc_html_e('All sources', 'nevari-pharmacy-core'); ?></option>
                        <option value="woocommerce" <?php selected($args['source'], 'woocommerce'); ?>>WooCommerce</option>
                        <option value="wordpress" <?php selected($args['source'], 'wordpress'); ?>>WordPress</option>
                        <option value="nevari" <?php selected($args['source'], 'nevari'); ?>>Nevari</option>
                        <option value="system" <?php selected($args['source'], 'system'); ?>>System</option>
                    </select>
                    <input type="date" name="date_from" value="<?php echo esc_attr($args['date_from']); ?>" />
                    <input type="date" name="date_to" value="<?php echo esc_attr($args['date_to']); ?>" />
                    <input type="search" name="s" placeholder="<?php esc_attr_e('Search action/message/error', 'nevari-pharmacy-core'); ?>" value="<?php echo esc_attr($args['search']); ?>" />
                    <?php submit_button(__('Filter', 'nevari-pharmacy-core'), 'secondary', '', false); ?>
                </form>

                <table class="widefat striped nevari-audit-table">
                    <thead>
                        <tr>
                            <th><?php esc_html_e('Timestamp', 'nevari-pharmacy-core'); ?></th>
                            <th><?php esc_html_e('Status', 'nevari-pharmacy-core'); ?></th>
                            <th><?php esc_html_e('Severity', 'nevari-pharmacy-core'); ?></th>
                            <th><?php esc_html_e('Source', 'nevari-pharmacy-core'); ?></th>
                            <th><?php esc_html_e('Action', 'nevari-pharmacy-core'); ?></th>
                            <th><?php esc_html_e('Actor', 'nevari-pharmacy-core'); ?></th>
                            <th><?php esc_html_e('Related IDs', 'nevari-pharmacy-core'); ?></th>
                            <th><?php esc_html_e('Message / Error', 'nevari-pharmacy-core'); ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php if (empty($result['items'])) : ?>
                            <tr><td colspan="8"><?php esc_html_e('No audit events found.', 'nevari-pharmacy-core'); ?></td></tr>
                        <?php else : ?>
                            <?php foreach ($result['items'] as $item) : ?>
                                <tr>
                                    <td><?php echo esc_html($item['created_at']); ?></td>
                                    <td><span class="nevari-status nevari-status-<?php echo esc_attr($item['status']); ?>"><?php echo esc_html($item['status']); ?></span></td>
                                    <td><?php echo esc_html($item['severity']); ?></td>
                                    <td><?php echo esc_html($item['source']); ?></td>
                                    <td><code><?php echo esc_html($item['action']); ?></code></td>
                                    <td>
                                        <?php echo $item['actor_user_id'] ? esc_html('#' . $item['actor_user_id']) : '—'; ?><br />
                                        <small><?php echo esc_html($item['actor_role'] ?: ''); ?></small>
                                    </td>
                                    <td>
                                        <?php
                                        $ids = [];
                                        foreach (['order_id', 'appointment_id', 'prescription_id', 'email_log_id', 'product_id'] as $field) {
                                            if (!empty($item[$field])) {
                                                $ids[] = $field . ': ' . $item[$field];
                                            }
                                        }
                                        echo esc_html($ids ? implode(' | ', $ids) : '—');
                                        ?>
                                    </td>
                                    <td>
                                        <?php echo esc_html($item['message'] ?: ''); ?>
                                        <?php if (!empty($item['error_message'])) : ?>
                                            <br /><strong><?php echo esc_html($item['error_code']); ?>:</strong> <?php echo esc_html($item['error_message']); ?>
                                        <?php endif; ?>
                                        <?php if (!empty($item['metadata'])) : ?>
                                            <details><summary><?php esc_html_e('Metadata', 'nevari-pharmacy-core'); ?></summary><pre><?php echo esc_html(wp_json_encode($item['metadata'], JSON_PRETTY_PRINT)); ?></pre></details>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>

                <div class="tablenav bottom">
                    <div class="tablenav-pages">
                        <?php
                        $base_url = admin_url('admin.php?page=nevari-store&tab=' . $active);
                        if ($args['status']) { $base_url = add_query_arg('status', $args['status'], $base_url); }
                        if ($args['source']) { $base_url = add_query_arg('source', $args['source'], $base_url); }
                        if ($args['search']) { $base_url = add_query_arg('s', rawurlencode($args['search']), $base_url); }
                        echo esc_html(sprintf(__('Page %1$d of %2$d', 'nevari-pharmacy-core'), $result['page'], $total_pages));
                        if ($result['page'] > 1) {
                            echo ' <a class="button" href="' . esc_url(add_query_arg('paged', $result['page'] - 1, $base_url)) . '">&laquo; ' . esc_html__('Previous', 'nevari-pharmacy-core') . '</a>';
                        }
                        if ($result['page'] < $total_pages) {
                            echo ' <a class="button" href="' . esc_url(add_query_arg('paged', $result['page'] + 1, $base_url)) . '">' . esc_html__('Next', 'nevari-pharmacy-core') . ' &raquo;</a>';
                        }
                        ?>
                    </div>
                </div>
            <?php endif; ?>
        </div>
        <?php
    }

    private static function render_rate_limit_settings_tab(): void {
        if (isset($_GET['updated'])) {
            echo '<div class="notice notice-success is-dismissible"><p>' . esc_html__('Rate limit settings updated.', 'nevari-pharmacy-core') . '</p></div>';
        }

        if (!self::can_manage_rate_limits()) {
            echo '<p>' . esc_html__('You do not have permission to manage rate limits.', 'nevari-pharmacy-core') . '</p>';
            return;
        }

        $settings = Nevari_Helpers::rate_limit_settings();
        $fields = self::rate_limit_fields();
        ?>
        <form method="post" class="nevari-rate-limit-settings">
            <?php wp_nonce_field('nevari_rate_limit_settings'); ?>
            <input type="hidden" name="nevari_action" value="save_rate_limits" />
            <table class="widefat striped">
                <thead>
                    <tr>
                        <th><?php esc_html_e('Bucket', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Purpose', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Limit', 'nevari-pharmacy-core'); ?></th>
                        <th><?php esc_html_e('Window (minutes)', 'nevari-pharmacy-core'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($fields as $key => $field) : ?>
                        <?php
                        $limit = isset($settings[$key]['limit']) ? (int) $settings[$key]['limit'] : (int) $field['default_limit'];
                        $window = isset($settings[$key]['window']) ? (int) ceil(((int) $settings[$key]['window']) / MINUTE_IN_SECONDS) : (int) ceil(((int) $field['default_window']) / MINUTE_IN_SECONDS);
                        ?>
                        <tr>
                            <td><code><?php echo esc_html($key); ?></code></td>
                            <td><?php echo esc_html($field['label']); ?></td>
                            <td><input type="number" min="1" name="rate_limits[<?php echo esc_attr($key); ?>][limit]" value="<?php echo esc_attr((string) $limit); ?>" /></td>
                            <td><input type="number" min="1" name="rate_limits[<?php echo esc_attr($key); ?>][window]" value="<?php echo esc_attr((string) $window); ?>" /></td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
            <?php submit_button(__('Save rate limits', 'nevari-pharmacy-core')); ?>
        </form>
        <?php
    }

    private static function handle_rate_limit_settings_save(): void {
        if (!check_admin_referer('nevari_rate_limit_settings')) {
            return;
        }

        $raw = isset($_POST['rate_limits']) && is_array($_POST['rate_limits']) ? wp_unslash($_POST['rate_limits']) : [];
        $fields = self::rate_limit_fields();
        $settings = [];
        foreach ($fields as $key => $field) {
            $limit = isset($raw[$key]['limit']) ? max(1, (int) $raw[$key]['limit']) : (int) $field['default_limit'];
            $window_minutes = isset($raw[$key]['window']) ? max(1, (int) $raw[$key]['window']) : (int) ceil(((int) $field['default_window']) / MINUTE_IN_SECONDS);
            $settings[$key] = [
                'limit' => $limit,
                'window' => $window_minutes * MINUTE_IN_SECONDS,
            ];
        }

        update_option(self::RATE_LIMIT_OPTION, $settings, false);
        wp_safe_redirect(add_query_arg(['page' => 'nevari-store', 'tab' => 'rate-limits', 'updated' => '1'], admin_url('admin.php')));
        exit;
    }

    private static function can_manage_rate_limits(): bool {
        return current_user_can('manage_options') || current_user_can('nevari_manage_store');
    }

    private static function rate_limit_fields(): array {
        return [
            'auth_login_ip' => ['label' => 'Login attempts by IP', 'default_limit' => 5, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_login_user' => ['label' => 'Login attempts by username', 'default_limit' => 10, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_refresh_ip' => ['label' => 'Token refresh by IP', 'default_limit' => 20, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_refresh_token' => ['label' => 'Token refresh by token', 'default_limit' => 10, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_logout_ip' => ['label' => 'Logout by IP', 'default_limit' => 30, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_logout_token' => ['label' => 'Logout by token', 'default_limit' => 10, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'pairing_verify' => ['label' => 'Pairing verification attempts', 'default_limit' => 20, 'default_window' => 10 * MINUTE_IN_SECONDS],
            'pairing_register' => ['label' => 'Frontend registration attempts', 'default_limit' => 20, 'default_window' => 10 * MINUTE_IN_SECONDS],
            'rest_orders_read' => ['label' => 'Orders read', 'default_limit' => 120, 'default_window' => MINUTE_IN_SECONDS],
            'rest_orders_write' => ['label' => 'Orders write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],
            'rest_orders_action' => ['label' => 'Order actions', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],
            'rest_products_read' => ['label' => 'Products read', 'default_limit' => 120, 'default_window' => MINUTE_IN_SECONDS],
            'rest_products_write' => ['label' => 'Products write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],
            'rest_terms_read' => ['label' => 'Taxonomy reads', 'default_limit' => 120, 'default_window' => MINUTE_IN_SECONDS],
            'rest_terms_write' => ['label' => 'Taxonomy writes', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],
            'rest_doctors_read' => ['label' => 'Doctors read', 'default_limit' => 120, 'default_window' => MINUTE_IN_SECONDS],
            'rest_doctors_write' => ['label' => 'Doctors write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],
            'rest_appointments_read' => ['label' => 'Appointments read', 'default_limit' => 120, 'default_window' => MINUTE_IN_SECONDS],
            'rest_appointments_write' => ['label' => 'Appointments write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],
            'rest_prescriptions_read' => ['label' => 'Prescriptions read', 'default_limit' => 120, 'default_window' => MINUTE_IN_SECONDS],
            'rest_prescriptions_write' => ['label' => 'Prescriptions write', 'default_limit' => 20, 'default_window' => MINUTE_IN_SECONDS],
            'rest_emails_write' => ['label' => 'Email send/template actions', 'default_limit' => 5, 'default_window' => MINUTE_IN_SECONDS],
            'rest_email_logs_read' => ['label' => 'Email logs read', 'default_limit' => 60, 'default_window' => MINUTE_IN_SECONDS],
            'rest_audit_logs_read' => ['label' => 'Audit logs read', 'default_limit' => 60, 'default_window' => MINUTE_IN_SECONDS],
        ];
    }
}
