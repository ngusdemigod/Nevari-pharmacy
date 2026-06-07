<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Subscriptions {
    private const PLAN_POST_TYPE = 'nevari_subscription';
    private const FREE_PLAN_KEY = 'free';
    private const FREE_PLAN_NAME = 'Free';
    private const PLAN_KEY = 'nevari_access_pro';
    private const PLAN_NAME = 'Nevari Access Pro';
    private const PLAN_INTERVAL = 'monthly';
    // Legacy column names still say "kobo"; subscription amounts are stored as raw admin-entered values.
    private const PLAN_AMOUNT_KOBO = 1000;
    private const PLAN_CURRENCY = 'NGN';
    private const CHECKOUT_TYPE_AUTO = 'auto_generated';
    private const CHECKOUT_TYPE_MANUAL = 'manual';
    private const CHECKOUT_REUSE_SECONDS = 1800;
    private const CHECKOUT_REFERENCE_MAX_LENGTH = 100;
    private const CHECKOUT_REFERENCE_INSERT_ATTEMPTS = 5;
    private const CHECKOUT_PAYSTACK_ATTEMPTS = 3;
    private const SUBSCRIPTION_CACHE_GROUP = 'nevari_subscriptions';
    private const SUBSCRIPTION_ACTIVE_TTL = 600;
    private const SUBSCRIPTION_INACTIVE_TTL = 300;
    private const SUBSCRIPTION_RISK_TTL = 120;
    private static $syncing_plan_post = false;

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_action('add_meta_boxes_' . self::PLAN_POST_TYPE, [__CLASS__, 'register_plan_meta_box']);
        add_action('save_post_' . self::PLAN_POST_TYPE, [__CLASS__, 'save_plan_meta_from_post'], 10, 3);
        add_action('save_post_' . self::PLAN_POST_TYPE, [__CLASS__, 'sync_subscription_plan_table_from_post'], 20, 3);
        self::ensure_system_plans();
    }

    public static function register_routes(): void {
        foreach (['subscriptions', 'subscription'] as $base_path) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/' . $base_path . '/me', [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'me'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ]);

            register_rest_route(NEVARI_PHARMACY_REST_NS, '/' . $base_path . '/admin', [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'admin'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ]);

            register_rest_route(NEVARI_PHARMACY_REST_NS, '/' . $base_path . '/admin', [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'save_admin_plan'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ]);

            register_rest_route(NEVARI_PHARMACY_REST_NS, '/' . $base_path . '/admin/(?P<plan_id>[A-Za-z0-9_-]+)', [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [__CLASS__, 'delete_admin_plan'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ]);

            foreach (['initialize', 'verify', 'cancel'] as $action) {
                register_rest_route(NEVARI_PHARMACY_REST_NS, '/' . $base_path . '/' . $action, [
                    'methods' => WP_REST_Server::CREATABLE,
                    'callback' => [__CLASS__, $action],
                    'permission_callback' => [__CLASS__, 'auth_required'],
                ]);
            }
        }

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/subscriptions/paystack-webhook', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'paystack_webhook'],
            'permission_callback' => '__return_true',
        ]);
    }

    public static function auth_required(): bool {
        return Nevari_Auth::api_session_required();
    }

    public static function store_admin_required(): bool {
        return Nevari_Helpers::is_store_admin();
    }

    public static function paystack_webhook(WP_REST_Request $request): WP_REST_Response {
        $settings = Nevari_Helpers::payment_gateway_settings();
        $secret_key = trim((string) ($settings['paystack']['secret_key'] ?? ''));
        if ($secret_key === '') {
            self::storefront_log('subscription.webhook.paystack_missing', 'error', [], 'Paystack secret key is not configured.');
            return new WP_REST_Response(['message' => 'Webhook unavailable'], 503);
        }

        $raw_body = (string) $request->get_body();
        $signature = trim((string) $request->get_header('x-paystack-signature'));
        $expected_signature = hash_hmac('sha512', $raw_body, $secret_key);
        if ($raw_body === '' || $signature === '' || !hash_equals($expected_signature, $signature)) {
            self::storefront_log('subscription.webhook.invalid_signature', 'error', [], 'Invalid Paystack webhook signature.');
            return new WP_REST_Response(['message' => 'Invalid signature'], 401);
        }

        $event = json_decode($raw_body, true);
        if (!is_array($event)) {
            return new WP_REST_Response(['message' => 'Invalid payload'], 400);
        }

        $event_type = strtolower(sanitize_text_field((string) ($event['event'] ?? '')));
        $event_key = self::paystack_event_key($event, $raw_body);
        self::ensure_paystack_webhook_events_table();
        if (self::paystack_webhook_event_processed($event_key)) {
            return new WP_REST_Response(['received' => true, 'duplicate' => true], 200);
        }

        $result = self::process_paystack_subscription_event($event_type, is_array($event['data'] ?? null) ? $event['data'] : []);
        self::record_paystack_webhook_event($event_key, $event_type, $signature, $raw_body);

        if (!empty($result['user_id'])) {
            $user_id = (int) $result['user_id'];
            self::refresh_subscription_cache($user_id);
            self::dispatch_subscription_webhook('subscription.updated', [
                'user_id' => $user_id,
                'paystack_event' => $event_type,
            ]);
        }

        return new WP_REST_Response(['received' => true], 200);
    }

    private static function allowed_currencies(): array {
        return ['NGN', 'USD'];
    }

    private static function allowed_intervals(): array {
        return ['monthly', 'quarterly', 'yearly', 'manual'];
    }

    private static function allowed_checkout_types(): array {
        return [self::CHECKOUT_TYPE_AUTO, self::CHECKOUT_TYPE_MANUAL];
    }

    private static function allowed_statuses(): array {
        return ['active', 'draft', 'archived'];
    }

    private static function webhook_signing_secret(): string {
        if (defined('NEVARI_PROXY_SIGNING_SECRET')) {
            return trim((string) constant('NEVARI_PROXY_SIGNING_SECRET'));
        }
        return trim((string) getenv('NEVARI_PROXY_SIGNING_SECRET'));
    }

    private static function dispatch_subscription_webhook(string $event, array $payload = []): void {
        $secret = self::webhook_signing_secret();
        if ($secret === '' || !class_exists('Nevari_Connections')) {
            return;
        }

        $frontends = array_values(array_filter(Nevari_Connections::trusted_frontends(), static function ($frontend) {
            return !empty($frontend['frontend_origin']) && (string) ($frontend['frontend_type'] ?? '') === 'storefront';
        }));
        if (empty($frontends)) {
            return;
        }

        $body = wp_json_encode(array_merge([
            'event' => $event,
            'source' => 'wordpress',
            'site_url' => home_url(),
            'sent_at' => Nevari_Helpers::now(),
        ], $payload));
        if (!is_string($body) || $body === '') {
            return;
        }

        $timestamp = (string) time();
        $signature = hash_hmac('sha256', $timestamp . "\n" . $body, $secret);

        foreach ($frontends as $frontend) {
            $origin = rtrim((string) ($frontend['frontend_origin'] ?? ''), '/');
            if ($origin === '') {
                continue;
            }

            wp_remote_post($origin . '/api/subscriptions/webhook', [
                'timeout' => 15,
                'headers' => [
                    'Content-Type' => 'application/json',
                    'X-Nevari-Webhook-Timestamp' => $timestamp,
                    'X-Nevari-Webhook-Signature' => $signature,
                ],
                'body' => $body,
            ]);
        }
    }

    private static function sanitize_subscription_text($value): string {
        return trim(wp_strip_all_tags(sanitize_text_field((string) $value)));
    }

    private static function generate_subscription_slug(string $value): string {
        $slug = sanitize_title($value);
        return $slug !== '' ? $slug : self::PLAN_KEY;
    }

    private static function reserved_identifier($value): string {
        $raw = strtolower(trim((string) $value));
        $slug = sanitize_title($raw);
        return preg_replace('/[^a-z0-9]+/', '', $slug !== '' ? $slug : $raw) ?: '';
    }

    private static function system_plan_definitions(): array {
        return [
            self::FREE_PLAN_KEY => [
                'plan_key' => self::FREE_PLAN_KEY,
                'name' => self::FREE_PLAN_NAME,
                'amount_kobo' => 0,
                'currency' => self::PLAN_CURRENCY,
                'interval_unit' => 'manual',
                'checkout_type' => self::CHECKOUT_TYPE_MANUAL,
                'status' => 'active',
                'description' => 'Default free access',
                'features' => '',
                'checkout_link' => self::default_checkout_link(),
                'metadata' => [
                    'system_plan' => true,
                    'reserved_name' => true,
                    'plan_type' => 'free',
                ],
                'aliases' => [self::FREE_PLAN_NAME, self::FREE_PLAN_KEY],
            ],
            self::PLAN_KEY => [
                'plan_key' => self::PLAN_KEY,
                'name' => self::PLAN_NAME,
                'amount_kobo' => self::PLAN_AMOUNT_KOBO,
                'currency' => self::PLAN_CURRENCY,
                'interval_unit' => self::PLAN_INTERVAL,
                'checkout_type' => self::CHECKOUT_TYPE_AUTO,
                'status' => 'active',
                'description' => '',
                'features' => '',
                'checkout_link' => self::default_checkout_link(),
                'metadata' => [
                    'system_plan' => true,
                    'reserved_name' => true,
                    'plan_type' => 'pro',
                ],
                'aliases' => [self::PLAN_NAME, self::PLAN_KEY, 'Nevari Access Pro', 'Nevari Pro', 'nevari-access-pro'],
            ],
        ];
    }

    private static function system_plan_definition(string $plan_key): ?array {
        $definitions = self::system_plan_definitions();
        return $definitions[sanitize_key($plan_key)] ?? null;
    }

    private static function reserved_plan_for_value($value): ?array {
        $normalized = self::reserved_identifier($value);
        if ($normalized === '') {
            return null;
        }

        foreach (self::system_plan_definitions() as $definition) {
            $candidates = array_merge([$definition['plan_key'], $definition['name']], $definition['aliases'] ?? []);
            foreach ($candidates as $candidate) {
                if ($normalized === self::reserved_identifier($candidate)) {
                    return $definition;
                }
            }
        }

        return null;
    }

    private static function is_system_plan_key(string $plan_key): bool {
        return self::system_plan_definition($plan_key) !== null;
    }

    private static function system_metadata(array $existing = [], string $plan_key = ''): array {
        $definition = self::system_plan_definition($plan_key);
        $metadata = array_merge($existing, is_array($definition['metadata'] ?? null) ? $definition['metadata'] : []);
        $metadata['system_plan'] = true;
        $metadata['reserved_name'] = true;
        return $metadata;
    }

    private static function normalize_subscription_features($value): string {
        $raw = is_array($value) ? implode("\n", array_map('strval', $value)) : (string) $value;
        $lines = preg_split('/\R/u', $raw) ?: [];
        $normalized = [];
        foreach ($lines as $line) {
            $clean = self::sanitize_subscription_text($line);
            if ($clean !== '') {
                $normalized[] = $clean;
            }
        }
        return implode("\n", $normalized);
    }

    private static function normalize_allowed_value($value, array $allowed, string $fallback): string {
        $normalized = self::sanitize_subscription_text($value);
        return in_array($normalized, $allowed, true) ? $normalized : $fallback;
    }

    private static function build_checkout_link(string $plan_slug, string $interval): string {
        $base = self::default_checkout_link();
        if ($base === '') {
            return '';
        }

        $url = add_query_arg([
            'plan' => $plan_slug,
            'interval' => $interval,
        ], $base);

        return esc_url_raw($url);
    }

    private static function plan_initials(string $title): string {
        $parts = preg_split('/\s+/', trim($title)) ?: [];
        $letters = [];
        foreach (array_slice(array_values(array_filter($parts, static function ($part) {
            return $part !== '';
        })), 0, 2) as $part) {
            $letters[] = strtoupper(substr($part, 0, 1));
        }
        return $letters ? implode('', $letters) : '?';
    }

    private static function default_plan_definition(): array {
        return [
            'plan_key' => self::PLAN_KEY,
            'name' => self::PLAN_NAME,
            'amount_kobo' => self::PLAN_AMOUNT_KOBO,
            'currency' => self::PLAN_CURRENCY,
            'interval_unit' => self::PLAN_INTERVAL,
            'checkout_type' => self::CHECKOUT_TYPE_AUTO,
            'status' => 'active',
            'description' => '',
            'features' => '',
            'checkout_link' => self::default_checkout_link(),
            'metadata' => [],
        ];
    }

    private static function default_free_plan_definition(): array {
        $definitions = self::system_plan_definitions();
        $definition = $definitions[self::FREE_PLAN_KEY];
        unset($definition['aliases']);
        return $definition;
    }

    private static function normalize_plan_definition(?object $row = null): array {
        $definition = self::default_plan_definition();
        if (!$row) {
            return $definition;
        }

        $metadata = [];
        if (!empty($row->metadata)) {
            $decoded = json_decode((string) $row->metadata, true);
            if (is_array($decoded)) {
                $metadata = $decoded;
            }
        }

        $plan_key = sanitize_key((string) ($row->plan_key ?? $definition['plan_key']));
        $system_definition = self::system_plan_definition($plan_key);
        $name = self::sanitize_subscription_text($row->name ?? $definition['name']);
        if ($system_definition) {
            $name = (string) $system_definition['name'];
            $metadata = self::system_metadata($metadata, $plan_key);
        }
        $amount = max(0, (int) ($row->amount_kobo ?? $definition['amount_kobo']));
        if ($plan_key === self::FREE_PLAN_KEY) {
            $amount = 0;
        }

        return [
            'plan_key' => $plan_key,
            'name' => $name,
            'amount_kobo' => $amount,
            'currency' => self::normalize_allowed_value($row->currency ?? $definition['currency'], self::allowed_currencies(), self::PLAN_CURRENCY),
            'interval_unit' => self::normalize_allowed_value($row->interval_unit ?? $definition['interval_unit'], self::allowed_intervals(), self::PLAN_INTERVAL),
            'checkout_type' => self::normalize_allowed_value($row->checkout_type ?? $metadata['checkout_type'] ?? $definition['checkout_type'], self::allowed_checkout_types(), self::CHECKOUT_TYPE_AUTO),
            'status' => sanitize_key((string) ($row->status ?? $definition['status'])) ?: $definition['status'],
            'description' => sanitize_textarea_field((string) ($row->description ?? $metadata['description'] ?? $definition['description'])),
            'features' => self::normalize_multiline_text($row->features ?? $metadata['features'] ?? $definition['features']),
            'checkout_link' => esc_url_raw((string) ($row->checkout_link ?? $metadata['checkout_link'] ?? $definition['checkout_link'])) ?: $definition['checkout_link'],
            'metadata' => $metadata,
            'plan_code' => sanitize_text_field((string) ($row->plan_code ?? '')),
        ];
    }

    private static function current_plan_definition(): array {
        $post = self::current_plan_post(self::PLAN_KEY);
        if ($post) {
            return self::normalize_plan_definition(self::plan_row_from_post($post));
        }

        global $wpdb;
        self::ensure_system_plans();

        $plans_table = Nevari_Helpers::table('subscription_plans');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$plans_table} WHERE plan_key = %s ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1",
            self::PLAN_KEY
        ));
        if ($row) {
            return self::normalize_plan_definition($row);
        }

        $row = $wpdb->get_row(
            "SELECT * FROM {$plans_table} WHERE amount_kobo > 0 ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1"
        );
        if ($row) {
            return self::normalize_plan_definition($row);
        }

        return self::default_plan_definition();
    }

    private static function unique_plan_rows(array $rows): array {
        $deduped = [];
        foreach ($rows as $row) {
            if (!is_object($row)) {
                continue;
            }
            $plan_key = sanitize_key((string) ($row->plan_key ?? ''));
            $dedupe_key = $plan_key !== '' ? $plan_key : 'row_' . (int) ($row->id ?? 0);
            $deduped[$dedupe_key] = $row;
        }
        return array_values($deduped);
    }

    public static function ensure_system_plans(): void {
        if (!class_exists('Nevari_Helpers')) {
            return;
        }

        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $table_exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $plans_table));
        if ($table_exists !== $plans_table) {
            return;
        }

        $now = Nevari_Helpers::now();
        $rows = $wpdb->get_results("SELECT * FROM {$plans_table} ORDER BY id ASC") ?: [];

        foreach (self::system_plan_definitions() as $plan_key => $definition) {
            $matches = [];
            foreach ($rows as $row) {
                $row_key = sanitize_key((string) ($row->plan_key ?? ''));
                $row_name = (string) ($row->name ?? '');
                $key_match = self::reserved_plan_for_value($row_key);
                $name_match = self::reserved_plan_for_value($row_name);
                if ($row_key === $plan_key || (is_array($key_match) && ($key_match['plan_key'] ?? '') === $plan_key) || (is_array($name_match) && ($name_match['plan_key'] ?? '') === $plan_key)) {
                    $matches[] = $row;
                }
            }

            $canonical = null;
            foreach ($matches as $row) {
                if (sanitize_key((string) ($row->plan_key ?? '')) === $plan_key) {
                    $canonical = $row;
                    break;
                }
            }
            if (!$canonical && $matches) {
                $canonical = $matches[0];
            }

            $metadata = [];
            if ($canonical && !empty($canonical->metadata)) {
                $decoded = json_decode((string) $canonical->metadata, true);
                if (is_array($decoded)) {
                    $metadata = $decoded;
                }
            }
            $metadata = self::system_metadata($metadata, $plan_key);
            $payload = [
                'plan_key' => $plan_key,
                'name' => (string) $definition['name'],
                'amount_kobo' => $plan_key === self::FREE_PLAN_KEY ? 0 : self::normalize_subscription_amount($canonical->amount_kobo ?? $definition['amount_kobo']),
                'currency' => self::normalize_allowed_value($canonical->currency ?? $definition['currency'], self::allowed_currencies(), self::PLAN_CURRENCY),
                'interval_unit' => self::normalize_allowed_value($canonical->interval_unit ?? $definition['interval_unit'], self::allowed_intervals(), (string) $definition['interval_unit']),
                'status' => self::normalize_allowed_value($canonical->status ?? $definition['status'], self::allowed_statuses(), 'active'),
                'metadata' => wp_json_encode($metadata),
                'updated_at' => $now,
            ];
            if ($canonical && property_exists($canonical, 'plan_code')) {
                $payload['plan_code'] = $plan_key === self::FREE_PLAN_KEY ? '' : sanitize_text_field((string) ($canonical->plan_code ?? ''));
            }

            if ($canonical) {
                $wpdb->update($plans_table, $payload, ['id' => (int) $canonical->id]);
                $canonical_id = (int) $canonical->id;
            } else {
                $payload['created_at'] = $now;
                $wpdb->insert($plans_table, $payload);
                $canonical_id = (int) $wpdb->insert_id;
            }

            foreach ($matches as $row) {
                $row_id = (int) ($row->id ?? 0);
                if ($row_id <= 0 || $row_id === $canonical_id) {
                    continue;
                }
                $old_key = sanitize_key((string) ($row->plan_key ?? ''));
                if ($old_key !== '' && $old_key !== $plan_key) {
                    $wpdb->update($subscriptions_table, ['plan_key' => $plan_key], ['plan_key' => $old_key]);
                }
                $wpdb->delete($plans_table, ['id' => $row_id], ['%d']);
            }

            self::sync_subscription_plan_post(array_merge($definition, $payload), $metadata);
        }
    }

    public static function sync_subscription_plan_table_from_post(int $post_id, WP_Post $post, bool $update): void {
        if (self::$syncing_plan_post || $post_id <= 0 || !($post instanceof WP_Post) || $post->post_type !== self::PLAN_POST_TYPE) {
            return;
        }
        if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) {
            return;
        }

        self::$syncing_plan_post = true;
        try {
            self::sync_subscription_plan_table(self::plan_row_from_post($post));
            self::dispatch_subscription_webhook('subscription.updated', [
                'plan_id' => (int) $post_id,
                'plan_key' => sanitize_key((string) get_post_meta($post_id, '_nevari_plan_key', true)),
                'source' => 'wordpress_admin',
            ]);
        } finally {
            self::$syncing_plan_post = false;
        }
    }

    public static function register_plan_meta_box(): void {
        add_meta_box(
            'nevari-subscription-plan-meta',
            __('Subscription plan fields', 'nevari-pharmacy-core'),
            [__CLASS__, 'render_plan_meta_box'],
            self::PLAN_POST_TYPE,
            'normal',
            'default'
        );
    }

    public static function render_plan_meta_box(WP_Post $post): void {
        $amount = (int) get_post_meta($post->ID, '_nevari_amount_kobo', true);
        $description = (string) get_post_meta($post->ID, '_nevari_subscription_description', true);
        $features = (string) get_post_meta($post->ID, '_nevari_subscription_features', true);
        $checkout_link = (string) get_post_meta($post->ID, '_nevari_subscription_checkout_link', true);
        if ($checkout_link === '') {
            $checkout_link = self::default_checkout_link();
        }

        wp_nonce_field('nevari_subscription_plan_meta', 'nevari_subscription_plan_meta_nonce');
        ?>
        <div class="nevari-subscription-meta-grid">
            <p>
                <label for="nevari_subscription_amount"><strong><?php esc_html_e('Amount', 'nevari-pharmacy-core'); ?></strong></label><br>
                <input id="nevari_subscription_amount" name="nevari_subscription_amount" type="number" class="widefat" min="0" step="1" value="<?php echo esc_attr((string) max(0, $amount)); ?>" placeholder="0">
                <span class="description"><?php esc_html_e('Store the raw subscription amount. Free plans should use 0.', 'nevari-pharmacy-core'); ?></span>
            </p>
            <p>
                <label for="nevari_subscription_description"><strong><?php esc_html_e('Description', 'nevari-pharmacy-core'); ?></strong></label><br>
                <textarea id="nevari_subscription_description" name="nevari_subscription_description" rows="4" class="widefat"><?php echo esc_textarea($description); ?></textarea>
            </p>
            <p>
                <label for="nevari_subscription_features"><strong><?php esc_html_e('Features', 'nevari-pharmacy-core'); ?></strong></label><br>
                <textarea id="nevari_subscription_features" name="nevari_subscription_features" rows="6" class="widefat" placeholder="<?php echo esc_attr("Feature one\nFeature two\nFeature three"); ?>"><?php echo esc_textarea($features); ?></textarea>
                <span class="description"><?php esc_html_e('Enter one feature per line.', 'nevari-pharmacy-core'); ?></span>
            </p>
            <p>
                <label for="nevari_subscription_checkout_link"><strong><?php esc_html_e('Checkout link', 'nevari-pharmacy-core'); ?></strong></label><br>
                <input id="nevari_subscription_checkout_link" name="nevari_subscription_checkout_link" type="url" class="widefat" value="<?php echo esc_attr($checkout_link); ?>" placeholder="<?php echo esc_attr(self::default_checkout_link()); ?>" readonly>
                <span class="description"><?php esc_html_e('This value is auto-generated from the plan settings.', 'nevari-pharmacy-core'); ?></span>
            </p>
        </div>
        <?php
    }

    public static function save_plan_meta_from_post(int $post_id, WP_Post $post, bool $update): void {
        if (self::$syncing_plan_post || $post_id <= 0 || !($post instanceof WP_Post) || $post->post_type !== self::PLAN_POST_TYPE) {
            return;
        }
        if (wp_is_post_autosave($post_id) || wp_is_post_revision($post_id)) {
            return;
        }
        if (!isset($_POST['nevari_subscription_plan_meta_nonce']) || !wp_verify_nonce(sanitize_text_field((string) $_POST['nevari_subscription_plan_meta_nonce']), 'nevari_subscription_plan_meta')) {
            return;
        }
        if (!current_user_can('edit_post', $post_id)) {
            return;
        }

        $amount = self::normalize_subscription_amount(wp_unslash($_POST['nevari_subscription_amount'] ?? 0));
        $description = sanitize_textarea_field((string) wp_unslash($_POST['nevari_subscription_description'] ?? ''));
        $features = self::normalize_multiline_text(wp_unslash($_POST['nevari_subscription_features'] ?? ''));
        update_post_meta($post_id, '_nevari_amount_kobo', $amount);
        update_post_meta($post_id, '_nevari_subscription_description', $description);
        update_post_meta($post_id, '_nevari_subscription_features', $features);
        update_post_meta($post_id, '_nevari_subscription_checkout_link', self::default_checkout_link());
    }

    private static function sync_subscription_plan_table(object $plan_row): void {
        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $now = Nevari_Helpers::now();
        $plan_key = sanitize_key((string) ($plan_row->plan_key ?? self::PLAN_KEY)) ?: self::PLAN_KEY;
        $system_definition = self::system_plan_definition($plan_key);
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$plans_table} WHERE plan_key = %s LIMIT 1",
            $plan_key
        ));
        $metadata = [];
        if (!empty($plan_row->metadata)) {
            $decoded = json_decode((string) $plan_row->metadata, true);
            if (is_array($decoded)) {
                $metadata = $decoded;
            }
        }
        if ($system_definition) {
            $metadata = self::system_metadata($metadata, $plan_key);
        }

        $payload = [
            'plan_key' => $plan_key,
            'plan_code' => $plan_key === self::FREE_PLAN_KEY ? '' : sanitize_text_field((string) ($plan_row->plan_code ?? '')),
            'name' => $system_definition ? (string) $system_definition['name'] : (string) ($plan_row->name ?? self::PLAN_NAME),
            'amount_kobo' => $plan_key === self::FREE_PLAN_KEY ? 0 : self::normalize_subscription_amount($plan_row->amount_kobo ?? self::PLAN_AMOUNT_KOBO),
            'currency' => strtoupper(sanitize_text_field((string) ($plan_row->currency ?? self::PLAN_CURRENCY))) ?: self::PLAN_CURRENCY,
            'interval_unit' => sanitize_key((string) ($plan_row->interval_unit ?? self::PLAN_INTERVAL)) ?: self::PLAN_INTERVAL,
            'status' => sanitize_key((string) ($plan_row->status ?? 'active')) ?: 'active',
            'metadata' => wp_json_encode($metadata),
            'updated_at' => $now,
        ];

        if ($existing) {
            $wpdb->update($plans_table, $payload, ['id' => (int) $existing->id]);
            return;
        }

        $payload['created_at'] = $now;
        $wpdb->insert($plans_table, $payload);
    }

    private static function sync_subscription_plan_post(array $plan_data, array $metadata = []): int {
        if (!post_type_exists(self::PLAN_POST_TYPE)) {
            return 0;
        }

        $plan_key = sanitize_key((string) ($plan_data['plan_key'] ?? self::PLAN_KEY)) ?: self::PLAN_KEY;
        $system_definition = self::system_plan_definition($plan_key);
        if ($system_definition) {
            $metadata = self::system_metadata($metadata, $plan_key);
            $plan_data['name'] = (string) $system_definition['name'];
            $plan_data['plan_key'] = $plan_key;
            if ($plan_key === self::FREE_PLAN_KEY) {
                $plan_data['amount_kobo'] = 0;
                $plan_data['plan_code'] = '';
            }
        }
        $existing_post = self::current_plan_post($plan_key);
        $status = sanitize_key((string) ($plan_data['status'] ?? 'active'));
        $post_status = $status === 'active' ? 'publish' : 'draft';
        $post_title = (string) ($plan_data['name'] ?? self::PLAN_NAME);
        $post_content = self::subscription_plan_post_content($plan_data, $metadata);
        $post_id = $existing_post instanceof WP_Post ? (int) $existing_post->ID : 0;

        self::$syncing_plan_post = true;
        try {
            $next_post = [
                'post_type' => self::PLAN_POST_TYPE,
                'post_status' => $post_status,
                'post_title' => $post_title,
                'post_content' => $post_content,
                'post_excerpt' => self::subscription_plan_post_excerpt($plan_data),
            ];

            if ($post_id > 0) {
                $next_post['ID'] = $post_id;
                $result = wp_update_post($next_post, true);
                if (is_wp_error($result)) {
                    return 0;
                }
                $post_id = (int) $result;
            } else {
                $result = wp_insert_post($next_post, true);
                if (is_wp_error($result)) {
                    return 0;
                }
                $post_id = (int) $result;
            }

            update_post_meta($post_id, '_nevari_plan_key', $plan_key);
            update_post_meta($post_id, '_nevari_plan_code', sanitize_text_field((string) ($plan_data['plan_code'] ?? '')));
            update_post_meta($post_id, '_nevari_amount_kobo', (int) ($plan_data['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO));
            update_post_meta($post_id, '_nevari_currency', sanitize_text_field((string) ($plan_data['currency'] ?? self::PLAN_CURRENCY)));
            update_post_meta($post_id, '_nevari_interval_unit', sanitize_text_field((string) ($plan_data['interval_unit'] ?? self::PLAN_INTERVAL)));
            update_post_meta($post_id, '_nevari_status', sanitize_text_field((string) ($plan_data['status'] ?? 'active')));
            update_post_meta($post_id, '_nevari_subscription_description', sanitize_textarea_field((string) ($plan_data['description'] ?? $metadata['description'] ?? '')));
            update_post_meta($post_id, '_nevari_subscription_features', self::normalize_multiline_text($plan_data['features'] ?? $metadata['features'] ?? ''));
            update_post_meta($post_id, '_nevari_subscription_checkout_link', esc_url_raw((string) ($plan_data['checkout_link'] ?? $metadata['checkout_link'] ?? self::default_checkout_link())));
            update_post_meta($post_id, '_nevari_subscription_plan_metadata', $metadata);
        } finally {
            self::$syncing_plan_post = false;
        }

        return $post_id;
    }

    private static function subscription_plan_post_content(array $plan_data, array $metadata): string {
        $lines = [
            'Plan key: ' . (string) ($plan_data['plan_key'] ?? self::PLAN_KEY),
            'Amount: ' . (string) self::normalize_subscription_amount($plan_data['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO),
            'Currency: ' . (string) ($plan_data['currency'] ?? self::PLAN_CURRENCY),
            'Interval: ' . (string) ($plan_data['interval_unit'] ?? self::PLAN_INTERVAL),
            'Checkout type: ' . (string) ($plan_data['checkout_type'] ?? self::CHECKOUT_TYPE_AUTO),
        ];
        if (!empty($plan_data['description'])) {
            $lines[] = 'Description: ' . (string) $plan_data['description'];
        }
        if (!empty($plan_data['features'])) {
            $lines[] = 'Features: ' . str_replace("\n", ' | ', self::normalize_multiline_text($plan_data['features']));
        }
        if (!empty($plan_data['checkout_link'])) {
            $lines[] = 'Checkout link: ' . (string) $plan_data['checkout_link'];
        }
        foreach ($metadata as $key => $value) {
            if (is_scalar($value) && $value !== '') {
                $lines[] = $key . ': ' . (string) $value;
            }
        }
        return implode("\n", $lines);
    }

    private static function subscription_plan_post_excerpt(array $plan_data): string {
        $amount = self::normalize_subscription_amount($plan_data['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO);
        $currency = (string) ($plan_data['currency'] ?? self::PLAN_CURRENCY);
        $interval = (string) ($plan_data['interval_unit'] ?? self::PLAN_INTERVAL);
        return sprintf('%s %s / %s', $currency, number_format($amount, 0), $interval);
    }

    private static function current_plan_post(?string $plan_key = null) {
        if (!post_type_exists(self::PLAN_POST_TYPE)) {
            return null;
        }

        $normalized_plan_key = $plan_key !== null ? sanitize_key($plan_key) : '';
        if ($normalized_plan_key === '') {
            $posts = get_posts([
                'post_type' => self::PLAN_POST_TYPE,
                'post_status' => 'any',
                'numberposts' => 1,
                'orderby' => 'date',
                'order' => 'DESC',
                'fields' => 'ids',
            ]);
            if (empty($posts)) {
                return null;
            }

            $post = get_post((int) $posts[0]);
            return $post instanceof WP_Post ? $post : null;
        }

        $posts = get_posts([
            'post_type' => self::PLAN_POST_TYPE,
            'post_status' => 'any',
            'numberposts' => 1,
            'orderby' => 'date',
            'order' => 'DESC',
            'fields' => 'ids',
            'meta_key' => '_nevari_plan_key',
            'meta_value' => $normalized_plan_key,
        ]);
        if (empty($posts)) {
            return null;
        }

        $post = get_post((int) $posts[0]);
        return $post instanceof WP_Post ? $post : null;
    }

    private static function default_checkout_link(): string {
        if (function_exists('home_url')) {
            return esc_url_raw(trailingslashit(home_url('/subscription')));
        }
        return '/subscription';
    }

    public static function normalize_multiline_text($value): string {
        $raw = is_array($value) ? implode("\n", array_map('strval', $value)) : (string) $value;
        $lines = preg_split('/\R/u', $raw) ?: [];
        $normalized = [];
        foreach ($lines as $line) {
            $clean = trim(wp_strip_all_tags(sanitize_text_field($line)));
            if ($clean !== '') {
                $normalized[] = $clean;
            }
        }
        return implode("\n", $normalized);
    }

    private static function plan_row_from_post(WP_Post $post): object {
        $metadata = get_post_meta($post->ID, '_nevari_subscription_plan_metadata', true);
        $metadata_array = is_array($metadata) ? $metadata : (is_string($metadata) && $metadata !== '' ? json_decode($metadata, true) : []);
        if (!is_array($metadata_array)) {
            $metadata_array = [];
        }

        $plan_key = sanitize_key((string) get_post_meta($post->ID, '_nevari_plan_key', true));
        $amount_kobo = (int) get_post_meta($post->ID, '_nevari_amount_kobo', true);
        $currency = strtoupper(sanitize_text_field((string) get_post_meta($post->ID, '_nevari_currency', true)));
        $interval_unit = sanitize_key((string) get_post_meta($post->ID, '_nevari_interval_unit', true));
        $status = sanitize_key((string) get_post_meta($post->ID, '_nevari_status', true));
        $plan_code = sanitize_text_field((string) get_post_meta($post->ID, '_nevari_plan_code', true));
        $description = sanitize_textarea_field((string) get_post_meta($post->ID, '_nevari_subscription_description', true));
        $features = self::normalize_multiline_text(get_post_meta($post->ID, '_nevari_subscription_features', true));
        $checkout_link = esc_url_raw((string) get_post_meta($post->ID, '_nevari_subscription_checkout_link', true));

        if ($plan_key === '') {
            $plan_key = self::PLAN_KEY;
        }
        if ($currency === '') {
            $currency = self::PLAN_CURRENCY;
        }
        if ($interval_unit === '') {
            $interval_unit = self::PLAN_INTERVAL;
        }
        if ($status === '') {
            $status = $post->post_status === 'publish' ? 'active' : 'draft';
        }
        if ($description === '' && isset($metadata_array['description'])) {
            $description = sanitize_textarea_field((string) $metadata_array['description']);
        }
        if ($features === '' && isset($metadata_array['features'])) {
            $features = self::normalize_multiline_text($metadata_array['features']);
        }
        if ($checkout_link === '' && isset($metadata_array['checkout_link'])) {
            $checkout_link = esc_url_raw((string) $metadata_array['checkout_link']);
        }

        return (object) [
            'plan_key' => $plan_key,
            'plan_code' => $plan_code,
            'name' => $post->post_title !== '' ? $post->post_title : self::PLAN_NAME,
            'amount_kobo' => self::normalize_subscription_amount($amount_kobo),
            'currency' => $currency,
            'interval_unit' => $interval_unit,
            'status' => $status,
            'description' => $description,
            'features' => $features,
            'checkout_link' => $checkout_link ?: self::default_checkout_link(),
            'metadata' => wp_json_encode($metadata_array),
        ];
    }

    private static function normalize_subscription_amount($value): int {
        $raw = is_string($value) || is_numeric($value) ? (string) $value : '';
        $normalized = str_replace(',', '', trim($raw));
        if ($normalized === '' || !is_numeric($normalized)) {
            return 0;
        }
        $amount = (float) $normalized;
        return $amount >= 0 ? (int) round($amount) : 0;
    }

    private static function raw_amount_to_paystack_kobo($value): int {
        return self::normalize_subscription_amount($value) * 100;
    }

    private static function response_from_wp_error($error): WP_REST_Response {
        $data = is_wp_error($error) ? $error->get_error_data() : [];
        $status = is_array($data) && isset($data['status']) ? (int) $data['status'] : 400;
        $payload = is_array($data) ? $data : [];
        return Nevari_Helpers::error(is_wp_error($error) ? $error->get_error_code() : 'error', is_wp_error($error) ? $error->get_error_message() : 'Request failed.', $status, $payload);
    }

    private static function verify_protected_action(array $params, int $expected_user_id = 0) {
        global $wpdb;

        $challenge_id = isset($params['challenge_id']) ? sanitize_text_field((string) $params['challenge_id']) : '';
        $code = isset($params['code']) ? preg_replace('/\D+/', '', (string) $params['code']) : '';
        if (!$challenge_id || strlen($code) !== 6) {
            return new WP_Error('validation_error', 'challenge_id and six-digit code are required.', ['status' => 422]);
        }

        $frontend = Nevari_Connections::resolve_request_frontend($params);
        if (!$frontend) {
            return new WP_Error('untrusted_frontend', 'This frontend is not paired with the pharmacy installation.', ['status' => 403]);
        }

        $table = Nevari_Helpers::table('login_challenges');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE challenge_uuid = %s AND consumed_at IS NULL AND expires_at > %s LIMIT 1",
            $challenge_id,
            Nevari_Helpers::now()
        ));
        if (!$row || $row->frontend_type !== $frontend['frontend_type'] || $row->frontend_origin !== $frontend['frontend_origin']) {
            return new WP_Error('invalid_verification_code', 'Verification code is invalid or expired.', ['status' => 401]);
        }
        if ($expected_user_id > 0 && (int) $row->user_id !== $expected_user_id) {
            return new WP_Error('forbidden', 'Unauthorized user', ['status' => 403]);
        }
        if ((int) $row->attempts >= 5) {
            return new WP_Error('verification_locked', 'Verification challenge is locked.', ['status' => 429]);
        }

        $wpdb->update($table, ['attempts' => (int) $row->attempts + 1], ['id' => (int) $row->id], ['%d'], ['%d']);
        if (!hash_equals((string) $row->code_hash, hash('sha256', $code))) {
            Nevari_Audit::log('security', 'nevari', 'subscription.verification_failed', 'error', [
                'related_user_id' => (int) $row->user_id,
                'severity' => 'warning',
                'message' => 'Subscription protection code failed.',
            ]);
            return new WP_Error('invalid_verification_code', 'Verification code is invalid or expired.', ['status' => 401]);
        }

        $wpdb->update($table, ['consumed_at' => Nevari_Helpers::now()], ['id' => (int) $row->id], ['%s'], ['%d']);

        return [
            'user_id' => (int) $row->user_id,
            'frontend' => $frontend,
            'challenge_id' => $challenge_id,
        ];
    }

    public static function save_admin_plan(WP_REST_Request $request): WP_REST_Response {
        if (!Nevari_Helpers::is_store_admin()) {
            return Nevari_Helpers::error('forbidden', 'Store admin access is required.', 403);
        }

        $user_id = Nevari_Auth::api_session_user_id();
        $params = Nevari_Helpers::get_json_params($request);
        $verification = self::verify_protected_action($params, $user_id);
        if (is_wp_error($verification)) {
            return self::response_from_wp_error($verification);
        }

        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $now = Nevari_Helpers::now();

        $plan_name = self::sanitize_subscription_text($params['plan_name'] ?? $params['planName'] ?? '');
        $amount_raw = self::normalize_subscription_amount($params['amount'] ?? $params['amount_kobo'] ?? 0);
        $currency = self::normalize_allowed_value($params['currency'] ?? self::PLAN_CURRENCY, self::allowed_currencies(), self::PLAN_CURRENCY);
        $interval_unit = self::normalize_allowed_value($params['interval'] ?? $params['interval_unit'] ?? self::PLAN_INTERVAL, self::allowed_intervals(), self::PLAN_INTERVAL);
        $checkout_type = self::normalize_allowed_value($params['checkout_type'] ?? $params['checkoutType'] ?? self::CHECKOUT_TYPE_AUTO, self::allowed_checkout_types(), self::CHECKOUT_TYPE_AUTO);
        $description = sanitize_textarea_field((string) ($params['description'] ?? ''));
        $features = self::normalize_multiline_text($params['features'] ?? '');
        $plan_slug = self::generate_subscription_slug($params['plan_slug'] ?? $params['planSlug'] ?? $plan_name);
        $checkout_link = self::build_checkout_link($plan_slug, $interval_unit);

        $plan_id = absint($params['plan_id'] ?? $params['id'] ?? 0);
        $requested_plan_key = sanitize_key((string) ($params['plan_key'] ?? $params['planKey'] ?? ''));
        $existing = null;
        if ($plan_id > 0) {
            $existing = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$plans_table} WHERE id = %d LIMIT 1",
                $plan_id
            ));
        }
        if (!$existing && $requested_plan_key !== '') {
            $existing = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$plans_table} WHERE plan_key = %s LIMIT 1",
                $requested_plan_key
            ));
        }

        $existing_plan_key = $existing && !empty($existing->plan_key) ? sanitize_key((string) $existing->plan_key) : '';
        $existing_system_definition = $existing_plan_key !== '' ? self::system_plan_definition($existing_plan_key) : null;
        $reserved_request = self::reserved_plan_for_value($plan_name) ?: self::reserved_plan_for_value($requested_plan_key ?: $plan_slug);
        if ($reserved_request && (!$existing_system_definition || ($reserved_request['plan_key'] ?? '') !== $existing_plan_key)) {
            return Nevari_Helpers::error('reserved_subscription_plan_name', sprintf('"%s" is reserved by the system and cannot be used for a custom subscription plan.', (string) ($reserved_request['name'] ?? $plan_name)), 400, [
                'field' => 'plan_name',
                'reserved_names' => [self::FREE_PLAN_NAME, self::PLAN_NAME],
            ]);
        }
        if ($existing_system_definition) {
            $plan_name = (string) $existing_system_definition['name'];
            $plan_slug = self::generate_subscription_slug($plan_name);
            $checkout_link = self::build_checkout_link($plan_slug, $interval_unit);
            if ($existing_plan_key === self::FREE_PLAN_KEY) {
                $amount_raw = 0;
                $checkout_type = self::CHECKOUT_TYPE_MANUAL;
            }
        }

        $validation_errors = [];
        if ($plan_name === '') {
            $validation_errors[] = '*Required';
        }
        if (!in_array($currency, self::allowed_currencies(), true)) {
            $validation_errors[] = 'Invalid currency.';
        }
        if (!in_array($interval_unit, self::allowed_intervals(), true)) {
            $validation_errors[] = '*Required';
        }
        if (!in_array($checkout_type, self::allowed_checkout_types(), true)) {
            $validation_errors[] = 'Invalid checkout type.';
        }
        if (!$existing_system_definition && $description === '') {
            $validation_errors[] = 'Missing description.';
        }
        if (!$existing_system_definition && $features === '') {
            $validation_errors[] = '*Required';
        }
        if ($validation_errors) {
            return Nevari_Helpers::error('invalid_subscription_plan', implode(' ', $validation_errors), 400, [
                'validation_errors' => $validation_errors,
            ]);
        }
        $metadata = [
            'plan_name' => $plan_name,
            'plan_slug' => $plan_slug,
            'amount' => $amount_raw,
            'amount_kobo' => $amount_raw,
            'currency' => $currency,
            'interval' => $interval_unit,
            'checkout_type' => $checkout_type,
            'public_key' => sanitize_text_field((string) ($params['public_key'] ?? '')),
            'manage_billing_url' => esc_url_raw((string) ($params['manage_billing_url'] ?? '')),
            'notifications_enabled' => !empty($params['notifications_enabled']),
            'auto_renew' => !empty($params['auto_renew']),
            'cancellation_window_days' => sanitize_text_field((string) ($params['cancellation_window_days'] ?? '')),
            'description' => $description,
            'features' => $features,
            'checkout_link' => $checkout_link,
        ];
        if ($existing_system_definition) {
            $metadata = self::system_metadata($metadata, $existing_plan_key);
        }

        $existing_status = $existing && isset($existing->status) ? sanitize_key((string) $existing->status) : 'active';
        $status = self::normalize_allowed_value($params['status'] ?? $params['plan_status'] ?? $existing_status, self::allowed_statuses(), $existing_status ?: 'active');

        $plan_key = $existing && !empty($existing->plan_key)
            ? sanitize_key((string) $existing->plan_key)
            : ($requested_plan_key !== '' ? $requested_plan_key : $plan_slug);
        if ($plan_key === '') {
            $plan_key = $plan_slug;
        }

        $plan_data = [
            'plan_key' => $plan_key,
            'plan_code' => $amount_raw > 0 && $existing && !empty($existing->plan_code) ? sanitize_text_field((string) $existing->plan_code) : '',
            'name' => $plan_name !== '' ? $plan_name : self::PLAN_NAME,
            'amount_kobo' => $amount_raw,
            'currency' => $currency,
            'interval_unit' => $interval_unit,
            'checkout_type' => $checkout_type,
            'status' => $status,
            'description' => $description,
            'features' => $features,
            'checkout_link' => $checkout_link,
            'metadata' => wp_json_encode($metadata),
            'updated_at' => $now,
        ];
        if ($existing_system_definition) {
            $plan_data['plan_key'] = $existing_plan_key;
            $plan_data['name'] = (string) $existing_system_definition['name'];
            if ($existing_plan_key === self::FREE_PLAN_KEY) {
                $plan_data['amount_kobo'] = 0;
                $plan_data['plan_code'] = '';
            }
        }

        if ($existing) {
            $wpdb->update($plans_table, $plan_data, ['id' => (int) $existing->id]);
            $saved_plan_id = (int) $existing->id;
        } else {
            $plan_data['created_at'] = $now;
            $wpdb->insert($plans_table, $plan_data);
            $saved_plan_id = (int) $wpdb->insert_id;
        }

        self::sync_subscription_plan_post($plan_data, $metadata);

        $settings = Nevari_Helpers::payment_gateway_settings();
        $secret_key = (string) ($settings['paystack']['secret_key'] ?? '');
        $paystack_synced = false;
        if ($secret_key !== '' && $amount_raw > 0) {
            $plan = self::ensure_paystack_plan($secret_key, $plan_data);
            if (is_wp_error($plan)) {
                self::storefront_log('subscription.admin.save_paystack_error', 'error', [
                    'user_id' => $user_id,
                    'error_code' => $plan->get_error_code(),
                    'error_message' => $plan->get_error_message(),
                ], $plan->get_error_message());
                return self::response_from_wp_error($plan);
            }
            $paystack_synced = true;
            $plan_data['plan_code'] = sanitize_text_field((string) ($plan['plan_code'] ?? ''));
            self::sync_subscription_plan_post($plan_data, $metadata);
        }

        self::storefront_log('subscription.admin.saved', 'success', [
            'user_id' => $user_id,
            'plan_key' => $plan_key,
            'amount' => $amount_raw,
            'currency' => $currency,
            'interval_unit' => $interval_unit,
            'paystack_synced' => $paystack_synced,
        ]);

        self::dispatch_subscription_webhook('subscription.updated', [
            'plan_id' => $saved_plan_id ?? 0,
            'plan_key' => $plan_key,
            'source' => 'storefront',
        ]);

        return Nevari_Helpers::success([
            'plan' => $plan_data,
            'paystack_synced' => $paystack_synced,
        ]);
    }

    public static function delete_admin_plan(WP_REST_Request $request): WP_REST_Response {
        if (!Nevari_Helpers::is_store_admin()) {
            return Nevari_Helpers::error('forbidden', 'Store admin access is required.', 403);
        }

        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $plan_id_raw = sanitize_text_field((string) $request->get_param('plan_id'));
        if ($plan_id_raw === '') {
            return Nevari_Helpers::error('missing_plan_id', 'A plan id is required.', 400);
        }

        if (ctype_digit($plan_id_raw)) {
            $existing = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$plans_table} WHERE id = %d LIMIT 1",
                (int) $plan_id_raw
            ));
        } else {
            $existing = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM {$plans_table} WHERE plan_key = %s LIMIT 1",
                sanitize_key($plan_id_raw)
            ));
        }

        if (empty($existing)) {
            return Nevari_Helpers::error('plan_not_found', 'The selected subscription plan could not be found.', 404);
        }

        $plan_key = sanitize_key((string) ($existing->plan_key ?? ''));
        if (self::is_system_plan_key($plan_key) || self::reserved_plan_for_value($existing->name ?? null)) {
            return Nevari_Helpers::error('system_subscription_plan_delete_blocked', 'System subscription plans cannot be deleted.', 400, [
                'plan_key' => $plan_key,
            ]);
        }

        $wpdb->delete($plans_table, ['id' => (int) $existing->id], ['%d']);

        $post = self::current_plan_post($plan_key);
        if ($post instanceof WP_Post) {
            wp_delete_post($post->ID, true);
        }

        self::storefront_log('subscription.admin.deleted', 'success', [
            'plan_id' => (int) $existing->id,
            'plan_key' => $plan_key,
        ]);

        self::dispatch_subscription_webhook('subscription.deleted', [
            'plan_id' => (int) $existing->id,
            'plan_key' => $plan_key,
            'source' => 'wordpress_admin',
        ]);

        return self::admin();
    }

    public static function me(): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        return Nevari_Helpers::success(self::subscription_payload_for_user($user_id));
    }

    public static function admin(): WP_REST_Response {
        if (!Nevari_Helpers::is_store_admin()) {
            return Nevari_Helpers::error('forbidden', 'Store admin access is required.', 403);
        }

        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $users_table = $wpdb->users;

        $plan_rows = self::unique_plan_rows($wpdb->get_results("SELECT * FROM {$plans_table} ORDER BY id ASC"));
        $latest_subscription_ids = $wpdb->get_results("SELECT user_id, MAX(id) AS id FROM {$subscriptions_table} GROUP BY user_id");
        $latest_ids = array_map(static fn($row) => (int) $row->id, $latest_subscription_ids ?: []);
        $subscription_rows = [];
        if ($latest_ids) {
            $placeholders = implode(',', array_fill(0, count($latest_ids), '%d'));
            $subscription_rows = $wpdb->get_results($wpdb->prepare(
                "SELECT s.*, u.display_name, u.user_email FROM {$subscriptions_table} s LEFT JOIN {$users_table} u ON u.ID = s.user_id WHERE s.id IN ({$placeholders}) ORDER BY s.id DESC",
                ...$latest_ids
            ));
        }

        $total_users = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$users_table}");
        $active_subscriptions = 0;
        $past_due_subscriptions = 0;
        $cancelled_subscriptions = 0;
        $renewals_this_month = 0;
        $active_amount_kobo = 0;
        $plan_counts = [];
        $users = [];

        $month_start = gmdate('Y-m-01 00:00:00');
        $next_month_start = gmdate('Y-m-01 00:00:00', strtotime('+1 month'));

        foreach ($subscription_rows ?: [] as $row) {
            $status = self::effective_subscription_status($row);
            $plan_key = sanitize_key((string) $row->plan_key);
            if (in_array($status, ['active', 'trialing'], true)) {
                $active_subscriptions++;
                $active_amount_kobo += (int) ($row->amount_kobo ?? 0);
                $plan_counts[$plan_key] = ($plan_counts[$plan_key] ?? 0) + 1;
            } elseif ($status === 'past_due') {
                $past_due_subscriptions++;
            } elseif ($status === 'cancelled') {
                $cancelled_subscriptions++;
            }

            $renewal_date = !empty($row->renewal_date) ? (string) $row->renewal_date : '';
            if ($renewal_date && $renewal_date >= $month_start && $renewal_date < $next_month_start) {
                $renewals_this_month++;
            }

            $is_paid = in_array($status, ['active', 'trialing'], true);
            $display_name = trim((string) ($row->display_name ?? ''));
            $email = trim((string) ($row->user_email ?? ''));
            $user_name = $display_name !== '' ? $display_name : ($email !== '' ? $email : 'Subscriber');
            $amount_value = $is_paid ? number_format(self::normalize_subscription_amount($row->amount_kobo ?? 0), 0) : '0';
            $users[] = [
                'id' => (int) $row->id,
                'user_id' => (int) $row->user_id,
                'name' => $user_name,
                'email' => $email,
                'plan' => $is_paid ? self::PLAN_NAME : 'Free',
                'plan_name' => $is_paid ? self::PLAN_NAME : 'Free',
                'status' => self::status_label($status),
                'statusTone' => self::status_tone($status),
                'renewal' => !empty($row->renewal_date) ? gmdate('M j, Y', strtotime((string) $row->renewal_date)) : 'Not scheduled',
                'renewal_date' => !empty($row->renewal_date) ? gmdate('M j, Y', strtotime((string) $row->renewal_date)) : 'Not scheduled',
                'amount' => $is_paid ? 'NGN ' . $amount_value : 'NGN 0',
                'amount_label' => $is_paid ? 'NGN ' . $amount_value : 'NGN 0',
                'ref' => $row->reference ? sanitize_text_field((string) $row->reference) : '—',
                'gateway_ref' => $row->reference ? sanitize_text_field((string) $row->reference) : '—',
                'reference' => $row->reference ? sanitize_text_field((string) $row->reference) : '—',
                'action' => $is_paid ? 'Edit' : 'Upgrade',
                'accent' => self::accent_for_status($status),
            ];
        }

        $existing_user_ids = array_fill_keys(array_map(static function ($item) {
            return (int) ($item['user_id'] ?? 0);
        }, $users), true);
        $all_users = $wpdb->get_results("SELECT ID, display_name, user_email FROM {$users_table} ORDER BY ID ASC");
        foreach ($all_users ?: [] as $user_row) {
            $user_id = (int) ($user_row->ID ?? 0);
            if ($user_id <= 0 || isset($existing_user_ids[$user_id])) {
                continue;
            }

            $display_name = trim((string) ($user_row->display_name ?? ''));
            $email = trim((string) ($user_row->user_email ?? ''));
            $user_name = $display_name !== '' ? $display_name : ($email !== '' ? $email : 'Subscriber');
            $users[] = [
                'id' => $user_id,
                'user_id' => $user_id,
                'name' => $user_name,
                'email' => $email,
                'plan' => 'Free',
                'plan_name' => 'Free',
                'status' => self::status_label('none'),
                'statusTone' => self::status_tone('none'),
                'renewal' => 'Not scheduled',
                'renewal_date' => 'Not scheduled',
                'amount' => 'NGN 0',
                'amount_label' => 'NGN 0',
                'ref' => '—',
                'gateway_ref' => '—',
                'reference' => '—',
                'action' => 'Upgrade',
                'accent' => self::accent_for_status('none'),
                'subscription' => [
                    'plan' => 'Free',
                    'plan_key' => 'free',
                    'status' => 'none',
                    'amount' => 0,
                    'currency' => self::PLAN_CURRENCY,
                    'interval' => self::PLAN_INTERVAL,
                    'checkout_link' => self::default_checkout_link(),
                    'is_free' => true,
                ],
            ];
        }

        $free_users = max(0, $total_users - $active_subscriptions - $cancelled_subscriptions - $past_due_subscriptions);
        $plans = [
            [
                'id' => 'free',
                'name' => 'Free',
                'slug' => self::generate_subscription_slug('Free'),
                'plan_key' => 'free',
                'price' => 'NGN 0',
                'billing' => 'Free',
                'users' => $free_users,
                'note' => 'No billing frequency',
                'featured' => false,
                'system_plan' => true,
                'reserved_name' => true,
                'can_delete' => false,
                'can_rename' => false,
                'entitlements' => [],
            ],
        ];

        $current_plan = self::current_plan_definition();

        foreach ($plan_rows ?: [] as $row) {
            $plan_definition = self::normalize_plan_definition($row);
            if (sanitize_key((string) ($row->plan_key ?? '')) === self::PLAN_KEY) {
                $plan_definition = $current_plan;
            }

            $plan_key = sanitize_key((string) ($plan_definition['plan_key'] ?? $row->plan_key ?? ''));
            if ($plan_key === self::FREE_PLAN_KEY) {
                continue;
            }
            $billing = trim((string) ($plan_definition['interval_unit'] ?? $row->interval_unit ?? ''));
            $amount_kobo = self::normalize_subscription_amount($plan_definition['amount_kobo'] ?? $row->amount_kobo ?? 0);
            $is_system_plan = self::is_system_plan_key($plan_key);
            $plans[] = [
                'id' => (int) ($row->id ?? 0),
                'name' => (string) ($plan_definition['name'] ?: $row->name ?: $row->plan_key ?: 'Subscription plan'),
                'plan_key' => $plan_key,
                'slug' => self::generate_subscription_slug((string) ($plan_definition['name'] ?: $row->name ?: $row->plan_key ?: 'Subscription plan')),
                'price' => sprintf('%s %s', (string) ($plan_definition['currency'] ?: self::PLAN_CURRENCY), number_format($amount_kobo, 0)),
                'billing' => $billing !== '' ? ucfirst($billing) : 'Manual',
                'users' => (int) ($plan_counts[$plan_key] ?? 0),
                'note' => $billing !== '' ? ucfirst($billing) . ' billing frequency' : 'Managed from the database',
                'featured' => $plan_key === self::PLAN_KEY,
                'system_plan' => $is_system_plan,
                'reserved_name' => $is_system_plan,
                'can_delete' => !$is_system_plan,
                'can_rename' => !$is_system_plan,
                'entitlements' => $plan_key === self::PLAN_KEY ? ['therapy_management'] : [],
                'description' => (string) ($plan_definition['description'] ?? ''),
                'features' => (string) ($plan_definition['features'] ?? ''),
                'checkout_link' => (string) ($plan_definition['checkout_link'] ?? ''),
                'currency' => (string) ($plan_definition['currency'] ?? self::PLAN_CURRENCY),
                'interval' => (string) ($plan_definition['interval_unit'] ?? self::PLAN_INTERVAL),
                'checkout_type' => (string) ($plan_definition['checkout_type'] ?? self::CHECKOUT_TYPE_AUTO),
                'amount_kobo' => $amount_kobo,
            ];
        }

        return Nevari_Helpers::success([
            'plans' => $plans,
            'users' => $users,
            'total_subscriptions' => count($subscription_rows ?: []),
            'active_subscriptions' => $active_subscriptions,
            'past_due_subscriptions' => $past_due_subscriptions,
            'cancelled_subscriptions' => $cancelled_subscriptions,
            'renewals_this_month' => $renewals_this_month,
            'total_pages' => max(1, (int) ceil(max(count($users), 1) / 5)),
            'active_plan_amount_label' => $active_amount_kobo > 0 ? sprintf('%s %s', self::PLAN_CURRENCY, number_format($active_amount_kobo, 0)) : '—',
        ]);
    }

    public static function initialize(WP_REST_Request $request): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        $user = get_userdata($user_id);
        $plan_definition = self::current_plan_definition();
        $plan_amount_raw = self::normalize_subscription_amount($plan_definition['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO);
        $paystack_amount_kobo = self::raw_amount_to_paystack_kobo($plan_amount_raw);
        $plan_currency = $plan_definition['currency'] ?: self::PLAN_CURRENCY;
        self::storefront_log('subscription.initialize.start', 'success', [
            'user_id' => $user_id,
        ]);
        if (!$user || !is_email($user->user_email)) {
            self::storefront_log('subscription.initialize.invalid_user', 'error', [
                'user_id' => $user_id,
                'has_user' => (bool) $user,
            ], 'A valid account email is required before subscribing.');
            return Nevari_Helpers::error('invalid_user', 'A valid account email is required before subscribing.', 400);
        }

        if ($plan_amount_raw === 0) {
            return Nevari_Helpers::success(self::activate_free_subscription($user_id, $plan_definition));
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $secret_key = (string) ($settings['paystack']['secret_key'] ?? '');
        if ($secret_key === '') {
            self::storefront_log('subscription.initialize.paystack_missing', 'error', [
                'user_id' => $user_id,
            ], 'Paystack secret key is not configured.');
            return Nevari_Helpers::error('paystack_not_configured', 'Paystack secret key is not configured.', 500);
        }

        $plan = self::ensure_paystack_plan($secret_key, $plan_definition);
        if (is_wp_error($plan)) {
            self::storefront_log('subscription.initialize.plan_error', 'error', [
                'user_id' => $user_id,
                'error_code' => $plan->get_error_code(),
                'error_message' => $plan->get_error_message(),
            ], $plan->get_error_message());
            return Nevari_Helpers::error('paystack_plan_error', 'Checkout could not be created. Please try again.', 502);
        }

        $now = Nevari_Helpers::now();
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $payments_table = Nevari_Helpers::table('subscription_payments');
        global $wpdb;
        $active_subscription = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$subscriptions_table} WHERE user_id = %d AND status IN ('active', 'trialing', 'past_due') AND amount_kobo > 0 ORDER BY created_at DESC, id DESC LIMIT 1",
            $user_id
        ));
        $subscription_id = $active_subscription ? (int) $active_subscription->id : 0;
        $lock_name = self::checkout_lock_name($user_id, $subscription_id, $plan_definition);
        $lock_acquired = (int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 10)', $lock_name));
        if ($lock_acquired !== 1) {
            self::storefront_log('subscription.initialize.lock_failed', 'error', [
                'user_id' => $user_id,
                'subscription_id' => $subscription_id,
            ], 'Checkout initialization lock could not be acquired.');
            return Nevari_Helpers::error('subscription_checkout_busy', 'Checkout is already being prepared. Please try again in a moment.', 409);
        }

        try {
            $existing_checkout = self::valid_pending_checkout_for_user($user_id, $subscription_id, $plan_amount_raw, $plan_currency);
            if ($existing_checkout) {
                self::storefront_log('subscription.initialize.reused_checkout', 'success', [
                    'user_id' => $user_id,
                    'subscription_id' => $subscription_id,
                    'reference' => $existing_checkout['reference'],
                ]);
                return Nevari_Helpers::success(array_merge($existing_checkout, [
                    'amount' => $plan_amount_raw,
                    'paystack_amount' => $paystack_amount_kobo,
                    'currency' => $plan_currency,
                    'email' => $user->user_email,
                    'plan_code' => $plan['plan_code'],
                    'subscription_status' => $active_subscription ? sanitize_key((string) $active_subscription->status) : 'none',
                    'checkout_reused' => true,
                ]));
            }

            $callback_url = esc_url_raw((string) $request->get_param('callback_url'));
            $failed_references = [];
            for ($attempt = 1; $attempt <= self::CHECKOUT_PAYSTACK_ATTEMPTS; $attempt++) {
                $payment = self::reserve_subscription_payment_reference($user_id, $subscription_id, $plan_amount_raw, $plan_currency, $plan_definition, $failed_references);
                if (is_wp_error($payment)) {
                    self::storefront_log('subscription.initialize.reference_reserve_failed', 'error', [
                        'user_id' => $user_id,
                        'subscription_id' => $subscription_id,
                        'error_code' => $payment->get_error_code(),
                        'error_message' => $payment->get_error_message(),
                    ], 'A unique checkout reference could not be reserved.');
                    return Nevari_Helpers::error('paystack_initialize_failed', 'Checkout could not be created. Please try again.', 502);
                }

                $reference = (string) $payment['reference'];
                $response = self::initialize_paystack_subscription_checkout($secret_key, [
                    'email' => $user->user_email,
                    'amount' => $paystack_amount_kobo,
                    'currency' => $plan_currency,
                    'reference' => $reference,
                    'plan' => $plan['plan_code'],
                    'metadata' => [
                        'source' => 'nevari_access_pro',
                        'user_id' => $user_id,
                        'plan_key' => self::PLAN_KEY,
                    ],
                    'callback_url' => $callback_url,
                ]);

                if (is_wp_error($response)) {
                    self::mark_subscription_payment_failed((int) $payment['id'], [
                        'checkout_status' => 'request_error',
                        'error_code' => $response->get_error_code(),
                        'error_message' => $response->get_error_message(),
                        'failed_at' => Nevari_Helpers::now(),
                    ]);
                    self::storefront_log('subscription.initialize.request_error', 'error', [
                        'user_id' => $user_id,
                        'subscription_id' => $subscription_id,
                        'reference' => $reference,
                        'error_code' => $response->get_error_code(),
                        'error_message' => $response->get_error_message(),
                    ], $response->get_error_message());
                    return Nevari_Helpers::error('paystack_initialize_failed', 'Checkout could not be created. Please try again.', 502);
                }

                $status = (int) ($response['status'] ?? 0);
                $body = is_array($response['body'] ?? null) ? $response['body'] : [];
                if ($status >= 200 && $status < 300 && !empty($body['status']) && !empty($body['data']['access_code']) && !empty($body['data']['authorization_url'])) {
                    $authorization_url = esc_url_raw((string) ($body['data']['authorization_url'] ?? ''));
                    $expires_at = gmdate('Y-m-d H:i:s', time() + self::CHECKOUT_REUSE_SECONDS);
                    self::mark_subscription_payment_initialized((int) $payment['id'], $body, [
                        'authorization_url' => $authorization_url,
                        'checkout_url' => $authorization_url,
                        'expires_at' => $expires_at,
                        'initialized_at' => Nevari_Helpers::now(),
                        'paystack_attempt' => $attempt,
                        'failed_references' => $failed_references,
                    ]);

                    self::storefront_log('subscription.initialize.success', 'success', [
                        'user_id' => $user_id,
                        'subscription_id' => $subscription_id,
                        'reference' => $reference,
                        'plan_code' => $plan['plan_code'],
                        'attempt' => $attempt,
                    ]);
                    return Nevari_Helpers::success([
                        'access_code' => sanitize_text_field((string) $body['data']['access_code']),
                        'authorization_url' => $authorization_url,
                        'checkout_url' => $authorization_url,
                        'checkout_expires_at' => $expires_at,
                        'reference' => $reference,
                        'amount' => $plan_amount_raw,
                        'paystack_amount' => $paystack_amount_kobo,
                        'currency' => $plan_currency,
                        'email' => $user->user_email,
                        'plan_code' => $plan['plan_code'],
                        'subscription_status' => $active_subscription ? sanitize_key((string) $active_subscription->status) : 'none',
                    ]);
                }

                $message = is_array($body) ? (string) ($body['message'] ?? 'Paystack initialization failed.') : 'Paystack initialization failed.';
                self::mark_subscription_payment_failed((int) $payment['id'], [
                    'checkout_status' => 'response_error',
                    'status' => $status,
                    'message' => $message,
                    'body' => $body,
                    'failed_at' => Nevari_Helpers::now(),
                ]);
                self::storefront_log('subscription.initialize.response_error', 'error', [
                    'user_id' => $user_id,
                    'subscription_id' => $subscription_id,
                    'reference' => $reference,
                    'status' => $status,
                    'message' => $message,
                    'attempt' => $attempt,
                ], $message);

                if (self::is_paystack_duplicate_reference_error($message, $body) && $attempt < self::CHECKOUT_PAYSTACK_ATTEMPTS) {
                    $failed_references[] = $reference;
                    continue;
                }

                return Nevari_Helpers::error('paystack_initialize_failed', 'Checkout could not be created. Please try again.', 502);
            }

            return Nevari_Helpers::error('paystack_initialize_failed', 'Checkout could not be created. Please try again.', 502);
        } finally {
            $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock_name));
        }
    }

    public static function verify(WP_REST_Request $request): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        $reference = sanitize_text_field((string) $request->get_param('reference'));
        $plan_definition = self::current_plan_definition();
        $plan_amount_raw = self::normalize_subscription_amount($plan_definition['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO);
        $paystack_amount_kobo = self::raw_amount_to_paystack_kobo($plan_amount_raw);
        $plan_currency = $plan_definition['currency'] ?: self::PLAN_CURRENCY;
        self::storefront_log('subscription.verify.start', 'success', [
            'user_id' => $user_id,
            'reference' => $reference,
        ]);
        if ($reference === '') {
            self::storefront_log('subscription.verify.missing_reference', 'error', [
                'user_id' => $user_id,
            ], 'A Paystack reference is required.');
            return Nevari_Helpers::error('missing_reference', 'A Paystack reference is required.', 400);
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $secret_key = (string) ($settings['paystack']['secret_key'] ?? '');
        if ($secret_key === '') {
            self::storefront_log('subscription.verify.paystack_missing', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
            ], 'Paystack secret key is not configured.');
            return Nevari_Helpers::error('paystack_not_configured', 'Paystack secret key is not configured.', 500);
        }

        global $wpdb;
        $payments_table = Nevari_Helpers::table('subscription_payments');
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $payment = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$payments_table} WHERE reference = %s AND user_id = %d LIMIT 1",
            $reference,
            $user_id
        ));
        if (!$payment) {
            self::storefront_log('subscription.verify.payment_missing', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
            ], 'Subscription payment reference was not found for this user.');
            return Nevari_Helpers::error('subscription_payment_not_found', 'Subscription payment reference was not found for this user.', 404);
        }

        if ((string) $payment->status === 'success') {
            self::refresh_subscription_cache($user_id);
            return Nevari_Helpers::success(self::subscription_payload_for_user($user_id));
        }

        $response = wp_remote_get('https://api.paystack.co/transaction/verify/' . rawurlencode($reference), [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $secret_key,
            ],
        ]);

        if (is_wp_error($response)) {
            self::storefront_log('subscription.verify.request_error', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
                'error_message' => $response->get_error_message(),
            ], $response->get_error_message());
            return Nevari_Helpers::error('paystack_verify_failed', $response->get_error_message(), 502);
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        $data = is_array($body) ? ($body['data'] ?? []) : [];
        if ($status < 200 || $status >= 300 || !is_array($data)) {
            $message = is_array($body) ? (string) ($body['message'] ?? 'Paystack verification failed.') : 'Paystack verification failed.';
            self::storefront_log('subscription.verify.response_error', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
                'status' => $status,
                'body_keys' => is_array($body) ? array_keys($body) : [],
            ], $message);
            return Nevari_Helpers::error('paystack_verify_failed', $message, 502);
        }

        $transaction_status = sanitize_key((string) ($data['status'] ?? ''));
        $amount = (int) ($data['amount'] ?? 0);
        $currency = sanitize_text_field((string) ($data['currency'] ?? ''));
        $metadata_user_id = (int) ($data['metadata']['user_id'] ?? 0);
        $verified_reference = sanitize_text_field((string) ($data['reference'] ?? ''));
        if ($transaction_status !== 'success' || $amount !== $paystack_amount_kobo || strtoupper($currency) !== $plan_currency || $metadata_user_id !== $user_id || $verified_reference !== $reference) {
            self::storefront_log('subscription.verify.mismatch', 'error', [
                'user_id' => $user_id,
                'reference' => $reference,
                'status' => $transaction_status,
                'amount' => $amount,
                'expected_amount' => $paystack_amount_kobo,
                'currency' => $currency,
                'metadata_user_id' => $metadata_user_id,
                'verified_reference' => $verified_reference,
            ], 'The verified transaction did not match the expected subscription payment.');
            return Nevari_Helpers::error('subscription_verification_mismatch', 'The verified transaction did not match the expected subscription payment.', 400, [
                'status' => $transaction_status,
                'amount' => $amount,
                'expected_amount' => $paystack_amount_kobo,
                'currency' => $currency,
                'metadata_user_id' => $metadata_user_id,
            ]);
        }

        $now = Nevari_Helpers::now();
        $paid_at = !empty($data['paid_at']) ? gmdate('Y-m-d H:i:s', strtotime((string) $data['paid_at'])) : $now;
        $renewal_date = gmdate('Y-m-d H:i:s', strtotime('+1 month', strtotime($paid_at)));
        $subscription_code = sanitize_text_field((string) ($data['subscription']['subscription_code'] ?? ''));
        $email_token = sanitize_text_field((string) ($data['subscription']['email_token'] ?? $data['email_token'] ?? ''));
        $customer_code = sanitize_text_field((string) ($data['customer']['customer_code'] ?? ''));
        $plan_code = sanitize_text_field((string) ($data['plan_object']['plan_code'] ?? $data['plan']['plan_code'] ?? ''));

        $existing_subscription = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$subscriptions_table} WHERE user_id = %d ORDER BY id DESC LIMIT 1",
            $user_id
        ));

        $subscription_data = [
            'user_id' => $user_id,
            'plan_key' => self::PLAN_KEY,
            'plan_code' => $plan_code,
            'reference' => $reference,
            'subscription_code' => $subscription_code,
            'customer_code' => $customer_code,
            'status' => 'active',
            'amount_kobo' => $plan_amount_raw,
            'currency' => $plan_currency,
            'renewal_date' => $renewal_date,
            'starts_at' => $paid_at,
            'ends_at' => null,
            'cancelled_at' => null,
            'metadata' => wp_json_encode(array_merge($data, [
                'paystack_email_token' => $email_token,
            ])),
            'updated_at' => $now,
        ];

        if ($existing_subscription) {
            $wpdb->update($subscriptions_table, $subscription_data, ['id' => (int) $existing_subscription->id]);
            $subscription_id = (int) $existing_subscription->id;
        } else {
            $subscription_data['created_at'] = $now;
            $wpdb->insert($subscriptions_table, $subscription_data);
            $subscription_id = (int) $wpdb->insert_id;
        }

        $wpdb->update($payments_table, [
            'subscription_id' => $subscription_id,
            'status' => 'success',
            'paystack_subscription_code' => $subscription_code,
            'verified_at' => $now,
            'payload' => wp_json_encode($data),
            'updated_at' => $now,
        ], [
            'reference' => $reference,
        ]);

        self::storefront_log('subscription.verify.success', 'success', [
            'user_id' => $user_id,
            'reference' => $reference,
            'subscription_id' => $subscription_id,
            'has_subscription_code' => $subscription_code !== '',
        ]);
        self::increment_subscription_version($subscription_id);
        self::refresh_subscription_cache($user_id);
        self::dispatch_subscription_webhook('subscription.updated', [
            'user_id' => $user_id,
            'subscription_id' => $subscription_id,
        ]);
        return Nevari_Helpers::success(self::subscription_payload_for_user($user_id));
    }

    private static function activate_free_subscription(int $user_id, array $plan_definition): array {
        global $wpdb;
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $now = Nevari_Helpers::now();
        $plan_key = sanitize_key((string) ($plan_definition['plan_key'] ?? self::PLAN_KEY)) ?: self::PLAN_KEY;
        $plan_currency = (string) ($plan_definition['currency'] ?? self::PLAN_CURRENCY) ?: self::PLAN_CURRENCY;
        $plan_amount_raw = self::normalize_subscription_amount($plan_definition['amount_kobo'] ?? 0);
        $existing_subscription = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$subscriptions_table} WHERE user_id = %d ORDER BY id DESC LIMIT 1",
            $user_id
        ));

        $subscription_data = [
            'user_id' => $user_id,
            'plan_key' => $plan_key,
            'plan_code' => '',
            'reference' => 'free_' . wp_generate_uuid4(),
            'subscription_code' => '',
            'customer_code' => '',
            'status' => 'active',
            'amount_kobo' => $plan_amount_raw,
            'currency' => $plan_currency,
            'renewal_date' => null,
            'starts_at' => $now,
            'ends_at' => null,
            'cancelled_at' => null,
            'metadata' => wp_json_encode([
                'source' => 'free_subscription_activation',
                'amount' => $plan_amount_raw,
            ]),
            'updated_at' => $now,
        ];

        if ($existing_subscription) {
            $wpdb->update($subscriptions_table, $subscription_data, ['id' => (int) $existing_subscription->id]);
            self::increment_subscription_version((int) $existing_subscription->id);
        } else {
            $subscription_data['created_at'] = $now;
            $wpdb->insert($subscriptions_table, $subscription_data);
        }

        self::refresh_subscription_cache($user_id);
        self::dispatch_subscription_webhook('subscription.updated', [
            'user_id' => $user_id,
            'source' => 'free_subscription_activation',
        ]);

        return array_merge(self::subscription_payload_for_user($user_id), [
            'checkout_completed' => true,
            'free_checkout' => true,
        ]);
    }

    private static function checkout_lock_name(int $user_id, int $subscription_id, array $plan_definition): string {
        $plan_key = sanitize_key((string) ($plan_definition['plan_key'] ?? self::PLAN_KEY));
        $amount = self::normalize_subscription_amount($plan_definition['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO);
        return 'nevari_sub_checkout_' . md5($user_id . '|' . $subscription_id . '|' . $plan_key . '|' . $amount);
    }

    private static function generate_subscription_reference(int $subscription_id, int $user_id): string {
        $uuid = str_replace('-', '', wp_generate_uuid4());
        $reference = sprintf('sub_%d_%d_%s', max(0, $subscription_id), max(0, $user_id), $uuid);
        $reference = preg_replace('/[^A-Za-z0-9_-]/', '', $reference) ?: ('sub_' . $uuid);
        if (strlen($reference) <= self::CHECKOUT_REFERENCE_MAX_LENGTH) {
            return $reference;
        }
        return 'sub_' . substr(hash('sha256', $reference), 0, 64);
    }

    private static function payment_payload($value): array {
        if (is_array($value)) {
            return $value;
        }
        if (empty($value)) {
            return [];
        }
        $decoded = json_decode((string) $value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private static function valid_pending_checkout_for_user(int $user_id, int $subscription_id, int $amount, string $currency): ?array {
        global $wpdb;
        $payments_table = Nevari_Helpers::table('subscription_payments');
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$payments_table} WHERE user_id = %d AND subscription_id = %d AND status = %s AND amount_kobo = %d AND currency = %s ORDER BY id DESC LIMIT 10",
            $user_id,
            $subscription_id,
            'pending',
            $amount,
            $currency
        ));
        foreach ($rows ?: [] as $row) {
            $payload = self::payment_payload($row->payload ?? '');
            $checkout_url = esc_url_raw((string) (
                $payload['checkout_url']
                ?? $payload['authorization_url']
                ?? $payload['paystack']['data']['authorization_url']
                ?? ''
            ));
            $expires_at = sanitize_text_field((string) ($payload['expires_at'] ?? ''));
            $expires_ts = $expires_at !== '' ? strtotime($expires_at) : false;
            if ($checkout_url !== '' && $expires_ts && $expires_ts > time()) {
                return [
                    'access_code' => sanitize_text_field((string) (
                        $payload['access_code']
                        ?? $payload['paystack']['data']['access_code']
                        ?? ''
                    )),
                    'authorization_url' => $checkout_url,
                    'checkout_url' => $checkout_url,
                    'checkout_expires_at' => $expires_at,
                    'reference' => sanitize_text_field((string) $row->reference),
                ];
            }
        }
        return null;
    }

    private static function reserve_subscription_payment_reference(int $user_id, int $subscription_id, int $amount, string $currency, array $plan_definition, array $failed_references = []) {
        global $wpdb;
        $payments_table = Nevari_Helpers::table('subscription_payments');
        for ($attempt = 1; $attempt <= self::CHECKOUT_REFERENCE_INSERT_ATTEMPTS; $attempt++) {
            $reference = self::generate_subscription_reference($subscription_id, $user_id);
            $now = Nevari_Helpers::now();
            $inserted = $wpdb->insert($payments_table, [
                'user_id' => $user_id,
                'subscription_id' => $subscription_id,
                'reference' => $reference,
                'gateway' => 'paystack',
                'amount_kobo' => $amount,
                'currency' => $currency,
                'status' => 'pending',
                'payload' => wp_json_encode([
                    'source' => 'subscription_initialize',
                    'checkout_status' => 'reserved',
                    'reserved_at' => $now,
                    'plan_key' => sanitize_key((string) ($plan_definition['plan_key'] ?? self::PLAN_KEY)),
                    'failed_references' => $failed_references,
                ]),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            if ($inserted !== false) {
                return [
                    'id' => (int) $wpdb->insert_id,
                    'reference' => $reference,
                ];
            }
            self::storefront_log('subscription.initialize.reference_insert_failed', 'error', [
                'user_id' => $user_id,
                'subscription_id' => $subscription_id,
                'reference' => $reference,
                'attempt' => $attempt,
                'db_error' => (string) $wpdb->last_error,
            ], 'Subscription checkout reference insert failed.');
        }

        return new WP_Error('subscription_reference_reserve_failed', 'A unique checkout reference could not be reserved.');
    }

    private static function initialize_paystack_subscription_checkout(string $secret_key, array $params) {
        $body = [
            'email' => (string) ($params['email'] ?? ''),
            'amount' => (int) ($params['amount'] ?? 0),
            'currency' => (string) ($params['currency'] ?? self::PLAN_CURRENCY),
            'reference' => (string) ($params['reference'] ?? ''),
            'plan' => (string) ($params['plan'] ?? ''),
            'metadata' => is_array($params['metadata'] ?? null) ? $params['metadata'] : [],
        ];
        $callback_url = esc_url_raw((string) ($params['callback_url'] ?? ''));
        if ($callback_url !== '') {
            $body['callback_url'] = $callback_url;
        }

        $response = wp_remote_post('https://api.paystack.co/transaction/initialize', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $secret_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode($body),
        ]);
        if (is_wp_error($response)) {
            return $response;
        }

        return [
            'status' => (int) wp_remote_retrieve_response_code($response),
            'body' => json_decode((string) wp_remote_retrieve_body($response), true),
        ];
    }

    private static function mark_subscription_payment_initialized(int $payment_id, array $paystack_body, array $metadata): void {
        global $wpdb;
        $payments_table = Nevari_Helpers::table('subscription_payments');
        $payload = array_merge([
            'source' => 'subscription_initialize',
            'checkout_status' => 'initialized',
            'paystack' => $paystack_body,
            'access_code' => sanitize_text_field((string) ($paystack_body['data']['access_code'] ?? '')),
        ], $metadata);
        $wpdb->update($payments_table, [
            'payload' => wp_json_encode($payload),
            'updated_at' => Nevari_Helpers::now(),
        ], [
            'id' => $payment_id,
        ]);
    }

    private static function mark_subscription_payment_failed(int $payment_id, array $metadata): void {
        global $wpdb;
        $payments_table = Nevari_Helpers::table('subscription_payments');
        $wpdb->update($payments_table, [
            'status' => 'failed',
            'payload' => wp_json_encode(array_merge([
                'source' => 'subscription_initialize',
                'checkout_status' => 'failed',
            ], $metadata)),
            'updated_at' => Nevari_Helpers::now(),
        ], [
            'id' => $payment_id,
        ]);
    }

    private static function is_paystack_duplicate_reference_error(string $message, array $body = []): bool {
        $encoded_body = wp_json_encode($body);
        $combined = strtolower($message . ' ' . (is_string($encoded_body) ? $encoded_body : ''));
        return strpos($combined, 'duplicate') !== false && strpos($combined, 'reference') !== false;
    }

    private static function paystack_event_key(array $event, string $raw_body): string {
        foreach ([$event['id'] ?? '', $event['data']['id'] ?? '', $event['data']['event_id'] ?? ''] as $candidate) {
            $value = preg_replace('/[^A-Za-z0-9_:-]/', '', (string) $candidate);
            if ($value !== '') {
                return hash('sha256', $value);
            }
        }

        return hash('sha256', $raw_body);
    }

    private static function paystack_webhook_event_processed(string $event_key): bool {
        global $wpdb;
        $table = Nevari_Helpers::table('paystack_webhook_events');
        return (bool) $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE event_key = %s LIMIT 1", $event_key));
    }

    private static function ensure_paystack_webhook_events_table(): void {
        global $wpdb;
        $table = Nevari_Helpers::table('paystack_webhook_events');
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) === $table) {
            return;
        }

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE {$table} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            event_key CHAR(64) NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            signature_hash CHAR(64) NOT NULL,
            payload_hash CHAR(64) NOT NULL,
            processed_at DATETIME NOT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY event_key (event_key),
            KEY event_type_created (event_type, created_at)
        ) {$charset};");
    }

    private static function record_paystack_webhook_event(string $event_key, string $event_type, string $signature, string $raw_body): void {
        global $wpdb;
        $table = Nevari_Helpers::table('paystack_webhook_events');
        $now = Nevari_Helpers::now();
        $wpdb->query($wpdb->prepare(
            "INSERT IGNORE INTO {$table} (event_key, event_type, signature_hash, payload_hash, processed_at, created_at) VALUES (%s, %s, %s, %s, %s, %s)",
            $event_key,
            $event_type,
            hash('sha256', $signature),
            hash('sha256', $raw_body),
            $now,
            $now
        ));
    }

    private static function process_paystack_subscription_event(string $event_type, array $data): array {
        return match ($event_type) {
            'subscription.create' => self::upsert_subscription_from_paystack_event($data, 'active'),
            'charge.success' => self::handle_paystack_charge_success($data),
            'invoice.update' => self::upsert_subscription_from_paystack_event($data, 'active'),
            'invoice.payment_failed' => self::upsert_subscription_from_paystack_event($data, 'past_due'),
            'subscription.not_renew' => self::upsert_subscription_from_paystack_event($data, 'active', true),
            'subscription.disable' => self::upsert_subscription_from_paystack_event($data, 'cancelled', true),
            default => [],
        };
    }

    private static function handle_paystack_charge_success(array $data): array {
        global $wpdb;
        $reference = sanitize_text_field((string) ($data['reference'] ?? ''));
        if ($reference !== '') {
            $payments_table = Nevari_Helpers::table('subscription_payments');
            $now = Nevari_Helpers::now();
            $wpdb->update($payments_table, [
                'status' => 'verified',
                'verified_at' => $now,
                'payload' => wp_json_encode(['source' => 'paystack_webhook', 'event' => 'charge.success', 'data' => $data]),
                'updated_at' => $now,
            ], ['reference' => $reference]);
        }

        return self::upsert_subscription_from_paystack_event($data, 'active');
    }

    private static function upsert_subscription_from_paystack_event(array $data, string $status, bool $cancelled = false): array {
        $user_id = self::paystack_event_user_id($data);
        if ($user_id <= 0) {
            self::storefront_log('subscription.webhook.user_not_found', 'error', [
                'status' => $status,
                'reference' => sanitize_text_field((string) ($data['reference'] ?? '')),
                'subscription_code' => self::paystack_event_subscription_code($data),
            ], 'Paystack webhook could not be mapped to a local user.');
            return [];
        }

        global $wpdb;
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $plan = self::paystack_event_plan_definition($data);
        $subscription_code = self::paystack_event_subscription_code($data);
        $reference = sanitize_text_field((string) ($data['reference'] ?? $data['transaction']['reference'] ?? ''));
        $now = Nevari_Helpers::now();
        $renewal_date = self::paystack_event_datetime($data, ['next_payment_date', 'next_payment_at', 'period_end', 'paid_at']);
        $ends_at = $cancelled
            ? ($renewal_date ?: self::paystack_event_datetime($data, ['ends_at', 'cancelled_at', 'disabled_at']) ?: $now)
            : self::paystack_event_datetime($data, ['ends_at']);
        $lookup = null;

        if ($subscription_code !== '') {
            $lookup = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$subscriptions_table} WHERE subscription_code = %s ORDER BY id DESC LIMIT 1", $subscription_code));
        }
        if (!$lookup && $reference !== '') {
            $lookup = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$subscriptions_table} WHERE reference = %s ORDER BY id DESC LIMIT 1", $reference));
        }
        if (!$lookup) {
            $lookup = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$subscriptions_table} WHERE user_id = %d ORDER BY id DESC LIMIT 1", $user_id));
        }

        $subscription_data = [
            'user_id' => $user_id,
            'plan_key' => sanitize_key((string) ($plan['plan_key'] ?? self::PLAN_KEY)),
            'plan_code' => sanitize_text_field((string) ($plan['plan_code'] ?? self::paystack_event_plan_code($data))),
            'reference' => $reference,
            'subscription_code' => $subscription_code,
            'customer_code' => self::paystack_event_customer_code($data),
            'status' => sanitize_key($status),
            'amount_kobo' => self::paystack_event_amount($data, $plan),
            'currency' => sanitize_text_field((string) ($data['currency'] ?? $data['transaction']['currency'] ?? $plan['currency'] ?? self::PLAN_CURRENCY)),
            'renewal_date' => $renewal_date,
            'starts_at' => self::paystack_event_datetime($data, ['created_at', 'started_at', 'paid_at']) ?: $now,
            'ends_at' => $ends_at,
            'cancelled_at' => $cancelled ? $now : null,
            'metadata' => wp_json_encode(['source' => 'paystack_webhook', 'paystack' => $data]),
            'updated_at' => $now,
        ];

        if ($lookup) {
            $wpdb->update($subscriptions_table, $subscription_data, ['id' => (int) $lookup->id]);
            self::increment_subscription_version((int) $lookup->id);
        } else {
            $subscription_data['created_at'] = $now;
            $wpdb->insert($subscriptions_table, $subscription_data);
        }

        return ['user_id' => $user_id];
    }

    private static function paystack_event_user_id(array $data): int {
        $metadata = is_array($data['metadata'] ?? null) ? $data['metadata'] : [];
        $user_id = (int) ($metadata['user_id'] ?? $metadata['nevari_user_id'] ?? $data['user_id'] ?? 0);
        if ($user_id > 0) {
            return $user_id;
        }

        global $wpdb;
        $payments_table = Nevari_Helpers::table('subscription_payments');
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $reference = sanitize_text_field((string) ($data['reference'] ?? $data['transaction']['reference'] ?? ''));
        if ($reference !== '') {
            $payment_user_id = (int) $wpdb->get_var($wpdb->prepare("SELECT user_id FROM {$payments_table} WHERE reference = %s LIMIT 1", $reference));
            if ($payment_user_id > 0) {
                return $payment_user_id;
            }
        }

        $subscription_code = self::paystack_event_subscription_code($data);
        if ($subscription_code !== '') {
            $subscription_user_id = (int) $wpdb->get_var($wpdb->prepare("SELECT user_id FROM {$subscriptions_table} WHERE subscription_code = %s ORDER BY id DESC LIMIT 1", $subscription_code));
            if ($subscription_user_id > 0) {
                return $subscription_user_id;
            }
        }

        $customer_code = self::paystack_event_customer_code($data);
        if ($customer_code !== '') {
            $customer_user_id = (int) $wpdb->get_var($wpdb->prepare("SELECT user_id FROM {$subscriptions_table} WHERE customer_code = %s ORDER BY id DESC LIMIT 1", $customer_code));
            if ($customer_user_id > 0) {
                return $customer_user_id;
            }
        }

        $email = sanitize_email((string) ($data['customer']['email'] ?? $data['email'] ?? ''));
        if ($email !== '') {
            $user = get_user_by('email', $email);
            if ($user instanceof WP_User) {
                return (int) $user->ID;
            }
        }

        return 0;
    }

    private static function paystack_event_subscription_code(array $data): string {
        return sanitize_text_field((string) ($data['subscription_code'] ?? $data['subscription']['subscription_code'] ?? $data['subscription']['code'] ?? ''));
    }

    private static function paystack_event_customer_code(array $data): string {
        return sanitize_text_field((string) ($data['customer']['customer_code'] ?? $data['customer']['code'] ?? $data['customer_code'] ?? ''));
    }

    private static function paystack_event_plan_code(array $data): string {
        return sanitize_text_field((string) ($data['plan']['plan_code'] ?? $data['plan']['code'] ?? $data['plan_code'] ?? ''));
    }

    private static function paystack_event_plan_definition(array $data): array {
        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $plan_code = self::paystack_event_plan_code($data);
        if ($plan_code !== '') {
            $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$plans_table} WHERE plan_code = %s LIMIT 1", $plan_code));
            if ($row) {
                return self::normalize_plan_definition($row);
            }
        }

        return self::current_plan_definition();
    }

    private static function paystack_event_amount(array $data, array $plan): int {
        $amount = $data['amount'] ?? $data['transaction']['amount'] ?? $data['plan']['amount'] ?? null;
        if (is_numeric($amount) && (int) $amount > 0) {
            return max(1, (int) floor(((int) $amount) / 100));
        }

        return self::normalize_subscription_amount($plan['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO);
    }

    private static function paystack_event_datetime(array $data, array $keys): ?string {
        foreach ($keys as $key) {
            $value = $data[$key] ?? $data['subscription'][$key] ?? $data['transaction'][$key] ?? null;
            if (empty($value)) {
                continue;
            }
            $timestamp = strtotime((string) $value);
            if ($timestamp) {
                return gmdate('Y-m-d H:i:s', $timestamp);
            }
        }

        return null;
    }

    private static function increment_subscription_version(int $subscription_id): void {
        if ($subscription_id <= 0 || !self::subscription_version_column_exists()) {
            return;
        }

        global $wpdb;
        $table = Nevari_Helpers::table('subscriptions');
        $wpdb->query($wpdb->prepare("UPDATE {$table} SET subscription_version = subscription_version + 1 WHERE id = %d", $subscription_id));
    }

    private static function subscription_version_column_exists(): bool {
        static $exists = null;
        if ($exists !== null) {
            return $exists;
        }

        global $wpdb;
        $table = Nevari_Helpers::table('subscriptions');
        $column = $wpdb->get_var($wpdb->prepare("SHOW COLUMNS FROM {$table} LIKE %s", 'subscription_version'));
        $exists = !empty($column);
        return $exists;
    }

    public static function cancel(): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        self::storefront_log('subscription.cancel.start', 'success', [
            'user_id' => $user_id,
        ]);
        global $wpdb;
        $subscriptions_table = Nevari_Helpers::table('subscriptions');
        $subscription = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$subscriptions_table} WHERE user_id = %d AND status IN ('active', 'trialing', 'past_due') AND amount_kobo > 0 ORDER BY created_at DESC, id DESC LIMIT 1",
            $user_id
        ));
        if (!$subscription) {
            self::storefront_log('subscription.cancel.no_subscription', 'error', [
                'user_id' => $user_id,
            ], 'No subscription record was found for the current user.');
            return Nevari_Helpers::error('subscription_not_found', 'No active paid subscription was found for this user.', 404);
        }

        $subscription_code = sanitize_text_field((string) ($subscription->subscription_code ?? ''));
        $email_token = self::paystack_email_token_from_subscription($subscription);
        if ($subscription_code === '' || $email_token === '') {
            self::storefront_log('subscription.cancel.paystack_details_missing', 'error', [
                'user_id' => $user_id,
                'subscription_id' => (int) $subscription->id,
                'has_subscription_code' => $subscription_code !== '',
                'has_email_token' => $email_token !== '',
            ], 'Paystack cancellation details are missing for this subscription.');
            return Nevari_Helpers::error('paystack_cancel_details_missing', 'This subscription cannot be cancelled automatically because Paystack cancellation details are missing. Please contact support.', 400);
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $secret_key = (string) ($settings['paystack']['secret_key'] ?? '');
        if ($secret_key === '') {
            self::storefront_log('subscription.cancel.paystack_missing', 'error', [
                'user_id' => $user_id,
                'subscription_id' => (int) $subscription->id,
            ], 'Paystack secret key is not configured.');
            return Nevari_Helpers::error('paystack_not_configured', 'Paystack secret key is not configured.', 500);
        }

        $response = wp_remote_post('https://api.paystack.co/subscription/disable', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $secret_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode([
                'code' => $subscription_code,
                'token' => $email_token,
            ]),
        ]);
        if (is_wp_error($response)) {
            self::storefront_log('subscription.cancel.request_error', 'error', [
                'user_id' => $user_id,
                'subscription_id' => (int) $subscription->id,
                'error_message' => $response->get_error_message(),
            ], $response->get_error_message());
            return Nevari_Helpers::error('paystack_cancel_failed', $response->get_error_message(), 502);
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || empty($body['status'])) {
            $message = is_array($body) ? (string) ($body['message'] ?? 'Paystack subscription cancellation failed.') : 'Paystack subscription cancellation failed.';
            self::storefront_log('subscription.cancel.response_error', 'error', [
                'user_id' => $user_id,
                'subscription_id' => (int) $subscription->id,
                'status' => $status,
            ], $message);
            return Nevari_Helpers::error('paystack_cancel_failed', $message, 502);
        }

        $now = Nevari_Helpers::now();
        $ends_at = !empty($subscription->renewal_date) ? (string) $subscription->renewal_date : $now;
        $wpdb->update($subscriptions_table, [
            'status' => 'active',
            'ends_at' => $ends_at,
            'cancelled_at' => $now,
            'updated_at' => $now,
        ], [
            'id' => (int) $subscription->id,
        ]);

        self::storefront_log('subscription.cancel.success', 'success', [
            'user_id' => $user_id,
            'subscription_id' => (int) $subscription->id,
            'ends_at' => $ends_at,
        ]);
        self::increment_subscription_version((int) $subscription->id);
        self::refresh_subscription_cache($user_id);
        self::dispatch_subscription_webhook('subscription.updated', [
            'user_id' => $user_id,
            'subscription_id' => (int) $subscription->id,
            'cancelled' => true,
        ]);
        return Nevari_Helpers::success(array_merge(self::subscription_payload_for_user($user_id), [
            'cancelled' => true,
            'cancelled_at' => $now,
            'ends_at' => $ends_at,
        ]));
    }

    private static function ensure_paystack_plan(string $secret_key, array $plan_definition = []) {
        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $definition = !empty($plan_definition) ? $plan_definition : self::current_plan_definition();
        $plan_key = sanitize_key((string) ($definition['plan_key'] ?? self::PLAN_KEY)) ?: self::PLAN_KEY;
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$plans_table} WHERE plan_key = %s LIMIT 1",
            $plan_key
        ));
        if ($existing && !empty($existing->plan_code)) {
            return [
                'plan_code' => sanitize_text_field((string) $existing->plan_code),
            ];
        }

        $amount_raw = self::normalize_subscription_amount($definition['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO);
        if ($amount_raw <= 0) {
            return new WP_Error('paystack_plan_free_amount', 'Free subscription plans do not require a Paystack plan.');
        }
        $amount_kobo = self::raw_amount_to_paystack_kobo($amount_raw);
        $currency = !empty($definition['currency']) ? (string) $definition['currency'] : self::PLAN_CURRENCY;
        $interval = !empty($definition['interval_unit']) ? (string) $definition['interval_unit'] : self::PLAN_INTERVAL;
        $name = !empty($definition['name']) ? (string) $definition['name'] : self::PLAN_NAME;

        $response = wp_remote_post('https://api.paystack.co/plan', [
            'timeout' => 30,
            'headers' => [
                'Authorization' => 'Bearer ' . $secret_key,
                'Content-Type' => 'application/json',
            ],
            'body' => wp_json_encode([
                'name' => $name,
                'interval' => $interval,
                'amount' => $amount_kobo,
                'currency' => $currency,
                'description' => $name . ' subscription',
            ]),
        ]);

        if (is_wp_error($response)) {
            return $response;
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300 || empty($body['status']) || empty($body['data']['plan_code'])) {
            $message = is_array($body) ? (string) ($body['message'] ?? 'Unable to create the Paystack subscription plan.') : 'Unable to create the Paystack subscription plan.';
            return new WP_Error('paystack_plan_error', $message);
        }

        $now = Nevari_Helpers::now();
        $plan_code = sanitize_text_field((string) $body['data']['plan_code']);
        if ($existing) {
            $wpdb->update($plans_table, [
                'plan_code' => $plan_code,
                'name' => $name,
                'amount_kobo' => $amount_raw,
                'currency' => $currency,
                'interval_unit' => $interval,
                'status' => 'active',
                'metadata' => wp_json_encode($body['data']),
                'updated_at' => $now,
            ], ['id' => (int) $existing->id]);
        } else {
            $wpdb->insert($plans_table, [
                'plan_key' => $plan_key,
                'plan_code' => $plan_code,
                'name' => $name,
                'amount_kobo' => $amount_raw,
                'currency' => $currency,
                'interval_unit' => $interval,
                'status' => 'active',
                'metadata' => wp_json_encode($body['data']),
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        return [
            'plan_code' => $plan_code,
        ];
    }

    private static function subscription_cache_key(int $user_id): string {
        return 'nevari:subscription:claims:' . max(0, $user_id);
    }

    public static function invalidate_subscription_cache(int $user_id): void {
        if ($user_id <= 0) {
            return;
        }

        wp_cache_delete(self::subscription_cache_key($user_id), self::SUBSCRIPTION_CACHE_GROUP);
    }

    private static function refresh_subscription_cache(int $user_id): array {
        self::invalidate_subscription_cache($user_id);
        return self::subscription_claims_for_user($user_id, true);
    }

    public static function subscription_claims_for_user(int $user_id, bool $force = false): array {
        $user_id = max(0, $user_id);
        if ($user_id <= 0) {
            return self::inactive_subscription_claims(0);
        }

        $cache_key = self::subscription_cache_key($user_id);
        if (!$force) {
            $cached = wp_cache_get($cache_key, self::SUBSCRIPTION_CACHE_GROUP);
            if (is_array($cached)) {
                return $cached;
            }
        }

        global $wpdb;
        $table = Nevari_Helpers::table('subscriptions');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$table} WHERE user_id = %d ORDER BY created_at DESC, id DESC LIMIT 1",
            $user_id
        ));

        $claims = $row ? self::subscription_claims_from_row($row) : self::inactive_subscription_claims($user_id);
        wp_cache_set($cache_key, $claims, self::SUBSCRIPTION_CACHE_GROUP, self::subscription_claims_ttl($claims));
        return $claims;
    }

    public static function consultation_quota_snapshot_for_user(int $user_id, bool $force = false): array {
        $user_id = max(0, $user_id);
        $claims = self::subscription_claims_for_user($user_id, $force);
        $quota = self::consultation_quota_payload($user_id, $claims);

        return array_merge($quota, [
            'is_paid' => !empty($claims['is_paid']),
            'plan_key' => sanitize_key((string) ($claims['plan_key'] ?? self::FREE_PLAN_KEY)),
            'status' => sanitize_key((string) ($claims['status'] ?? 'none')),
        ]);
    }

    public static function require_paid_access(int $user_id = 0) {
        $user_id = $user_id > 0 ? $user_id : Nevari_Auth::api_session_user_id();
        $claims = self::subscription_claims_for_user($user_id);
        if (empty($claims['is_paid'])) {
            return Nevari_Helpers::error('subscription_required', 'Active subscription required.', 403);
        }
        return $claims;
    }

    private static function inactive_subscription_claims(int $user_id): array {
        return [
            'user_id' => max(0, $user_id),
            'status' => 'none',
            'plan' => 'Free',
            'plan_key' => self::FREE_PLAN_KEY,
            'tier' => 'free',
            'expires_at' => null,
            'starts_at' => null,
            'renewal_date' => null,
            'is_paid' => false,
            'entitlements' => [],
            'version' => 0,
            'cached_at' => time(),
        ];
    }

    private static function subscription_claims_from_row(object $row): array {
        $user_id = (int) ($row->user_id ?? 0);
        $status = self::effective_subscription_status($row);
        $amount = self::normalize_subscription_amount($row->amount_kobo ?? 0);
        $has_paid_access = $amount > 0
            && in_array($status, ['active', 'trialing', 'past_due', 'cancelled'], true)
            && !self::subscription_access_expired($row);
        $plan_key = sanitize_key((string) ($row->plan_key ?? ($has_paid_access ? self::PLAN_KEY : self::FREE_PLAN_KEY)));
        $definition = self::plan_definition_for_key($plan_key);
        $expires_at = !empty($row->ends_at)
            ? (string) $row->ends_at
            : (!empty($row->renewal_date) ? (string) $row->renewal_date : null);
        $version = (int) ($row->subscription_version ?? 0);
        if ($version <= 0) {
            $version = (int) ($row->id ?? 0);
        }

        return [
            'user_id' => $user_id,
            'status' => $status ?: 'none',
            'plan' => $has_paid_access ? (string) ($definition['name'] ?? self::PLAN_NAME) : 'Free',
            'plan_key' => $has_paid_access ? ($plan_key ?: self::PLAN_KEY) : self::FREE_PLAN_KEY,
            'tier' => $has_paid_access ? 'pro' : 'free',
            'expires_at' => $expires_at,
            'starts_at' => !empty($row->starts_at) ? (string) $row->starts_at : null,
            'renewal_date' => !empty($row->renewal_date) ? (string) $row->renewal_date : null,
            'is_paid' => $has_paid_access,
            'entitlements' => $has_paid_access ? ['therapy_management', 'refills'] : [],
            'version' => $version,
            'cached_at' => time(),
        ];
    }

    private static function subscription_claims_ttl(array $claims): int {
        $status = sanitize_key((string) ($claims['status'] ?? 'none'));
        $ttl = match ($status) {
            'active', 'trialing' => self::SUBSCRIPTION_ACTIVE_TTL,
            'past_due', 'payment_failed', 'failed' => self::SUBSCRIPTION_RISK_TTL,
            default => self::SUBSCRIPTION_INACTIVE_TTL,
        };

        $expires_at = !empty($claims['expires_at']) ? strtotime((string) $claims['expires_at']) : false;
        if ($expires_at) {
            $seconds_until_expiry = $expires_at - strtotime(Nevari_Helpers::now());
            if ($seconds_until_expiry > 0) {
                $ttl = min($ttl, max(30, $seconds_until_expiry));
            }
        }

        return max(30, (int) $ttl);
    }

    private static function consultation_quota_total(): int {
        return 5;
    }

    private static function subscription_quota_reset_at(array $claims): ?string {
        foreach (['renewal_date', 'expires_at'] as $field) {
            $value = trim((string) ($claims[$field] ?? ''));
            if ($value !== '') {
                return $value;
            }
        }
        return null;
    }

    private static function subscription_quota_cycle_start(array $claims, ?string $reset_at): ?string {
        $starts_at = trim((string) ($claims['starts_at'] ?? ''));
        if ($starts_at !== '') {
            return $starts_at;
        }
        if (!$reset_at) {
            return null;
        }

        $timestamp = strtotime($reset_at);
        if (!$timestamp) {
            return null;
        }

        return gmdate('Y-m-d H:i:s', strtotime('-1 month', $timestamp));
    }

    private static function subscription_quota_used(int $user_id, array $claims): int {
        global $wpdb;
        if ($user_id <= 0) {
            return 0;
        }

        $table = Nevari_Helpers::table('appointments');
        $found = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
        if ((string) $found !== (string) $table) {
            return 0;
        }

        $reset_at = self::subscription_quota_reset_at($claims);
        $cycle_start = self::subscription_quota_cycle_start($claims, $reset_at);

        $sql = "SELECT COUNT(1) FROM {$table} WHERE patient_user_id = %d AND status IN ('confirmed', 'completed')";
        $params = [$user_id];
        if ($cycle_start) {
            $sql .= " AND start_at >= %s";
            $params[] = $cycle_start;
        }
        if ($reset_at) {
            $sql .= " AND start_at < %s";
            $params[] = $reset_at;
        }

        $prepared = call_user_func_array([$wpdb, 'prepare'], array_merge([$sql], $params));
        $used = (int) $wpdb->get_var($prepared);
        return max(0, $used);
    }

    private static function consultation_quota_payload(int $user_id, array $claims): array {
        $total = self::consultation_quota_total();
        $is_paid = !empty($claims['is_paid']);
        $reset_at = self::subscription_quota_reset_at($claims);
        $used = $is_paid ? self::subscription_quota_used($user_id, $claims) : 0;
        $used = min($total, max(0, $used));
        $remaining = $is_paid ? max(0, $total - $used) : 0;

        return [
            'free_consultations_total' => $is_paid ? $total : 0,
            'free_consultations_used' => $used,
            'free_consultations_remaining' => $remaining,
            'free_consultations_reset_at' => $reset_at,
            'free_consultations_reset_label' => $reset_at ? wp_date('F j, Y', strtotime($reset_at)) : '',
        ];
    }

    private static function plan_definition_for_key(string $plan_key): array {
        $plan_key = sanitize_key($plan_key);
        if ($plan_key === self::FREE_PLAN_KEY) {
            return self::default_free_plan_definition();
        }

        global $wpdb;
        $plans_table = Nevari_Helpers::table('subscription_plans');
        $row = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$plans_table} WHERE plan_key = %s LIMIT 1",
            $plan_key
        ));

        return $row ? self::normalize_plan_definition($row) : self::current_plan_definition();
    }

    private static function subscription_payload_from_claims(int $user_id, array $claims): array {
        $is_paid = !empty($claims['is_paid']);
        $plan_key = sanitize_key((string) ($claims['plan_key'] ?? self::FREE_PLAN_KEY));
        $plan_definition = self::plan_definition_for_key($is_paid ? $plan_key : self::PLAN_KEY);
        $protected_features = self::protected_features_for_paid_access($is_paid);
        $quota_payload = self::consultation_quota_payload($user_id, $claims);

        return [
            'plan' => (string) ($claims['plan'] ?? ($is_paid ? self::PLAN_NAME : 'Free')),
            'plan_key' => $is_paid ? $plan_key : self::FREE_PLAN_KEY,
            'status' => sanitize_key((string) ($claims['status'] ?? 'none')),
            'tier' => sanitize_key((string) ($claims['tier'] ?? ($is_paid ? 'pro' : 'free'))),
            'is_paid' => $is_paid,
            'can_access_therapy_management' => $protected_features['therapy_management'],
            'can_refill' => $protected_features['refills'],
            'protected_features' => $protected_features,
            'renewal_date' => !empty($claims['expires_at']) ? gmdate('M j, Y', strtotime((string) $claims['expires_at'])) : '',
            'ends_at' => $claims['expires_at'] ?? null,
            'access_ends_at' => $claims['expires_at'] ?? null,
            'accessEndsAt' => $claims['expires_at'] ?? null,
            'free_consultations_total' => $quota_payload['free_consultations_total'],
            'free_consultations_used' => $quota_payload['free_consultations_used'],
            'free_consultations_remaining' => $quota_payload['free_consultations_remaining'],
            'free_consultations_reset_at' => $quota_payload['free_consultations_reset_at'],
            'free_consultations_reset_label' => $quota_payload['free_consultations_reset_label'],
            'amount' => $is_paid ? self::normalize_subscription_amount($plan_definition['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO) : 0,
            'currency' => $plan_definition['currency'] ?: self::PLAN_CURRENCY,
            'interval' => $plan_definition['interval_unit'] === 'manual' ? 'month' : $plan_definition['interval_unit'],
            'paystack_subscription_code' => '',
            'paystack_email_token' => '',
            'subscription_code_masked' => '',
            'manage_billing_url' => '',
            'checkout_url' => '',
            'authorization_url' => '',
            'checkout_expires_at' => '',
            'checkout_link' => (string) ($plan_definition['checkout_link'] ?? self::default_checkout_link()),
            'active_subscriptions' => [],
            'latest_subscription' => null,
            'description' => (string) ($plan_definition['description'] ?? ''),
            'features' => (string) ($plan_definition['features'] ?? ''),
            'entitlements' => is_array($claims['entitlements'] ?? null) ? array_values($claims['entitlements']) : [],
            'subscription_claims_cached_at' => (int) ($claims['cached_at'] ?? 0),
            'subscription_version' => (int) ($claims['version'] ?? 0),
            'user_id' => $user_id,
        ];
    }

    private static function subscription_payload_for_user(int $user_id): array {
        $claims = self::subscription_claims_for_user($user_id);
        return self::subscription_payload_from_claims($user_id, $claims);
    }

    private static function legacy_subscription_payload_for_user(int $user_id): array {
        global $wpdb;
        $table = Nevari_Helpers::table('subscriptions');
        $active_rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$table} WHERE user_id = %d AND status IN ('active', 'trialing', 'past_due') AND amount_kobo > 0 ORDER BY created_at DESC, id DESC",
            $user_id
        ));
        $row = is_array($active_rows) && !empty($active_rows) ? $active_rows[0] : null;

        if (!$row) {
            return self::base_payload($user_id);
        }

        $status = self::effective_subscription_status($row);
        $plan_definition = self::current_plan_definition();
        $current_amount = self::normalize_subscription_amount($plan_definition['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO);
        $plan_name = (string) ($plan_definition['name'] ?? self::PLAN_NAME);
        $latest_subscription = self::subscription_row_payload($row);
        $pending_checkout = self::valid_pending_checkout_for_user($user_id, (int) $row->id, $current_amount, (string) ($plan_definition['currency'] ?: self::PLAN_CURRENCY));
        $checkout_url = $pending_checkout ? (string) $pending_checkout['checkout_url'] : self::subscription_checkout_url($row);
        $has_paid_access = self::normalize_subscription_amount($row->amount_kobo ?? 0) > 0
            && in_array($status, ['active', 'trialing', 'past_due', 'cancelled'], true)
            && !self::subscription_access_expired($row);
        $protected_features = self::protected_features_for_paid_access($has_paid_access);
        $quota_payload = self::consultation_quota_payload($user_id, self::subscription_claims_from_row($row));
        return [
            'plan' => $has_paid_access ? $plan_name : 'Free',
            'plan_key' => $has_paid_access ? ($plan_definition['plan_key'] ?? self::PLAN_KEY) : 'free',
            'status' => $status ?: 'none',
            'is_paid' => $has_paid_access,
            'can_access_therapy_management' => $protected_features['therapy_management'],
            'can_refill' => $protected_features['refills'],
            'protected_features' => $protected_features,
            'renewal_date' => !empty($row->renewal_date) ? gmdate('M j, Y', strtotime((string) $row->renewal_date)) : '',
            'ends_at' => !empty($row->ends_at) ? (string) $row->ends_at : null,
            'access_ends_at' => !empty($row->ends_at) ? (string) $row->ends_at : null,
            'accessEndsAt' => !empty($row->ends_at) ? (string) $row->ends_at : null,
            'free_consultations_total' => $quota_payload['free_consultations_total'],
            'free_consultations_used' => $quota_payload['free_consultations_used'],
            'free_consultations_remaining' => $quota_payload['free_consultations_remaining'],
            'free_consultations_reset_at' => $quota_payload['free_consultations_reset_at'],
            'free_consultations_reset_label' => $quota_payload['free_consultations_reset_label'],
            'amount' => $current_amount,
            'currency' => $plan_definition['currency'] ?: self::PLAN_CURRENCY,
            'interval' => $plan_definition['interval_unit'] === 'manual' ? 'month' : $plan_definition['interval_unit'],
            'paystack_subscription_code' => sanitize_text_field((string) $row->subscription_code),
            'paystack_email_token' => self::paystack_email_token_from_subscription($row),
            'subscription_code_masked' => self::mask_code((string) $row->subscription_code),
            'manage_billing_url' => self::paystack_manage_link_from_subscription($row),
            'checkout_url' => $checkout_url,
            'authorization_url' => $checkout_url,
            'checkout_expires_at' => $pending_checkout ? (string) $pending_checkout['checkout_expires_at'] : '',
            'checkout_link' => (string) ($plan_definition['checkout_link'] ?? self::default_checkout_link()),
            'active_subscriptions' => self::subscription_rows_payload(is_array($active_rows) ? $active_rows : []),
            'latest_subscription' => $latest_subscription,
            'description' => (string) ($plan_definition['description'] ?? ''),
            'features' => (string) ($plan_definition['features'] ?? ''),
            'entitlements' => $has_paid_access ? ['therapy_management', 'refills'] : [],
        ];
    }

    public static function user_has_paid_access(int $user_id = 0): bool {
        $user_id = $user_id > 0 ? $user_id : Nevari_Auth::api_session_user_id();
        if ($user_id <= 0) {
            return false;
        }

        $claims = self::subscription_claims_for_user($user_id);
        return !empty($claims['is_paid']);
    }

    private static function protected_features_for_paid_access(bool $has_paid_access): array {
        return [
            'therapy_management' => $has_paid_access,
            'refills' => $has_paid_access,
        ];
    }

    private static function entitlements_for_status(string $status): array {
        return in_array($status, ['active', 'trialing'], true) ? ['therapy_management'] : [];
    }

    private static function effective_subscription_status(object $row): string {
        $status = sanitize_key((string) ($row->status ?? ''));
        if (!in_array($status, ['active', 'trialing', 'past_due'], true)) {
            return $status ?: 'none';
        }

        if (!empty($row->cancelled_at)) {
            return 'cancelled';
        }

        $ends_at = !empty($row->ends_at) ? strtotime((string) $row->ends_at) : false;
        if ($ends_at && $ends_at <= strtotime(Nevari_Helpers::now())) {
            return 'cancelled';
        }

        return $status;
    }

    private static function subscription_access_expired(object $row): bool {
        $ends_at = !empty($row->ends_at) ? strtotime((string) $row->ends_at) : false;
        return (bool) ($ends_at && $ends_at <= strtotime(Nevari_Helpers::now()));
    }

    private static function status_label(string $status): string {
        if ($status === '' || $status === 'none') {
            return 'Free';
        }
        return ucwords(str_replace(['_', '-'], ' ', $status));
    }

    private static function status_tone(string $status): string {
        return match ($status) {
            'active', 'trialing' => 'confirmed',
            'past_due' => 'pending',
            'cancelled' => 'cancelled',
            default => 'draft',
        };
    }

    private static function accent_for_status(string $status): string {
        return match ($status) {
            'active', 'trialing' => 'primary',
            'past_due' => 'accent',
            'cancelled' => 'danger',
            default => 'soft',
        };
    }

    private static function base_payload(int $user_id = 0): array {
        $plan_definition = self::current_plan_definition();
        $current_amount = self::normalize_subscription_amount($plan_definition['amount_kobo'] ?? self::PLAN_AMOUNT_KOBO);
        $currency = (string) ($plan_definition['currency'] ?: self::PLAN_CURRENCY);
        $pending_checkout = $user_id > 0 && $current_amount > 0
            ? self::valid_pending_checkout_for_user($user_id, 0, $current_amount, $currency)
            : null;
        $checkout_url = $pending_checkout ? (string) $pending_checkout['checkout_url'] : '';
        $protected_features = self::protected_features_for_paid_access(false);
        return [
            'plan' => 'Free',
            'plan_key' => 'free',
            'status' => 'none',
            'is_paid' => false,
            'can_access_therapy_management' => false,
            'can_refill' => false,
            'protected_features' => $protected_features,
            'renewal_date' => '',
            'ends_at' => null,
            'free_consultations_total' => 0,
            'free_consultations_used' => 0,
            'free_consultations_remaining' => 0,
            'free_consultations_reset_at' => null,
            'free_consultations_reset_label' => '',
            'amount' => $current_amount,
            'currency' => $currency,
            'interval' => $plan_definition['interval_unit'] === 'manual' ? 'month' : $plan_definition['interval_unit'],
            'paystack_subscription_code' => '',
            'paystack_email_token' => '',
            'subscription_code_masked' => '',
            'manage_billing_url' => '',
            'checkout_url' => $checkout_url,
            'authorization_url' => $checkout_url,
            'checkout_expires_at' => $pending_checkout ? (string) $pending_checkout['checkout_expires_at'] : '',
            'checkout_link' => $plan_definition['checkout_link'] ?? self::default_checkout_link(),
            'active_subscriptions' => [],
            'latest_subscription' => null,
            'description' => $plan_definition['description'] ?? '',
            'features' => $plan_definition['features'] ?? '',
            'entitlements' => [],
        ];
    }

    private static function subscription_row_payload(object $row): array {
        return [
            'id' => (int) ($row->id ?? 0),
            'plan_key' => sanitize_key((string) ($row->plan_key ?? '')),
            'plan_code' => sanitize_text_field((string) ($row->plan_code ?? '')),
            'reference' => sanitize_text_field((string) ($row->reference ?? '')),
            'status' => self::effective_subscription_status($row),
            'amount' => self::normalize_subscription_amount($row->amount_kobo ?? 0),
            'currency' => sanitize_text_field((string) ($row->currency ?? self::PLAN_CURRENCY)),
            'renewal_date' => !empty($row->renewal_date) ? (string) $row->renewal_date : null,
            'ends_at' => !empty($row->ends_at) ? (string) $row->ends_at : null,
            'created_at' => !empty($row->created_at) ? (string) $row->created_at : null,
            'updated_at' => !empty($row->updated_at) ? (string) $row->updated_at : null,
            'checkout_url' => self::subscription_checkout_url($row),
            'authorization_url' => self::subscription_checkout_url($row),
            'manage_billing_url' => self::paystack_manage_link_from_subscription($row),
            'paystack_subscription_code' => sanitize_text_field((string) ($row->subscription_code ?? '')),
            'paystack_email_token' => self::paystack_email_token_from_subscription($row),
        ];
    }

    private static function subscription_rows_payload(array $rows): array {
        $payload = [];
        foreach ($rows as $row) {
            if (is_object($row)) {
                $payload[] = self::subscription_row_payload($row);
            }
        }
        return $payload;
    }

    private static function subscription_metadata(object $row): array {
        if (empty($row->metadata)) {
            return [];
        }
        $decoded = json_decode((string) $row->metadata, true);
        return is_array($decoded) ? $decoded : [];
    }

    private static function paystack_email_token_from_subscription(object $row): string {
        $metadata = self::subscription_metadata($row);
        return sanitize_text_field((string) (
            $metadata['paystack_email_token']
            ?? $metadata['subscription']['email_token']
            ?? $metadata['email_token']
            ?? ''
        ));
    }

    private static function paystack_manage_link_from_subscription(object $row): string {
        $metadata = self::subscription_metadata($row);
        return esc_url_raw((string) (
            $metadata['manage_billing_url']
            ?? $metadata['manage_link']
            ?? $metadata['subscription']['manage_link']
            ?? ''
        ));
    }

    private static function subscription_checkout_url(object $row): string {
        $metadata = self::subscription_metadata($row);
        $url = (string) (
            $metadata['checkout_url']
            ?? $metadata['authorization_url']
            ?? $metadata['data']['authorization_url']
            ?? ''
        );
        return esc_url_raw($url);
    }

    private static function mask_code(string $value): string {
        $raw = trim($value);
        if ($raw === '') {
            return '';
        }
        if (strlen($raw) <= 8) {
            return $raw;
        }
        return substr($raw, 0, 4) . '...' . substr($raw, -4);
    }

    private static function storefront_log(string $event, string $status, array $context = [], string $message = ''): void {
        if (!class_exists('Nevari_Audit')) {
            return;
        }

        $payload = $context;
        if ($message !== '') {
            $payload['message'] = $message;
        }
        $payload['dashboard'] = 'customer';

        Nevari_Audit::log('dashboard', 'customer', $event, in_array($status, ['success', 'error'], true) ? $status : 'success', $payload);
    }
}
