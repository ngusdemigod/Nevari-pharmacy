<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Care_Journeys {
    private const MIGRATION_HOOK = 'nevari_migrate_legacy_care_requests';
    private const PROVIDER_MIGRATION_HOOK = 'nevari_migrate_legacy_care_providers';
    private const BATCH_SIZE = 50;

    public static function init(): void {
        self::ensure_schema();
        add_action(self::MIGRATION_HOOK, [__CLASS__, 'migrate_legacy_batch']);
        add_action(self::PROVIDER_MIGRATION_HOOK, [__CLASS__, 'migrate_legacy_provider_assignments']);
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        if (!get_option('nevari_care_legacy_migration_complete') && !wp_next_scheduled(self::MIGRATION_HOOK)) {
            wp_schedule_single_event(time() + 30, self::MIGRATION_HOOK);
        }
        if (!get_option('nevari_care_provider_migration_complete') && !wp_next_scheduled(self::PROVIDER_MIGRATION_HOOK)) {
            wp_schedule_single_event(time() + 45, self::PROVIDER_MIGRATION_HOOK);
        }
    }

    public static function ensure_schema(): void {
        if (get_option('nevari_care_schema_version') === NEVARI_PHARMACY_VERSION) {
            return;
        }
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $charset = $wpdb->get_charset_collate();
        $iv = self::table('iv_therapy_requests');
        $nurse = self::table('nurse_requests');
        $events = self::table('care_lifecycle_events');
        $providers = self::table('care_providers');
        $quota = self::table('consultation_quota_ledger');
        $documents = self::table('care_documents');
        $notifications = self::table('care_notification_dispatches');
        dbDelta("CREATE TABLE {$iv} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            legacy_key VARCHAR(64) NULL,
            reference VARCHAR(32) NOT NULL,
            customer_user_id BIGINT UNSIGNED NOT NULL,
            assigned_provider_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            assigned_clinician_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            reviewed_by_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'submitted',
            urgency VARCHAR(20) NULL,
            physician_approval_required TINYINT(1) NOT NULL DEFAULT 0,
            eligible TINYINT(1) NULL,
            scheduled_at DATETIME NULL,
            completed_at DATETIME NULL,
            patient_safe_message VARCHAR(255) NULL,
            payload_json LONGTEXT NULL,
            clinical_json LONGTEXT NULL,
            completion_json LONGTEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id), UNIQUE KEY legacy_key (legacy_key), UNIQUE KEY reference (reference),
            KEY customer_status (customer_user_id,status), KEY clinician_status (assigned_clinician_user_id,status),
            KEY status_updated (status,updated_at), KEY scheduled_at (scheduled_at)
        ) {$charset};");
        dbDelta("CREATE TABLE {$nurse} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            legacy_key VARCHAR(64) NULL,
            reference VARCHAR(32) NOT NULL,
            customer_user_id BIGINT UNSIGNED NOT NULL,
            assigned_provider_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            assigned_nurse_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            coordinator_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'submitted',
            urgency VARCHAR(20) NULL,
            service_area_valid TINYINT(1) NULL,
            scheduled_at DATETIME NULL,
            started_at DATETIME NULL,
            completed_at DATETIME NULL,
            patient_safe_message VARCHAR(255) NULL,
            action_required TINYINT(1) NOT NULL DEFAULT 1,
            action_reason VARCHAR(80) NULL,
            payload_json LONGTEXT NULL,
            clinical_json LONGTEXT NULL,
            completion_json LONGTEXT NULL,
            documents_json LONGTEXT NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id), UNIQUE KEY legacy_key (legacy_key), UNIQUE KEY reference (reference),
            KEY customer_status (customer_user_id,status), KEY nurse_status (assigned_nurse_user_id,status),
            KEY action_status (action_required,status),
            KEY status_updated (status,updated_at), KEY scheduled_at (scheduled_at)
        ) {$charset};");
        dbDelta("CREATE TABLE {$events} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, service_type VARCHAR(24) NOT NULL,
            resource_id BIGINT UNSIGNED NOT NULL, event_type VARCHAR(40) NOT NULL,
            actor_user_id BIGINT UNSIGNED NOT NULL DEFAULT 0, safe_summary VARCHAR(255) NOT NULL,
            metadata_json TEXT NULL, idempotency_key VARCHAR(100) NULL, created_at DATETIME NOT NULL,
            PRIMARY KEY (id), UNIQUE KEY idempotency_key (idempotency_key),
            KEY resource_timeline (service_type,resource_id,id), KEY event_created (event_type,created_at)
        ) {$charset};");
        dbDelta("CREATE TABLE {$providers} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, reference VARCHAR(32) NOT NULL,
            display_name VARCHAR(160) NOT NULL, phone VARCHAR(40) NULL, email VARCHAR(190) NULL,
            service_areas_json TEXT NULL, care_types_json TEXT NULL, availability_json LONGTEXT NULL,
            is_active TINYINT(1) NOT NULL DEFAULT 1, created_by BIGINT UNSIGNED NOT NULL,
            created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
            PRIMARY KEY (id), UNIQUE KEY reference (reference), KEY active_name (is_active,display_name)
        ) {$charset};");
        dbDelta("CREATE TABLE {$quota} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, customer_user_id BIGINT UNSIGNED NOT NULL,
            service_type VARCHAR(24) NOT NULL, resource_id BIGINT UNSIGNED NOT NULL,
            reservation_key VARCHAR(80) NOT NULL, period_start DATE NOT NULL,
            state VARCHAR(16) NOT NULL DEFAULT 'reserved', created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL,
            PRIMARY KEY (id), UNIQUE KEY reservation_key (reservation_key),
            KEY customer_period_state (customer_user_id,period_start,state)
        ) {$charset};");
        dbDelta("CREATE TABLE {$documents} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            service_type VARCHAR(24) NOT NULL,
            resource_id BIGINT UNSIGNED NOT NULL,
            patient_user_id BIGINT UNSIGNED NOT NULL,
            original_name VARCHAR(190) NOT NULL,
            stored_name VARCHAR(190) NOT NULL,
            detected_mime VARCHAR(80) NOT NULL,
            file_size BIGINT UNSIGNED NOT NULL,
            sha256 VARCHAR(64) NOT NULL,
            uploaded_by BIGINT UNSIGNED NOT NULL,
            replaced_document_id BIGINT UNSIGNED NULL,
            removed_at DATETIME NULL,
            removed_by BIGINT UNSIGNED NULL,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            KEY resource_active (service_type,resource_id,removed_at),
            KEY patient_active (patient_user_id,removed_at),
            KEY sha256 (sha256)
        ) {$charset};");
        dbDelta("CREATE TABLE {$notifications} (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            dispatch_key VARCHAR(64) NOT NULL,
            service_type VARCHAR(24) NOT NULL,
            resource_id BIGINT UNSIGNED NOT NULL,
            lifecycle_event VARCHAR(40) NOT NULL,
            recipient_hash VARCHAR(64) NOT NULL,
            template_key VARCHAR(80) NOT NULL,
            email_log_id BIGINT UNSIGNED NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'claimed',
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY dispatch_key (dispatch_key),
            KEY resource_event (service_type,resource_id,lifecycle_event),
            KEY status_updated (status,updated_at)
        ) {$charset};");
        self::ensure_mtm_columns();
        update_option('nevari_care_schema_version', NEVARI_PHARMACY_VERSION, false);
    }

    private static function ensure_mtm_columns(): void {
        global $wpdb;
        $table = self::table('mtm_requests');
        $columns = [
            'payment_state' => "VARCHAR(24) NOT NULL DEFAULT 'pending'",
            'payment_order_id' => 'BIGINT UNSIGNED NULL',
            'quota_reservation_id' => 'BIGINT UNSIGNED NULL',
            'slot_state' => "VARCHAR(24) NOT NULL DEFAULT 'unreserved'",
            'reserved_start_at' => 'DATETIME NULL',
            'reserved_end_at' => 'DATETIME NULL',
            'clinical_decision' => 'VARCHAR(24) NULL',
            'rejection_reason' => 'VARCHAR(500) NULL',
            'refund_state' => "VARCHAR(24) NOT NULL DEFAULT 'not_required'",
            'refund_reference' => 'VARCHAR(100) NULL',
            'refund_completed_at' => 'DATETIME NULL',
        ];
        foreach ($columns as $name => $definition) {
            if (!$wpdb->get_var($wpdb->prepare("SHOW COLUMNS FROM {$table} LIKE %s", $name))) {
                $wpdb->query("ALTER TABLE {$table} ADD {$name} {$definition}");
            }
        }
    }
    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/staff/care-requests/(?P<service>iv-therapy|nurse)', [[
            'methods' => WP_REST_Server::READABLE, 'callback' => [__CLASS__, 'care_queue'],
            'permission_callback' => [__CLASS__, 'staff_service_permission'],
        ]]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/staff/care-requests/(?P<service>iv-therapy|nurse)/(?P<id>\d+)', [[
            'methods' => WP_REST_Server::READABLE, 'callback' => [__CLASS__, 'care_show'],
            'permission_callback' => [__CLASS__, 'care_resource_permission'],
        ], [
            'methods' => WP_REST_Server::EDITABLE, 'callback' => [__CLASS__, 'care_transition'],
            'permission_callback' => [__CLASS__, 'care_resource_permission'],
        ]]);
    }

    public static function staff_service_permission(WP_REST_Request $request): bool {
        if (!Nevari_Auth::api_session_required()) {
            return false;
        }
        $user_id = Nevari_Auth::api_session_user_id();
        return Nevari_Helpers::is_store_admin($user_id)
            || ($request['service'] === 'iv-therapy' && Nevari_Helpers::is_pharmacist($user_id));
    }

    public static function care_resource_permission(WP_REST_Request $request): bool {
        if (!self::staff_service_permission($request)) {
            return false;
        }
        global $wpdb;
        $table = self::request_table((string) $request['service']);
        if (!$table) {
            return false;
        }
        $assignee_column = (string) $request['service'] === 'iv-therapy' ? 'assigned_clinician_user_id' : 'assigned_nurse_user_id';
        $row = $wpdb->get_row($wpdb->prepare("SELECT id,{$assignee_column} AS assignee_user_id FROM {$table} WHERE id=%d", absint($request['id'])), ARRAY_A);
        if (!$row) {
            return false;
        }
        $user_id = Nevari_Auth::api_session_user_id();
        return Nevari_Helpers::is_store_admin($user_id)
            || ((string) $request['service'] === 'iv-therapy' && (int) $row['assignee_user_id'] === $user_id);
    }

    public static function care_queue(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $table = self::request_table((string) $request['service']);
        $page = max(1, absint($request['page']));
        $per_page = min(100, max(1, absint($request['per_page']) ?: 20));
        $offset = ($page - 1) * $per_page;
        $service = (string) $request['service'];
        $status = sanitize_key((string) $request['status']);
        $states = array_keys(self::transitions((string) $request['service']));
        if ($status && !in_array($status, $states, true)) {
            return Nevari_Helpers::error('invalid_status', 'Invalid status filter.', 422);
        }
        $clauses = [];
        $where_args = [];
        if ($status) { $clauses[] = 'status=%s'; $where_args[] = $status; }
        $viewer_id = Nevari_Auth::api_session_user_id();
        if ($service === 'iv-therapy' && Nevari_Helpers::is_pharmacist($viewer_id) && !Nevari_Helpers::is_store_admin($viewer_id)) {
            $clauses[] = 'assigned_clinician_user_id=%d'; $where_args[] = $viewer_id;
        }
        $where = $clauses ? ' WHERE ' . $wpdb->prepare(implode(' AND ', $clauses), $where_args) : '';
        $assignee_select = $service === 'nurse'
            ? 'assigned_nurse_user_id,0 AS assigned_clinician_user_id,action_required,action_reason'
            : '0 AS assigned_nurse_user_id,assigned_clinician_user_id,0 AS action_required,NULL AS action_reason';
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT id,reference,customer_user_id,{$assignee_select},status,scheduled_at,patient_safe_message,created_at,updated_at FROM {$table}{$where} ORDER BY updated_at DESC LIMIT %d OFFSET %d",
            $per_page, $offset
        ), ARRAY_A);
        $total = (int) $wpdb->get_var("SELECT COUNT(*) FROM {$table}{$where}");
        return Nevari_Helpers::success([
            'items' => array_map(static function ($row) use ($service) { return self::normalize_care_row($row, $service, false); }, $rows ?: []),
            'pagination' => ['page'=>$page,'per_page'=>$per_page,'total'=>$total,'pages'=>(int)ceil($total/$per_page)],
        ]);
    }

    public static function care_show(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $service = (string) $request['service'];
        $table = self::request_table($service);
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id=%d", absint($request['id'])), ARRAY_A);
        return Nevari_Helpers::success(['request' => self::normalize_care_row($row, $service, true)]);
    }

    public static function care_transition(WP_REST_Request $request): WP_REST_Response {
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $allowed = ['status','urgency','eligible','physician_approval_required','nurse_user_id','clinician_user_id','scheduled_at','patient_safe_message','clinical','completion'];
        if (array_diff(array_keys($body), $allowed)) {
            return Nevari_Helpers::error('unexpected_fields', 'Unexpected request fields were supplied.', 422);
        }
        global $wpdb;
        $service = (string) $request['service'];
        $table = self::request_table($service);
        $id = absint($request['id']);
        $wpdb->query('START TRANSACTION');
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id=%d FOR UPDATE", $id), ARRAY_A);
        $next = sanitize_key((string) ($body['status'] ?? ''));
        if (!$row || !in_array($next, self::transitions($service)[$row['status']] ?? [], true)) {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('invalid_transition', 'That status transition is not allowed.', 409);
        }
        $assignee_id = $service === 'nurse'
            ? absint($body['nurse_user_id'] ?? $row['assigned_nurse_user_id'])
            : absint($body['clinician_user_id'] ?? $row['assigned_clinician_user_id']);
        $actor_id = Nevari_Auth::api_session_user_id();
        $is_admin = Nevari_Helpers::is_store_admin($actor_id);
        if ($service === 'iv-therapy' && in_array($next, ['approved','declined','treatment_completed','completed'], true)
            && (!Nevari_Helpers::is_pharmacist($actor_id) || (int) $row['assigned_clinician_user_id'] !== $actor_id)) {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('clinical_ownership_required', 'Only the assigned pharmacist can record this clinical decision.', 403);
        }
        if ($service === 'iv-therapy' && !$is_admin && $assignee_id !== (int) $row['assigned_clinician_user_id']) {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('assignee_change_forbidden', 'Only Store Admin can change the assigned clinician.', 403);
        }
        if ($service === 'nurse' && $assignee_id && !Nevari_User_Governance::is_assignable_nurse($assignee_id)) {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('invalid_nurse', 'Select an approved nurse.', 422);
        }
        if ($service === 'iv-therapy' && $assignee_id && !Nevari_Helpers::is_pharmacist($assignee_id)) {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('invalid_clinician', 'Select an active pharmacist.', 422);
        }
        $scheduled_at = sanitize_text_field((string) ($body['scheduled_at'] ?? ''));
        if ($next === 'scheduled' && (!$assignee_id || !self::valid_future_datetime($scheduled_at))) {
            $wpdb->query('ROLLBACK');
            return Nevari_Helpers::error('invalid_schedule', 'An active provider and future date are required.', 422);
        }
        $update = [
            'status'=>$next,
            'patient_safe_message'=>substr(sanitize_text_field((string)($body['patient_safe_message']??'')),0,255),
            'updated_at'=>current_time('mysql'),
        ];
        if ($service === 'nurse') {
            $update['assigned_nurse_user_id'] = $assignee_id;
            $update['coordinator_user_id'] = Nevari_Auth::api_session_user_id();
            $update['action_required'] = in_array($next, ['completed','declined','cancelled'], true) ? 0 : 1;
            $update['action_reason'] = $next === 'nurse_assigned' ? 'schedule_required' : null;
        } else {
            $update['assigned_clinician_user_id'] = $assignee_id;
            $update['reviewed_by_user_id'] = Nevari_Auth::api_session_user_id();
        }
        if ($scheduled_at) $update['scheduled_at'] = get_date_from_gmt(gmdate('Y-m-d H:i:s', strtotime($scheduled_at)));
        if (isset($body['urgency'])) $update['urgency'] = in_array($body['urgency'], ['routine','priority','urgent'], true) ? $body['urgency'] : 'routine';
        if ($service === 'iv-therapy') {
            if (array_key_exists('eligible',$body)) $update['eligible'] = rest_sanitize_boolean($body['eligible']) ? 1 : 0;
            if (array_key_exists('physician_approval_required',$body)) $update['physician_approval_required'] = rest_sanitize_boolean($body['physician_approval_required']) ? 1 : 0;
        }
        if (isset($body['clinical'])) $update['clinical_json'] = wp_json_encode(self::sanitize_clinical_map($body['clinical']));
        if (isset($body['completion'])) $update['completion_json'] = wp_json_encode(self::sanitize_clinical_map($body['completion']));
        if ($next === 'in_progress') $update['started_at'] = current_time('mysql');
        if (in_array($next, ['treatment_completed','completed'], true)) $update['completed_at'] = current_time('mysql');
        $wpdb->update($table, $update, ['id'=>$id]);
        self::event(str_replace('-', '_', $service), $id, 'status_changed', 'Status changed to ' . ucwords(str_replace('_',' ',$next)) . '.', Nevari_Auth::api_session_user_id(), ['from_status'=>$row['status'],'to_status'=>$next,'assignee_user_id'=>$assignee_id,'scheduled_at'=>$scheduled_at]);
        $wpdb->query('COMMIT');
        self::queue_status_email($service, $id, $next);
        $fresh = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id=%d", $id), ARRAY_A);
        return Nevari_Helpers::success(['request'=>self::normalize_care_row($fresh,$service,true)]);
    }
    public static function admin_permission(): bool {
        return Nevari_Auth::api_session_required() && Nevari_Helpers::is_store_admin(Nevari_Auth::api_session_user_id());
    }

    public static function event(string $service, int $resource_id, string $type, string $summary, int $actor_id = 0, array $metadata = [], string $key = ''): void {
        global $wpdb;
        $safe = array_intersect_key($metadata, array_flip(['from_status','to_status','assignee_user_id','scheduled_at','notification_key']));
        $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . self::table('care_lifecycle_events') .
            ' (service_type,resource_id,event_type,actor_user_id,safe_summary,metadata_json,idempotency_key,created_at) VALUES (%s,%d,%s,%d,%s,%s,%s,%s)',
            sanitize_key($service),$resource_id,sanitize_key($type),$actor_id ?: Nevari_Auth::api_session_user_id(),substr(sanitize_text_field($summary),0,255),wp_json_encode($safe),$key ?: null,current_time('mysql')));
    }

    public static function timeline(string $service, int $resource_id): array {
        global $wpdb;
        $rows=$wpdb->get_results($wpdb->prepare('SELECT event_type,safe_summary,created_at FROM '.self::table('care_lifecycle_events').' WHERE service_type=%s AND resource_id=%d ORDER BY id LIMIT 200',sanitize_key($service),$resource_id),ARRAY_A);
        return array_map(static function($r){return ['type'=>$r['event_type'],'message'=>$r['safe_summary'],'occurred_at'=>$r['created_at']];},$rows?:[]);
    }

    public static function reserve_quota(int $user_id, string $service, int $resource_id) {
        global $wpdb; $table=self::table('consultation_quota_ledger'); $period=gmdate('Y-m-01'); $key=sanitize_key($service).':'.$resource_id;
        $wpdb->query('START TRANSACTION');
        $wpdb->query($wpdb->prepare('SELECT ID FROM '.$wpdb->users.' WHERE ID=%d FOR UPDATE',$user_id));
        $existing=$wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE reservation_key=%s",$key),ARRAY_A);
        if($existing){$wpdb->query('COMMIT');return $existing;}
        $quota = Nevari_Subscriptions::consultation_quota_snapshot_for_user($user_id, true);
        if (empty($quota['is_paid'])) {
            $wpdb->query('ROLLBACK');
            return new WP_Error('payment_required', 'Payment is required for this MTM consultation.');
        }
        if ((int) ($quota['free_consultations_remaining'] ?? 0) < 1) {
            $wpdb->query('ROLLBACK');
            return new WP_Error('quota_exhausted', 'Your five monthly consultations have been used or reserved.');
        }
        $ok=$wpdb->insert($table,['customer_user_id'=>$user_id,'service_type'=>sanitize_key($service),'resource_id'=>$resource_id,'reservation_key'=>$key,'period_start'=>$period,'state'=>'reserved','created_at'=>current_time('mysql'),'updated_at'=>current_time('mysql')]);
        if(!$ok){$wpdb->query('ROLLBACK');return new WP_Error('quota_reservation_failed','The consultation credit could not be reserved.');}
        $id=(int)$wpdb->insert_id;$wpdb->query('COMMIT');return $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE id=%d",$id),ARRAY_A);
    }

    public static function set_quota_state(string $service,int $resource_id,string $state): bool {
        if(!in_array($state,['consumed','released'],true))return false;
        global $wpdb; return false!==$wpdb->update(self::table('consultation_quota_ledger'),['state'=>$state,'updated_at'=>current_time('mysql')],['reservation_key'=>sanitize_key($service).':'.$resource_id,'state'=>'reserved']);
    }

    public static function migrate_legacy_batch(): void {
        if(get_option('nevari_care_legacy_migration_complete'))return;
        global $wpdb;$cursor=absint(get_option('nevari_care_legacy_migration_cursor',0));
        $ids=$wpdb->get_col($wpdb->prepare('SELECT ID FROM '.$wpdb->users.' WHERE ID>%d ORDER BY ID LIMIT %d',$cursor,self::BATCH_SIZE));
        foreach($ids as $id){self::migrate_meta((int)$id,'nevari_iv_therapy_requests','iv_therapy_requests');self::migrate_meta((int)$id,'nevari_nurse_requests','nurse_requests');update_option('nevari_care_legacy_migration_cursor',(int)$id,false);}
        if(count($ids)<self::BATCH_SIZE){update_option('nevari_care_legacy_migration_complete',current_time('mysql'),false);return;}
        wp_schedule_single_event(time()+10,self::MIGRATION_HOOK);
    }

    public static function migrate_legacy_provider_assignments(): void {
        global $wpdb;
        $requests = self::table('nurse_requests');
        $providers = self::table('care_providers');
        $rows = $wpdb->get_results(
            "SELECT r.id,r.assigned_provider_id,p.email FROM {$requests} r LEFT JOIN {$providers} p ON p.id=r.assigned_provider_id WHERE r.assigned_provider_id>0 AND r.assigned_nurse_user_id=0 AND (r.action_reason IS NULL OR r.action_reason<>'legacy_assignment_unmatched') ORDER BY r.id ASC LIMIT 100",
            ARRAY_A
        ) ?: [];
        foreach ($rows as $row) {
            $user = !empty($row['email']) ? get_user_by('email', sanitize_email($row['email'])) : false;
            if ($user && Nevari_User_Governance::is_assignable_nurse((int) $user->ID)) {
                $wpdb->update($requests, [
                    'assigned_nurse_user_id' => (int) $user->ID,
                    'updated_at' => current_time('mysql'),
                ], ['id' => (int) $row['id']]);
            } else {
                $wpdb->update($requests, [
                    'action_required' => 1,
                    'action_reason' => 'legacy_assignment_unmatched',
                    'updated_at' => current_time('mysql'),
                ], ['id' => (int) $row['id']]);
            }
        }
        if (count($rows) < 100) {
            update_option('nevari_care_provider_migration_complete', current_time('mysql'), false);
            return;
        }
        wp_schedule_single_event(time() + 10, self::PROVIDER_MIGRATION_HOOK);
    }

    private static function migrate_meta(int $user_id,string $meta,string $target): void {
        global $wpdb;$items=get_user_meta($user_id,$meta,true);if(!is_array($items))return;
        foreach($items as $item){if(!is_array($item)||empty($item['id']))continue;$status=sanitize_key((string)($item['status']??'submitted'));if($status==='pending_review')$status='submitted';$created=sanitize_text_field((string)($item['createdAt']??current_time('mysql')));
            $wpdb->query($wpdb->prepare('INSERT IGNORE INTO '.self::table($target).' (legacy_key,reference,customer_user_id,status,payload_json,created_at,updated_at) VALUES (%s,%s,%d,%s,%s,%s,%s)',sanitize_text_field($item['id']),sanitize_text_field((string)($item['requestReference']??strtoupper(substr($target,0,3)).'-'.$user_id)), $user_id,$status,wp_json_encode($item),$created,sanitize_text_field((string)($item['updatedAt']??$created))));}
    }

    private static function request_table(string $service): string {
        if ($service === 'iv-therapy') return self::table('iv_therapy_requests');
        if ($service === 'nurse') return self::table('nurse_requests');
        return '';
    }

    private static function transitions(string $service): array {
        if ($service === 'iv-therapy') {
            return [
                'submitted'=>['under_review','cancelled'], 'under_review'=>['approved','declined','cancelled'],
                'approved'=>['scheduled','cancelled'], 'scheduled'=>['treatment_completed','cancelled'],
                'treatment_completed'=>['completed'], 'completed'=>[], 'declined'=>[], 'cancelled'=>[],
            ];
        }
        return [
            'submitted'=>['under_review','cancelled'], 'under_review'=>['nurse_assigned','declined','cancelled'],
            'nurse_assigned'=>['scheduled','cancelled'], 'scheduled'=>['in_progress','cancelled'],
            'in_progress'=>['completed','cancelled'], 'completed'=>[], 'declined'=>[], 'cancelled'=>[],
        ];
    }

    private static function valid_future_datetime(string $value): bool {
        $timestamp = strtotime($value);
        return $timestamp && $timestamp > time() + 300 && $timestamp < time() + YEAR_IN_SECONDS;
    }

    private static function sanitize_clinical_map($value): array {
        if (!is_array($value) || count($value) > 30) return [];
        $clean = [];
        foreach ($value as $key => $item) {
            $safe_key = sanitize_key((string) $key);
            if (!$safe_key) continue;
            if (is_array($item)) {
                $clean[$safe_key] = self::text_list($item, 30, 500);
            } else {
                $clean[$safe_key] = substr(sanitize_textarea_field((string) $item), 0, 5000);
            }
        }
        return $clean;
    }

    private static function normalize_care_row(array $row, string $service, bool $detail): array {
        $customer = get_user_by('id', (int) $row['customer_user_id']);
        $result = [
            'id'=>(int)$row['id'], 'reference'=>$row['reference'], 'service_type'=>$service,
            'status'=>$row['status'], 'status_label'=>ucwords(str_replace('_',' ',$row['status'])),
            'patient_safe_message'=>$row['patient_safe_message'] ?: '', 'created_at'=>$row['created_at'], 'updated_at'=>$row['updated_at'],
            'scheduled_at'=>$row['scheduled_at'] ?: null,
            'assignee'=>self::assignee_summary($row, $service),
            'action_required'=>!empty($row['action_required']),
            'action_reason'=>$row['action_reason'] ?? null,
            'patient'=>['id'=>(int)$row['customer_user_id'],'name'=>$customer ? $customer->display_name : 'Patient'],
            'timeline'=>self::timeline(str_replace('-','_',$service),(int)$row['id']),
            'next_action'=>self::transitions($service)[$row['status']] ?? [],
        ];
        if ($detail) {
            $result['request_details'] = json_decode((string)($row['payload_json']??''),true) ?: [];
            $result['clinical'] = json_decode((string)($row['clinical_json']??''),true) ?: [];
            $result['completion'] = json_decode((string)($row['completion_json']??''),true) ?: [];
            if ($service === 'nurse') $result['documents'] = json_decode((string)($row['documents_json']??''),true) ?: [];
        }
        return $result;
    }

    private static function assignee_summary(array $row, string $service): ?array {
        $user_id = $service === 'nurse' ? (int) ($row['assigned_nurse_user_id'] ?? 0) : (int) ($row['assigned_clinician_user_id'] ?? 0);
        if (!$user_id) {
            return null;
        }
        $user = get_user_by('id', $user_id);
        return $user ? ['id' => $user_id, 'name' => $user->display_name] : ['id' => $user_id, 'name' => 'Unavailable user'];
    }

    private static function queue_status_email(string $service, int $id, string $status): void {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare('SELECT customer_user_id,reference FROM '.self::request_table($service).' WHERE id=%d',$id),ARRAY_A);
        $user = $row ? get_user_by('id',(int)$row['customer_user_id']) : null;
        if (!$user || !is_email($user->user_email)) return;
        $template_prefix = $service === 'nurse' ? 'nurse_request' : str_replace('-', '_', $service);
        $template_key = sanitize_key($template_prefix.'_'.$status);
        $dispatch_key = hash('sha256',sanitize_key($service).'|'.$id.'|'.sanitize_key($status).'|'.strtolower($user->user_email).'|'.$template_key);
        $now = current_time('mysql');
        $claimed = $wpdb->query($wpdb->prepare(
            'INSERT IGNORE INTO '.self::table('care_notification_dispatches').' (dispatch_key,service_type,resource_id,lifecycle_event,recipient_hash,template_key,status,created_at,updated_at) VALUES (%s,%s,%d,%s,%s,%s,%s,%s,%s)',
            $dispatch_key,sanitize_key($service),$id,sanitize_key($status),hash('sha256',strtolower($user->user_email)),$template_key,'claimed',$now,$now
        ));
        if ($claimed !== 1) return;
        $label = ucwords(str_replace(['-','_'],' ',$service));
        $email_log_id = Nevari_Emails::queue_or_send([
            'recipient_email'=>$user->user_email, 'related_object_type'=>sanitize_key($service), 'related_object_id'=>$id,
            'template_key'=>$template_key,
            'variables'=>[
                'recipient_name'=>$user->display_name,
                'request_reference'=>$row['reference'],
                'dashboard_link'=>Nevari_Helpers::frontend_dashboard_url($service === 'nurse' ? '/dashboard?view=request' : '/dashboard?view=iv-therapy'),
            ],
            'subject'=>$label.' request update',
            'body_html'=>'<p>Your '.esc_html(strtolower($label)).' request '.esc_html($row['reference']).' is now <strong>'.esc_html(ucwords(str_replace('_',' ',$status))).'</strong>.</p>',
        ], false);
        if (is_wp_error($email_log_id) || !$email_log_id) {
            $wpdb->delete(self::table('care_notification_dispatches'),['dispatch_key'=>$dispatch_key]);
            return;
        }
        $wpdb->update(self::table('care_notification_dispatches'),['status'=>'queued','email_log_id'=>(int)$email_log_id,'updated_at'=>current_time('mysql')],['dispatch_key'=>$dispatch_key]);
        self::event(str_replace('-','_',$service),$id,'notification_queued','Status notification queued.',0,['notification_key'=>$dispatch_key],$dispatch_key);
    }
    private static function text_list($values,int $count,int $length):array {if(!is_array($values))return[];return array_values(array_filter(array_map(static function($v)use($length){return substr(sanitize_text_field((string)$v),0,$length);},array_slice($values,0,$count))));}
    public static function table(string $name):string{return Nevari_Helpers::table($name);}
}
