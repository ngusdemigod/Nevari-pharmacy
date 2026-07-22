<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Nurse_Requests {
    private const META_KEY = 'nevari_nurse_requests';
    private const NOTIFY_HOOK = 'nevari_send_nurse_request_notifications';
    private const STATUS_PENDING_REVIEW = 'pending_review';

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_action(self::NOTIFY_HOOK, [__CLASS__, 'send_submission_notifications'], 10, 2);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/nurse-requests', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'customer_index'],
                'permission_callback' => [__CLASS__, 'customer_permission'],
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'customer_create'],
                'permission_callback' => [__CLASS__, 'customer_permission'],
            ],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/nurse-requests/(?P<id>\d+)/documents', [[
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'documents_index'],
            'permission_callback' => [__CLASS__, 'document_collection_permission'],
        ], [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'document_upload'],
            'permission_callback' => [__CLASS__, 'document_upload_permission'],
        ]]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/nurse-requests/(?P<id>\d+)/documents/(?P<document_id>\d+)', [
            'methods' => WP_REST_Server::DELETABLE,
            'callback' => [__CLASS__, 'document_remove'],
            'permission_callback' => [__CLASS__, 'document_admin_item_permission'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/nurse-requests/(?P<id>\d+)/documents/(?P<document_id>\d+)/download', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'document_download'],
            'permission_callback' => [__CLASS__, 'document_item_permission'],
        ]);
    }

    public static function customer_permission(): bool {
        if (!Nevari_Auth::api_session_required()) {
            return false;
        }
        return Nevari_Helpers::is_patient(Nevari_Auth::api_session_user_id());
    }

    public static function customer_index(WP_REST_Request $request): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        return Nevari_Helpers::success([
            'items' => self::list_requests($user_id),
        ]);
    }

    public static function customer_create(WP_REST_Request $request): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $allowed = ['patient','careType','careDetails','clinicalRequirements','uploadedMedicalFiles','customerEmail','customerName','customerPhone','baseUrl','appOrigin','adminEmail','frontendType'];
        if (strlen((string) $request->get_body()) > 262144) {
            return Nevari_Helpers::error('payload_too_large', 'The nurse request is too large.', 413);
        }
        if (array_diff(array_keys($body), $allowed)) {
            return Nevari_Helpers::error('unexpected_fields', 'Unexpected request fields were supplied.', 422);
        }

        $care_type = sanitize_text_field((string) ($body['careType'] ?? ''));
        $patient = self::sanitize_deep(is_array($body['patient'] ?? null) ? $body['patient'] : []);
        $care_details = self::sanitize_deep(is_array($body['careDetails'] ?? null) ? $body['careDetails'] : []);
        $clinical_requirements = self::sanitize_text_list(is_array($body['clinicalRequirements'] ?? null) ? $body['clinicalRequirements'] : []);
        $uploaded_medical_files = self::sanitize_file_map(is_array($body['uploadedMedicalFiles'] ?? null) ? $body['uploadedMedicalFiles'] : []);
        $customer_email = sanitize_email((string) ($body['customerEmail'] ?? ''));
        $customer_name = sanitize_text_field((string) ($body['customerName'] ?? ($patient['name'] ?? 'Customer')));
        $customer_phone = sanitize_text_field((string) ($body['customerPhone'] ?? ($patient['emergencyContact'] ?? '')));
        // Notification recipient and dashboard link origin are derived from
        // trusted server config only. Never trust client-supplied adminEmail /
        // appOrigin here — the endpoint is reachable directly (bypassing the
        // signed proxy), so honoring them would let a caller redirect the
        // patient-data notification email and inject an arbitrary link target.
        $admin_email = self::admin_notification_email();
        $app_origin = self::dashboard_origin();

        if ($care_type === '') {
            return Nevari_Helpers::error('validation_error', 'Select a valid care type.', 422, ['field' => 'careType']);
        }
        if (empty($patient['name'])) {
            return Nevari_Helpers::error('validation_error', 'Enter a valid name.', 422, ['field' => 'name']);
        }
        if (empty($care_details['preferredDate'])) {
            return Nevari_Helpers::error('validation_error', 'Preferred date is required.', 422, ['field' => 'preferredDate']);
        }
        if (empty($care_details['preferredTime'])) {
            return Nevari_Helpers::error('validation_error', 'Preferred time is required.', 422, ['field' => 'preferredTime']);
        }

        $created_at = current_time('mysql');
        $request_id = 'nurse_' . wp_generate_uuid4();
        $request_item = [
            'id' => $request_id,
            'status' => self::STATUS_PENDING_REVIEW,
            'title' => sprintf('Nurse Visit Request - %s', $care_type),
            'careType' => $care_type,
            'visitType' => sanitize_text_field((string) ($care_details['visitType'] ?? '')),
            'preferredDate' => sanitize_text_field((string) ($care_details['preferredDate'] ?? '')),
            'preferredTime' => sanitize_text_field((string) ($care_details['preferredTime'] ?? '')),
            'preferredDateTime' => self::preferred_datetime((string) ($care_details['preferredDate'] ?? ''), (string) ($care_details['preferredTime'] ?? '')),
            'duration' => sanitize_text_field((string) ($care_details['duration'] ?? '')),
            'careShift' => sanitize_text_field((string) ($care_details['careShift'] ?? '')),
            'patient' => $patient,
            'careDetails' => $care_details,
            'clinicalRequirements' => $clinical_requirements,
            'uploadedMedicalFiles' => $uploaded_medical_files,
            'customerEmail' => $customer_email,
            'customerName' => $customer_name,
            'customerPhone' => $customer_phone,
            'adminEmail' => $admin_email,
            'appOrigin' => $app_origin,
            'submittedAt' => get_gmt_from_date($created_at),
            'createdAt' => $created_at,
            'updatedAt' => $created_at,
        ];

        global $wpdb;
        $inserted = $wpdb->insert(Nevari_Care_Journeys::table('nurse_requests'), [
            'legacy_key' => $request_id,
            'reference' => 'NR-' . strtoupper(substr(str_replace('-', '', wp_generate_uuid4()), 0, 10)),
            'customer_user_id' => $user_id,
            'status' => 'submitted',
            'payload_json' => wp_json_encode($request_item),
            'created_at' => $created_at,
            'updated_at' => $created_at,
        ]);
        if (!$inserted) {
            return Nevari_Helpers::error('request_create_failed', 'The nurse request could not be submitted.', 500);
        }
        Nevari_Care_Journeys::event('nurse', (int) $wpdb->insert_id, 'submitted', 'Your nurse request was submitted.', $user_id);

        if (!wp_next_scheduled(self::NOTIFY_HOOK, [$user_id, $request_id])) {
            wp_schedule_single_event(time() + 5, self::NOTIFY_HOOK, [$user_id, $request_id]);
        }

        return Nevari_Helpers::success([
            'request' => $request_item,
            'notifications' => 'queued',
        ], [], 201);
    }

    public static function document_collection_permission(WP_REST_Request $request): bool {
        if (!Nevari_Auth::api_session_required()) return false;
        $row = self::request_row(absint($request['id']));
        if (!$row) return false;
        $user_id = Nevari_Auth::api_session_user_id();
        return Nevari_Helpers::is_store_admin($user_id) || (Nevari_Helpers::is_patient($user_id) && (int) $row['customer_user_id'] === $user_id);
    }

    public static function document_upload_permission(WP_REST_Request $request): bool {
        return self::document_collection_permission($request)
            && Nevari_Helpers::is_store_admin(Nevari_Auth::api_session_user_id());
    }

    public static function document_item_permission(WP_REST_Request $request): bool {
        if (!self::document_collection_permission($request)) return false;
        return (bool) self::document_row(absint($request['id']), absint($request['document_id']));
    }

    public static function document_admin_item_permission(WP_REST_Request $request): bool {
        return self::document_item_permission($request)
            && Nevari_Helpers::is_store_admin(Nevari_Auth::api_session_user_id());
    }

    public static function documents_index(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT id,original_name,detected_mime,file_size,sha256,created_at,updated_at FROM " . Nevari_Care_Journeys::table('care_documents') . " WHERE service_type='nurse' AND resource_id=%d AND removed_at IS NULL ORDER BY id DESC LIMIT 20",
            absint($request['id'])
        ), ARRAY_A) ?: [];
        return Nevari_Helpers::success(['items' => array_map([__CLASS__, 'format_document'], $rows)]);
    }

    public static function document_upload(WP_REST_Request $request): WP_REST_Response {
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        if (array_diff(array_keys($body), ['name','declared_mime','content_base64','replace_document_id'])) {
            return Nevari_Helpers::error('unexpected_fields', 'Unexpected upload fields were supplied.', 422);
        }
        $request_id = absint($request['id']);
        $request_row = self::request_row($request_id);
        if (!$request_row || in_array($request_row['status'], ['declined','cancelled'], true)) {
            return Nevari_Helpers::error('invalid_request_state', 'Documents cannot be added in this request state.', 409);
        }
        $name = sanitize_file_name((string) ($body['name'] ?? ''));
        $declared = sanitize_mime_type((string) ($body['declared_mime'] ?? ''));
        $encoded = (string) ($body['content_base64'] ?? '');
        if ($name === '' || strlen($name) > 190 || $encoded === '' || strlen($encoded) > 14000000) {
            return Nevari_Helpers::error('invalid_document', 'Select a valid file no larger than 10MB.', 422);
        }
        $bytes = base64_decode($encoded, true);
        if ($bytes === false || strlen($bytes) < 4 || strlen($bytes) > 10 * MB_IN_BYTES) {
            return Nevari_Helpers::error('invalid_document', 'Select a non-empty file no larger than 10MB.', 422);
        }
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $allowed = ['pdf'=>'application/pdf','png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg'];
        if (!isset($allowed[$extension]) || $declared !== $allowed[$extension]) {
            return Nevari_Helpers::error('invalid_document_type', 'Only PDF, PNG, and JPEG files are allowed.', 422);
        }
        $tmp = wp_tempnam($name);
        if (!$tmp || file_put_contents($tmp, $bytes, LOCK_EX) !== strlen($bytes)) {
            if ($tmp) @unlink($tmp);
            return Nevari_Helpers::error('document_storage_failed', 'The document could not be stored.', 500);
        }
        $detected = function_exists('finfo_open') ? (string) finfo_file(finfo_open(FILEINFO_MIME_TYPE), $tmp) : '';
        if ($detected !== $allowed[$extension] || ($extension === 'pdf' && substr($bytes, 0, 5) !== '%PDF-')) {
            @unlink($tmp);
            return Nevari_Helpers::error('invalid_document_content', 'The file contents do not match the selected type.', 422);
        }
        global $wpdb;
        $count = (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM " . Nevari_Care_Journeys::table('care_documents') . " WHERE service_type='nurse' AND resource_id=%d AND removed_at IS NULL", $request_id));
        $replace_id = absint($body['replace_document_id'] ?? 0);
        if ($count >= 10 && !$replace_id) {
            @unlink($tmp);
            return Nevari_Helpers::error('document_limit', 'A maximum of 10 documents is allowed.', 422);
        }
        if ($replace_id && !self::document_row($request_id, $replace_id)) {
            @unlink($tmp);
            return Nevari_Helpers::error('document_not_found', 'The document to replace was not found.', 404);
        }
        $directory = self::private_storage_directory($request_id);
        if (!wp_mkdir_p($directory)) {
            @unlink($tmp);
            return Nevari_Helpers::error('document_storage_failed', 'The document could not be stored.', 500);
        }
        self::protect_private_directory(dirname($directory));
        $stored = wp_generate_uuid4() . '.' . ($extension === 'jpeg' ? 'jpg' : $extension);
        $target = trailingslashit($directory) . $stored;
        if (!rename($tmp, $target)) {
            @unlink($tmp);
            return Nevari_Helpers::error('document_storage_failed', 'The document could not be stored.', 500);
        }
        $now = Nevari_Helpers::now();
        $wpdb->query('START TRANSACTION');
        if ($replace_id) {
            $wpdb->update(Nevari_Care_Journeys::table('care_documents'), ['removed_at'=>$now,'removed_by'=>Nevari_Auth::api_session_user_id(),'updated_at'=>$now], ['id'=>$replace_id]);
        }
        $wpdb->insert(Nevari_Care_Journeys::table('care_documents'), [
            'service_type'=>'nurse','resource_id'=>$request_id,'patient_user_id'=>(int)$request_row['customer_user_id'],
            'original_name'=>$name,'stored_name'=>$stored,'detected_mime'=>$detected,'file_size'=>strlen($bytes),
            'sha256'=>hash('sha256',$bytes),'uploaded_by'=>Nevari_Auth::api_session_user_id(),
            'replaced_document_id'=>$replace_id ?: null,'created_at'=>$now,'updated_at'=>$now,
        ]);
        if (!$wpdb->insert_id) {
            $wpdb->query('ROLLBACK'); @unlink($target);
            return Nevari_Helpers::error('document_storage_failed', 'The document could not be stored.', 500);
        }
        $document_id = (int) $wpdb->insert_id;
        $wpdb->query('COMMIT');
        Nevari_Care_Journeys::event('nurse',$request_id,$replace_id?'document_replaced':'document_added','A patient-safe document was added.',Nevari_Auth::api_session_user_id());
        return Nevari_Helpers::success(['document'=>self::format_document(self::document_row($request_id,$document_id))],[],201);
    }

    public static function document_remove(WP_REST_Request $request): WP_REST_Response {
        global $wpdb; $now=Nevari_Helpers::now();
        $wpdb->update(Nevari_Care_Journeys::table('care_documents'), ['removed_at'=>$now,'removed_by'=>Nevari_Auth::api_session_user_id(),'updated_at'=>$now], ['id'=>absint($request['document_id'])]);
        Nevari_Care_Journeys::event('nurse',absint($request['id']),'document_removed','A patient-safe document was removed.',Nevari_Auth::api_session_user_id());
        return Nevari_Helpers::success(['removed'=>true]);
    }

    public static function document_download(WP_REST_Request $request) {
        $row = self::document_row(absint($request['id']), absint($request['document_id']));
        $path = trailingslashit(self::private_storage_directory(absint($request['id']))) . basename($row['stored_name']);
        if (!is_file($path) || filesize($path) !== (int) $row['file_size']) {
            return Nevari_Helpers::error('document_unavailable', 'The document is unavailable.', 404);
        }
        header('Content-Type: ' . $row['detected_mime']);
        header('Content-Length: ' . (int) $row['file_size']);
        header('Content-Disposition: attachment; filename="' . rawurlencode($row['original_name']) . '"');
        header('X-Content-Type-Options: nosniff');
        header('Cache-Control: private, no-store, max-age=0');
        readfile($path);
        exit;
    }

    private static function request_row(int $request_id): ?array {
        global $wpdb;
        $row=$wpdb->get_row($wpdb->prepare('SELECT * FROM '.Nevari_Care_Journeys::table('nurse_requests').' WHERE id=%d',$request_id),ARRAY_A);
        return $row ?: null;
    }

    private static function document_row(int $request_id,int $document_id): ?array {
        global $wpdb;
        $row=$wpdb->get_row($wpdb->prepare("SELECT * FROM ".Nevari_Care_Journeys::table('care_documents')." WHERE id=%d AND service_type='nurse' AND resource_id=%d AND removed_at IS NULL",$document_id,$request_id),ARRAY_A);
        return $row ?: null;
    }

    private static function format_document(array $row): array {
        return ['id'=>(int)$row['id'],'name'=>$row['original_name'],'mime'=>$row['detected_mime'],'size'=>(int)$row['file_size'],'sha256'=>$row['sha256'],'created_at'=>$row['created_at']];
    }

    private static function private_storage_directory(int $request_id): string {
        $root=defined('NEVARI_PRIVATE_STORAGE_DIR') ? (string)NEVARI_PRIVATE_STORAGE_DIR : trailingslashit(WP_CONTENT_DIR).'nevari-private';
        return trailingslashit($root).'nurse-requests/'.$request_id;
    }

    private static function protect_private_directory(string $root): void {
        if (!is_dir($root)) wp_mkdir_p($root);
        $deny=trailingslashit($root).'.htaccess';
        if (!file_exists($deny)) file_put_contents($deny,"Require all denied\nDeny from all\n",LOCK_EX);
        $index=trailingslashit($root).'index.php';
        if (!file_exists($index)) file_put_contents($index,"<?php http_response_code(404); exit;\n",LOCK_EX);
    }

    public static function send_submission_notifications(int $user_id, string $request_id): void {
        $request = self::find_request($user_id, $request_id);
        if (!$request || !empty($request['notificationsDispatchedAt'])) {
            return;
        }

        $customer_email = sanitize_email((string) ($request['customerEmail'] ?? ''));
        // Re-derive from trusted server config; ignore any stored client value.
        $admin_email = self::admin_notification_email();
        $customer_name = sanitize_text_field((string) ($request['customerName'] ?? 'Customer'));
        $customer_phone = sanitize_text_field((string) ($request['customerPhone'] ?? ''));
        $care_type = sanitize_text_field((string) ($request['careType'] ?? 'Nurse Request'));
        $preferred_date = sanitize_text_field((string) ($request['preferredDate'] ?? ''));
        $preferred_time = sanitize_text_field((string) ($request['preferredTime'] ?? ''));
        $visit_type = sanitize_text_field((string) ($request['visitType'] ?? ''));
        $clinical_requirements = isset($request['clinicalRequirements']) && is_array($request['clinicalRequirements'])
            ? implode(', ', array_map('sanitize_text_field', $request['clinicalRequirements']))
            : '';
        $app_origin = self::dashboard_origin();
        $uploaded_count = isset($request['uploadedMedicalFiles']) && is_array($request['uploadedMedicalFiles'])
            ? count(array_filter($request['uploadedMedicalFiles']))
            : 0;

        if ($customer_email && is_email($customer_email)) {
            Nevari_Emails::queue_or_send([
                'recipient_user_id' => $user_id,
                'recipient_email' => $customer_email,
                'related_object_type' => 'nurse_request',
                'related_object_id' => 0,
                'subject' => 'Your nurse request has been received',
                'body_html' => sprintf(
                    '<p>Hello %1$s,</p><p>Your nurse request has been received and is currently pending review.</p><p><strong>Care Type:</strong> %2$s<br /><strong>Preferred Date:</strong> %3$s<br /><strong>Preferred Time:</strong> %4$s<br /><strong>Visit Type:</strong> %5$s<br /><strong>Status:</strong> Pending Review</p><p>You will be notified once a nurse is assigned.</p>',
                    esc_html($customer_name ?: 'Customer'),
                    esc_html($care_type),
                    esc_html($preferred_date),
                    esc_html($preferred_time),
                    esc_html($visit_type)
                ),
            ], false);
        }

        if ($admin_email && is_email($admin_email)) {
            $admin_body = sprintf(
                '<p>A new nurse request has been submitted.</p><p><strong>Customer:</strong> %1$s<br /><strong>Contact:</strong> %2$s<br /><strong>Email:</strong> %3$s<br /><strong>Care Type:</strong> %4$s<br /><strong>Preferred Date:</strong> %5$s<br /><strong>Preferred Time:</strong> %6$s<br /><strong>Visit Type:</strong> %7$s<br /><strong>Clinical Requirements:</strong> %8$s<br /><strong>Uploaded Documents:</strong> %9$d</p>',
                esc_html($customer_name),
                esc_html($customer_phone ?: 'n/a'),
                esc_html($customer_email ?: 'n/a'),
                esc_html($care_type),
                esc_html($preferred_date),
                esc_html($preferred_time),
                esc_html($visit_type),
                esc_html($clinical_requirements ?: 'None'),
                $uploaded_count
            );
            if ($app_origin !== '') {
                $admin_body .= sprintf(
                    '<p><a href="%s/admin/storefront">Review in admin dashboard</a></p>',
                    esc_url($app_origin)
                );
            }
            Nevari_Emails::queue_or_send([
                'recipient_email' => $admin_email,
                'related_object_type' => 'nurse_request',
                'related_object_id' => 0,
                'subject' => 'New nurse request submitted',
                'body_html' => $admin_body,
            ], false);
        }

        self::mark_notifications_dispatched($user_id, $request_id);
    }

    private static function list_requests(int $user_id): array {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare(
            'SELECT * FROM ' . Nevari_Care_Journeys::table('nurse_requests') . ' WHERE customer_user_id=%d ORDER BY created_at DESC LIMIT 200',
            $user_id
        ), ARRAY_A);
        $items = array_values(array_filter(array_map([__CLASS__, 'normalize_row'], $rows ?: [])));
        if (!get_option('nevari_care_legacy_migration_complete')) {
            $seen = array_fill_keys(array_map(static function ($item) { return (string) ($item['id'] ?? ''); }, $items), true);
            foreach ((array) get_user_meta($user_id, self::META_KEY, true) as $legacy) {
                $item = self::normalize_request($legacy);
                if ($item && empty($seen[(string) $item['id']])) $items[] = $item;
            }
        }
        return $items;
    }
    private static function find_request(int $user_id, string $request_id): ?array {
        foreach (self::list_requests($user_id) as $item) {
            if ((string) ($item['id'] ?? '') === $request_id) {
                return $item;
            }
        }
        return null;
    }

    private static function mark_notifications_dispatched(int $user_id, string $request_id): void {
        global $wpdb;
        $table = Nevari_Care_Journeys::table('nurse_requests');
        $row = $wpdb->get_row($wpdb->prepare('SELECT id,payload_json FROM ' . $table . ' WHERE customer_user_id=%d AND legacy_key=%s', $user_id, $request_id), ARRAY_A);
        if (!$row) {
            return;
        }
        $payload = json_decode((string) $row['payload_json'], true) ?: [];
        $payload['notificationsDispatchedAt'] = gmdate('c');
        $payload['updatedAt'] = current_time('mysql');
        $wpdb->update($table, ['payload_json' => wp_json_encode($payload), 'updated_at' => current_time('mysql')], ['id' => (int) $row['id']]);
    }

    private static function normalize_row(array $row): ?array {
        $payload = json_decode((string) ($row['payload_json'] ?? ''), true);
        $item = self::normalize_request(is_array($payload) ? $payload : []);
        if (!$item) {
            return null;
        }
        $item['record_id'] = (int) $row['id'];
        $item['reference'] = sanitize_text_field((string) $row['reference']);
        $item['service_type'] = 'nurse';
        $item['status'] = sanitize_key((string) $row['status']);
        $item['status_label'] = ucwords(str_replace('_', ' ', $item['status']));
        $item['patient_safe_message'] = sanitize_text_field((string) ($row['patient_safe_message'] ?? ''));
        $item['scheduled_at'] = sanitize_text_field((string) ($row['scheduled_at'] ?? '')) ?: null;
        $item['timeline'] = Nevari_Care_Journeys::timeline('nurse', (int) $row['id']);
        $nurse_id = (int) ($row['assigned_nurse_user_id'] ?? 0);
        $nurse = $nurse_id ? get_user_by('id', $nurse_id) : null;
        $item['assigned_nurse'] = $nurse ? ['id' => $nurse_id, 'name' => $nurse->display_name] : null;
        $completion = json_decode((string) ($row['completion_json'] ?? ''), true);
        $item['completion'] = is_array($completion) ? $completion : [];
        return $item;
    }
    private static function normalize_request($item): ?array {
        if (!is_array($item) || empty($item['id'])) {
            return null;
        }
        return [
            'id' => sanitize_text_field((string) ($item['id'] ?? '')),
            'status' => sanitize_key((string) ($item['status'] ?? self::STATUS_PENDING_REVIEW)),
            'title' => sanitize_text_field((string) ($item['title'] ?? 'Nurse Request')),
            'careType' => sanitize_text_field((string) ($item['careType'] ?? '')),
            'visitType' => sanitize_text_field((string) ($item['visitType'] ?? '')),
            'preferredDate' => sanitize_text_field((string) ($item['preferredDate'] ?? '')),
            'preferredTime' => sanitize_text_field((string) ($item['preferredTime'] ?? '')),
            'preferredDateTime' => sanitize_text_field((string) ($item['preferredDateTime'] ?? self::preferred_datetime((string) ($item['preferredDate'] ?? ''), (string) ($item['preferredTime'] ?? '')))),
            'duration' => sanitize_text_field((string) ($item['duration'] ?? '')),
            'careShift' => sanitize_text_field((string) ($item['careShift'] ?? '')),
            'patient' => self::sanitize_deep(is_array($item['patient'] ?? null) ? $item['patient'] : []),
            'careDetails' => self::sanitize_deep(is_array($item['careDetails'] ?? null) ? $item['careDetails'] : []),
            'clinicalRequirements' => self::sanitize_text_list(is_array($item['clinicalRequirements'] ?? null) ? $item['clinicalRequirements'] : []),
            'uploadedMedicalFiles' => self::sanitize_file_map(is_array($item['uploadedMedicalFiles'] ?? null) ? $item['uploadedMedicalFiles'] : []),
            'customerEmail' => sanitize_email((string) ($item['customerEmail'] ?? '')),
            'customerName' => sanitize_text_field((string) ($item['customerName'] ?? '')),
            'customerPhone' => sanitize_text_field((string) ($item['customerPhone'] ?? '')),
            'adminEmail' => sanitize_email((string) ($item['adminEmail'] ?? '')),
            'appOrigin' => esc_url_raw((string) ($item['appOrigin'] ?? '')),
            'submittedAt' => sanitize_text_field((string) ($item['submittedAt'] ?? '')),
            'createdAt' => sanitize_text_field((string) ($item['createdAt'] ?? '')),
            'updatedAt' => sanitize_text_field((string) ($item['updatedAt'] ?? '')),
            'notificationsDispatchedAt' => sanitize_text_field((string) ($item['notificationsDispatchedAt'] ?? '')),
        ];
    }

    private static function sanitize_text_list(array $items): array {
        return array_values(array_filter(array_map(static function ($value): string {
            return sanitize_text_field((string) $value);
        }, $items)));
    }

    private static function sanitize_file_map(array $items): array {
        $sanitized = [];
        foreach ($items as $label => $file_name) {
            $label_key = sanitize_text_field((string) $label);
            $name = sanitize_file_name((string) $file_name);
            if ($label_key !== '' && $name !== '') {
                $sanitized[$label_key] = $name;
            }
        }
        return $sanitized;
    }

    private static function sanitize_deep($value) {
        if (is_array($value)) {
            $result = [];
            foreach ($value as $key => $item) {
                // Keys are camelCase identifiers (preferredDate, visitType, ...) already
                // whitelisted upstream; sanitize_key() would lowercase them and break lookups.
                $safe_key = preg_replace('/[^A-Za-z0-9_\-]/', '', (string) $key);
                if ($safe_key === '') {
                    continue;
                }
                $result[$safe_key] = self::sanitize_deep($item);
            }
            return $result;
        }
        return sanitize_text_field((string) $value);
    }

    private static function admin_notification_email(): string {
        $configured = sanitize_email((string) get_option('nevari_care_team_email', ''));
        if ($configured !== '' && is_email($configured)) {
            return $configured;
        }
        return sanitize_email((string) get_option('admin_email'));
    }

    private static function dashboard_origin(): string {
        if (class_exists('Nevari_Helpers') && method_exists('Nevari_Helpers', 'shared_frontend_base_url')) {
            $origin = esc_url_raw(rtrim((string) Nevari_Helpers::shared_frontend_base_url(), '/'));
            if ($origin !== '') {
                return $origin;
            }
        }
        return esc_url_raw(rtrim((string) home_url('/'), '/'));
    }

    private static function preferred_datetime(string $date, string $time): string {
        $date = sanitize_text_field($date);
        $time = sanitize_text_field($time);
        if ($date === '' || $time === '') {
            return '';
        }
        return sprintf('%sT%s:00', $date, $time);
    }
}
