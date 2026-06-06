<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Mtm {
    private const TABLE = 'mtm_requests';
    private const STATUS_SUBMITTED = 'submitted';
    private const STATUS_UNDER_REVIEW = 'under_review';
    private const STATUS_APPROVED = 'approved';
    private const STATUS_SCHEDULED = 'scheduled';
    private const STATUS_TREATMENT_COMPLETED = 'treatment_completed';
    private const STATUS_FOLLOW_UP = 'follow_up';
    private const STATUS_COMPLETED = 'completed';
    private const ACTIVE_STATUSES = ['submitted', 'under_review', 'approved', 'scheduled', 'treatment_completed', 'follow_up'];
    private const MTM_DURATION_MINUTES = 30;

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_action('nevari_mtm_end_meet_space', [__CLASS__, 'end_meet_space_for_request'], 10, 1);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests', [
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'customer_show'],
                'permission_callback' => [__CLASS__, 'customer_permission'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests/(?P<id>\d+)/booking-context', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'booking_context'],
                'permission_callback' => [__CLASS__, 'customer_permission'],
            ],
        ]);

        self::register_pharmacist_routes('/pharmacist/mtm-requests', 'pharmacist_permission');
        self::register_pharmacist_routes('/doctor/mtm-requests', 'pharmacist_permission');

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/pharmacist/pharmacy-products', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'pharmacy_products'],
                'permission_callback' => [__CLASS__, 'pharmacist_permission'],
            ],
        ]);
    }

    private static function register_pharmacist_routes(string $base, string $permission): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, $base, [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'pharmacist_index'],
                'permission_callback' => [__CLASS__, $permission],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, $base . '/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'pharmacist_show'],
                'permission_callback' => [__CLASS__, $permission],
            ],
        ]);

        $actions = [
            'approve' => 'approve_request',
            'schedule' => 'schedule',
            'consultation-complete' => 'consultation_complete',
            'action-plan' => 'save_action_plan',
            'follow-up-schedule' => 'follow_up_schedule',
            'outcome-tracking' => 'save_outcome_tracking',
            'complete' => 'complete_request',
            'attach-products' => 'attach_products',
            'create-product-order' => 'create_product_order',
            'follow-up' => 'follow_up_schedule',
            'products' => 'attach_products',
            'orders' => 'create_product_order',
        ];

        foreach ($actions as $action => $callback) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, $base . '/(?P<id>\d+)/' . $action, [
                [
                    'methods' => WP_REST_Server::CREATABLE,
                    'callback' => [__CLASS__, $callback],
                    'permission_callback' => [__CLASS__, $permission],
                ],
            ]);
        }
    }

    public static function customer_permission(): bool {
        return Nevari_Auth::api_session_required();
    }

    public static function pharmacist_permission(): bool {
        return Nevari_Auth::api_session_required() && (Nevari_Helpers::is_pharmacist() || Nevari_Helpers::is_store_admin());
    }

    private static function customer_has_access(): bool {
        $user_id = Nevari_Auth::api_session_user_id();
        return $user_id > 0 && class_exists('Nevari_Subscriptions') && Nevari_Subscriptions::user_has_paid_access($user_id);
    }

    private static function guard_customer_submission_access() {
        if (self::customer_has_access()) {
            return null;
        }
        return Nevari_Helpers::error(
            'subscription_required',
            'An active therapy management subscription is required to submit an MTM request.',
            403
        );
    }

    private static function table(): string {
        return Nevari_Helpers::table(self::TABLE);
    }

    private static function table_ready(): bool {
        global $wpdb;

        $table = self::table();
        $resolved = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table));
        return is_string($resolved) && $resolved === $table;
    }

    private static function now(): string {
        return Nevari_Helpers::now();
    }

    private static function get_request(int $id): ?object {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM " . self::table() . " WHERE id = %d LIMIT 1", $id));
    }

    private static function decode_json($value): array {
        if (is_array($value)) {
            return $value;
        }
        if (!is_string($value) || $value === '') {
            return [];
        }
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    private static function normalize_status(string $status): string {
        $status = sanitize_key($status ?: self::STATUS_SUBMITTED);
        $legacy = [
            'scheduled' => self::STATUS_SCHEDULED,
            'consultation_completed' => self::STATUS_TREATMENT_COMPLETED,
            'medication_action_plan_created' => self::STATUS_TREATMENT_COMPLETED,
            'follow-up' => self::STATUS_FOLLOW_UP,
        ];
        return $legacy[$status] ?? (in_array($status, [
            self::STATUS_SUBMITTED,
            self::STATUS_UNDER_REVIEW,
            self::STATUS_APPROVED,
            self::STATUS_SCHEDULED,
            self::STATUS_TREATMENT_COMPLETED,
            self::STATUS_FOLLOW_UP,
            self::STATUS_COMPLETED,
        ], true) ? $status : self::STATUS_SUBMITTED);
    }

    private static function status_label(string $status): string {
        return [
            self::STATUS_SUBMITTED => 'Submitted',
            self::STATUS_UNDER_REVIEW => 'Under Review',
            self::STATUS_APPROVED => 'Approved',
            self::STATUS_SCHEDULED => 'Scheduled',
            self::STATUS_TREATMENT_COMPLETED => 'Treatment Completed',
            self::STATUS_FOLLOW_UP => 'Follow-Up',
            self::STATUS_COMPLETED => 'Completed',
        ][self::normalize_status($status)] ?? 'Submitted';
    }

    private static function sanitize_deep($value) {
        if (is_array($value)) {
            $out = [];
            foreach ($value as $key => $item) {
                $safe_key = is_int($key) ? $key : sanitize_key((string) $key);
                $out[$safe_key] = self::sanitize_deep($item);
            }
            return $out;
        }
        if (is_bool($value) || is_int($value) || is_float($value) || $value === null) {
            return $value;
        }
        return sanitize_textarea_field((string) $value);
    }

    private static function payload_from_request(object $row): array {
        $assigned_pharmacist_id = (int) ($row->assigned_pharmacist_user_id ?? $row->assigned_doctor_user_id ?? 0);
        $reviewed_by_pharmacist_id = (int) ($row->reviewed_by_pharmacist_user_id ?? $row->reviewed_by_doctor_user_id ?? 0);
        $status = self::normalize_status((string) ($row->status ?? self::STATUS_SUBMITTED));
        $meet = [
            'space_name' => (string) ($row->google_meet_space_name ?? $row->google_calendar_event_id ?? ''),
            'meeting_code' => (string) ($row->google_meet_code ?? ''),
            'meeting_uri' => (string) ($row->google_meet_link ?? ''),
            'error' => (string) ($row->google_meet_error ?? ''),
            'created_at' => !empty($row->google_meet_created_at) ? (string) $row->google_meet_created_at : null,
            'ended_at' => !empty($row->google_meet_ended_at) ? (string) $row->google_meet_ended_at : null,
        ];
        return [
            'id' => (int) $row->id,
            'customer_user_id' => (int) $row->customer_user_id,
            'assigned_pharmacist_id' => $assigned_pharmacist_id,
            'assigned_pharmacist_user_id' => $assigned_pharmacist_id,
            'reviewed_by_pharmacist_id' => $reviewed_by_pharmacist_id,
            'reviewed_by_pharmacist_user_id' => $reviewed_by_pharmacist_id,
            'assigned_doctor_user_id' => (int) ($row->assigned_doctor_user_id ?? 0),
            'reviewed_by_doctor_user_id' => (int) ($row->reviewed_by_doctor_user_id ?? 0),
            'status' => $status,
            'status_label' => self::status_label($status),
            'patient' => self::decode_json($row->patient_data ?? '[]'),
            'emergency_contact' => self::decode_json($row->emergency_contact_data ?? '[]'),
            'medical_history' => self::decode_json($row->medical_history_data ?? '[]'),
            'medication_profile' => self::decode_json($row->medication_profile_data ?? '[]'),
            'adherence_assessment' => self::decode_json($row->adherence_assessment_data ?? '[]'),
            'additional_information' => self::decode_json($row->additional_information_data ?? '[]'),
            'attachments' => self::decode_json($row->attachments_json ?? '[]'),
            'action_plan' => self::decode_json($row->action_plan_json ?? '[]'),
            'attached_products' => self::decode_json($row->attached_products_json ?? '[]'),
            'consultation_notes' => self::decode_json($row->consultation_notes_json ?? '[]'),
            'follow_up' => self::decode_json($row->follow_up_json ?? '[]'),
            'outcome_tracking' => self::decode_json($row->outcome_tracking_json ?? '[]'),
            'order_id' => !empty($row->order_id) ? (int) $row->order_id : null,
            'scheduled_at' => !empty($row->scheduled_at) ? (string) $row->scheduled_at : null,
            'duration_minutes' => self::MTM_DURATION_MINUTES,
            'timezone' => (string) ($row->timezone ?? 'UTC'),
            'consultation_method' => (string) ($row->consultation_method ?? 'Google Meet'),
            'google_meet' => $meet,
            'google_meet_link' => $meet['meeting_uri'],
            'follow_up_at' => !empty($row->follow_up_at) ? (string) $row->follow_up_at : null,
            'completed_at' => !empty($row->completed_at) ? (string) $row->completed_at : null,
            'assigned_at' => !empty($row->assigned_at) ? (string) $row->assigned_at : null,
            'reviewed_at' => !empty($row->reviewed_at) ? (string) $row->reviewed_at : null,
            'approved_at' => !empty($row->approved_at) ? (string) $row->approved_at : null,
            'created_at' => !empty($row->created_at) ? (string) $row->created_at : null,
            'updated_at' => !empty($row->updated_at) ? (string) $row->updated_at : null,
        ];
    }

    private static function list_query(string $where_sql, array $params = []): array {
        global $wpdb;
        $sql = "SELECT * FROM " . self::table() . " WHERE {$where_sql} ORDER BY id DESC";
        if (!empty($params)) {
            $sql = $wpdb->prepare($sql, $params);
        }
        $rows = $wpdb->get_results($sql);
        return array_map([__CLASS__, 'payload_from_request'], is_array($rows) ? $rows : []);
    }

    private static function workload_for_pharmacist(int $pharmacist_id): int {
        global $wpdb;
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM " . self::table() . " WHERE assigned_pharmacist_user_id = %d AND status IN ('" . implode("','", self::ACTIVE_STATUSES) . "')",
            $pharmacist_id
        ));
    }

    private static function select_pharmacist(): int {
        $users = get_users([
            'role' => 'pharmacist',
            'number' => 100,
            'fields' => ['ID'],
            'orderby' => 'ID',
            'order' => 'ASC',
        ]);
        $best_id = 0;
        $best_load = PHP_INT_MAX;
        foreach ($users as $user) {
            $pharmacist_id = (int) $user->ID;
            if (get_user_meta($pharmacist_id, '_nevari_pharmacist_suspended', true)) {
                continue;
            }
            $load = self::workload_for_pharmacist($pharmacist_id);
            if ($load < $best_load) {
                $best_load = $load;
                $best_id = $pharmacist_id;
            }
        }
        return $best_id;
    }

    private static function insert_request(int $customer_id, array $payload): int {
        global $wpdb;
        $now = self::now();
        $assigned = (int) ($payload['assigned_pharmacist_user_id'] ?? 0);
        $wpdb->insert(self::table(), [
            'customer_user_id' => $customer_id,
            'assigned_pharmacist_user_id' => $assigned,
            'reviewed_by_pharmacist_user_id' => 0,
            'assigned_doctor_user_id' => 0,
            'reviewed_by_doctor_user_id' => 0,
            'status' => self::normalize_status((string) ($payload['status'] ?? self::STATUS_SUBMITTED)),
            'patient_data' => wp_json_encode($payload['patient'] ?? []),
            'emergency_contact_data' => wp_json_encode($payload['emergency_contact'] ?? []),
            'medical_history_data' => wp_json_encode($payload['medical_history'] ?? []),
            'medication_profile_data' => wp_json_encode($payload['medication_profile'] ?? []),
            'adherence_assessment_data' => wp_json_encode($payload['adherence_assessment'] ?? []),
            'additional_information_data' => wp_json_encode($payload['additional_information'] ?? []),
            'attachments_json' => wp_json_encode($payload['attachments'] ?? []),
            'action_plan_json' => wp_json_encode([]),
            'attached_products_json' => wp_json_encode([]),
            'consultation_notes_json' => wp_json_encode([]),
            'follow_up_json' => wp_json_encode([]),
            'outcome_tracking_json' => wp_json_encode([]),
            'scheduled_at' => null,
            'duration_minutes' => self::MTM_DURATION_MINUTES,
            'timezone' => 'UTC',
            'consultation_method' => 'Google Meet',
            'follow_up_at' => null,
            'completed_at' => null,
            'assigned_at' => $assigned > 0 ? $now : null,
            'reviewed_at' => null,
            'approved_at' => null,
            'created_by' => $customer_id,
            'updated_by' => $customer_id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        return (int) $wpdb->insert_id;
    }

    private static function update_request(int $id, array $data): ?object {
        global $wpdb;
        $data['updated_at'] = self::now();
        $wpdb->update(self::table(), $data, ['id' => $id]);
        return self::get_request($id);
    }

    private static function can_access_request(object $row, int $user_id): bool {
        return Nevari_Helpers::is_store_admin($user_id)
            || (int) ($row->assigned_pharmacist_user_id ?? 0) === $user_id;
    }

    private static function guard_pharmacist_request(int $id) {
        $row = self::get_request($id);
        if (!$row) {
            return Nevari_Helpers::error('mtm_request_not_found', 'MTM request not found.', 404);
        }
        $user_id = Nevari_Auth::api_session_user_id();
        if (!self::can_access_request($row, $user_id)) {
            return Nevari_Helpers::error('forbidden', 'You cannot manage this MTM request.', 403);
        }
        return $row;
    }

    public static function customer_index(WP_REST_Request $request): WP_REST_Response {
        if (!self::table_ready()) {
            return Nevari_Helpers::error('mtm_unavailable', 'MTM requests are temporarily unavailable. Please contact support.', 503);
        }
        $user_id = Nevari_Auth::api_session_user_id();
        return Nevari_Helpers::success(['items' => self::list_query('customer_user_id = %d', [$user_id])]);
    }

    public static function customer_create(WP_REST_Request $request): WP_REST_Response {
        if (!self::table_ready()) {
            return Nevari_Helpers::error('mtm_unavailable', 'MTM requests are temporarily unavailable. Please contact support.', 503);
        }
        $access_error = self::guard_customer_submission_access();
        if ($access_error instanceof WP_REST_Response) {
            return $access_error;
        }
        $user_id = Nevari_Auth::api_session_user_id();
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $assigned = self::select_pharmacist();
        $request_id = self::insert_request($user_id, [
            'status' => $assigned > 0 ? self::STATUS_UNDER_REVIEW : self::STATUS_SUBMITTED,
            'assigned_pharmacist_user_id' => $assigned,
            'patient' => self::sanitize_deep(is_array($body['patient'] ?? null) ? $body['patient'] : []),
            'emergency_contact' => self::sanitize_deep(is_array($body['emergency_contact'] ?? null) ? $body['emergency_contact'] : []),
            'medical_history' => self::sanitize_deep(is_array($body['medical_history'] ?? null) ? $body['medical_history'] : []),
            'medication_profile' => self::sanitize_deep(is_array($body['medication_profile'] ?? null) ? $body['medication_profile'] : []),
            'adherence_assessment' => self::sanitize_deep(is_array($body['adherence_assessment'] ?? null) ? $body['adherence_assessment'] : []),
            'additional_information' => self::sanitize_deep(is_array($body['additional_information'] ?? null) ? $body['additional_information'] : []),
            'attachments' => self::sanitize_deep(is_array($body['attachments'] ?? null) ? $body['attachments'] : []),
        ]);
        $row = self::get_request($request_id);
        if ($row) {
            self::dispatch_request_submission_notifications($row);
        }
        return Nevari_Helpers::success([
            'request' => self::payload_from_request($row),
            'status' => (string) ($row->status ?? self::STATUS_SUBMITTED),
        ]);
    }

    public static function customer_show(WP_REST_Request $request): WP_REST_Response {
        if (!self::table_ready()) {
            return Nevari_Helpers::error('mtm_unavailable', 'MTM requests are temporarily unavailable. Please contact support.', 503);
        }
        $row = self::get_request((int) $request['id']);
        if (!$row) {
            return Nevari_Helpers::error('mtm_request_not_found', 'MTM request not found.', 404);
        }
        $user_id = Nevari_Auth::api_session_user_id();
        if ((int) $row->customer_user_id !== $user_id && !Nevari_Helpers::is_store_admin($user_id)) {
            return Nevari_Helpers::error('forbidden', 'You cannot view this MTM request.', 403);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($row)]);
    }

    public static function booking_context(WP_REST_Request $request): WP_REST_Response {
        if (!self::table_ready()) {
            return Nevari_Helpers::error('mtm_unavailable', 'MTM requests are temporarily unavailable. Please contact support.', 503);
        }
        $row = self::get_request((int) $request['id']);
        if (!$row) {
            return Nevari_Helpers::error('mtm_request_not_found', 'MTM request not found.', 404);
        }
        $user_id = Nevari_Auth::api_session_user_id();
        if ((int) $row->customer_user_id !== $user_id) {
            return Nevari_Helpers::error('forbidden', 'You cannot access this booking context.', 403);
        }
        return Nevari_Helpers::success([
            'mtm_request_id' => (int) $row->id,
            'status' => self::normalize_status((string) $row->status),
            'pharmacist_id' => (int) ($row->assigned_pharmacist_user_id ?? 0),
            'pharmacist_name' => self::user_name((int) ($row->assigned_pharmacist_user_id ?? 0)),
            'duration_minutes' => self::MTM_DURATION_MINUTES,
            'payment_required' => false,
            'google_meet_link' => (string) ($row->google_meet_link ?? ''),
        ]);
    }

    public static function pharmacist_index(WP_REST_Request $request): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        if (Nevari_Helpers::is_store_admin($user_id)) {
            return Nevari_Helpers::success(['items' => self::list_query('id > 0')]);
        }
        return Nevari_Helpers::success(['items' => self::list_query('assigned_pharmacist_user_id = %d', [$user_id])]);
    }

    public static function pharmacist_show(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($row)]);
    }

    public static function approve_request(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        $actor = Nevari_Auth::api_session_user_id();
        $updated = self::update_request((int) $row->id, [
            'status' => self::STATUS_APPROVED,
            'reviewed_by_pharmacist_user_id' => $actor,
            'reviewed_at' => self::now(),
            'approved_at' => self::now(),
            'updated_by' => $actor,
        ]);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated)]);
    }

    public static function schedule(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        if (self::normalize_status((string) $row->status) !== self::STATUS_APPROVED) {
            return Nevari_Helpers::error('invalid_status', 'Only approved MTM requests can be scheduled.', 409);
        }
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $start = sanitize_text_field((string) ($body['appointment_start'] ?? $body['scheduled_at'] ?? $body['start_at'] ?? ''));
        if ($start === '' || strtotime($start) === false) {
            return Nevari_Helpers::error('missing_schedule', 'A valid appointment start time is required.', 422);
        }
        $start_mysql = gmdate('Y-m-d H:i:s', strtotime($start));
        $end_mysql = gmdate('Y-m-d H:i:s', strtotime($start_mysql . ' UTC +' . self::MTM_DURATION_MINUTES . ' minutes'));
        $timezone = sanitize_text_field((string) ($body['timezone'] ?? 'UTC'));
        $meet = self::create_meet_space_for_request($row, $start_mysql, $end_mysql);
        $actor = Nevari_Auth::api_session_user_id();
        $data = [
            'status' => self::STATUS_SCHEDULED,
            'scheduled_at' => $start_mysql,
            'duration_minutes' => self::MTM_DURATION_MINUTES,
            'timezone' => $timezone ?: 'UTC',
            'consultation_method' => 'Google Meet',
            'updated_by' => $actor,
        ];
        if (!empty($meet['success'])) {
            $data['google_meet_space_name'] = (string) ($meet['space_name'] ?? $meet['event_id'] ?? '');
            $data['google_calendar_event_id'] = (string) ($meet['space_name'] ?? $meet['event_id'] ?? '');
            $data['google_meet_code'] = (string) ($meet['meeting_code'] ?? '');
            $data['google_meet_link'] = (string) ($meet['meet_link'] ?? '');
            $data['google_meet_error'] = null;
            $data['google_meet_created_at'] = self::now();
            if (!empty($data['google_meet_space_name'])) {
                wp_schedule_single_event(strtotime($end_mysql . ' UTC'), 'nevari_mtm_end_meet_space', [(int) $row->id]);
            }
        } else {
            $data['google_meet_error'] = sanitize_text_field((string) ($meet['message'] ?? 'Google Meet space could not be created.'));
        }
        $updated = self::update_request((int) $row->id, $data);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated), 'meet' => $meet]);
    }

    private static function create_meet_space_for_request(object $row, string $start, string $end): array {
        $appointment = (object) [
            'id' => (int) $row->id,
            'start_at' => $start,
            'end_at' => $end,
            'google_calendar_event_id' => (string) ($row->google_meet_space_name ?? $row->google_calendar_event_id ?? ''),
            'google_meet_link' => (string) ($row->google_meet_link ?? ''),
        ];
        $pharmacist = get_userdata((int) ($row->assigned_pharmacist_user_id ?? 0));
        $patient = get_userdata((int) $row->customer_user_id);
        $result = Nevari_Helpers::google_meet_event_for_appointment($appointment, $pharmacist ?: null, $patient ?: null);
        if (!empty($result['success']) && empty($result['meeting_code']) && !empty($result['meet_link'])) {
            $path = wp_parse_url((string) $result['meet_link'], PHP_URL_PATH);
            $result['meeting_code'] = $path ? trim((string) $path, '/') : '';
        }
        return $result;
    }

    public static function consultation_complete(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $notes = self::sanitize_deep(is_array($body['consultation_notes'] ?? null) ? $body['consultation_notes'] : $body);
        $actor = Nevari_Auth::api_session_user_id();
        $updated = self::update_request((int) $row->id, [
            'status' => self::STATUS_TREATMENT_COMPLETED,
            'consultation_notes_json' => wp_json_encode($notes),
            'completed_at' => self::now(),
            'updated_by' => $actor,
        ]);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated)]);
    }

    public static function save_action_plan(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $action_plan = self::sanitize_deep(is_array($body['action_plan'] ?? null) ? $body['action_plan'] : $body);
        $updated = self::update_request((int) $row->id, [
            'action_plan_json' => wp_json_encode($action_plan),
            'updated_by' => Nevari_Auth::api_session_user_id(),
        ]);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated)]);
    }

    public static function attach_products(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $items = is_array($body['items'] ?? null) ? $body['items'] : (is_array($body['products'] ?? null) ? $body['products'] : []);
        $safe_items = self::sanitize_product_items($items);
        $updated = self::update_request((int) $row->id, [
            'attached_products_json' => wp_json_encode($safe_items),
            'updated_by' => Nevari_Auth::api_session_user_id(),
        ]);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated), 'items' => $safe_items]);
    }

    private static function sanitize_product_items(array $items): array {
        $safe = [];
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $product_id = absint($item['product_id'] ?? $item['id'] ?? 0);
            $product = $product_id && function_exists('wc_get_product') ? wc_get_product($product_id) : null;
            if (!$product) {
                continue;
            }
            $qty = max(1, min(999, (int) ($item['quantity'] ?? 1)));
            $safe[] = [
                'product_id' => $product_id,
                'name' => sanitize_text_field($product->get_name()),
                'quantity' => $qty,
                'dosage_instruction' => sanitize_text_field((string) ($item['dosage_instruction'] ?? $item['dosage'] ?? '')),
                'usage_note' => sanitize_textarea_field((string) ($item['usage_note'] ?? $item['note'] ?? '')),
                'refill_instruction' => sanitize_text_field((string) ($item['refill_instruction'] ?? '')),
            ];
        }
        return $safe;
    }

    public static function create_product_order(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        if (!function_exists('wc_create_order')) {
            return Nevari_Helpers::error('woocommerce_unavailable', 'WooCommerce is required to create MTM product orders.', 503);
        }
        $items = self::decode_json($row->attached_products_json ?? '[]');
        if (!$items) {
            $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
            $items = self::sanitize_product_items(is_array($body['items'] ?? null) ? $body['items'] : []);
        }
        if (!$items) {
            return Nevari_Helpers::error('missing_products', 'Attach at least one valid pharmacy product.', 422);
        }
        $order = wc_create_order(['customer_id' => (int) $row->customer_user_id]);
        foreach ($items as $item) {
            $product = wc_get_product((int) $item['product_id']);
            if (!$product) {
                continue;
            }
            $order->add_product($product, max(1, (int) $item['quantity']));
        }
        $order->update_meta_data('_nevari_order_source', 'MTM Medication Action Plan');
        $order->update_meta_data('_nevari_mtm_request_id', (int) $row->id);
        $order->update_meta_data('_nevari_pharmacist_user_id', Nevari_Auth::api_session_user_id());
        $order->update_meta_data('_nevari_mtm_products', wp_json_encode($items));
        $order->set_status('pending');
        $order->calculate_totals();
        $order->save();
        $updated = self::update_request((int) $row->id, [
            'order_id' => $order->get_id(),
            'attached_products_json' => wp_json_encode($items),
            'updated_by' => Nevari_Auth::api_session_user_id(),
        ]);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated), 'order_id' => $order->get_id()]);
    }

    public static function follow_up_schedule(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $follow_at = sanitize_text_field((string) ($body['follow_up_at'] ?? $body['scheduled_at'] ?? $body['appointment_start'] ?? ''));
        if ($follow_at === '' || strtotime($follow_at) === false) {
            return Nevari_Helpers::error('missing_follow_up', 'A valid follow-up time is required.', 422);
        }
        $follow_up = self::sanitize_deep([
            'follow_up_at' => gmdate('Y-m-d H:i:s', strtotime($follow_at)),
            'purpose' => $body['purpose'] ?? $body['follow_up_purpose'] ?? '',
            'note' => $body['note'] ?? $body['follow_up_note'] ?? '',
        ]);
        $updated = self::update_request((int) $row->id, [
            'status' => self::STATUS_FOLLOW_UP,
            'follow_up_at' => $follow_up['follow_up_at'],
            'follow_up_json' => wp_json_encode($follow_up),
            'updated_by' => Nevari_Auth::api_session_user_id(),
        ]);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated)]);
    }

    public static function save_outcome_tracking(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        $outcome = self::sanitize_deep(is_array($body['outcome_tracking'] ?? null) ? $body['outcome_tracking'] : $body);
        $updated = self::update_request((int) $row->id, [
            'outcome_tracking_json' => wp_json_encode($outcome),
            'updated_by' => Nevari_Auth::api_session_user_id(),
        ]);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated)]);
    }

    public static function complete_request(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int) $request['id']);
        if ($row instanceof WP_REST_Response) {
            return $row;
        }
        $updated = self::update_request((int) $row->id, [
            'status' => self::STATUS_COMPLETED,
            'completed_at' => self::now(),
            'updated_by' => Nevari_Auth::api_session_user_id(),
        ]);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        self::end_meet_space_for_request((int) $row->id);
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated)]);
    }

    public static function pharmacy_products(WP_REST_Request $request): WP_REST_Response {
        if (!function_exists('wc_get_products')) {
            return Nevari_Helpers::success(['items' => []]);
        }
        $search = sanitize_text_field((string) $request->get_param('search'));
        $products = wc_get_products([
            'status' => 'publish',
            'limit' => 20,
            's' => $search,
            'return' => 'objects',
        ]);
        $items = [];
        foreach ($products as $product) {
            $items[] = [
                'id' => $product->get_id(),
                'product_id' => $product->get_id(),
                'name' => $product->get_name(),
                'price' => (float) $product->get_price(),
                'sku' => $product->get_sku(),
            ];
        }
        return Nevari_Helpers::success(['items' => $items]);
    }

    public static function end_meet_space_for_request(int $request_id): void {
        $row = self::get_request($request_id);
        if (!$row || !empty($row->google_meet_ended_at)) {
            return;
        }
        $space_name = sanitize_text_field((string) ($row->google_meet_space_name ?? $row->google_calendar_event_id ?? ''));
        if ($space_name === '') {
            return;
        }
        $result = Nevari_Helpers::google_meet_end_active_conference($space_name);
        $data = ['google_meet_ended_at' => self::now()];
        if (empty($result['success'])) {
            $data['google_meet_error'] = sanitize_text_field((string) ($result['message'] ?? 'Google Meet active conference could not be ended.'));
        }
        self::update_request($request_id, $data);
    }

    private static function user_name(int $user_id): string {
        if ($user_id <= 0) {
            return '';
        }
        $user = get_userdata($user_id);
        return $user ? (string) $user->display_name : '';
    }

    private static function frontend_dashboard_url(string $frontend_type, string $default_path): string {
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

    private static function customer_dashboard_link(int $request_id): string {
        return add_query_arg([
            'mtm_request_id' => $request_id,
            'mtm_tab' => 'history',
        ], self::frontend_dashboard_url('patient_dashboard', '/dashboard'));
    }

    private static function pharmacist_dashboard_link(int $request_id): string {
        return add_query_arg([
            'mtm_request_id' => $request_id,
        ], self::frontend_dashboard_url('doctors_dashboard', '/admin/doctor'));
    }

    private static function safe_email_link(string $url, string $label): array {
        $safe_url = esc_url_raw($url);
        if ($safe_url === '') {
            return ['html' => '', 'text' => ''];
        }

        return [
            'html' => '<a href="' . esc_url($safe_url) . '">' . esc_html($label) . '</a>',
            'text' => $safe_url,
        ];
    }

    private static function email_datetime_parts(?string $value, string $timezone = 'UTC'): array {
        $raw = is_string($value) ? trim($value) : '';
        if ($raw === '' || strtotime($raw) === false) {
            return [
                'date' => '',
                'time' => '',
                'datetime' => '',
            ];
        }

        try {
            $target_timezone = new DateTimeZone($timezone ?: 'UTC');
        } catch (Exception $exception) {
            $target_timezone = new DateTimeZone('UTC');
        }

        $datetime = new DateTimeImmutable($raw, new DateTimeZone('UTC'));
        $localized = $datetime->setTimezone($target_timezone);

        return [
            'date' => $localized->format('F j, Y'),
            'time' => $localized->format('g:i A'),
            'datetime' => $localized->format('F j, Y g:i A'),
        ];
    }

    private static function mtm_email_variables(object $row, array $overrides = []): array {
        $payload = self::payload_from_request($row);
        $patient = get_userdata((int) $payload['customer_user_id']);
        $pharmacist = get_userdata((int) $payload['assigned_pharmacist_user_id']);
        $request_id = (int) $payload['id'];
        $status_label = self::status_label((string) $payload['status']);
        $scheduled = self::email_datetime_parts($payload['scheduled_at'] ?? null, (string) ($payload['timezone'] ?? 'UTC'));
        $follow_up = self::email_datetime_parts($payload['follow_up_at'] ?? null, (string) ($payload['timezone'] ?? 'UTC'));
        $request_link = self::customer_dashboard_link($request_id);
        $pharmacist_link = self::pharmacist_dashboard_link($request_id);
        $meet_link = esc_url_raw((string) ($payload['google_meet_link'] ?? ''));

        $variables = [
            'patient_name' => $patient instanceof WP_User ? ($patient->display_name ?: $patient->user_login) : ((string) ($payload['patient']['name'] ?? 'Customer') ?: 'Customer'),
            'customer_name' => $patient instanceof WP_User ? ($patient->display_name ?: $patient->user_login) : ((string) ($payload['patient']['name'] ?? 'Customer') ?: 'Customer'),
            'pharmacist_name' => $pharmacist instanceof WP_User ? ($pharmacist->display_name ?: $pharmacist->user_login) : 'Assigned pharmacist',
            'request_reference' => 'MTM #' . $request_id,
            'mtm_request_id' => $request_id,
            'current_status' => $status_label,
            'request_status' => $status_label,
            'appointment_date' => $scheduled['date'],
            'appointment_time' => $scheduled['time'],
            'appointment_datetime' => $scheduled['datetime'],
            'follow_up_date' => $follow_up['date'],
            'follow_up_time' => $follow_up['time'],
            'follow_up_datetime' => $follow_up['datetime'],
            'timezone' => (string) ($payload['timezone'] ?: 'UTC'),
            'consultation_method' => (string) ($payload['consultation_method'] ?: 'Google Meet'),
            'google_meet_link' => $meet_link,
            'google_meet_link_html' => $meet_link ? self::safe_email_link($meet_link, 'Join Google Meet') : '',
            'mtm_request_link' => $request_link,
            'mtm_request_link_html' => self::safe_email_link($request_link, 'View MTM request'),
            'dashboard_link' => $request_link,
            'pharmacist_dashboard_link' => $pharmacist_link,
            'pharmacist_dashboard_link_html' => self::safe_email_link($pharmacist_link, 'Open MTM queue'),
            'order_id' => !empty($payload['order_id']) ? (int) $payload['order_id'] : '',
        ];

        return array_merge($variables, $overrides);
    }

    private static function json_column_changed(object $before, object $after, string $column): bool {
        return self::decode_json($before->{$column} ?? '[]') !== self::decode_json($after->{$column} ?? '[]');
    }

    private static function json_column_has_content(object $row, string $column): bool {
        return !empty(self::decode_json($row->{$column} ?? '[]'));
    }

    private static function queue_mtm_email(string $template_key, ?WP_User $recipient, object $row, array $variables, string $recipient_role): void {
        if (!($recipient instanceof WP_User) || empty($recipient->user_email) || !is_email($recipient->user_email)) {
            self::log_missing_notification_recipient($row, $recipient_role, $template_key);
            return;
        }

        $result = Nevari_Emails::queue_or_send([
            'template_key' => $template_key,
            'recipient_user_id' => (int) $recipient->ID,
            'recipient_email' => $recipient->user_email,
            'related_object_type' => 'mtm_request',
            'related_object_id' => (int) $row->id,
            'variables' => $variables,
        ], false);

        if (is_wp_error($result)) {
            Nevari_Audit::log('emails', 'nevari', 'mtm.email_queue_failed', 'error', [
                'object_type' => 'mtm_request',
                'object_id' => (int) $row->id,
                'related_user_id' => (int) $recipient->ID,
                'template_key' => $template_key,
                'error_code' => $result->get_error_code(),
                'error_message' => $result->get_error_message(),
                'message' => 'MTM email could not be queued.',
            ]);
        }
    }

    private static function log_missing_notification_recipient(object $row, string $recipient_role, string $template_key): void {
        Nevari_Audit::log('emails', 'nevari', 'mtm.notification_recipient_missing', 'error', [
            'object_type' => 'mtm_request',
            'object_id' => (int) $row->id,
            'template_key' => $template_key,
            'recipient_role' => $recipient_role,
            'message' => 'MTM email recipient is unavailable.',
        ]);
    }

    private static function dispatch_request_submission_notifications(object $row): void {
        $patient = get_userdata((int) $row->customer_user_id);
        $pharmacist = get_userdata((int) ($row->assigned_pharmacist_user_id ?? 0));
        $variables = self::mtm_email_variables($row);

        self::queue_mtm_email('mtm_request_submitted_customer', $patient instanceof WP_User ? $patient : null, $row, $variables, 'customer');
        self::queue_mtm_email('mtm_request_submitted_pharmacist', $pharmacist instanceof WP_User ? $pharmacist : null, $row, $variables, 'pharmacist');
    }

    private static function dispatch_request_update_notifications(object $before, object $after): void {
        $patient = get_userdata((int) $after->customer_user_id);
        $pharmacist = get_userdata((int) ($after->assigned_pharmacist_user_id ?? 0));
        $before_status = self::normalize_status((string) ($before->status ?? self::STATUS_SUBMITTED));
        $after_status = self::normalize_status((string) ($after->status ?? self::STATUS_SUBMITTED));
        $base_variables = self::mtm_email_variables($after, [
            'previous_status' => self::status_label($before_status),
            'current_status' => self::status_label($after_status),
        ]);

        if ($before_status !== $after_status) {
            self::queue_mtm_email('mtm_request_status_changed_customer', $patient instanceof WP_User ? $patient : null, $after, $base_variables, 'customer');
            self::queue_mtm_email('mtm_request_status_changed_pharmacist', $pharmacist instanceof WP_User ? $pharmacist : null, $after, $base_variables, 'pharmacist');

            if ($after_status === self::STATUS_APPROVED) {
                self::queue_mtm_email('mtm_request_approved_customer', $patient instanceof WP_User ? $patient : null, $after, $base_variables, 'customer');
            }
        }

        $schedule_changed = (
            (string) ($before->scheduled_at ?? '') !== (string) ($after->scheduled_at ?? '')
            || (string) ($before->google_meet_link ?? '') !== (string) ($after->google_meet_link ?? '')
        );
        if ($schedule_changed && !empty($after->scheduled_at)) {
            self::queue_mtm_email('mtm_request_scheduled_customer', $patient instanceof WP_User ? $patient : null, $after, $base_variables, 'customer');
        }

        if (self::json_column_changed($before, $after, 'action_plan_json') && self::json_column_has_content($after, 'action_plan_json')) {
            self::dispatch_documentation_notifications($after, $patient, $pharmacist, $base_variables, 'Action Plan Saved', 'A medication action plan was added to this MTM request.');
        }

        if (self::json_column_changed($before, $after, 'attached_products_json') && self::json_column_has_content($after, 'attached_products_json')) {
            self::dispatch_documentation_notifications($after, $patient, $pharmacist, $base_variables, 'Products Attached', 'Pharmacy products were attached to this MTM request.');
        }

        if (self::json_column_changed($before, $after, 'consultation_notes_json') && self::json_column_has_content($after, 'consultation_notes_json')) {
            self::dispatch_documentation_notifications($after, $patient, $pharmacist, $base_variables, 'Consultation Completed', 'Consultation documentation was added to this MTM request.');
        }

        if (self::json_column_changed($before, $after, 'follow_up_json') && self::json_column_has_content($after, 'follow_up_json')) {
            self::dispatch_documentation_notifications($after, $patient, $pharmacist, $base_variables, 'Follow-Up Scheduled', 'A follow-up visit was scheduled for this MTM request.');
        }

        if (self::json_column_changed($before, $after, 'outcome_tracking_json') && self::json_column_has_content($after, 'outcome_tracking_json')) {
            self::dispatch_documentation_notifications($after, $patient, $pharmacist, $base_variables, 'Outcome Tracking Saved', 'Outcome tracking details were added to this MTM request.');
        }

        $before_order_id = (int) ($before->order_id ?? 0);
        $after_order_id = (int) ($after->order_id ?? 0);
        if ($after_order_id > 0 && $before_order_id !== $after_order_id) {
            $order_variables = array_merge($base_variables, ['order_id' => $after_order_id]);
            self::queue_mtm_email('mtm_request_order_created_customer', $patient instanceof WP_User ? $patient : null, $after, $order_variables, 'customer');
            self::queue_mtm_email('mtm_request_order_created_pharmacist', $pharmacist instanceof WP_User ? $pharmacist : null, $after, $order_variables, 'pharmacist');
        }
    }

    private static function dispatch_documentation_notifications(object $row, ?WP_User $patient, ?WP_User $pharmacist, array $base_variables, string $label, string $description): void {
        $variables = array_merge($base_variables, [
            'update_label' => $label,
            'update_description' => $description,
        ]);

        self::queue_mtm_email('mtm_request_documentation_added_customer', $patient instanceof WP_User ? $patient : null, $row, $variables, 'customer');
        self::queue_mtm_email('mtm_request_documentation_added_pharmacist', $pharmacist instanceof WP_User ? $pharmacist : null, $row, $variables, 'pharmacist');
    }
}
