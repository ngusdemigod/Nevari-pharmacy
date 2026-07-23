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
    private const STATUS_DECLINED = 'declined';
    private const ACTIVE_STATUSES = ['submitted', 'under_review', 'approved', 'scheduled', 'treatment_completed', 'follow_up'];
    private const MTM_DURATION_MINUTES = 30;
    private const PDF_MAX_BYTES = 41943040;
    private const PDF_VERSION = 'mtm-v1';
    private const SLOT_HOLD_EXPIRY_HOOK = 'nevari_mtm_expire_slot_hold';

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_filter('rest_pre_serve_request', [__CLASS__, 'serve_private_document'], 10, 4);
        add_action('nevari_mtm_end_meet_space', [__CLASS__, 'end_meet_space_for_request'], 10, 1);
        add_action('woocommerce_payment_complete', [__CLASS__, 'payment_completed'], 10, 1);
        add_action('woocommerce_order_status_processing', [__CLASS__, 'payment_completed'], 10, 1);
        add_action('woocommerce_order_status_completed', [__CLASS__, 'payment_completed'], 10, 1);
        add_action(self::SLOT_HOLD_EXPIRY_HOOK, [__CLASS__, 'expire_slot_hold'], 10, 1);
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests/(?P<id>\d+)/reschedule', [
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'customer_reschedule_request'],
                'permission_callback' => [__CLASS__, 'customer_permission'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests/(?P<id>\d+)/submission-pdf', [
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'customer_submission_pdf'],
                'permission_callback' => [__CLASS__, 'submission_pdf_permission'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests/(?P<id>\d+)/document', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'document_download'],
                'permission_callback' => [__CLASS__, 'document_permission'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests/(?P<id>\d+)/booking-context', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'booking_context'],
                'permission_callback' => [__CLASS__, 'customer_request_permission'],
            ],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests/(?P<id>\d+)/reserve-slot', [
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'customer_reserve_slot'],
                'permission_callback' => [__CLASS__, 'customer_request_permission'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/mtm-requests/join/(?P<token>[A-Za-z0-9\-_\.]+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'join_access'],
                'permission_callback' => '__return_true',
            ],
        ]);

        self::register_pharmacist_routes('/pharmacist/mtm-requests', 'pharmacist_permission');

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/admin/mtm-requests', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'pharmacist_index'],
                'permission_callback' => static function (): bool {
                    $user_id = Nevari_Auth::api_session_user_id();
                    return Nevari_Auth::api_session_required() && Nevari_Helpers::is_store_admin($user_id);
                },
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/pharmacist/pharmacy-products', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'pharmacy_products'],
                'permission_callback' => [__CLASS__, 'pharmacist_permission'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/pharmacist/availability', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'pharmacist_availability'],
                'permission_callback' => [__CLASS__, 'pharmacist_self_permission'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'update_pharmacist_availability'],
                'permission_callback' => [__CLASS__, 'pharmacist_self_permission'],
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
                'permission_callback' => [__CLASS__, 'pharmacist_request_permission'],
            ],
        ]);

        $actions = [
            'approve' => 'approve_request',
            'decline' => 'decline_request',
            'refund-complete' => 'refund_complete',
            'schedule' => 'schedule',
            'consultation-complete' => 'consultation_complete',
            'action-plan' => 'save_action_plan',
            'outcome-tracking' => 'save_outcome_tracking',
            'complete' => 'complete_request',
            'attach-products' => 'attach_products',
            'create-product-order' => 'create_product_order',
            'products' => 'attach_products',
            'orders' => 'create_product_order',
        ];

        foreach ($actions as $action => $callback) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, $base . '/(?P<id>\d+)/' . $action, [
                [
                    'methods' => WP_REST_Server::CREATABLE,
                    'callback' => [__CLASS__, $callback],
                    'permission_callback' => [__CLASS__, 'pharmacist_request_permission'],
                ],
            ]);
        }
    }

    public static function customer_permission(): bool {
        return Nevari_Auth::api_session_required();
    }

    public static function customer_request_permission(WP_REST_Request $request): bool {
        if (!Nevari_Auth::api_session_required()) return false;
        $row = self::get_request(absint($request['id']));
        return $row && (int) $row->customer_user_id === Nevari_Auth::api_session_user_id();
    }
    public static function pharmacist_permission(): bool {
        return Nevari_Auth::api_session_required() && (Nevari_Helpers::is_pharmacist() || Nevari_Helpers::is_store_admin());
    }

    public static function pharmacist_self_permission(): bool {
        return Nevari_Auth::api_session_required() && Nevari_Helpers::is_pharmacist();
    }

    public static function pharmacist_availability(): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        $availability = get_user_meta($user_id, '_nevari_availability', true);
        return Nevari_Helpers::success(['availability' => is_array($availability) ? $availability : []]);
    }

    public static function update_pharmacist_availability(WP_REST_Request $request): WP_REST_Response {
        $params = $request->get_json_params();
        if (!is_array($params) || array_diff(array_keys($params), ['availability'])) {
            return Nevari_Helpers::error('invalid_availability_payload', 'Only availability may be updated.', 422);
        }
        $submitted = isset($params['availability']) && is_array($params['availability']) ? $params['availability'] : [];
        $allowed_days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        $availability = [];

        foreach ($allowed_days as $day) {
            $ranges = isset($submitted[$day]) && is_array($submitted[$day]) ? $submitted[$day] : [];
            foreach (array_slice($ranges, 0, 8) as $range) {
                $start = sanitize_text_field((string) ($range['start'] ?? ''));
                $end = sanitize_text_field((string) ($range['end'] ?? ''));
                if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $start) || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $end) || $start >= $end) {
                    continue;
                }
                $availability[$day][] = ['start' => $start, 'end' => $end];
            }
        }

        $user_id = Nevari_Auth::api_session_user_id();
        update_user_meta($user_id, '_nevari_availability', $availability);
        Nevari_Audit::log('consultation', 'nevari', 'pharmacist.availability_updated', 'success', ['related_user_id' => $user_id]);
        return Nevari_Helpers::success(['availability' => $availability]);
    }

    public static function pharmacist_request_permission(WP_REST_Request $request): bool {
        if (!self::pharmacist_permission()) return false;
        $row = self::get_request(absint($request['id']));
        if (!$row) return false;
        $user_id = Nevari_Auth::api_session_user_id();
        return Nevari_Helpers::is_store_admin($user_id) || (int) $row->assigned_pharmacist_user_id === $user_id;
    }
    public static function submission_pdf_permission(WP_REST_Request $request): bool {
        if (!Nevari_Auth::api_session_required()) {
            return false;
        }
        $row = self::get_request(absint($request['id']));
        return $row && (int) $row->customer_user_id === Nevari_Auth::api_session_user_id();
    }

    public static function document_permission(WP_REST_Request $request): bool {
        if (!Nevari_Auth::api_session_required()) {
            return false;
        }
        $row = self::get_request(absint($request['id']));
        if (!$row) {
            return false;
        }
        $user_id = Nevari_Auth::api_session_user_id();
        if ((int) $row->customer_user_id === $user_id || Nevari_Helpers::is_store_admin($user_id)) {
            return true;
        }
        return Nevari_Helpers::is_pharmacist($user_id)
            && (int) ($row->assigned_pharmacist_user_id ?? 0) === $user_id;
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

    private static function store_timezone(): string {
        $timezone = function_exists('wp_timezone_string') ? wp_timezone_string() : '';
        $timezone = is_string($timezone) ? trim($timezone) : '';
        return $timezone !== '' ? $timezone : 'UTC';
    }

    private static function public_request_reference(int $id): string {
        return sprintf('MTM-%06d', max(1, $id));
    }

    private static function ensure_request_reference(int $id): string {
        global $wpdb;
        $row = self::get_request($id);
        if (!$row) {
            return '';
        }
        $reference = sanitize_text_field((string) ($row->request_reference ?? ''));
        if ($reference !== '') {
            return $reference;
        }
        $reference = self::public_request_reference($id);
        $wpdb->update(self::table(), ['request_reference' => $reference], ['id' => $id], ['%s'], ['%d']);
        return $reference;
    }

    private static function is_google_meet_url(string $value): bool {
        return (bool) preg_match('#^https://meet\.google\.com/[a-z0-9-]+#i', trim($value));
    }

    private static function raw_meeting_link(object $row): string {
        $link = esc_url_raw((string) ($row->google_meet_link ?? ''));
        return self::is_google_meet_url($link) ? $link : '';
    }

    private static function meeting_state(object $row): string {
        if (!empty($row->google_meet_ended_at)) {
            return 'ended';
        }
        if (self::raw_meeting_link($row) !== '' && !empty($row->scheduled_at)) {
            return 'active';
        }
        return 'pending';
    }

    private static function attendance_status(object $row): string {
        $missed_role = strtolower((string) ($row->missed_attendance_role ?? ''));
        if (!empty($row->missed_attendance_at) || $missed_role !== '') {
            if ($missed_role === 'pharmacist') {
                return 'pharmacist_absent';
            }
            if ($missed_role === 'customer') {
                return 'customer_absent';
            }
            return 'missed';
        }
        $customer_checked_in = !empty($row->customer_checked_in_at);
        $pharmacist_checked_in = !empty($row->pharmacist_checked_in_at);
        if ($customer_checked_in && $pharmacist_checked_in) {
            return 'attended';
        }
        if ($customer_checked_in || $pharmacist_checked_in) {
            return 'partial';
        }
        return '';
    }

    private static function reschedule_eligible(object $row): bool {
        return !empty($row->scheduled_at)
            && (
                !empty($row->missed_attendance_at)
                || (!empty($row->google_meet_ended_at) && (empty($row->customer_checked_in_at) || empty($row->pharmacist_checked_in_at)))
            )
            && !in_array(self::normalize_status((string) ($row->status ?? '')), [self::STATUS_COMPLETED], true);
    }

    private static function frontend_origin(string $frontend_type, string $default_path = ''): string {
        return rtrim(Nevari_Helpers::frontend_dashboard_url($default_path ?: '/'), '/');
    }

    private static function customer_detail_link(int $request_id): string {
        return self::frontend_origin('patient_dashboard', '/dashboard') . '/therapy/' . rawurlencode((string) $request_id);
    }

    private static function pharmacist_queue_link(int $request_id): string {
        return add_query_arg([
            'mtm_request_id' => $request_id,
        ], self::frontend_dashboard_url('pharmacist_dashboard', '/admin/pharmacist'));
    }

    private static function join_valid_from_at(object $row): string {
        $start_ts = strtotime((string) ($row->scheduled_at ?? '') . ' UTC');
        if (!$start_ts) {
            return '';
        }
        return gmdate('Y-m-d H:i:s', max(0, $start_ts - (5 * MINUTE_IN_SECONDS)));
    }

    private static function join_expires_at(object $row): string {
        $start_ts = strtotime((string) ($row->scheduled_at ?? '') . ' UTC');
        if (!$start_ts) {
            return '';
        }
        return gmdate('Y-m-d H:i:s', $start_ts + ((self::MTM_DURATION_MINUTES + 15) * MINUTE_IN_SECONDS));
    }

    private static function join_token(object $row, string $role): string {
        $role = $role === 'pharmacist' ? 'pharmacist' : 'customer';
        $valid_from_at = (string) ($row->join_valid_from_at ?? '') ?: self::join_valid_from_at($row);
        $expires_at = (string) ($row->join_expires_at ?? '') ?: self::join_expires_at($row);
        if (empty($row->id) || $valid_from_at === '' || $expires_at === '') {
            return '';
        }
        $payload = [
            'purpose' => 'mtm_join',
            'mtm_request_id' => (int) $row->id,
            'role' => $role,
            'valid_from' => strtotime($valid_from_at . ' UTC'),
            'exp' => strtotime($expires_at . ' UTC'),
        ];
        if (empty($payload['valid_from']) || empty($payload['exp'])) {
            return '';
        }
        $encoded = Nevari_Helpers::base64url_encode(wp_json_encode($payload));
        $signature = Nevari_Helpers::base64url_encode(hash_hmac('sha256', $encoded, Nevari_Helpers::jwt_secret(), true));
        return $encoded . '.' . $signature;
    }

    private static function ensure_join_access(object $row): object {
        global $wpdb;
        $updates = [];
        $valid_from_at = (string) ($row->join_valid_from_at ?? '');
        $expires_at = (string) ($row->join_expires_at ?? '');
        if ($valid_from_at === '') {
            $valid_from_at = self::join_valid_from_at($row);
            $updates['join_valid_from_at'] = $valid_from_at;
        }
        if ($expires_at === '') {
            $expires_at = self::join_expires_at($row);
            $updates['join_expires_at'] = $expires_at;
        }
        $customer_token = self::join_token($row, 'customer');
        $pharmacist_token = self::join_token($row, 'pharmacist');
        $customer_hash = $customer_token ? hash('sha256', $customer_token) : '';
        $pharmacist_hash = $pharmacist_token ? hash('sha256', $pharmacist_token) : '';
        if ($customer_hash !== '' && (string) ($row->customer_join_token_hash ?? '') !== $customer_hash) {
            $updates['customer_join_token_hash'] = $customer_hash;
        }
        if ($pharmacist_hash !== '' && (string) ($row->pharmacist_join_token_hash ?? '') !== $pharmacist_hash) {
            $updates['pharmacist_join_token_hash'] = $pharmacist_hash;
        }
        if ($updates) {
            $updates['updated_at'] = self::now();
            $wpdb->update(self::table(), $updates, ['id' => (int) $row->id], array_fill(0, count($updates), '%s'), ['%d']);
            $row = self::get_request((int) $row->id) ?: $row;
        }
        return $row;
    }

    private static function join_url(object $row, string $role): string {
        if (self::raw_meeting_link($row) === '' || empty($row->scheduled_at)) {
            return '';
        }
        $row = self::ensure_join_access($row);
        $token = self::join_token($row, $role);
        if ($token === '') {
            return '';
        }
        $stored_hash = (string) ($role === 'pharmacist' ? ($row->pharmacist_join_token_hash ?? '') : ($row->customer_join_token_hash ?? ''));
        if ($stored_hash === '' || !hash_equals($stored_hash, hash('sha256', $token))) {
            return '';
        }
        return self::frontend_origin('patient_dashboard', '/dashboard') . '/therapy/join/' . rawurlencode($token);
    }

    private static function decode_join_token(string $token): array {
        $parts = explode('.', trim($token));
        if (count($parts) !== 2) {
            return ['valid' => false, 'code' => 'invalid_token'];
        }
        [$encoded, $signature] = $parts;
        $expected = Nevari_Helpers::base64url_encode(hash_hmac('sha256', $encoded, Nevari_Helpers::jwt_secret(), true));
        if (!hash_equals($expected, $signature)) {
            return ['valid' => false, 'code' => 'invalid_signature'];
        }
        $payload = json_decode(Nevari_Helpers::base64url_decode($encoded), true);
        if (!is_array($payload) || ($payload['purpose'] ?? '') !== 'mtm_join') {
            return ['valid' => false, 'code' => 'invalid_payload'];
        }
        return ['valid' => true, 'payload' => $payload];
    }

    private static function site_datetime_to_utc_mysql(string $value, string $timezone = ''): ?string {
        $raw = trim((string) $value);
        if ($raw === '') {
            return null;
        }
        try {
            $site_timezone = new DateTimeZone($timezone !== '' ? $timezone : self::store_timezone());
            $datetime = new DateTimeImmutable($raw, $site_timezone);
            return $datetime->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s');
        } catch (Exception $exception) {
            $timestamp = strtotime($raw);
            return $timestamp ? gmdate('Y-m-d H:i:s', $timestamp) : null;
        }
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
            self::STATUS_DECLINED,
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
            self::STATUS_DECLINED => 'Declined',
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

    private static function pdf_signing_secret(): string {
        if (defined('NEVARI_MTM_PDF_SIGNING_SECRET') && is_string(NEVARI_MTM_PDF_SIGNING_SECRET) && trim(NEVARI_MTM_PDF_SIGNING_SECRET) !== '') {
            return trim(NEVARI_MTM_PDF_SIGNING_SECRET);
        }
        if (defined('NEVARI_PROXY_SIGNING_SECRET') && is_string(NEVARI_PROXY_SIGNING_SECRET) && trim(NEVARI_PROXY_SIGNING_SECRET) !== '') {
            return trim(NEVARI_PROXY_SIGNING_SECRET);
        }
        $env = getenv('NEVARI_MTM_PDF_SIGNING_SECRET');
        if (is_string($env) && trim($env) !== '') {
            return trim($env);
        }
        $proxy_env = getenv('NEVARI_PROXY_SIGNING_SECRET');
        if (is_string($proxy_env) && trim($proxy_env) !== '') {
            return trim($proxy_env);
        }
        return '';
    }

    private static function normalize_email_attachments(array $attachments): array {
        $normalized = [];
        foreach ($attachments as $attachment) {
            if (!is_array($attachment)) {
                continue;
            }
            $filename = sanitize_file_name((string) ($attachment['filename'] ?? ''));
            $base64 = trim((string) ($attachment['base64'] ?? $attachment['content'] ?? $attachment['content_base64'] ?? ''));
            if ($base64 !== '' && strpos($base64, 'base64,') !== false) {
                $parts = explode('base64,', $base64, 2);
                $base64 = isset($parts[1]) ? trim((string) $parts[1]) : '';
            }
            if ($base64 !== '') {
                $base64 = preg_replace('/\s+/', '', $base64) ?? '';
            }
            if ($filename === '' || $base64 === '') {
                continue;
            }
            $normalized[] = [
                'filename' => $filename,
                'content_type' => sanitize_text_field((string) ($attachment['content_type'] ?? 'application/pdf')),
                'mime_type' => sanitize_text_field((string) ($attachment['mime_type'] ?? 'application/pdf')),
                'base64' => $base64,
                'content' => $base64,
            ];
        }
        return $normalized;
    }

    private static function decode_pdf_snapshot_token(string $token): array {
        $parts = explode('.', trim($token));
        if (count($parts) !== 2) {
            return ['valid' => false, 'code' => 'invalid_token'];
        }
        [$encoded, $signature] = $parts;
        $secret = self::pdf_signing_secret();
        if ($secret === '' || strlen($secret) < 32 || $signature === '' || $signature === 'unsigned') {
            return ['valid' => false, 'code' => 'signing_unavailable'];
        }
        $expected = Nevari_Helpers::base64url_encode(hash_hmac('sha256', $encoded, $secret, true));
        if (!hash_equals($expected, $signature)) {
            return ['valid' => false, 'code' => 'invalid_signature'];
        }
        $payload = json_decode(Nevari_Helpers::base64url_decode($encoded), true);
        if (!is_array($payload) || ($payload['purpose'] ?? '') !== 'mtm_submission_pdf') {
            return ['valid' => false, 'code' => 'invalid_payload'];
        }
        return ['valid' => true, 'payload' => $payload];
    }

    private static function verify_submission_snapshot_token(object $row, string $token, string $fingerprint): bool {
        $decoded = self::decode_pdf_snapshot_token($token);
        if (empty($decoded['valid'])) {
            return false;
        }
        $payload = is_array($decoded['payload'] ?? null) ? $decoded['payload'] : [];
        $request_id = (int) ($payload['requestId'] ?? 0);
        $customer_user_id = (int) ($payload['customerUserId'] ?? 0);
        $reference = sanitize_text_field((string) ($payload['requestReference'] ?? ''));
        $token_fingerprint = sanitize_text_field((string) ($payload['fingerprint'] ?? ''));
        $expires_at = (int) ($payload['exp'] ?? 0);
        if ($expires_at <= time()) {
            return false;
        }
        return $request_id === (int) $row->id
            && $customer_user_id === (int) $row->customer_user_id
            && $reference === self::ensure_request_reference((int) $row->id)
            && $token_fingerprint !== ''
            && hash_equals($token_fingerprint, $fingerprint);
    }

    private static function submission_dispatch_option_key(int $request_id): string {
        return '_nevari_mtm_submission_dispatch_' . max(1, $request_id);
    }

    private static function payload_from_request(object $row): array {
        $reference = sanitize_text_field((string) ($row->request_reference ?? '')) ?: self::public_request_reference((int) $row->id);
        $customer_join_url = self::join_url($row, 'customer');
        $pharmacist_join_url = self::join_url($row, 'pharmacist');
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
            'request_reference' => $reference,
            'title' => $reference,
            'customer_user_id' => (int) $row->customer_user_id,
            'assigned_pharmacist_id' => $assigned_pharmacist_id,
            'assigned_pharmacist_user_id' => $assigned_pharmacist_id,
            'assigned_pharmacist_name' => self::user_name($assigned_pharmacist_id),
            'reviewed_by_pharmacist_id' => $reviewed_by_pharmacist_id,
            'reviewed_by_pharmacist_user_id' => $reviewed_by_pharmacist_id,
            'status' => $status,
            'status_label' => self::status_label($status),
            'patient' => self::decode_json($row->patient_data ?? '[]'),
            'emergency_contact' => self::decode_json($row->emergency_contact_data ?? '[]'),
            'medical_history' => self::decode_json($row->medical_history_data ?? '[]'),
            'medication_profile' => self::decode_json($row->medication_profile_data ?? '[]'),
            'adherence_assessment' => self::decode_json($row->adherence_assessment_data ?? '[]'),
            'additional_information' => self::decode_json($row->additional_information_data ?? '[]'),
            'attachments' => self::decode_json($row->attachments_json ?? '[]'),
            'document' => [
                'status' => sanitize_key((string) ($row->submission_pdf_status ?? 'pending')) ?: 'pending',
                'available' => (string) ($row->submission_pdf_status ?? '') === 'ready',
                'download_path' => (string) ($row->submission_pdf_status ?? '') === 'ready'
                    ? '/mtm-requests/' . (int) $row->id . '/document'
                    : '',
                'size' => (int) ($row->submission_pdf_size ?? 0),
                'created_at' => (string) ($row->submission_pdf_created_at ?? ''),
            ],
            'action_plan' => self::decode_json($row->action_plan_json ?? '[]'),
            'attached_products' => self::decode_json($row->attached_products_json ?? '[]'),
            'consultation_notes' => self::decode_json($row->consultation_notes_json ?? '[]'),
            'follow_up' => self::decode_json($row->follow_up_json ?? '[]'),
            'outcome_tracking' => self::decode_json($row->outcome_tracking_json ?? '[]'),
            'order_id' => !empty($row->order_id) ? (int) $row->order_id : null,
            'payment' => [
                'state' => sanitize_key((string) ($row->payment_state ?? 'pending')),
                'order_id' => (int) ($row->payment_order_id ?? 0),
                'required' => !in_array((string) ($row->payment_state ?? ''), ['paid','quota_reserved'], true),
            ],
            'quota_reservation_id' => (int) ($row->quota_reservation_id ?? 0),
            'slot_reservation' => [
                'state' => sanitize_key((string) ($row->slot_state ?? 'unreserved')),
                'start_at' => !empty($row->reserved_start_at) ? (string) $row->reserved_start_at : null,
                'end_at' => !empty($row->reserved_end_at) ? (string) $row->reserved_end_at : null,
                'hold_expires_at' => !empty($row->slot_hold_expires_at) ? (string) $row->slot_hold_expires_at : null,
            ],
            'clinical_decision' => sanitize_key((string) ($row->clinical_decision ?? '')),
            'rejection_reason' => sanitize_text_field((string) ($row->rejection_reason ?? '')),
            'refund' => [
                'state' => sanitize_key((string) ($row->refund_state ?? 'not_required')),
                'reference' => sanitize_text_field((string) ($row->refund_reference ?? '')),
                'completed_at' => !empty($row->refund_completed_at) ? (string) $row->refund_completed_at : null,
            ],            'scheduled_at' => !empty($row->scheduled_at) ? (string) $row->scheduled_at : null,
            'duration_minutes' => self::MTM_DURATION_MINUTES,
            'timezone' => (string) ($row->timezone ?? 'UTC'),
            'consultation_method' => (string) ($row->consultation_method ?? 'Google Meet'),
            'google_meet' => $meet,
            'google_meet_link' => $customer_join_url,
            'meet_link' => $customer_join_url,
            'join_url' => $customer_join_url,
            'customer_join_url' => $customer_join_url,
            'pharmacist_join_url' => $pharmacist_join_url,
            'meeting_link' => $customer_join_url,
            'raw_google_meet_link' => $meet['meeting_uri'],
            'meeting_state' => self::meeting_state($row),
            'attendance_status' => self::attendance_status($row),
            'can_reschedule' => self::reschedule_eligible($row),
            'customer_checked_in_at' => !empty($row->customer_checked_in_at) ? (string) $row->customer_checked_in_at : null,
            'pharmacist_checked_in_at' => !empty($row->pharmacist_checked_in_at) ? (string) $row->pharmacist_checked_in_at : null,
            'join_valid_from_at' => !empty($row->join_valid_from_at) ? (string) $row->join_valid_from_at : null,
            'join_expires_at' => !empty($row->join_expires_at) ? (string) $row->join_expires_at : null,
            'missed_attendance_at' => !empty($row->missed_attendance_at) ? (string) $row->missed_attendance_at : null,
            'missed_attendance_role' => !empty($row->missed_attendance_role) ? (string) $row->missed_attendance_role : null,
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

    private static function pharmacist_is_eligible(int $user_id): bool {
        $user = get_userdata($user_id);
        return $user instanceof WP_User
            && in_array('pharmacist', (array) $user->roles, true)
            && !get_user_meta($user_id, '_nevari_pharmacist_suspended', true)
            && class_exists('Nevari_User_Governance')
            && Nevari_User_Governance::can_authenticate($user_id);
    }

    private static function eligible_pharmacist_ids(): array {
        global $wpdb;
        $governance_table = Nevari_Helpers::table('user_governance');
        if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $governance_table)) !== $governance_table) {
            return [];
        }
        $ids = $wpdb->get_col(
            "SELECT user_id FROM {$governance_table} WHERE managed_role = 'pharmacist' AND account_status = 'approved' ORDER BY user_id ASC"
        );
        return array_values(array_filter(array_map('absint', (array) $ids), [__CLASS__, 'pharmacist_is_eligible']));
    }

    private static function round_robin_pharmacist_ids(array $candidate_ids): array {
        global $wpdb;
        $candidate_ids = array_values(array_unique(array_filter(array_map('absint', $candidate_ids))));
        if (!$candidate_ids) {
            return [];
        }
        $placeholders = implode(',', array_fill(0, count($candidate_ids), '%d'));
        $sql = $wpdb->prepare(
            'SELECT assigned_pharmacist_user_id, MAX(assigned_at) AS last_assigned_at FROM ' . self::table()
            . " WHERE assigned_pharmacist_user_id IN ({$placeholders}) GROUP BY assigned_pharmacist_user_id",
            $candidate_ids
        );
        $last_assigned = [];
        foreach ((array) $wpdb->get_results($sql) as $row) {
            $last_assigned[(int) $row->assigned_pharmacist_user_id] = (string) ($row->last_assigned_at ?? '');
        }
        usort($candidate_ids, static function (int $left, int $right) use ($last_assigned): int {
            $left_at = $last_assigned[$left] ?? '';
            $right_at = $last_assigned[$right] ?? '';
            if ($left_at === $right_at) {
                return $left <=> $right;
            }
            if ($left_at === '') {
                return -1;
            }
            if ($right_at === '') {
                return 1;
            }
            return strcmp($left_at, $right_at);
        });
        return $candidate_ids;
    }

    private static function insert_request(int $customer_id, array $payload): int {
        global $wpdb;
        $now = self::now();
        $assigned = (int) ($payload['assigned_pharmacist_user_id'] ?? 0);
        $wpdb->insert(self::table(), [
            'customer_user_id' => $customer_id,
            'request_reference' => null,
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
            'timezone' => sanitize_text_field((string) ($payload['timezone'] ?? self::store_timezone())) ?: self::store_timezone(),
            'consultation_method' => 'Google Meet',
            'customer_join_token_hash' => null,
            'pharmacist_join_token_hash' => null,
            'join_valid_from_at' => null,
            'join_expires_at' => null,
            'customer_checked_in_at' => null,
            'pharmacist_checked_in_at' => null,
            'missed_attendance_at' => null,
            'missed_attendance_role' => null,
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
        $request_id = (int) $wpdb->insert_id;
        if ($request_id > 0) {
            self::ensure_request_reference($request_id);
        }
        return $request_id;
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
        $emergency_contact = self::sanitize_deep(is_array($body['emergency_contact'] ?? null) ? $body['emergency_contact'] : []);
        $skip_clinical_sections = strcasecmp((string) ($emergency_contact['consentToDiscussCare'] ?? ''), 'No') === 0;
        $raw_attachments = $skip_clinical_sections ? [] : (is_array($body['attachments'] ?? null) ? array_values($body['attachments']) : []);
        if (count($raw_attachments) > 8) {
            return Nevari_Helpers::error('invalid_mtm_attachments', 'A maximum of 8 MTM images may be uploaded.', 422);
        }
        $attachments = [];
        $allowed_attachment_types = ['image/png', 'image/jpeg', 'image/webp'];
        $allowed_attachment_categories = ['medication', 'previous_medication', 'lab_result'];
        foreach ($raw_attachments as $attachment) {
            if (!is_array($attachment)) {
                return Nevari_Helpers::error('invalid_mtm_attachment', 'Invalid MTM image metadata.', 422);
            }
            $name = sanitize_file_name((string) ($attachment['name'] ?? ''));
            $type = sanitize_mime_type((string) ($attachment['type'] ?? ''));
            $size = absint($attachment['size'] ?? 0);
            $category = sanitize_key((string) ($attachment['category'] ?? ''));
            $heading = sanitize_text_field((string) ($attachment['heading'] ?? ''));
            if (!$name || !preg_match('/\.(png|jpe?g|webp)$/i', $name) || !in_array($type, $allowed_attachment_types, true) || $size < 1 || $size > 5 * MB_IN_BYTES || !in_array($category, $allowed_attachment_categories, true) || !$heading) {
                return Nevari_Helpers::error('invalid_mtm_attachment', 'MTM images must be PNG, JPG, JPEG, or WebP and no larger than 5MB.', 422);
            }
            $attachments[] = [
                'name' => $name,
                'type' => $type,
                'size' => $size,
                'category' => $category,
                'heading' => substr($heading, 0, 120),
            ];
        }
        $defer_submission_notifications = !empty($body['defer_submission_notifications']);
        if ($skip_clinical_sections) {
            $emergency_contact = ['consentToDiscussCare' => 'No'];
        }
        $request_id = self::insert_request($user_id, [
            'status' => self::STATUS_SUBMITTED,
            'assigned_pharmacist_user_id' => 0,
            'timezone' => sanitize_text_field((string) ($body['timezone'] ?? self::store_timezone())) ?: self::store_timezone(),
            'patient' => self::sanitize_deep(is_array($body['patient'] ?? null) ? $body['patient'] : []),
            'emergency_contact' => $emergency_contact,
            'medical_history' => $skip_clinical_sections ? [] : self::sanitize_deep(is_array($body['medical_history'] ?? null) ? $body['medical_history'] : []),
            'medication_profile' => $skip_clinical_sections ? [] : self::sanitize_deep(is_array($body['medication_profile'] ?? null) ? $body['medication_profile'] : []),
            'adherence_assessment' => $skip_clinical_sections ? [] : self::sanitize_deep(is_array($body['adherence_assessment'] ?? null) ? $body['adherence_assessment'] : []),
            'additional_information' => $skip_clinical_sections ? [] : self::sanitize_deep(is_array($body['additional_information'] ?? null) ? $body['additional_information'] : []),
            'attachments' => $skip_clinical_sections ? [] : $attachments,
        ]);
        $payment = self::prepare_submission_payment($request_id, $user_id);
        $row = self::get_request($request_id);
        if ($row && !$defer_submission_notifications) {
            self::dispatch_request_submission_notifications($row);
        }
        return Nevari_Helpers::success([
            'request' => self::payload_from_request($row),
            'status' => (string) ($row->status ?? self::STATUS_SUBMITTED),
            'payment_decision' => $payment,
        ]);
    }

    private static function prepare_submission_payment(int $request_id, int $user_id): array {
        $quota = Nevari_Subscriptions::consultation_quota_snapshot_for_user($user_id, true);
        if (!empty($quota['is_paid'])) {
            $reservation = Nevari_Care_Journeys::reserve_quota($user_id, 'mtm', $request_id);
            if (!is_wp_error($reservation)) {
                self::update_request($request_id, [
                    'payment_state' => 'quota_reserved',
                    'quota_reservation_id' => (int) $reservation['id'],
                    'updated_by' => $user_id,
                ]);
                return [
                    'payment_required' => false, 'currency' => 'NGN', 'fee' => 0,
                    'quota_remaining' => max(0, (int) ($quota['free_consultations_remaining'] ?? 1) - 1),
                    'reservation_id' => (int) $reservation['id'], 'next_action' => 'select_slot',
                ];
            }
        }
        $fee = max(0, (float) get_option('nevari_mtm_consultation_fee', 25000));
        $order = self::create_consultation_order($request_id, $user_id, $fee);
        if (is_wp_error($order)) {
            self::update_request($request_id, ['payment_state'=>'failed','updated_by'=>$user_id]);
            return ['payment_required'=>true,'currency'=>'NGN','fee'=>$fee,'quota_remaining'=>0,'reservation_id'=>null,'next_action'=>'retry_payment'];
        }
        self::update_request($request_id, ['payment_state'=>'pending','payment_order_id'=>$order->get_id(),'updated_by'=>$user_id]);
        return [
            'payment_required'=>true,'currency'=>$order->get_currency() ?: 'NGN','fee'=>(float)$order->get_total(),
            'quota_remaining'=>0,'reservation_id'=>null,'order_id'=>$order->get_id(),
            'payment_url'=>esc_url_raw($order->get_checkout_payment_url(false)),'next_action'=>'pay',
        ];
    }

    private static function create_consultation_order(int $request_id, int $user_id, float $fee) {
        if (!function_exists('wc_create_order') || !class_exists('WC_Order_Item_Fee')) {
            return new WP_Error('woocommerce_unavailable', 'WooCommerce is required.');
        }
        $order = wc_create_order(['customer_id'=>$user_id]);
        if (is_wp_error($order)) return $order;
        $item = new WC_Order_Item_Fee();
        $item->set_name('Medication Therapy Management consultation');
        $item->set_amount($fee); $item->set_total($fee); $order->add_item($item);
        $order->update_meta_data('_nevari_order_source','MTM Consultation');
        $order->update_meta_data('_nevari_mtm_request_id',$request_id);
        $order->update_meta_data('_nevari_mtm_fee',$fee);
        $order->set_status('pending'); $order->calculate_totals(); $order->save();
        return $order;
    }
    private static function private_pdf_root(): string {
        if (defined('NEVARI_MTM_PRIVATE_STORAGE_DIR') && is_string(NEVARI_MTM_PRIVATE_STORAGE_DIR) && trim(NEVARI_MTM_PRIVATE_STORAGE_DIR) !== '') {
            return wp_normalize_path(rtrim(NEVARI_MTM_PRIVATE_STORAGE_DIR, '/\\'));
        }
        return wp_normalize_path(dirname(rtrim(ABSPATH, '/\\')) . '/nevari-private/mtm');
    }

    private static function ensure_private_pdf_root(): bool {
        $root = self::private_pdf_root();
        if (!is_dir($root) && !wp_mkdir_p($root)) {
            return false;
        }
        $guards = [
            '.htaccess' => "Require all denied\nDeny from all\n",
            'web.config' => '<?xml version="1.0"?><configuration><system.webServer><authorization><deny users="*" /></authorization></system.webServer></configuration>',
            'index.php' => "<?php\nhttp_response_code(404);\nexit;\n",
        ];
        foreach ($guards as $name => $contents) {
            $path = $root . '/' . $name;
            if (!file_exists($path)) {
                @file_put_contents($path, $contents, LOCK_EX);
            }
        }
        return is_dir($root) && is_writable($root);
    }

    private static function stored_pdf_path(object $row): string {
        $name = sanitize_file_name((string) ($row->submission_pdf_path ?? ''));
        if ($name === '' || !preg_match('/^[a-zA-Z0-9_-]+\.pdf$/', $name)) {
            return '';
        }
        $root = self::private_pdf_root();
        $path = wp_normalize_path($root . '/' . $name);
        return strpos($path, $root . '/') === 0 ? $path : '';
    }

    private static function valid_stored_pdf(object $row): bool {
        $path = self::stored_pdf_path($row);
        $expected_hash = strtolower((string) ($row->submission_pdf_hash ?? ''));
        $expected_size = (int) ($row->submission_pdf_size ?? 0);
        if ((string) ($row->submission_pdf_status ?? '') !== 'ready' || $path === '' || !is_file($path)) {
            return false;
        }
        $actual_size = filesize($path);
        return $expected_size > 0
            && $actual_size === $expected_size
            && preg_match('/^[a-f0-9]{64}$/', $expected_hash)
            && hash_equals($expected_hash, (string) hash_file('sha256', $path));
    }

    private static function mark_pdf_failed(int $request_id): void {
        global $wpdb;
        $wpdb->update(self::table(), [
            'submission_pdf_status' => 'failed',
            'updated_at' => self::now(),
        ], ['id' => $request_id], ['%s', '%s'], ['%d']);
    }

    public static function customer_submission_pdf(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        if (!self::table_ready()) {
            return Nevari_Helpers::error('mtm_unavailable', 'MTM requests are temporarily unavailable. Please contact support.', 503);
        }
        $request_id = absint($request['id']);
        $row = self::get_request($request_id);
        if (!$row) {
            return Nevari_Helpers::error('mtm_request_not_found', 'MTM request not found.', 404);
        }
        if (self::valid_stored_pdf($row)) {
            return Nevari_Helpers::success([
                'request' => self::payload_from_request($row),
                'status' => (string) ($row->status ?? self::STATUS_SUBMITTED),
                'notifications' => 'already_dispatched',
            ]);
        }

        $snapshot_token = sanitize_text_field((string) $request->get_header('x-nevari-mtm-snapshot-token'));
        $snapshot_fingerprint = sanitize_text_field((string) $request->get_header('x-nevari-mtm-snapshot-fingerprint'));
        $expected_hash = strtolower(sanitize_text_field((string) $request->get_header('x-nevari-content-sha256')));
        $content_type = strtolower(trim((string) $request->get_header('content-type')));
        if ($snapshot_token === '' || $snapshot_fingerprint === '' || !preg_match('/^[a-f0-9]{64}$/', $expected_hash)) {
            return Nevari_Helpers::error('validation_error', 'Verified PDF metadata is required.', 422);
        }
        if (strpos($content_type, 'application/pdf') !== 0) {
            return Nevari_Helpers::error('invalid_pdf', 'The submitted document must be a PDF.', 422);
        }
        if (!self::verify_submission_snapshot_token($row, $snapshot_token, $snapshot_fingerprint)) {
            return Nevari_Helpers::error('invalid_snapshot_token', 'The MTM PDF snapshot token is invalid or expired.', 403);
        }

        $pdf = (string) $request->get_body();
        $size = strlen($pdf);
        if ($size < 8 || $size > self::PDF_MAX_BYTES || substr($pdf, 0, 5) !== '%PDF-' || strpos(substr($pdf, -2048), '%%EOF') === false) {
            return Nevari_Helpers::error('invalid_pdf', 'The submitted MTM PDF is invalid or exceeds the size limit.', 422);
        }
        $actual_hash = hash('sha256', $pdf);
        if (!hash_equals($expected_hash, $actual_hash)) {
            return Nevari_Helpers::error('invalid_pdf_checksum', 'The submitted MTM PDF failed integrity validation.', 422);
        }
        if (!self::ensure_private_pdf_root()) {
            self::mark_pdf_failed($request_id);
            return Nevari_Helpers::error('document_storage_unavailable', 'The MTM document could not be stored securely.', 503);
        }

        $stale_before = gmdate('Y-m-d H:i:s', time() - 10 * MINUTE_IN_SECONDS);
        $claimed = $wpdb->query($wpdb->prepare(
            "UPDATE " . self::table() . " SET submission_pdf_status = 'processing', updated_at = %s WHERE id = %d AND (submission_pdf_status IN ('pending', 'failed') OR (submission_pdf_status = 'processing' AND updated_at < %s))",
            self::now(),
            $request_id,
            $stale_before
        ));
        if ($claimed !== 1) {
            $current = self::get_request($request_id);
            if ($current && self::valid_stored_pdf($current)) {
                return Nevari_Helpers::success(['request' => self::payload_from_request($current), 'notifications' => 'already_dispatched']);
            }
            return Nevari_Helpers::error('document_finalization_in_progress', 'The MTM document is already being finalized.', 409);
        }

        try {
            $token = bin2hex(random_bytes(16));
        } catch (Exception $exception) {
            $token = wp_generate_password(32, false, false);
        }
        $filename = 'mtm-' . $request_id . '-' . preg_replace('/[^a-zA-Z0-9_-]/', '', $token) . '.pdf';
        $root = self::private_pdf_root();
        $temporary = $root . '/.' . $filename . '.tmp';
        $destination = $root . '/' . $filename;
        $written = @file_put_contents($temporary, $pdf, LOCK_EX);
        unset($pdf);
        if ($written !== $size || !@rename($temporary, $destination)) {
            @unlink($temporary);
            self::mark_pdf_failed($request_id);
            return Nevari_Helpers::error('document_storage_failed', 'The MTM document could not be stored securely.', 500);
        }

        $updated = $wpdb->update(self::table(), [
            'submission_pdf_status' => 'ready',
            'submission_pdf_path' => $filename,
            'submission_pdf_hash' => $actual_hash,
            'submission_pdf_size' => $size,
            'submission_pdf_mime' => 'application/pdf',
            'submission_pdf_version' => self::PDF_VERSION,
            'submission_pdf_created_at' => self::now(),
            'updated_at' => self::now(),
        ], ['id' => $request_id, 'submission_pdf_status' => 'processing'], ['%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s'], ['%d', '%s']);
        if ($updated !== 1) {
            @unlink($destination);
            self::mark_pdf_failed($request_id);
            return Nevari_Helpers::error('document_finalization_failed', 'The MTM document could not be finalized.', 500);
        }

        $row = self::get_request($request_id);
        $notifications = 'deferred_until_slot_reserved';
        Nevari_Audit::log('consultation', 'mtm_request', 'mtm.document_finalized', 'success', [
            'object_type' => 'mtm_request',
            'object_id' => $request_id,
            'related_user_id' => Nevari_Auth::api_session_user_id(),
            'document_size' => $size,
            'document_hash' => $actual_hash,
            'message' => 'MTM canonical document finalized.',
        ]);
        return Nevari_Helpers::success([
            'request' => self::payload_from_request($row),
            'status' => (string) ($row->status ?? self::STATUS_SUBMITTED),
            'notifications' => $notifications,
        ]);
    }

    public static function document_download(WP_REST_Request $request): WP_REST_Response {
        $row = self::get_request(absint($request['id']));
        if (!$row || !self::valid_stored_pdf($row)) {
            return Nevari_Helpers::error('mtm_document_unavailable', 'The MTM document is not available.', 404);
        }
        Nevari_Audit::log('consultation', 'mtm_request', 'mtm.document_downloaded', 'success', [
            'object_type' => 'mtm_request',
            'object_id' => (int) $row->id,
            'related_user_id' => Nevari_Auth::api_session_user_id(),
            'document_size' => (int) ($row->submission_pdf_size ?? 0),
            'message' => 'MTM canonical document downloaded.',
        ]);
        return new WP_REST_Response(['nevari_mtm_private_document' => true], 200);
    }

    public static function serve_private_document($served, $result, $request, $server): bool {
        if ($served || !($result instanceof WP_REST_Response) || !($request instanceof WP_REST_Request)) {
            return (bool) $served;
        }
        $data = $result->get_data();
        if (!is_array($data) || empty($data['nevari_mtm_private_document'])) {
            return (bool) $served;
        }
        $row = self::get_request(absint($request['id']));
        if (!$row || !self::valid_stored_pdf($row)) {
            status_header(404);
            return true;
        }
        $path = self::stored_pdf_path($row);
        $reference = sanitize_file_name(self::ensure_request_reference((int) $row->id));
        $filename = ($reference !== '' ? strtolower($reference) : 'mtm-assessment') . '.pdf';
        header('Content-Type: application/pdf');
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: inline; filename="' . $filename . '"');
        header('Cache-Control: private, no-store, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: SAMEORIGIN');
        if (defined('NEVARI_MTM_X_ACCEL_PREFIX') && is_string(NEVARI_MTM_X_ACCEL_PREFIX) && NEVARI_MTM_X_ACCEL_PREFIX !== '') {
            header('X-Accel-Redirect: ' . rtrim(NEVARI_MTM_X_ACCEL_PREFIX, '/') . '/' . rawurlencode(basename($path)));
            return true;
        }
        if (defined('NEVARI_MTM_X_SENDFILE') && NEVARI_MTM_X_SENDFILE) {
            header('X-Sendfile: ' . $path);
            return true;
        }
        $handle = @fopen($path, 'rb');
        if (!$handle) {
            status_header(404);
            return true;
        }
        while (!feof($handle)) {
            echo fread($handle, 1048576); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
            flush();
        }
        fclose($handle);
        return true;
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

    public static function customer_reschedule_request(WP_REST_Request $request): WP_REST_Response {
        if (!self::table_ready()) {
            return Nevari_Helpers::error('mtm_unavailable', 'MTM requests are temporarily unavailable. Please contact support.', 503);
        }
        $row = self::get_request((int) $request['id']);
        if (!$row) {
            return Nevari_Helpers::error('mtm_request_not_found', 'MTM request not found.', 404);
        }
        $user_id = Nevari_Auth::api_session_user_id();
        if ((int) $row->customer_user_id !== $user_id) {
            return Nevari_Helpers::error('forbidden', 'You cannot reschedule this MTM request.', 403);
        }
        if (!self::reschedule_eligible($row)) {
            return Nevari_Helpers::error('reschedule_unavailable', 'This MTM request is not eligible for rescheduling.', 409);
        }

        $updates = [
            'status' => self::STATUS_APPROVED,
            'scheduled_at' => null,
            'google_calendar_event_id' => null,
            'google_meet_space_name' => null,
            'google_meet_code' => null,
            'google_meet_link' => null,
            'google_meet_error' => null,
            'google_meet_created_at' => null,
            'google_meet_ended_at' => null,
            'customer_join_token_hash' => null,
            'pharmacist_join_token_hash' => null,
            'join_valid_from_at' => null,
            'join_expires_at' => null,
            'customer_checked_in_at' => null,
            'pharmacist_checked_in_at' => null,
            'missed_attendance_at' => null,
            'missed_attendance_role' => null,
            'updated_by' => $user_id,
        ];

        $updated = self::update_request((int) $row->id, $updates);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }

        return Nevari_Helpers::success([
            'request' => self::payload_from_request($updated),
            'message' => 'Your MTM consultation has been returned for pharmacist rescheduling.',
        ]);
    }

    public static function payment_completed(int $order_id): void {
        $order = wc_get_order($order_id);
        if (!$order || !$order->is_paid()) return;
        $request_id = absint($order->get_meta('_nevari_mtm_request_id', true));
        if (!$request_id) return;
        global $wpdb;
        $wpdb->query('START TRANSACTION');
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM '.self::table().' WHERE id=%d FOR UPDATE',$request_id));
        if (!$row || (int) ($row->payment_order_id ?? 0) !== $order_id) {$wpdb->query('ROLLBACK');return;}
        if (($row->payment_state ?? '') === 'paid') {$wpdb->query('COMMIT');return;}
        $updates = ['payment_state'=>'paid','updated_at'=>self::now(),'updated_by'=>(int)$row->customer_user_id];
        if (($row->slot_state ?? '') === 'reserved_pending_payment') {
            $hold_expiry = strtotime((string)($row->slot_hold_expires_at ?? '').' UTC');
            if ($hold_expiry && $hold_expiry > time()) {
                $updates['slot_state'] = 'reserved';
                $updates['slot_hold_expires_at'] = null;
            } else {
                $updates['slot_state'] = 'expired';
                $updates['reserved_start_at'] = null;
                $updates['reserved_end_at'] = null;
                $updates['slot_hold_expires_at'] = null;
            }
        }
        $wpdb->update(self::table(),$updates,['id'=>$request_id]);
        $wpdb->query('COMMIT');
        Nevari_Care_Journeys::event('mtm',$request_id,'payment_verified','MTM consultation payment verified.',(int)$row->customer_user_id,[], 'mtm-payment:'.$order_id);
        $updated = self::get_request($request_id);
        if ($updated) self::dispatch_payment_confirmation_notifications($updated);
    }

    private static function slot_hold_expiry(): array {
        try {
            $timezone = new DateTimeZone(self::store_timezone());
            $end_of_day = (new DateTimeImmutable('now', $timezone))->setTime(23, 59, 59);
        } catch (Exception $exception) {
            $end_of_day = new DateTimeImmutable('today 23:59:59', new DateTimeZone('UTC'));
        }
        $utc = $end_of_day->setTimezone(new DateTimeZone('UTC'));
        return ['mysql'=>$utc->format('Y-m-d H:i:s'),'timestamp'=>$utc->getTimestamp()];
    }

    public static function expire_slot_hold(int $request_id): void {
        global $wpdb;
        $wpdb->query('START TRANSACTION');
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM '.self::table().' WHERE id=%d FOR UPDATE',$request_id));
        if (!$row || ($row->slot_state ?? '') !== 'reserved_pending_payment') {$wpdb->query('COMMIT');return;}
        $expires_at = strtotime((string)($row->slot_hold_expires_at ?? '').' UTC');
        if (!$expires_at || $expires_at > time()) {$wpdb->query('COMMIT');return;}
        $wpdb->update(self::table(),[
            'slot_state'=>'expired','reserved_start_at'=>null,'reserved_end_at'=>null,
            'slot_hold_expires_at'=>null,'updated_at'=>self::now(),
        ],['id'=>$request_id,'slot_state'=>'reserved_pending_payment']);
        $wpdb->query('COMMIT');
        Nevari_Care_Journeys::event('mtm',$request_id,'slot_hold_expired','Unpaid consultation slot hold expired.',0,[],'mtm-slot-expired:'.$request_id);
    }

    public static function customer_reserve_slot(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $id = absint($request['id']);
        $body = is_array($request->get_json_params()) ? $request->get_json_params() : [];
        if (array_diff(array_keys($body), ['start_at','timezone'])) return Nevari_Helpers::error('unexpected_fields','Unexpected slot fields were supplied.',422);
        $timezone = sanitize_text_field((string)($body['timezone']??self::store_timezone())) ?: self::store_timezone();
        $start = self::site_datetime_to_utc_mysql(sanitize_text_field((string)($body['start_at']??'')),$timezone);
        if (!$start || strtotime($start.' UTC') < time()+300) return Nevari_Helpers::error('invalid_slot','Select a valid future slot.',422);
        $end = gmdate('Y-m-d H:i:s',strtotime($start.' UTC +'.self::MTM_DURATION_MINUTES.' minutes'));
        $wpdb->query('START TRANSACTION');
        $row = $wpdb->get_row($wpdb->prepare('SELECT * FROM '.self::table().' WHERE id=%d FOR UPDATE',$id));
        if (!$row || (int)$row->customer_user_id !== Nevari_Auth::api_session_user_id()) {$wpdb->query('ROLLBACK');return Nevari_Helpers::error('forbidden','You cannot reserve this slot.',403);}
        $payment_state = (string)($row->payment_state??'pending');
        if (!in_array($payment_state,['pending','paid','quota_reserved'],true)) {$wpdb->query('ROLLBACK');return Nevari_Helpers::error('payment_unavailable','This request is not ready for availability selection.',409);}
        if (in_array((string)($row->slot_state??''),['reserved_pending_payment','reserved','active'],true)) {$wpdb->query('ROLLBACK');return Nevari_Helpers::error('slot_already_reserved','A slot is already reserved for this request.',409);}
        $pharmacist_id = 0;
        $candidate_ids = self::round_robin_pharmacist_ids(self::eligible_pharmacist_ids());
        foreach ($candidate_ids as $candidate_id) {
            if (!self::slot_matches_availability($candidate_id,$start,$end)) continue;
            $wpdb->get_var($wpdb->prepare('SELECT ID FROM '.$wpdb->users.' WHERE ID=%d FOR UPDATE',$candidate_id));
            if (!self::pharmacist_is_eligible($candidate_id)) continue;
            if (!self::slot_matches_availability($candidate_id,$start,$end) || self::slot_has_conflict($candidate_id,$start,$end,$id)) continue;
            $pharmacist_id = $candidate_id;
            break;
        }
        if ($pharmacist_id < 1) {
            $wpdb->query('ROLLBACK');return Nevari_Helpers::error('slot_unavailable','No pharmacist is available for that time. Select another slot.',409);
        }
        $is_unpaid = $payment_state === 'pending';
        $hold = $is_unpaid ? self::slot_hold_expiry() : null;
        $slot_state = $is_unpaid ? 'reserved_pending_payment' : 'reserved';
        $wpdb->update(self::table(),['assigned_pharmacist_user_id'=>$pharmacist_id,'assigned_at'=>self::now(),'status'=>self::STATUS_UNDER_REVIEW,'slot_state'=>$slot_state,'reserved_start_at'=>$start,'reserved_end_at'=>$end,'slot_hold_expires_at'=>$hold['mysql']??null,'timezone'=>$timezone,'updated_at'=>self::now(),'updated_by'=>(int)$row->customer_user_id],['id'=>$id]);
        Nevari_Care_Journeys::event('mtm',$id,'slot_reserved',$is_unpaid?'Availability held pending payment.':'Consultation slot reserved pending clinical approval.',(int)$row->customer_user_id,['scheduled_at'=>$start]);
        $wpdb->query('COMMIT');
        if ($is_unpaid && !wp_next_scheduled(self::SLOT_HOLD_EXPIRY_HOOK,[$id])) wp_schedule_single_event((int)$hold['timestamp']+1,self::SLOT_HOLD_EXPIRY_HOOK,[$id]);
        $updated=self::get_request($id);
        self::dispatch_slot_reservation_notifications($updated,$is_unpaid);
        return Nevari_Helpers::success([
            'request'=>self::payload_from_request($updated),
            'payment_decision'=>self::payment_decision_from_request($updated),
            'slot_hold_expires_at'=>!empty($updated->slot_hold_expires_at)?(string)$updated->slot_hold_expires_at:null,
            'next_action'=>$is_unpaid?'pay':'success',
            'message'=>$is_unpaid?'Availability held pending payment.':'Slot reserved pending clinical approval.',
        ]);
    }

    private static function available_slots(object $row): array {
        $slots=[];
        foreach (self::eligible_pharmacist_ids() as $pharmacist_id) {
            $availability=get_user_meta($pharmacist_id,'_nevari_availability',true); $availability=is_array($availability)?$availability:[];
            for($day=0;$day<14;$day++){
                $date=gmdate('Y-m-d',strtotime('+'.$day.' days')); $weekday=strtolower(gmdate('l',strtotime($date)));
                foreach((array)($availability[$weekday]??[]) as $range){
                    $from=strtotime($date.' '.sanitize_text_field((string)($range['start']??'09:00')).' UTC');
                    $to=strtotime($date.' '.sanitize_text_field((string)($range['end']??'17:00')).' UTC');
                    for($t=$from;$t+self::MTM_DURATION_MINUTES*60<=$to;$t+=self::MTM_DURATION_MINUTES*60){
                        $start=gmdate('Y-m-d H:i:s',$t);$end=gmdate('Y-m-d H:i:s',$t+self::MTM_DURATION_MINUTES*60);
                        if($t>time()+300&&!self::slot_has_conflict($pharmacist_id,$start,$end,(int)$row->id))$slots[$start]=['start_at'=>gmdate('c',$t),'end_at'=>gmdate('c',$t+self::MTM_DURATION_MINUTES*60)];
                    }
                }
            }
        }
        ksort($slots);
        return array_slice(array_values($slots),0,200);
    }

    private static function slot_matches_availability(int $user_id,string $start,string $end): bool {
        $availability=get_user_meta($user_id,'_nevari_availability',true); if(!is_array($availability))return false;
        $weekday=strtolower(gmdate('l',strtotime($start.' UTC')));$start_ts=strtotime($start.' UTC');$end_ts=strtotime($end.' UTC');$date=gmdate('Y-m-d',$start_ts);
        foreach((array)($availability[$weekday]??[]) as $range){$from=strtotime($date.' '.sanitize_text_field((string)($range['start']??'')).' UTC');$to=strtotime($date.' '.sanitize_text_field((string)($range['end']??'')).' UTC');if($from&&$to&&$start_ts>=$from&&$end_ts<=$to)return true;}
        return false;
    }

    private static function slot_has_conflict(int $pharmacist_id,string $start,string $end,int $exclude_id=0): bool {
        global $wpdb;
        $mtm=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM ".self::table()." WHERE assigned_pharmacist_user_id=%d AND id<>%d AND (slot_state IN ('reserved','active') OR (slot_state='reserved_pending_payment' AND slot_hold_expires_at>%s)) AND reserved_start_at<%s AND reserved_end_at>%s",$pharmacist_id,$exclude_id,self::now(),$end,$start));
        $appointments=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM ".Nevari_Helpers::table('appointments')." WHERE doctor_user_id=%d AND status IN ('awaiting_payment','requested','confirmed','checked_in') AND start_at<%s AND end_at>%s",$pharmacist_id,$end,$start));
        return $mtm+$appointments>0;
    }
    private static function mtm_payment_url(object $row): ?string {
        $order_id = (int) ($row->payment_order_id ?? 0);
        $order = $order_id ? wc_get_order($order_id) : null;
        return $order && $order->needs_payment() ? esc_url_raw($order->get_checkout_payment_url(false)) : null;
    }
    private static function payment_decision_from_request(object $row): array {
        $order = !empty($row->payment_order_id) ? wc_get_order((int)$row->payment_order_id) : null;
        $state = sanitize_key((string)($row->payment_state??'pending'));
        return [
            'payment_required'=>!in_array($state,['paid','quota_reserved'],true),
            'payment_state'=>$state,
            'currency'=>$order?(string)$order->get_currency():'NGN',
            'fee'=>$order?(float)$order->get_total():0,
            'order_id'=>(int)($row->payment_order_id??0),
            'payment_url'=>self::mtm_payment_url($row),
            'next_action'=>$state==='pending'?'pay':'select_slot',
        ];
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
        if (($row->slot_state ?? '') === 'reserved_pending_payment' && strtotime((string)($row->slot_hold_expires_at ?? '').' UTC') <= time()) {
            self::expire_slot_hold((int)$row->id);
            $row = self::get_request((int)$row->id);
        }
        $order = !empty($row->payment_order_id) ? wc_get_order((int) $row->payment_order_id) : null;
        $quota = Nevari_Subscriptions::consultation_quota_snapshot_for_user($user_id, true);
        $slot_state = sanitize_key((string)($row->slot_state??'unreserved'));
        $payment_state = sanitize_key((string)($row->payment_state??'pending'));
        $can_select_slot = in_array($payment_state,['pending','paid','quota_reserved'],true)
            && !in_array($slot_state,['reserved_pending_payment','reserved','active'],true);
        $next_action = $slot_state === 'reserved_pending_payment' ? 'pay'
            : ($slot_state === 'reserved' || $slot_state === 'active' ? 'success' : 'select_slot');
        return Nevari_Helpers::success([
            'mtm_request_id' => (int) $row->id,
            'request_reference' => self::ensure_request_reference((int) $row->id),
            'status' => self::normalize_status((string) $row->status),
            'assignment_state' => !empty($row->assigned_pharmacist_user_id) ? 'assigned' : 'pending_selection',
            'pharmacist_id' => (int) ($row->assigned_pharmacist_user_id ?? 0),
            'pharmacist_name' => !empty($row->assigned_pharmacist_user_id) ? self::user_name((int) $row->assigned_pharmacist_user_id) : '',
            'duration_minutes' => self::MTM_DURATION_MINUTES,
            'payment_required' => !in_array((string) ($row->payment_state ?? ''), ['paid', 'quota_reserved'], true),
            'payment_state' => $payment_state,
            'payment_order_id' => (int) ($row->payment_order_id ?? 0),
            'payment_url' => self::mtm_payment_url($row),
            'currency' => $order ? (string) $order->get_currency() : 'NGN',
            'fee' => $order ? (float) $order->get_total() : max(0, (float) get_option('nevari_mtm_consultation_fee', 25000)),
            'quota_remaining' => max(0, (int) ($quota['free_consultations_remaining'] ?? 0)),
            'quota_reservation_id' => (int) ($row->quota_reservation_id ?? 0),
            'slot_state' => $slot_state,
            'reserved_start_at' => !empty($row->reserved_start_at) ? (string) $row->reserved_start_at : null,
            'slot_hold_expires_at' => !empty($row->slot_hold_expires_at) ? (string)$row->slot_hold_expires_at : null,
            'available_slots' => $can_select_slot ? self::available_slots($row) : [],
            'next_action' => $next_action,
            'google_meet_link' => self::join_url($row, 'customer'),
        ]);
    }

    public static function pharmacist_index(WP_REST_Request $request): WP_REST_Response {
        $user_id = Nevari_Auth::api_session_user_id();
        if (Nevari_Helpers::is_store_admin($user_id)) {
            global $wpdb;
            $page = max(1, absint($request->get_param('page')) ?: 1);
            $per_page = min(100, max(1, absint($request->get_param('per_page')) ?: 30));
            $search = substr(sanitize_text_field((string) $request->get_param('search')), 0, 100);
            $where = 'id > 0';
            $params = [];
            if ($search !== '') {
                $like = '%' . $wpdb->esc_like($search) . '%';
                $where .= ' AND (request_reference LIKE %s OR status LIKE %s OR patient_data LIKE %s)';
                $params = [$like, $like, $like];
            }
            $table = self::table();
            $count_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where}";
            $total = (int) ($params ? $wpdb->get_var($wpdb->prepare($count_sql, $params)) : $wpdb->get_var($count_sql));
            $offset = ($page - 1) * $per_page;
            $list_sql = "SELECT * FROM {$table} WHERE {$where} ORDER BY id DESC LIMIT %d OFFSET %d";
            $rows = $wpdb->get_results($wpdb->prepare($list_sql, array_merge($params, [$per_page, $offset])));
            return Nevari_Helpers::success([
                'items' => array_map([__CLASS__, 'payload_from_request'], is_array($rows) ? $rows : []),
                'pagination' => [
                    'page' => $page,
                    'per_page' => $per_page,
                    'total' => $total,
                    'pages' => max(1, (int) ceil($total / $per_page)),
                ],
            ]);
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
        if (!in_array((string)($row->payment_state??''),['paid','quota_reserved'],true)) {
            return Nevari_Helpers::error('payment_required','Payment or a Pro consultation credit must be confirmed before approval.',409);
        }
        if (($row->slot_state??'') !== 'reserved' || empty($row->reserved_start_at)) {
            return Nevari_Helpers::error('slot_required','A valid consultation slot must be reserved before approval.',409);
        }
        $actor = Nevari_Auth::api_session_user_id();
        $approval = [
            'status' => self::STATUS_APPROVED,
            'clinical_decision' => 'approved',
            'reviewed_by_pharmacist_user_id' => $actor,
            'reviewed_at' => self::now(),
            'approved_at' => self::now(),
            'updated_by' => $actor,
        ];
        if (($row->slot_state ?? '') === 'reserved' && !empty($row->reserved_start_at)) {
            $start = (string) $row->reserved_start_at;
            $end = (string) $row->reserved_end_at;
            $meet = self::create_meet_space_for_request($row, $start, $end);
            $approval['status'] = self::STATUS_SCHEDULED;
            $approval['slot_state'] = 'active';
            $approval['scheduled_at'] = $start;
            $approval['join_valid_from_at'] = self::join_valid_from_at((object) ['scheduled_at'=>$start]);
            $approval['join_expires_at'] = self::join_expires_at((object) ['scheduled_at'=>$start]);
            if (!empty($meet['success'])) {
                $approval['google_meet_space_name'] = (string) ($meet['space_name'] ?? $meet['event_id'] ?? '');
                $approval['google_calendar_event_id'] = $approval['google_meet_space_name'];
                $approval['google_meet_code'] = (string) ($meet['meeting_code'] ?? '');
                $approval['google_meet_link'] = (string) ($meet['meet_link'] ?? '');
                $approval['google_meet_created_at'] = self::now();
            } else {
                $approval['google_meet_error'] = sanitize_text_field((string) ($meet['message'] ?? 'Meeting creation is queued for retry.'));
            }
            if (($row->payment_state ?? '') === 'quota_reserved') Nevari_Care_Journeys::set_quota_state('mtm', (int)$row->id, 'consumed');
        }
        $updated = self::update_request((int) $row->id, $approval);
        if ($updated) {
            self::dispatch_request_update_notifications($row, $updated);
        }
        return Nevari_Helpers::success(['request' => self::payload_from_request($updated)]);
    }

    public static function decline_request(WP_REST_Request $request): WP_REST_Response {
        $row = self::guard_pharmacist_request((int)$request['id']); if($row instanceof WP_REST_Response)return $row;
        $body=is_array($request->get_json_params())?$request->get_json_params():[];
        if(array_diff(array_keys($body),['reason']))return Nevari_Helpers::error('unexpected_fields','Unexpected decline fields were supplied.',422);
        $reason=substr(sanitize_textarea_field((string)($body['reason']??'')),0,500);if($reason==='')return Nevari_Helpers::error('missing_reason','A decline reason is required.',422);
        $quota=($row->payment_state??'')==='quota_reserved';
        if($quota)Nevari_Care_Journeys::set_quota_state('mtm',(int)$row->id,'released');
        $refund=($row->payment_state??'')==='paid'?'required':'not_required';
        $updated=self::update_request((int)$row->id,['status'=>'declined','clinical_decision'=>'declined','rejection_reason'=>$reason,'slot_state'=>'released','refund_state'=>$refund,'updated_by'=>Nevari_Auth::api_session_user_id()]);
        Nevari_Care_Journeys::event('mtm',(int)$row->id,'declined','MTM request declined.',Nevari_Auth::api_session_user_id());
        self::dispatch_request_update_notifications($row,$updated);return Nevari_Helpers::success(['request'=>self::payload_from_request($updated)]);
    }

    public static function refund_complete(WP_REST_Request $request): WP_REST_Response {
        if(!Nevari_Helpers::is_store_admin(Nevari_Auth::api_session_user_id()))return Nevari_Helpers::error('forbidden','Only a store administrator can record refunds.',403);
        $row=self::get_request((int)$request['id']);if(!$row||($row->refund_state??'')!=='required')return Nevari_Helpers::error('refund_unavailable','This request is not awaiting a refund.',409);
        $body=is_array($request->get_json_params())?$request->get_json_params():[];if(array_diff(array_keys($body),['reference']))return Nevari_Helpers::error('unexpected_fields','Unexpected refund fields were supplied.',422);
        $reference=substr(sanitize_text_field((string)($body['reference']??'')),0,100);if($reference==='')return Nevari_Helpers::error('missing_reference','A refund reference is required.',422);
        $updated=self::update_request((int)$row->id,['refund_state'=>'completed','refund_reference'=>$reference,'refund_completed_at'=>self::now(),'updated_by'=>Nevari_Auth::api_session_user_id()]);
        Nevari_Care_Journeys::event('mtm',(int)$row->id,'refund_completed','Manual refund recorded.',Nevari_Auth::api_session_user_id());return Nevari_Helpers::success(['request'=>self::payload_from_request($updated)]);
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
        $timezone = sanitize_text_field((string) ($body['timezone'] ?? ($row->timezone ?? self::store_timezone()))) ?: self::store_timezone();
        $start_mysql = self::site_datetime_to_utc_mysql($start, $timezone);
        if ($start_mysql === null) {
            return Nevari_Helpers::error('missing_schedule', 'A valid appointment start time is required.', 422);
        }
        $end_mysql = gmdate('Y-m-d H:i:s', strtotime($start_mysql . ' UTC +' . self::MTM_DURATION_MINUTES . ' minutes'));
        $meet = self::create_meet_space_for_request($row, $start_mysql, $end_mysql);
        $actor = Nevari_Auth::api_session_user_id();
        $data = [
            'status' => self::STATUS_SCHEDULED,
            'scheduled_at' => $start_mysql,
            'duration_minutes' => self::MTM_DURATION_MINUTES,
            'timezone' => $timezone,
            'consultation_method' => 'Google Meet',
            'customer_checked_in_at' => null,
            'pharmacist_checked_in_at' => null,
            'missed_attendance_at' => null,
            'missed_attendance_role' => null,
            'updated_by' => $actor,
        ];
        if (!empty($meet['success'])) {
            $data['google_meet_space_name'] = (string) ($meet['space_name'] ?? $meet['event_id'] ?? '');
            $data['google_calendar_event_id'] = (string) ($meet['space_name'] ?? $meet['event_id'] ?? '');
            $data['google_meet_code'] = (string) ($meet['meeting_code'] ?? '');
            $data['google_meet_link'] = (string) ($meet['meet_link'] ?? '');
            $data['google_meet_error'] = null;
            $data['google_meet_created_at'] = self::now();
            $data['google_meet_ended_at'] = null;
            $data['join_valid_from_at'] = self::join_valid_from_at((object) ['scheduled_at' => $start_mysql]);
            $data['join_expires_at'] = self::join_expires_at((object) ['scheduled_at' => $start_mysql]);
            $data['customer_join_token_hash'] = null;
            $data['pharmacist_join_token_hash'] = null;
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
        $timezone = sanitize_text_field((string) ($body['timezone'] ?? ($row->timezone ?? self::store_timezone()))) ?: self::store_timezone();
        $follow_up_at = self::site_datetime_to_utc_mysql($follow_at, $timezone);
        if ($follow_up_at === null) {
            return Nevari_Helpers::error('missing_follow_up', 'A valid follow-up time is required.', 422);
        }
        $follow_up = self::sanitize_deep([
            'follow_up_at' => $follow_up_at,
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

    public static function join_access(WP_REST_Request $request): WP_REST_Response {
        $token = sanitize_text_field((string) $request['token']);
        if ($token === '') {
            return Nevari_Helpers::error('invalid_token', 'The MTM join link is invalid.', 404);
        }

        $decoded = self::decode_join_token($token);
        if (empty($decoded['valid'])) {
            return Nevari_Helpers::error('invalid_token', 'The MTM join link is invalid.', 404);
        }

        $payload = is_array($decoded['payload'] ?? null) ? $decoded['payload'] : [];
        $request_id = (int) ($payload['mtm_request_id'] ?? 0);
        $role = ($payload['role'] ?? '') === 'pharmacist' ? 'pharmacist' : 'customer';
        $row = self::get_request($request_id);
        if (!$row) {
            return Nevari_Helpers::error('mtm_request_not_found', 'MTM request not found.', 404);
        }

        $row = self::ensure_join_access($row);
        $stored_hash = (string) ($role === 'pharmacist' ? ($row->pharmacist_join_token_hash ?? '') : ($row->customer_join_token_hash ?? ''));
        if ($stored_hash === '' || !hash_equals($stored_hash, hash('sha256', $token))) {
            return Nevari_Helpers::error('mtm_link_expired', 'This meeting link has expired.', 410);
        }

        $valid_from_at = (string) ($row->join_valid_from_at ?? '') ?: self::join_valid_from_at($row);
        $expires_at = (string) ($row->join_expires_at ?? '') ?: self::join_expires_at($row);
        $valid_from_ts = $valid_from_at ? (int) strtotime($valid_from_at . ' UTC') : 0;
        $expires_ts = $expires_at ? (int) strtotime($expires_at . ' UTC') : 0;
        $now = time();
        $book_url = self::customer_detail_link((int) $row->id);
        $raw_meet_link = self::raw_meeting_link($row);

        if (
            self::normalize_status((string) ($row->status ?? '')) === self::STATUS_COMPLETED
            || !empty($row->google_meet_ended_at)
            || ($expires_ts > 0 && $now > $expires_ts)
        ) {
            return Nevari_Helpers::success([
                'state' => 'ended',
                'role' => $role,
                'mtm_request_id' => $request_id,
                'message' => 'Meeting has ended',
                'book_url' => $book_url,
            ]);
        }

        if ($raw_meet_link === '' || empty($row->scheduled_at)) {
            return Nevari_Helpers::success([
                'state' => 'unavailable',
                'role' => $role,
                'mtm_request_id' => $request_id,
                'message' => 'Kindly check back on your appointment time',
                'book_url' => $book_url,
            ]);
        }

        if ($valid_from_ts > 0 && $now < $valid_from_ts) {
            return Nevari_Helpers::success([
                'state' => 'unavailable',
                'role' => $role,
                'mtm_request_id' => $request_id,
                'message' => 'Kindly check back on your appointment time',
                'book_url' => $book_url,
                'available_at' => !empty($valid_from_at) ? Nevari_Helpers::iso_datetime($valid_from_at) : null,
            ]);
        }

        global $wpdb;
        $checked_column = $role === 'pharmacist' ? 'pharmacist_checked_in_at' : 'customer_checked_in_at';
        $update = ['updated_at' => self::now()];
        if (empty($row->{$checked_column})) {
            $update[$checked_column] = self::now();
        }
        $wpdb->update(self::table(), $update, ['id' => $request_id], array_fill(0, count($update), '%s'), ['%d']);

        return Nevari_Helpers::success([
            'state' => 'active',
            'role' => $role,
            'mtm_request_id' => $request_id,
            'redirect_url' => $raw_meet_link,
            'book_url' => $book_url,
        ]);
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
        if (empty($row->customer_checked_in_at) || empty($row->pharmacist_checked_in_at)) {
            $data['missed_attendance_at'] = self::now();
            $data['missed_attendance_role'] = empty($row->pharmacist_checked_in_at) ? 'pharmacist' : 'customer';
        }
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
        return Nevari_Helpers::frontend_dashboard_url($default_path);
    }

    private static function customer_dashboard_link(int $request_id): string {
        return self::customer_detail_link($request_id);
    }

    private static function pharmacist_dashboard_link(int $request_id): string {
        return self::pharmacist_queue_link($request_id);
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
        $meet_link = esc_url_raw((string) ($payload['customer_join_url'] ?? ''));

        $variables = [
            'patient_name' => $patient instanceof WP_User ? ($patient->display_name ?: $patient->user_login) : ((string) ($payload['patient']['name'] ?? 'Customer') ?: 'Customer'),
            'customer_name' => $patient instanceof WP_User ? ($patient->display_name ?: $patient->user_login) : ((string) ($payload['patient']['name'] ?? 'Customer') ?: 'Customer'),
            'pharmacist_name' => $pharmacist instanceof WP_User ? ($pharmacist->display_name ?: $pharmacist->user_login) : 'Assigned pharmacist',
            'request_reference' => (string) ($payload['request_reference'] ?? self::public_request_reference($request_id)),
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
            'google_meet_link_html' => $meet_link ? [
                'html' => '<a href="' . esc_url($meet_link) . '" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E2955;color:#ffffff;text-decoration:none;font-weight:700;">Join Meeting</a>',
                'text' => $meet_link,
            ] : '',
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

    private static function queue_mtm_email(string $template_key, ?WP_User $recipient, object $row, array $variables, string $recipient_role, array $attachments = []): void {
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
            'attachments' => $attachments,
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

    private static function dispatch_request_submission_notifications(object $row, array $options = []): void {
        $patient = get_userdata((int) $row->customer_user_id);
        $pharmacist = get_userdata((int) ($row->assigned_pharmacist_user_id ?? 0));
        $variables = self::mtm_email_variables($row);
        $customer_attachments = isset($options['customer_attachments']) && is_array($options['customer_attachments'])
            ? array_values($options['customer_attachments'])
            : [];
        $pharmacist_attachments = isset($options['pharmacist_attachments']) && is_array($options['pharmacist_attachments'])
            ? array_values($options['pharmacist_attachments'])
            : [];

        self::queue_mtm_email('mtm_request_submitted_customer', $patient instanceof WP_User ? $patient : null, $row, $variables, 'customer', $customer_attachments);
        self::queue_mtm_email('mtm_request_submitted_pharmacist', $pharmacist instanceof WP_User ? $pharmacist : null, $row, $variables, 'pharmacist', $pharmacist_attachments);
    }

    private static function dispatch_slot_reservation_notifications(object $row, bool $pending_payment): void {
        $reservation_fingerprint = hash('sha256',(string)($row->reserved_start_at??'').'|'.(string)($row->slot_hold_expires_at??'').'|'.($pending_payment?'pending':'confirmed'));
        $dispatch_key = '_nevari_mtm_slot_notification_' . (int)$row->id . '_' . substr($reservation_fingerprint,0,16);
        if (!add_option($dispatch_key,self::now(),'no',false)) return;
        $patient = get_userdata((int)$row->customer_user_id);
        $pharmacist = get_userdata((int)($row->assigned_pharmacist_user_id??0));
        $hold = self::email_datetime_parts($row->slot_hold_expires_at??null,(string)($row->timezone??self::store_timezone()));
        $base_variables = self::mtm_email_variables($row,[
            'slot_hold_expires_at'=>$hold['datetime'],
            'payment_status'=>$pending_payment?'Pending payment':'Confirmed',
        ]);
        $customer_template = $pending_payment ? 'mtm_slot_held_customer' : 'mtm_slot_reserved_customer';
        $pharmacist_template = $pending_payment ? 'mtm_slot_held_pharmacist' : 'mtm_slot_reserved_pharmacist';
        self::queue_mtm_email($customer_template,$patient instanceof WP_User?$patient:null,$row,array_merge($base_variables,['recipient_name'=>$patient instanceof WP_User?$patient->display_name:'Customer','dashboard_link'=>self::customer_dashboard_link((int)$row->id)]),'customer');
        self::queue_mtm_email($pharmacist_template,$pharmacist instanceof WP_User?$pharmacist:null,$row,array_merge($base_variables,['recipient_name'=>$pharmacist instanceof WP_User?$pharmacist->display_name:'Pharmacist','dashboard_link'=>self::pharmacist_dashboard_link((int)$row->id)]),'pharmacist');
    }

    private static function dispatch_payment_confirmation_notifications(object $row): void {
        $dispatch_key = '_nevari_mtm_payment_notification_' . (int)$row->id;
        if (!add_option($dispatch_key,self::now(),'no',false)) return;
        $patient = get_userdata((int)$row->customer_user_id);
        self::queue_mtm_email('mtm_payment_confirmed',$patient instanceof WP_User?$patient:null,$row,self::mtm_email_variables($row,['recipient_name'=>$patient instanceof WP_User?$patient->display_name:'Customer','dashboard_link'=>self::customer_dashboard_link((int)$row->id)]),'customer');
    }

    private static function dispatch_request_update_notifications(object $before, object $after, array $options = []): void {
        $patient = get_userdata((int) $after->customer_user_id);
        $pharmacist = get_userdata((int) ($after->assigned_pharmacist_user_id ?? 0));
        $before_status = self::normalize_status((string) ($before->status ?? self::STATUS_SUBMITTED));
        $after_status = self::normalize_status((string) ($after->status ?? self::STATUS_SUBMITTED));
        $approvedCustomerAttachments = isset($options['approved_customer_attachments']) && is_array($options['approved_customer_attachments'])
            ? array_values($options['approved_customer_attachments'])
            : [];
        $base_variables = self::mtm_email_variables($after, [
            'previous_status' => self::status_label($before_status),
            'current_status' => self::status_label($after_status),
        ]);

        if ($before_status !== $after_status) {
            $approvalTemplate = Nevari_Emails::get_active_template('mtm_request_approved_customer');
            $approvalTemplateActive = is_object($approvalTemplate) && !empty($approvalTemplate->template_key);
            if ($after_status === self::STATUS_APPROVED) {
                if ($approvalTemplateActive) {
                    self::queue_mtm_email('mtm_request_approved_customer', $patient instanceof WP_User ? $patient : null, $after, $base_variables, 'customer', $approvedCustomerAttachments);
                } else {
                    self::queue_mtm_email('mtm_request_status_changed_customer', $patient instanceof WP_User ? $patient : null, $after, $base_variables, 'customer', $approvedCustomerAttachments);
                }
            } else {
                self::queue_mtm_email('mtm_request_status_changed_customer', $patient instanceof WP_User ? $patient : null, $after, $base_variables, 'customer');
            }
            self::queue_mtm_email('mtm_request_status_changed_pharmacist', $pharmacist instanceof WP_User ? $pharmacist : null, $after, $base_variables, 'pharmacist');
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
