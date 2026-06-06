<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Activator {
    public static function activate(): void {
        self::create_tables();
        self::create_roles_and_caps();
        self::seed_defaults();
        if (class_exists('Nevari_Subscriptions')) {
            Nevari_Subscriptions::ensure_system_plans();
        }
        update_option('nevari_pharmacy_db_version', NEVARI_PHARMACY_VERSION, false);
        flush_rewrite_rules();
    }

    public static function deactivate(): void {
        flush_rewrite_rules();
    }

    public static function maybe_upgrade(): void {
        $installed = (string) get_option('nevari_pharmacy_db_version', '');
        if ($installed === NEVARI_PHARMACY_VERSION) {
            return;
        }

        self::create_tables();
        self::create_roles_and_caps();
        self::seed_defaults();
        if (class_exists('Nevari_Subscriptions')) {
            Nevari_Subscriptions::ensure_system_plans();
        }
        update_option('nevari_pharmacy_db_version', NEVARI_PHARMACY_VERSION, false);
    }

    public static function ensure_tables(): void {
        self::create_tables();
    }

    private static function create_tables(): void {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();

        $doctor_settings = Nevari_Helpers::table('doctor_settings');
        $round_robin_tracker = Nevari_Helpers::table('round_robin_tracker');
        $patient_doctor_links = Nevari_Helpers::table('patient_doctor_links');
        $appointments = Nevari_Helpers::table('appointments');
        $prescriptions = Nevari_Helpers::table('prescriptions');
        $prescription_items = Nevari_Helpers::table('prescription_items');
        $assignment_history = Nevari_Helpers::table('prescription_assignment_history');
        $email_templates = Nevari_Helpers::table('email_templates');
        $email_logs = Nevari_Helpers::table('email_logs');
        $audit_logs = Nevari_Helpers::table('audit_logs');
        $refresh_tokens = Nevari_Helpers::table('refresh_tokens');
        $login_challenges = Nevari_Helpers::table('login_challenges');
        $pairing_sessions = Nevari_Helpers::table('pairing_sessions');
        $frontend_connections = Nevari_Helpers::table('frontend_connections');
        $subscription_plans = Nevari_Helpers::table('subscription_plans');
        $subscriptions = Nevari_Helpers::table('subscriptions');
        $subscription_payments = Nevari_Helpers::table('subscription_payments');
        $paystack_webhook_events = Nevari_Helpers::table('paystack_webhook_events');
        $mtm_requests = Nevari_Helpers::table('mtm_requests');

        dbDelta("CREATE TABLE {$doctor_settings} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            doctor_user_id BIGINT UNSIGNED NOT NULL,
            profile_post_id BIGINT UNSIGNED NULL,
            license_number VARCHAR(100) NULL,
            position VARCHAR(30) NOT NULL DEFAULT 'specialist',
            is_available TINYINT(1) NOT NULL DEFAULT 1,
            max_workload_per_week INT UNSIGNED NOT NULL DEFAULT 40,
            default_appointment_duration INT UNSIGNED NOT NULL DEFAULT 30,
            timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
            accepts_new_patients TINYINT(1) NOT NULL DEFAULT 1,
            telehealth_enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY doctor_user_id (doctor_user_id),
            KEY profile_post_id (profile_post_id)
        ) {$charset};");

        dbDelta("CREATE TABLE {$round_robin_tracker} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            doctor_level VARCHAR(30) NOT NULL,
            last_doctor_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY doctor_level (doctor_level)
        ) {$charset};");

        dbDelta("CREATE TABLE {$patient_doctor_links} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            patient_user_id BIGINT UNSIGNED NOT NULL,
            doctor_user_id BIGINT UNSIGNED NOT NULL,
            source VARCHAR(50) NOT NULL DEFAULT 'appointment',
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            first_linked_at DATETIME NOT NULL,
            last_interaction_at DATETIME NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY patient_doctor (patient_user_id, doctor_user_id),
            KEY doctor_status (doctor_user_id, status),
            KEY patient_status (patient_user_id, status)
        ) {$charset};");

        dbDelta("CREATE TABLE {$appointments} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            patient_user_id BIGINT UNSIGNED NOT NULL,
            doctor_user_id BIGINT UNSIGNED NOT NULL,
            order_id BIGINT UNSIGNED NULL,
            type VARCHAR(30) NOT NULL,
            title VARCHAR(191) NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'requested',
            payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
            payment_required TINYINT(1) NOT NULL DEFAULT 1,
            start_at DATETIME NOT NULL,
            end_at DATETIME NOT NULL,
            duration_minutes INT UNSIGNED NULL,
            timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
            reason TEXT NULL,
            symptoms LONGTEXT NULL,
            intake_form LONGTEXT NULL,
            doctor_notes LONGTEXT NULL,
            cancellation_reason TEXT NULL,
            cancelled_by BIGINT UNSIGNED NULL,
            google_calendar_event_id VARCHAR(255) NULL,
            google_meet_space_name VARCHAR(255) NULL,
            google_meet_link VARCHAR(255) NULL,
            google_meet_status VARCHAR(30) NOT NULL DEFAULT 'pending',
            google_meet_retry_count INT UNSIGNED NOT NULL DEFAULT 0,
            google_meet_next_retry_at DATETIME NULL,
            google_meet_error TEXT NULL,
            google_meet_created_at DATETIME NULL,
            payment_completed_at DATETIME NULL,
            completed_at DATETIME NULL,
            reserved_until DATETIME NULL,
            reminder_sent_at DATETIME NULL,
            customer_confirmation_sent_at DATETIME NULL,
            doctor_confirmation_sent_at DATETIME NULL,
            customer_reminder_24h_sent_at DATETIME NULL,
            customer_reminder_1h_sent_at DATETIME NULL,
            doctor_reminder_24h_sent_at DATETIME NULL,
            doctor_reminder_1h_sent_at DATETIME NULL,
            customer_followup_sent_at DATETIME NULL,
            google_meet_ready_notified_at DATETIME NULL,
            cancelled_at DATETIME NULL,
            rescheduled_at DATETIME NULL,
            created_by BIGINT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY patient_start (patient_user_id, start_at),
            KEY doctor_start (doctor_user_id, start_at),
            KEY status_start (status, start_at),
            KEY order_id (order_id),
            KEY payment_status (payment_status),
            KEY reserved_until (reserved_until),
            KEY google_calendar_event_id (google_calendar_event_id),
            KEY google_meet_space_name (google_meet_space_name),
            KEY google_meet_status (google_meet_status),
            KEY google_meet_next_retry_at (google_meet_next_retry_at),
            KEY reminder_sent_at (reminder_sent_at),
            KEY customer_reminder_24h_sent_at (customer_reminder_24h_sent_at),
            KEY customer_reminder_1h_sent_at (customer_reminder_1h_sent_at),
            KEY doctor_reminder_24h_sent_at (doctor_reminder_24h_sent_at),
            KEY doctor_reminder_1h_sent_at (doctor_reminder_1h_sent_at),
            KEY customer_followup_sent_at (customer_followup_sent_at)
        ) {$charset};");

        $appointment_reviews = Nevari_Helpers::table('appointment_reviews');
        dbDelta("CREATE TABLE {$appointment_reviews} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            appointment_id BIGINT UNSIGNED NOT NULL,
            doctor_user_id BIGINT UNSIGNED NOT NULL,
            patient_user_id BIGINT UNSIGNED NOT NULL,
            rating TINYINT UNSIGNED NOT NULL,
            review_text TEXT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'approved',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY appointment_id (appointment_id),
            KEY doctor_status (doctor_user_id, status),
            KEY patient_status (patient_user_id, status),
            KEY rating (rating)
        ) {$charset};");

        dbDelta("CREATE TABLE {$prescriptions} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            prescription_number VARCHAR(64) NOT NULL,
            patient_user_id BIGINT UNSIGNED NOT NULL,
            doctor_user_id BIGINT UNSIGNED NOT NULL,
            appointment_id BIGINT UNSIGNED NULL,
            order_id BIGINT UNSIGNED NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'draft',
            diagnosis TEXT NULL,
            instructions LONGTEXT NULL,
            valid_from DATETIME NOT NULL,
            valid_until DATETIME NULL,
            issued_at DATETIME NULL,
            assigned_at DATETIME NULL,
            fulfilled_at DATETIME NULL,
            cancelled_at DATETIME NULL,
            cancelled_reason TEXT NULL,
            created_by BIGINT UNSIGNED NOT NULL,
            updated_by BIGINT UNSIGNED NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY prescription_number (prescription_number),
            KEY patient_status (patient_user_id, status),
            KEY doctor_status (doctor_user_id, status),
            KEY appointment_id (appointment_id),
            KEY order_id (order_id),
            KEY valid_until (valid_until)
        ) {$charset};");

        dbDelta("CREATE TABLE {$prescription_items} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            prescription_id BIGINT UNSIGNED NOT NULL,
            product_id BIGINT UNSIGNED NOT NULL,
            variation_id BIGINT UNSIGNED NULL,
            dosage VARCHAR(255) NULL,
            quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
            unit VARCHAR(50) NULL,
            frequency VARCHAR(255) NULL,
            duration_days INT UNSIGNED NULL,
            refills_allowed INT UNSIGNED NOT NULL DEFAULT 0,
            refills_used INT UNSIGNED NOT NULL DEFAULT 0,
            substitution_allowed TINYINT(1) NOT NULL DEFAULT 0,
            notes TEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY prescription_id (prescription_id),
            KEY product_id (product_id),
            KEY variation_id (variation_id)
        ) {$charset};");

        dbDelta("CREATE TABLE {$assignment_history} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            prescription_id BIGINT UNSIGNED NOT NULL,
            patient_user_id BIGINT UNSIGNED NOT NULL,
            doctor_user_id BIGINT UNSIGNED NOT NULL,
            action VARCHAR(50) NOT NULL,
            previous_status VARCHAR(30) NULL,
            new_status VARCHAR(30) NOT NULL,
            actor_user_id BIGINT UNSIGNED NOT NULL,
            note TEXT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY prescription_id (prescription_id),
            KEY patient_user_id (patient_user_id),
            KEY doctor_user_id (doctor_user_id),
            KEY action_created (action, created_at)
        ) {$charset};");

        dbDelta("CREATE TABLE {$email_templates} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            template_key VARCHAR(100) NOT NULL,
            name VARCHAR(255) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            body_html LONGTEXT NOT NULL,
            body_text LONGTEXT NULL,
            variables LONGTEXT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            version INT UNSIGNED NOT NULL DEFAULT 1,
            created_by BIGINT UNSIGNED NOT NULL,
            updated_by BIGINT UNSIGNED NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY template_key_version (template_key, version),
            KEY template_key_status (template_key, status)
        ) {$charset};");

        dbDelta("CREATE TABLE {$email_logs} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            template_key VARCHAR(100) NULL,
            template_version INT UNSIGNED NULL,
            recipient_email VARCHAR(255) NOT NULL,
            recipient_user_id BIGINT UNSIGNED NULL,
            sender_email VARCHAR(255) NULL,
            subject VARCHAR(255) NOT NULL,
            body_preview TEXT NULL,
            related_object_type VARCHAR(50) NULL,
            related_object_id BIGINT UNSIGNED NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'queued',
            provider VARCHAR(50) NULL,
            provider_message_id VARCHAR(255) NULL,
            error_code VARCHAR(100) NULL,
            error_message TEXT NULL,
            sent_by BIGINT UNSIGNED NULL,
            queued_at DATETIME NULL,
            sent_at DATETIME NULL,
            failed_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY recipient_user_id (recipient_user_id),
            KEY recipient_email (recipient_email),
            KEY template_key (template_key),
            KEY related_object (related_object_type, related_object_id),
            KEY status_created (status, created_at)
        ) {$charset};");

        dbDelta("CREATE TABLE {$audit_logs} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            event_uuid CHAR(36) NOT NULL,
            category VARCHAR(30) NOT NULL,
            source VARCHAR(50) NOT NULL,
            action VARCHAR(100) NOT NULL,
            status VARCHAR(20) NOT NULL,
            severity VARCHAR(20) NOT NULL DEFAULT 'info',
            actor_user_id BIGINT UNSIGNED NULL,
            actor_role VARCHAR(50) NULL,
            actor_ip VARCHAR(45) NULL,
            user_agent TEXT NULL,
            object_type VARCHAR(50) NULL,
            object_id BIGINT UNSIGNED NULL,
            related_user_id BIGINT UNSIGNED NULL,
            order_id BIGINT UNSIGNED NULL,
            product_id BIGINT UNSIGNED NULL,
            appointment_id BIGINT UNSIGNED NULL,
            prescription_id BIGINT UNSIGNED NULL,
            email_log_id BIGINT UNSIGNED NULL,
            request_id VARCHAR(100) NULL,
            message TEXT NULL,
            error_code VARCHAR(100) NULL,
            error_message TEXT NULL,
            metadata LONGTEXT NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY event_uuid (event_uuid),
            KEY category_status_created (category, status, created_at),
            KEY source_action_created (source, action, created_at),
            KEY actor_created (actor_user_id, created_at),
            KEY object_lookup (object_type, object_id),
            KEY order_id (order_id),
            KEY appointment_id (appointment_id),
            KEY prescription_id (prescription_id),
            KEY email_log_id (email_log_id)
        ) {$charset};");

        dbDelta("CREATE TABLE {$refresh_tokens} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            token_hash CHAR(64) NOT NULL,
            user_agent TEXT NULL,
            ip_address VARCHAR(45) NULL,
            expires_at DATETIME NOT NULL,
            revoked_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY token_hash (token_hash),
            KEY user_active (user_id, revoked_at, expires_at)
        ) {$charset};");

        dbDelta("CREATE TABLE {$login_challenges} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            challenge_uuid CHAR(36) NOT NULL,
            user_id BIGINT UNSIGNED NOT NULL,
            frontend_type VARCHAR(40) NOT NULL,
            frontend_origin VARCHAR(255) NOT NULL,
            code_hash CHAR(64) NOT NULL,
            attempts INT UNSIGNED NOT NULL DEFAULT 0,
            expires_at DATETIME NOT NULL,
            consumed_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY challenge_uuid (challenge_uuid),
            KEY user_active (user_id, consumed_at, expires_at),
            KEY frontend_type (frontend_type)
        ) {$charset};");

        dbDelta("CREATE TABLE {$pairing_sessions} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            session_uuid CHAR(36) NOT NULL,
            frontend_type VARCHAR(40) NOT NULL,
            code_hash CHAR(64) NOT NULL,
            code_hint VARCHAR(16) NULL,
            requested_origin VARCHAR(255) NULL,
            verified_origin VARCHAR(255) NULL,
            generated_by BIGINT UNSIGNED NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            expires_at DATETIME NOT NULL,
            verified_at DATETIME NULL,
            used_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY session_uuid (session_uuid),
            UNIQUE KEY code_hash (code_hash),
            KEY frontend_type_status (frontend_type, status),
            KEY expires_at (expires_at)
        ) {$charset};");

        dbDelta("CREATE TABLE {$frontend_connections} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            frontend_type VARCHAR(40) NOT NULL,
            frontend_origin VARCHAR(255) NOT NULL,
            frontend_url VARCHAR(255) NOT NULL,
            trust_status VARCHAR(30) NOT NULL DEFAULT 'trusted',
            paired_by BIGINT UNSIGNED NOT NULL,
            pairing_session_id BIGINT UNSIGNED NULL,
            paired_at DATETIME NOT NULL,
            last_seen_at DATETIME NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY frontend_type_origin (frontend_type, frontend_origin),
            KEY trust_status (trust_status),
            KEY pairing_session_id (pairing_session_id)
        ) {$charset};");

        dbDelta("CREATE TABLE {$subscription_plans} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            plan_key VARCHAR(100) NOT NULL,
            plan_code VARCHAR(191) NULL,
            name VARCHAR(191) NOT NULL,
            amount_kobo INT UNSIGNED NOT NULL DEFAULT 0,
            currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
            interval_unit VARCHAR(30) NOT NULL DEFAULT 'monthly',
            status VARCHAR(30) NOT NULL DEFAULT 'active',
            metadata LONGTEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY plan_key (plan_key),
            KEY plan_code (plan_code)
        ) {$charset};");

        dbDelta("CREATE TABLE {$subscriptions} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            plan_key VARCHAR(100) NOT NULL,
            plan_code VARCHAR(191) NULL,
            reference VARCHAR(191) NULL,
            subscription_code VARCHAR(191) NULL,
            customer_code VARCHAR(191) NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'none',
            amount_kobo INT UNSIGNED NOT NULL DEFAULT 0,
            currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
            renewal_date DATETIME NULL,
            starts_at DATETIME NULL,
            ends_at DATETIME NULL,
            cancelled_at DATETIME NULL,
            subscription_version BIGINT UNSIGNED NOT NULL DEFAULT 1,
            metadata LONGTEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY user_status (user_id, status),
            KEY user_status_access (user_id, status, ends_at),
            KEY user_plan (user_id, plan_key),
            KEY reference (reference),
            KEY subscription_code (subscription_code),
            KEY customer_code (customer_code),
            KEY plan_code (plan_code)
        ) {$charset};");

        dbDelta("CREATE TABLE {$subscription_payments} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            user_id BIGINT UNSIGNED NOT NULL,
            subscription_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            reference VARCHAR(191) NOT NULL,
            gateway VARCHAR(30) NOT NULL DEFAULT 'paystack',
            amount_kobo INT UNSIGNED NOT NULL DEFAULT 0,
            currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
            status VARCHAR(30) NOT NULL DEFAULT 'pending',
            paystack_subscription_code VARCHAR(191) NULL,
            verified_at DATETIME NULL,
            payload LONGTEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            UNIQUE KEY reference (reference),
            KEY user_status (user_id, status),
            KEY subscription_id (subscription_id)
        ) {$charset};");

        dbDelta("CREATE TABLE {$paystack_webhook_events} (
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

        dbDelta("CREATE TABLE {$mtm_requests} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            customer_user_id BIGINT UNSIGNED NOT NULL,
            assigned_pharmacist_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            reviewed_by_pharmacist_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            assigned_doctor_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            reviewed_by_doctor_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            status VARCHAR(40) NOT NULL DEFAULT 'submitted',
            patient_data LONGTEXT NULL,
            emergency_contact_data LONGTEXT NULL,
            medical_history_data LONGTEXT NULL,
            medication_profile_data LONGTEXT NULL,
            adherence_assessment_data LONGTEXT NULL,
            additional_information_data LONGTEXT NULL,
            attachments_json LONGTEXT NULL,
            action_plan_json LONGTEXT NULL,
            attached_products_json LONGTEXT NULL,
            consultation_notes_json LONGTEXT NULL,
            follow_up_json LONGTEXT NULL,
            outcome_tracking_json LONGTEXT NULL,
            order_id BIGINT UNSIGNED NULL,
            scheduled_at DATETIME NULL,
            duration_minutes INT UNSIGNED NOT NULL DEFAULT 30,
            timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
            consultation_method VARCHAR(80) NOT NULL DEFAULT 'Google Meet',
            google_calendar_event_id VARCHAR(255) NULL,
            google_meet_space_name VARCHAR(255) NULL,
            google_meet_code VARCHAR(64) NULL,
            google_meet_link VARCHAR(255) NULL,
            google_meet_error TEXT NULL,
            google_meet_created_at DATETIME NULL,
            google_meet_ended_at DATETIME NULL,
            follow_up_at DATETIME NULL,
            completed_at DATETIME NULL,
            assigned_at DATETIME NULL,
            reviewed_at DATETIME NULL,
            approved_at DATETIME NULL,
            created_by BIGINT UNSIGNED NOT NULL,
            updated_by BIGINT UNSIGNED NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY customer_status (customer_user_id, status),
            KEY pharmacist_status (assigned_pharmacist_user_id, status),
            KEY doctor_status (assigned_doctor_user_id, status),
            KEY scheduled_at (scheduled_at),
            KEY order_id (order_id),
            KEY updated_at (updated_at)
        ) {$charset};");
    }

    private static function create_roles_and_caps(): void {
        add_role('patient', __('Patient', 'nevari-pharmacy-core'), [
            'read' => true,
            'nevari_read_own_profile' => true,
            'nevari_read_own_orders' => true,
            'nevari_read_own_prescriptions' => true,
            'nevari_create_appointment' => true,
        ]);

        add_role('doctor', __('Doctor', 'nevari-pharmacy-core'), [
            'read' => true,
            'upload_files' => true,
            'nevari_read_assigned_patients' => true,
            'nevari_read_assigned_appointments' => true,
            'nevari_update_assigned_appointments' => true,
            'nevari_create_prescription' => true,
            'nevari_update_own_prescription' => true,
        ]);

        $pharmacist_caps = [
            'read' => true,
            'upload_files' => true,
            'nevari_view_mtm_requests' => true,
            'nevari_review_mtm_requests' => true,
            'nevari_schedule_mtm_appointments' => true,
            'nevari_create_medication_action_plan' => true,
            'nevari_attach_pharmacy_products' => true,
            'nevari_create_mtm_product_order' => true,
            'nevari_schedule_follow_up' => true,
            'nevari_track_mtm_outcomes' => true,
            'nevari_complete_mtm_case' => true,
        ];

        add_role('pharmacist', __('Pharmacist', 'nevari-pharmacy-core'), $pharmacist_caps);
        $pharmacist_role = get_role('pharmacist');
        if ($pharmacist_role) {
            foreach ($pharmacist_caps as $cap => $grant) {
                if ($grant) {
                    $pharmacist_role->add_cap($cap);
                }
            }
        }

        add_role('store_admin', __('Store Admin', 'nevari-pharmacy-core'), [
            'read' => true,
            'upload_files' => true,
            'manage_woocommerce' => true,
            'edit_products' => true,
            'edit_shop_orders' => true,
            'nevari_manage_store' => true,
            'nevari_manage_products' => true,
            'nevari_manage_doctors' => true,
            'nevari_manage_appointments' => true,
            'nevari_manage_prescriptions' => true,
            'nevari_manage_email_templates' => true,
            'nevari_read_email_logs' => true,
            'nevari_read_audit_logs' => true,
        ]);

        $caps = [
            'nevari_manage_store',
            'nevari_manage_products',
            'nevari_manage_doctors',
            'nevari_manage_appointments',
            'nevari_manage_prescriptions',
            'nevari_manage_email_templates',
            'nevari_read_email_logs',
            'nevari_read_audit_logs',
            'nevari_read_assigned_patients',
            'nevari_read_assigned_appointments',
            'nevari_update_assigned_appointments',
            'nevari_create_prescription',
            'nevari_update_own_prescription',
            'nevari_create_appointment',
            'nevari_read_own_prescriptions',
            'nevari_read_own_orders',
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

        foreach (['administrator', 'shop_manager'] as $role_name) {
            $role = get_role($role_name);
            if (!$role) {
                continue;
            }
            foreach ($caps as $cap) {
                $role->add_cap($cap);
            }
        }
    }

    private static function seed_defaults(): void {
        global $wpdb;
        $now = Nevari_Helpers::now();
        $table = Nevari_Helpers::table('email_templates');
        $created_by = get_current_user_id() ?: 0;

        $templates = [
            [
                'template_key' => 'appointment_requested',
                'name' => 'Appointment Requested',
                'subject' => 'Your appointment with {{doctor_name}} is pending payment',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your appointment with {{doctor_name}} has been created for {{appointment_start}}.</p><p>{{google_meet_link_html}}</p><p>{{payment_link_html}}</p><p>You can also view this booking inside your Nevari dashboard.</p>',
                'body_text' => 'Hello {{patient_name}}, your appointment with {{doctor_name}} has been created for {{appointment_start}}. Google Meet: {{google_meet_link}} Pay here: {{payment_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_start', 'payment_link', 'payment_link_html', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_payment_receipt',
                'name' => 'Appointment Payment Receipt',
                'subject' => 'Payment received for your appointment with {{doctor_name}}',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Payment has been received for your appointment with {{doctor_name}} on {{appointment_start}}.</p><p>Amount paid: {{appointment_amount}}</p><p>{{google_meet_link_html}}</p><p>{{calendar_link_html}}</p>',
                'body_text' => 'Hello {{patient_name}}, payment has been received for your appointment with {{doctor_name}} on {{appointment_start}}. Amount paid: {{appointment_amount}}. Google Meet: {{google_meet_link}} Add to calendar: {{calendar_link}}',
                'variables' => ['patient_name', 'doctor_name', 'appointment_start', 'appointment_amount', 'calendar_link', 'calendar_link_html', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_doctor_notification',
                'name' => 'Doctor Appointment Notification',
                'subject' => 'New appointment booked with {{patient_name}}',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>{{patient_name}} booked an appointment for {{appointment_start}}.</p><p>Status: {{appointment_status}}</p><p>{{google_meet_link_html}}</p><p>{{calendar_link_html}}</p>',
                'body_text' => 'Hello {{doctor_name}}, {{patient_name}} booked an appointment for {{appointment_start}}. Status: {{appointment_status}}. Google Meet: {{google_meet_link}} Add to calendar: {{calendar_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_start', 'appointment_status', 'calendar_link', 'calendar_link_html', 'google_meet_link', 'google_meet_link_html'],
            ],
            [
                'template_key' => 'appointment_admin_notification',
                'name' => 'Admin Appointment Notification',
                'subject' => 'Appointment booked: {{patient_name}} with {{doctor_name}}',
                'body_html' => '<p>Hello Admin,</p><p>{{patient_name}} booked an appointment with {{doctor_name}} for {{appointment_start}}.</p><p>Status: {{appointment_status}}</p><p>{{calendar_link_html}}</p>',
                'body_text' => 'Appointment booked: {{patient_name}} with {{doctor_name}} for {{appointment_start}}. Status: {{appointment_status}}. Calendar: {{calendar_link}}',
                'variables' => ['doctor_name', 'patient_name', 'appointment_start', 'appointment_status', 'calendar_link', 'calendar_link_html'],
            ],
            [
                'template_key' => 'appointment_reminder',
                'name' => 'Appointment Reminder',
                'subject' => 'Reminder: your appointment starts in 15 minutes',
                'body_html' => '<p>Hello {{recipient_name}},</p><p>This is a reminder that the appointment between {{patient_name}} and {{doctor_name}} starts at {{appointment_start}}.</p><p>{{calendar_link_html}}</p>',
                'body_text' => 'Reminder: the appointment between {{patient_name}} and {{doctor_name}} starts at {{appointment_start}}. Calendar: {{calendar_link}}',
                'variables' => ['recipient_name', 'patient_name', 'doctor_name', 'appointment_start', 'calendar_link', 'calendar_link_html'],
            ],
            [
                'template_key' => 'prescription_assigned',
                'name' => 'Prescription Assigned',
                'subject' => 'Your prescription is ready',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your prescription {{prescription_number}} has been assigned by {{doctor_name}}.</p>',
                'body_text' => 'Hello {{patient_name}}, your prescription {{prescription_number}} has been assigned by {{doctor_name}}.',
                'variables' => ['patient_name', 'doctor_name', 'prescription_number'],
            ],
            [
                'template_key' => 'doctor_order_assigned',
                'name' => 'Doctor Order Assigned',
                'subject' => 'A pharmacy order needs your review',
                'body_html' => '<p>Hello {{doctor_name}},</p><p>Order {{order_number}} has been assigned to you for {{patient_name}}.</p><p>Product/service: {{product_service_assigned}}</p><p>You can open your dashboard to create a prescription or schedule an appointment.</p>',
                'body_text' => 'Hello {{doctor_name}}, order {{order_number}} has been assigned to you for {{patient_name}}. Product/service: {{product_service_assigned}}. Open your dashboard to create a prescription or schedule an appointment.',
                'variables' => ['doctor_name', 'patient_name', 'order_number', 'product_service_assigned', 'customer_email', 'customer_phone'],
            ],
            [
                'template_key' => 'order-invoice-email',
                'name' => 'Order Invoice Email',
                'subject' => 'Invoice for order {{order_number}}',
                'body_html' => '<p>Hello {{customer_firstname}},</p><p>Your invoice for order <strong>#{{order_number}}</strong> is attached.</p><p>{{payment_link_html}}</p><p>Total due: {{invoice_total}}</p><p>You can review this order in your Nevari dashboard.</p>',
                'body_text' => 'Hello {{customer_firstname}}, your invoice for order #{{order_number}} is attached. Pay here: {{payment_link}} Total due: {{invoice_total}}.',
                'variables' => ['customer_name', 'customer_firstname', 'customer_lastname', 'order_id', 'order_number', 'order_total', 'invoice_total', 'payment_link', 'payment_link_html', 'document_type', 'document_title', 'site_name', 'support_email'],
            ],
            [
                'template_key' => 'order-receipt-email',
                'name' => 'Order Receipt Email',
                'subject' => 'Receipt for order {{order_number}}',
                'body_html' => '<p>Hello {{customer_firstname}},</p><p>Your receipt for order <strong>#{{order_number}}</strong> is attached.</p><p>Total paid: {{invoice_total}}</p><p>Thank you for shopping with {{site_name}}.</p>',
                'body_text' => 'Hello {{customer_firstname}}, your receipt for order #{{order_number}} is attached. Total paid: {{invoice_total}}. Thank you for shopping with {{site_name}}.',
                'variables' => ['customer_name', 'customer_firstname', 'customer_lastname', 'order_id', 'order_number', 'order_total', 'invoice_total', 'document_type', 'document_title', 'site_name', 'support_email'],
            ],
            [
                'template_key' => 'login_verification_code',
                'name' => 'Login Verification Code',
                'subject' => 'Your Nevari verification code',
                'body_html' => '<p>Hello {{display_name}},</p><p>Your verification code is <strong>{{verification_code}}</strong>.</p><p>This code expires in {{expires_minutes}} minutes.</p>',
                'body_text' => 'Hello {{display_name}}, your verification code is {{verification_code}}. This code expires in {{expires_minutes}} minutes.',
                'variables' => ['display_name', 'verification_code', 'expires_minutes'],
            ],
        ];

        foreach ($templates as $template) {
            $exists = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE template_key = %s", $template['template_key']));
            if ($exists) {
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
}
