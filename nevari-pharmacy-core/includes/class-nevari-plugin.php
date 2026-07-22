<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Plugin {
    private const DOCTOR_PROFILE_POST_TYPE = 'nevari_doctor_prof';
    private const SUBSCRIPTION_PLAN_POST_TYPE = 'nevari_subscription';
    private const PRODUCT_PRESCRIPTION_TEXT_META = '_nevari_product_prescription';

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
        add_action('init', [$this, 'register_subscription_plan_meta']);
        add_action('init', [$this, 'register_order_statuses']);
        add_action('woocommerce_product_options_general_product_data', [$this, 'render_product_prescription_field']);
        add_action('woocommerce_admin_process_product_object', [$this, 'save_product_prescription_field']);
        add_filter('rest_post_dispatch', [$this, 'append_rest_cors_headers'], 10, 3);
        add_filter('rest_pre_serve_request', [$this, 'send_rest_cors_headers'], 10, 4);
        add_filter('wc_order_statuses', [$this, 'filter_woocommerce_order_statuses']);
        add_action('nevari_send_appointment_reminder', [$this, 'send_appointment_reminder'], 10, 1);
        add_action('nevari_send_customer_appointment_reminder_24h', [$this, 'send_customer_appointment_reminder_24h'], 10, 2);
        add_action('nevari_send_customer_appointment_reminder_1h', [$this, 'send_customer_appointment_reminder_1h'], 10, 2);
        add_action('nevari_send_customer_appointment_reminder_2h', [$this, 'send_customer_appointment_reminder_2h'], 10, 2);
        add_action('nevari_send_customer_appointment_reminder_30m', [$this, 'send_customer_appointment_reminder_30m'], 10, 2);
        add_action('nevari_send_customer_appointment_reminder_5m', [$this, 'send_customer_appointment_reminder_5m'], 10, 2);
        add_action('nevari_send_customer_appointment_start', [$this, 'send_customer_appointment_start'], 10, 2);
        add_action('nevari_send_doctor_appointment_reminder_24h', [$this, 'send_doctor_appointment_reminder_24h'], 10, 2);
        add_action('nevari_send_doctor_appointment_reminder_1h', [$this, 'send_doctor_appointment_reminder_1h'], 10, 2);
        add_action('nevari_send_doctor_appointment_reminder_2h', [$this, 'send_doctor_appointment_reminder_2h'], 10, 2);
        add_action('nevari_send_doctor_appointment_reminder_30m', [$this, 'send_doctor_appointment_reminder_30m'], 10, 2);
        add_action('nevari_send_doctor_appointment_reminder_5m', [$this, 'send_doctor_appointment_reminder_5m'], 10, 2);
        add_action('nevari_send_doctor_appointment_start', [$this, 'send_doctor_appointment_start'], 10, 2);
        add_action('nevari_send_customer_appointment_ending_soon', [$this, 'send_customer_appointment_ending_soon'], 10, 2);
        add_action('nevari_send_doctor_appointment_ending_soon', [$this, 'send_doctor_appointment_ending_soon'], 10, 2);
        add_action('nevari_send_customer_appointment_followup', [$this, 'send_customer_appointment_followup'], 10, 2);
        add_action('nevari_send_customer_appointment_thank_you', [$this, 'send_customer_appointment_followup'], 10, 2);
        add_action('nevari_expire_appointment_reservation', [$this, 'expire_appointment_reservation'], 10, 1);
        add_action('nevari_process_appointment_meet_creation', [$this, 'process_appointment_meet_creation'], 10, 1);
        add_action('nevari_end_appointment_meet_conference', [$this, 'end_appointment_meet_conference'], 10, 1);

        Nevari_Audit::init();
        Nevari_User_Governance::init();
        Nevari_Auth::init();
        Nevari_Connections::init();
        Nevari_SSO::init();
        Nevari_Care_Journeys::init();
        Nevari_Mtm::init();
        Nevari_Iv_Therapy::init();
        Nevari_Nurse_Requests::init();
        Nevari_Rest::init();
        Nevari_Subscriptions::init();
        Nevari_Admin::init();
        Nevari_Emails::init();

        $this->maybe_run_schema_migrations();
        $this->register_woocommerce_hooks();
    }

    /**
     * Run the idempotent schema/seed routines once per plugin version instead
     * of on every request. Each ensure_* call issued ~dozens of SHOW COLUMNS /
     * SELECT queries; running them unconditionally added a ~120-query tax to
     * every REST call. Gate behind a dedicated version option (separate from
     * nevari_pharmacy_db_version, which Nevari_Activator::maybe_upgrade()
     * already advanced before this method runs). Bump NEVARI_PHARMACY_VERSION
     * whenever the ensure_* definitions change so the migrations re-run.
     */
    private function maybe_run_schema_migrations(): void {
        if (get_option('nevari_runtime_schema_version') === NEVARI_PHARMACY_VERSION) {
            return;
        }

        $this->ensure_required_email_templates();
        $this->ensure_appointment_lifecycle_columns();
        $this->ensure_appointment_invoice_table();
        $this->ensure_doctor_routing_columns();
        $this->ensure_round_robin_tracker_table();
        $this->ensure_mtm_workflow_columns();
        $this->ensure_pharmacist_role();
        if (class_exists('Nevari_Subscriptions')) {
            Nevari_Subscriptions::ensure_system_plans();
        }

        update_option('nevari_runtime_schema_version', NEVARI_PHARMACY_VERSION, false);
    }

    private function ensure_doctor_routing_columns(): void {
        global $wpdb;

        if (!class_exists('Nevari_Helpers')) {
            return;
        }

        $table = Nevari_Helpers::table('doctor_settings');
        if (!$this->table_exists($table)) {
            if (class_exists('Nevari_Activator')) {
                Nevari_Activator::ensure_tables();
            }
            if (!$this->table_exists($table)) {
                return;
            }
        }

        $columns = [
            'position' => "ALTER TABLE {$table} ADD position VARCHAR(30) NOT NULL DEFAULT 'specialist'",
            'is_available' => "ALTER TABLE {$table} ADD is_available TINYINT(1) NOT NULL DEFAULT 1",
            'max_workload_per_week' => "ALTER TABLE {$table} ADD max_workload_per_week INT UNSIGNED NOT NULL DEFAULT 40",
        ];

        foreach ($columns as $column => $sql) {
            $exists = $wpdb->get_var($wpdb->prepare("SHOW COLUMNS FROM {$table} LIKE %s", $column));
            if (!$exists) {
                $wpdb->query($sql);
            }
        }
    }

    private function ensure_round_robin_tracker_table(): void {
        global $wpdb;

        if (!class_exists('Nevari_Helpers')) {
            return;
        }

        $table = Nevari_Helpers::table('round_robin_tracker');
        if ($this->table_exists($table)) {
            return;
        }

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();
        dbDelta("CREATE TABLE {$table} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            doctor_level VARCHAR(30) NOT NULL,
            last_doctor_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY doctor_level (doctor_level)
        ) {$charset};");
    }

    private function ensure_pharmacist_role(): void {
        $caps = [
            'read',
            'upload_files',
            'nevari_view_mtm_requests',
            'nevari_review_mtm_requests',
            'nevari_schedule_mtm_appointments',
            'nevari_create_medication_action_plan',
            'nevari_attach_pharmacy_products',
            'nevari_create_mtm_product_order',
            'nevari_schedule_follow_up',
            'nevari_track_mtm_outcomes',
            'nevari_complete_mtm_case',
        ];
        if (!get_role('pharmacist')) {
            add_role('pharmacist', __('Pharmacist', 'nevari-pharmacy-core'), array_fill_keys($caps, true));
        }
        $role = get_role('pharmacist');
        if ($role) {
            foreach ($caps as $cap) {
                $role->add_cap($cap);
            }
        }
        foreach (['administrator', 'shop_manager', 'store_admin'] as $role_name) {
            $admin_role = get_role($role_name);
            if (!$admin_role) {
                continue;
            }
            foreach ($caps as $cap) {
                $admin_role->add_cap($cap);
            }
        }
    }

    private function ensure_mtm_workflow_columns(): void {
        global $wpdb;

        if (!class_exists('Nevari_Helpers')) {
            return;
        }

        $table = Nevari_Helpers::table('mtm_requests');
        if (!$this->table_exists($table)) {
            if (class_exists('Nevari_Activator')) {
                Nevari_Activator::ensure_tables();
            }
            if (!$this->table_exists($table)) {
                return;
            }
        }

        $columns = [
            'request_reference' => "ALTER TABLE {$table} ADD request_reference VARCHAR(32) NULL",
            'assigned_pharmacist_user_id' => "ALTER TABLE {$table} ADD assigned_pharmacist_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0",
            'reviewed_by_pharmacist_user_id' => "ALTER TABLE {$table} ADD reviewed_by_pharmacist_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0",
            'submission_pdf_status' => "ALTER TABLE {$table} ADD submission_pdf_status VARCHAR(20) NOT NULL DEFAULT 'pending'",
            'submission_pdf_path' => "ALTER TABLE {$table} ADD submission_pdf_path VARCHAR(500) NULL",
            'submission_pdf_hash' => "ALTER TABLE {$table} ADD submission_pdf_hash CHAR(64) NULL",
            'submission_pdf_size' => "ALTER TABLE {$table} ADD submission_pdf_size BIGINT UNSIGNED NOT NULL DEFAULT 0",
            'submission_pdf_mime' => "ALTER TABLE {$table} ADD submission_pdf_mime VARCHAR(100) NULL",
            'submission_pdf_version' => "ALTER TABLE {$table} ADD submission_pdf_version VARCHAR(32) NULL",
            'submission_pdf_created_at' => "ALTER TABLE {$table} ADD submission_pdf_created_at DATETIME NULL",
            'attached_products_json' => "ALTER TABLE {$table} ADD attached_products_json LONGTEXT NULL",
            'consultation_notes_json' => "ALTER TABLE {$table} ADD consultation_notes_json LONGTEXT NULL",
            'follow_up_json' => "ALTER TABLE {$table} ADD follow_up_json LONGTEXT NULL",
            'outcome_tracking_json' => "ALTER TABLE {$table} ADD outcome_tracking_json LONGTEXT NULL",
            'order_id' => "ALTER TABLE {$table} ADD order_id BIGINT UNSIGNED NULL",
            'timezone' => "ALTER TABLE {$table} ADD timezone VARCHAR(100) NOT NULL DEFAULT 'UTC'",
            'consultation_method' => "ALTER TABLE {$table} ADD consultation_method VARCHAR(80) NOT NULL DEFAULT 'Google Meet'",
            'google_calendar_event_id' => "ALTER TABLE {$table} ADD google_calendar_event_id VARCHAR(255) NULL",
            'google_meet_space_name' => "ALTER TABLE {$table} ADD google_meet_space_name VARCHAR(255) NULL",
            'google_meet_code' => "ALTER TABLE {$table} ADD google_meet_code VARCHAR(64) NULL",
            'google_meet_link' => "ALTER TABLE {$table} ADD google_meet_link VARCHAR(255) NULL",
            'google_meet_error' => "ALTER TABLE {$table} ADD google_meet_error TEXT NULL",
            'google_meet_created_at' => "ALTER TABLE {$table} ADD google_meet_created_at DATETIME NULL",
            'google_meet_ended_at' => "ALTER TABLE {$table} ADD google_meet_ended_at DATETIME NULL",
            'customer_join_token_hash' => "ALTER TABLE {$table} ADD customer_join_token_hash VARCHAR(64) NULL",
            'pharmacist_join_token_hash' => "ALTER TABLE {$table} ADD pharmacist_join_token_hash VARCHAR(64) NULL",
            'join_valid_from_at' => "ALTER TABLE {$table} ADD join_valid_from_at DATETIME NULL",
            'join_expires_at' => "ALTER TABLE {$table} ADD join_expires_at DATETIME NULL",
            'customer_checked_in_at' => "ALTER TABLE {$table} ADD customer_checked_in_at DATETIME NULL",
            'pharmacist_checked_in_at' => "ALTER TABLE {$table} ADD pharmacist_checked_in_at DATETIME NULL",
            'missed_attendance_at' => "ALTER TABLE {$table} ADD missed_attendance_at DATETIME NULL",
            'missed_attendance_role' => "ALTER TABLE {$table} ADD missed_attendance_role VARCHAR(20) NULL",
        ];

        foreach ($columns as $column => $sql) {
            $exists = $wpdb->get_var($wpdb->prepare("SHOW COLUMNS FROM {$table} LIKE %s", $column));
            if (!$exists) {
                $wpdb->query($sql);
            }
        }

        $indexes = [
            'request_reference' => "ALTER TABLE {$table} ADD UNIQUE KEY request_reference (request_reference)",
            'customer_join_token_hash' => "ALTER TABLE {$table} ADD KEY customer_join_token_hash (customer_join_token_hash)",
            'pharmacist_join_token_hash' => "ALTER TABLE {$table} ADD KEY pharmacist_join_token_hash (pharmacist_join_token_hash)",
            'submission_pdf_status' => "ALTER TABLE {$table} ADD KEY submission_pdf_status (submission_pdf_status)",
        ];

        foreach ($indexes as $index_name => $sql) {
            $exists = $wpdb->get_var($wpdb->prepare("SHOW INDEX FROM {$table} WHERE Key_name = %s", $index_name));
            if (!$exists) {
                $wpdb->query($sql);
            }
        }
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
            'google_calendar_event_id' => "ALTER TABLE {$table} ADD google_calendar_event_id VARCHAR(255) NULL",
            'google_meet_space_name' => "ALTER TABLE {$table} ADD google_meet_space_name VARCHAR(255) NULL",
            'google_meet_status' => "ALTER TABLE {$table} ADD google_meet_status VARCHAR(30) NOT NULL DEFAULT 'pending'",
            'google_meet_retry_count' => "ALTER TABLE {$table} ADD google_meet_retry_count INT UNSIGNED NOT NULL DEFAULT 0",
            'google_meet_next_retry_at' => "ALTER TABLE {$table} ADD google_meet_next_retry_at DATETIME NULL",
            'customer_reminder_24h_sent_at' => "ALTER TABLE {$table} ADD customer_reminder_24h_sent_at DATETIME NULL",
            'customer_reminder_1h_sent_at' => "ALTER TABLE {$table} ADD customer_reminder_1h_sent_at DATETIME NULL",
            'customer_reminder_2h_sent_at' => "ALTER TABLE {$table} ADD customer_reminder_2h_sent_at DATETIME NULL",
            'customer_reminder_30m_sent_at' => "ALTER TABLE {$table} ADD customer_reminder_30m_sent_at DATETIME NULL",
            'customer_reminder_5m_sent_at' => "ALTER TABLE {$table} ADD customer_reminder_5m_sent_at DATETIME NULL",
            'customer_appointment_start_sent_at' => "ALTER TABLE {$table} ADD customer_appointment_start_sent_at DATETIME NULL",
            'doctor_reminder_24h_sent_at' => "ALTER TABLE {$table} ADD doctor_reminder_24h_sent_at DATETIME NULL",
            'doctor_reminder_1h_sent_at' => "ALTER TABLE {$table} ADD doctor_reminder_1h_sent_at DATETIME NULL",
            'doctor_reminder_2h_sent_at' => "ALTER TABLE {$table} ADD doctor_reminder_2h_sent_at DATETIME NULL",
            'doctor_reminder_30m_sent_at' => "ALTER TABLE {$table} ADD doctor_reminder_30m_sent_at DATETIME NULL",
            'doctor_reminder_5m_sent_at' => "ALTER TABLE {$table} ADD doctor_reminder_5m_sent_at DATETIME NULL",
            'doctor_appointment_start_sent_at' => "ALTER TABLE {$table} ADD doctor_appointment_start_sent_at DATETIME NULL",
            'customer_ending_soon_sent_at' => "ALTER TABLE {$table} ADD customer_ending_soon_sent_at DATETIME NULL",
            'doctor_ending_soon_sent_at' => "ALTER TABLE {$table} ADD doctor_ending_soon_sent_at DATETIME NULL",
            'customer_followup_sent_at' => "ALTER TABLE {$table} ADD customer_followup_sent_at DATETIME NULL",
            'patient_waiting_notify_count' => "ALTER TABLE {$table} ADD patient_waiting_notify_count INT UNSIGNED NOT NULL DEFAULT 0",
            'patient_waiting_notify_last_at' => "ALTER TABLE {$table} ADD patient_waiting_notify_last_at DATETIME NULL",
            'doctor_waiting_notify_count' => "ALTER TABLE {$table} ADD doctor_waiting_notify_count INT UNSIGNED NOT NULL DEFAULT 0",
            'doctor_waiting_notify_last_at' => "ALTER TABLE {$table} ADD doctor_waiting_notify_last_at DATETIME NULL",
            'reservation_expired_sent_at' => "ALTER TABLE {$table} ADD reservation_expired_sent_at DATETIME NULL",
            'doctor_note_sent_at' => "ALTER TABLE {$table} ADD doctor_note_sent_at DATETIME NULL",
            'appointment_prescription_sent_at' => "ALTER TABLE {$table} ADD appointment_prescription_sent_at DATETIME NULL",
            'google_meet_ready_notified_at' => "ALTER TABLE {$table} ADD google_meet_ready_notified_at DATETIME NULL",
            'google_meet_ended_at' => "ALTER TABLE {$table} ADD google_meet_ended_at DATETIME NULL",
            'patient_join_token_hash' => "ALTER TABLE {$table} ADD patient_join_token_hash VARCHAR(64) NULL",
            'doctor_join_token_hash' => "ALTER TABLE {$table} ADD doctor_join_token_hash VARCHAR(64) NULL",
            'join_valid_from_at' => "ALTER TABLE {$table} ADD join_valid_from_at DATETIME NULL",
            'join_expires_at' => "ALTER TABLE {$table} ADD join_expires_at DATETIME NULL",
            'patient_checked_in_at' => "ALTER TABLE {$table} ADD patient_checked_in_at DATETIME NULL",
            'doctor_checked_in_at' => "ALTER TABLE {$table} ADD doctor_checked_in_at DATETIME NULL",
            'missed_attendance_at' => "ALTER TABLE {$table} ADD missed_attendance_at DATETIME NULL",
            'missed_attendance_role' => "ALTER TABLE {$table} ADD missed_attendance_role VARCHAR(20) NULL",
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

    private function ensure_appointment_invoice_table(): void {
        global $wpdb;

        if (!class_exists('Nevari_Helpers')) {
            return;
        }

        $table = Nevari_Helpers::table('appointment_invoices');
        $exists = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
        if ($exists !== $table && class_exists('Nevari_Activator')) {
            Nevari_Activator::ensure_tables();
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
                'template_key' => 'appointment_requested',
                'name' => 'Appointment Requested',
                'subject' => 'Your appointment with {{doctor_name}} is pending payment',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} is pending payment.</p><p>Your appointment has been created for {{appointment_date}} at {{appointment_time}}.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Invoice:</strong> {{invoice_number}}</p><p>This booking expires after 10 minutes if payment is not completed.</p><p>{{payment_link_html}}</p><p>You can also view this booking inside your Nevari dashboard.</p>',
                'body_text' => 'Hello {{patient_name}}, your appointment with {{doctor_name}} is pending payment for {{appointment_date}} at {{appointment_time}}. Duration: {{appointment_duration}}. Reference: {{appointment_reference}}. Invoice: {{invoice_number}}. Pay here: {{payment_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_start', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'invoice_number', 'payment_link', 'payment_link_html', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_customer_confirmation',
                'name' => 'Appointment Customer Confirmation',
                'subject' => 'Appointment confirmed with {{doctor_name}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your {{consultation_type}} appointment is confirmed with {{doctor_name}}.</p><p><strong>Date:</strong> {{appointment_date}}<br /><strong>Time:</strong> {{appointment_time}}<br /><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Order ID:</strong> {{order_id}}<br /><strong>Amount paid:</strong> {{amount_paid}}</p><p>{{google_meet_link_html}}</p><p><a href="{{manage_link}}">Manage appointment</a></p><p>Please join 5 minutes before the appointment starts.</p>',
                'body_text' => 'Hello {{patient_name}}, your appointment with {{doctor_name}} is confirmed for {{appointment_date}} at {{appointment_time}}. Duration: {{appointment_duration}}. Join: {{google_meet_link}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Order ID: {{order_id}}. Manage appointment: {{manage_link}}.',
                'variables' => ['patient_name', 'doctor_name', 'consultation_type', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'amount_paid', 'booking_id', 'order_id', 'google_meet_link', 'google_meet_link_html', 'cancel_link', 'reschedule_link', 'manage_link'],
            ],
            [
                'template_key' => 'appointment_doctor_notification',
                'name' => 'Appointment Doctor Notification',
                'subject' => 'New appointment with {{patient_name}}',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>A new {{consultation_type}} appointment has been confirmed.</p><p><strong>Patient:</strong> {{patient_name}}<br /><strong>Email:</strong> {{customer_email}}<br /><strong>Phone:</strong> {{customer_phone}}<br /><strong>Date:</strong> {{appointment_date}}<br /><strong>Time:</strong> {{appointment_time}}<br /><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}</p><p><strong>Patient note:</strong> {{patient_note}}</p><p>{{google_meet_link_html}}</p><p><a href="{{dashboard_link}}">Open dashboard</a></p>',
                'body_text' => 'Hello {{doctor_name}}, the appointment with {{patient_name}} is confirmed for {{appointment_date}} at {{appointment_time}}. Duration: {{appointment_duration}}. Reference: {{appointment_reference}}. Note: {{patient_note}}. Join: {{google_meet_link}}.',
                'variables' => ['doctor_name', 'patient_name', 'customer_email', 'customer_phone', 'consultation_type', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'booking_id', 'patient_note', 'google_meet_link', 'google_meet_link_html', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_customer_reminder_24h',
                'name' => 'Appointment Customer Reminder 24h',
                'subject' => 'Reminder: appointment with {{doctor_name}} tomorrow',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} is scheduled for {{appointment_date}} at {{appointment_time}}.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Ends:</strong> {{appointment_end_time}}</p><p>{{google_meet_link_html}}</p><p><a href="{{cancel_link}}">Cancel</a> | <a href="{{reschedule_link}}">Reschedule</a></p>',
                'body_text' => 'Your appointment with {{doctor_name}} is scheduled for {{appointment_date}} at {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Ends: {{appointment_end_time}}. Join: {{google_meet_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'google_meet_link', 'google_meet_link_html', 'cancel_link', 'reschedule_link'],
            ],
            [
                'template_key' => 'appointment_customer_reminder_1h',
                'name' => 'Appointment Customer Reminder 1h',
                'subject' => 'Your appointment starts in 1 hour',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} starts at {{appointment_time}} on {{appointment_date}}.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Ends:</strong> {{appointment_end_time}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 1 hour. Doctor: {{doctor_name}}. Date: {{appointment_date}}. Time: {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Ends: {{appointment_end_time}}. Join: {{google_meet_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_customer_reminder_2h',
                'name' => 'Appointment Customer Reminder 2h',
                'subject' => 'Your appointment starts in 2 hours',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} starts in 2 hours at {{appointment_time}} on {{appointment_date}}.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Ends:</strong> {{appointment_end_time}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 2 hours. Doctor: {{doctor_name}}. Date: {{appointment_date}}. Time: {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Ends: {{appointment_end_time}}. Join: {{google_meet_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_customer_reminder_30m',
                'name' => 'Appointment Customer Reminder 30m',
                'subject' => 'Your appointment starts in 30 minutes',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} starts in 30 minutes.</p><p><strong>Date:</strong> {{appointment_date}}<br /><strong>Time:</strong> {{appointment_time}}<br /><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 30 minutes. Doctor: {{doctor_name}}. Date: {{appointment_date}}. Time: {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Join: {{google_meet_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'booking_id', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_customer_reminder_5m',
                'name' => 'Appointment Customer Reminder 5m',
                'subject' => 'Your appointment starts in 5 minutes',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} starts in 5 minutes. Please use the link below when you are ready.</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 5 minutes. Join: {{google_meet_link}}',
                'variables' => ['patient_name', 'doctor_name', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_customer_start',
                'name' => 'Appointment Customer Start',
                'subject' => 'Your appointment starts now',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} starts now.</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts now. Join: {{google_meet_link}}',
                'variables' => ['patient_name', 'doctor_name', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_reminder_24h',
                'name' => 'Appointment Doctor Reminder 24h',
                'subject' => 'Reminder: appointment with {{patient_name}} tomorrow',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} is scheduled for {{appointment_date}} at {{appointment_time}}.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Ends:</strong> {{appointment_end_time}}</p><p><strong>Patient note:</strong> {{patient_note}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Appointment with {{patient_name}} on {{appointment_date}} at {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Ends: {{appointment_end_time}}. Note: {{patient_note}}. Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'patient_note', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_reminder_1h',
                'name' => 'Appointment Doctor Reminder 1h',
                'subject' => 'Your appointment starts in 1 hour',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} starts at {{appointment_time}} on {{appointment_date}}.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Ends:</strong> {{appointment_end_time}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 1 hour. Patient: {{patient_name}}. Date: {{appointment_date}}. Time: {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Ends: {{appointment_end_time}}. Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_reminder_2h',
                'name' => 'Appointment Doctor Reminder 2h',
                'subject' => 'Your appointment starts in 2 hours',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} starts in 2 hours at {{appointment_time}} on {{appointment_date}}.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Ends:</strong> {{appointment_end_time}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 2 hours. Patient: {{patient_name}}. Date: {{appointment_date}}. Time: {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Ends: {{appointment_end_time}}. Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_reminder_30m',
                'name' => 'Appointment Doctor Reminder 30m',
                'subject' => 'Your appointment starts in 30 minutes',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} starts in 30 minutes.</p><p><strong>Date:</strong> {{appointment_date}}<br /><strong>Time:</strong> {{appointment_time}}<br /><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 30 minutes. Patient: {{patient_name}}. Date: {{appointment_date}}. Time: {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'booking_id', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_reminder_5m',
                'name' => 'Appointment Doctor Reminder 5m',
                'subject' => 'Your appointment starts in 5 minutes',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} starts in 5 minutes. Please use the link below when you are ready.</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts in 5 minutes. Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_start',
                'name' => 'Appointment Doctor Start',
                'subject' => 'Your appointment starts now',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} starts now.</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'Your appointment starts now. Join: {{google_meet_link}}',
                'variables' => ['doctor_name', 'patient_name', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_customer_followup',
                'name' => 'Appointment Customer Follow Up',
                'subject' => 'Thank you for booking your appointment with us',
                'body_html' => '<p>Hi {{patient_name}},</p><p>Thank you for booking your appointment with us.</p><p>Your consultation has been successfully completed, and we appreciate you trusting us with your care. We hope your session was helpful and that you received the support and guidance you needed.</p><p>If you have any follow-up questions, prescriptions, reports, or next steps from your consultation, please check your appointment dashboard or contact our support team.</p><p>You can also book another appointment anytime through your account.</p><p>Thank you once again for choosing us.</p><p>Best regards,<br />NevariHealth</p><p><a href="{{dashboard_link}}">Open your appointment dashboard</a></p>',
                'body_text' => 'Hi {{patient_name}}, thank you for booking your appointment with us. Your consultation has been successfully completed. Please check your appointment dashboard for follow-up questions, prescriptions, reports, or next steps: {{dashboard_link}}. Best regards, NevariHealth.',
                'variables' => ['patient_name', 'doctor_name', 'review_link', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_customer_ending_soon',
                'name' => 'Appointment Customer Ending Soon',
                'subject' => 'Your appointment with {{doctor_name}} ends in 2 minutes',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} ends in 2 minutes at {{appointment_end_time}}.</p><p><strong>Date:</strong> {{appointment_date}}<br /><strong>Started:</strong> {{appointment_time}}<br /><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}</p><p>{{google_meet_link_html}}</p><p><a href="{{dashboard_link}}">Open dashboard</a></p>',
                'body_text' => 'Your appointment with {{doctor_name}} ends in 2 minutes at {{appointment_end_time}}. Date: {{appointment_date}}. Started: {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Join: {{google_meet_link}}. Dashboard: {{dashboard_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'google_meet_link', 'google_meet_link_html', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_doctor_ending_soon',
                'name' => 'Appointment Doctor Ending Soon',
                'subject' => 'Your appointment with {{patient_name}} ends in 2 minutes',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Your appointment with {{patient_name}} ends in 2 minutes at {{appointment_end_time}}.</p><p><strong>Date:</strong> {{appointment_date}}<br /><strong>Started:</strong> {{appointment_time}}<br /><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}</p><p>{{google_meet_link_html}}</p><p><a href="{{dashboard_link}}">Open dashboard</a></p>',
                'body_text' => 'Your appointment with {{patient_name}} ends in 2 minutes at {{appointment_end_time}}. Date: {{appointment_date}}. Started: {{appointment_time}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Join: {{google_meet_link}}. Dashboard: {{dashboard_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_date', 'appointment_time', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'google_meet_link', 'google_meet_link_html', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_waiting_notification',
                'name' => 'Appointment Waiting Notification',
                'subject' => '{{waiting_actor_label}} is waiting for the appointment',
                'body_html' => '<p>Hello {{recipient_name}},</p><p>{{waiting_actor_label}} is waiting in the appointment room.</p><p><strong>Date:</strong> {{appointment_date}}<br /><strong>Time:</strong> {{appointment_time}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => '{{waiting_actor_label}} is waiting for the appointment. Join: {{google_meet_link}}',
                'variables' => ['recipient_name', 'waiting_actor_label', 'patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_reference', 'booking_id', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_reservation_expired',
                'name' => 'Appointment Reservation Expired',
                'subject' => 'Your appointment reservation has expired',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment reservation has expired.</p><p><strong>Doctor:</strong> {{doctor_name}}<br /><strong>Date:</strong> {{appointment_date}}<br /><strong>Time:</strong> {{appointment_time}}<br /><strong>Reference:</strong> {{appointment_reference}}</p><p>You can book another appointment anytime from your dashboard.</p><p><a href="{{dashboard_link}}">Open dashboard</a></p>',
                'body_text' => 'Hello {{patient_name}}, your appointment reservation has expired for {{appointment_date}} at {{appointment_time}} with {{doctor_name}}. Reference: {{appointment_reference}}. Open dashboard: {{dashboard_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_reference', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_doctor_note',
                'name' => 'Appointment Doctor Note',
                'subject' => 'Doctor note from your appointment with {{doctor_name}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your doctor has added notes from your completed appointment with {{doctor_name}}.</p><p><strong>Date:</strong> {{appointment_date}}<br /><strong>Time:</strong> {{appointment_time}}<br /><strong>Reference:</strong> {{appointment_reference}}</p><p><strong>Doctor&apos;s note:</strong></p><p>{{doctor_notes}}</p><p><a href="{{dashboard_link}}">Open dashboard</a></p>',
                'body_text' => 'Hello {{patient_name}}, your doctor has added notes from your completed appointment with {{doctor_name}} on {{appointment_date}} at {{appointment_time}}. Reference: {{appointment_reference}}. Doctor note: {{doctor_notes}}. Open dashboard: {{dashboard_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_reference', 'doctor_notes', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_prescription_followup',
                'name' => 'Appointment Prescription Follow Up',
                'subject' => 'Prescription update from your appointment with {{doctor_name}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>A prescription from your appointment with {{doctor_name}} is now available.</p><p><strong>Date:</strong> {{appointment_date}}<br /><strong>Time:</strong> {{appointment_time}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Prescription:</strong> {{prescription_number}}</p><p>Please check your dashboard for the full prescription details and next steps.</p><p><a href="{{dashboard_link}}">Open dashboard</a></p>',
                'body_text' => 'Hello {{patient_name}}, a prescription from your appointment with {{doctor_name}} is now available. Date: {{appointment_date}}. Time: {{appointment_time}}. Reference: {{appointment_reference}}. Prescription: {{prescription_number}}. Open dashboard: {{dashboard_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'appointment_reference', 'prescription_number', 'dashboard_link'],
            ],
            [
                'template_key' => 'appointment_cancelled',
                'name' => 'Appointment Cancelled',
                'subject' => 'Appointment cancelled',
                'body_html' => '<p>Hello {{recipient_name}},</p><p>The appointment between {{patient_name}} and {{doctor_name}} for {{appointment_start}} has been cancelled.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}</p>',
                'body_text' => 'The appointment between {{patient_name}} and {{doctor_name}} for {{appointment_start}} has been cancelled. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}.',
                'variables' => ['recipient_name', 'patient_name', 'doctor_name', 'appointment_start', 'appointment_duration', 'booking_id', 'appointment_reference'],
            ],
            [
                'template_key' => 'appointment_rescheduled',
                'name' => 'Appointment Rescheduled',
                'subject' => 'Appointment rescheduled',
                'body_html' => '<p>Hello {{recipient_name}},</p><p>The appointment has been rescheduled to {{appointment_start}}.</p><p><strong>Duration:</strong> {{appointment_duration}}<br /><strong>Booking ID:</strong> {{booking_id}}<br /><strong>Reference:</strong> {{appointment_reference}}<br /><strong>Ends:</strong> {{appointment_end_time}}</p><p>{{google_meet_link_html}}</p>',
                'body_text' => 'The appointment has been rescheduled to {{appointment_start}}. Duration: {{appointment_duration}}. Booking ID: {{booking_id}}. Reference: {{appointment_reference}}. Ends: {{appointment_end_time}}. Join: {{google_meet_link}}',
                'variables' => ['recipient_name', 'appointment_start', 'appointment_duration', 'appointment_reference', 'appointment_end_time', 'booking_id', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'mtm_request_submitted_customer',
                'name' => 'MTM Request Submitted Customer',
                'subject' => 'We received your MTM request {{request_reference}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your MTM request {{request_reference}} has been received and assigned for review.</p><p>Current status: {{current_status}}</p><p>{{mtm_request_link_html}}</p>',
                'body_text' => 'Hello {{patient_name}}, your MTM request {{request_reference}} has been received. Current status: {{current_status}}. View request: {{mtm_request_link}}',
                'variables' => ['patient_name', 'request_reference', 'mtm_request_id', 'current_status', 'mtm_request_link', 'mtm_request_link_html'],
            ],
            [
                'template_key' => 'mtm_request_submitted_pharmacist',
                'name' => 'MTM Request Submitted Pharmacist',
                'subject' => 'New MTM request assigned: {{request_reference}}',
                'body_html' => '<p>Hello {{pharmacist_name}},</p><p>A new MTM request has been assigned to you.</p><p>Patient: {{patient_name}}<br />Current status: {{current_status}}</p><p>{{pharmacist_dashboard_link_html}}</p>',
                'body_text' => 'Hello {{pharmacist_name}}, a new MTM request {{request_reference}} has been assigned to you for {{patient_name}}. Status: {{current_status}}. Open queue: {{pharmacist_dashboard_link}}',
                'variables' => ['pharmacist_name', 'patient_name', 'request_reference', 'current_status', 'pharmacist_dashboard_link', 'pharmacist_dashboard_link_html'],
            ],
            [
                'template_key' => 'mtm_request_status_changed_customer',
                'name' => 'MTM Status Changed Customer',
                'subject' => 'MTM request {{request_reference}} updated to {{current_status}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your MTM request status changed from {{previous_status}} to {{current_status}}.</p><p>{{mtm_request_link_html}}</p>',
                'body_text' => 'Hello {{patient_name}}, your MTM request {{request_reference}} changed from {{previous_status}} to {{current_status}}. View request: {{mtm_request_link}}',
                'variables' => ['patient_name', 'request_reference', 'previous_status', 'current_status', 'mtm_request_link', 'mtm_request_link_html'],
            ],
            [
                'template_key' => 'mtm_request_status_changed_pharmacist',
                'name' => 'MTM Status Changed Pharmacist',
                'subject' => 'MTM request {{request_reference}} is now {{current_status}}',
                'body_html' => '<p>Hello {{pharmacist_name}},</p><p>MTM request {{request_reference}} for {{patient_name}} changed from {{previous_status}} to {{current_status}}.</p><p>{{pharmacist_dashboard_link_html}}</p>',
                'body_text' => 'Hello {{pharmacist_name}}, MTM request {{request_reference}} for {{patient_name}} changed from {{previous_status}} to {{current_status}}. Open queue: {{pharmacist_dashboard_link}}',
                'variables' => ['pharmacist_name', 'patient_name', 'request_reference', 'previous_status', 'current_status', 'pharmacist_dashboard_link', 'pharmacist_dashboard_link_html'],
            ],
            [
                'template_key' => 'mtm_request_approved_customer',
                'name' => 'MTM Request Approved Customer',
                'subject' => 'Your MTM request {{request_reference}} has been approved',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your MTM request has been approved by {{pharmacist_name}}.</p><p>{{mtm_request_link_html}}</p>',
                'body_text' => 'Hello {{patient_name}}, your MTM request {{request_reference}} has been approved by {{pharmacist_name}}. View request: {{mtm_request_link}}',
                'variables' => ['patient_name', 'pharmacist_name', 'request_reference', 'mtm_request_link', 'mtm_request_link_html'],
            ],
            [
                'template_key' => 'mtm_request_scheduled_customer',
                'name' => 'MTM Request Scheduled Customer',
                'subject' => 'Your MTM consultation is scheduled for {{appointment_date}} at {{appointment_time}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your MTM consultation has been scheduled for {{appointment_date}} at {{appointment_time}} ({{timezone}}).</p><p>{{google_meet_link_html}}</p><p>{{mtm_request_link_html}}</p>',
                'body_text' => 'Hello {{patient_name}}, your MTM consultation is scheduled for {{appointment_date}} at {{appointment_time}} ({{timezone}}). Join: {{google_meet_link}}. View request: {{mtm_request_link}}',
                'variables' => ['patient_name', 'appointment_date', 'appointment_time', 'timezone', 'google_meet_link', 'google_meet_link_html', 'mtm_request_link', 'mtm_request_link_html'],
            ],
            [
                'template_key' => 'mtm_request_documentation_added_customer',
                'name' => 'MTM Documentation Added Customer',
                'subject' => '{{update_label}} for MTM request {{request_reference}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>{{update_description}}</p><p>Current status: {{current_status}}</p><p>{{mtm_request_link_html}}</p>',
                'body_text' => 'Hello {{patient_name}}, {{update_description}} Current status: {{current_status}}. View request: {{mtm_request_link}}',
                'variables' => ['patient_name', 'request_reference', 'update_label', 'update_description', 'current_status', 'mtm_request_link', 'mtm_request_link_html'],
            ],
            [
                'template_key' => 'mtm_request_documentation_added_pharmacist',
                'name' => 'MTM Documentation Added Pharmacist',
                'subject' => '{{update_label}} on {{request_reference}}',
                'body_html' => '<p>Hello {{pharmacist_name}},</p><p>{{update_description}}</p><p>Patient: {{patient_name}}<br />Current status: {{current_status}}</p><p>{{pharmacist_dashboard_link_html}}</p>',
                'body_text' => 'Hello {{pharmacist_name}}, {{update_description}} Patient: {{patient_name}}. Current status: {{current_status}}. Open queue: {{pharmacist_dashboard_link}}',
                'variables' => ['pharmacist_name', 'patient_name', 'request_reference', 'update_label', 'update_description', 'current_status', 'pharmacist_dashboard_link', 'pharmacist_dashboard_link_html'],
            ],
            [
                'template_key' => 'mtm_request_order_created_customer',
                'name' => 'MTM Product Order Created Customer',
                'subject' => 'A product order was added to MTM request {{request_reference}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>A pharmacy product order (Order #{{order_id}}) was added to your MTM request.</p><p>{{mtm_request_link_html}}</p>',
                'body_text' => 'Hello {{patient_name}}, Order #{{order_id}} was added to your MTM request {{request_reference}}. View request: {{mtm_request_link}}',
                'variables' => ['patient_name', 'request_reference', 'order_id', 'mtm_request_link', 'mtm_request_link_html'],
            ],
            [
                'template_key' => 'mtm_request_order_created_pharmacist',
                'name' => 'MTM Product Order Created Pharmacist',
                'subject' => 'Product order created for {{request_reference}}',
                'body_html' => '<p>Hello {{pharmacist_name}},</p><p>Order #{{order_id}} was created for {{patient_name}}\'s MTM request.</p><p>{{pharmacist_dashboard_link_html}}</p>',
                'body_text' => 'Hello {{pharmacist_name}}, Order #{{order_id}} was created for {{patient_name}} on {{request_reference}}. Open queue: {{pharmacist_dashboard_link}}',
                'variables' => ['pharmacist_name', 'patient_name', 'request_reference', 'order_id', 'pharmacist_dashboard_link', 'pharmacist_dashboard_link_html'],
            ],
        ];

        $care_lifecycle_templates = [
            'nurse_registration_received' => 'Nurse registration received',
            'nurse_admin_review' => 'Nurse registration requires review',
            'nurse_approved' => 'Nurse registration approved',
            'nurse_declined' => 'Nurse registration declined',
            'nurse_ban' => 'Nurse account banned',
            'nurse_unban' => 'Nurse account restored',
            'nurse_reassignment_required' => 'Nurse Request requires reassignment',
            'nurse_request_submitted' => 'Nurse Request submitted',
            'nurse_request_under_review' => 'Nurse Request under review',
            'nurse_request_nurse_assigned' => 'Nurse assigned',
            'nurse_request_scheduled' => 'Nurse visit scheduled',
            'nurse_request_in_progress' => 'Nurse service started',
            'nurse_request_completed' => 'Nurse service completed',
            'nurse_request_declined' => 'Nurse Request declined',
            'nurse_request_cancelled' => 'Nurse Request cancelled',
            'iv_therapy_submitted' => 'IV Therapy request submitted',
            'iv_therapy_under_review' => 'IV Therapy operational review',
            'iv_therapy_clinician_assigned' => 'IV Therapy clinician assigned',
            'iv_therapy_approved' => 'IV Therapy request approved',
            'iv_therapy_scheduled' => 'IV Therapy scheduled',
            'iv_therapy_declined' => 'IV Therapy request declined',
            'iv_therapy_treatment_completed' => 'IV treatment completed',
            'iv_therapy_completed' => 'IV Therapy request completed',
            'iv_therapy_cancelled' => 'IV Therapy request cancelled',
            'mtm_payment_confirmed' => 'MTM payment confirmed',
            'mtm_quota_reserved' => 'MTM consultation credit reserved',
            'mtm_slot_reserved' => 'MTM slot reserved pending approval',
            'mtm_slot_reserved_customer' => 'MTM availability reserved',
            'mtm_slot_reserved_pharmacist' => 'New MTM availability reserved',
            'mtm_slot_held_customer' => 'MTM availability held pending payment',
            'mtm_slot_held_pharmacist' => 'MTM availability held pending payment',
            'mtm_declined' => 'MTM request declined',
            'mtm_refund_required' => 'MTM refund requires action',
            'mtm_refund_completed' => 'MTM refund recorded',
            'mtm_consultation_completed' => 'MTM consultation completed',
        ];
        foreach ($care_lifecycle_templates as $template_key => $label) {
            $is_mtm_slot_hold = in_array($template_key, ['mtm_slot_held_customer','mtm_slot_held_pharmacist'], true);
            $templates[] = [
                'template_key' => $template_key,
                'name' => $label,
                'subject' => $label . ': {{request_reference}}',
                'body_html' => '<p>Hello {{recipient_name}},</p><p>' . esc_html($label) . '.</p>' . ($is_mtm_slot_hold ? '<p>This availability is held until {{slot_hold_expires_at}} and will be released if payment is not completed.</p>' : '') . '<p>Reference: {{request_reference}}</p><p><a href="{{dashboard_link}}">Open dashboard</a></p>',
                'body_text' => 'Hello {{recipient_name}}, ' . $label . '. ' . ($is_mtm_slot_hold ? 'This availability is held until {{slot_hold_expires_at}} and will be released if payment is not completed. ' : '') . 'Reference: {{request_reference}}. Dashboard: {{dashboard_link}}',
                'variables' => array_values(array_filter(['recipient_name', 'request_reference', 'dashboard_link', $is_mtm_slot_hold ? 'slot_hold_expires_at' : null])),
            ];
        }

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
            'appointment_requested',
            'appointment_customer_confirmation',
            'appointment_doctor_notification',
            'appointment_customer_reminder_24h',
            'appointment_customer_reminder_1h',
            'appointment_customer_reminder_2h',
            'appointment_customer_reminder_30m',
            'appointment_customer_reminder_5m',
            'appointment_customer_start',
            'appointment_doctor_reminder_24h',
            'appointment_doctor_reminder_1h',
            'appointment_doctor_reminder_2h',
            'appointment_doctor_reminder_30m',
            'appointment_doctor_reminder_5m',
            'appointment_doctor_start',
            'appointment_customer_followup',
            'appointment_customer_ending_soon',
            'appointment_doctor_ending_soon',
            'appointment_waiting_notification',
            'appointment_reservation_expired',
            'appointment_doctor_note',
            'appointment_prescription_followup',
            'appointment_cancelled',
            'appointment_rescheduled',
        ];

        if (!in_array($template_key, $stale_booking_keys, true)) {
            return false;
        }

        if ($version > 1) {
            return false;
        }

        if ($template_key === 'appointment_requested') {
            return strpos($body_html, '{{appointment_date}}') === false
                || strpos($body_html, '{{appointment_time}}') === false
                || strpos($body_html, '{{payment_link_html}}') === false
                || strpos($body_html, '{{appointment_reference}}') === false;
        }

        if ($template_key === 'appointment_customer_confirmation') {
            return strpos($body_html, '{{appointment_duration}}') === false
                || strpos($body_html, '{{appointment_reference}}') === false;
        }

        if ($template_key === 'appointment_doctor_notification') {
            return strpos($body_html, 'calendar_link') !== false
                || strpos($body_html, '{{patient_note}}') === false
                || strpos($body_html, '{{appointment_duration}}') === false
                || strpos($body_html, '{{appointment_reference}}') === false;
        }

        if (in_array($template_key, [
            'appointment_customer_reminder_24h',
            'appointment_customer_reminder_1h',
            'appointment_customer_reminder_2h',
            'appointment_customer_reminder_30m',
            'appointment_customer_reminder_5m',
            'appointment_customer_start',
            'appointment_doctor_reminder_24h',
            'appointment_doctor_reminder_1h',
            'appointment_doctor_reminder_2h',
            'appointment_doctor_reminder_30m',
            'appointment_doctor_reminder_5m',
            'appointment_doctor_start',
            'appointment_customer_ending_soon',
            'appointment_doctor_ending_soon',
            'appointment_waiting_notification',
        ], true)) {
            if (in_array($template_key, ['appointment_customer_ending_soon', 'appointment_doctor_ending_soon'], true) && strpos($body_html, '2 minutes') === false) {
                return true;
            }
            return strpos($body_html, '{{appointment_duration}}') === false
                || strpos($body_html, '{{appointment_reference}}') === false
                || strpos($body_html, '{{booking_id}}') === false;
        }

        if ($template_key === 'appointment_customer_followup') {
            return strpos($body_html, 'Thank you for booking your appointment with us.') === false
                || strpos($body_html, '{{dashboard_link}}') === false;
        }

        if ($template_key === 'appointment_reservation_expired') {
            return strpos($body_html, 'reservation has expired') === false
                || strpos($body_html, '{{appointment_date}}') === false;
        }

        if ($template_key === 'appointment_doctor_note') {
            return strpos($body_html, '{{doctor_notes}}') === false
                || strpos($body_html, '{{dashboard_link}}') === false;
        }

        if ($template_key === 'appointment_prescription_followup') {
            return strpos($body_html, '{{prescription_number}}') === false
                || strpos($body_html, '{{dashboard_link}}') === false;
        }

        return strpos($body_html, 'calendar_link') !== false
            || strpos($body_html, '{{recipient_name}}') === false
            || strpos($body_html, '{{appointment_duration}}') === false
            || strpos($body_html, '{{appointment_reference}}') === false;
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

        register_post_type(self::SUBSCRIPTION_PLAN_POST_TYPE, [
            'label' => __('Nevari subscriptions', 'nevari-pharmacy-core'),
            'labels' => [
                'name' => __('Nevari subscriptions', 'nevari-pharmacy-core'),
                'singular_name' => __('Nevari subscription', 'nevari-pharmacy-core'),
                'add_new_item' => __('Add New Subscription', 'nevari-pharmacy-core'),
                'edit_item' => __('Edit Subscription', 'nevari-pharmacy-core'),
                'new_item' => __('New Subscription', 'nevari-pharmacy-core'),
                'view_item' => __('View Subscription', 'nevari-pharmacy-core'),
                'search_items' => __('Search Subscriptions', 'nevari-pharmacy-core'),
                'not_found' => __('No subscriptions found.', 'nevari-pharmacy-core'),
            ],
            'public' => false,
            'show_ui' => true,
            'show_in_menu' => true,
            'menu_icon' => 'dashicons-yes-alt',
            'show_in_rest' => false,
            'supports' => ['title', 'editor', 'excerpt', 'custom-fields'],
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

    public function register_subscription_plan_meta(): void {
        if (!function_exists('register_post_meta')) {
            return;
        }

        $string_meta = [
            '_nevari_subscription_description' => 'sanitize_textarea_field',
            '_nevari_subscription_features' => [Nevari_Subscriptions::class, 'normalize_multiline_text'],
            '_nevari_subscription_checkout_link' => 'esc_url_raw',
        ];

        foreach ($string_meta as $key => $sanitize_callback) {
            register_post_meta(self::SUBSCRIPTION_PLAN_POST_TYPE, $key, [
                'single' => true,
                'type' => 'string',
                'show_in_rest' => true,
                'sanitize_callback' => $sanitize_callback,
                'auth_callback' => static function () {
                    return current_user_can('edit_posts');
                },
            ]);
        }

        register_post_meta('product', self::PRODUCT_PRESCRIPTION_TEXT_META, [
            'single' => true,
            'type' => 'string',
            'show_in_rest' => false,
            'sanitize_callback' => 'sanitize_textarea_field',
            'auth_callback' => static function () {
                return current_user_can('edit_products') || current_user_can('nevari_manage_products');
            },
        ]);
    }

    public function render_product_prescription_field(): void {
        global $post;

        if (!$post instanceof WP_Post || $post->post_type !== 'product') {
            return;
        }

        $prescription = (string) get_post_meta($post->ID, self::PRODUCT_PRESCRIPTION_TEXT_META, true);

        echo '<div class="options_group">';
        echo '<p class="form-field">';
        echo '<label for="_nevari_product_prescription">' . esc_html__('Prescription', 'nevari-pharmacy-core') . '</label>';
        echo '<textarea id="_nevari_product_prescription" name="_nevari_product_prescription" rows="5" style="width:50%;min-width:320px;">' . esc_textarea($prescription) . '</textarea>';
        echo '<span class="description" style="display:block;margin-top:8px;">' . esc_html__('Enter the prescription/instructions for this product. It will be included in customer order emails for orders containing this product.', 'nevari-pharmacy-core') . '</span>';
        echo '</p>';
        echo '</div>';
    }

    public function save_product_prescription_field($product): void {
        if (!$product || !is_object($product) || !method_exists($product, 'update_meta_data')) {
            return;
        }

        $prescription = isset($_POST['_nevari_product_prescription'])
            ? sanitize_textarea_field(wp_unslash($_POST['_nevari_product_prescription']))
            : '';

        if ($prescription !== '') {
            $product->update_meta_data(self::PRODUCT_PRESCRIPTION_TEXT_META, $prescription);
            return;
        }

        $product->delete_meta_data(self::PRODUCT_PRESCRIPTION_TEXT_META);
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
        foreach ([
            'woocommerce_email_enabled_customer_processing_order',
            'woocommerce_email_enabled_customer_completed_order',
            'woocommerce_email_enabled_customer_invoice',
            'woocommerce_email_enabled_customer_on_hold_order',
            'woocommerce_email_enabled_new_order',
            'woocommerce_email_enabled_cancelled_order',
            'woocommerce_email_enabled_failed_order',
        ] as $filter_name) {
            add_filter($filter_name, [$this, 'filter_custom_email_only_orders'], 10, 2);
        }

        add_filter('woocommerce_add_to_cart_validation', [$this, 'validate_rx_add_to_cart'], 10, 3);
        add_action('woocommerce_email_after_order_table', [$this, 'render_customer_order_prescriptions_email'], 20, 4);
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
        if (!$product_id) {
            return;
        }

        $variation_id = isset($values['variation_id']) ? (int) $values['variation_id'] : 0;
        $prescription_text = $this->get_product_prescription_text($variation_id ?: $product_id);
        if ($prescription_text !== '') {
            $item->add_meta_data(self::PRODUCT_PRESCRIPTION_TEXT_META, $prescription_text, true);
        }

        if (!Nevari_Helpers::product_requires_rx($product_id)) {
            return;
        }

        $item->add_meta_data('_nevari_rx_required', 'yes', true);
        $prescription = Nevari_Helpers::find_valid_prescription_for_product((int) $order->get_user_id(), $product_id, isset($values['quantity']) ? (float) $values['quantity'] : 1);
        if ($prescription) {
            $item->add_meta_data('_nevari_prescription_id', (int) $prescription->id, true);
        }
    }

    public function render_customer_order_prescriptions_email($order, $sent_to_admin, $plain_text, $email): void {
        $allowed_email_ids = [
            'customer_processing_order',
            'customer_completed_order',
            'customer_invoice',
            'customer_on_hold_order',
        ];

        $email_id = is_object($email) && isset($email->id) ? (string) $email->id : '';

        if ($sent_to_admin || !in_array($email_id, $allowed_email_ids, true) || !$order instanceof WC_Order) {
            return;
        }

        $entries = [];

        foreach ($order->get_items('line_item') as $item) {
            if (!$item instanceof WC_Order_Item_Product) {
                continue;
            }

            $prescription_text = trim((string) $item->get_meta(self::PRODUCT_PRESCRIPTION_TEXT_META, true));
            if ($prescription_text === '') {
                $product_id = $item->get_variation_id() ?: $item->get_product_id();
                $prescription_text = $this->get_product_prescription_text((int) $product_id);
            }

            if ($prescription_text === '') {
                continue;
            }

            $entries[] = [
                'product_name' => $item->get_name(),
                'prescription' => $prescription_text,
            ];
        }

        if (!$entries) {
            return;
        }

        if ($plain_text) {
            echo "\n" . wp_strip_all_tags(__('Product Prescriptions', 'nevari-pharmacy-core')) . "\n";
            foreach ($entries as $entry) {
                echo sprintf(
                    "\n%s:\n%s\n",
                    wp_strip_all_tags((string) $entry['product_name']),
                    wp_strip_all_tags((string) $entry['prescription'])
                );
            }
            return;
        }

        echo '<section class="nevari-order-prescriptions" style="margin-top:24px;">';
        echo '<h2 style="font-size:18px;line-height:1.4;margin:0 0 12px;">' . esc_html__('Product Prescriptions', 'nevari-pharmacy-core') . '</h2>';
        foreach ($entries as $entry) {
            echo '<div style="margin:0 0 14px;padding:14px 16px;border:1px solid #e6ecf2;border-radius:12px;background:#f8fafc;">';
            echo '<strong style="display:block;margin-bottom:8px;">' . esc_html((string) $entry['product_name']) . '</strong>';
            echo '<div style="white-space:pre-line;color:#334155;">' . esc_html((string) $entry['prescription']) . '</div>';
            echo '</div>';
        }
        echo '</section>';
    }

    private function get_product_prescription_text(int $product_id): string {
        if ($product_id < 1) {
            return '';
        }

        $prescription = trim((string) get_post_meta($product_id, self::PRODUCT_PRESCRIPTION_TEXT_META, true));
        if ($prescription !== '') {
            return $prescription;
        }

        if (function_exists('wp_get_post_parent_id')) {
            $parent_id = wp_get_post_parent_id($product_id);
            if ($parent_id > 0) {
                return trim((string) get_post_meta($parent_id, self::PRODUCT_PRESCRIPTION_TEXT_META, true));
            }
        }

        return '';
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

    private function appointment_effective_meet_end_at($appointment): string {
        $end_at = isset($appointment->end_at) ? (string) $appointment->end_at : '';
        if (!$appointment || (string) ($appointment->type ?? '') !== 'video') {
            return $end_at;
        }

        $start_ts = strtotime((string) ($appointment->start_at ?? '') . ' UTC');
        $end_ts = strtotime($end_at . ' UTC');
        if (!$start_ts || !$end_ts || $end_ts <= $start_ts) {
            return $end_at;
        }

        return gmdate('Y-m-d H:i:s', min($end_ts, $start_ts + (30 * MINUTE_IN_SECONDS)));
    }

    private function appointment_effective_meet_end_timestamp($appointment): int {
        $effective_end_at = $this->appointment_effective_meet_end_at($appointment);
        if ($effective_end_at === '') {
            return 0;
        }

        return (int) strtotime($effective_end_at . ' UTC');
    }

    public function ensure_appointment_join_access($appointment) {
        global $wpdb;

        if (!$appointment || empty($appointment->id) || (string) ($appointment->type ?? '') !== 'video') {
            return $appointment;
        }
        if (Nevari_Helpers::appointment_raw_meeting_link($appointment) === '') {
            return $appointment;
        }

        $valid_from_at = Nevari_Helpers::appointment_join_valid_from_at($appointment);
        $expires_at = Nevari_Helpers::appointment_join_expires_at($appointment);
        if ($valid_from_at === '' || $expires_at === '') {
            return $appointment;
        }

        $next = clone $appointment;
        $next->join_valid_from_at = $valid_from_at;
        $next->join_expires_at = $expires_at;
        $patient_token = Nevari_Helpers::appointment_join_token($next, 'patient');
        $doctor_token = Nevari_Helpers::appointment_join_token($next, 'doctor');
        if ($patient_token === '' || $doctor_token === '') {
            return $appointment;
        }

        $patient_hash = hash('sha256', $patient_token);
        $doctor_hash = hash('sha256', $doctor_token);
        $current_patient_hash = (string) ($appointment->patient_join_token_hash ?? '');
        $current_doctor_hash = (string) ($appointment->doctor_join_token_hash ?? '');
        $current_valid_from = (string) ($appointment->join_valid_from_at ?? '');
        $current_expires = (string) ($appointment->join_expires_at ?? '');

        if (
            $current_patient_hash !== $patient_hash
            || $current_doctor_hash !== $doctor_hash
            || $current_valid_from !== $valid_from_at
            || $current_expires !== $expires_at
        ) {
            $wpdb->update(Nevari_Helpers::table('appointments'), [
                'patient_join_token_hash' => $patient_hash,
                'doctor_join_token_hash' => $doctor_hash,
                'join_valid_from_at' => $valid_from_at,
                'join_expires_at' => $expires_at,
                'updated_at' => Nevari_Helpers::now(),
            ], ['id' => (int) $appointment->id], ['%s', '%s', '%s', '%s', '%s'], ['%d']);
            $appointment = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM " . Nevari_Helpers::table('appointments') . " WHERE id = %d",
                (int) $appointment->id
            )) ?: $next;
        } else {
            $appointment = $next;
            $appointment->patient_join_token_hash = $patient_hash;
            $appointment->doctor_join_token_hash = $doctor_hash;
        }

        return $appointment;
    }

    private function finalize_appointment_attendance(int $appointment_id): bool {
        global $wpdb;

        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment || (string) ($appointment->type ?? '') !== 'video') {
            return true;
        }

        $patient_checked_in = !empty($appointment->patient_checked_in_at);
        $doctor_checked_in = !empty($appointment->doctor_checked_in_at);
        if ($patient_checked_in && $doctor_checked_in) {
            return true;
        }

        $missed_role = !$patient_checked_in && !$doctor_checked_in
            ? 'both'
            : (!$doctor_checked_in ? 'doctor' : 'patient');

        $wpdb->update($appointments_table, [
            'missed_attendance_at' => Nevari_Helpers::now(),
            'missed_attendance_role' => $missed_role,
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s', '%s'], ['%d']);

        return false;
    }

    private function appointment_email_context($appointment, $order = null): array {
        $appointment = $this->ensure_appointment_join_access($appointment);
        $doctor = get_user_by('id', (int) $appointment->doctor_user_id);
        $patient = get_user_by('id', (int) $appointment->patient_user_id);
        $calendar = Nevari_Helpers::appointment_calendar_links($appointment);
        $patient_join_link = Nevari_Helpers::appointment_join_url($appointment, 'patient');
        $doctor_join_link = Nevari_Helpers::appointment_join_url($appointment, 'doctor');
        $meet_link = $patient_join_link;
        $effective_meet_end_at = $this->appointment_effective_meet_end_at($appointment);
        $amount = $order && is_object($order) && method_exists($order, 'get_formatted_order_total')
            ? html_entity_decode(wp_strip_all_tags($order->get_formatted_order_total()))
            : '';
        $patient_dashboard_link = Nevari_Helpers::frontend_dashboard_url('/dashboard');
        $patient_login_link = Nevari_Helpers::frontend_dashboard_url('/login');
        $doctor_dashboard_link = Nevari_Helpers::frontend_dashboard_url('/admin/doctor');
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
            'patient_join_link' => $patient_join_link,
            'doctor_join_link' => $doctor_join_link,
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
                'appointment_start' => gmdate('F j, Y \\a\\t g:i A', strtotime((string) $appointment->start_at . ' UTC')),
                'appointment_end' => Nevari_Helpers::iso_datetime($effective_meet_end_at),
                'appointment_date' => gmdate('F j, Y', strtotime((string) $appointment->start_at . ' UTC')),
                'appointment_time' => gmdate('g:i A', strtotime((string) $appointment->start_at . ' UTC')),
                'appointment_end_time' => gmdate('g:i A', strtotime($effective_meet_end_at . ' UTC')),
                'appointment_duration' => (string) ((int) ($appointment->duration_minutes ?? 30)) . ' minutes',
                'appointment_status' => ucwords(str_replace('_', ' ', (string) $appointment->status)),
                'appointment_amount' => $amount,
                'amount_paid' => $amount,
                'booking_id' => (string) $appointment->id,
                'appointment_reference' => 'APT-' . str_pad((string) $appointment->id, 6, '0', STR_PAD_LEFT),
                'order_id' => $appointment->order_id ? (string) $appointment->order_id : '',
                'patient_note' => (string) ($appointment->reason ?: ''),
                'reason' => (string) ($appointment->reason ?: ''),
                'doctor_notes' => wp_strip_all_tags((string) ($appointment->doctor_notes ?? '')),
                'prescription_number' => '',
                'calendar_link' => $calendar['ics_url'],
                'calendar_link_html' => ['html' => '<a href="' . esc_url($calendar['ics_url']) . '">Download calendar invite</a>', 'text' => $calendar['ics_url']],
                'google_meet_link' => $meet_link,
                'google_meet_link_html' => $meet_link ? ['html' => '<a href="' . esc_url($meet_link) . '" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E2955;color:#ffffff;text-decoration:none;font-weight:700;">Join Appointment</a>', 'text' => $meet_link] : '',
                'join_link' => $meet_link,
                'join_link_html' => $meet_link ? ['html' => '<a href="' . esc_url($meet_link) . '" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E2955;color:#ffffff;text-decoration:none;font-weight:700;">Join Appointment</a>', 'text' => $meet_link] : '',
                'patient_join_link' => $patient_join_link,
                'patient_join_link_html' => $patient_join_link ? ['html' => '<a href="' . esc_url($patient_join_link) . '" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E2955;color:#ffffff;text-decoration:none;font-weight:700;">Join Appointment</a>', 'text' => $patient_join_link] : '',
                'doctor_join_link' => $doctor_join_link,
                'doctor_join_link_html' => $doctor_join_link ? ['html' => '<a href="' . esc_url($doctor_join_link) . '" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E2955;color:#ffffff;text-decoration:none;font-weight:700;">Join Appointment</a>', 'text' => $doctor_join_link] : '',
                'cancel_link' => $patient_login_link,
                'reschedule_link' => $patient_login_link,
                'manage_link' => $patient_login_link,
                'dashboard_link' => $patient_login_link,
                'doctor_dashboard_link' => $doctor_dashboard_link,
                'review_link' => $review_link,
                'feedback_link' => $review_link,
                'site_name' => wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES),
                'support_email' => get_option('admin_email'),
            ],
        ];
    }

    private function frontend_dashboard_url(string $frontend_type, string $default_path): string {
        return Nevari_Helpers::frontend_dashboard_url($default_path);
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

    public function send_appointment_waiting_notification($appointment, string $actor_role): array {
        global $wpdb;

        $actor_role = $actor_role === 'doctor' ? 'doctor' : 'patient';
        $appointment = $this->ensure_appointment_join_access($appointment);
        if (!$appointment || empty($appointment->id)) {
            return ['success' => false, 'code' => 'appointment_not_found', 'message' => 'Appointment not found.'];
        }

        $count_column = $actor_role === 'doctor' ? 'doctor_waiting_notify_count' : 'patient_waiting_notify_count';
        $last_column = $actor_role === 'doctor' ? 'doctor_waiting_notify_last_at' : 'patient_waiting_notify_last_at';
        $current_count = (int) ($appointment->{$count_column} ?? 0);
        if ($current_count >= 3) {
            return ['success' => false, 'code' => 'limit_reached', 'disabled' => true, 'cooldown_seconds' => 0, 'message' => 'Notification limit reached.'];
        }

        $last_sent_at = (string) ($appointment->{$last_column} ?? '');
        $last_ts = $last_sent_at !== '' ? (int) strtotime($last_sent_at . ' UTC') : 0;
        $remaining = $last_ts ? max(0, 60 - (time() - $last_ts)) : 0;
        if ($remaining > 0) {
            return ['success' => false, 'code' => 'cooldown', 'disabled' => false, 'cooldown_seconds' => $remaining, 'message' => 'Please wait before sending another notification.'];
        }

        $context = $this->appointment_email_context($appointment, null);
        $recipient_role = $actor_role === 'doctor' ? 'patient' : 'doctor';
        $recipient = $recipient_role === 'doctor' ? $context['doctor'] : $context['patient'];
        if (!$recipient instanceof WP_User || empty($recipient->user_email) || !is_email($recipient->user_email)) {
            return ['success' => false, 'code' => 'missing_recipient', 'message' => 'The other party does not have a valid email address.'];
        }

        $join_link = $recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'];
        $waiting_actor_label = $actor_role === 'doctor' ? 'Doctor' : 'Customer';
        $result = Nevari_Emails::queue_or_send([
            'recipient_user_id' => (int) $recipient->ID,
            'recipient_email' => $recipient->user_email,
            'related_object_type' => 'appointment',
            'related_object_id' => (int) $appointment->id,
            'template_key' => 'appointment_waiting_notification',
            'variables' => array_merge($context['variables'], [
                'recipient_name' => $recipient->display_name ?: 'there',
                'waiting_actor_label' => $waiting_actor_label,
                'google_meet_link' => $join_link,
                'google_meet_link_html' => $join_link ? ['html' => '<a href="' . esc_url($join_link) . '" target="_blank" rel="noopener noreferrer">Join Appointment</a>', 'text' => $join_link] : '',
            ]),
            'body_html' => '<p>Hello ' . esc_html($recipient->display_name ?: 'there') . ',</p><p>' . esc_html($waiting_actor_label) . ' is waiting in the appointment room.</p>' . ($join_link ? '<p><a href="' . esc_url($join_link) . '">Join Appointment</a></p>' : ''),
            'body_text' => $waiting_actor_label . ' is waiting for the appointment. Join: ' . $join_link,
        ], true);
        if (is_wp_error($result)) {
            return ['success' => false, 'code' => 'email_failed', 'message' => $result->get_error_message()];
        }

        $next_count = $current_count + 1;
        $wpdb->update(Nevari_Helpers::table('appointments'), [
            $count_column => $next_count,
            $last_column => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => (int) $appointment->id], ['%d', '%s', '%s'], ['%d']);

        return [
            'success' => true,
            'disabled' => $next_count >= 3,
            'cooldown_seconds' => $next_count >= 3 ? 0 : 60,
            'message' => 'Notification sent.',
        ];
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
            'nevari_send_customer_appointment_reminder_2h',
            'nevari_send_customer_appointment_reminder_30m',
            'nevari_send_customer_appointment_reminder_5m',
            'nevari_send_customer_appointment_start',
            'nevari_send_doctor_appointment_reminder_24h',
            'nevari_send_doctor_appointment_reminder_1h',
            'nevari_send_doctor_appointment_reminder_2h',
            'nevari_send_doctor_appointment_reminder_30m',
            'nevari_send_doctor_appointment_reminder_5m',
            'nevari_send_doctor_appointment_start',
            'nevari_send_customer_appointment_ending_soon',
            'nevari_send_doctor_appointment_ending_soon',
            'nevari_send_customer_appointment_followup',
            'nevari_send_customer_appointment_thank_you',
            'nevari_process_appointment_meet_creation',
            'nevari_end_appointment_meet_conference',
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

        $appointment = $this->mark_appointment_paid_and_confirmed($appointment_id);
        if (!$appointment) {
            return;
        }
        $order->update_meta_data('_nevari_booking_status', 'confirmed');
        $order->save();

        if ((string) ($appointment->type ?? '') === 'video') {
            $this->queue_appointment_meet_creation($appointment_id);
            return;
        }

        $this->send_confirmed_appointment_notifications($appointment_id);
    }

    private function mark_appointment_paid_and_confirmed(int $appointment_id) {
        global $wpdb;

        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment) {
            Nevari_Audit::log('consultation', 'nevari', 'appointment.confirmation_trace', 'error', [
                'appointment_id' => $appointment_id,
                'object_type' => 'appointment',
                'object_id' => $appointment_id,
                'error_code' => 'appointment_not_found',
                'message' => 'Payment completion attempted for a missing appointment.',
            ]);
            return null;
        }

        $context_metadata = [
            'table' => $appointments_table,
            'before_status' => (string) ($appointment->status ?? ''),
            'before_payment_status' => (string) ($appointment->payment_status ?? ''),
            'before_reserved_until' => (string) ($appointment->reserved_until ?? ''),
        ];
        Nevari_Audit::log('consultation', 'nevari', 'appointment.confirmation_trace', 'success', [
            'appointment_id' => $appointment_id,
            'object_type' => 'appointment',
            'object_id' => $appointment_id,
            'message' => 'Attempting to mark appointment as paid and confirmed.',
            'metadata' => $context_metadata,
        ]);

        $current_status = sanitize_key((string) ($appointment->status ?? ''));
        if (in_array($current_status, ['cancelled', 'canceled'], true)) {
            $this->cancel_appointment_scheduled_actions($appointment_id, (string) ($appointment->start_at ?? ''));
            Nevari_Audit::log('consultation', 'nevari', 'appointment.confirmation_trace', 'success', [
                'appointment_id' => $appointment_id,
                'object_type' => 'appointment',
                'object_id' => $appointment_id,
                'message' => 'Skipped confirmation because appointment is already cancelled.',
                'metadata' => $context_metadata,
            ]);
            return null;
        }

        $now = Nevari_Helpers::now();
        $update_result = $wpdb->query($wpdb->prepare(
            "UPDATE {$appointments_table}
             SET status = 'confirmed',
                 payment_status = 'paid',
                 payment_required = 0,
                 reserved_until = NULL,
                 payment_completed_at = %s,
                 updated_at = %s
             WHERE id = %d
               AND status NOT IN ('cancelled', 'canceled')",
            $now,
            $now,
            $appointment_id
        ));

        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment) {
            Nevari_Audit::log('consultation', 'nevari', 'appointment.confirmation_trace', 'error', [
                'appointment_id' => $appointment_id,
                'object_type' => 'appointment',
                'object_id' => $appointment_id,
                'error_code' => 'post_update_read_failed',
                'message' => 'Appointment could not be re-read after payment confirmation update.',
                'metadata' => array_merge($context_metadata, [
                    'update_result' => $update_result,
                    'wpdb_last_error' => (string) $wpdb->last_error,
                ]),
            ]);
            return null;
        }

        $post_update_metadata = array_merge($context_metadata, [
            'update_result' => $update_result,
            'wpdb_last_error' => (string) $wpdb->last_error,
            'after_status' => (string) ($appointment->status ?? ''),
            'after_payment_status' => (string) ($appointment->payment_status ?? ''),
            'after_reserved_until' => (string) ($appointment->reserved_until ?? ''),
        ]);
        Nevari_Audit::log('consultation', 'nevari', 'appointment.confirmation_trace', 'success', [
            'appointment_id' => $appointment_id,
            'object_type' => 'appointment',
            'object_id' => $appointment_id,
            'message' => 'Completed payment confirmation update and reread appointment state.',
            'metadata' => $post_update_metadata,
        ]);

        $updated_status = sanitize_key((string) ($appointment->status ?? ''));
        if (in_array($updated_status, ['cancelled', 'canceled'], true)) {
            $this->cancel_appointment_scheduled_actions($appointment_id, (string) ($appointment->start_at ?? ''));
            Nevari_Audit::log('consultation', 'nevari', 'appointment.confirmation_trace', 'success', [
                'appointment_id' => $appointment_id,
                'object_type' => 'appointment',
                'object_id' => $appointment_id,
                'message' => 'Appointment remained cancelled after attempted payment confirmation.',
                'metadata' => $post_update_metadata,
            ]);
            return null;
        }

        return $appointment;
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
            $space_name = sanitize_text_field((string) ($result['space_name'] ?? $event_id));
            $wpdb->update($appointments_table, [
                'google_calendar_event_id' => $event_id ?: null,
                'google_meet_space_name' => $space_name ?: null,
                'google_meet_link' => $meet_link,
                'google_meet_status' => 'ready',
                'google_meet_retry_count' => 0,
                'google_meet_next_retry_at' => null,
                'google_meet_error' => null,
                'google_meet_created_at' => Nevari_Helpers::now(),
                'updated_at' => Nevari_Helpers::now(),
            ], ['id' => $appointment_id], ['%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s'], ['%d']);
            if ($order && is_object($order) && method_exists($order, 'update_meta_data')) {
                $order->update_meta_data('_nevari_google_calendar_event_id', $event_id);
                $order->update_meta_data('_nevari_google_meet_space_name', $space_name);
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
            'google_meet_status' => 'failed',
            'google_meet_error' => $error_message,
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s', '%s'], ['%d']);
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

    private function queue_appointment_meet_creation(int $appointment_id, int $delay_seconds = 0): void {
        global $wpdb;

        $appointment = $wpdb->get_row($wpdb->prepare(
            "SELECT id, google_meet_status FROM " . Nevari_Helpers::table('appointments') . " WHERE id = %d",
            $appointment_id
        ));
        if (!$appointment) {
            return;
        }

        $now = Nevari_Helpers::now();
        $status = $delay_seconds > 0 ? 'quota_wait' : 'pending';
        $next_retry_at = $delay_seconds > 0 ? gmdate('Y-m-d H:i:s', time() + $delay_seconds) : null;
        $wpdb->update(Nevari_Helpers::table('appointments'), [
            'google_meet_status' => $status,
            'google_meet_next_retry_at' => $next_retry_at,
            'updated_at' => $now,
        ], ['id' => $appointment_id], ['%s', '%s', '%s'], ['%d']);

        $timestamp = time() + max(0, $delay_seconds);
        if (function_exists('as_unschedule_all_actions')) {
            as_unschedule_all_actions('nevari_process_appointment_meet_creation', [$appointment_id], 'nevari');
        } else {
            wp_clear_scheduled_hook('nevari_process_appointment_meet_creation', [$appointment_id]);
        }
        if (function_exists('as_schedule_single_action')) {
            as_schedule_single_action($timestamp, 'nevari_process_appointment_meet_creation', [$appointment_id], 'nevari');
        } else {
            wp_schedule_single_event($timestamp, 'nevari_process_appointment_meet_creation', [$appointment_id]);
        }
    }

    public function process_appointment_meet_creation(int $appointment_id): void {
        global $wpdb;

        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment || $appointment->status !== 'confirmed' || $appointment->payment_status !== 'paid') {
            return;
        }

        $existing_link = Nevari_Helpers::appointment_meeting_link($appointment);
        if ($existing_link && !empty($appointment->google_calendar_event_id)) {
            $this->send_confirmed_appointment_notifications($appointment_id);
            return;
        }

        $wait_seconds = $this->appointment_meet_creation_wait_seconds();
        if ($wait_seconds > 0) {
            $this->queue_appointment_meet_creation($appointment_id, $wait_seconds);
            return;
        }

        $order = $appointment->order_id && function_exists('wc_get_order') ? wc_get_order((int) $appointment->order_id) : null;
        $doctor = get_user_by('id', (int) $appointment->doctor_user_id);
        $patient = get_user_by('id', (int) $appointment->patient_user_id);
        $result = $this->ensure_appointment_google_meet($appointment, $order, $doctor instanceof WP_User ? $doctor : null, $patient instanceof WP_User ? $patient : null);
        if (!empty($result['success'])) {
            $this->record_google_meet_creation();
            $this->send_confirmed_appointment_notifications($appointment_id);
            return;
        }

        $retry_count = max(0, (int) $appointment->google_meet_retry_count) + 1;
        $error_message = sanitize_textarea_field((string) ($result['message'] ?? 'Google Meet link could not be created.'));
        $is_quota_error = $this->is_google_meet_quota_error($result);
        if ($retry_count >= 8 || ($retry_count >= 5 && !$is_quota_error)) {
            $wpdb->update($appointments_table, [
                'google_meet_status' => 'failed',
                'google_meet_retry_count' => $retry_count,
                'google_meet_next_retry_at' => null,
                'google_meet_error' => $error_message,
                'updated_at' => Nevari_Helpers::now(),
            ], ['id' => $appointment_id], ['%s', '%d', '%s', '%s', '%s'], ['%d']);
            $this->notify_google_meet_failure($appointment, $error_message);
            return;
        }

        $backoff = $is_quota_error
            ? max(60, $this->appointment_meet_creation_wait_seconds(2))
            : min(900, 60 * $retry_count);

        $wpdb->update($appointments_table, [
            'google_meet_status' => $is_quota_error ? 'quota_wait' : 'pending',
            'google_meet_retry_count' => $retry_count,
            'google_meet_next_retry_at' => gmdate('Y-m-d H:i:s', time() + $backoff),
            'google_meet_error' => $error_message,
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%d', '%s', '%s', '%s'], ['%d']);

        $this->queue_appointment_meet_creation($appointment_id, $backoff);
    }

    private function send_confirmed_appointment_notifications(int $appointment_id): void {
        global $wpdb;

        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment || $appointment->status !== 'confirmed' || $appointment->payment_status !== 'paid') {
            return;
        }

        $order = $appointment->order_id && function_exists('wc_get_order') ? wc_get_order((int) $appointment->order_id) : null;
        $context = $this->appointment_email_context($appointment, $order);
        if (!empty($context['meet_link'])) {
            $this->schedule_end_appointment_meet_conference($appointment);
        }

        $this->send_guarded_appointment_email($appointment, 'customer_confirmation_sent_at', [
            'recipient_user_id' => (int) $appointment->patient_user_id,
            'recipient_email' => $context['patient'] instanceof WP_User ? $context['patient']->user_email : '',
            'related_object_type' => 'appointment',
            'related_object_id' => $appointment_id,
            'template_key' => 'appointment_customer_confirmation',
            'variables' => $context['variables'],
            'attachments' => [$context['ics']],
        ], false);

        if ($context['doctor'] instanceof WP_User && !empty($context['doctor']->user_email) && is_email($context['doctor']->user_email)) {
            $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
            $this->send_guarded_appointment_email($appointment, 'doctor_confirmation_sent_at', [
                'recipient_user_id' => (int) $context['doctor']->ID,
                'recipient_email' => $context['doctor']->user_email,
                'related_object_type' => 'appointment',
                'related_object_id' => $appointment_id,
                'template_key' => 'appointment_doctor_notification',
                'variables' => array_merge($context['variables'], [
                    'google_meet_link' => $context['doctor_join_link'],
                    'google_meet_link_html' => $context['doctor_join_link'] ? ['html' => '<a href="' . esc_url($context['doctor_join_link']) . '">Join Appointment</a>', 'text' => $context['doctor_join_link']] : '',
                    'join_link' => $context['doctor_join_link'],
                    'join_link_html' => $context['doctor_join_link'] ? ['html' => '<a href="' . esc_url($context['doctor_join_link']) . '">Join Appointment</a>', 'text' => $context['doctor_join_link']] : '',
                    'dashboard_link' => $context['variables']['doctor_dashboard_link'],
                ]),
                'attachments' => [$context['ics']],
            ], false);
        }

        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if ($appointment && !empty($context['meet_link'])) {
            $this->schedule_appointment_reminder($appointment_id, (string) $appointment->start_at);
        }
    }

    private function appointment_meet_creation_limit(): int {
        return max(1, (int) apply_filters('nevari_google_meet_creation_limit_per_ten_minutes', 8));
    }

    private function appointment_meet_creation_wait_seconds(int $minimum_seconds = 1): int {
        $timestamps = $this->recent_google_meet_creations();
        $limit = $this->appointment_meet_creation_limit();
        if (count($timestamps) < $limit) {
            return 0;
        }
        $oldest = min($timestamps);
        $release_at = $oldest + (10 * MINUTE_IN_SECONDS);
        return max($minimum_seconds, $release_at - time());
    }

    private function recent_google_meet_creations(): array {
        $stored = get_option('nevari_google_meet_creation_window', []);
        $values = is_array($stored) ? array_map('intval', $stored) : [];
        $cutoff = time() - (10 * MINUTE_IN_SECONDS);
        return array_values(array_filter($values, static fn($timestamp) => $timestamp >= $cutoff));
    }

    private function record_google_meet_creation(): void {
        $timestamps = $this->recent_google_meet_creations();
        $timestamps[] = time();
        update_option('nevari_google_meet_creation_window', array_values($timestamps), false);
    }

    private function is_google_meet_quota_error(array $result): bool {
        $status = (int) ($result['status'] ?? 0);
        $code = strtolower((string) ($result['code'] ?? ''));
        $message = strtolower((string) ($result['message'] ?? ''));
        return $status === 429
            || str_contains($code, 'quota')
            || str_contains($code, 'rate')
            || str_contains($message, 'quota')
            || str_contains($message, 'rate limit')
            || str_contains($message, 'resource exhausted');
    }

    private function schedule_end_appointment_meet_conference($appointment): void {
        $appointment_id = (int) ($appointment->id ?? 0);
        $timestamp = $this->appointment_effective_meet_end_timestamp($appointment);
        if (!$timestamp || $timestamp <= time()) {
            return;
        }
        if (function_exists('as_unschedule_all_actions')) {
            as_unschedule_all_actions('nevari_end_appointment_meet_conference', [$appointment_id], 'nevari');
        } else {
            wp_clear_scheduled_hook('nevari_end_appointment_meet_conference', [$appointment_id]);
        }
        if (function_exists('as_schedule_single_action')) {
            as_schedule_single_action($timestamp, 'nevari_end_appointment_meet_conference', [$appointment_id], 'nevari');
        } else {
            wp_schedule_single_event($timestamp, 'nevari_end_appointment_meet_conference', [$appointment_id]);
        }
    }

    public function end_appointment_meet_conference(int $appointment_id): void {
        global $wpdb;

        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment || empty($appointment->google_meet_space_name)) {
            return;
        }
        if (!empty($appointment->google_meet_ended_at)) {
            return;
        }

        $result = Nevari_Helpers::google_meet_end_active_conference((string) $appointment->google_meet_space_name);
        if (!empty($result['success'])) {
            $wpdb->update($appointments_table, [
                'google_meet_ended_at' => Nevari_Helpers::now(),
                'updated_at' => Nevari_Helpers::now(),
            ], ['id' => $appointment_id], ['%s', '%s'], ['%d']);
            Nevari_Audit::log('consultation', 'google', 'appointment.google_meet_ended', 'success', [
                'appointment_id' => $appointment_id,
                'message' => 'Google Meet conference ended at scheduled appointment end.',
            ]);
            if ($this->finalize_appointment_attendance($appointment_id)) {
                $this->schedule_single_appointment_action('nevari_send_customer_appointment_thank_you', time() + (5 * MINUTE_IN_SECONDS), $appointment_id, (string) $appointment->start_at);
            }
            return;
        }

        Nevari_Audit::log('consultation', 'google', 'appointment.google_meet_end_failed', 'error', [
            'appointment_id' => $appointment_id,
            'error_code' => sanitize_key((string) ($result['code'] ?? 'google_meet_end_failed')),
            'error_message' => sanitize_textarea_field((string) ($result['message'] ?? 'Google Meet active conference could not be ended.')),
        ]);
    }

    private function notify_google_meet_failure($appointment, string $error_message): void {
        $admin_email = get_option('admin_email');
        if (!$admin_email || !is_email($admin_email)) {
            return;
        }

        Nevari_Emails::queue_or_send([
            'recipient_email' => $admin_email,
            'subject' => 'Appointment Google Meet setup failed',
            'body_html' => '<p>Google Meet setup failed for appointment #' . (int) $appointment->id . '.</p><p>' . esc_html($error_message) . '</p>',
            'body_text' => 'Google Meet setup failed for appointment #' . (int) $appointment->id . '. ' . $error_message,
            'related_object_type' => 'appointment',
            'related_object_id' => (int) $appointment->id,
        ], false);
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
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT status, payment_status FROM {$appointments_table} WHERE id = %d", $appointment_id));
        $preserve_cancelled = $appointment && (string) $appointment->status === 'cancelled';
        $wpdb->update($appointments_table, [
            'payment_status' => $preserve_cancelled ? ((string) $order->get_meta('_nevari_paid_via_quota') === 'yes' ? 'paid' : 'cancelled') : 'failed',
            'status' => $preserve_cancelled ? 'cancelled' : 'failed',
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

    public function handle_custom_appointment_payment_complete(int $appointment_id): void {
        $appointment = $this->mark_appointment_paid_and_confirmed($appointment_id);
        if (!$appointment) {
            return;
        }

        if ((string) ($appointment->type ?? '') === 'video') {
            $this->queue_appointment_meet_creation($appointment_id);
            return;
        }

        $this->send_confirmed_appointment_notifications($appointment_id);
    }

    public function handle_custom_appointment_payment_failed(int $appointment_id, string $status = 'failed'): void {
        global $wpdb;

        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT status FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if (!$appointment) {
            return;
        }

        $final_status = (string) $status === 'cancelled' ? 'cancelled' : 'failed';
        $payment_status = $final_status === 'cancelled' ? 'cancelled' : 'failed';
        $wpdb->update($appointments_table, [
            'status' => $final_status,
            'payment_status' => $payment_status,
            'reserved_until' => null,
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => $appointment_id], ['%s', '%s', '%s', '%s'], ['%d']);
        $this->cancel_appointment_scheduled_actions($appointment_id);
    }

    public function send_custom_order_invoice_email(int $order_id): bool {
        if (!function_exists('wc_get_order')) {
            return false;
        }

        $order = wc_get_order($order_id);
        if (!$order) {
            return false;
        }

        $doctor_id = (int) $order->get_meta('_nevari_assigned_doctor_user_id');
        $doctor = $doctor_id ? get_user_by('id', $doctor_id) : null;
        $primary = $this->primary_order_product_context($order);
        $this->send_order_customer_email_once($order, $doctor instanceof WP_User ? $doctor : null, $primary);
        return (bool) $order->get_meta('_customer_email_sent');
    }

    public function filter_custom_email_only_orders($enabled, $order = null) {
        if (!$enabled || !$order || !is_object($order) || !method_exists($order, 'get_meta')) {
            return $enabled;
        }

        return $order->get_meta('_nevari_custom_email_only') ? false : $enabled;
    }

    public function schedule_appointment_reminder(int $appointment_id, string $start_at): void {
        $start_ts = strtotime($start_at . ' UTC');
        if (!$start_ts) {
            return;
        }
        $this->schedule_single_appointment_action('nevari_send_customer_appointment_reminder_24h', $start_ts - DAY_IN_SECONDS, $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_doctor_appointment_reminder_24h', $start_ts - DAY_IN_SECONDS, $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_customer_appointment_reminder_2h', $start_ts - (2 * HOUR_IN_SECONDS), $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_doctor_appointment_reminder_2h', $start_ts - (2 * HOUR_IN_SECONDS), $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_customer_appointment_reminder_30m', $start_ts - (30 * MINUTE_IN_SECONDS), $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_doctor_appointment_reminder_30m', $start_ts - (30 * MINUTE_IN_SECONDS), $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_customer_appointment_reminder_5m', $start_ts - (5 * MINUTE_IN_SECONDS), $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_doctor_appointment_reminder_5m', $start_ts - (5 * MINUTE_IN_SECONDS), $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_customer_appointment_start', $start_ts, $appointment_id, $start_at);
        $this->schedule_single_appointment_action('nevari_send_doctor_appointment_start', $start_ts, $appointment_id, $start_at);

        global $wpdb;
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT start_at, end_at, type FROM " . Nevari_Helpers::table('appointments') . " WHERE id = %d", $appointment_id));
        $effective_end_ts = $appointment ? $this->appointment_effective_meet_end_timestamp($appointment) : 0;
        if ($effective_end_ts) {
            $this->schedule_single_appointment_action('nevari_send_customer_appointment_ending_soon', $effective_end_ts - (2 * MINUTE_IN_SECONDS), $appointment_id, $start_at);
            $this->schedule_single_appointment_action('nevari_send_doctor_appointment_ending_soon', $effective_end_ts - (2 * MINUTE_IN_SECONDS), $appointment_id, $start_at);
            $this->schedule_single_appointment_action('nevari_send_customer_appointment_thank_you', $effective_end_ts + (5 * MINUTE_IN_SECONDS), $appointment_id, $start_at);
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

    public function send_customer_appointment_reminder_2h(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_reminder_2h_sent_at', 'appointment_customer_reminder_2h');
    }

    public function send_customer_appointment_reminder_30m(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_reminder_30m_sent_at', 'appointment_customer_reminder_30m');
    }

    public function send_customer_appointment_reminder_5m(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_reminder_5m_sent_at', 'appointment_customer_reminder_5m');
    }

    public function send_customer_appointment_start(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_appointment_start_sent_at', 'appointment_customer_start');
    }

    public function send_doctor_appointment_reminder_24h(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_reminder_24h_sent_at', 'appointment_doctor_reminder_24h');
    }

    public function send_doctor_appointment_reminder_1h(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_reminder_1h_sent_at', 'appointment_doctor_reminder_1h');
    }

    public function send_doctor_appointment_reminder_2h(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_reminder_2h_sent_at', 'appointment_doctor_reminder_2h');
    }

    public function send_doctor_appointment_reminder_30m(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_reminder_30m_sent_at', 'appointment_doctor_reminder_30m');
    }

    public function send_doctor_appointment_reminder_5m(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_reminder_5m_sent_at', 'appointment_doctor_reminder_5m');
    }

    public function send_doctor_appointment_start(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_appointment_start_sent_at', 'appointment_doctor_start');
    }

    public function send_customer_appointment_ending_soon(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_ending_soon_sent_at', 'appointment_customer_ending_soon');
    }

    public function send_doctor_appointment_ending_soon(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'doctor', 'doctor_ending_soon_sent_at', 'appointment_doctor_ending_soon');
    }

    public function send_customer_appointment_followup(int $appointment_id, string $scheduled_start_at = ''): void {
        $this->send_role_appointment_message($appointment_id, $scheduled_start_at, 'customer', 'customer_followup_sent_at', 'appointment_customer_followup');
    }

    public function maybe_send_appointment_doctor_note_email($appointment): void {
        if (!$appointment || empty($appointment->id) || (string) ($appointment->status ?? '') !== 'completed' || (string) ($appointment->payment_status ?? '') !== 'paid') {
            return;
        }
        $doctor_notes = trim(wp_strip_all_tags((string) ($appointment->doctor_notes ?? '')));
        if ($doctor_notes === '' || !empty($appointment->doctor_note_sent_at)) {
            return;
        }

        $order = !empty($appointment->order_id) && function_exists('wc_get_order') ? wc_get_order((int) $appointment->order_id) : null;
        $context = $this->appointment_email_context($appointment, $order);
        if (!$context['patient'] || empty($context['patient']->user_email) || !is_email($context['patient']->user_email)) {
            return;
        }

        $this->send_guarded_appointment_email($appointment, 'doctor_note_sent_at', [
            'recipient_user_id' => (int) $context['patient']->ID,
            'recipient_email' => $context['patient']->user_email,
            'related_object_type' => 'appointment',
            'related_object_id' => (int) $appointment->id,
            'template_key' => 'appointment_doctor_note',
            'variables' => array_merge($context['variables'], [
                'doctor_notes' => $doctor_notes,
            ]),
        ], false);
    }

    public function maybe_send_appointment_prescription_followup_email($prescription): void {
        if (!$prescription || empty($prescription->appointment_id)) {
            return;
        }

        global $wpdb;
        $appointment = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('appointments') . " WHERE id = %d",
            (int) $prescription->appointment_id
        ));
        if (!$appointment || (string) ($appointment->status ?? '') !== 'completed' || (string) ($appointment->payment_status ?? '') !== 'paid' || !empty($appointment->appointment_prescription_sent_at)) {
            return;
        }

        $order = !empty($appointment->order_id) && function_exists('wc_get_order') ? wc_get_order((int) $appointment->order_id) : null;
        $context = $this->appointment_email_context($appointment, $order);
        if (!$context['patient'] || empty($context['patient']->user_email) || !is_email($context['patient']->user_email)) {
            return;
        }

        $this->send_guarded_appointment_email($appointment, 'appointment_prescription_sent_at', [
            'recipient_user_id' => (int) $context['patient']->ID,
            'recipient_email' => $context['patient']->user_email,
            'related_object_type' => 'appointment',
            'related_object_id' => (int) $appointment->id,
            'template_key' => 'appointment_prescription_followup',
            'variables' => array_merge($context['variables'], [
                'prescription_number' => (string) ($prescription->prescription_number ?? ''),
            ]),
        ], false);
    }

    private function send_appointment_reservation_expired_email($appointment): void {
        if (!$appointment || empty($appointment->id) || !empty($appointment->reservation_expired_sent_at)) {
            return;
        }

        $patient = get_user_by('id', (int) ($appointment->patient_user_id ?? 0));
        if (!$patient || empty($patient->user_email) || !is_email($patient->user_email)) {
            return;
        }

        $order = !empty($appointment->order_id) && function_exists('wc_get_order') ? wc_get_order((int) $appointment->order_id) : null;
        $context = $this->appointment_email_context($appointment, $order);
        $this->send_guarded_appointment_email($appointment, 'reservation_expired_sent_at', [
            'recipient_user_id' => (int) $patient->ID,
            'recipient_email' => $patient->user_email,
            'related_object_type' => 'appointment',
            'related_object_id' => (int) $appointment->id,
            'template_key' => 'appointment_reservation_expired',
            'variables' => $context['variables'],
        ], false);
    }

    private function send_role_appointment_message(int $appointment_id, string $scheduled_start_at, string $recipient_role, string $sent_column, string $template_key): void {
        global $wpdb;
        $appointments_table = Nevari_Helpers::table('appointments');
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        $allowed_statuses = $sent_column === 'customer_followup_sent_at' ? ['confirmed', 'checked_in', 'completed'] : ['confirmed', 'checked_in'];
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
                'google_meet_link' => $recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'],
                'google_meet_link_html' => ($recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'])
                    ? ['html' => '<a href="' . esc_url($recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link']) . '">Join Appointment</a>', 'text' => ($recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'])]
                    : '',
                'join_link' => $recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'],
                'join_link_html' => ($recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'])
                    ? ['html' => '<a href="' . esc_url($recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link']) . '">Join Appointment</a>', 'text' => ($recipient_role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'])]
                    : '',
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
        $wpdb->update(Nevari_Helpers::table('appointment_invoices'), [
            'status' => 'failed',
            'updated_at' => Nevari_Helpers::now(),
        ], ['appointment_id' => $appointment_id], ['%s', '%s'], ['%d']);
        $this->cancel_appointment_scheduled_actions($appointment_id, (string) ($appointment->start_at ?? ''));
        $appointment = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$appointments_table} WHERE id = %d", $appointment_id));
        if ($appointment) {
            $this->send_appointment_reservation_expired_email($appointment);
        }
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
        Nevari_Audit::log('consultation', 'nevari', 'appointment.cancel_email_trace', 'success', [
            'appointment_id' => (int) $appointment->id,
            'object_type' => 'appointment',
            'object_id' => (int) $appointment->id,
            'order_id' => isset($appointment->order_id) ? (int) $appointment->order_id : 0,
            'message' => 'Dispatching appointment cancellation emails.',
            'metadata' => [
                'status' => (string) ($appointment->status ?? ''),
                'payment_status' => (string) ($appointment->payment_status ?? ''),
                'start_at' => (string) ($appointment->start_at ?? ''),
                'cancelled_at' => (string) ($appointment->cancelled_at ?? ''),
            ],
        ]);
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
                    'google_meet_link' => $role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'],
                    'google_meet_link_html' => ($role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'])
                        ? ['html' => '<a href="' . esc_url($role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link']) . '">Join Appointment</a>', 'text' => ($role === 'doctor' ? $context['doctor_join_link'] : $context['patient_join_link'])]
                        : '',
                    'recipient_name' => $recipient->display_name ?: 'there',
                    'dashboard_link' => $role === 'doctor' ? $context['variables']['doctor_dashboard_link'] : $context['variables']['dashboard_link'],
                ]),
            ], false);
        }
        if ($appointment->status === 'confirmed' && $appointment->payment_status === 'paid') {
            $this->schedule_appointment_reminder((int) $appointment->id, (string) $appointment->start_at);
            if (!empty($context['meet_link'])) {
                $this->schedule_end_appointment_meet_conference($appointment);
            }
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
            'appointment_customer_reminder_2h',
            'appointment_customer_reminder_30m',
            'appointment_customer_reminder_5m',
            'appointment_customer_start',
            'appointment_doctor_reminder_24h',
            'appointment_doctor_reminder_1h',
            'appointment_doctor_reminder_2h',
            'appointment_doctor_reminder_30m',
            'appointment_doctor_reminder_5m',
            'appointment_doctor_start',
            'appointment_customer_ending_soon',
            'appointment_doctor_ending_soon',
            'appointment_customer_followup',
            'appointment_waiting_notification',
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

        $this->emit_rest_response_headers();

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

        if ($response instanceof WP_HTTP_Response) {
            foreach ($this->rest_response_headers() as $header_name => $header_value) {
                $response->header($header_name, $header_value);
            }

            $origin = $this->allowed_rest_origin();
            if ($origin) {
                foreach ($this->rest_cors_headers($origin) as $header_name => $header_value) {
                    $response->header($header_name, $header_value);
                }
            }
        }

        return $response;
    }

    public function send_rest_cors_headers($served, $result, $request, $server) {
        if (!$request instanceof WP_REST_Request || !$this->is_nevari_rest_route($request->get_route())) {
            return $served;
        }

        $this->emit_rest_response_headers();

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

        if (class_exists('Nevari_Helpers')) {
            $shared_frontend_base_url = Nevari_Helpers::shared_frontend_base_url();
            if ($shared_frontend_base_url !== '') {
                $allowed[] = $shared_frontend_base_url;
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

        if (in_array($origin, $allowed, true) || $this->is_default_local_development_origin($origin)) {
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

    private function emit_rest_response_headers(): void {
        foreach ($this->rest_response_headers() as $header_name => $header_value) {
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

    private function is_default_local_development_origin(string $origin): bool {
        if ($origin === 'null') {
            return true;
        }

        $parts = wp_parse_url($origin);
        if (!is_array($parts) || empty($parts['scheme']) || empty($parts['host'])) {
            return false;
        }

        $scheme = strtolower((string) $parts['scheme']);
        $host = strtolower(trim((string) $parts['host'], '[]'));

        if (!in_array($scheme, ['http', 'https'], true)) {
            return false;
        }

        return in_array($host, ['localhost', '127.0.0.1', '::1'], true);
    }

    private function table_exists(string $table): bool {
        global $wpdb;

        $resolved = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
        return is_string($resolved) && $resolved === $table;
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

    private function rest_response_headers(): array {
        return [
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
            'Expires' => '0',
            'Vary' => 'Origin, Authorization, X-Nevari-Frontend-Type, X-Nevari-Frontend-Origin',
        ];
    }
}
