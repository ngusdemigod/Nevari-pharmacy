<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Activator {
    public static function activate(): void {
        self::create_tables();
        self::create_roles_and_caps();
        self::seed_defaults();
        flush_rewrite_rules();
    }

    public static function deactivate(): void {
        flush_rewrite_rules();
    }

    private static function create_tables(): void {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();

        $doctor_settings = Nevari_Helpers::table('doctor_settings');
        $patient_doctor_links = Nevari_Helpers::table('patient_doctor_links');
        $appointments = Nevari_Helpers::table('appointments');
        $prescriptions = Nevari_Helpers::table('prescriptions');
        $prescription_items = Nevari_Helpers::table('prescription_items');
        $assignment_history = Nevari_Helpers::table('prescription_assignment_history');
        $email_templates = Nevari_Helpers::table('email_templates');
        $email_logs = Nevari_Helpers::table('email_logs');
        $audit_logs = Nevari_Helpers::table('audit_logs');
        $refresh_tokens = Nevari_Helpers::table('refresh_tokens');

        dbDelta("CREATE TABLE {$doctor_settings} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            doctor_user_id BIGINT UNSIGNED NOT NULL,
            profile_post_id BIGINT UNSIGNED NULL,
            license_number VARCHAR(100) NULL,
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
            status VARCHAR(30) NOT NULL DEFAULT 'requested',
            start_at DATETIME NOT NULL,
            end_at DATETIME NOT NULL,
            timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
            reason TEXT NULL,
            symptoms LONGTEXT NULL,
            intake_form LONGTEXT NULL,
            doctor_notes LONGTEXT NULL,
            cancellation_reason TEXT NULL,
            cancelled_by BIGINT UNSIGNED NULL,
            completed_at DATETIME NULL,
            created_by BIGINT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY  (id),
            KEY patient_start (patient_user_id, start_at),
            KEY doctor_start (doctor_user_id, start_at),
            KEY status_start (status, start_at),
            KEY order_id (order_id)
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
                'subject' => 'Your consultation request was received',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your consultation request with {{doctor_name}} has been received.</p>',
                'body_text' => 'Hello {{patient_name}}, your consultation request with {{doctor_name}} has been received.',
                'variables' => ['patient_name', 'doctor_name', 'appointment_start'],
            ],
            [
                'template_key' => 'prescription_assigned',
                'name' => 'Prescription Assigned',
                'subject' => 'Your prescription is ready',
                'body_html' => '<p>Hello {{patient_name}},</p><p>Your prescription {{prescription_number}} has been assigned by {{doctor_name}}.</p>',
                'body_text' => 'Hello {{patient_name}}, your prescription {{prescription_number}} has been assigned by {{doctor_name}}.',
                'variables' => ['patient_name', 'doctor_name', 'prescription_number'],
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
