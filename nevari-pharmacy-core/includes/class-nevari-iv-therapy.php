<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Iv_Therapy {
    private const META_KEY = 'nevari_iv_therapy_requests';
    private const NOTIFY_HOOK = 'nevari_send_iv_therapy_notifications';
    private const STATUS_SUBMITTED = 'submitted';

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
        add_action(self::NOTIFY_HOOK, [__CLASS__, 'send_submission_notifications'], 10, 2);
    }

    public static function register_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/iv-therapy-requests', [
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/pharmacist/iv-therapy-requests', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'staff_index'],
                'permission_callback' => [__CLASS__, 'staff_permission'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/pharmacist/iv-therapy-requests/(?P<id>[A-Za-z0-9\-_]+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'staff_show'],
                'permission_callback' => [__CLASS__, 'staff_permission'],
            ],
        ]);
    }

    public static function customer_permission(): bool {
        return Nevari_Auth::api_session_required();
    }

    public static function staff_permission(): bool {
        if (!Nevari_Auth::api_session_required()) {
            return false;
        }
        $user_id = Nevari_Auth::api_session_user_id();
        return $user_id > 0 && (Nevari_Helpers::is_store_admin($user_id) || Nevari_Helpers::is_pharmacist($user_id));
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

        $patient = self::sanitize_deep(is_array($body['patient'] ?? null) ? $body['patient'] : []);
        $clinical_history = self::sanitize_deep(is_array($body['clinicalHistory'] ?? null) ? $body['clinicalHistory'] : []);
        $goals = self::sanitize_deep(is_array($body['goals'] ?? null) ? $body['goals'] : []);
        $therapy_types = self::sanitize_text_list(is_array($body['therapyTypes'] ?? null) ? $body['therapyTypes'] : []);
        $consent = sanitize_text_field((string) ($body['consent'] ?? ''));
        $customer_email = sanitize_email((string) ($body['customerEmail'] ?? ''));
        $customer_name = sanitize_text_field((string) ($body['customerName'] ?? ($patient['name'] ?? 'Customer')));
        $customer_phone = sanitize_text_field((string) ($body['customerPhone'] ?? ($patient['phoneNumber'] ?? '')));
        $app_origin = esc_url_raw((string) ($body['appOrigin'] ?? ''));
        $frontend_type = sanitize_text_field((string) ($body['frontendType'] ?? 'patient'));

        if (empty($patient['name'])) {
            return Nevari_Helpers::error('validation_error', 'Patient name is required.', 422, ['field' => 'name']);
        }
        if (empty($patient['gender'])) {
            return Nevari_Helpers::error('validation_error', 'Gender is required.', 422, ['field' => 'gender']);
        }
        if (empty($patient['address'])) {
            return Nevari_Helpers::error('validation_error', 'Address is required.', 422, ['field' => 'address']);
        }
        $state = sanitize_text_field((string) ($patient['state'] ?? ''));
        $city = sanitize_text_field((string) ($patient['city'] ?? ''));
        $legacy_city_state = sanitize_text_field((string) ($patient['cityState'] ?? ''));
        if (($state === '' || $city === '') && $legacy_city_state !== '' && strpos($legacy_city_state, ',') !== false) {
            [$legacy_city, $legacy_state] = array_map('trim', explode(',', $legacy_city_state, 2));
            if ($city === '') {
                $city = sanitize_text_field((string) $legacy_city);
            }
            if ($state === '') {
                $state = sanitize_text_field((string) $legacy_state);
            }
        }
        if ($state === '') {
            return Nevari_Helpers::error('validation_error', 'State is required.', 422, ['field' => 'state']);
        }
        if ($city === '') {
            return Nevari_Helpers::error('validation_error', 'City is required.', 422, ['field' => 'city']);
        }
        $patient['state'] = $state;
        $patient['city'] = $city;
        $patient['cityState'] = $legacy_city_state !== '' ? $legacy_city_state : trim($city . ', ' . $state, ', ');
        if (empty($patient['phoneNumber'])) {
            return Nevari_Helpers::error('validation_error', 'Phone number is required.', 422, ['field' => 'phoneNumber']);
        }
        if (!$therapy_types) {
            return Nevari_Helpers::error('validation_error', 'Select at least one IV therapy type.', 422, ['field' => 'therapyTypes']);
        }
        if ($consent !== 'Yes') {
            return Nevari_Helpers::error('validation_error', 'Consent is required before submission.', 422, ['field' => 'consent']);
        }

        $created_at = current_time('mysql');
        $request_item = [
            'id' => 'ivt_' . wp_generate_uuid4(),
            'requestReference' => self::request_reference(),
            'status' => self::STATUS_SUBMITTED,
            'title' => 'IV Therapy (Wellness infusions) Request',
            'patient' => $patient,
            'clinicalHistory' => $clinical_history,
            'therapyTypes' => $therapy_types,
            'goals' => $goals,
            'consent' => $consent,
            'customerEmail' => $customer_email,
            'customerName' => $customer_name,
            'customerPhone' => $customer_phone,
            'customerUserId' => $user_id,
            'frontendType' => $frontend_type,
            'appOrigin' => $app_origin,
            'submittedAt' => get_gmt_from_date($created_at),
            'createdAt' => $created_at,
            'updatedAt' => $created_at,
        ];

        $items = self::list_requests($user_id);
        array_unshift($items, $request_item);
        update_user_meta($user_id, self::META_KEY, array_values($items));

        if (!wp_next_scheduled(self::NOTIFY_HOOK, [$user_id, $request_item['id']])) {
            wp_schedule_single_event(time() + 5, self::NOTIFY_HOOK, [$user_id, $request_item['id']]);
        }

        return Nevari_Helpers::success([
            'request' => $request_item,
            'notifications' => 'queued',
        ], [], 201);
    }

    public static function staff_index(WP_REST_Request $request): WP_REST_Response {
        return Nevari_Helpers::success([
            'items' => self::all_requests(),
        ]);
    }

    public static function staff_show(WP_REST_Request $request): WP_REST_Response {
        $request_id = sanitize_text_field((string) $request['id']);
        $item = self::find_request_across_users($request_id);
        if (!$item) {
            return Nevari_Helpers::error('iv_therapy_not_found', 'IV therapy request not found.', 404);
        }

        return Nevari_Helpers::success([
            'request' => $item,
        ]);
    }

    public static function send_submission_notifications(int $user_id, string $request_id): void {
        $request = self::find_request($user_id, $request_id);
        if (!$request || !empty($request['notificationsDispatchedAt'])) {
            return;
        }

        $customer_email = sanitize_email((string) ($request['customerEmail'] ?? ''));
        $customer_name = sanitize_text_field((string) ($request['customerName'] ?? 'Customer'));
        $customer_phone = sanitize_text_field((string) ($request['customerPhone'] ?? ''));
        $request_reference = sanitize_text_field((string) ($request['requestReference'] ?? ''));
        $therapy_types = isset($request['therapyTypes']) && is_array($request['therapyTypes'])
            ? implode(', ', array_map('sanitize_text_field', $request['therapyTypes']))
            : '';
        $patient = is_array($request['patient'] ?? null) ? $request['patient'] : [];
        $clinical_history = is_array($request['clinicalHistory'] ?? null) ? $request['clinicalHistory'] : [];
        $goals = is_array($request['goals'] ?? null) ? $request['goals'] : [];
        $app_origin = esc_url_raw((string) ($request['appOrigin'] ?? ''));

        if ($customer_email && is_email($customer_email)) {
            Nevari_Emails::queue_or_send([
                'recipient_user_id' => $user_id,
                'recipient_email' => $customer_email,
                'related_object_type' => 'iv_therapy_request',
                'related_object_id' => 0,
                'subject' => 'Your IV therapy request has been received',
                'body_html' => sprintf(
                    '<p>Hello %1$s,</p><p>Your IV therapy request %2$s has been received and is awaiting review.</p><p><strong>Requested therapy:</strong> %3$s</p>',
                    esc_html($customer_name ?: 'Customer'),
                    esc_html($request_reference ?: 'IV Therapy Request'),
                    esc_html($therapy_types ?: 'Not specified')
                ),
            ], false);
        }

        foreach (self::admin_notification_recipients() as $recipient) {
            $admin_body = sprintf(
                '<p>A new IV therapy request has been submitted.</p><p><strong>Request:</strong> %1$s<br /><strong>Customer:</strong> %2$s<br /><strong>Phone:</strong> %3$s<br /><strong>Email:</strong> %4$s<br /><strong>Gender:</strong> %5$s<br /><strong>Address:</strong> %6$s<br /><strong>State:</strong> %7$s<br /><strong>City:</strong> %8$s<br /><strong>Therapy Types:</strong> %9$s<br /><strong>Chronic Conditions:</strong> %10$s<br /><strong>Current Medications:</strong> %11$s<br /><strong>Allergies:</strong> %12$s<br /><strong>Previous IV Therapy:</strong> %13$s<br /><strong>Blood Clot History:</strong> %14$s<br /><strong>Main Goal:</strong> %15$s<br /><strong>Expected Results:</strong> %16$s</p>',
                esc_html($request_reference ?: 'IV Therapy Request'),
                esc_html($customer_name),
                esc_html($customer_phone ?: 'n/a'),
                esc_html($customer_email ?: 'n/a'),
                esc_html((string) ($patient['gender'] ?? 'n/a')),
                esc_html((string) ($patient['address'] ?? 'n/a')),
                esc_html((string) ($patient['state'] ?? 'n/a')),
                esc_html((string) ($patient['city'] ?? 'n/a')),
                esc_html($therapy_types ?: 'Not specified'),
                esc_html((string) ($clinical_history['chronicConditionsDetails'] ?? ($clinical_history['chronicConditions'] ?? 'No'))),
                esc_html((string) ($clinical_history['currentMedicationsDetails'] ?? ($clinical_history['currentMedications'] ?? 'No'))),
                esc_html((string) ($clinical_history['allergiesDetails'] ?? ($clinical_history['allergies'] ?? 'No'))),
                esc_html((string) ($clinical_history['priorIvTherapyDetails'] ?? ($clinical_history['priorIvTherapy'] ?? 'No'))),
                esc_html((string) ($clinical_history['bloodClotHistory'] ?? 'No')),
                esc_html((string) ($goals['primaryReason'] ?? 'Not provided')),
                esc_html((string) ($goals['expectedResults'] ?? 'Not provided'))
            );
            if ($app_origin !== '') {
                $admin_body .= sprintf(
                    '<p><a href="%1$s/admin/storefront">Open admin dashboard</a><br /><a href="%1$s/admin/pharmacist">Open pharmacist dashboard</a></p>',
                    esc_url($app_origin)
                );
            }

            Nevari_Emails::queue_or_send([
                'recipient_user_id' => (int) $recipient->ID,
                'recipient_email' => $recipient->user_email,
                'related_object_type' => 'iv_therapy_request',
                'related_object_id' => 0,
                'subject' => 'New IV therapy request submitted',
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

        $items = array_values(array_filter(array_map(static function ($item) use ($user_id) {
            return self::normalize_request($item, $user_id);
        }, $stored)));

        usort($items, static function (array $left, array $right): int {
            return strcmp((string) ($right['submittedAt'] ?? ''), (string) ($left['submittedAt'] ?? ''));
        });

        return $items;
    }

    private static function all_requests(): array {
        $items = [];
        $users = get_users([
            'role__in' => ['customer', 'patient'],
            'fields' => ['ID'],
            'number' => -1,
        ]);

        foreach ($users as $user) {
            $user_id = (int) ($user->ID ?? 0);
            if ($user_id < 1) {
                continue;
            }
            foreach (self::list_requests($user_id) as $request) {
                $items[] = $request;
            }
        }

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

    private static function find_request_across_users(string $request_id): ?array {
        foreach (self::all_requests() as $item) {
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

    private static function normalize_request($item, int $fallback_user_id = 0): ?array {
        if (!is_array($item) || empty($item['id'])) {
            return null;
        }

        $customer_user_id = (int) ($item['customerUserId'] ?? $fallback_user_id);
        $customer = $customer_user_id > 0 ? get_user_by('id', $customer_user_id) : null;

                $patient = self::sanitize_deep(is_array($item['patient'] ?? null) ? $item['patient'] : []);
        $legacy_city_state = sanitize_text_field((string) ($patient['cityState'] ?? ''));
        $city = sanitize_text_field((string) ($patient['city'] ?? ''));
        $state = sanitize_text_field((string) ($patient['state'] ?? ''));
        if (($city === '' || $state === '') && $legacy_city_state !== '' && strpos($legacy_city_state, ',') !== false) {
            [$legacy_city, $legacy_state] = array_map('trim', explode(',', $legacy_city_state, 2));
            if ($city === '') {
                $city = sanitize_text_field((string) $legacy_city);
            }
            if ($state === '') {
                $state = sanitize_text_field((string) $legacy_state);
            }
        }
        $patient['city'] = $city;
        $patient['state'] = $state;
        $patient['cityState'] = $legacy_city_state !== '' ? $legacy_city_state : trim($city . ', ' . $state, ', ');

        return [
            'id' => sanitize_text_field((string) ($item['id'] ?? '')),
            'request_reference' => sanitize_text_field((string) ($item['requestReference'] ?? self::request_reference())),
            'status' => sanitize_key((string) ($item['status'] ?? self::STATUS_SUBMITTED)),
            'status_label' => 'Submitted',
            'title' => sanitize_text_field((string) ($item['title'] ?? 'IV Therapy (Wellness infusions) Request')),
            'patient' => $patient,
            'clinical_history' => self::sanitize_deep(is_array($item['clinicalHistory'] ?? null) ? $item['clinicalHistory'] : []),
            'therapy_types' => self::sanitize_text_list(is_array($item['therapyTypes'] ?? null) ? $item['therapyTypes'] : []),
            'goals' => self::sanitize_deep(is_array($item['goals'] ?? null) ? $item['goals'] : []),
            'consent' => sanitize_text_field((string) ($item['consent'] ?? 'No')),
            'customer_user_id' => $customer_user_id,
            'customer_name' => sanitize_text_field((string) ($item['customerName'] ?? ($customer instanceof WP_User ? $customer->display_name : 'Customer'))),
            'customer_email' => sanitize_email((string) ($item['customerEmail'] ?? ($customer instanceof WP_User ? $customer->user_email : ''))),
            'customer_phone' => sanitize_text_field((string) ($item['customerPhone'] ?? '')),
            'frontend_type' => sanitize_text_field((string) ($item['frontendType'] ?? 'patient')),
            'app_origin' => esc_url_raw((string) ($item['appOrigin'] ?? '')),
            'submitted_at' => sanitize_text_field((string) ($item['submittedAt'] ?? '')),
            'submittedAt' => sanitize_text_field((string) ($item['submittedAt'] ?? '')),
            'created_at' => sanitize_text_field((string) ($item['createdAt'] ?? '')),
            'createdAt' => sanitize_text_field((string) ($item['createdAt'] ?? '')),
            'updated_at' => sanitize_text_field((string) ($item['updatedAt'] ?? '')),
            'updatedAt' => sanitize_text_field((string) ($item['updatedAt'] ?? '')),
            'notificationsDispatchedAt' => sanitize_text_field((string) ($item['notificationsDispatchedAt'] ?? '')),
        ];
    }

    private static function sanitize_text_list(array $items): array {
        return array_values(array_filter(array_map(static function ($value): string {
            return sanitize_text_field((string) $value);
        }, $items)));
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

    private static function admin_notification_recipients(): array {
        $users = get_users([
            'number' => 250,
        ]);

        $recipients = array_values(array_filter($users, static function ($user): bool {
            return is_object($user)
                && !empty($user->user_email)
                && is_email($user->user_email)
                && Nevari_Helpers::is_store_admin((int) $user->ID);
        }));

        if ($recipients) {
            return $recipients;
        }

        $fallback = sanitize_email((string) get_option('admin_email'));
        if ($fallback && is_email($fallback)) {
            $stub = (object) [
                'ID' => 0,
                'user_email' => $fallback,
                'display_name' => 'Admin',
            ];
            return [$stub];
        }

        return [];
    }

    private static function request_reference(): string {
        return 'IVT-' . strtoupper(substr(str_replace('-', '', wp_generate_uuid4()), 0, 8));
    }
}
