<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Plugin {
    private const DOCTOR_PROFILE_POST_TYPE = 'nevari_doctor_prof';

    private static $instance = null;

    public static function instance(): self {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function init(): void {
        add_action('init', [$this, 'send_rest_request_headers'], 0);
        add_action('init', [$this, 'handle_rest_preflight'], 0);
        add_action('init', [$this, 'register_post_types']);
        add_action('init', [$this, 'register_taxonomies']);
        add_action('init', [$this, 'register_product_meta']);
        add_action('init', [$this, 'register_order_statuses']);
        add_filter('rest_post_dispatch', [$this, 'append_rest_cors_headers'], 10, 3);
        add_filter('rest_pre_serve_request', [$this, 'send_rest_cors_headers'], 10, 4);
        add_filter('wc_order_statuses', [$this, 'filter_woocommerce_order_statuses']);
        add_action('nevari_send_appointment_reminder', [$this, 'send_appointment_reminder'], 10, 1);

        Nevari_Audit::init();
        Nevari_Auth::init();
        Nevari_Connections::init();
        Nevari_Rest::init();
        Nevari_Admin::init();
        Nevari_Emails::init();

        $this->register_woocommerce_hooks();
    }

    public function register_post_types(): void {
        register_post_type(self::DOCTOR_PROFILE_POST_TYPE, [
            'label' => __('Doctor Profiles', 'nevari-pharmacy-core'),
            'labels' => [
                'name' => __('Doctor Profiles', 'nevari-pharmacy-core'),
                'singular_name' => __('Doctor Profile', 'nevari-pharmacy-core'),
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => false,
            'show_in_rest' => false,
            'supports' => ['title', 'editor', 'thumbnail'],
            'capability_type' => 'post',
        ]);
    }

    public function register_taxonomies(): void {
        register_taxonomy('nevari_doctor_specialty', [self::DOCTOR_PROFILE_POST_TYPE], [
            'label' => __('Doctor Specialties', 'nevari-pharmacy-core'),
            'public' => false,
            'show_ui' => true,
            'show_in_rest' => false,
            'hierarchical' => true,
        ]);

        register_taxonomy('nevari_doctor_language', [self::DOCTOR_PROFILE_POST_TYPE], [
            'label' => __('Doctor Languages', 'nevari-pharmacy-core'),
            'public' => false,
            'show_ui' => true,
            'show_in_rest' => false,
            'hierarchical' => false,
        ]);

        register_taxonomy('nevari_doctor_location', [self::DOCTOR_PROFILE_POST_TYPE], [
            'label' => __('Doctor Locations', 'nevari-pharmacy-core'),
            'public' => false,
            'show_ui' => true,
            'show_in_rest' => false,
            'hierarchical' => true,
        ]);

        if (post_type_exists('product')) {
            register_taxonomy('nevari_product_badge', ['product'], [
                'label' => __('Pharmacy Product Badges', 'nevari-pharmacy-core'),
                'public' => false,
                'show_ui' => true,
                'show_in_rest' => false,
                'hierarchical' => false,
            ]);
        }
    }

    public function register_product_meta(): void {
        if (!function_exists('register_post_meta')) {
            return;
        }

        $boolean_meta = [
            '_nevari_rx_required',
            '_nevari_consultation_required',
            '_nevari_otc',
            '_nevari_restricted_visibility',
        ];

        foreach ($boolean_meta as $key) {
            register_post_meta('product', $key, [
                'single' => true,
                'type' => 'boolean',
                'show_in_rest' => false,
                'auth_callback' => static function () {
                    return current_user_can('edit_products') || current_user_can('nevari_manage_products');
                },
            ]);
        }

        foreach (['_nevari_badge_label', '_nevari_badge_color', '_nevari_dosage_form', '_nevari_strength', '_nevari_active_ingredient'] as $key) {
            register_post_meta('product', $key, [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => false,
                'sanitize_callback' => 'sanitize_text_field',
                'auth_callback' => static function () {
                    return current_user_can('edit_products') || current_user_can('nevari_manage_products');
                },
            ]);
        }
    }

    public function register_order_statuses(): void {
        if (!function_exists('register_post_status')) {
            return;
        }

        register_post_status('wc-awaiting-doctor', [
            'label' => __('Awaiting Doctor', 'nevari-pharmacy-core'),
            'public' => true,
            'exclude_from_search' => false,
            'show_in_admin_all_list' => true,
            'show_in_admin_status_list' => true,
            'label_count' => _n_noop('Awaiting Doctor <span class="count">(%s)</span>', 'Awaiting Doctor <span class="count">(%s)</span>', 'nevari-pharmacy-core'),
        ]);

        register_post_status('wc-awaiting-prescription', [
            'label' => __('Awaiting Prescription', 'nevari-pharmacy-core'),
            'public' => true,
            'exclude_from_search' => false,
            'show_in_admin_all_list' => true,
            'show_in_admin_status_list' => true,
            'label_count' => _n_noop('Awaiting Prescription <span class="count">(%s)</span>', 'Awaiting Prescription <span class="count">(%s)</span>', 'nevari-pharmacy-core'),
        ]);
    }

    public function filter_woocommerce_order_statuses(array $statuses): array {
        $ordered = [];

        foreach ($statuses as $key => $label) {
            $ordered[$key] = $label;
            if ('wc-pending' === $key) {
                $ordered['wc-awaiting-doctor'] = __('Awaiting Doctor', 'nevari-pharmacy-core');
                $ordered['wc-awaiting-prescription'] = __('Awaiting Prescription', 'nevari-pharmacy-core');
            }
        }

        if (!isset($ordered['wc-awaiting-doctor'])) {
            $ordered['wc-awaiting-doctor'] = __('Awaiting Doctor', 'nevari-pharmacy-core');
        }
        if (!isset($ordered['wc-awaiting-prescription'])) {
            $ordered['wc-awaiting-prescription'] = __('Awaiting Prescription', 'nevari-pharmacy-core');
        }

        return $ordered;
    }

    private function register_woocommerce_hooks(): void {
        add_action('woocommerce_new_order', static function ($order_id) {
            Nevari_Audit::log('orders', 'woocommerce', 'order.created', 'success', [
                'object_type' => 'shop_order',
                'object_id' => (int) $order_id,
                'order_id' => (int) $order_id,
                'message' => 'WooCommerce order created.',
            ]);
        }, 10, 1);
        add_action('woocommerce_checkout_order_processed', [$this, 'apply_initial_rx_order_status'], 20, 1);

        add_action('woocommerce_order_status_changed', static function ($order_id, $old_status, $new_status) {
            Nevari_Audit::log('orders', 'woocommerce', 'order.status_changed', 'success', [
                'object_type' => 'shop_order',
                'object_id' => (int) $order_id,
                'order_id' => (int) $order_id,
                'message' => sprintf('Order status changed from %s to %s.', $old_status, $new_status),
                'metadata' => [
                    'old_status' => $old_status,
                    'new_status' => $new_status,
                ],
            ]);
        }, 10, 3);

        add_action('woocommerce_payment_complete', [$this, 'handle_appointment_payment_complete'], 10, 1);

        add_filter('woocommerce_add_to_cart_validation', [$this, 'validate_rx_add_to_cart'], 10, 3);
        add_action('woocommerce_checkout_process', [$this, 'validate_rx_checkout']);
        add_action('woocommerce_checkout_create_order_line_item', [$this, 'add_rx_order_item_meta'], 10, 4);
    }

    public function validate_rx_add_to_cart($passed, $product_id, $quantity) {
        if (!$passed || !Nevari_Helpers::product_requires_rx((int) $product_id)) {
            return $passed;
        }

        $user_id = get_current_user_id();
        if (!$user_id || !Nevari_Helpers::patient_has_valid_prescription_for_product($user_id, (int) $product_id, (float) $quantity)) {
            wc_add_notice(__('This product requires a valid prescription before purchase.', 'nevari-pharmacy-core'), 'error');
            Nevari_Audit::log('orders', 'woocommerce', 'order.rx_validation_failed', 'error', [
                'product_id' => (int) $product_id,
                'related_user_id' => (int) $user_id,
                'message' => 'Patient attempted to add RX product without a valid prescription.',
            ]);
            return false;
        }

        return $passed;
    }

    public function validate_rx_checkout(): void {
        if (!function_exists('WC') || !WC()->cart) {
            return;
        }

        $user_id = get_current_user_id();
        foreach (WC()->cart->get_cart() as $cart_item) {
            $product_id = isset($cart_item['product_id']) ? (int) $cart_item['product_id'] : 0;
            $quantity = isset($cart_item['quantity']) ? (float) $cart_item['quantity'] : 1;
            if ($product_id && Nevari_Helpers::product_requires_rx($product_id) && !Nevari_Helpers::patient_has_valid_prescription_for_product($user_id, $product_id, $quantity)) {
                wc_add_notice(__('Your cart contains a prescription-only product without a valid prescription.', 'nevari-pharmacy-core'), 'error');
                Nevari_Audit::log('orders', 'woocommerce', 'order.rx_validation_failed', 'error', [
                    'product_id' => $product_id,
                    'related_user_id' => (int) $user_id,
                    'message' => 'Checkout blocked because RX validation failed.',
                ]);
            }
        }
    }

    public function add_rx_order_item_meta($item, $cart_item_key, $values, $order): void {
        $product_id = isset($values['product_id']) ? (int) $values['product_id'] : 0;
        if (!$product_id || !Nevari_Helpers::product_requires_rx($product_id)) {
            return;
        }
        $item->add_meta_data('_nevari_rx_required', 'yes', true);
        $prescription = Nevari_Helpers::find_valid_prescription_for_product((int) $order->get_user_id(), $product_id, isset($values['quantity']) ? (float) $values['quantity'] : 1);
        if ($prescription) {
            $item->add_meta_data('_nevari_prescription_id', (int) $prescription->id, true);
        }
    }

    public function apply_initial_rx_order_status(int $order_id): void {
        if (!self::instance() || !function_exists('wc_get_order')) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }

        $requires_rx = false;
        foreach ($order->get_items() as $item) {
            if ($item->get_meta('_nevari_rx_required') === 'yes') {
                $requires_rx = true;
                break;
            }
        }

        if (!$requires_rx) {
            return;
        }

        $order->update_meta_data('_nevari_rx_validation_status', 'awaiting_doctor');
        if (!(int) $order->get_meta('_nevari_assigned_doctor_user_id')) {
            $order->set_status('awaiting-doctor', __('Awaiting doctor assignment for prescription review.', 'nevari-pharmacy-core'));
        }
        $order->save();
    }

    public function handle_appointment_payment_complete(int $order_id): void {
        Nevari_Audit::log('payments', 'woocommerce', 'payment.completed', 'success', [
            'object_type' => 'shop_order',
            'object_id' => (int) $order_id,
            'order_id' => (int) $order_id,
            'message' => 'WooCommerce payment completed.',
        ]);

        if (!function_exists('wc_get_order')) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }

        $appointment_id = (int) $order->get_meta('_nevari_appointment_id');
        if ($appointment_id < 1) {
            return;
        }

        global $wpdb;
        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment) {
            return;
        }

        $wpdb->update($appointments_table, [
            'status' => 'confirmed',
            'payment_status' => 'paid',
            'payment_completed_at' => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s', '%s', '%s'], ['%d']);

        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        $doctor = get_user_by('id', (int) $appointment->doctor_user_id);
        $patient = get_user_by('id', (int) $appointment->patient_user_id);
        $calendar = Nevari_Helpers::appointment_calendar_links($appointment);
        $ics = [
            'filename' => Nevari_Helpers::appointment_ics_filename($appointment),
            'content' => Nevari_Helpers::appointment_ics_content($appointment, $doctor ? $doctor->display_name : '', $patient ? $patient->display_name : ''),
        ];

        Nevari_Emails::queue_or_send([
            'template_key' => 'appointment_payment_receipt',
            'recipient_user_id' => (int) $appointment->patient_user_id,
            'related_object_type' => 'appointment',
            'related_object_id' => $appointment_id,
            'attachments' => [$ics],
            'variables' => [
                'patient_name' => $patient ? $patient->display_name : 'Patient',
                'doctor_name' => $doctor ? $doctor->display_name : 'Doctor',
                'appointment_start' => Nevari_Helpers::iso_datetime($appointment->start_at),
                'appointment_amount' => html_entity_decode(wp_strip_all_tags($order->get_formatted_order_total())),
                'calendar_link' => $calendar['ics_url'],
                'calendar_link_html' => ['html' => '<a href="' . esc_url($calendar['ics_url']) . '">Download calendar invite</a>', 'text' => $calendar['ics_url']],
            ],
        ], false);

        $this->schedule_appointment_reminder($appointment_id, $appointment->start_at);
    }

    public function schedule_appointment_reminder(int $appointment_id, string $start_at): void {
        $timestamp = strtotime($start_at . ' UTC') - (15 * MINUTE_IN_SECONDS);
        if ($timestamp <= time()) {
            return;
        }
        if (function_exists('as_has_scheduled_action') && as_has_scheduled_action('nevari_send_appointment_reminder', [$appointment_id], 'nevari')) {
            return;
        }
        if (function_exists('as_schedule_single_action')) {
            as_schedule_single_action($timestamp, 'nevari_send_appointment_reminder', [$appointment_id], 'nevari');
        } else {
            wp_schedule_single_event($timestamp, 'nevari_send_appointment_reminder', [$appointment_id]);
        }
    }

    public function send_appointment_reminder(int $appointment_id): void {
        global $wpdb;
        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment || $appointment->status !== 'confirmed' || $appointment->payment_status !== 'paid' || !empty($appointment->reminder_sent_at)) {
            return;
        }

        $doctor = get_user_by('id', (int) $appointment->doctor_user_id);
        $patient = get_user_by('id', (int) $appointment->patient_user_id);
        $calendar = Nevari_Helpers::appointment_calendar_links($appointment);
        $ics = [
            'filename' => Nevari_Helpers::appointment_ics_filename($appointment),
            'content' => Nevari_Helpers::appointment_ics_content($appointment, $doctor ? $doctor->display_name : '', $patient ? $patient->display_name : ''),
        ];
        $recipients = [];
        if ($patient) {
            $recipients[] = ['user_id' => (int) $patient->ID, 'email' => $patient->user_email, 'name' => $patient->display_name];
        }
        if ($doctor) {
            $recipients[] = ['user_id' => (int) $doctor->ID, 'email' => $doctor->user_email, 'name' => $doctor->display_name];
        }
        $admin_email = get_option('admin_email');
        if ($admin_email) {
            $recipients[] = ['user_id' => null, 'email' => $admin_email, 'name' => 'Admin'];
        }

        foreach ($recipients as $recipient) {
            Nevari_Emails::queue_or_send([
                'template_key' => 'appointment_reminder',
                'recipient_user_id' => $recipient['user_id'],
                'recipient_email' => $recipient['email'],
                'related_object_type' => 'appointment',
                'related_object_id' => $appointment_id,
                'attachments' => [$ics],
                'variables' => [
                    'recipient_name' => $recipient['name'],
                    'patient_name' => $patient ? $patient->display_name : 'Patient',
                    'doctor_name' => $doctor ? $doctor->display_name : 'Doctor',
                    'appointment_start' => Nevari_Helpers::iso_datetime($appointment->start_at),
                    'calendar_link' => $calendar['ics_url'],
                    'calendar_link_html' => ['html' => '<a href="' . esc_url($calendar['ics_url']) . '">Download calendar invite</a>', 'text' => $calendar['ics_url']],
                ],
            ], false);
        }

        $wpdb->update($appointments_table, [
            'reminder_sent_at' => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s'], ['%d']);
    }

    public function handle_rest_preflight(): void {
        if (!$this->is_nevari_rest_preflight_request()) {
            return;
        }

        $origin = $this->allowed_rest_origin();
        if (!$origin) {
            return;
        }

        $this->emit_rest_cors_headers($origin);
        status_header(204);
        header('Content-Length: 0');
        exit;
    }

    public function send_rest_request_headers(): void {
        if (!$this->is_nevari_rest_request()) {
            return;
        }

        $origin = $this->allowed_rest_origin();
        if (!$origin) {
            return;
        }

        $this->emit_rest_cors_headers($origin);
    }

    public function append_rest_cors_headers($response, $server, $request) {
        if (!$request instanceof WP_REST_Request || !$this->is_nevari_rest_route($request->get_route())) {
            return $response;
        }

        $origin = $this->allowed_rest_origin();
        if (!$origin) {
            return $response;
        }

        if ($response instanceof WP_HTTP_Response) {
            foreach ($this->rest_cors_headers($origin) as $header_name => $header_value) {
                $response->header($header_name, $header_value);
            }
        }

        return $response;
    }

    public function send_rest_cors_headers($served, $result, $request, $server) {
        if (!$request instanceof WP_REST_Request || !$this->is_nevari_rest_route($request->get_route())) {
            return $served;
        }

        $origin = $this->allowed_rest_origin();
        if (!$origin) {
            return $served;
        }

        $this->emit_rest_cors_headers($origin);

        return $served;
    }

    private function allowed_rest_origin(): ?string {
        $origin = isset($_SERVER['HTTP_ORIGIN']) ? trim(wp_unslash($_SERVER['HTTP_ORIGIN'])) : '';
        if ($origin === '') {
            return null;
        }

        $origin = $this->normalize_allowed_origin($origin);
        if ($origin === null) {
            return null;
        }

        $allowed = apply_filters('nevari_allowed_origins', [
            home_url(),
            site_url(),
            'null',
        ]);

        if (class_exists('Nevari_Connections')) {
            foreach (Nevari_Connections::trusted_frontends() as $connection) {
                if (!empty($connection['frontend_origin'])) {
                    $allowed[] = $connection['frontend_origin'];
                }
            }
        }

        $allowed = array_values(array_filter(array_map(static function ($value) {
            if (!is_string($value)) {
                return '';
            }

            $value = trim($value);
            if ($value === '' || $value === 'null' || $value === '*') {
                return $value;
            }

            if (class_exists('Nevari_Connections')) {
                return Nevari_Connections::normalize_origin($value) ?: '';
            }

            $parts = wp_parse_url($value);
            if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
                return '';
            }

            $normalized = strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']);
            if (!empty($parts['port'])) {
                $normalized .= ':' . (int) $parts['port'];
            }

            return $normalized;
        }, is_array($allowed) ? $allowed : [])));

        if (in_array('*', $allowed, true) || in_array($origin, $allowed, true) || $this->is_local_development_origin($origin)) {
            return $origin;
        }

        return null;
    }

    private function is_local_development_origin(string $origin): bool {
        if ($origin === 'null') {
            return false;
        }

        $parts = wp_parse_url($origin);
        if (!is_array($parts)) {
            return false;
        }

        $scheme = isset($parts['scheme']) ? strtolower((string) $parts['scheme']) : '';
        $host = isset($parts['host']) ? strtolower((string) $parts['host']) : '';

        if (!in_array($scheme, ['http', 'https'], true)) {
            return false;
        }

        return in_array($host, ['localhost', '127.0.0.1', '::1'], true);
    }

    private function is_nevari_rest_preflight_request(): bool {
        if (strtoupper(isset($_SERVER['REQUEST_METHOD']) ? (string) $_SERVER['REQUEST_METHOD'] : '') !== 'OPTIONS') {
            return false;
        }

        return $this->is_nevari_rest_request();
    }

    private function is_nevari_rest_request(): bool {
        return $this->is_nevari_rest_route($this->requested_rest_route());
    }

    private function requested_rest_route(): string {
        if (!empty($_GET['rest_route'])) {
            $route = (string) wp_unslash($_GET['rest_route']);
            return strpos($route, '/') === 0 ? $route : '/' . ltrim($route, '/');
        }

        $path = wp_parse_url(isset($_SERVER['REQUEST_URI']) ? (string) wp_unslash($_SERVER['REQUEST_URI']) : '', PHP_URL_PATH);
        if (!is_string($path) || $path === '') {
            return '';
        }

        $rest_prefix = '/' . trim(rest_get_url_prefix(), '/');
        $position = strpos($path, $rest_prefix . '/');
        if ($position === false) {
            return '';
        }

        return substr($path, $position + strlen($rest_prefix));
    }

    private function is_nevari_rest_route(string $route): bool {
        return strpos($route, '/' . NEVARI_PHARMACY_REST_NS . '/') === 0;
    }

    private function emit_rest_cors_headers(string $origin): void {
        foreach ($this->rest_cors_headers($origin) as $header_name => $header_value) {
            header($header_name . ': ' . $header_value);
        }
    }

    private function normalize_allowed_origin(string $origin): ?string {
        if ($origin === 'null') {
            return 'null';
        }

        if (class_exists('Nevari_Connections')) {
            return Nevari_Connections::normalize_origin($origin);
        }

        $parts = wp_parse_url($origin);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }

        $normalized = strtolower((string) $parts['scheme']) . '://' . strtolower((string) $parts['host']);
        if (!empty($parts['port'])) {
            $normalized .= ':' . (int) $parts['port'];
        }

        return $normalized;
    }

    private function rest_cors_headers(string $origin): array {
        return [
            'Access-Control-Allow-Origin' => $origin,
            'Access-Control-Allow-Methods' => 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers' => 'Authorization, Content-Type, X-Requested-With, X-Nevari-Frontend-Type, X-Nevari-Frontend-Origin',
            'Access-Control-Expose-Headers' => 'Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining',
            'Access-Control-Max-Age' => '600',
            'Vary' => 'Origin',
        ];
    }
}
