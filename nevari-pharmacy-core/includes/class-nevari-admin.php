<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Admin {
    private const RATE_LIMIT_OPTION = 'nevari_rate_limit_settings';
    private const PAYMENT_GATEWAY_OPTION = 'nevari_payment_gateway_settings';
    private const GOOGLE_MEET_OAUTH_OPTION = 'nevari_google_meet_oauth_settings';
    private const SHARED_FRONTEND_BASE_URL_OPTION = 'nevari_shared_frontend_base_url';
    private const GOOGLE_MEET_OAUTH_STATE_TRANSIENT = 'nevari_google_meet_oauth_state_';

    public static function init(): void {
        add_action('admin_menu', [__CLASS__, 'admin_menu']);
        add_action('admin_enqueue_scripts', [__CLASS__, 'enqueue']);
        add_action('admin_post_nevari_google_meet_oauth_connect', [__CLASS__, 'handle_google_meet_oauth_connect']);
        add_action('admin_post_nevari_google_meet_oauth_callback', [__CLASS__, 'handle_google_meet_oauth_callback']);
        add_action('admin_post_nevari_google_meet_oauth_disconnect', [__CLASS__, 'handle_google_meet_oauth_disconnect']);
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

        add_submenu_page(
            'nevari-pharmacy',
            __('Payment Gateways', 'nevari-pharmacy-core'),
            __('Payment Gateways', 'nevari-pharmacy-core'),
            'nevari_manage_store',
            'nevari-payment-gateways',
            [__CLASS__, 'render_payment_gateways_page']
        );
    }

    public static function enqueue($hook): void {
        if (in_array($hook, ['toplevel_page_nevari-pharmacy', 'nevari-pharmacy_page_nevari-store', 'nevari-pharmacy_page_nevari-payment-gateways'], true)) {
            wp_enqueue_style('nevari-admin', NEVARI_PHARMACY_URL . 'assets/admin.css', [], NEVARI_PHARMACY_VERSION);
        }
    }

    public static function render_connections_page(): void {
        if (!current_user_can('nevari_manage_store')) {
            wp_die(esc_html__('You do not have permission to view this page.', 'nevari-pharmacy-core'));
        }

        if ('POST' === strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') && isset($_POST['nevari_connections_action'])) {
            check_admin_referer('nevari_connections_action');
            $action = sanitize_key(wp_unslash($_POST['nevari_connections_action']));
            if ($action === 'save_google_meet_oauth') {
                self::handle_google_meet_oauth_settings_save();
                echo '<div class="notice notice-success"><p>' . esc_html__('Google Meet OAuth settings saved.', 'nevari-pharmacy-core') . '</p></div>';
            } elseif ($action === 'save_frontend_base_url') {
                self::handle_shared_frontend_base_url_save();
                echo '<div class="notice notice-success"><p>' . esc_html__('Shared frontend base URL saved.', 'nevari-pharmacy-core') . '</p></div>';
            }
        }

        $oauth = Nevari_Helpers::google_meet_oauth_settings();
        $stored_shared_frontend_base_url = (string) get_option(self::SHARED_FRONTEND_BASE_URL_OPTION, '');
        $shared_frontend_base_url = $stored_shared_frontend_base_url !== ''
            ? $stored_shared_frontend_base_url
            : Nevari_Helpers::shared_frontend_base_url();
        $can_connect_google = !empty($oauth['client_id']) && !empty($oauth['client_secret']);
        self::render_google_meet_oauth_notice();
        ?>
        <div class="wrap nevari-admin-wrap">
            <h1><?php echo esc_html__('Nevari Pharmacy Connections', 'nevari-pharmacy-core'); ?></h1>
            <p><?php echo esc_html__('Frontend access is validated with the shared frontend base URL plus signed origin headers derived from NEVARI_PROXY_SIGNING_SECRET.', 'nevari-pharmacy-core'); ?></p>

            <h2 style="margin-top:24px;"><?php echo esc_html__('Shared Frontend Base URL', 'nevari-pharmacy-core'); ?></h2>
            <p><?php echo esc_html__('All email dashboard links are built from this one frontend base URL plus fixed dashboard paths.', 'nevari-pharmacy-core'); ?></p>
            <form method="post">
                <?php wp_nonce_field('nevari_connections_action'); ?>
                <input type="hidden" name="nevari_connections_action" value="save_frontend_base_url" />
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row"><label for="nevari_shared_frontend_base_url"><?php esc_html_e('Frontend base URL', 'nevari-pharmacy-core'); ?></label></th>
                            <td>
                                <input
                                    id="nevari_shared_frontend_base_url"
                                    class="regular-text"
                                    type="url"
                                    name="shared_frontend_base_url"
                                    value="<?php echo esc_attr($shared_frontend_base_url); ?>"
                                    placeholder="<?php echo esc_attr(Nevari_Helpers::normalize_frontend_base_url((string) getenv('NEVARI_FRONTEND_BASE_URL')) ?: Nevari_Helpers::normalize_frontend_base_url((string) getenv('NEXT_PUBLIC_NEVARI_BASE_URL')) ?: 'https://app.example.com'); ?>"
                                />
                                <p class="description"><?php esc_html_e('Example: https://app.example.com. Patient links become /dashboard or /login, doctor links become /admin/doctor, pharmacist links become /admin/pharmacist, and admin links become /admin/storefront.', 'nevari-pharmacy-core'); ?></p>
                                <p class="description"><?php echo esc_html(sprintf(__('If empty, email links fall back to the site URL: %s', 'nevari-pharmacy-core'), home_url())); ?></p>
                                <?php if ($stored_shared_frontend_base_url === '' && $shared_frontend_base_url !== rtrim(home_url(), '/')) : ?>
                                    <p class="description"><?php echo esc_html(sprintf(__('Currently using fallback frontend base URL from configuration: %s', 'nevari-pharmacy-core'), $shared_frontend_base_url)); ?></p>
                                <?php endif; ?>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button(__('Save frontend base URL', 'nevari-pharmacy-core')); ?>
            </form>

            <h2 style="margin-top:24px;"><?php echo esc_html__('Google Meet OAuth (Server-side)', 'nevari-pharmacy-core'); ?></h2>
            <p><?php echo esc_html__('Configure OAuth credentials used by the core plugin to generate Google Meet links on the server during appointment booking.', 'nevari-pharmacy-core'); ?></p>
            <p><?php echo esc_html(sprintf(__('Google OAuth redirect URI: %s', 'nevari-pharmacy-core'), Nevari_Helpers::google_meet_oauth_redirect_uri())); ?></p>
            <form method="post">
                <?php wp_nonce_field('nevari_connections_action'); ?>
                <input type="hidden" name="nevari_connections_action" value="save_google_meet_oauth" />
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row"><?php esc_html_e('Enable Google Meet generation', 'nevari-pharmacy-core'); ?></th>
                            <td>
                                <label>
                                    <input type="checkbox" name="google_meet_oauth[enabled]" value="1" <?php checked(!empty($oauth['enabled'])); ?> />
                                    <?php esc_html_e('Use OAuth credentials to create a Google Meet space and direct Meet link', 'nevari-pharmacy-core'); ?>
                                </label>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="nevari_google_client_id"><?php esc_html_e('Google OAuth Client ID', 'nevari-pharmacy-core'); ?></label></th>
                            <td><input id="nevari_google_client_id" class="regular-text" type="text" name="google_meet_oauth[client_id]" value="<?php echo esc_attr((string) ($oauth['client_id'] ?? '')); ?>" autocomplete="off" /></td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="nevari_google_client_secret"><?php esc_html_e('Google OAuth Client Secret', 'nevari-pharmacy-core'); ?></label></th>
                            <td><input id="nevari_google_client_secret" class="regular-text" type="password" name="google_meet_oauth[client_secret]" value="" placeholder="<?php echo esc_attr(!empty($oauth['client_secret']) ? __('Saved - leave blank to keep current value', 'nevari-pharmacy-core') : __('Not set', 'nevari-pharmacy-core')); ?>" autocomplete="off" /></td>
                        </tr>
                        <tr>
                            <th scope="row"><?php esc_html_e('Required Google API', 'nevari-pharmacy-core'); ?></th>
                            <td>
                                <p class="description"><?php esc_html_e('Enable Google Meet API for the OAuth project. Calendar API is not required for direct Meet space generation.', 'nevari-pharmacy-core'); ?></p>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button(__('Save OAuth settings', 'nevari-pharmacy-core')); ?>
            </form>
            <table class="form-table" role="presentation">
                <tbody>
                    <tr>
                        <th scope="row"><?php esc_html_e('Google account connection', 'nevari-pharmacy-core'); ?></th>
                        <td>
                            <p>
                                <?php
                                if (!empty($oauth['refresh_token'])) {
                                    $connected_email = !empty($oauth['connected_email']) ? (string) $oauth['connected_email'] : __('Google account connected', 'nevari-pharmacy-core');
                                    echo esc_html(sprintf(__('Connected: %s', 'nevari-pharmacy-core'), $connected_email));
                                } else {
                                    esc_html_e('Not connected yet.', 'nevari-pharmacy-core');
                                }
                                ?>
                            </p>
                            <?php if (!empty($oauth['token_updated_at'])) : ?>
                                <p class="description"><?php echo esc_html(sprintf(__('Refresh token saved at %s (site time).', 'nevari-pharmacy-core'), $oauth['token_updated_at'])); ?></p>
                            <?php endif; ?>
                            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline-block; margin-right:8px;">
                                <?php wp_nonce_field('nevari_google_meet_oauth_connect'); ?>
                                <input type="hidden" name="action" value="nevari_google_meet_oauth_connect" />
                                <?php if ($can_connect_google) : ?>
                                    <?php submit_button(__('Connect Google', 'nevari-pharmacy-core'), 'secondary', '', false); ?>
                                <?php else : ?>
                                    <?php submit_button(__('Connect Google', 'nevari-pharmacy-core'), 'secondary', '', false, ['disabled' => 'disabled']); ?>
                                    <p class="description"><?php esc_html_e('Save both the client ID and client secret first.', 'nevari-pharmacy-core'); ?></p>
                                <?php endif; ?>
                            </form>
                            <?php if (!empty($oauth['refresh_token'])) : ?>
                                <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:inline-block;">
                                    <?php wp_nonce_field('nevari_google_meet_oauth_disconnect'); ?>
                                    <input type="hidden" name="action" value="nevari_google_meet_oauth_disconnect" />
                                    <?php submit_button(__('Disconnect Google', 'nevari-pharmacy-core'), 'delete', '', false); ?>
                                </form>
                            <?php endif; ?>
                        </td>
                    </tr>
                </tbody>
            </table>

            <?php if (false && $generated) : ?>
                <div class="notice notice-success">
                    <p><strong><?php echo esc_html(Nevari_Connections::frontend_types()[$generated['frontend_type']] ?? $generated['frontend_type']); ?></strong></p>
                    <p><code style="font-size:18px;"><?php echo esc_html($generated['code']); ?></code></p>
                    <p><?php echo esc_html(sprintf(__('Site URL: %s', 'nevari-pharmacy-core'), $generated['site_url'])); ?></p>
                    <p><?php echo esc_html(sprintf(__('Expires at %s', 'nevari-pharmacy-core'), $generated['expires_at'])); ?></p>
                </div>
            <?php endif; ?>

            <?php if (false) : ?>
            <div class="notice notice-info inline">
                <p><?php echo esc_html__('Debug tip: generate a new code, then confirm a fresh pending session appears below with a new session UUID and hash prefix. If verification still returns pairing_not_found, generation and verification are not using the same stored pairing record.', 'nevari-pharmacy-core'); ?></p>
            </div>

            <h2><?php echo esc_html__('Pair Custom Frontend', 'nevari-pharmacy-core'); ?></h2>
            <div class="nevari-connection-grid">
                <div class="card" style="max-width:420px; padding:20px; margin:0 20px 20px 0; display:inline-block; vertical-align:top;">
                    <h3><?php echo esc_html__('Custom Frontend', 'nevari-pharmacy-core'); ?></h3>
                    <p><?php echo esc_html__('Generate a one-time pairing code for your custom frontend application.', 'nevari-pharmacy-core'); ?></p>
                    <form method="post">
                        <?php wp_nonce_field('nevari_connections_action'); ?>
                        <input type="hidden" name="nevari_connections_action" value="generate_pairing_code" />
                        <?php submit_button(__('Generate Pairing Code', 'nevari-pharmacy-core'), 'primary', '', false); ?>
                    </form>
                </div>
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
                        <th><?php esc_html_e('Actions', 'nevari-pharmacy-core'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php if (!$connections) : ?>
                        <tr><td colspan="7"><?php esc_html_e('No frontend applications have been paired yet.', 'nevari-pharmacy-core'); ?></td></tr>
                    <?php else : ?>
                        <?php foreach ($connections as $connection) : ?>
                            <tr>
                                <td><?php echo esc_html(Nevari_Connections::frontend_types()[$connection['frontend_type']] ?? $connection['frontend_type']); ?></td>
                                <td><code><?php echo esc_html($connection['frontend_origin']); ?></code></td>
                                <td><?php echo esc_html($connection['frontend_url']); ?></td>
                                <td><?php echo esc_html($connection['trust_status']); ?></td>
                                <td><?php echo esc_html($connection['paired_at']); ?></td>
                                <td><?php echo esc_html($connection['last_seen_at'] ?: '-'); ?></td>
                                <td>
                                    <?php if ($connection['trust_status'] === 'trusted') : ?>
                                        <form method="post">
                                            <?php wp_nonce_field('nevari_connections_action'); ?>
                                            <input type="hidden" name="nevari_connections_action" value="revoke_frontend" />
                                            <input type="hidden" name="connection_id" value="<?php echo esc_attr((string) $connection['id']); ?>" />
                                            <?php submit_button(__('Revoke Access', 'nevari-pharmacy-core'), 'secondary', '', false); ?>
                                        </form>
                                    <?php else : ?>
                                        <span style="display:block; margin-bottom:8px;"><?php esc_html_e('Revoked', 'nevari-pharmacy-core'); ?></span>
                                        <form method="post">
                                            <?php wp_nonce_field('nevari_connections_action'); ?>
                                            <input type="hidden" name="nevari_connections_action" value="delete_revoked_frontend" />
                                            <input type="hidden" name="connection_id" value="<?php echo esc_attr((string) $connection['id']); ?>" />
                                            <?php submit_button(__('Delete', 'nevari-pharmacy-core'), 'delete', '', false, ['onclick' => "return confirm('Delete this revoked domain permanently?');"]); ?>
                                        </form>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </tbody>
            </table>
            <?php endif; ?>
        </div>
        <?php
    }

    private static function handle_google_meet_oauth_settings_save(): void {
        $current = Nevari_Helpers::google_meet_oauth_settings();
        $raw = isset($_POST['google_meet_oauth']) && is_array($_POST['google_meet_oauth']) ? wp_unslash($_POST['google_meet_oauth']) : [];

        $next = $current;
        $next['enabled'] = !empty($raw['enabled']);
        $next['client_id'] = isset($raw['client_id']) ? sanitize_text_field((string) $raw['client_id']) : $next['client_id'];
        $next['calendar_id'] = isset($raw['calendar_id']) && trim((string) $raw['calendar_id']) !== '' ? sanitize_text_field((string) $raw['calendar_id']) : 'primary';

        if (isset($raw['client_secret']) && trim((string) $raw['client_secret']) !== '') {
            $next['client_secret'] = sanitize_text_field((string) $raw['client_secret']);
        }
        update_option(self::GOOGLE_MEET_OAUTH_OPTION, $next, false);
    }

    public static function handle_google_meet_oauth_connect(): void {
        if (!current_user_can('nevari_manage_store')) {
            wp_die(esc_html__('You do not have permission to connect Google Meet OAuth.', 'nevari-pharmacy-core'));
        }
        check_admin_referer('nevari_google_meet_oauth_connect');

        $settings = Nevari_Helpers::google_meet_oauth_settings();
        if (empty($settings['client_id']) || empty($settings['client_secret'])) {
            wp_safe_redirect(self::google_meet_oauth_admin_url('missing_credentials'));
            exit;
        }

        $state = wp_generate_password(32, false, false);
        set_transient(self::GOOGLE_MEET_OAUTH_STATE_TRANSIENT . get_current_user_id(), $state, 15 * MINUTE_IN_SECONDS);

        wp_redirect(Nevari_Helpers::google_meet_oauth_authorize_url($state)); // phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect
        exit;
    }

    public static function handle_google_meet_oauth_callback(): void {
        if (!current_user_can('nevari_manage_store')) {
            wp_die(esc_html__('You do not have permission to complete Google Meet OAuth.', 'nevari-pharmacy-core'));
        }

        $expected_state = get_transient(self::GOOGLE_MEET_OAUTH_STATE_TRANSIENT . get_current_user_id());
        delete_transient(self::GOOGLE_MEET_OAUTH_STATE_TRANSIENT . get_current_user_id());

        $state = isset($_GET['state']) ? sanitize_text_field(wp_unslash($_GET['state'])) : '';
        if (!$expected_state || !hash_equals((string) $expected_state, $state)) {
            wp_safe_redirect(self::google_meet_oauth_admin_url('invalid_state'));
            exit;
        }

        if (!empty($_GET['error'])) {
            $error = sanitize_text_field(wp_unslash($_GET['error']));
            wp_safe_redirect(self::google_meet_oauth_admin_url('google_error', $error));
            exit;
        }

        $code = isset($_GET['code']) ? sanitize_text_field(wp_unslash($_GET['code'])) : '';
        $result = Nevari_Helpers::google_meet_oauth_exchange_code($code);
        if (empty($result['success'])) {
            wp_safe_redirect(self::google_meet_oauth_admin_url('token_exchange_failed', $result['message'] ?? ''));
            exit;
        }

        Nevari_Helpers::save_google_meet_refresh_token(
            (string) ($result['refresh_token'] ?? ''),
            (string) ($result['connected_email'] ?? '')
        );

        wp_safe_redirect(self::google_meet_oauth_admin_url('connected'));
        exit;
    }

    public static function handle_google_meet_oauth_disconnect(): void {
        if (!current_user_can('nevari_manage_store')) {
            wp_die(esc_html__('You do not have permission to disconnect Google Meet OAuth.', 'nevari-pharmacy-core'));
        }
        check_admin_referer('nevari_google_meet_oauth_disconnect');

        $settings = Nevari_Helpers::google_meet_oauth_settings();
        $settings['refresh_token'] = '';
        $settings['connected_email'] = '';
        $settings['token_updated_at'] = '';
        update_option(self::GOOGLE_MEET_OAUTH_OPTION, $settings, false);

        wp_safe_redirect(self::google_meet_oauth_admin_url('disconnected'));
        exit;
    }

    private static function render_google_meet_oauth_notice(): void {
        if (!isset($_GET['google_meet_oauth_status'])) {
            return;
        }

        $status = sanitize_key(wp_unslash($_GET['google_meet_oauth_status']));
        $message = '';
        $class = 'notice-info';
        switch ($status) {
            case 'connected':
                $message = __('Google account connected and refresh token saved.', 'nevari-pharmacy-core');
                $class = 'notice-success';
                break;
            case 'disconnected':
                $message = __('Google account disconnected. Saved refresh token removed.', 'nevari-pharmacy-core');
                $class = 'notice-success';
                break;
            case 'missing_credentials':
                $message = __('Save the Google OAuth client ID and client secret before connecting.', 'nevari-pharmacy-core');
                $class = 'notice-error';
                break;
            case 'invalid_state':
                $message = __('Google OAuth state validation failed. Start the connection again.', 'nevari-pharmacy-core');
                $class = 'notice-error';
                break;
            case 'google_error':
                $message = __('Google OAuth authorization was cancelled or returned an error.', 'nevari-pharmacy-core');
                $class = 'notice-error';
                break;
            case 'token_exchange_failed':
                $message = __('Google OAuth token exchange failed.', 'nevari-pharmacy-core');
                $class = 'notice-error';
                break;
        }

        $detail = isset($_GET['google_meet_oauth_message']) ? sanitize_text_field(wp_unslash($_GET['google_meet_oauth_message'])) : '';
        if ($message === '') {
            return;
        }

        echo '<div class="notice ' . esc_attr($class) . '"><p>' . esc_html($message) . '</p>';
        if ($detail !== '') {
            echo '<p>' . esc_html($detail) . '</p>';
        }
        echo '</div>';
    }

    private static function google_meet_oauth_admin_url(string $status, string $message = ''): string {
        $args = [
            'page' => 'nevari-pharmacy',
            'google_meet_oauth_status' => $status,
        ];
        if ($message !== '') {
            $args['google_meet_oauth_message'] = $message;
        }
        return add_query_arg($args, admin_url('admin.php'));
    }

    public static function render_payment_gateways_page(): void {
        if (!current_user_can('nevari_manage_store')) {
            wp_die(esc_html__('You do not have permission to manage payment gateways.', 'nevari-pharmacy-core'));
        }

        if ('POST' === strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') && isset($_POST['nevari_payment_gateway_action'])) {
            self::handle_payment_gateway_settings_save();
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $active = isset($settings['active_gateway']) ? (string) $settings['active_gateway'] : 'woocommerce';
        $mode = isset($settings['mode']) ? (string) $settings['mode'] : 'test';
        ?>
        <div class="wrap nevari-admin-wrap">
            <h1><?php echo esc_html__('Nevari Payment Gateways', 'nevari-pharmacy-core'); ?></h1>
            <p><?php echo esc_html__('Configure the payment provider the Nevari frontend should use when it requests payment links from the plugin.', 'nevari-pharmacy-core'); ?></p>

            <?php if (isset($_GET['updated'])) : ?>
                <div class="notice notice-success is-dismissible"><p><?php esc_html_e('Payment gateway settings updated.', 'nevari-pharmacy-core'); ?></p></div>
            <?php endif; ?>

            <div class="notice notice-info inline">
                <p><?php echo esc_html(sprintf(__('WooCommerce gateway status: %s', 'nevari-pharmacy-core'), Nevari_Helpers::woocommerce_payment_gateway_configured() ? __('at least one gateway is enabled', 'nevari-pharmacy-core') : __('no enabled WooCommerce gateway detected', 'nevari-pharmacy-core'))); ?></p>
                <p><?php esc_html_e('Pay Now links use the plugin document-data endpoint. For WooCommerce mode, the endpoint returns the official WooCommerce order-pay URL so installed gateways such as Paystack, Stripe, or Flutterwave can collect payment.', 'nevari-pharmacy-core'); ?></p>
                <p><?php esc_html_e('The WooCommerce Nevari Paystack gateway reuses the Paystack credentials saved on this page. Keep the Paystack webhook pointed at the Nevari REST webhook URL shown below.', 'nevari-pharmacy-core'); ?></p>
            </div>

            <form method="post">
                <?php wp_nonce_field('nevari_payment_gateway_settings'); ?>
                <input type="hidden" name="nevari_payment_gateway_action" value="save" />
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row"><label for="active_gateway"><?php esc_html_e('Active gateway', 'nevari-pharmacy-core'); ?></label></th>
                            <td>
                                <select id="active_gateway" name="active_gateway">
                                    <option value="woocommerce" <?php selected($active, 'woocommerce'); ?>><?php esc_html_e('WooCommerce checkout', 'nevari-pharmacy-core'); ?></option>
                                    <option value="paystack" <?php selected($active, 'paystack'); ?>>Paystack</option>
                                    <option value="stripe" <?php selected($active, 'stripe'); ?>>Stripe</option>
                                    <option value="flutterwave" <?php selected($active, 'flutterwave'); ?>>Flutterwave</option>
                                </select>
                                <p class="description"><?php esc_html_e('WooCommerce checkout is recommended because it keeps order payment, receipts, and webhooks in WooCommerce.', 'nevari-pharmacy-core'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="payment_mode"><?php esc_html_e('Mode', 'nevari-pharmacy-core'); ?></label></th>
                            <td>
                                <select id="payment_mode" name="mode">
                                    <option value="test" <?php selected($mode, 'test'); ?>><?php esc_html_e('Test', 'nevari-pharmacy-core'); ?></option>
                                    <option value="live" <?php selected($mode, 'live'); ?>><?php esc_html_e('Live', 'nevari-pharmacy-core'); ?></option>
                                </select>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <?php self::render_gateway_fieldset('paystack', 'Paystack', [
                    'public_key' => __('Public key', 'nevari-pharmacy-core'),
                    'secret_key' => __('Secret key', 'nevari-pharmacy-core'),
                    'webhook_secret' => __('Webhook secret', 'nevari-pharmacy-core'),
                ], $settings); ?>
                <p><strong><?php esc_html_e('Paystack webhook URL', 'nevari-pharmacy-core'); ?>:</strong> <code><?php echo esc_html(rest_url(NEVARI_PHARMACY_REST_NS . '/payments/paystack/webhook')); ?></code></p>

                <?php self::render_gateway_fieldset('stripe', 'Stripe', [
                    'publishable_key' => __('Publishable key', 'nevari-pharmacy-core'),
                    'secret_key' => __('Secret key', 'nevari-pharmacy-core'),
                    'webhook_secret' => __('Webhook signing secret', 'nevari-pharmacy-core'),
                ], $settings); ?>

                <?php self::render_gateway_fieldset('flutterwave', 'Flutterwave', [
                    'public_key' => __('Public key', 'nevari-pharmacy-core'),
                    'secret_key' => __('Secret key', 'nevari-pharmacy-core'),
                    'encryption_key' => __('Encryption key', 'nevari-pharmacy-core'),
                    'webhook_secret' => __('Webhook secret', 'nevari-pharmacy-core'),
                ], $settings); ?>

                <?php submit_button(__('Save payment gateways', 'nevari-pharmacy-core')); ?>
            </form>
        </div>
        <?php
    }

    private static function render_gateway_fieldset(string $key, string $label, array $fields, array $settings): void {
        $values = isset($settings[$key]) && is_array($settings[$key]) ? $settings[$key] : [];
        ?>
        <h2><?php echo esc_html($label); ?></h2>
        <table class="form-table" role="presentation">
            <tbody>
                <?php foreach ($fields as $field_key => $field_label) : ?>
                    <?php $has_value = !empty($values[$field_key]); ?>
                    <tr>
                        <th scope="row"><label for="<?php echo esc_attr($key . '_' . $field_key); ?>"><?php echo esc_html($field_label); ?></label></th>
                        <td>
                            <input
                                id="<?php echo esc_attr($key . '_' . $field_key); ?>"
                                class="regular-text"
                                type="<?php echo strpos($field_key, 'secret') !== false || strpos($field_key, 'key') !== false ? 'password' : 'text'; ?>"
                                name="<?php echo esc_attr($key); ?>[<?php echo esc_attr($field_key); ?>]"
                                value=""
                                placeholder="<?php echo esc_attr($has_value ? __('Saved - leave blank to keep current value', 'nevari-pharmacy-core') : __('Not set', 'nevari-pharmacy-core')); ?>"
                                autocomplete="off"
                            />
                            <p class="description"><?php echo esc_html($has_value ? __('A value is saved for this field.', 'nevari-pharmacy-core') : __('No value saved yet.', 'nevari-pharmacy-core')); ?></p>
                            <?php if ($field_key === 'secret_key') : ?>
                                <p class="description">
                                    <?php esc_html_e('Invoice Pay Now will show this gateway after this secret key is saved. Public/publishable keys are kept for compatibility, but the custom invoice payment page initializes payments server-side with the secret key.', 'nevari-pharmacy-core'); ?>
                                </p>
                            <?php endif; ?>
                            <?php if ($field_key === 'webhook_secret') : ?>
                                <p class="description">
                                    <?php esc_html_e('If your payment provider does not show a separate webhook secret, you can use the gateway secret key here. For providers that let you set a webhook secret/hash manually, enter the same value in the provider dashboard and in this field.', 'nevari-pharmacy-core'); ?>
                                </p>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
        <?php
    }

    private static function handle_shared_frontend_base_url_save(): void {
        if (!check_admin_referer('nevari_connections_action')) {
            return;
        }
        $raw = isset($_POST['shared_frontend_base_url']) ? wp_unslash($_POST['shared_frontend_base_url']) : '';
        $normalized = Nevari_Helpers::normalize_frontend_base_url((string) $raw);
        update_option(self::SHARED_FRONTEND_BASE_URL_OPTION, $normalized, false);
    }

    private static function handle_payment_gateway_settings_save(): void {
        if (!check_admin_referer('nevari_payment_gateway_settings')) {
            return;
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $active = isset($_POST['active_gateway']) ? sanitize_key(wp_unslash($_POST['active_gateway'])) : 'woocommerce';
        if (!in_array($active, ['woocommerce', 'paystack', 'stripe', 'flutterwave'], true)) {
            $active = 'woocommerce';
        }
        $mode = isset($_POST['mode']) ? sanitize_key(wp_unslash($_POST['mode'])) : 'test';
        if (!in_array($mode, ['test', 'live'], true)) {
            $mode = 'test';
        }

        $settings['active_gateway'] = $active;
        $settings['mode'] = $mode;
        foreach (['paystack', 'stripe', 'flutterwave'] as $gateway) {
            $raw = isset($_POST[$gateway]) && is_array($_POST[$gateway]) ? wp_unslash($_POST[$gateway]) : [];
            foreach (array_keys($settings[$gateway]) as $field) {
                if (isset($raw[$field]) && trim((string) $raw[$field]) !== '') {
                    $settings[$gateway][$field] = sanitize_text_field((string) $raw[$field]);
                }
            }
        }

        update_option(self::PAYMENT_GATEWAY_OPTION, $settings, false);
        wp_safe_redirect(add_query_arg(['page' => 'nevari-payment-gateways', 'updated' => '1'], admin_url('admin.php')));
        exit;
    }

    public static function render_audit_page(): void {
        if (!current_user_can('nevari_read_audit_logs')) {
            wp_die(esc_html__('You do not have permission to view this page.', 'nevari-pharmacy-core'));
        }

        $tabs = [
            'orders' => 'ORDERS',
            'payments' => 'PAYMENTS',
            'security' => 'SECURITY',
            'storefront-logs' => 'STOREFRONT LOGS',
            'wordpress-logs' => 'WORDPRESS LOGS',
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
            $is_storefront_logs = $active === 'storefront-logs';
            $is_wordpress_logs = $active === 'wordpress-logs';
            $args = [
                'category' => $is_storefront_logs ? '' : ($is_wordpress_logs ? '' : $active),
                'status' => isset($_GET['status']) ? sanitize_key(wp_unslash($_GET['status'])) : '',
                'source' => $is_wordpress_logs ? 'wordpress' : (isset($_GET['source']) ? sanitize_key(wp_unslash($_GET['source'])) : ''),
                'search' => isset($_GET['s']) ? sanitize_text_field(wp_unslash($_GET['s'])) : '',
                'date_from' => isset($_GET['date_from']) ? sanitize_text_field(wp_unslash($_GET['date_from'])) : '',
                'date_to' => isset($_GET['date_to']) ? sanitize_text_field(wp_unslash($_GET['date_to'])) : '',
                'page' => isset($_GET['paged']) ? max(1, (int) $_GET['paged']) : 1,
                'per_page' => 25,
            ];
            if ($is_storefront_logs) {
                $args['categories'] = ['dashboard', 'security', 'orders', 'consultation', 'emails', 'payments'];
            }
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
                <?php if ($active === 'storefront-logs') : ?>
                    <p><?php esc_html_e('Activity across the customer, doctor, and admin storefronts.', 'nevari-pharmacy-core'); ?></p>
                <?php elseif ($active === 'wordpress-logs') : ?>
                    <p><?php esc_html_e('WordPress-originated security events, including login, failed login, and password reset activity.', 'nevari-pharmacy-core'); ?></p>
                <?php endif; ?>
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
                        <option value="customer" <?php selected($args['source'], 'customer'); ?>>Customer</option>
                        <option value="doctor" <?php selected($args['source'], 'doctor'); ?>>Doctor</option>
                        <option value="admin" <?php selected($args['source'], 'admin'); ?>>Admin</option>
                        <option value="google" <?php selected($args['source'], 'google'); ?>>Google</option>
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
                        if ($args['date_from']) { $base_url = add_query_arg('date_from', rawurlencode($args['date_from']), $base_url); }
                        if ($args['date_to']) { $base_url = add_query_arg('date_to', rawurlencode($args['date_to']), $base_url); }
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
                <?php if ($active === 'wordpress-logs') : ?>
                    <?php $wordpress_log_lines = self::wordpress_debug_log_lines(); ?>
                    <h2 style="margin-top:24px;"><?php echo esc_html__('WordPress debug.log', 'nevari-pharmacy-core'); ?></h2>
                    <p><?php echo esc_html__('Recent entries from wp-content/debug.log, when WordPress debugging is enabled and the file is readable.', 'nevari-pharmacy-core'); ?></p>
                    <?php if (empty($wordpress_log_lines)) : ?>
                        <p><?php esc_html_e('No readable WordPress debug log entries were found.', 'nevari-pharmacy-core'); ?></p>
                    <?php else : ?>
                        <pre class="nevari-wordpress-log-tail"><?php echo esc_html(implode("\n", $wordpress_log_lines)); ?></pre>
                    <?php endif; ?>
                <?php endif; ?>
            <?php endif; ?>
        </div>
        <?php
    }

    private static function wordpress_debug_log_lines(int $line_limit = 120): array {
        if (!defined('WP_CONTENT_DIR')) {
            return [];
        }

        $path = trailingslashit(WP_CONTENT_DIR) . 'debug.log';
        if (!is_readable($path) || !is_file($path)) {
            return [];
        }

        $size = filesize($path);
        if (!$size) {
            return [];
        }

        $bytes = 262144;
        $offset = max(0, $size - $bytes);
        $contents = file_get_contents($path, false, null, $offset, $bytes);
        if (!is_string($contents) || $contents === '') {
            return [];
        }

        $lines = preg_split('/\r\n|\r|\n/', trim($contents));
        if (!is_array($lines)) {
            return [];
        }

        return array_slice(array_filter($lines, static fn($line) => trim((string) $line) !== ''), -max(1, $line_limit));
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
            'auth_password_reset_ip' => ['label' => 'Password reset requests by IP', 'default_limit' => 5, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_password_reset_user' => ['label' => 'Password reset requests by username', 'default_limit' => 5, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_register_ip' => ['label' => 'Customer registration attempts by IP', 'default_limit' => 10, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_register_email' => ['label' => 'Customer registration attempts by email', 'default_limit' => 5, 'default_window' => HOUR_IN_SECONDS],
            'auth_refresh_ip' => ['label' => 'Token refresh by IP', 'default_limit' => 20, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_refresh_token' => ['label' => 'Token refresh by token', 'default_limit' => 10, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_logout_ip' => ['label' => 'Logout by IP', 'default_limit' => 30, 'default_window' => 15 * MINUTE_IN_SECONDS],
            'auth_logout_token' => ['label' => 'Logout by token', 'default_limit' => 10, 'default_window' => 15 * MINUTE_IN_SECONDS],
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
            'rest_customer_profile_image_write' => ['label' => 'Customer profile image uploads', 'default_limit' => 12, 'default_window' => HOUR_IN_SECONDS],
            'rest_emails_write' => ['label' => 'Email send/template actions', 'default_limit' => 5, 'default_window' => MINUTE_IN_SECONDS],
            'rest_email_logs_read' => ['label' => 'Email logs read', 'default_limit' => 60, 'default_window' => MINUTE_IN_SECONDS],
            'rest_audit_logs_read' => ['label' => 'Audit logs read', 'default_limit' => 60, 'default_window' => MINUTE_IN_SECONDS],
        ];
    }
}
