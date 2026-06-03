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
        add_action('nevari_send_customer_appointment_reminder_24h', [$this, 'send_customer_appointment_reminder_24h'], 10, 2);
        add_action('nevari_send_customer_appointment_reminder_1h', [$this, 'send_customer_appointment_reminder_1h'], 10, 2);
        add_action('nevari_send_doctor_appointment_reminder_24h', [$this, 'send_doctor_appointment_reminder_24h'], 10, 2);
        add_action('nevari_send_doctor_appointment_reminder_1h', [$this, 'send_doctor_appointment_reminder_1h'], 10, 2);
        add_action('nevari_send_customer_appointment_followup', [$this, 'send_customer_appointment_followup'], 10, 2);
        add_action('nevari_expire_appointment_reservation', [$this, 'expire_appointment_reservation'], 10, 1);

        Nevari_Audit::init();
        Nevari_Auth::init();
        Nevari_Connections::init();
        Nevari_Rest::init();
        Nevari_Subscriptions::init();
        Nevari_Admin::init();
        Nevari_Emails::init();

        $this->ensure_required_email_templates();
        $this->ensure_appointment_lifecycle_columns();
        $this->register_woocommerce_hooks();
    }

    private function ensure_appointment_lifecycle_columns(): void {
        global $wpdb;

        if (!class_exists('Nevari_Helpers')) {
            return;
        }

        $table = Nevari_Helpers::table('appointments');
        $columns = [
            'reserved_until' => "ALTER TABLE {$table} ADD reserved_until DATETIME NULL",
            'customer_confirmation_sent_at' => "ALTER TABLE {$table} ADD customer_confirmation_sent_at DATETIME NULL",
            'doctor_confirmation_sent_at' => "ALTER TABLE {$table} ADD doctor_confirmation_sent_at DATETIME NULL",
            'customer_reminder_24h_sent_at' => "ALTER TABLE {$table} ADD customer_reminder_24h_sent_at DATETIME NULL",
            'customer_reminder_1h_sent_at' => "ALTER TABLE {$table} ADD customer_reminder_1h_sent_at DATETIME NULL",
            'doctor_reminder_24h_sent_at' => "ALTER TABLE {$table} ADD doctor_reminder_24h_sent_at DATETIME NULL",
            'doctor_reminder_1h_sent_at' => "ALTER TABLE {$table} ADD doctor_reminder_1h_sent_at DATETIME NULL",
            'customer_followup_sent_at' => "ALTER TABLE {$table} ADD customer_followup_sent_at DATETIME NULL",
            'cancelled_at' => "ALTER TABLE {$table} ADD cancelled_at DATETIME NULL",
            'rescheduled_at' => "ALTER TABLE {$table} ADD rescheduled_at DATETIME NULL",
            'title' => "ALTER TABLE {$table} ADD title VARCHAR(191) NULL",
            'duration_minutes' => "ALTER TABLE {$table} ADD duration_minutes INT UNSIGNED NULL",
        ];

        foreach ($columns as $column => $sql) {
            $exists = $wpdb->get_var($wpdb->prepare("SHOW COLUMNS FROM {$table} LIKE %s", $column));
            if (!$exists) {
                $wpdb->query($sql);
            }
        }
    }

    private function ensure_required_email_templates(): void {
        global $wpdb;

        if (!class_exists('Nevari_Helpers')) {
            return;
        }

        $table = Nevari_Helpers::table('email_templates');
        $now = Nevari_Helpers::now();
        $created_by = get_current_user_id() ?: 0;
        $templates = [
            [
                'template_key' => 'doctor_order_assigned',
                'name' => 'Doctor Order Assigned',
                'subject' => 'A pharmacy order needs your review',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Order {{order_number}} has been assigned to you for {{patient_name}}.</p><p>Product/service: {{product_service_assigned}}</p><p>You can open your dashboard to create a prescription or schedule an appointment.</p>',
                'body_text' => 'Hello {{doctor_name}}, order {{order_number}} has been assigned to you for {{patient_name}}. Product/service: {{product_service_assigned}}. Open your dashboard to create a prescription or schedule an appointment.',
                'variables' => ['doctor_name', 'patient_name', 'order_number', 'product_service_assigned', 'customer_email', 'customer_phone'],
            ],
            [
                'template_key' => 'appointment_customer_confirmation',
                'name' => 'Appointment Customer Confirmation',
                'subject' => 'Appointment confirmed with {{doctor_name}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your {{consultation_type}} appointment is confirmed for {{appointment_date}} at {{appointment_time}}.</p><p>Doctor: {{doctor_name}}</p><p>Amount paid: {{amount_paid}}</p><p>Booking ID: {{booking_id}}<br />Order ID: {{order_id}}</p><p>{{google_meet_link_html}}</p><p><a href="{{cancel_link}}">Cancel appointment</a> | <a href="{{reschedule_link}}">Reschedule appointment</a></p><p>Please join 5 minutes before the appointment starts.</p>',
                'body_text' => 'Hello {{patient_name}}, your appointment with {{doctor_name}} is confirmed for {{appointment_date}} at {{appointment_time}}. Join: {{google_meet_link}} Booking ID: {{booking_id}} Order ID: {{order_id}}',
                'variables' => ['patient_name', 'doctor_name', 'consultation_type', 'appointment_date', 'appointment_time', 'amount_paid', 'booking_id', 'order_id', 'google_meet_link', 'google_meet_link_html', 'cancel_link', 'reschedule_link'],
            ],
            [
                'template_key' => 'appointment_doctor_notification',
                'name' => 'Appointment Doctor Notification',
                'subject' => 'New appointment with {{patient_name}}',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>A new {{consultation_type}} appointment has been confirmed.</p><p>Patient: {{patient_name}}<br />Email: {{customer_email}}<br />Phone: {{customer_phone}}</p><p>Date: {{appointment_date}}<br />Time: {{appointment_time}}</p><p>Patient note: {{patient_note}}</p><p>{{google_meet_link_html}}</p><p><a href="{{dashboard_link}}">Open dashboard</a></p>',
                'body_text' => 'Hello {{doctor_name}}, {{patient_name}} booked {{appointment_date}} at {{appointment_time}}. Note: {{patient_note}} Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'customer_email', 'customer_phone', 'consultation_type', 'appointment_date', 'appointment_time', 'patient_note', 'google_meet_link', 'google_meet_link_html', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_customer_reminder_24h',
                'name' => 'Appointment Customer Reminder 24h',
                'subject' => 'Reminder: appointment with {{doctor_name}} tomorrow',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} is scheduled for {{appointment_date}} at {{appointment_time}}.</p><p>{{google_meet_link_html}}</p><p><a href="{{cancel_link}}">Cancel</a> | <a href="{{reschedule_link}}">Reschedule</a></p>',
                'body_text' => 'Your appointment with {{doctor_name}} is scheduled for {{appointment_date}} at {{appointment_time}}. Join: {{google_meet_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'google_meet_link', 'google_meet_link_html', 'cancel_link', 'reschedule_link'],
            ],
            [
                'template_key' => 'appointment_customer_reminder_1h',
                'name' => 'Appointment Customer Reminder 1h',
                'subject' => 'Your appointment starts in 1 hour',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} starts at {{appointment_time}}.</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 1 hour. Doctor: {{doctor_name}} Time: {{appointment_time}} Join: {{google_meet_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_time', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_reminder_24h',
                'name' => 'Appointment Doctor Reminder 24h',
                'subject' => 'Reminder: appointment with {{patient_name}} tomorrow',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} is scheduled for {{appointment_date}} at {{appointment_time}}.</p><p>Patient note: {{patient_note}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Appointment with {{patient_name}} at {{appointment_time}}. Note: {{patient_note}} Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_date', 'appointment_time', 'patient_note', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_reminder_1h',
                'name' => 'Appointment Doctor Reminder 1h',
                'subject' => 'Your appointment starts in 1 hour',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} starts at {{appointment_time}}.</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 1 hour. Patient: {{patient_name}} Time: {{appointment_time}} Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_time', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_customer_followup',
                'name' => 'Appointment Customer Follow Up',
                'subject' => 'How was your appointment with {{doctor_name}}?',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Thank you for choosing Nevari. Please review your appointment with {{doctor_name}}.</p><p><a href="{{review_link}}">Leave a review</a></p><p><a href="{{dashboard_link}}">Book another appointment</a></p>',
                'body_text' => 'Thank you for choosing Nevari. Leave a review: {{review_link}}',
                'variables' => ['patient_name', 'doctor_name', 'review_link', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_cancelled',
                'name' => 'Appointment Cancelled',
                'subject' => 'Appointment cancelled',
                'body_html' => '<p>Hello {{recipient_name}},</p><p>The appointment between {{patient_name}} and {{doctor_name}} for {{appointment_start}} has been cancelled.</p>',
                'body_text' => 'The appointment between {{patient_name}} and {{doctor_name}} for {{appointment_start}} has been cancelled.',
                'variables' => ['recipient_name', 'patient_name', 'doctor_name', 'appointment_start'],
            ],
            [
                'template_key' => 'appointment_rescheduled',
                'name' => 'Appointment Rescheduled',
                'subject' => 'Appointment rescheduled',
                'body_html' => '<p>Hello {{recipient_name}},</p><p>The appointment has been rescheduled to {{appointment_start}}.</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'The appointment has been rescheduled to {{appointment_start}}. Join: {{google_meet_link}}',
                'variables' => ['recipient_name', 'appointment_start', 'google_meet_link', 'google_meet_link_html'],
            ],
        ];

        foreach ($templates as $template) {
            $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE template_key = %s ORDER BY version DESC LIMIT 1", $template['template_key']));
            if ($existing) {
                if ($this->should_refresh_required_email_template($existing, $template)) {
                    $wpdb->update($table, [
                        'name' => $template['name'],
                        'subject' => $template['subject'],
                        'body_html' => $template['body_html'],
                        'body_text' => $template['body_text'],
                        'variables' => wp_json_encode($template['variables']),
                        'status' => 'active',
                        'updated_by' => $created_by,
                        'updated_at' => $now,
                    ], ['id' => (int) $existing->id], ['%s', '%s', '%s', '%s', '%s', '%s', '%d', '%s'], ['%d']);
                }
                continue;
            }

            $wpdb->insert($table, [
                'template_key' => $template['template_key'],
                'name' => $template['name'],
                'subject' => $template['subject'],
                'body_html' => $template['body_html'],
                'body_text' => $template['body_text'],
                'variables' => wp_json_encode($template['variables']),
                'status' => 'active',
                'version' => 1,
                'created_by' => $created_by,
                'updated_by' => null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    private function should_refresh_required_email_template($existing, array $template): bool {
        $template_key = (string) ($existing->template_key ?? '');
        $body_html = (string) ($existing->body_html ?? '');
        $version = (int) ($existing->version ?? 1);
        $stale_booking_keys = [
            'appointment_doctor_notification',
            'appointment_cancelled',
            'appointment_rescheduled',
        ];

        if (!in_array($template_key, $stale_booking_keys, true)) {
            return false;
        }

        if ($version > 1) {
            return false;
        }

        if ($template_key === 'appointment_doctor_notification') {
            return strpos($body_html, 'calendar_link') !== false || strpos($body_html, '{{patient_note}}') === false;
        }

        return strpos($body_html, 'calendar_link') !== false || strpos($body_html, '{{recipient_name}}') === false;
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

        register_post_status('wc-in-delivery', [
            'label' => __('In Delivery', 'nevari-pharmacy-core'),
            'public' => true,
            'exclude_from_search' => false,
            'show_in_admin_all_list' => true,
            'show_in_admin_status_list' => true,
            'label_count' => _n_noop('In Delivery <span class="count">(%s)</span>', 'In Delivery <span class="count">(%s)</span>', 'nevari-pharmacy-core'),
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
            if ('wc-processing' === $key) {
                $ordered['wc-in-delivery'] = __('In Delivery', 'nevari-pharmacy-core');
            }
        }

        if (!isset($ordered['wc-awaiting-doctor'])) {
            $ordered['wc-awaiting-doctor'] = __('Awaiting Doctor', 'nevari-pharmacy-core');
        }
        if (!isset($ordered['wc-awaiting-prescription'])) {
            $ordered['wc-awaiting-prescription'] = __('Awaiting Prescription', 'nevari-pharmacy-core');
        }
        if (!isset($ordered['wc-in-delivery'])) {
            $ordered['wc-in-delivery'] = __('In Delivery', 'nevari-pharmacy-core');
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
        add_action('woocommerce_checkout_order_processed', [$this, 'assign_doctor_and_send_order_emails'], 30, 1);
        add_action('woocommerce_new_order', [$this, 'assign_doctor_and_send_order_emails'], 30, 1);

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
        add_action('woocommerce_order_status_failed', [$this, 'handle_appointment_payment_failed'], 10, 1);
        add_action('woocommerce_order_status_cancelled', [$this, 'handle_appointment_payment_failed'], 10, 1);

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

    public function assign_doctor_and_send_order_emails(int $order_id): void {
        if (!function_exists('wc_get_order')) {
            return;
        }

        $order = wc_get_order($order_id);
        if (!$order || $order->get_meta('_nevari_order_assignment_processed')) {
            return;
        }

        // Step 1: choose a single primary product for the order. If WooCommerce fires early without items,
        // wait for the later checkout hook instead of marking the order as processed.
        $primary = $this->primary_order_product_context($order);
        if (!$primary) {
            return;
        }

        // Step 2: assign one doctor from the primary product categories by workload, seniority, then ID.
        $doctor = $primary ? $this->choose_doctor_for_category_ids($primary['category_ids']) : null;
        if ($doctor) {
            $this->assign_doctor_to_order($order, $doctor, $primary);
        } else {
            $order->update_meta_data('_nevari_order_assignment_processed', '1');
            $order->add_order_note(__('No eligible doctor was found for the primary order product category.', 'nevari-pharmacy-core'));
            $order->save();
        }

        // Step 3: send each notification once through the Nevari template email system.
        $this->send_order_customer_email_once($order, $doctor, $primary);
        if ($doctor) {
            $this->send_order_doctor_email_once($order, $doctor, $primary);
        }
    }

    private function primary_order_product_context($order): ?array {
        $best = null;
        foreach ($order->get_items() as $item) {
            if (!is_a($item, 'WC_Order_Item_Product')) {
                continue;
            }
            $product_id = (int) ($item->get_product_id() ?: $item->get_variation_id());
            if (!$product_id) {
                continue;
            }
            $category_ids = function_exists('wc_get_product_cat_ids') ? array_map('intval', wc_get_product_cat_ids($product_id)) : [];
            $total = (float) $item->get_total() + (float) $item->get_total_tax();
            $candidate = [
                'product_id' => $product_id,
                'name' => (string) $item->get_name(),
                'category_ids' => $category_ids,
                'total' => $total,
            ];
            if (!$best || $candidate['total'] > $best['total']) {
                $best = $candidate;
            }
        }
        return $best;
    }

    private function choose_doctor_for_category_ids(array $category_ids): ?WP_User {
        $category_ids = array_values(array_filter(array_map('intval', $category_ids)));
        if (!$category_ids) {
            return null;
        }

        $query = new WP_User_Query([
            'role' => 'doctor',
            'fields' => 'all',
            'number' => 200,
        ]);
        $doctors = array_values(array_filter($query->get_results(), function ($doctor) use ($category_ids) {
            if (!$doctor instanceof WP_User || get_user_meta((int) $doctor->ID, '_nevari_doctor_disabled', true)) {
                return false;
            }
            $linked = array_map('intval', (array) get_user_meta((int) $doctor->ID, '_nevari_product_category_ids', true));
            return (bool) array_intersect($category_ids, $linked);
        }));
        if (!$doctors) {
            return null;
        }

        usort($doctors, function (WP_User $a, WP_User $b) {
            // Lowest upcoming workload wins first; highest seniority breaks availability ties; ID gives deterministic rotation fallback.
            $workload = $this->doctor_upcoming_consultations((int) $a->ID) <=> $this->doctor_upcoming_consultations((int) $b->ID);
            if ($workload !== 0) {
                return $workload;
            }
            $seniority = $this->doctor_seniority_level((int) $b->ID) <=> $this->doctor_seniority_level((int) $a->ID);
            if ($seniority !== 0) {
                return $seniority;
            }
            return (int) $a->ID <=> (int) $b->ID;
        });

        return $doctors[0] ?? null;
    }

    private function doctor_upcoming_consultations(int $doctor_id): int {
        $stored = get_user_meta($doctor_id, '_nevari_upcoming_consultations', true);
        if ($stored !== '' && $stored !== null) {
            return max(0, (int) $stored);
        }

        global $wpdb;
        $table = Nevari_Helpers::table('appointments');
        $start = current_time('mysql', true);
        $end = gmdate('Y-m-d H:i:s', strtotime('+7 days'));
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE doctor_user_id = %d AND status IN ('awaiting_payment','requested','confirmed','checked_in') AND start_at BETWEEN %s AND %s",
            $doctor_id,
            $start,
            $end
        ));
    }

    private function doctor_seniority_level(int $doctor_id): int {
        $value = get_user_meta($doctor_id, '_nevari_seniority_level', true);
        if ($value === '' || $value === null) {
            $value = get_user_meta($doctor_id, 'seniority_level', true);
        }
        if (($value === '' || $value === null) && function_exists('get_posts')) {
            $profile = get_posts(['post_type' => self::DOCTOR_PROFILE_POST_TYPE, 'meta_key' => '_nevari_doctor_user_id', 'meta_value' => $doctor_id, 'fields' => 'ids', 'numberposts' => 1]);
            if ($profile) {
                $value = get_post_meta((int) $profile[0], '_nevari_seniority_level', true);
            }
        }
        return max(0, (int) $value);
    }

    private function assign_doctor_to_order($order, WP_User $doctor, array $primary): void {
        $next_count = $this->doctor_upcoming_consultations((int) $doctor->ID) + 1;
        update_user_meta((int) $doctor->ID, '_nevari_upcoming_consultations', $next_count);
        $order->update_meta_data('_nevari_assigned_doctor_user_id', (int) $doctor->ID);
        $order->update_meta_data('_assigned_doctor_id', (int) $doctor->ID);
        $order->update_meta_data('_assigned_doctor_email', sanitize_email($doctor->user_email));
        $order->update_meta_data('_nevari_primary_product_id', (int) $primary['product_id']);
        $order->update_meta_data('_nevari_primary_product_name', sanitize_text_field((string) $primary['name']));
        $order->update_meta_data('_nevari_order_assignment_processed', '1');
        $order->add_order_note(sprintf('Nevari assigned Dr. %s to this order based on product category availability and seniority.', $doctor->display_name));
        if ((int) $order->get_user_id()) {
            Nevari_Helpers::ensure_doctor_patient_link((int) $doctor->ID, (int) $order->get_user_id(), 'order');
        }
        $order->save();
    }

    private function send_order_customer_email_once($order, ?WP_User $doctor, ?array $primary): void {
        if ($order->get_meta('_customer_email_sent')) {
            return;
        }
        $email = sanitize_email((string) $order->get_billing_email());
        if (!$email || !is_email($email)) {
            return;
        }
        $result = $this->send_template_email($email, 'order-invoice-email', $this->order_email_variables($order, $doctor, $primary));
        if (!is_wp_error($result)) {
            $order->update_meta_data('_customer_email_sent', '1');
            $order->save();
        }
    }

    private function send_order_doctor_email_once($order, WP_User $doctor, ?array $primary): void {
        if ($order->get_meta('_doctor_email_sent')) {
            return;
        }
        $result = $this->send_template_email($doctor->user_email, 'doctor_order_assigned', $this->order_email_variables($order, $doctor, $primary), (int) $doctor->ID);
        if (!is_wp_error($result)) {
            $order->update_meta_data('_doctor_email_sent', '1');
            $order->save();
        }
    }

    private function send_template_email(string $recipient_email, string $template_key, array $variables, ?int $recipient_user_id = null) {
        return Nevari_Emails::queue_or_send([
            'template_key' => $template_key,
            'recipient_email' => $recipient_email,
            'recipient_user_id' => $recipient_user_id,
            'related_object_type' => 'order',
            'related_object_id' => isset($variables['order_id']) ? (int) $variables['order_id'] : null,
            'variables' => $variables,
        ], true);
    }

    private function order_email_variables($order, ?WP_User $doctor, ?array $primary): array {
        $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()) ?: $order->get_formatted_billing_full_name() ?: __('Customer', 'nevari-pharmacy-core');
        $parts = preg_split('/\s+/', trim($customer_name));
        $items = [];
        foreach ($order->get_items() as $item) {
            $items[] = sprintf('%s x%s', $item->get_name(), wc_format_decimal((float) $item->get_quantity(), 0));
        }
        $currency = $order->get_currency() ?: (function_exists('get_woocommerce_currency') ? get_woocommerce_currency() : 'USD');
        $total = function_exists('wc_price') ? wp_strip_all_tags(wc_price((float) $order->get_total(), ['currency' => $currency])) : (string) $order->get_total();
        return [
            'customer_name' => $customer_name,
            'customer_firstname' => $parts[0] ?? $customer_name,
            'customer_lastname' => count($parts) > 1 ? implode(' ', array_slice($parts, 1)) : '',
            'customer_email' => (string) $order->get_billing_email(),
            'customer_phone' => (string) $order->get_billing_phone(),
            'patient_name' => $customer_name,
            'doctor_name' => $doctor ? $doctor->display_name : '',
            'doctor_email' => $doctor ? $doctor->user_email : '',
            'order_id' => (string) $order->get_id(),
            'order_number' => (string) $order->get_order_number(),
            'order_total' => $total,
            'invoice_total' => $total,
            'items_purchased' => implode(', ', $items),
            'primary_product_name' => $primary['name'] ?? '',
            'product_service_assigned' => $primary['name'] ?? '',
            'document_type' => 'invoice',
            'document_title' => 'Invoice',
            'site_name' => wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES),
            'support_email' => get_option('admin_email'),
        ];
    }

    private function appointment_email_context($appointment, $order = null): array {
        $doctor = get_user_by('id', (int) $appointment->doctor_user_id);
        $patient = get_user_by('id', (int) $appointment->patient_user_id);
        $calendar = Nevari_Helpers::appointment_calendar_links($appointment);
        $meet_link = Nevari_Helpers::appointment_meeting_link($appointment, $order);
        $amount = $order && is_object($order) && method_exists($order, 'get_formatted_order_total')
            ? html_entity_decode(wp_strip_all_tags($order->get_formatted_order_total()))
            : '';
        $patient_dashboard_link = $this->frontend_dashboard_url('patient_dashboard', '/dashboard');
        $doctor_dashboard_link = $this->frontend_dashboard_url('doctors_dashboard', '/admin/doctor');
        $review_link = add_query_arg([
            'review' => '1',
            'doctor_id' => (int) $appointment->doctor_user_id,
            'appointment_id' => (int) $appointment->id,
        ], $patient_dashboard_link);

        return [
            'doctor' => $doctor instanceof WP_User ? $doctor : null,
            'patient' => $patient instanceof WP_User ? $patient : null,
            'calendar' => $calendar,
            'meet_link' => $meet_link,
            'ics' => [
                'filename' => Nevari_Helpers::appointment_ics_filename($appointment),
                'content' => Nevari_Helpers::appointment_ics_content($appointment, $doctor ? $doctor->display_name : '', $patient ? $patient->display_name : ''),
            ],
            'variables' => [
                'patient_name' => $patient ? $patient->display_name : 'Patient',
                'doctor_name' => $doctor ? $doctor->display_name : 'Doctor',
                'customer_name' => $patient ? $patient->display_name : 'Patient',
                'customer_email' => $patient ? $patient->user_email : '',
                'customer_phone' => $patient ? (string) get_user_meta((int) $patient->ID, 'billing_phone', true) : '',
                'consultation_type' => ucwords(str_replace('_', ' ', (string) ($appointment->type ?: 'video'))),
                'appointment_start' => Nevari_Helpers::iso_datetime($appointment->start_at),
                'appointment_end' => Nevari_Helpers::iso_datetime($appointment->end_at),
                'appointment_date' => gmdate('F j, Y', strtotime((string) $appointment->start_at . ' UTC')),
                'appointment_time' => gmdate('g:i A', strtotime((string) $appointment->start_at . ' UTC')),
                'appointment_status' => ucwords(str_replace('_', ' ', (string) $appointment->status)),
                'appointment_amount' => $amount,
                'amount_paid' => $amount,
                'booking_id' => (string) $appointment->id,
                'order_id' => $appointment->order_id ? (string) $appointment->order_id : '',
                'patient_note' => (string) ($appointment->reason ?: ''),
                'reason' => (string) ($appointment->reason ?: ''),
                'calendar_link' => $calendar['ics_url'],
                'calendar_link_html' => ['html' => '<a href="' . esc_url($calendar['ics_url']) . '">Download calendar invite</a>', 'text' => $calendar['ics_url']],
                'google_meet_link' => $meet_link,
                'google_meet_link_html' => $meet_link ? ['html' => '<a href="' . esc_url($meet_link) . '">Join Google Meet</a>', 'text' => $meet_link] : '',
                'join_link' => $meet_link,
                'join_link_html' => $meet_link ? ['html' => '<a href="' . esc_url($meet_link) . '">Join Consultation</a>', 'text' => $meet_link] : '',
                'cancel_link' => rest_url(NEVARI_PHARMACY_REST_NS . '/appointments/' . (int) $appointment->id . '/cancel'),
                'reschedule_link' => rest_url(NEVARI_PHARMACY_REST_NS . '/appointments/' . (int) $appointment->id . '/reschedule'),
                'dashboard_link' => $patient_dashboard_link,
                'doctor_dashboard_link' => $doctor_dashboard_link,
                'review_link' => $review_link,
                'feedback_link' => $review_link,
            ],
        ];
    }

    private function frontend_dashboard_url(string $frontend_type, string $default_path): string {
        if (class_exists('Nevari_Connections')) {
            foreach (Nevari_Connections::trusted_frontends() as $connection) {
                if (($connection['trust_status'] ?? '') !== 'trusted') {
                    continue;
                }
                if (($connection['frontend_type'] ?? '') !== $frontend_type && ($connection['frontend_type'] ?? '') !== 'custom_frontend') {
                    continue;
                }
                $origin = !empty($connection['frontend_origin']) ? rtrim((string) $connection['frontend_origin'], '/') : '';
                if ($origin !== '') {
                    return $origin . $default_path;
                }
            }
        }

        return home_url($default_path);
    }

    private function send_guarded_appointment_email($appointment, string $sent_column, array $args, bool $send_now = false): bool {
        global $wpdb;

        if (!empty($appointment->{$sent_column})) {
            return false;
        }

        $result = Nevari_Emails::queue_or_send($args, $send_now);
        if (is_wp_error($result)) {
            return false;
        }

        $wpdb->update(Nevari_Helpers::table('appointments'), [
            $sent_column => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => (int) $appointment->id], ['%s', '%s'], ['%d']);
        return true;
    }

    private function schedule_single_appointment_action(string $hook, int $timestamp, int $appointment_id, string $start_at): void {
        if ($timestamp <= time()) {
            return;
        }
        $args = [$appointment_id, $start_at];
        if (function_exists('as_has_scheduled_action') && as_has_scheduled_action($hook, $args, 'nevari')) {
            return;
        }
        if (function_exists('as_schedule_single_action')) {
            as_schedule_single_action($timestamp, $hook, $args, 'nevari');
        } else {
            wp_schedule_single_event($timestamp, $hook, $args);
        }
    }

    private function cancel_appointment_scheduled_actions(int $appointment_id, string $start_at = ''): void {
        $hooks = [
            'nevari_send_customer_appointment_reminder_24h',
            'nevari_send_customer_appointment_reminder_1h',
            'nevari_send_doctor_appointment_reminder_24h',
            'nevari_send_doctor_appointment_reminder_1h',
            'nevari_send_customer_appointment_followup',
        ];
        foreach ($hooks as $hook) {
            if (function_exists('as_unschedule_all_actions')) {
                if ($start_at !== '') {
                    as_unschedule_all_actions($hook, [$appointment_id, $start_at], 'nevari');
                }
                as_unschedule_all_actions($hook, [$appointment_id, ''], 'nevari');
            } else {
                wp_clear_scheduled_hook($hook, [$appointment_id, $start_at]);
                wp_clear_scheduled_hook($hook, [$appointment_id, '']);
            }
        }
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
            'reserved_until' => null,
            'payment_completed_at' => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s', '%s', '%s', '%s'], ['%d']);
        $order->update_meta_data('_nevari_booking_status', 'confirmed');
        $order->save();

        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        $doctor = get_user_by('id', (int) $appointment->doctor_user_id);
        $patient = get_user_by('id', (int) $appointment->patient_user_id);
        $this->ensure_appointment_google_meet($appointment, $order, $doctor instanceof WP_User ? $doctor : null, $patient instanceof WP_User ? $patient : null);
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        $google_meet_link = Nevari_Helpers::appointment_meeting_link($appointment, $order);
        if ((string) ($appointment->type ?? '') === 'video' && !$google_meet_link) {
            Nevari_Audit::log('consultation', 'google', 'appointment.google_meet_missing_on_confirmation', 'error', [
                'appointment_id' => $appointment_id,
                'order_id' => $order_id,
                'message' => 'Paid video appointment confirmed without a direct Google Meet link.',
            ]);
        }

        $context = $this->appointment_email_context($appointment, $order);
        $this->send_guarded_appointment_email($appointment, 'customer_confirmation_sent_at', [
            'recipient_user_id' => (int) $appointment->patient_user_id,
            'related_object_type' => 'appointment',
            'related_object_id' => $appointment_id,
            'template_key' => 'appointment_customer_confirmation',
            'variables' => $context['variables'],
            'attachments' => [$context['ics']],
        ], false);

        if ($doctor && !empty($doctor->user_email) && is_email($doctor->user_email)) {
            $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
            $this->send_guarded_appointment_email($appointment, 'doctor_confirmation_sent_at', [
                'recipient_user_id' => (int) $doctor->ID,
                'related_object_type' => 'appointment',
                'related_object_id' => $appointment_id,
                'template_key' => 'appointment_doctor_notification',
                'variables' => array_merge($context['variables'], [
                    'dashboard_link' => $context['variables']['doctor_dashboard_link'],
                ]),
                'attachments' => [$context['ics']],
            ], false);
        }

        $this->schedule_appointment_reminder($appointment_id, $appointment->start_at);
    }

    private function ensure_appointment_google_meet($appointment, $order, ?WP_User $doctor, ?WP_User $patient): array {
        global $wpdb;
        $appointment_id = (int) ($appointment->id ?? 0);
        $appointments_table = Nevari_Helpers::table('appointments');
        $existing = Nevari_Helpers::appointment_meeting_link($appointment, $order);
        $existing_event_id = isset($appointment->google_calendar_event_id) ? (string) $appointment->google_calendar_event_id : '';
        if ($existing !== '' && $existing_event_id !== '') {
            return ['success' => true, 'meet_link' => $existing, 'event_id' => $existing_event_id, 'reused' => true];
        }
        if ((string) ($appointment->type ?? '') !== 'video') {
            return ['success' => false, 'code' => 'not_video_consultation', 'message' => 'Appointment is not a video consultation.'];
        }

        $result = Nevari_Helpers::google_meet_event_for_appointment($appointment, $doctor, $patient);
        if (!empty($result['success'])) {
            $meet_link = esc_url_raw((string) $result['meet_link']);
            $event_id = sanitize_text_field((string) ($result['event_id'] ?? ''));
            $wpdb->update($appointments_table, [
                'google_calendar_event_id' => $event_id ?: null,
                'google_meet_link' => $meet_link,
                'google_meet_error' => null,
                'google_meet_created_at' => Nevari_Helpers::now(),
                'updated_at' => Nevari_Helpers::now(),
            ], ['id' => $appointment_id], ['%s', '%s', '%s', '%s', '%s'], ['%d']);
            if ($order && is_object($order) && method_exists($order, 'update_meta_data')) {
                $order->update_meta_data('_nevari_google_calendar_event_id', $event_id);
                $order->update_meta_data('_nevari_google_meet_link', $meet_link);
                $order->update_meta_data('_nevari_meet_link', $meet_link);
                $order->save();
            }
            Nevari_Audit::log('consultation', 'google', 'appointment.google_meet_created', 'success', [
                'appointment_id' => $appointment_id,
                'order_id' => $order && is_object($order) && method_exists($order, 'get_id') ? (int) $order->get_id() : null,
                'related_user_id' => (int) ($appointment->patient_user_id ?? 0),
                'message' => 'Google Meet link created for paid appointment.',
                'metadata' => ['event_id' => $event_id, 'reused' => !empty($result['reused'])],
            ]);
            return $result;
        }

        $error_code = sanitize_key((string) ($result['code'] ?? 'google_meet_error'));
        $error_message = sanitize_textarea_field((string) ($result['message'] ?? 'Google Meet link could not be created.'));
        $wpdb->update($appointments_table, [
            'google_meet_error' => $error_message,
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s'], ['%d']);
        Nevari_Audit::log('consultation', 'google', 'appointment.google_meet_failed', 'error', [
            'appointment_id' => $appointment_id,
            'order_id' => $order && is_object($order) && method_exists($order, 'get_id') ? (int) $order->get_id() : null,
            'related_user_id' => (int) ($appointment->patient_user_id ?? 0),
            'error_code' => $error_code,
            'error_message' => $error_message,
            'message' => 'Google Meet link could not be created.',
        ]);
        return $result;
    }

    public function handle_appointment_payment_failed(int $order_id): void {
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
        $wpdb->update($appointments_table, [
            'payment_status' => 'failed',
            'status' => 'failed',
            'reserved_until' => null,
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s', '%s', '%s'], ['%d']);
        $this->cancel_appointment_scheduled_actions($appointment_id);
        Nevari_Audit::log('payments', 'woocommerce', 'appointment.payment_failed', 'error', [
            'object_type' => 'shop_order',
            'object_id' => $order_id,
            'order_id' => $order_id,
            'appointment_id' => $appointment_id,
            'message' => 'Appointment payment failed or was cancelled.',
        ]);
    }

    public function schedule_appointment_reminder(int $appointment_id, string $start_at): void {
        $start_ts = strtotime($start_at . ' UTC');
        if (!$start_ts) {
            return;
        }
        $this->schedule_single_appointment_action('nevari_send_customer_appointment_reminder_24h', $start_ts - DAY_IN_SECONDS, $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_doctor_appointment_reminder_24h', $start_ts - DAY_IN_SECONDS, $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_customer_appointment_reminder_1h', $start_ts - HOUR_IN_SECONDS, $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_doctor_appointment_reminder_1h', $start_ts - HOUR_IN_SECONDS, $appointment_id, $start_at);

        global $wpdb;
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT end_at FROM " . Nevari_Helpers::table('appointments') . " WHERE id = %d", $appointment_id));
        $end_ts = $appointment ? strtotime((string) $appointment->end_at . ' UTC') : 0;
        if ($end_ts) {
            $this->schedule_single_appointment_action('nevari_send_customer_appointment_followup', $end_ts + HOUR_IN_SECONDS, $appointment_id, $start_at);
        }
    }

    public function send_appointment_reminder(int $appointment_id): void {
        $this->send_customer_appointment_reminder_1h($appointment_id, '');
    }

    public function send_customer_appointment_reminder_24h(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_reminder_24h_sent_at', 'appointment_customer_reminder_24h');
    }

    public function send_customer_appointment_reminder_1h(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_reminder_1h_sent_at', 'appointment_customer_reminder_1h');
    }

    public function send_doctor_appointment_reminder_24h(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_reminder_24h_sent_at', 'appointment_doctor_reminder_24h');
    }

    public function send_doctor_appointment_reminder_1h(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_reminder_1h_sent_at', 'appointment_doctor_reminder_1h');
    }

    public function send_customer_appointment_followup(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_followup_sent_at', 'appointment_customer_followup');
    }

    private function send_role_appointment_message(int $appointment_id, string $scheduled_start_at, string $recipient_role, string $sent_column, string $template_key): void {
        global $wpdb;
        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        $allowed_statuses = $sent_column === 'customer_followup_sent_at' ? ['confirmed', 'completed'] : ['confirmed'];
        if (!$appointment || !in_array((string) $appointment->status, $allowed_statuses, true) || $appointment->payment_status !== 'paid' || !empty($appointment->{$sent_column})) {
            return;
        }
        if ($scheduled_start_at !== '' && (string) $appointment->start_at !== $scheduled_start_at) {
            return;
        }

        $order = $appointment->order_id && function_exists('wc_get_order') ? wc_get_order((int) $appointment->order_id) : null;
        $context = $this->appointment_email_context($appointment, $order);
        $recipient = $recipient_role === 'doctor' ? $context['doctor'] : $context['patient'];
        if (!$recipient || empty($recipient->user_email) || !is_email($recipient->user_email)) {
            return;
        }

        $this->send_guarded_appointment_email($appointment, $sent_column, [
            'recipient_user_id' => (int) $recipient->ID,
            'recipient_email' => $recipient->user_email,
            'related_object_type' => 'appointment',
            'related_object_id' => $appointment_id,
            'template_key' => $template_key,
            'variables' => array_merge($context['variables'], [
                'recipient_name' => $recipient->display_name ?: 'there',
                'dashboard_link' => $recipient_role === 'doctor' ? $context['variables']['doctor_dashboard_link'] : $context['variables']['dashboard_link'],
            ]),
            'attachments' => [$context['ics']],
        ], false);
    }

    public function expire_appointment_reservation(int $appointment_id): void {
        global $wpdb;
        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment || $appointment->status !== 'awaiting_payment' || $appointment->payment_status !== 'pending') {
            return;
        }
        if (!empty($appointment->reserved_until) && strtotime((string) $appointment->reserved_until . ' UTC') > time()) {
            return;
        }
        $wpdb->update($appointments_table, [
            'status' => 'failed',
            'payment_status' => 'failed',
            'reserved_until' => null,
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s', '%s', '%s'], ['%d']);
    }

    public function schedule_appointment_reservation_expiry(int $appointment_id, string $reserved_until): void {
        $timestamp = strtotime($reserved_until . ' UTC');
        if (!$timestamp || $timestamp <= time()) {
            return;
        }
        if (function_exists('as_has_scheduled_action') && as_has_scheduled_action('nevari_expire_appointment_reservation', [$appointment_id], 'nevari')) {
            return;
        }
        if (function_exists('as_schedule_single_action')) {
            as_schedule_single_action($timestamp, 'nevari_expire_appointment_reservation', [$appointment_id], 'nevari');
        } else {
            wp_schedule_single_event($timestamp, 'nevari_expire_appointment_reservation', [$appointment_id]);
        }
    }

    public function send_appointment_cancellation_emails($appointment): void {
        $this->cancel_appointment_scheduled_actions((int) $appointment->id, (string) $appointment->start_at);
        $order = $appointment->order_id && function_exists('wc_get_order') ? wc_get_order((int) $appointment->order_id) : null;
        $context = $this->appointment_email_context($appointment, $order);
        foreach (['customer' => $context['patient'], 'doctor' => $context['doctor']] as $role => $recipient) {
            if (!$recipient || empty($recipient->user_email) || !is_email($recipient->user_email)) {
                continue;
            }
            Nevari_Emails::queue_or_send([
                'recipient_user_id' => (int) $recipient->ID,
                'recipient_email' => $recipient->user_email,
                'related_object_type' => 'appointment',
                'related_object_id' => (int) $appointment->id,
                'template_key' => 'appointment_cancelled',
                'variables' => array_merge($context['variables'], [
                    'recipient_name' => $recipient->display_name ?: 'there',
                    'dashboard_link' => $role === 'doctor' ? $context['variables']['doctor_dashboard_link'] : $context['variables']['dashboard_link'],
                ]),
            ], false);
        }
    }

    public function send_appointment_reschedule_emails($appointment, string $old_start_at = ''): void {
        if ($old_start_at !== '') {
            $this->cancel_appointment_scheduled_actions((int) $appointment->id, $old_start_at);
        }
        $order = $appointment->order_id && function_exists('wc_get_order') ? wc_get_order((int) $appointment->order_id) : null;
        $context = $this->appointment_email_context($appointment, $order);
        foreach (['customer' => $context['patient'], 'doctor' => $context['doctor']] as $role => $recipient) {
            if (!$recipient || empty($recipient->user_email) || !is_email($recipient->user_email)) {
                continue;
            }
            Nevari_Emails::queue_or_send([
                'recipient_user_id' => (int) $recipient->ID,
                'recipient_email' => $recipient->user_email,
                'related_object_type' => 'appointment',
                'related_object_id' => (int) $appointment->id,
                'template_key' => 'appointment_rescheduled',
                'variables' => array_merge($context['variables'], [
                    'recipient_name' => $recipient->display_name ?: 'there',
                    'dashboard_link' => $role === 'doctor' ? $context['variables']['doctor_dashboard_link'] : $context['variables']['dashboard_link'],
                ]),
            ], false);
        }
        if ($appointment->status === 'confirmed' && $appointment->payment_status === 'paid') {
            $this->schedule_appointment_reminder((int) $appointment->id, (string) $appointment->start_at);
        }
    }

    public function send_booking_email_test(string $recipient_email): array {
        $recipient_email = sanitize_email($recipient_email);
        if (!$recipient_email || !is_email($recipient_email)) {
            return ['success' => false, 'code' => 'invalid_email', 'message' => 'Enter a valid email address.'];
        }

        $doctor_query = new WP_User_Query(['role' => 'doctor', 'number' => 1]);
        $doctor = ($doctor_query->get_results()[0] ?? null);
        if (!$doctor instanceof WP_User) {
            $doctor = wp_get_current_user();
        }

        $appointment = (object) [
            'id' => time(),
            'patient_user_id' => get_current_user_id(),
            'doctor_user_id' => $doctor instanceof WP_User ? (int) $doctor->ID : get_current_user_id(),
            'order_id' => 0,
            'type' => 'video',
            'status' => 'confirmed',
            'payment_status' => 'paid',
            'start_at' => gmdate('Y-m-d H:i:s', time() + DAY_IN_SECONDS + HOUR_IN_SECONDS),
            'end_at' => gmdate('Y-m-d H:i:s', time() + DAY_IN_SECONDS + (2 * HOUR_IN_SECONDS)),
            'timezone' => 'UTC',
            'reason' => 'Booking system email preview.',
            'google_calendar_event_id' => '',
            'google_meet_link' => '',
        ];
        $meet = Nevari_Helpers::google_meet_event_for_appointment($appointment, $doctor instanceof WP_User ? $doctor : null, null);
        if (empty($meet['success']) || empty($meet['meet_link']) || !preg_match('#^https://meet\.google\.com/[a-z0-9-]+#i', (string) $meet['meet_link'])) {
            return [
                'success' => false,
                'code' => $meet['code'] ?? 'google_meet_failed',
                'message' => $meet['message'] ?? 'A direct Google Meet link could not be created.',
            ];
        }
        $appointment->google_meet_link = esc_url_raw((string) $meet['meet_link']);
        $context = $this->appointment_email_context($appointment, null);
        $templates = [
            'appointment_customer_confirmation',
            'appointment_doctor_notification',
            'appointment_customer_reminder_24h',
            'appointment_customer_reminder_1h',
            'appointment_doctor_reminder_24h',
            'appointment_doctor_reminder_1h',
            'appointment_customer_followup',
        ];
        $log_ids = [];
        foreach ($templates as $template_key) {
            $result = Nevari_Emails::queue_or_send([
                'recipient_email' => $recipient_email,
                'related_object_type' => 'booking_email_test',
                'related_object_id' => (int) $appointment->id,
                'template_key' => $template_key,
                'variables' => array_merge($context['variables'], [
                    'recipient_name' => 'Booking Email Tester',
                ]),
            ], true);
            if (!is_wp_error($result)) {
                $log_ids[] = (int) $result;
            }
        }

        return [
            'success' => true,
            'email_log_ids' => $log_ids,
            'google_meet_link' => $appointment->google_meet_link,
            'event_id' => (string) ($meet['event_id'] ?? ''),
        ];
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

        $allowed = apply_filters('nevari_allowed_origins', []);

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
            if ($value === '') {
                return '';
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

        if (in_array($origin, $allowed, true)) {
            return $origin;
        }

        Nevari_Audit::log('security', 'nevari', 'cors.origin_blocked', 'error', [
            'severity' => 'warning',
            'message' => 'CORS origin was blocked because it is not trusted.',
            'metadata' => [
                'origin' => $origin,
                'rest_route' => $this->requested_rest_route(),
            ],
        ]);

        return null;
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
            'Access-Control-Allow-Credentials' => 'true',
            'Access-Control-Max-Age' => '600',
            'Vary' => 'Origin',
        ];
    }
}
