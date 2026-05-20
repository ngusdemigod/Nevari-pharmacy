<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Rest {
    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function register_routes(): void {
        self::orders_routes();
        self::products_routes();
        self::doctors_routes();
        self::appointments_routes();
        self::prescriptions_routes();
        self::emails_routes();
        self::dashboard_routes();
        self::audit_routes();
    }

    public static function auth_required(): bool {
        return is_user_logged_in();
    }

    public static function store_admin_required(): bool {
        return Nevari_Helpers::is_store_admin();
    }

    public static function doctor_or_admin_required(): bool {
        return Nevari_Helpers::is_doctor() || Nevari_Helpers::is_store_admin();
    }

    private static function woo_available(): bool {
        return class_exists('WooCommerce') && function_exists('wc_get_product');
    }

    private static function orders_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'orders_index'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'orders_show'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'orders_update'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        foreach (['notes', 'rx-hold', 'release-rx-hold', 'link-prescription'] as $action) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/' . $action, [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'orders_action'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ]);
        }

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/prescriptions', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'orders_prescriptions'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);
    }

    private static function products_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/products', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'products_index'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'products_create'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'products_show'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'products_update'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [__CLASS__, 'products_delete'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/(?P<id>\d+)/pharmacy-rules', [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => [__CLASS__, 'products_update_rules'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);

        foreach (['categories' => 'product_cat', 'tags' => 'product_tag'] as $path => $taxonomy) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/' . $path, [
                [
                    'methods' => WP_REST_Server::READABLE,
                    'callback' => static function (WP_REST_Request $request) use ($taxonomy) {
                        return self::terms_index($request, $taxonomy);
                    },
                    'permission_callback' => [__CLASS__, 'auth_required'],
                ],
                [
                    'methods' => WP_REST_Server::CREATABLE,
                    'callback' => static function (WP_REST_Request $request) use ($taxonomy) {
                        return self::terms_create($request, $taxonomy);
                    },
                    'permission_callback' => [__CLASS__, 'store_admin_required'],
                ],
            ]);
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/' . $path . '/(?P<id>\d+)', [
                [
                    'methods' => WP_REST_Server::EDITABLE,
                    'callback' => static function (WP_REST_Request $request) use ($taxonomy) {
                        return self::terms_update($request, $taxonomy);
                    },
                    'permission_callback' => [__CLASS__, 'store_admin_required'],
                ],
                [
                    'methods' => WP_REST_Server::DELETABLE,
                    'callback' => static function (WP_REST_Request $request) use ($taxonomy) {
                        return self::terms_delete($request, $taxonomy);
                    },
                    'permission_callback' => [__CLASS__, 'store_admin_required'],
                ],
            ]);
        }

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/badges', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'product_badges'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);
    }

    private static function doctors_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/doctors', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'doctors_index'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'doctors_create'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/doctors/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'doctors_show'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'doctors_update'],
                'permission_callback' => [__CLASS__, 'doctor_or_admin_required'],
            ],
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [__CLASS__, 'doctors_delete'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/doctors/(?P<id>\d+)/availability', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'doctors_availability'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'doctors_update_availability'],
                'permission_callback' => [__CLASS__, 'doctor_or_admin_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/doctors/(?P<id>\d+)/patients', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'doctors_patients'],
            'permission_callback' => [__CLASS__, 'doctor_or_admin_required'],
        ]);
    }

    private static function appointments_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'appointments_index'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'appointments_create'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'appointments_show'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'appointments_update'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [__CLASS__, 'appointments_delete'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        foreach (['cancel', 'confirm', 'complete', 'reschedule', 'notes'] as $action) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/(?P<id>\d+)/' . $action, [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'appointments_action'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ]);
        }
    }

    private static function prescriptions_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/prescriptions', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'prescriptions_index'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'prescriptions_create'],
                'permission_callback' => [__CLASS__, 'doctor_or_admin_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/prescriptions/validate-cart', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'prescriptions_validate_cart'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/prescriptions/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'prescriptions_show'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'prescriptions_update'],
                'permission_callback' => [__CLASS__, 'doctor_or_admin_required'],
            ],
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [__CLASS__, 'prescriptions_delete'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        foreach (['issue', 'assign', 'cancel', 'link-order', 'fulfill'] as $action) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/prescriptions/(?P<id>\d+)/' . $action, [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'prescriptions_action'],
                'permission_callback' => [__CLASS__, 'doctor_or_admin_required'],
            ]);
        }

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/prescriptions/(?P<id>\d+)/history', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'prescriptions_history'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);
    }

    private static function emails_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/emails/logs', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'emails_logs_index'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/emails/logs/(?P<id>\d+)', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'emails_logs_show'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/emails/send', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'emails_send'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/emails/templates', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'emails_templates_index'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'emails_templates_create'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/emails/templates/(?P<id>\d+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'emails_templates_show'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'emails_templates_update'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [__CLASS__, 'emails_templates_delete'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/emails/templates/(?P<id>\d+)/preview', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'emails_templates_preview'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/emails/templates/(?P<id>\d+)/test', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'emails_templates_test'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
    }

    private static function dashboard_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/dashboard/patient', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'dashboard_patient'],
            'permission_callback' => static function () { return Nevari_Helpers::is_patient(); },
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/dashboard/doctor', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'dashboard_doctor'],
            'permission_callback' => static function () { return Nevari_Helpers::is_doctor(); },
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/dashboard/store-admin', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'dashboard_store_admin'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/dashboard/store-admin/sales', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'dashboard_sales'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/dashboard/store-admin/audit-summary', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'audit_summary'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
    }

    private static function audit_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/audit-logs', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'audit_logs_index'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/audit-logs/(?P<id>\d+)', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'audit_logs_show'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
    }

    public static function orders_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'index'])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required for orders.', 503);
        }
        $page = max(1, (int) $request->get_param('page')) ?: 1;
        $per_page = min(100, max(1, (int) $request->get_param('per_page') ?: 20));
        $args = [
            'limit' => $per_page,
            'page' => $page,
            'paginate' => true,
            'orderby' => 'date',
            'order' => 'DESC',
        ];
        if ($request->get_param('status')) {
            $args['status'] = sanitize_key((string) $request->get_param('status'));
        }
        if (!Nevari_Helpers::is_store_admin()) {
            if (Nevari_Helpers::is_patient()) {
                $args['customer_id'] = get_current_user_id();
            } else {
                return Nevari_Helpers::error('forbidden', 'Doctors cannot list all orders.', 403);
            }
        } elseif ($request->get_param('patient_id')) {
            $args['customer_id'] = (int) $request->get_param('patient_id');
        }

        $result = wc_get_orders($args);
        $orders = is_object($result) && isset($result->orders) ? $result->orders : [];
        $total = is_object($result) && isset($result->total) ? (int) $result->total : count($orders);
        $items = array_map([__CLASS__, 'format_order'], $orders);
        return Nevari_Helpers::success($items, Nevari_Helpers::pagination_meta($page, $per_page, $total));
    }

    public static function orders_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'show'])) {
            return $response;
        }
        $order = self::get_order_scoped((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) $order->get_error_data('status') ?: 404);
        }
        return Nevari_Helpers::success(self::format_order($order, true));
    }

    public static function orders_update(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }
        $order = wc_get_order((int) $request['id']);
        if (!$order) {
            return Nevari_Helpers::error('order_not_found', 'Order not found.', 404);
        }
        $params = Nevari_Helpers::get_json_params($request);
        if (!empty($params['status'])) {
            $order->update_status(sanitize_key((string) $params['status']), 'Updated from Nevari dashboard.');
        }
        if (!empty($params['customer_note'])) {
            $order->set_customer_note(sanitize_textarea_field((string) $params['customer_note']));
        }
        $order->save();
        Nevari_Audit::log('orders', 'nevari', 'order.updated', 'success', ['order_id' => $order->get_id(), 'object_type' => 'shop_order', 'object_id' => $order->get_id()]);
        return Nevari_Helpers::success(self::format_order($order, true));
    }

    public static function orders_action(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_action', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }
        $order = wc_get_order((int) $request['id']);
        if (!$order) {
            return Nevari_Helpers::error('order_not_found', 'Order not found.', 404);
        }
        $route = $request->get_route();
        $params = Nevari_Helpers::get_json_params($request);

        if (str_ends_with($route, '/notes')) {
            $note = isset($params['note']) ? sanitize_textarea_field((string) $params['note']) : '';
            if (!$note) {
                return Nevari_Helpers::error('validation_error', 'note is required.', 422);
            }
            $order->add_order_note($note, false, true);
            Nevari_Audit::log('orders', 'nevari', 'order.note_added', 'success', ['order_id' => $order->get_id(), 'message' => 'Order note added.']);
        } elseif (str_ends_with($route, '/rx-hold')) {
            $order->update_meta_data('_nevari_rx_validation_status', 'on_hold');
            $order->update_status('on-hold', 'Placed on prescription hold from Nevari dashboard.');
            Nevari_Audit::log('orders', 'nevari', 'order.rx_hold_applied', 'success', ['order_id' => $order->get_id(), 'message' => 'RX hold applied.']);
        } elseif (str_ends_with($route, '/release-rx-hold')) {
            $order->update_meta_data('_nevari_rx_validation_status', 'released');
            if ($order->has_status('on-hold')) {
                $order->update_status('processing', 'Prescription hold released from Nevari dashboard.');
            }
            Nevari_Audit::log('orders', 'nevari', 'order.rx_hold_released', 'success', ['order_id' => $order->get_id(), 'message' => 'RX hold released.']);
        } elseif (str_ends_with($route, '/link-prescription')) {
            $prescription_id = isset($params['prescription_id']) ? (int) $params['prescription_id'] : 0;
            $prescription = self::get_prescription_row($prescription_id);
            if (!$prescription) {
                return Nevari_Helpers::error('prescription_not_found', 'Prescription not found.', 404);
            }
            if ((int) $prescription->patient_user_id !== (int) $order->get_user_id()) {
                return Nevari_Helpers::error('prescription_patient_mismatch', 'Prescription does not belong to order customer.', 409);
            }
            $order->update_meta_data('_nevari_prescription_id', $prescription_id);
            $order->update_meta_data('_nevari_rx_validation_status', 'linked');
            self::update_prescription_status($prescription_id, ['order_id' => $order->get_id()], 'order_linked', 'Prescription linked to order.');
            Nevari_Audit::log('orders', 'nevari', 'order.prescription_linked', 'success', ['order_id' => $order->get_id(), 'prescription_id' => $prescription_id, 'message' => 'Prescription linked to order.']);
        }
        $order->save();
        return Nevari_Helpers::success(self::format_order($order, true));
    }

    public static function orders_prescriptions(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'prescriptions'])) {
            return $response;
        }
        $order = self::get_order_scoped((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) $order->get_error_data('status') ?: 404);
        }
        global $wpdb;
        $table = Nevari_Helpers::table('prescriptions');
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE order_id = %d OR id = %d ORDER BY created_at DESC", $order->get_id(), (int) $order->get_meta('_nevari_prescription_id')));
        $items = [];
        foreach ($rows ?: [] as $row) {
            if (Nevari_Helpers::can_view_prescription($row)) {
                $items[] = Nevari_Helpers::format_prescription($row);
            }
        }
        return Nevari_Helpers::success($items);
    }

    private static function get_order_scoped(int $order_id) {
        if (!self::woo_available()) {
            return new WP_Error('woocommerce_missing', 'WooCommerce is required.', ['status' => 503]);
        }
        $order = wc_get_order($order_id);
        if (!$order) {
            return new WP_Error('order_not_found', 'Order not found.', ['status' => 404]);
        }
        if (Nevari_Helpers::is_store_admin()) {
            return $order;
        }
        if (Nevari_Helpers::is_patient() && (int) $order->get_user_id() === get_current_user_id()) {
            return $order;
        }
        if (Nevari_Helpers::is_doctor()) {
            $prescription_id = (int) $order->get_meta('_nevari_prescription_id');
            $prescription = $prescription_id ? self::get_prescription_row($prescription_id) : null;
            if ($prescription && Nevari_Helpers::can_view_prescription($prescription)) {
                return $order;
            }
        }
        return new WP_Error('forbidden', 'You cannot view this order.', ['status' => 403]);
    }

    private static function format_order($order, bool $include_items = false): array {
        $data = [
            'id' => $order->get_id(),
            'number' => $order->get_order_number(),
            'status' => $order->get_status(),
            'currency' => $order->get_currency(),
            'total' => $order->get_total(),
            'customer_id' => $order->get_user_id(),
            'rx_status' => $order->get_meta('_nevari_rx_validation_status') ?: null,
            'prescription_id' => $order->get_meta('_nevari_prescription_id') ? (int) $order->get_meta('_nevari_prescription_id') : null,
            'created_at' => $order->get_date_created() ? $order->get_date_created()->date('c') : null,
        ];
        if ($include_items) {
            $data['items'] = [];
            foreach ($order->get_items() as $item) {
                $data['items'][] = [
                    'id' => $item->get_id(),
                    'product_id' => $item->get_product_id(),
                    'variation_id' => $item->get_variation_id(),
                    'name' => $item->get_name(),
                    'quantity' => $item->get_quantity(),
                    'total' => $item->get_total(),
                    'rx_required' => $item->get_meta('_nevari_rx_required') === 'yes',
                    'prescription_id' => $item->get_meta('_nevari_prescription_id') ? (int) $item->get_meta('_nevari_prescription_id') : null,
                ];
            }
        }
        return $data;
    }

    public static function products_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'index'])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required for products.', 503);
        }
        $page = max(1, (int) $request->get_param('page') ?: 1);
        $per_page = min(100, max(1, (int) $request->get_param('per_page') ?: 20));
        $args = [
            'limit' => $per_page,
            'page' => $page,
            'paginate' => true,
            'status' => ['publish', 'private', 'draft'],
            'orderby' => 'date',
            'order' => 'DESC',
        ];
        if (!Nevari_Helpers::is_store_admin()) {
            $args['status'] = 'publish';
            $args['meta_query'] = [
                'relation' => 'OR',
                [
                    'key' => '_nevari_restricted_visibility',
                    'compare' => 'NOT EXISTS',
                ],
                [
                    'key' => '_nevari_restricted_visibility',
                    'value' => '1',
                    'compare' => '!=',
                ],
            ];
        }
        if ($request->get_param('search')) {
            $args['s'] = sanitize_text_field((string) $request->get_param('search'));
        }
        if ($request->get_param('category')) {
            $args['category'] = [sanitize_title((string) $request->get_param('category'))];
        }
        $result = wc_get_products($args);
        $products = is_object($result) && isset($result->products) ? $result->products : [];
        $total = is_object($result) && isset($result->total) ? (int) $result->total : count($products);
        $items = array_map([__CLASS__, 'format_product'], $products);
        return Nevari_Helpers::success($items, Nevari_Helpers::pagination_meta($page, $per_page, $total));
    }

    public static function products_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'show'])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }
        $product = wc_get_product((int) $request['id']);
        if (!$product) {
            return Nevari_Helpers::error('product_not_found', 'Product not found.', 404);
        }
        if (!Nevari_Helpers::is_store_admin()) {
            if ($product->get_status() !== 'publish') {
                return Nevari_Helpers::error('product_not_found', 'Product not found.', 404);
            }
            if (Nevari_Helpers::bool_param(get_post_meta($product->get_id(), '_nevari_restricted_visibility', true))) {
                return Nevari_Helpers::error('product_not_found', 'Product not found.', 404);
            }
        }
        return Nevari_Helpers::success(self::format_product($product, true));
    }

    public static function products_create(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        if (!class_exists('WC_Product_Simple')) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }
        $params = Nevari_Helpers::get_json_params($request);
        $name = isset($params['name']) ? sanitize_text_field((string) $params['name']) : '';
        if (!$name) {
            return Nevari_Helpers::error('validation_error', 'name is required.', 422);
        }
        $product = new WC_Product_Simple();
        $product->set_name($name);
        $product->set_status(isset($params['status']) ? sanitize_key((string) $params['status']) : 'draft');
        if (isset($params['regular_price'])) {
            $product->set_regular_price(wc_format_decimal($params['regular_price']));
        }
        if (isset($params['description'])) {
            $product->set_description(wp_kses_post((string) $params['description']));
        }
        if (isset($params['short_description'])) {
            $product->set_short_description(wp_kses_post((string) $params['short_description']));
        }
        $product_id = $product->save();
        if (!empty($params['pharmacy_rules']) && is_array($params['pharmacy_rules'])) {
            Nevari_Helpers::update_product_rules($product_id, $params['pharmacy_rules']);
        }
        Nevari_Audit::log('orders', 'nevari', 'product.created', 'success', ['product_id' => $product_id, 'object_type' => 'product', 'object_id' => $product_id]);
        return Nevari_Helpers::success(self::format_product(wc_get_product($product_id), true), [], 201);
    }

    public static function products_update(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }
        $product = wc_get_product((int) $request['id']);
        if (!$product) {
            return Nevari_Helpers::error('product_not_found', 'Product not found.', 404);
        }
        $params = Nevari_Helpers::get_json_params($request);
        foreach (['name', 'status', 'description', 'short_description', 'regular_price', 'sale_price', 'sku', 'stock_quantity'] as $field) {
            if (!array_key_exists($field, $params)) {
                continue;
            }
            switch ($field) {
                case 'name': $product->set_name(sanitize_text_field((string) $params[$field])); break;
                case 'status': $product->set_status(sanitize_key((string) $params[$field])); break;
                case 'description': $product->set_description(wp_kses_post((string) $params[$field])); break;
                case 'short_description': $product->set_short_description(wp_kses_post((string) $params[$field])); break;
                case 'regular_price': $product->set_regular_price(wc_format_decimal($params[$field])); break;
                case 'sale_price': $product->set_sale_price(wc_format_decimal($params[$field])); break;
                case 'sku': $product->set_sku(sanitize_text_field((string) $params[$field])); break;
                case 'stock_quantity': $product->set_stock_quantity((int) $params[$field]); break;
            }
        }
        $product->save();
        if (!empty($params['pharmacy_rules']) && is_array($params['pharmacy_rules'])) {
            Nevari_Helpers::update_product_rules($product->get_id(), $params['pharmacy_rules']);
        }
        Nevari_Audit::log('orders', 'nevari', 'product.updated', 'success', ['product_id' => $product->get_id(), 'object_type' => 'product', 'object_id' => $product->get_id()]);
        return Nevari_Helpers::success(self::format_product(wc_get_product($product->get_id()), true));
    }

    public static function products_delete(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        $deleted = wp_trash_post((int) $request['id']);
        if (!$deleted) {
            return Nevari_Helpers::error('product_not_found', 'Product not found or could not be deleted.', 404);
        }
        Nevari_Audit::log('orders', 'nevari', 'product.deleted', 'success', ['product_id' => (int) $request['id'], 'object_type' => 'product', 'object_id' => (int) $request['id']]);
        return Nevari_Helpers::success(['deleted' => true]);
    }

    public static function products_update_rules(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        $product_id = (int) $request['id'];
        if (get_post_type($product_id) !== 'product') {
            return Nevari_Helpers::error('product_not_found', 'Product not found.', 404);
        }
        $params = Nevari_Helpers::get_json_params($request);
        if (isset($params['rx_required'], $params['otc']) && Nevari_Helpers::bool_param($params['rx_required']) && Nevari_Helpers::bool_param($params['otc'])) {
            return Nevari_Helpers::error('validation_error', 'rx_required and otc cannot both be true.', 422);
        }
        Nevari_Helpers::update_product_rules($product_id, $params);
        Nevari_Audit::log('orders', 'nevari', 'product.pharmacy_rules_updated', 'success', ['product_id' => $product_id, 'object_type' => 'product', 'object_id' => $product_id]);
        return Nevari_Helpers::success(['id' => $product_id, 'pharmacy_rules' => Nevari_Helpers::product_rules($product_id)]);
    }

    private static function format_product($product, bool $include_description = false): array {
        $product_id = $product->get_id();
        $data = [
            'id' => $product_id,
            'name' => $product->get_name(),
            'type' => $product->get_type(),
            'status' => $product->get_status(),
            'sku' => $product->get_sku(),
            'price' => $product->get_price(),
            'regular_price' => $product->get_regular_price(),
            'sale_price' => $product->get_sale_price(),
            'stock_status' => $product->get_stock_status(),
            'stock_quantity' => $product->get_stock_quantity(),
            'categories' => wp_get_post_terms($product_id, 'product_cat', ['fields' => 'names']),
            'tags' => wp_get_post_terms($product_id, 'product_tag', ['fields' => 'names']),
            'pharmacy_rules' => Nevari_Helpers::product_rules($product_id),
            'image' => wp_get_attachment_image_url($product->get_image_id(), 'medium') ?: null,
        ];
        if ($include_description) {
            $data['description'] = $product->get_description();
            $data['short_description'] = $product->get_short_description();
        }
        return $data;
    }

    public static function terms_index(WP_REST_Request $request, string $taxonomy): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_terms_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), $taxonomy])) {
            return $response;
        }
        $terms = get_terms(['taxonomy' => $taxonomy, 'hide_empty' => false]);
        if (is_wp_error($terms)) {
            return Nevari_Helpers::error('terms_error', $terms->get_error_message(), 400);
        }
        return Nevari_Helpers::success(array_map(static function ($term) {
            return ['id' => (int) $term->term_id, 'name' => $term->name, 'slug' => $term->slug, 'count' => (int) $term->count];
        }, $terms));
    }

    public static function terms_create(WP_REST_Request $request, string $taxonomy): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_terms_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), $taxonomy])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $name = isset($params['name']) ? sanitize_text_field((string) $params['name']) : '';
        if (!$name) {
            return Nevari_Helpers::error('validation_error', 'name is required.', 422);
        }
        $result = wp_insert_term($name, $taxonomy, ['slug' => !empty($params['slug']) ? sanitize_title((string) $params['slug']) : '']);
        if (is_wp_error($result)) {
            return Nevari_Helpers::error('term_error', $result->get_error_message(), 400);
        }
        return Nevari_Helpers::success(['id' => (int) $result['term_id'], 'name' => $name], [], 201);
    }

    public static function terms_update(WP_REST_Request $request, string $taxonomy): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_terms_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), $taxonomy])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $args = [];
        if (isset($params['name'])) { $args['name'] = sanitize_text_field((string) $params['name']); }
        if (isset($params['slug'])) { $args['slug'] = sanitize_title((string) $params['slug']); }
        $result = wp_update_term((int) $request['id'], $taxonomy, $args);
        if (is_wp_error($result)) {
            return Nevari_Helpers::error('term_error', $result->get_error_message(), 400);
        }
        return Nevari_Helpers::success(['id' => (int) $request['id']]);
    }

    public static function terms_delete(WP_REST_Request $request, string $taxonomy): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_terms_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), $taxonomy])) {
            return $response;
        }
        $result = wp_delete_term((int) $request['id'], $taxonomy);
        if (is_wp_error($result) || !$result) {
            return Nevari_Helpers::error('term_error', is_wp_error($result) ? $result->get_error_message() : 'Could not delete term.', 400);
        }
        return Nevari_Helpers::success(['deleted' => true]);
    }

    public static function product_badges(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'badges'])) {
            return $response;
        }
        $defaults = [
            ['key' => 'otc', 'label' => 'OTC'],
            ['key' => 'prescription_needed', 'label' => 'Prescription needed'],
            ['key' => 'consultation_required', 'label' => 'Consultation required'],
        ];
        $terms = get_terms(['taxonomy' => 'nevari_product_badge', 'hide_empty' => false]);
        if (!is_wp_error($terms) && $terms) {
            foreach ($terms as $term) {
                $defaults[] = ['key' => $term->slug, 'label' => $term->name];
            }
        }
        return Nevari_Helpers::success($defaults);
    }

    public static function doctors_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'index'])) {
            return $response;
        }
        global $wpdb;
        $page = max(1, (int) $request->get_param('page') ?: 1);
        $per_page = min(100, max(1, (int) $request->get_param('per_page') ?: 20));
        $args = [
            'role' => 'doctor',
            'number' => $per_page,
            'offset' => ($page - 1) * $per_page,
            'orderby' => 'display_name',
            'order' => 'ASC',
        ];
        if ($request->get_param('search')) {
            $args['search'] = '*' . sanitize_text_field((string) $request->get_param('search')) . '*';
            $args['search_columns'] = ['user_login', 'user_email', 'display_name'];
        }
        $query = new WP_User_Query($args);
        $users = $query->get_results();
        $items = array_map([__CLASS__, 'format_doctor'], $users);
        return Nevari_Helpers::success($items, Nevari_Helpers::pagination_meta($page, $per_page, (int) $query->get_total()));
    }

    public static function doctors_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'show'])) {
            return $response;
        }
        $user = get_user_by('id', (int) $request['id']);
        if (!$user || !in_array('doctor', (array) $user->roles, true)) {
            return Nevari_Helpers::error('doctor_not_found', 'Doctor not found.', 404);
        }
        $include_private = Nevari_Helpers::is_store_admin() || get_current_user_id() === (int) $user->ID;
        return Nevari_Helpers::success(self::format_doctor($user, $include_private));
    }

    public static function doctors_create(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $email = isset($params['email']) ? sanitize_email((string) $params['email']) : '';
        $name = isset($params['display_name']) ? sanitize_text_field((string) $params['display_name']) : '';
        if (!$email || !is_email($email) || !$name) {
            return Nevari_Helpers::error('validation_error', 'Valid email and display_name are required.', 422);
        }
        if (email_exists($email)) {
            return Nevari_Helpers::error('email_exists', 'A user with this email already exists.', 409);
        }
        $password = !empty($params['password']) ? (string) $params['password'] : wp_generate_password(20, true);
        $email_parts = explode('@', $email);
        $login_base = sanitize_user($email_parts[0] . '_' . wp_generate_password(4, false));
        $user_id = wp_insert_user([
            'user_login' => $login_base,
            'user_email' => $email,
            'user_pass' => $password,
            'display_name' => $name,
            'role' => 'doctor',
        ]);
        if (is_wp_error($user_id)) {
            return Nevari_Helpers::error('doctor_create_failed', $user_id->get_error_message(), 400);
        }
        $profile_id = self::ensure_doctor_profile((int) $user_id, $params);
        $now = Nevari_Helpers::now();
        $wpdb->replace(Nevari_Helpers::table('doctor_settings'), [
            'doctor_user_id' => (int) $user_id,
            'profile_post_id' => $profile_id,
            'license_number' => isset($params['license_number']) ? sanitize_text_field((string) $params['license_number']) : null,
            'default_appointment_duration' => isset($params['default_appointment_duration']) ? (int) $params['default_appointment_duration'] : 30,
            'timezone' => isset($params['timezone']) ? sanitize_text_field((string) $params['timezone']) : 'UTC',
            'accepts_new_patients' => isset($params['accepts_new_patients']) ? (int) Nevari_Helpers::bool_param($params['accepts_new_patients']) : 1,
            'telehealth_enabled' => isset($params['telehealth_enabled']) ? (int) Nevari_Helpers::bool_param($params['telehealth_enabled']) : 1,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        Nevari_Audit::log('consultation', 'nevari', 'doctor.created', 'success', ['related_user_id' => (int) $user_id, 'object_type' => 'user', 'object_id' => (int) $user_id]);
        return Nevari_Helpers::success(self::format_doctor(get_user_by('id', (int) $user_id), true), [], 201);
    }

    public static function doctors_update(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        $doctor_id = (int) $request['id'];
        if (!Nevari_Helpers::is_store_admin() && get_current_user_id() !== $doctor_id) {
            return Nevari_Helpers::error('forbidden', 'You can update only your own doctor profile.', 403);
        }
        $user = get_user_by('id', $doctor_id);
        if (!$user || !in_array('doctor', (array) $user->roles, true)) {
            return Nevari_Helpers::error('doctor_not_found', 'Doctor not found.', 404);
        }
        $params = Nevari_Helpers::get_json_params($request);
        $userdata = ['ID' => $doctor_id];
        if (isset($params['display_name'])) { $userdata['display_name'] = sanitize_text_field((string) $params['display_name']); }
        if (count($userdata) > 1) { wp_update_user($userdata); }
        self::ensure_doctor_profile($doctor_id, $params);
        self::upsert_doctor_settings($doctor_id, $params);
        Nevari_Audit::log('consultation', 'nevari', 'doctor.updated', 'success', ['related_user_id' => $doctor_id, 'object_type' => 'user', 'object_id' => $doctor_id]);
        return Nevari_Helpers::success(self::format_doctor(get_user_by('id', $doctor_id), true));
    }

    public static function doctors_delete(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        $doctor_id = (int) $request['id'];
        $user = get_user_by('id', $doctor_id);
        if (!$user || !in_array('doctor', (array) $user->roles, true)) {
            return Nevari_Helpers::error('doctor_not_found', 'Doctor not found.', 404);
        }
        update_user_meta($doctor_id, '_nevari_doctor_disabled', '1');
        Nevari_Audit::log('consultation', 'nevari', 'doctor.disabled', 'success', ['related_user_id' => $doctor_id, 'object_type' => 'user', 'object_id' => $doctor_id]);
        return Nevari_Helpers::success(['disabled' => true]);
    }

    public static function doctors_availability(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'availability'])) {
            return $response;
        }
        $doctor_id = (int) $request['id'];
        $user = get_user_by('id', $doctor_id);
        if (!$user || !in_array('doctor', (array) $user->roles, true)) {
            return Nevari_Helpers::error('doctor_not_found', 'Doctor not found.', 404);
        }
        $date = $request->get_param('date') ? sanitize_text_field((string) $request->get_param('date')) : gmdate('Y-m-d');
        $availability = get_user_meta($doctor_id, '_nevari_availability', true);
        $availability = is_array($availability) ? $availability : [];
        $slots = self::build_available_slots($doctor_id, $date, $availability);
        return Nevari_Helpers::success(['doctor_user_id' => $doctor_id, 'date' => $date, 'slots' => $slots]);
    }

    public static function doctors_update_availability(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        $doctor_id = (int) $request['id'];
        if (!Nevari_Helpers::is_store_admin() && get_current_user_id() !== $doctor_id) {
            return Nevari_Helpers::error('forbidden', 'You can update only your own availability.', 403);
        }
        $params = Nevari_Helpers::get_json_params($request);
        $availability = isset($params['availability']) && is_array($params['availability']) ? $params['availability'] : [];
        update_user_meta($doctor_id, '_nevari_availability', $availability);
        Nevari_Audit::log('consultation', 'nevari', 'doctor.availability_updated', 'success', ['related_user_id' => $doctor_id]);
        return Nevari_Helpers::success(['doctor_user_id' => $doctor_id, 'availability' => $availability]);
    }

    public static function doctors_patients(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'patients'])) {
            return $response;
        }
        global $wpdb;
        $doctor_id = (int) $request['id'];
        if (!Nevari_Helpers::is_store_admin() && get_current_user_id() !== $doctor_id) {
            return Nevari_Helpers::error('forbidden', 'You can view only your own patients.', 403);
        }
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('patient_doctor_links') . " WHERE doctor_user_id = %d AND status = 'active' ORDER BY last_interaction_at DESC", $doctor_id));
        $items = [];
        foreach ($rows ?: [] as $row) {
            $summary = Nevari_Helpers::user_summary((int) $row->patient_user_id);
            if ($summary) {
                $summary['first_linked_at'] = Nevari_Helpers::iso_datetime($row->first_linked_at);
                $summary['last_interaction_at'] = Nevari_Helpers::iso_datetime($row->last_interaction_at);
                $items[] = $summary;
            }
        }
        return Nevari_Helpers::success($items);
    }

    private static function ensure_doctor_profile(int $doctor_user_id, array $params): int {
        $existing = get_posts([
            'post_type' => 'nevari_doctor_profile',
            'post_status' => ['publish', 'draft', 'private'],
            'meta_key' => '_nevari_doctor_user_id',
            'meta_value' => $doctor_user_id,
            'fields' => 'ids',
            'numberposts' => 1,
        ]);
        $title = isset($params['display_name']) ? sanitize_text_field((string) $params['display_name']) : get_the_author_meta('display_name', $doctor_user_id);
        $content = isset($params['bio']) ? wp_kses_post((string) $params['bio']) : '';
        if ($existing) {
            $profile_id = (int) $existing[0];
            wp_update_post(['ID' => $profile_id, 'post_title' => $title, 'post_content' => $content]);
        } else {
            $profile_id = wp_insert_post([
                'post_type' => 'nevari_doctor_profile',
                'post_status' => 'publish',
                'post_title' => $title,
                'post_content' => $content,
            ]);
            update_post_meta($profile_id, '_nevari_doctor_user_id', $doctor_user_id);
        }
        foreach (['license_number' => '_nevari_license_number', 'years_experience' => '_nevari_years_experience', 'consultation_fee' => '_nevari_consultation_fee', 'bio_short' => '_nevari_bio_short'] as $input => $meta) {
            if (isset($params[$input])) {
                update_post_meta($profile_id, $meta, sanitize_text_field((string) $params[$input]));
            }
        }
        if (!empty($params['specialties']) && is_array($params['specialties'])) {
            wp_set_object_terms($profile_id, array_map('sanitize_text_field', $params['specialties']), 'nevari_doctor_specialty');
        }
        if (!empty($params['languages']) && is_array($params['languages'])) {
            wp_set_object_terms($profile_id, array_map('sanitize_text_field', $params['languages']), 'nevari_doctor_language');
        }
        return (int) $profile_id;
    }

    private static function upsert_doctor_settings(int $doctor_id, array $params): void {
        global $wpdb;
        $table = Nevari_Helpers::table('doctor_settings');
        $existing = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE doctor_user_id = %d", $doctor_id));
        $profile = get_posts(['post_type' => 'nevari_doctor_profile', 'meta_key' => '_nevari_doctor_user_id', 'meta_value' => $doctor_id, 'fields' => 'ids', 'numberposts' => 1]);
        $data = [
            'doctor_user_id' => $doctor_id,
            'profile_post_id' => $profile ? (int) $profile[0] : null,
            'license_number' => isset($params['license_number']) ? sanitize_text_field((string) $params['license_number']) : null,
            'default_appointment_duration' => isset($params['default_appointment_duration']) ? (int) $params['default_appointment_duration'] : 30,
            'timezone' => isset($params['timezone']) ? sanitize_text_field((string) $params['timezone']) : 'UTC',
            'accepts_new_patients' => isset($params['accepts_new_patients']) ? (int) Nevari_Helpers::bool_param($params['accepts_new_patients']) : 1,
            'telehealth_enabled' => isset($params['telehealth_enabled']) ? (int) Nevari_Helpers::bool_param($params['telehealth_enabled']) : 1,
            'updated_at' => Nevari_Helpers::now(),
        ];
        if ($existing) {
            $wpdb->update($table, $data, ['id' => $existing]);
        } else {
            $data['created_at'] = Nevari_Helpers::now();
            $wpdb->insert($table, $data);
        }
    }

    private static function format_doctor(WP_User $user, bool $include_private = false): array {
        global $wpdb;
        $profile_ids = get_posts(['post_type' => 'nevari_doctor_profile', 'meta_key' => '_nevari_doctor_user_id', 'meta_value' => $user->ID, 'fields' => 'ids', 'numberposts' => 1]);
        $profile_id = $profile_ids ? (int) $profile_ids[0] : 0;
        $settings = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('doctor_settings') . " WHERE doctor_user_id = %d", (int) $user->ID));
        $data = [
            'id' => (int) $user->ID,
            'user_id' => (int) $user->ID,
            'display_name' => $user->display_name,
            'email' => $include_private || Nevari_Helpers::is_store_admin() ? $user->user_email : null,
            'profile_post_id' => $profile_id ?: null,
            'bio' => $profile_id ? wp_strip_all_tags(get_post_field('post_content', $profile_id)) : '',
            'bio_short' => $profile_id ? get_post_meta($profile_id, '_nevari_bio_short', true) : '',
            'specialties' => $profile_id ? wp_get_post_terms($profile_id, 'nevari_doctor_specialty', ['fields' => 'names']) : [],
            'languages' => $profile_id ? wp_get_post_terms($profile_id, 'nevari_doctor_language', ['fields' => 'names']) : [],
            'accepting_patients' => $settings ? (bool) $settings->accepts_new_patients : true,
            'telehealth_enabled' => $settings ? (bool) $settings->telehealth_enabled : true,
            'timezone' => $settings ? $settings->timezone : 'UTC',
            'profile_image' => $profile_id ? get_the_post_thumbnail_url($profile_id, 'medium') : null,
            'disabled' => (bool) get_user_meta((int) $user->ID, '_nevari_doctor_disabled', true),
        ];
        if ($include_private || Nevari_Helpers::is_store_admin()) {
            $data['license_number'] = $settings ? $settings->license_number : null;
            $data['default_appointment_duration'] = $settings ? (int) $settings->default_appointment_duration : 30;
        }
        return $data;
    }

    private static function build_available_slots(int $doctor_id, string $date, array $availability): array {
        global $wpdb;
        $duration = 30;
        $settings = $wpdb->get_row($wpdb->prepare("SELECT default_appointment_duration FROM " . Nevari_Helpers::table('doctor_settings') . " WHERE doctor_user_id = %d", $doctor_id));
        if ($settings) { $duration = max(5, (int) $settings->default_appointment_duration); }
        $weekday = strtolower(gmdate('l', strtotime($date)));
        $ranges = $availability[$weekday] ?? [['start' => '09:00', 'end' => '17:00']];
        $booked = $wpdb->get_results($wpdb->prepare(
            "SELECT start_at, end_at FROM " . Nevari_Helpers::table('appointments') . " WHERE doctor_user_id = %d AND status IN ('requested','confirmed','checked_in') AND DATE(start_at) = %s",
            $doctor_id,
            $date
        ));
        $slots = [];
        foreach ($ranges as $range) {
            $start = strtotime($date . ' ' . sanitize_text_field($range['start'] ?? '09:00') . ' UTC');
            $end = strtotime($date . ' ' . sanitize_text_field($range['end'] ?? '17:00') . ' UTC');
            for ($t = $start; $t + ($duration * 60) <= $end; $t += $duration * 60) {
                $slot_start = gmdate('Y-m-d H:i:s', $t);
                $slot_end = gmdate('Y-m-d H:i:s', $t + ($duration * 60));
                $conflict = false;
                foreach ($booked ?: [] as $b) {
                    if ($slot_start < $b->end_at && $slot_end > $b->start_at) {
                        $conflict = true;
                        break;
                    }
                }
                if (!$conflict && $t > time()) {
                    $slots[] = ['start_at' => gmdate('c', $t), 'end_at' => gmdate('c', $t + ($duration * 60))];
                }
            }
        }
        return $slots;
    }

    public static function appointments_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'index'])) {
            return $response;
        }
        global $wpdb;
        $page = max(1, (int) $request->get_param('page') ?: 1);
        $per_page = min(100, max(1, (int) $request->get_param('per_page') ?: 20));
        $offset = ($page - 1) * $per_page;
        $table = Nevari_Helpers::table('appointments');
        $where = ['1=1'];
        $params = [];
        if (Nevari_Helpers::is_patient() && !Nevari_Helpers::is_store_admin()) {
            $where[] = 'patient_user_id = %d';
            $params[] = get_current_user_id();
        } elseif (Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) {
            $where[] = 'doctor_user_id = %d';
            $params[] = get_current_user_id();
        } elseif ($request->get_param('patient_id')) {
            $where[] = 'patient_user_id = %d';
            $params[] = (int) $request->get_param('patient_id');
        }
        if ($request->get_param('doctor_id')) {
            $where[] = 'doctor_user_id = %d';
            $params[] = (int) $request->get_param('doctor_id');
        }
        if ($request->get_param('status')) {
            $where[] = 'status = %s';
            $params[] = sanitize_key((string) $request->get_param('status'));
        }
        if ($request->get_param('date_from')) {
            $dt = Nevari_Helpers::normalize_datetime($request->get_param('date_from'));
            if ($dt) { $where[] = 'start_at >= %s'; $params[] = $dt; }
        }
        if ($request->get_param('date_to')) {
            $dt = Nevari_Helpers::normalize_datetime($request->get_param('date_to'));
            if ($dt) { $where[] = 'start_at <= %s'; $params[] = $dt; }
        }
        $where_sql = implode(' AND ', $where);
        $total_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}";
        $total = (int) $wpdb->get_var($params ? $wpdb->prepare($total_sql, $params) : $total_sql);
        $sql = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY start_at DESC LIMIT %d OFFSET %d";
        $rows = $wpdb->get_results($wpdb->prepare($sql, array_merge($params, [$per_page, $offset])));
        return Nevari_Helpers::success(array_map(['Nevari_Helpers', 'format_appointment'], $rows ?: []), Nevari_Helpers::pagination_meta($page, $per_page, $total));
    }

    public static function appointments_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'show'])) {
            return $response;
        }
        $appointment = self::get_appointment_row((int) $request['id']);
        if (!$appointment) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        if (!Nevari_Helpers::can_view_appointment($appointment)) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        return Nevari_Helpers::success(Nevari_Helpers::format_appointment($appointment));
    }

    public static function appointments_create(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $doctor_id = isset($params['doctor_user_id']) ? (int) $params['doctor_user_id'] : 0;
        $patient_id = Nevari_Helpers::is_store_admin() && !empty($params['patient_user_id']) ? (int) $params['patient_user_id'] : get_current_user_id();
        $type = isset($params['type']) ? sanitize_key((string) $params['type']) : 'video';
        $start = Nevari_Helpers::normalize_datetime($params['start_at'] ?? null);
        $end = Nevari_Helpers::normalize_datetime($params['end_at'] ?? null);
        $reason = isset($params['reason']) ? sanitize_textarea_field((string) $params['reason']) : '';

        if (!$doctor_id || !$patient_id || !$start || !$end || strtotime($end) <= strtotime($start) || !$reason) {
            return Nevari_Helpers::error('validation_error', 'doctor_user_id, valid start_at/end_at, and reason are required.', 422);
        }
        $doctor = get_user_by('id', $doctor_id);
        if (!$doctor || !in_array('doctor', (array) $doctor->roles, true) || get_user_meta($doctor_id, '_nevari_doctor_disabled', true)) {
            return Nevari_Helpers::error('doctor_not_found', 'Doctor not found or inactive.', 404);
        }
        $allowed_types = ['video', 'phone', 'in_person', 'async_form'];
        if (!in_array($type, $allowed_types, true)) {
            return Nevari_Helpers::error('validation_error', 'Invalid appointment type.', 422);
        }
        if (strtotime($start) <= time()) {
            return Nevari_Helpers::error('invalid_datetime', 'Appointment must be in the future.', 422);
        }
        $table = Nevari_Helpers::table('appointments');
        $conflict = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE doctor_user_id = %d AND status IN ('requested','confirmed','checked_in') AND start_at < %s AND end_at > %s",
            $doctor_id,
            $end,
            $start
        ));
        if ($conflict) {
            Nevari_Audit::log('consultation', 'nevari', 'appointment.slot_unavailable', 'error', ['related_user_id' => $patient_id, 'message' => 'Appointment slot unavailable.']);
            return Nevari_Helpers::error('appointment_slot_unavailable', 'This appointment slot is no longer available.', 409);
        }
        $now = Nevari_Helpers::now();
        $wpdb->insert($table, [
            'patient_user_id' => $patient_id,
            'doctor_user_id' => $doctor_id,
            'order_id' => isset($params['order_id']) ? (int) $params['order_id'] : null,
            'type' => $type,
            'status' => Nevari_Helpers::is_store_admin() ? 'confirmed' : 'requested',
            'start_at' => $start,
            'end_at' => $end,
            'timezone' => isset($params['timezone']) ? sanitize_text_field((string) $params['timezone']) : 'UTC',
            'reason' => $reason,
            'symptoms' => isset($params['symptoms']) ? Nevari_Helpers::json_encode_safe($params['symptoms']) : null,
            'intake_form' => isset($params['intake_form']) ? Nevari_Helpers::json_encode_safe($params['intake_form']) : null,
            'created_by' => get_current_user_id(),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $appointment_id = (int) $wpdb->insert_id;
        Nevari_Helpers::ensure_doctor_patient_link($doctor_id, $patient_id, 'appointment');
        Nevari_Audit::log('consultation', 'nevari', 'appointment.created', 'success', ['appointment_id' => $appointment_id, 'related_user_id' => $patient_id, 'message' => 'Appointment created.']);

        $patient = get_user_by('id', $patient_id);
        Nevari_Emails::queue_or_send([
            'template_key' => 'appointment_requested',
            'recipient_user_id' => $patient_id,
            'related_object_type' => 'appointment',
            'related_object_id' => $appointment_id,
            'variables' => [
                'patient_name' => $patient ? $patient->display_name : '',
                'doctor_name' => $doctor->display_name,
                'appointment_start' => gmdate('c', strtotime($start)),
            ],
        ], false);

        return Nevari_Helpers::success(Nevari_Helpers::format_appointment(self::get_appointment_row($appointment_id)), [], 201);
    }

    public static function appointments_update(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $appointment = self::get_appointment_row((int) $request['id']);
        if (!$appointment || !Nevari_Helpers::can_view_appointment($appointment)) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        $params = Nevari_Helpers::get_json_params($request);
        $data = ['updated_at' => Nevari_Helpers::now()];
        if (isset($params['reason']) && (Nevari_Helpers::is_patient() || Nevari_Helpers::is_store_admin())) { $data['reason'] = sanitize_textarea_field((string) $params['reason']); }
        if (isset($params['doctor_notes']) && (Nevari_Helpers::is_doctor() || Nevari_Helpers::is_store_admin())) { $data['doctor_notes'] = wp_kses_post((string) $params['doctor_notes']); }
        $wpdb->update(Nevari_Helpers::table('appointments'), $data, ['id' => (int) $appointment->id]);
        Nevari_Audit::log('consultation', 'nevari', 'appointment.updated', 'success', ['appointment_id' => (int) $appointment->id]);
        return Nevari_Helpers::success(Nevari_Helpers::format_appointment(self::get_appointment_row((int) $appointment->id)));
    }

    public static function appointments_delete(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $wpdb->delete(Nevari_Helpers::table('appointments'), ['id' => (int) $request['id']], ['%d']);
        Nevari_Audit::log('consultation', 'nevari', 'appointment.deleted', 'success', ['appointment_id' => (int) $request['id']]);
        return Nevari_Helpers::success(['deleted' => true]);
    }

    public static function appointments_action(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $appointment = self::get_appointment_row((int) $request['id']);
        if (!$appointment || !Nevari_Helpers::can_view_appointment($appointment)) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        $route = $request->get_route();
        $params = Nevari_Helpers::get_json_params($request);
        $data = ['updated_at' => Nevari_Helpers::now()];
        $action = 'appointment.updated';

        if (str_ends_with($route, '/cancel')) {
            $data['status'] = 'cancelled';
            $data['cancellation_reason'] = isset($params['reason']) ? sanitize_textarea_field((string) $params['reason']) : null;
            $data['cancelled_by'] = get_current_user_id();
            $action = 'appointment.cancelled';
        } elseif (str_ends_with($route, '/confirm')) {
            if (!Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) { return Nevari_Helpers::error('forbidden', 'Only doctors or admins can confirm appointments.', 403); }
            $data['status'] = 'confirmed';
            $action = 'appointment.confirmed';
        } elseif (str_ends_with($route, '/complete')) {
            if (!Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) { return Nevari_Helpers::error('forbidden', 'Only doctors or admins can complete appointments.', 403); }
            $data['status'] = 'completed';
            $data['completed_at'] = Nevari_Helpers::now();
            if (isset($params['doctor_notes'])) { $data['doctor_notes'] = wp_kses_post((string) $params['doctor_notes']); }
            $action = 'appointment.completed';
        } elseif (str_ends_with($route, '/reschedule')) {
            $start = Nevari_Helpers::normalize_datetime($params['start_at'] ?? null);
            $end = Nevari_Helpers::normalize_datetime($params['end_at'] ?? null);
            if (!$start || !$end || strtotime($end) <= strtotime($start)) { return Nevari_Helpers::error('validation_error', 'Valid start_at and end_at are required.', 422); }
            $data['start_at'] = $start;
            $data['end_at'] = $end;
            $data['status'] = Nevari_Helpers::is_patient() ? 'requested' : 'confirmed';
            $action = 'appointment.rescheduled';
        } elseif (str_ends_with($route, '/notes')) {
            if (!Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) { return Nevari_Helpers::error('forbidden', 'Only doctors or admins can update notes.', 403); }
            $data['doctor_notes'] = isset($params['doctor_notes']) ? wp_kses_post((string) $params['doctor_notes']) : '';
            $action = 'appointment.notes_updated';
        }

        $wpdb->update(Nevari_Helpers::table('appointments'), $data, ['id' => (int) $appointment->id]);
        Nevari_Audit::log('consultation', 'nevari', $action, 'success', ['appointment_id' => (int) $appointment->id, 'related_user_id' => (int) $appointment->patient_user_id]);
        return Nevari_Helpers::success(Nevari_Helpers::format_appointment(self::get_appointment_row((int) $appointment->id)));
    }

    private static function get_appointment_row(int $id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('appointments') . " WHERE id = %d", $id));
    }

    public static function prescriptions_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_prescriptions_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'index'])) {
            return $response;
        }
        global $wpdb;
        $page = max(1, (int) $request->get_param('page') ?: 1);
        $per_page = min(100, max(1, (int) $request->get_param('per_page') ?: 20));
        $offset = ($page - 1) * $per_page;
        $table = Nevari_Helpers::table('prescriptions');
        $where = ['1=1'];
        $params = [];
        if (Nevari_Helpers::is_patient() && !Nevari_Helpers::is_store_admin()) {
            $where[] = "patient_user_id = %d AND status IN ('assigned_to_patient','partially_fulfilled','fulfilled','expired','cancelled')";
            $params[] = get_current_user_id();
        } elseif (Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) {
            $where[] = 'doctor_user_id = %d';
            $params[] = get_current_user_id();
        } else {
            if ($request->get_param('patient_id')) { $where[] = 'patient_user_id = %d'; $params[] = (int) $request->get_param('patient_id'); }
            if ($request->get_param('doctor_id')) { $where[] = 'doctor_user_id = %d'; $params[] = (int) $request->get_param('doctor_id'); }
        }
        if ($request->get_param('status')) { $where[] = 'status = %s'; $params[] = sanitize_key((string) $request->get_param('status')); }
        $where_sql = implode(' AND ', $where);
        $total = (int) $wpdb->get_var($params ? $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where_sql}", $params) : "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}");
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE {$where_sql} ORDER BY created_at DESC LIMIT %d OFFSET %d", array_merge($params, [$per_page, $offset])));
        return Nevari_Helpers::success(array_map(static function ($row) { return Nevari_Helpers::format_prescription($row, false); }, $rows ?: []), Nevari_Helpers::pagination_meta($page, $per_page, $total));
    }

    public static function prescriptions_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_prescriptions_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'show'])) {
            return $response;
        }
        $row = self::get_prescription_row((int) $request['id']);
        if (!$row || !Nevari_Helpers::can_view_prescription($row)) {
            return Nevari_Helpers::error('prescription_not_found', 'Prescription not found.', 404);
        }
        return Nevari_Helpers::success(Nevari_Helpers::format_prescription($row));
    }

    public static function prescriptions_create(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_prescriptions_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $patient_id = isset($params['patient_user_id']) ? (int) $params['patient_user_id'] : 0;
        $doctor_id = Nevari_Helpers::is_store_admin() && !empty($params['doctor_user_id']) ? (int) $params['doctor_user_id'] : get_current_user_id();
        $items = isset($params['items']) && is_array($params['items']) ? $params['items'] : [];
        $valid_from = Nevari_Helpers::normalize_datetime($params['valid_from'] ?? Nevari_Helpers::now());
        $valid_until = Nevari_Helpers::normalize_datetime($params['valid_until'] ?? null);
        if (!$patient_id || !$doctor_id || !$valid_from || empty($items)) {
            return Nevari_Helpers::error('validation_error', 'patient_user_id, valid_from, and at least one item are required.', 422);
        }
        $patient = get_user_by('id', $patient_id);
        if (!$patient) { return Nevari_Helpers::error('patient_not_found', 'Patient not found.', 404); }
        if (!Nevari_Helpers::is_store_admin() && !Nevari_Helpers::doctor_patient_link_exists($doctor_id, $patient_id)) {
            $appointment_id = isset($params['appointment_id']) ? (int) $params['appointment_id'] : 0;
            $appointment = $appointment_id ? self::get_appointment_row($appointment_id) : null;
            if (!$appointment || (int) $appointment->doctor_user_id !== $doctor_id || (int) $appointment->patient_user_id !== $patient_id) {
                return Nevari_Helpers::error('forbidden_patient_scope', 'Doctor can prescribe only to assigned patients.', 403);
            }
        }
        foreach ($items as $item) {
            if (empty($item['product_id']) || !get_post((int) $item['product_id']) || (float) ($item['quantity'] ?? 0) <= 0) {
                return Nevari_Helpers::error('validation_error', 'Every item requires product_id and quantity greater than zero.', 422);
            }
        }
        $now = Nevari_Helpers::now();
        $wpdb->insert(Nevari_Helpers::table('prescriptions'), [
            'prescription_number' => Nevari_Helpers::generate_prescription_number(),
            'patient_user_id' => $patient_id,
            'doctor_user_id' => $doctor_id,
            'appointment_id' => isset($params['appointment_id']) ? (int) $params['appointment_id'] : null,
            'order_id' => isset($params['order_id']) ? (int) $params['order_id'] : null,
            'status' => 'draft',
            'diagnosis' => isset($params['diagnosis']) ? sanitize_textarea_field((string) $params['diagnosis']) : null,
            'instructions' => isset($params['instructions']) ? wp_kses_post((string) $params['instructions']) : null,
            'valid_from' => $valid_from,
            'valid_until' => $valid_until,
            'created_by' => get_current_user_id(),
            'updated_by' => get_current_user_id(),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $prescription_id = (int) $wpdb->insert_id;
        foreach ($items as $item) {
            $wpdb->insert(Nevari_Helpers::table('prescription_items'), [
                'prescription_id' => $prescription_id,
                'product_id' => (int) $item['product_id'],
                'variation_id' => isset($item['variation_id']) ? (int) $item['variation_id'] : null,
                'dosage' => Nevari_Helpers::sanitize_text_or_null($item['dosage'] ?? null),
                'quantity' => (float) $item['quantity'],
                'unit' => Nevari_Helpers::sanitize_text_or_null($item['unit'] ?? null),
                'frequency' => Nevari_Helpers::sanitize_text_or_null($item['frequency'] ?? null),
                'duration_days' => isset($item['duration_days']) ? (int) $item['duration_days'] : null,
                'refills_allowed' => isset($item['refills_allowed']) ? (int) $item['refills_allowed'] : 0,
                'substitution_allowed' => isset($item['substitution_allowed']) ? (int) Nevari_Helpers::bool_param($item['substitution_allowed']) : 0,
                'notes' => isset($item['notes']) ? sanitize_textarea_field((string) $item['notes']) : null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
        self::add_prescription_history($prescription_id, $patient_id, $doctor_id, 'created', null, 'draft', 'Prescription created.');
        Nevari_Audit::log('consultation', 'nevari', 'prescription.created', 'success', ['prescription_id' => $prescription_id, 'related_user_id' => $patient_id, 'appointment_id' => isset($params['appointment_id']) ? (int) $params['appointment_id'] : null]);
        return Nevari_Helpers::success(Nevari_Helpers::format_prescription(self::get_prescription_row($prescription_id)), [], 201);
    }

    public static function prescriptions_update(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_prescriptions_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $row = self::get_prescription_row((int) $request['id']);
        if (!$row || !Nevari_Helpers::can_view_prescription($row)) { return Nevari_Helpers::error('prescription_not_found', 'Prescription not found.', 404); }
        if (!Nevari_Helpers::is_store_admin() && (int) $row->doctor_user_id !== get_current_user_id()) { return Nevari_Helpers::error('forbidden', 'Only the prescribing doctor or admin can update this prescription.', 403); }
        if ($row->status !== 'draft' && !Nevari_Helpers::is_store_admin()) { return Nevari_Helpers::error('invalid_status', 'Only draft prescriptions can be updated by doctors.', 409); }
        $params = Nevari_Helpers::get_json_params($request);
        $data = ['updated_at' => Nevari_Helpers::now(), 'updated_by' => get_current_user_id()];
        foreach (['diagnosis' => 'sanitize_textarea_field', 'instructions' => 'wp_kses_post'] as $key => $cb) {
            if (isset($params[$key])) { $data[$key] = call_user_func($cb, (string) $params[$key]); }
        }
        if (isset($params['valid_from'])) { $data['valid_from'] = Nevari_Helpers::normalize_datetime($params['valid_from']); }
        if (isset($params['valid_until'])) { $data['valid_until'] = Nevari_Helpers::normalize_datetime($params['valid_until']); }
        $wpdb->update(Nevari_Helpers::table('prescriptions'), $data, ['id' => (int) $row->id]);
        Nevari_Audit::log('consultation', 'nevari', 'prescription.updated', 'success', ['prescription_id' => (int) $row->id, 'related_user_id' => (int) $row->patient_user_id]);
        return Nevari_Helpers::success(Nevari_Helpers::format_prescription(self::get_prescription_row((int) $row->id)));
    }

    public static function prescriptions_delete(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_prescriptions_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $row = self::get_prescription_row((int) $request['id']);
        if (!$row) { return Nevari_Helpers::error('prescription_not_found', 'Prescription not found.', 404); }
        if ($row->status !== 'draft') { return Nevari_Helpers::error('invalid_status', 'Only draft prescriptions can be deleted.', 409); }
        $wpdb->delete(Nevari_Helpers::table('prescription_items'), ['prescription_id' => (int) $row->id]);
        $wpdb->delete(Nevari_Helpers::table('prescriptions'), ['id' => (int) $row->id]);
        Nevari_Audit::log('consultation', 'nevari', 'prescription.deleted', 'success', ['prescription_id' => (int) $row->id]);
        return Nevari_Helpers::success(['deleted' => true]);
    }

    public static function prescriptions_action(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_prescriptions_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        global $wpdb;
        $row = self::get_prescription_row((int) $request['id']);
        if (!$row || !Nevari_Helpers::can_view_prescription($row)) { return Nevari_Helpers::error('prescription_not_found', 'Prescription not found.', 404); }
        if (!Nevari_Helpers::is_store_admin() && (int) $row->doctor_user_id !== get_current_user_id()) { return Nevari_Helpers::error('forbidden', 'Only the prescribing doctor or admin can change this prescription.', 403); }
        $route = $request->get_route();
        $params = Nevari_Helpers::get_json_params($request);
        $action = ''; $data = [];
        if (str_ends_with($route, '/issue')) { $data = ['status' => 'issued', 'issued_at' => Nevari_Helpers::now()]; $action = 'issued'; }
        elseif (str_ends_with($route, '/assign')) { $data = ['status' => 'assigned_to_patient', 'assigned_at' => Nevari_Helpers::now()]; $action = 'assigned'; }
        elseif (str_ends_with($route, '/cancel')) { $data = ['status' => 'cancelled', 'cancelled_at' => Nevari_Helpers::now(), 'cancelled_reason' => isset($params['reason']) ? sanitize_textarea_field((string) $params['reason']) : null]; $action = 'cancelled'; }
        elseif (str_ends_with($route, '/fulfill')) { if (!Nevari_Helpers::is_store_admin()) return Nevari_Helpers::error('forbidden', 'Only store admins can fulfill prescriptions.', 403); $data = ['status' => 'fulfilled', 'fulfilled_at' => Nevari_Helpers::now()]; $action = 'fulfilled'; }
        elseif (str_ends_with($route, '/link-order')) { if (!Nevari_Helpers::is_store_admin()) return Nevari_Helpers::error('forbidden', 'Only store admins can link orders.', 403); $data = ['order_id' => isset($params['order_id']) ? (int) $params['order_id'] : 0]; $action = 'order_linked'; if (!$data['order_id']) return Nevari_Helpers::error('validation_error', 'order_id is required.', 422); }
        $data['updated_at'] = Nevari_Helpers::now(); $data['updated_by'] = get_current_user_id();
        $wpdb->update(Nevari_Helpers::table('prescriptions'), $data, ['id' => (int) $row->id]);
        $new_row = self::get_prescription_row((int) $row->id);
        self::add_prescription_history((int) $row->id, (int) $row->patient_user_id, (int) $row->doctor_user_id, $action, $row->status, $new_row->status, isset($params['note']) ? sanitize_textarea_field((string) $params['note']) : null);
        Nevari_Audit::log('consultation', 'nevari', 'prescription.' . $action, 'success', ['prescription_id' => (int) $row->id, 'related_user_id' => (int) $row->patient_user_id, 'appointment_id' => $row->appointment_id ? (int) $row->appointment_id : null]);
        if ($action === 'assigned' && !empty($params['notify_patient'])) {
            $patient = get_user_by('id', (int) $row->patient_user_id);
            $doctor = get_user_by('id', (int) $row->doctor_user_id);
            Nevari_Emails::queue_or_send([
                'template_key' => 'prescription_assigned',
                'recipient_user_id' => (int) $row->patient_user_id,
                'related_object_type' => 'prescription',
                'related_object_id' => (int) $row->id,
                'variables' => ['patient_name' => $patient ? $patient->display_name : '', 'doctor_name' => $doctor ? $doctor->display_name : '', 'prescription_number' => $row->prescription_number],
            ], false);
        }
        return Nevari_Helpers::success(Nevari_Helpers::format_prescription($new_row));
    }

    public static function prescriptions_history(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_prescriptions_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'history'])) {
            return $response;
        }
        global $wpdb;
        $row = self::get_prescription_row((int) $request['id']);
        if (!$row || !Nevari_Helpers::can_view_prescription($row)) { return Nevari_Helpers::error('prescription_not_found', 'Prescription not found.', 404); }
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('prescription_assignment_history') . " WHERE prescription_id = %d ORDER BY created_at DESC", (int) $row->id));
        $items = array_map(static function ($h) {
            return ['id' => (int) $h->id, 'action' => $h->action, 'previous_status' => $h->previous_status, 'new_status' => $h->new_status, 'actor_user_id' => (int) $h->actor_user_id, 'note' => $h->note, 'created_at' => Nevari_Helpers::iso_datetime($h->created_at)];
        }, $rows ?: []);
        return Nevari_Helpers::success($items);
    }

    public static function prescriptions_validate_cart(WP_REST_Request $request): WP_REST_Response {
        $params = Nevari_Helpers::get_json_params($request);
        $items = isset($params['items']) && is_array($params['items']) ? $params['items'] : [];
        $patient_id = Nevari_Helpers::is_store_admin() && !empty($params['patient_user_id']) ? (int) $params['patient_user_id'] : get_current_user_id();
        $results = [];
        $valid = true;
        foreach ($items as $item) {
            $product_id = (int) ($item['product_id'] ?? 0);
            $quantity = (float) ($item['quantity'] ?? 1);
            $requires = $product_id ? Nevari_Helpers::product_requires_rx($product_id) : false;
            $prescription = $requires ? Nevari_Helpers::find_valid_prescription_for_product($patient_id, $product_id, $quantity) : null;
            $ok = !$requires || (bool) $prescription;
            if (!$ok) { $valid = false; }
            $results[] = ['product_id' => $product_id, 'quantity' => $quantity, 'rx_required' => $requires, 'valid' => $ok, 'prescription_id' => $prescription ? (int) $prescription->id : null];
        }
        return Nevari_Helpers::success(['valid' => $valid, 'items' => $results]);
    }

    private static function get_prescription_row(int $id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('prescriptions') . " WHERE id = %d", $id));
    }

    private static function update_prescription_status(int $id, array $data, string $action, string $note = ''): void {
        global $wpdb;
        $data['updated_at'] = Nevari_Helpers::now();
        $data['updated_by'] = get_current_user_id();
        $wpdb->update(Nevari_Helpers::table('prescriptions'), $data, ['id' => $id]);
    }

    private static function add_prescription_history(int $prescription_id, int $patient_id, int $doctor_id, string $action, ?string $previous_status, string $new_status, ?string $note = null): void {
        global $wpdb;
        $wpdb->insert(Nevari_Helpers::table('prescription_assignment_history'), [
            'prescription_id' => $prescription_id,
            'patient_user_id' => $patient_id,
            'doctor_user_id' => $doctor_id,
            'action' => sanitize_key($action),
            'previous_status' => $previous_status,
            'new_status' => sanitize_key($new_status),
            'actor_user_id' => get_current_user_id(),
            'note' => $note,
            'created_at' => Nevari_Helpers::now(),
        ]);
    }

    public static function emails_logs_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_email_logs_read', 60, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'index'])) {
            return $response;
        }
        global $wpdb;
        $page = max(1, (int) $request->get_param('page') ?: 1);
        $per_page = min(100, max(1, (int) $request->get_param('per_page') ?: 20));
        $offset = ($page - 1) * $per_page;
        $table = Nevari_Helpers::table('email_logs');
        $where = ['1=1']; $params = [];
        if ($request->get_param('status')) { $where[] = 'status = %s'; $params[] = sanitize_key((string) $request->get_param('status')); }
        if ($request->get_param('recipient_email')) { $where[] = 'recipient_email LIKE %s'; $params[] = '%' . $wpdb->esc_like(sanitize_email((string) $request->get_param('recipient_email'))) . '%'; }
        $where_sql = implode(' AND ', $where);
        $total = (int) $wpdb->get_var($params ? $wpdb->prepare("SELECT COUNT(*) FROM {$table} WHERE {$where_sql}", $params) : "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}");
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$table} WHERE {$where_sql} ORDER BY created_at DESC LIMIT %d OFFSET %d", array_merge($params, [$per_page, $offset])));
        return Nevari_Helpers::success(array_map([__CLASS__, 'format_email_log'], $rows ?: []), Nevari_Helpers::pagination_meta($page, $per_page, $total));
    }

    public static function emails_logs_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_email_logs_read', 60, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'show'])) {
            return $response;
        }
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('email_logs') . " WHERE id = %d", (int) $request['id']));
        if (!$row) { return Nevari_Helpers::error('email_log_not_found', 'Email log not found.', 404); }
        $data = self::format_email_log($row);
        $data['body_html'] = (string) get_option('_nevari_email_body_' . (int) $row->id, '');
        return Nevari_Helpers::success($data);
    }

    public static function emails_send(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_emails_write', 5, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'send'])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $result = Nevari_Emails::queue_or_send($params, !empty($params['send_now']));
        if (is_wp_error($result)) { return Nevari_Helpers::error($result->get_error_code(), $result->get_error_message(), 422); }
        return Nevari_Helpers::success(['email_log_id' => (int) $result, 'status' => 'queued'], [], 201);
    }

    public static function emails_templates_index(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $rows = $wpdb->get_results("SELECT * FROM " . Nevari_Helpers::table('email_templates') . " ORDER BY template_key ASC, version DESC");
        return Nevari_Helpers::success(array_map([__CLASS__, 'format_email_template'], $rows ?: []));
    }

    public static function emails_templates_show(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('email_templates') . " WHERE id = %d", (int) $request['id']));
        if (!$row) { return Nevari_Helpers::error('template_not_found', 'Template not found.', 404); }
        return Nevari_Helpers::success(self::format_email_template($row));
    }

    public static function emails_templates_create(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_emails_write', 10, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'template_create'])) {
            return $response;
        }
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $template_key = isset($params['template_key']) ? sanitize_key((string) $params['template_key']) : '';
        if (!$template_key || empty($params['name']) || empty($params['subject']) || empty($params['body_html'])) {
            return Nevari_Helpers::error('validation_error', 'template_key, name, subject, and body_html are required.', 422);
        }
        $now = Nevari_Helpers::now();
        $wpdb->insert(Nevari_Helpers::table('email_templates'), [
            'template_key' => $template_key,
            'name' => sanitize_text_field((string) $params['name']),
            'subject' => sanitize_text_field((string) $params['subject']),
            'body_html' => wp_kses_post((string) $params['body_html']),
            'body_text' => isset($params['body_text']) ? sanitize_textarea_field((string) $params['body_text']) : null,
            'variables' => isset($params['variables']) ? Nevari_Helpers::json_encode_safe($params['variables']) : null,
            'status' => isset($params['status']) ? sanitize_key((string) $params['status']) : 'active',
            'version' => isset($params['version']) ? (int) $params['version'] : 1,
            'created_by' => get_current_user_id(),
            'updated_by' => get_current_user_id(),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $id = (int) $wpdb->insert_id;
        Nevari_Audit::log('emails', 'nevari', 'email.template_created', 'success', ['object_type' => 'email_template', 'object_id' => $id]);
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('email_templates') . " WHERE id = %d", $id));
        return Nevari_Helpers::success(self::format_email_template($row), [], 201);
    }

    public static function emails_templates_update(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_emails_write', 10, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'template_update'])) {
            return $response;
        }
        global $wpdb;
        $params = Nevari_Helpers::get_json_params($request);
        $data = ['updated_at' => Nevari_Helpers::now(), 'updated_by' => get_current_user_id()];
        foreach (['template_key', 'name', 'subject', 'status'] as $key) { if (isset($params[$key])) { $data[$key] = $key === 'template_key' || $key === 'status' ? sanitize_key((string) $params[$key]) : sanitize_text_field((string) $params[$key]); } }
        if (isset($params['body_html'])) { $data['body_html'] = wp_kses_post((string) $params['body_html']); }
        if (isset($params['body_text'])) { $data['body_text'] = sanitize_textarea_field((string) $params['body_text']); }
        if (isset($params['variables'])) { $data['variables'] = Nevari_Helpers::json_encode_safe($params['variables']); }
        if (isset($params['version'])) { $data['version'] = (int) $params['version']; }
        $wpdb->update(Nevari_Helpers::table('email_templates'), $data, ['id' => (int) $request['id']]);
        Nevari_Audit::log('emails', 'nevari', 'email.template_updated', 'success', ['object_type' => 'email_template', 'object_id' => (int) $request['id']]);
        return self::emails_templates_show($request);
    }

    public static function emails_templates_delete(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_emails_write', 10, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'template_delete'])) {
            return $response;
        }
        global $wpdb;
        $wpdb->update(Nevari_Helpers::table('email_templates'), ['status' => 'archived', 'updated_at' => Nevari_Helpers::now(), 'updated_by' => get_current_user_id()], ['id' => (int) $request['id']]);
        return Nevari_Helpers::success(['archived' => true]);
    }

    public static function emails_templates_preview(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_emails_write', 10, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'template_preview'])) {
            return $response;
        }
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('email_templates') . " WHERE id = %d", (int) $request['id']));
        if (!$row) { return Nevari_Helpers::error('template_not_found', 'Template not found.', 404); }
        $params = Nevari_Helpers::get_json_params($request);
        $rendered = Nevari_Emails::render_template($row, isset($params['variables']) && is_array($params['variables']) ? $params['variables'] : []);
        Nevari_Audit::log('emails', 'nevari', 'email.preview_rendered', 'success', ['object_type' => 'email_template', 'object_id' => (int) $row->id]);
        return Nevari_Helpers::success($rendered);
    }

    public static function emails_templates_test(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_emails_write', 5, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'template_test'])) {
            return $response;
        }
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('email_templates') . " WHERE id = %d", (int) $request['id']));
        if (!$row) { return Nevari_Helpers::error('template_not_found', 'Template not found.', 404); }
        $params = Nevari_Helpers::get_json_params($request);
        $email = isset($params['recipient_email']) ? sanitize_email((string) $params['recipient_email']) : get_option('admin_email');
        $result = Nevari_Emails::queue_or_send(['template_key' => $row->template_key, 'recipient_email' => $email, 'variables' => isset($params['variables']) && is_array($params['variables']) ? $params['variables'] : []], true);
        if (is_wp_error($result)) { return Nevari_Helpers::error($result->get_error_code(), $result->get_error_message(), 422); }
        return Nevari_Helpers::success(['email_log_id' => (int) $result]);
    }

    private static function format_email_log($row): array {
        return [
            'id' => (int) $row->id,
            'template_key' => $row->template_key,
            'template_version' => $row->template_version ? (int) $row->template_version : null,
            'recipient_email' => $row->recipient_email,
            'recipient_user_id' => $row->recipient_user_id ? (int) $row->recipient_user_id : null,
            'subject' => $row->subject,
            'body_preview' => $row->body_preview,
            'related_object_type' => $row->related_object_type,
            'related_object_id' => $row->related_object_id ? (int) $row->related_object_id : null,
            'status' => $row->status,
            'provider' => $row->provider,
            'error_code' => $row->error_code,
            'error_message' => $row->error_message,
            'queued_at' => Nevari_Helpers::iso_datetime($row->queued_at),
            'sent_at' => Nevari_Helpers::iso_datetime($row->sent_at),
            'failed_at' => Nevari_Helpers::iso_datetime($row->failed_at),
            'created_at' => Nevari_Helpers::iso_datetime($row->created_at),
        ];
    }

    private static function format_email_template($row): array {
        return [
            'id' => (int) $row->id,
            'template_key' => $row->template_key,
            'name' => $row->name,
            'subject' => $row->subject,
            'body_html' => $row->body_html,
            'body_text' => $row->body_text,
            'variables' => Nevari_Helpers::json_decode_safe($row->variables),
            'status' => $row->status,
            'version' => (int) $row->version,
            'created_at' => Nevari_Helpers::iso_datetime($row->created_at),
            'updated_at' => Nevari_Helpers::iso_datetime($row->updated_at),
        ];
    }

    public static function dashboard_patient(WP_REST_Request $request): WP_REST_Response {
        $user_id = get_current_user_id();
        $prescriptions = self::prescriptions_index(new WP_REST_Request('GET', '/prescriptions'))->get_data()['data'] ?? [];
        $appointments = self::appointments_index(new WP_REST_Request('GET', '/appointments'))->get_data()['data'] ?? [];
        return Nevari_Helpers::success([
            'profile' => Nevari_Helpers::user_summary($user_id),
            'prescriptions' => ['recent' => array_slice($prescriptions, 0, 5)],
            'appointments' => ['recent' => array_slice($appointments, 0, 5)],
        ]);
    }

    public static function dashboard_doctor(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $doctor_id = get_current_user_id();
        $appointments_table = Nevari_Helpers::table('appointments');
        $prescriptions_table = Nevari_Helpers::table('prescriptions');
        $today_start = gmdate('Y-m-d 00:00:00');
        $today_end = gmdate('Y-m-d 23:59:59');
        return Nevari_Helpers::success([
            'profile' => Nevari_Helpers::user_summary($doctor_id),
            'appointments_today' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$appointments_table} WHERE doctor_user_id = %d AND start_at BETWEEN %s AND %s", $doctor_id, $today_start, $today_end)),
            'appointments_requested' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$appointments_table} WHERE doctor_user_id = %d AND status = 'requested'", $doctor_id)),
            'prescriptions_draft' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$prescriptions_table} WHERE doctor_user_id = %d AND status = 'draft'", $doctor_id)),
            'prescriptions_assigned' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$prescriptions_table} WHERE doctor_user_id = %d AND status = 'assigned_to_patient'", $doctor_id)),
        ]);
    }

    public static function dashboard_store_admin(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $appointments = Nevari_Helpers::table('appointments');
        $prescriptions = Nevari_Helpers::table('prescriptions');
        $emails = Nevari_Helpers::table('email_logs');
        $data = [
            'sales' => self::sales_summary(),
            'products' => ['total' => post_type_exists('product') ? (int) wp_count_posts('product')->publish : 0],
            'doctors' => ['total' => (int) (new WP_User_Query(['role' => 'doctor', 'fields' => 'ID']))->get_total()],
            'consultations' => [
                'requested' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$appointments} WHERE status = 'requested'"),
                'confirmed' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$appointments} WHERE status = 'confirmed'"),
                'completed' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$appointments} WHERE status = 'completed'"),
            ],
            'prescriptions' => [
                'draft' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$prescriptions} WHERE status = 'draft'"),
                'assigned' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$prescriptions} WHERE status = 'assigned_to_patient'"),
                'fulfilled' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$prescriptions} WHERE status = 'fulfilled'"),
                'expired' => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$prescriptions} WHERE status = 'expired'"),
            ],
            'emails' => [
                'sent_today' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$emails} WHERE status = 'sent' AND created_at >= %s", gmdate('Y-m-d 00:00:00'))),
                'failed_today' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$emails} WHERE status = 'failed' AND created_at >= %s", gmdate('Y-m-d 00:00:00'))),
            ],
            'audit' => self::audit_summary_data(),
        ];
        return Nevari_Helpers::success($data);
    }

    public static function dashboard_sales(WP_REST_Request $request): WP_REST_Response {
        return Nevari_Helpers::success(self::sales_summary());
    }

    private static function sales_summary(): array {
        if (!self::woo_available()) { return ['today' => '0', 'month' => '0', 'orders_today' => 0]; }
        $today_orders = wc_get_orders(['limit' => -1, 'date_created' => '>' . gmdate('Y-m-d 00:00:00'), 'status' => ['processing','completed']]);
        $month_orders = wc_get_orders(['limit' => -1, 'date_created' => '>' . gmdate('Y-m-01 00:00:00'), 'status' => ['processing','completed']]);
        $today_total = 0; foreach ($today_orders as $o) { $today_total += (float) $o->get_total(); }
        $month_total = 0; foreach ($month_orders as $o) { $month_total += (float) $o->get_total(); }
        return ['today' => wc_format_decimal($today_total, 2), 'month' => wc_format_decimal($month_total, 2), 'orders_today' => count($today_orders)];
    }

    public static function audit_logs_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_audit_logs_read', 60, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'index'])) {
            return $response;
        }
        $result = Nevari_Audit::query($request->get_params());
        return Nevari_Helpers::success($result['items'], Nevari_Helpers::pagination_meta($result['page'], $result['per_page'], $result['total']));
    }

    public static function audit_logs_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_audit_logs_read', 60, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'show'])) {
            return $response;
        }
        global $wpdb;
        $row = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('audit_logs') . " WHERE id = %d", (int) $request['id']));
        if (!$row) { return Nevari_Helpers::error('audit_log_not_found', 'Audit log not found.', 404); }
        return Nevari_Helpers::success(Nevari_Audit::format($row));
    }

    public static function audit_summary(WP_REST_Request $request): WP_REST_Response {
        return Nevari_Helpers::success(self::audit_summary_data());
    }

    private static function audit_summary_data(): array {
        global $wpdb;
        $table = Nevari_Helpers::table('audit_logs');
        $rows = $wpdb->get_results("SELECT category, status, COUNT(*) AS count FROM {$table} GROUP BY category, status");
        $data = [];
        foreach (['orders', 'payments', 'security', 'consultation', 'emails'] as $cat) {
            $data[$cat] = ['success' => 0, 'error' => 0];
        }
        foreach ($rows ?: [] as $row) {
            if (!isset($data[$row->category])) { $data[$row->category] = ['success' => 0, 'error' => 0]; }
            $data[$row->category][$row->status] = (int) $row->count;
        }
        return $data;
    }
}
