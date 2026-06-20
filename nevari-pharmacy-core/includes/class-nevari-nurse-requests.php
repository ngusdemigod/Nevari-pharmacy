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
    }

    public static function customer_permission(): bool {
        return Nevari_Auth::api_session_required();
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

        $care_type = sanitize_text_field((string) ($body['careType'] ?? ''));
        $patient = self::sanitize_deep(is_array($body['patient'] ?? null) ? $body['patient'] : []);
        $care_details = self::sanitize_deep(is_array($body['careDetails'] ?? null) ? $body['careDetails'] : []);
        $clinical_requirements = self::sanitize_text_list(is_array($body['clinicalRequirements'] ?? null) ? $body['clinicalRequirements'] : []);
        $uploaded_medical_files = self::sanitize_file_map(is_array($body['uploadedMedicalFiles'] ?? null) ? $body['uploadedMedicalFiles'] : []);
        $customer_email = sanitize_email((string) ($body['customerEmail'] ?? ''));
        $customer_name = sanitize_text_field((string) ($body['customerName'] ?? ($patient['name'] ?? 'Customer')));
        $customer_phone = sanitize_text_field((string) ($body['customerPhone'] ?? ($patient['emergencyContact'] ?? '')));
        $admin_email = sanitize_email((string) ($body['adminEmail'] ?? get_option('admin_email')));
        $app_origin = esc_url_raw((string) ($body['appOrigin'] ?? ''));

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

        $items = self::list_requests($user_id);
        array_unshift($items, $request_item);
        update_user_meta($user_id, self::META_KEY, array_values($items));

        if (!wp_next_scheduled(self::NOTIFY_HOOK, [$user_id, $request_id])) {
            wp_schedule_single_event(time() + 5, self::NOTIFY_HOOK, [$user_id, $request_id]);
        }

        return Nevari_Helpers::success([
            'request' => $request_item,
            'notifications' => 'queued',
        ], [], 201);
    }

    public static function send_submission_notifications(int $user_id, string $request_id): void {
        $request = self::find_request($user_id, $request_id);
        if (!$request || !empty($request['notificationsDispatchedAt'])) {
            return;
        }

        $customer_email = sanitize_email((string) ($request['customerEmail'] ?? ''));
        $admin_email = sanitize_email((string) ($request['adminEmail'] ?? get_option('admin_email')));
        $customer_name = sanitize_text_field((string) ($request['customerName'] ?? 'Customer'));
        $customer_phone = sanitize_text_field((string) ($request['customerPhone'] ?? ''));
        $care_type = sanitize_text_field((string) ($request['careType'] ?? 'Nurse Request'));
        $preferred_date = sanitize_text_field((string) ($request['preferredDate'] ?? ''));
        $preferred_time = sanitize_text_field((string) ($request['preferredTime'] ?? ''));
        $visit_type = sanitize_text_field((string) ($request['visitType'] ?? ''));
        $clinical_requirements = isset($request['clinicalRequirements']) && is_array($request['clinicalRequirements'])
            ? implode(', ', array_map('sanitize_text_field', $request['clinicalRequirements']))
            : '';
        $app_origin = esc_url_raw((string) ($request['appOrigin'] ?? ''));
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
        $stored = get_user_meta($user_id, self::META_KEY, true);
        if (!is_array($stored)) {
            return [];
        }
        $items = array_values(array_filter(array_map([__CLASS__, 'normalize_request'], $stored)));
        usort($items, static function (array $left, array $right): int {
            return strcmp((string) ($right['submittedAt'] ?? ''), (string) ($left['submittedAt'] ?? ''));
        });
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
        $stored = get_user_meta($user_id, self::META_KEY, true);
        if (!is_array($stored)) {
            return;
        }
        foreach ($stored as $index => $item) {
            if ((string) ($item['id'] ?? '') !== $request_id) {
                continue;
            }
            $stored[$index]['notificationsDispatchedAt'] = gmdate('c');
            $stored[$index]['updatedAt'] = current_time('mysql');
            update_user_meta($user_id, self::META_KEY, array_values($stored));
            return;
        }
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
                $result[sanitize_key((string) $key)] = self::sanitize_deep($item);
            }
            return $result;
        }
        return sanitize_text_field((string) $value);
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
