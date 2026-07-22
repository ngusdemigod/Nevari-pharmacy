<?php
if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Rest {
    private const CUSTOMER_SETTINGS_META_KEY = '_nevari_customer_dashboard_settings';
    private const CUSTOMER_PROFILE_IMAGE_ID_META_KEY = '_nevari_customer_profile_image_id';
    private const CUSTOMER_PROFILE_IMAGE_URL_META_KEY = '_nevari_customer_profile_image_url';

    public static function init(): void {
        add_action('rest_api_init', [__CLASS__, 'register_routes']);
    }

    public static function register_routes(): void {
        self::orders_routes();
        self::products_routes();
        self::customers_routes();
        self::doctors_routes();
        self::role_management_routes();
        self::appointments_routes();
        self::prescriptions_routes();
        self::emails_routes();
        self::payment_routes();
        self::dashboard_routes();
        self::audit_routes();
    }

    public static function auth_required(): bool {
        return Nevari_Auth::api_session_required();
    }

    public static function store_admin_required(): bool {
        $user_id = Nevari_Auth::api_session_user_id();
        return $user_id > 0 && Nevari_Helpers::is_store_admin($user_id);
    }

    public static function product_manager_required(): bool {
        $user_id = Nevari_Auth::api_session_user_id();
        return $user_id > 0 && (Nevari_Helpers::is_store_admin($user_id) || Nevari_Helpers::is_pharmacist($user_id));
    }

    public static function doctor_or_admin_required(): bool {
        $user_id = Nevari_Auth::api_session_user_id();
        return $user_id > 0 && (Nevari_Helpers::is_doctor($user_id) || Nevari_Helpers::is_store_admin($user_id));
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
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'orders_create'],
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
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [__CLASS__, 'orders_delete'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        foreach (['notes', 'rx-hold', 'release-rx-hold', 'link-prescription', 'assign-doctor'] as $action) {
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/receipt', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'orders_receipt'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/details-pdf', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'orders_details_pdf'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/prescription-pdf', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'orders_prescription_pdf'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/document-data', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'orders_document_data'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/cancel', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'orders_cancel'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/refill', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'orders_refill'],
            'permission_callback' => [__CLASS__, 'patient_owned_order_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/send-receipt', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'orders_send_receipt'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/payment/initialize', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'orders_payment_initialize'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/orders/(?P<id>\d+)/payment/verify', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'orders_payment_verify'],
            'permission_callback' => '__return_true',
        ]);
    }

    private static function payment_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/invoices/(?P<invoice_number>[^/]+)/payment-data', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'invoices_payment_data'],
            'permission_callback' => '__return_true',
        ]);

        foreach (['paystack', 'flutterwave', 'stripe'] as $gateway) {
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/payments/' . $gateway . '/webhook', [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'payments_gateway_webhook'],
                'permission_callback' => '__return_true',
            ]);
        }
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
                'permission_callback' => [__CLASS__, 'product_manager_required'],
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
                'permission_callback' => [__CLASS__, 'product_manager_required'],
            ],
            [
                'methods' => WP_REST_Server::DELETABLE,
                'callback' => [__CLASS__, 'products_delete'],
                'permission_callback' => [__CLASS__, 'product_manager_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/(?P<id>\d+)/duplicate', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'products_duplicate'],
            'permission_callback' => [__CLASS__, 'product_manager_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/media', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'products_upload_media'],
            'permission_callback' => [__CLASS__, 'product_manager_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/(?P<id>\d+)/pharmacy-rules', [
            'methods' => WP_REST_Server::EDITABLE,
            'callback' => [__CLASS__, 'products_update_rules'],
            'permission_callback' => [__CLASS__, 'product_manager_required'],
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
                    'permission_callback' => [__CLASS__, 'product_manager_required'],
                ],
            ]);
            register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/' . $path . '/(?P<id>\d+)', [
                [
                    'methods' => WP_REST_Server::EDITABLE,
                    'callback' => static function (WP_REST_Request $request) use ($taxonomy) {
                        return self::terms_update($request, $taxonomy);
                    },
                    'permission_callback' => [__CLASS__, 'product_manager_required'],
                ],
                [
                    'methods' => WP_REST_Server::DELETABLE,
                    'callback' => static function (WP_REST_Request $request) use ($taxonomy) {
                        return self::terms_delete($request, $taxonomy);
                    },
                    'permission_callback' => [__CLASS__, 'product_manager_required'],
                ],
            ]);
        }

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/products/badges', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'product_badges'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);
    }

    private static function customers_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/customers', [
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'customers_create'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/customers/me/settings', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'customers_settings_show'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'customers_settings_update'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/customers/me/profile-image', [
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'customers_profile_image_update'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/doctors/settings', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'doctors_settings_show'],
                'permission_callback' => [__CLASS__, 'store_admin_required'],
            ],
            [
                'methods' => WP_REST_Server::EDITABLE,
                'callback' => [__CLASS__, 'doctors_settings_update'],
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/doctors/(?P<id>\d+)/reviews', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'doctor_reviews_index'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/doctors/(?P<id>\d+)/products', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'doctors_products'],
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/availability', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'appointments_availability'],
            'permission_callback' => [__CLASS__, 'auth_required'],
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

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/(?P<id>\d+)/checkout', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'appointment_checkout'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/(?P<id>\d+)/payment/initialize', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'appointments_payment_initialize'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/(?P<id>\d+)/payment/verify', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'appointments_payment_verify'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/(?P<id>\d+)/confirmation', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'appointment_confirmation'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/join/(?P<token>[A-Za-z0-9\\-_\\.]+)', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'appointment_join_access'],
                'permission_callback' => '__return_true',
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'appointment_join_check_in'],
                'permission_callback' => '__return_true',
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/join/(?P<token>[A-Za-z0-9\\-_\\.]+)/notify', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'appointment_join_notify'],
            'permission_callback' => '__return_true',
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/(?P<id>\d+)/calendar', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'appointment_calendar'],
            'permission_callback' => [__CLASS__, 'auth_required'],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/appointments/(?P<id>\d+)/review', [
            [
                'methods' => WP_REST_Server::READABLE,
                'callback' => [__CLASS__, 'appointment_review_show'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
            [
                'methods' => WP_REST_Server::CREATABLE,
                'callback' => [__CLASS__, 'appointment_review_create'],
                'permission_callback' => [__CLASS__, 'auth_required'],
            ],
        ]);
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
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/emails/booking-test', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'emails_booking_test'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
    }

    private static function dashboard_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/dashboard/patient', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'dashboard_patient'],
            'permission_callback' => static function () {
                $user_id = Nevari_Auth::api_session_user_id();
                return $user_id > 0 && Nevari_Helpers::is_patient($user_id);
            },
        ]);
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/dashboard/patient/search', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'dashboard_patient_search'],
            'permission_callback' => static function () {
                $user_id = Nevari_Auth::api_session_user_id();
                return $user_id > 0 && Nevari_Helpers::is_patient($user_id);
            },
            'args' => [
                'q' => ['required' => true, 'sanitize_callback' => 'sanitize_text_field'],
                'limit' => ['required' => false, 'default' => 20, 'sanitize_callback' => 'absint'],
            ],
        ]);

        register_rest_route(NEVARI_PHARMACY_REST_NS, '/dashboard/doctor', [
            'methods' => WP_REST_Server::READABLE,
            'callback' => [__CLASS__, 'dashboard_doctor'],
            'permission_callback' => static function () {
                $user_id = Nevari_Auth::api_session_user_id();
                return $user_id > 0 && Nevari_Helpers::is_doctor($user_id);
            },
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
            Nevari_Helpers::dashboard_log('orders.index.unavailable', [
                'dashboard' => self::dashboard_name_for_current_user(),
                'reason' => 'woocommerce_missing',
            ], 'error');
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required for orders.', 503);
        }
        $page = max(1, (int) $request->get_param('page')) ?: 1;
        $per_page = min(100, max(1, (int) $request->get_param('per_page') ?: 20));
        $requested_status = $request->get_param('status') ? sanitize_key((string) $request->get_param('status')) : '';
        $args = [
            'limit' => $per_page,
            'page' => $page,
            'paginate' => true,
            'orderby' => 'date',
            'order' => 'DESC',
        ];
        if ($requested_status) {
            $args['status'] = $requested_status;
        }
        if (!Nevari_Helpers::is_store_admin()) {
            if (Nevari_Helpers::is_patient()) {
                $patient_user_id = (int) get_current_user_id();
                if (!$patient_user_id) {
                    return Nevari_Helpers::error('forbidden', 'A valid customer session is required to load orders.', 403);
                }
                // Enforce patient scope on backend by authenticated account ID only.
                // This prevents cross-account/history leakage from shared or legacy billing emails.
                $args['customer_id'] = $patient_user_id;
            } elseif (Nevari_Helpers::is_doctor()) {
                $args['meta_key'] = '_nevari_assigned_doctor_user_id';
                $args['meta_value'] = (string) get_current_user_id();
            } elseif (Nevari_Helpers::is_pharmacist()) {
                // Pharmacists oversee retail and MTM-linked orders from the same dashboard views.
                // They intentionally share the broader order list scope with store operations.
            } else {
                return Nevari_Helpers::error('forbidden', 'You cannot list these orders.', 403);
            }
        } elseif ($request->get_param('patient_id')) {
            $args['customer_id'] = (int) $request->get_param('patient_id');
        } elseif ($request->get_param('customer_email')) {
            $args['billing_email'] = sanitize_email((string) $request->get_param('customer_email'));
        }

        Nevari_Helpers::dashboard_log('orders.index.start', [
            'dashboard' => self::dashboard_name_for_current_user(),
            'page' => $page,
            'per_page' => $per_page,
            'status' => $requested_status ?: 'all',
            'customer_id' => isset($args['customer_id']) ? (int) $args['customer_id'] : null,
            'doctor_scope' => isset($args['meta_value']) ? (int) $args['meta_value'] : null,
            'customer_email' => isset($args['billing_email']) ? (string) $args['billing_email'] : '',
            'is_store_admin' => Nevari_Helpers::is_store_admin(),
        ]);

        try {
            $result = wc_get_orders($args);
        } catch (Throwable $exception) {
            Nevari_Helpers::dashboard_log('orders.index.query_failed', [
                'dashboard' => self::dashboard_name_for_current_user(),
                'message' => $exception->getMessage(),
                'status' => $requested_status ?: 'all',
                'page' => $page,
                'per_page' => $per_page,
            ], 'error');
            error_log(sprintf( // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                'Nevari orders_index query failed: %s in %s:%d',
                $exception->getMessage(),
                $exception->getFile(),
                $exception->getLine()
            ));
            return Nevari_Helpers::error('orders_query_failed', 'Orders could not be loaded from WooCommerce.', 500);
        }

        $orders = is_object($result) && isset($result->orders) ? $result->orders : [];
        $total = is_object($result) && isset($result->total) ? (int) $result->total : count($orders);
        $items = [];
        $format_errors = [];
        foreach ($orders as $order) {
            try {
                $items[] = self::format_order($order);
            } catch (Throwable $exception) {
                $order_id = is_object($order) && method_exists($order, 'get_id') ? (int) $order->get_id() : 0;
                error_log(sprintf( // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                    'Nevari orders_index format failed for order %d: %s in %s:%d',
                    $order_id,
                    $exception->getMessage(),
                    $exception->getFile(),
                    $exception->getLine()
                ));
                $format_errors[] = $order_id;
            }
        }
        $meta = Nevari_Helpers::pagination_meta($page, $per_page, $total);
        if ($format_errors) {
            $meta['order_format_errors'] = $format_errors;
            Nevari_Helpers::dashboard_log('orders.index.format_warnings', [
                'dashboard' => self::dashboard_name_for_current_user(),
                'format_error_order_ids' => $format_errors,
                'total' => $total,
            ], 'warning');
        }
        Nevari_Helpers::dashboard_log('orders.index.success', [
            'dashboard' => self::dashboard_name_for_current_user(),
            'returned' => count($items),
            'total' => $total,
            'page' => $page,
            'per_page' => $per_page,
            'status' => $requested_status ?: 'all',
        ]);
        return Nevari_Helpers::success($items, $meta);
    }

    public static function orders_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'show'])) {
            return $response;
        }
        $order = self::get_order_scoped((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) $order->get_error_data('status') ?: 404);
        }
        try {
            return Nevari_Helpers::success(self::format_order($order, true));
        } catch (Throwable $exception) {
            error_log(sprintf( // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                'Nevari orders_show format failed for order %d: %s in %s:%d',
                (int) $order->get_id(),
                $exception->getMessage(),
                $exception->getFile(),
                $exception->getLine()
            ));
            return Nevari_Helpers::error('order_format_failed', 'Order data could not be formatted for the dashboard.', 500, [
                'order_id' => (int) $order->get_id(),
            ]);
        }
    }

    public static function orders_document_data(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 180, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'document-data'])) {
            return $response;
        }
        global $wpdb;
        $order = self::get_order_scoped((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) $order->get_error_data('status') ?: 404);
        }

        $items = $order->get_items();
        $subtotal = self::order_subtotal($order, $items);
        $discount = (float) $order->get_discount_total();
        $tax = (float) $order->get_total_tax();
        $shipping = (float) $order->get_shipping_total() + (float) $order->get_shipping_tax();
        $fees = self::order_fees_total($order);
        $total = (float) $order->get_total();
        $amount_paid = $order->get_date_paid() ? $total : 0.0;
        $balance_due = max(0.0, $total - $amount_paid);
        $payment_token = ($balance_due > 0 && $order->needs_payment()) ? self::invoice_payment_token($order) : '';
        $payment_url = ($balance_due > 0 && $order->needs_payment()) ? self::branded_invoice_payment_url($order) : '';
        $settings = Nevari_Helpers::payment_gateway_settings();
        $active_gateway = isset($settings['active_gateway']) ? (string) $settings['active_gateway'] : 'woocommerce';
        $invoice_number = self::invoice_number_for_order($order);

        $appointment_row = null;
        $appointment_id = (int) $order->get_meta('_nevari_appointment_id');
        if ($appointment_id > 0) {
            $appointment_row = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM " . Nevari_Helpers::table('appointments') . " WHERE id = %d LIMIT 1",
                $appointment_id
            ));
        }
        if (!$appointment_row) {
            $appointment_row = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM " . Nevari_Helpers::table('appointments') . " WHERE order_id = %d ORDER BY id DESC LIMIT 1",
                (int) $order->get_id()
            ));
        }

        $consultation_type = $appointment_row ? ucwords(str_replace('_', ' ', (string) ($appointment_row->type ?: 'consultation'))) : '';
        $consultation_brief = $appointment_row ? sanitize_text_field((string) ($appointment_row->reason ?: '')) : '';
        $consultation_when = $appointment_row && !empty($appointment_row->start_at)
            ? gmdate('M j, Y g:i A', strtotime((string) $appointment_row->start_at . ' UTC'))
            : '';
        $is_consultation_order = (bool) $appointment_row;

        $rows = [];
        foreach ($items as $item) {
            $quantity = (float) $item->get_quantity();
            $line_subtotal = (float) $item->get_subtotal();
            $line_total = (float) $item->get_total();
            $rows[] = [
                'name' => wp_strip_all_tags($item->get_name()),
                'is_consultation' => $is_consultation_order,
                'consultation_type' => $consultation_type,
                'consultation_brief' => $consultation_brief,
                'consultation_when' => $consultation_when,
                'qty' => $quantity,
                'rate' => $quantity > 0 ? $line_subtotal / $quantity : $line_subtotal,
                'tax' => (float) $item->get_total_tax(),
                'discount' => max(0.0, $line_subtotal - $line_total),
                'total' => $line_total,
            ];
        }

        $order_number = $order->get_order_number();
        $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
        $customer_name = $customer_name ?: trim($order->get_shipping_first_name() . ' ' . $order->get_shipping_last_name());
        $customer_name = $customer_name ?: $order->get_formatted_billing_full_name();
        $customer_name = $customer_name ?: $order->get_billing_email();

        return Nevari_Helpers::success([
            'order_id' => $order->get_id(),
            'order_number' => $order_number,
            'invoice_number' => $invoice_number,
            'receipt_number' => 'NVH-RCP-' . str_pad((string) $order_number, 5, '0', STR_PAD_LEFT),
            'prescription_number' => $order->get_meta('_nevari_prescription_id') ? 'NVH-RX-' . str_pad((string) $order->get_meta('_nevari_prescription_id'), 5, '0', STR_PAD_LEFT) : '',
            'order_status' => $order->get_status(),
            'payment_status' => $order->get_date_paid() ? 'completed' : $order->get_status(),
            'payment_url' => $payment_url,
            'branded_payment_url' => $payment_url,
            'payment_token' => $payment_token,
            'woocommerce_payment_url' => ($balance_due > 0 && $order->needs_payment()) ? $order->get_checkout_payment_url(false) : '',
            'payment_gateway_configured' => Nevari_Helpers::active_payment_gateway_configured(),
            'active_payment_gateway' => $active_gateway,
            'available_gateways' => self::available_invoice_gateways(),
            'currency' => self::store_currency(),
            'store_currency' => self::store_currency(),
            'invoice_date' => $order->get_date_created() ? $order->get_date_created()->date('c') : null,
            'due_date' => $order->get_date_created() ? $order->get_date_created()->date('c') : null,
            'customer' => [
                'name' => $customer_name ?: 'Customer',
                'email' => $order->get_billing_email(),
                'phone' => $order->get_billing_phone(),
                'address' => trim(implode(', ', array_filter([
                    $order->get_billing_address_1(),
                    $order->get_billing_address_2(),
                    $order->get_billing_city(),
                    $order->get_billing_state(),
                    $order->get_billing_postcode(),
                    $order->get_billing_country(),
                ]))),
            ],
            'items' => $rows,
            'totals' => [
                'subtotal' => $subtotal,
                'discount' => $discount,
                'tax' => $tax,
                'shipping' => $shipping,
                'fees' => $fees,
                'total' => $total,
                'amount_paid' => $amount_paid,
                'balance_due' => $balance_due,
            ],
            'payment_method' => $order->get_payment_method_title() ?: $order->get_payment_method(),
            'payment_reference' => $order->get_transaction_id(),
            'diagnosis' => '',
            'doctor_name' => '',
            'doctor_email' => '',
            'doctor_notes' => '',
            'medications' => [],
        ]);
    }

    public static function invoices_payment_data(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 180, MINUTE_IN_SECONDS, ['invoice:' . sanitize_text_field((string) $request['invoice_number'])])) {
            return $response;
        }

        $appointment_invoice = self::get_appointment_invoice_by_invoice_number((string) $request['invoice_number']);
        if ($appointment_invoice && self::appointment_invoice_payment_token_is_valid($appointment_invoice, self::payment_token_from_request($request))) {
            return Nevari_Helpers::success(self::appointment_invoice_payment_data($appointment_invoice));
        }

        $order = self::get_order_for_invoice_number((string) $request['invoice_number']);
        if (!$order || !self::invoice_payment_token_is_valid($order, self::payment_token_from_request($request))) {
            return Nevari_Helpers::error('invoice_not_found', 'Invoice not found.', 404);
        }

        return Nevari_Helpers::success(self::invoice_payment_data($order));
    }

    public static function orders_payment_initialize(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 20, MINUTE_IN_SECONDS, ['payment-init:' . (int) $request['id']])) {
            return $response;
        }

        $order = wc_get_order((int) $request['id']);
        $params = Nevari_Helpers::get_json_params($request);
        $payment_token = self::payment_token_from_request($request, $params);
        if (!$order || !self::invoice_payment_token_is_valid($order, $payment_token)) {
            return Nevari_Helpers::error('order_not_found', 'Order not found.', 404);
        }
        if (!$order->needs_payment()) {
            return Nevari_Helpers::error('payment_not_required', 'This order does not require payment.', 409);
        }

        $gateway = sanitize_key((string) ($params['gateway'] ?? ''));
        if (!in_array($gateway, self::available_invoice_gateways(), true)) {
            return Nevari_Helpers::error('invalid_gateway', 'Unsupported or unconfigured payment gateway.', 422);
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $callback_url = self::validated_payment_callback_url((string) ($params['callback_url'] ?? ''), $order, $payment_token);
        if (is_wp_error($callback_url)) {
            return Nevari_Helpers::error($callback_url->get_error_code(), $callback_url->get_error_message(), 422);
        }
        $reference = self::invoice_payment_reference($order, $gateway);
        $metadata = [
            'order_id' => (int) $order->get_id(),
            'invoice_number' => self::invoice_number_for_order($order),
            'customer_email' => (string) $order->get_billing_email(),
            'source' => 'invoice_pdf_pay_now',
        ];

        $initialized = self::initialize_gateway_payment($gateway, $order, $reference, $callback_url, $metadata, $settings);
        if (is_wp_error($initialized)) {
            return Nevari_Helpers::error($initialized->get_error_code(), $initialized->get_error_message(), 502);
        }

        $provider_reference = sanitize_text_field((string) ($initialized['reference'] ?? $reference));
        $order->update_meta_data('_nevari_invoice_payment_gateway', $gateway);
        $order->update_meta_data('_nevari_invoice_payment_reference', $provider_reference);
        $order->save();

        return Nevari_Helpers::success($initialized);
    }

    public static function orders_payment_verify(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 30, MINUTE_IN_SECONDS, ['payment-verify:' . (int) $request['id']])) {
            return $response;
        }

        $order = wc_get_order((int) $request['id']);
        $params = Nevari_Helpers::get_json_params($request);
        if (!$order || !self::invoice_payment_token_is_valid($order, self::payment_token_from_request($request, $params))) {
            return Nevari_Helpers::error('order_not_found', 'Order not found.', 404);
        }

        $gateway = sanitize_key((string) ($params['gateway'] ?? ''));
        $reference = sanitize_text_field((string) ($params['reference'] ?? ''));
        if (!$reference) {
            return Nevari_Helpers::error('missing_reference', 'Payment reference is required.', 422);
        }

        $result = self::verify_gateway_payment($gateway, $reference, $order);
        if (is_wp_error($result)) {
            return Nevari_Helpers::error($result->get_error_code(), $result->get_error_message(), 502);
        }
        if (!empty($result['paid'])) {
            self::complete_order_payment($order, $gateway, sanitize_text_field((string) ($result['transaction_id'] ?? $reference)));
        }

        return Nevari_Helpers::success([
            'paid' => (bool) $result['paid'],
            'order_id' => (int) $order->get_id(),
            'gateway' => $gateway,
            'reference' => $reference,
            'receipt_url' => add_query_arg(['role' => 'patient', 'tab' => 'receipt'], self::documents_url_for_order($order)),
        ]);
    }

    public static function appointments_payment_initialize(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 20, MINUTE_IN_SECONDS, ['appointment-payment-init:' . (int) $request['id']])) {
            return $response;
        }

        $appointment = self::get_appointment_row((int) $request['id']);
        $params = Nevari_Helpers::get_json_params($request);
        $invoice = self::get_appointment_invoice_by_appointment_id((int) $request['id']);
        $payment_token = self::payment_token_from_request($request, $params);
        if (!$appointment || !$invoice || !self::appointment_invoice_payment_token_is_valid($invoice, $payment_token)) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment invoice not found.', 404);
        }
        if ((string) $invoice->status === 'paid' || (string) $appointment->payment_status === 'paid') {
            return Nevari_Helpers::error('payment_not_required', 'This appointment does not require payment.', 409);
        }
        if (!self::appointment_invoice_is_payable($appointment, $invoice)) {
            return Nevari_Helpers::error('reservation_expired', 'Your appointment reservation has expired.', 409);
        }

        $gateway = sanitize_key((string) ($params['gateway'] ?? ''));
        if (!in_array($gateway, self::available_invoice_gateways(), true)) {
            return Nevari_Helpers::error('invalid_gateway', 'Unsupported or unconfigured payment gateway.', 422);
        }

        $settings = Nevari_Helpers::payment_gateway_settings();
        $callback_url = self::validated_appointment_payment_callback_url((string) ($params['callback_url'] ?? ''), $invoice, $payment_token);
        if (is_wp_error($callback_url)) {
            return Nevari_Helpers::error($callback_url->get_error_code(), $callback_url->get_error_message(), 422);
        }

        $reference = sprintf('NVH-APT-%d-%s-%s', (int) $invoice->id, strtoupper($gateway), wp_generate_password(8, false, false));
        $amount = (float) $invoice->amount;
        $currency = (string) $invoice->currency;
        $email = (string) $invoice->customer_email;
        $customer_name = (string) $invoice->customer_name;
        $metadata = [
            'appointment_id' => (int) $appointment->id,
            'invoice_id' => (int) $invoice->id,
            'invoice_number' => (string) $invoice->invoice_number,
            'customer_email' => $email,
            'source' => 'appointment_invoice_pay_now',
        ];
        $initialized = self::initialize_gateway_payment_raw($gateway, $reference, $callback_url, $metadata, $settings, $amount, $currency, $email, $customer_name, 'Appointment Invoice ' . $invoice->invoice_number);
        if (is_wp_error($initialized)) {
            return Nevari_Helpers::error($initialized->get_error_code(), $initialized->get_error_message(), 502);
        }

        global $wpdb;
        $wpdb->update(Nevari_Helpers::table('appointment_invoices'), [
            'gateway' => $gateway,
            'payment_reference' => sanitize_text_field((string) ($initialized['reference'] ?? $reference)),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => (int) $invoice->id], ['%s', '%s', '%s'], ['%d']);

        return Nevari_Helpers::success($initialized);
    }

    public static function appointments_payment_verify(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 30, MINUTE_IN_SECONDS, ['appointment-payment-verify:' . (int) $request['id']])) {
            return $response;
        }

        $appointment = self::get_appointment_row((int) $request['id']);
        $params = Nevari_Helpers::get_json_params($request);
        $invoice = self::get_appointment_invoice_by_appointment_id((int) $request['id']);
        if (!$appointment || !$invoice || !self::appointment_invoice_payment_token_is_valid($invoice, self::payment_token_from_request($request, $params))) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment invoice not found.', 404);
        }
        if ((string) $invoice->status === 'paid' || (string) $appointment->payment_status === 'paid') {
            return Nevari_Helpers::success([
                'paid' => true,
                'appointment_id' => (int) $appointment->id,
                'gateway' => sanitize_key((string) ($params['gateway'] ?? '')),
                'reference' => sanitize_text_field((string) ($params['reference'] ?? '')),
            ]);
        }
        if (!self::appointment_invoice_is_payable($appointment, $invoice)) {
            return Nevari_Helpers::error('reservation_expired', 'Your appointment reservation has expired.', 409);
        }

        $gateway = sanitize_key((string) ($params['gateway'] ?? ''));
        $reference = sanitize_text_field((string) ($params['reference'] ?? ''));
        if (!$reference) {
            return Nevari_Helpers::error('missing_reference', 'Payment reference is required.', 422);
        }

        $result = self::verify_gateway_payment_raw(
            $gateway,
            $reference,
            (string) $invoice->payment_reference,
            (float) $invoice->amount,
            (string) $invoice->currency,
            ['appointment_id' => (int) $appointment->id, 'invoice_id' => (int) $invoice->id],
            (string) $invoice->customer_email
        );
        if (is_wp_error($result)) {
            return Nevari_Helpers::error($result->get_error_code(), $result->get_error_message(), 502);
        }

        global $wpdb;
        $wpdb->update(Nevari_Helpers::table('appointment_invoices'), [
            'status' => 'paid',
            'gateway' => $gateway,
            'transaction_id' => sanitize_text_field((string) ($result['transaction_id'] ?? $reference)),
            'paid_at' => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => (int) $invoice->id], ['%s', '%s', '%s', '%s', '%s'], ['%d']);

        Nevari_Plugin::instance()->handle_custom_appointment_payment_complete((int) $appointment->id);
        $confirmed_appointment = self::get_appointment_row((int) $appointment->id);
        Nevari_Audit::log('consultation', 'nevari', 'appointment.payment_confirm_trace', $confirmed_appointment ? 'success' : 'error', [
            'appointment_id' => (int) $appointment->id,
            'object_type' => 'appointment',
            'object_id' => (int) $appointment->id,
            'message' => 'Processed direct appointment payment confirmation path.',
            'metadata' => [
                'gateway' => $gateway,
                'reference' => $reference,
                'invoice_id' => (int) $invoice->id,
                'invoice_number' => (string) $invoice->invoice_number,
                'post_status' => (string) ($confirmed_appointment->status ?? ''),
                'post_payment_status' => (string) ($confirmed_appointment->payment_status ?? ''),
            ],
        ]);
        if ($confirmed_appointment && !in_array((string) $confirmed_appointment->status, ['cancelled', 'canceled'], true)) {
            self::dispatch_appointment_payment_webhook([
                'event' => 'appointment.payment_confirmed',
                'appointment_id' => (int) $appointment->id,
                'invoice_id' => (int) $invoice->id,
                'invoice_number' => (string) $invoice->invoice_number,
                'payment_status' => (string) ($confirmed_appointment->payment_status ?? 'paid'),
                'status' => (string) ($confirmed_appointment->status ?? 'confirmed'),
                'gateway' => $gateway,
                'reference' => $reference,
            ]);
        }

        return Nevari_Helpers::success([
            'paid' => true,
            'appointment_id' => (int) $appointment->id,
            'gateway' => $gateway,
            'reference' => $reference,
        ]);
    }

    public static function payments_gateway_webhook(WP_REST_Request $request): WP_REST_Response {
        $route = (string) $request->get_route();
        preg_match('#/payments/([^/]+)/webhook$#', $route, $matches);
        $gateway = sanitize_key($matches[1] ?? '');
        if (!in_array($gateway, ['paystack', 'flutterwave', 'stripe'], true)) {
            return Nevari_Helpers::error('invalid_gateway', 'Invalid gateway webhook.', 404);
        }

        $raw_body = $request->get_body();
        if (!self::gateway_webhook_signature_valid($gateway, $request, $raw_body)) {
            return Nevari_Helpers::error('invalid_signature', 'Webhook signature could not be verified.', 401);
        }

        $payload = json_decode($raw_body, true);
        $payload = is_array($payload) ? $payload : [];
        $reference = self::webhook_reference($gateway, $payload);
        $appointment_invoice = self::webhook_appointment_invoice($gateway, $payload, $reference);
        if ($appointment_invoice) {
            $appointment = self::get_appointment_row((int) $appointment_invoice->appointment_id);
            if (!$appointment) {
                return Nevari_Helpers::error('appointment_not_found', 'Webhook appointment not found.', 404);
            }
            if ((string) $appointment_invoice->status !== 'paid' && !self::appointment_invoice_is_payable($appointment, $appointment_invoice)) {
                return Nevari_Helpers::success(['processed' => false, 'reason' => 'reservation_expired', 'appointment_id' => (int) $appointment->id]);
            }

            if ((string) $appointment_invoice->status !== 'paid') {
                $result = self::verify_gateway_payment_raw(
                    $gateway,
                    $reference,
                    (string) $appointment_invoice->payment_reference,
                    (float) $appointment_invoice->amount,
                    (string) $appointment_invoice->currency,
                    ['appointment_id' => (int) $appointment->id, 'invoice_id' => (int) $appointment_invoice->id],
                    (string) $appointment_invoice->customer_email
                );
                if (is_wp_error($result)) {
                    return Nevari_Helpers::error($result->get_error_code(), $result->get_error_message(), 422);
                }

                global $wpdb;
                $wpdb->update(Nevari_Helpers::table('appointment_invoices'), [
                    'status' => 'paid',
                    'gateway' => $gateway,
                    'transaction_id' => sanitize_text_field((string) ($result['transaction_id'] ?? $reference)),
                    'paid_at' => Nevari_Helpers::now(),
                    'updated_at' => Nevari_Helpers::now(),
                ], ['id' => (int) $appointment_invoice->id], ['%s', '%s', '%s', '%s', '%s'], ['%d']);
                Nevari_Plugin::instance()->handle_custom_appointment_payment_complete((int) $appointment->id);
            }

            $confirmed_appointment = self::get_appointment_row((int) $appointment->id);
            Nevari_Audit::log('consultation', 'nevari', 'appointment.payment_confirm_trace', $confirmed_appointment ? 'success' : 'error', [
                'appointment_id' => (int) $appointment->id,
                'object_type' => 'appointment',
                'object_id' => (int) $appointment->id,
                'message' => 'Processed gateway webhook appointment confirmation path.',
                'metadata' => [
                    'gateway' => $gateway,
                    'reference' => $reference,
                    'invoice_id' => (int) $appointment_invoice->id,
                    'invoice_number' => (string) $appointment_invoice->invoice_number,
                    'invoice_status' => (string) $appointment_invoice->status,
                    'post_status' => (string) ($confirmed_appointment->status ?? ''),
                    'post_payment_status' => (string) ($confirmed_appointment->payment_status ?? ''),
                ],
            ]);
            if ($confirmed_appointment && !in_array((string) $confirmed_appointment->status, ['cancelled', 'canceled'], true)) {
                self::dispatch_appointment_payment_webhook([
                    'event' => 'appointment.payment_confirmed',
                    'appointment_id' => (int) $appointment->id,
                    'invoice_id' => (int) $appointment_invoice->id,
                    'invoice_number' => (string) $appointment_invoice->invoice_number,
                    'payment_status' => (string) ($confirmed_appointment->payment_status ?? 'paid'),
                    'status' => (string) ($confirmed_appointment->status ?? 'confirmed'),
                    'gateway' => $gateway,
                    'reference' => $reference,
                ]);
            }

            return Nevari_Helpers::success(['processed' => true, 'appointment_id' => (int) $appointment->id]);
        }
        $order_id = self::webhook_order_id($gateway, $payload);
        $order = $order_id ? wc_get_order($order_id) : self::get_order_for_payment_reference($reference);
        if (!$order) {
            return Nevari_Helpers::error('order_not_found', 'Webhook order not found.', 404);
        }

        if ($gateway === 'paystack' && (string) $order->get_payment_method() === Nevari_Paystack::WC_GATEWAY_ID) {
            $result = Nevari_Paystack::verify_and_complete_woocommerce_order($order, $reference, 'webhook');
        } else {
            $result = self::verify_gateway_payment($gateway, $reference, $order);
            if (!is_wp_error($result) && !empty($result['paid'])) {
                self::complete_order_payment($order, $gateway, sanitize_text_field((string) ($result['transaction_id'] ?? $reference)));
            }
        }
        if (is_wp_error($result)) {
            return Nevari_Helpers::error($result->get_error_code(), $result->get_error_message(), 422);
        }

        return Nevari_Helpers::success(['processed' => (bool) $result['paid']]);
    }

    private static function webhook_metadata(string $gateway, array $payload): array {
        if ($gateway === 'stripe') {
            return is_array($payload['data']['object']['metadata'] ?? null) ? $payload['data']['object']['metadata'] : [];
        }
        if ($gateway === 'flutterwave') {
            return is_array($payload['data']['meta'] ?? null) ? $payload['data']['meta'] : [];
        }
        return is_array($payload['data']['metadata'] ?? null) ? $payload['data']['metadata'] : [];
    }

    private static function webhook_appointment_invoice(string $gateway, array $payload, string $reference) {
        $metadata = self::webhook_metadata($gateway, $payload);
        $invoice_id = (int) ($metadata['invoice_id'] ?? 0);
        $appointment_id = (int) ($metadata['appointment_id'] ?? 0);
        if ($invoice_id > 0) {
            global $wpdb;
            return $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM " . Nevari_Helpers::table('appointment_invoices') . " WHERE id = %d LIMIT 1",
                $invoice_id
            ));
        }
        if ($appointment_id > 0) {
            return self::get_appointment_invoice_by_appointment_id($appointment_id);
        }
        if (!$reference) {
            return null;
        }
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('appointment_invoices') . " WHERE payment_reference = %s LIMIT 1",
            sanitize_text_field($reference)
        ));
    }

    private static function dispatch_appointment_payment_webhook(array $payload = []): void {
        $secret = defined('NEVARI_PROXY_SIGNING_SECRET') ? trim((string) constant('NEVARI_PROXY_SIGNING_SECRET')) : trim((string) getenv('NEVARI_PROXY_SIGNING_SECRET'));
        if ($secret === '') {
            return;
        }

        $frontend_origin = rtrim(Nevari_Helpers::shared_frontend_base_url(), '/');
        if ($frontend_origin === '') {
            return;
        }

        $body = wp_json_encode(array_merge([
            'event' => 'appointment.payment_confirmed',
            'source' => 'wordpress',
            'site_url' => home_url(),
            'sent_at' => Nevari_Helpers::now(),
        ], $payload));
        if (!is_string($body) || $body === '') {
            return;
        }

        $timestamp = (string) time();
        $signature = hash_hmac('sha256', $timestamp . "\n" . $body, $secret);

        wp_remote_post($frontend_origin . '/api/customer/appointments/webhook', [
            'timeout' => 15,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-Nevari-Webhook-Timestamp' => $timestamp,
                'X-Nevari-Webhook-Signature' => $signature,
            ],
            'body' => $body,
        ]);
    }

    public static function orders_create(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'create'])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }

        $current_user_id = get_current_user_id();
        $is_store_admin = Nevari_Helpers::is_store_admin($current_user_id);
        $is_doctor = Nevari_Helpers::is_doctor($current_user_id);
        if (!$is_store_admin && !$is_doctor) {
            return Nevari_Helpers::error('forbidden', 'Only store admins or doctors can create orders.', 403);
        }

        $params = Nevari_Helpers::get_json_params($request);
        $items = [];
        if (!empty($params['items']) && is_array($params['items'])) {
            $items = array_values(array_filter(array_map(static function ($item) {
                if (!is_array($item)) {
                    return null;
                }
                $product_id = isset($item['product_id']) ? (int) $item['product_id'] : 0;
                $quantity = isset($item['quantity']) ? max(1, (int) $item['quantity']) : 0;
                return ($product_id > 0 && $quantity > 0) ? ['product_id' => $product_id, 'quantity' => $quantity] : null;
            }, $params['items'])));
        }
        if (!$items) {
            $product_id = isset($params['product_id']) ? (int) $params['product_id'] : 0;
            $quantity = isset($params['quantity']) ? max(1, (int) $params['quantity']) : 1;
            if ($product_id > 0) {
                $items[] = ['product_id' => $product_id, 'quantity' => $quantity];
            }
        }
        if (!$items) {
            return Nevari_Helpers::error('validation_error', 'At least one valid item is required.', 422);
        }

        $billing = isset($params['billing']) && is_array($params['billing']) ? $params['billing'] : [];
        $email = isset($billing['email']) ? sanitize_email((string) $billing['email']) : '';
        if (!$email) {
            return Nevari_Helpers::error('validation_error', 'Customer email is required.', 422);
        }

        $doctor_id = isset($params['doctor_user_id']) ? (int) $params['doctor_user_id'] : 0;
        if ($is_doctor) {
            $doctor_id = $current_user_id;
        }
        if ($doctor_id) {
            $doctor = get_user_by('id', $doctor_id);
            if (!$doctor || !in_array('doctor', (array) $doctor->roles, true) || get_user_meta($doctor_id, '_nevari_doctor_disabled', true)) {
                return Nevari_Helpers::error('doctor_not_found', 'Doctor not found or inactive.', 404);
            }
        }

        $customer_id = isset($params['customer_id']) ? max(0, (int) $params['customer_id']) : 0;
        $appointment_id = isset($params['appointment_id']) ? max(0, (int) $params['appointment_id']) : 0;
        $prescription_id = isset($params['prescription_id']) ? max(0, (int) $params['prescription_id']) : 0;
        $custom_email_only = !empty($params['custom_email_only']);
        $linked_prescription = $prescription_id ? self::get_prescription_row($prescription_id) : null;

        if ($is_doctor) {
            if (!$customer_id) {
                return Nevari_Helpers::error('validation_error', 'customer_id is required for doctor-created orders.', 422);
            }
            if (!Nevari_Helpers::doctor_patient_link_exists($doctor_id, $customer_id)) {
                $appointment = $appointment_id ? self::get_appointment_row($appointment_id) : null;
                if (!$appointment || (int) $appointment->doctor_user_id !== $doctor_id || (int) $appointment->patient_user_id !== $customer_id) {
                    return Nevari_Helpers::error('forbidden_patient_scope', 'Doctor can create orders only for linked patients.', 403);
                }
            }
            if ($linked_prescription && ((int) $linked_prescription->doctor_user_id !== $doctor_id || (int) $linked_prescription->patient_user_id !== $customer_id)) {
                return Nevari_Helpers::error('forbidden_prescription_scope', 'Prescription does not belong to this doctor-patient pair.', 403);
            }
        }

        $order = wc_create_order([
            'customer_id' => $customer_id,
            'created_via' => 'nevari_dashboard',
        ]);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error('order_create_failed', $order->get_error_message(), 400);
        }

        $first_name = isset($billing['first_name']) ? sanitize_text_field((string) $billing['first_name']) : '';
        $last_name = isset($billing['last_name']) ? sanitize_text_field((string) $billing['last_name']) : '';
        $phone = isset($billing['phone']) ? sanitize_text_field((string) $billing['phone']) : '';
        $address_1 = isset($billing['address_1']) ? sanitize_text_field((string) $billing['address_1']) : '';
        $city = isset($billing['city']) ? sanitize_text_field((string) $billing['city']) : '';
        $state = isset($billing['state']) ? sanitize_text_field((string) $billing['state']) : '';
        $postcode = isset($billing['postcode']) ? sanitize_text_field((string) $billing['postcode']) : '';
        $country = isset($billing['country']) ? sanitize_text_field((string) $billing['country']) : '';

        foreach ($items as $item) {
            $product = wc_get_product((int) $item['product_id']);
            if (!$product) {
                return Nevari_Helpers::error('validation_error', 'One or more items reference an invalid product_id.', 422);
            }
            $order->add_product($product, (int) $item['quantity']);
        }
        $order->set_billing_first_name($first_name);
        $order->set_billing_last_name($last_name);
        $order->set_billing_email($email);
        $order->set_billing_phone($phone);
        $order->set_billing_address_1($address_1);
        $order->set_billing_city($city);
        $order->set_billing_state($state);
        $order->set_billing_postcode($postcode);
        $order->set_billing_country($country);
        $order->set_shipping_first_name($first_name);
        $order->set_shipping_last_name($last_name);
        $order->set_shipping_address_1($address_1);
        $order->set_shipping_city($city);
        $order->set_shipping_state($state);
        $order->set_shipping_postcode($postcode);
        $order->set_shipping_country($country);

        if (!empty($params['customer_note'])) {
            $order->set_customer_note(sanitize_textarea_field((string) $params['customer_note']));
        }

        if ($doctor_id) {
            $order->update_meta_data('_nevari_assigned_doctor_user_id', $doctor_id);
            $order->update_meta_data('_nevari_assigned_at', Nevari_Helpers::now());
            if ($linked_prescription) {
                $order->update_meta_data('_nevari_rx_validation_status', 'linked');
                $order->update_meta_data('_nevari_prescription_id', (int) $linked_prescription->id);
                $order->set_status('pending');
            } else {
                $order->update_meta_data('_nevari_rx_validation_status', 'awaiting_prescription');
                $order->set_status('awaiting-prescription');
            }
        } else {
            $order->set_status(!empty($params['status']) ? sanitize_key((string) $params['status']) : 'pending');
        }

        if ($appointment_id) {
            $order->update_meta_data('_nevari_appointment_id', $appointment_id);
        }
        if ($custom_email_only) {
            $order->update_meta_data('_nevari_custom_email_only', 'yes');
        }

        $order->calculate_totals();
        $order->save();

        if ($linked_prescription) {
            global $wpdb;
            $wpdb->update(Nevari_Helpers::table('prescriptions'), [
                'order_id' => (int) $order->get_id(),
                'updated_at' => Nevari_Helpers::now(),
                'updated_by' => $current_user_id,
            ], ['id' => (int) $linked_prescription->id], ['%d', '%s', '%d'], ['%d']);
        }

        if ($custom_email_only) {
            Nevari_Plugin::instance()->send_custom_order_invoice_email((int) $order->get_id());
        }

        Nevari_Audit::log('orders', 'nevari', 'order.created', 'success', [
            'order_id' => $order->get_id(),
            'object_type' => 'shop_order',
            'object_id' => $order->get_id(),
            'related_user_id' => $doctor_id ?: null,
            'message' => 'Order created from Nevari dashboard.',
        ]);

        return Nevari_Helpers::success(self::format_order($order, true), ['created' => true], 201);
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

    public static function orders_delete(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 10, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'delete'])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }
        $order = wc_get_order((int) $request['id']);
        if (!$order) {
            return Nevari_Helpers::error('order_not_found', 'Order not found.', 404);
        }
        $order_id = (int) $order->get_id();
        $order->delete(true);
        Nevari_Audit::log('orders', 'nevari', 'order.deleted', 'success', ['order_id' => $order_id, 'object_type' => 'shop_order', 'object_id' => $order_id, 'message' => 'Order deleted from Nevari dashboard.']);
        return Nevari_Helpers::success(['deleted' => true, 'id' => $order_id]);
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
        } elseif (str_ends_with($route, '/assign-doctor')) {
            $doctor_id = isset($params['doctor_user_id']) ? (int) $params['doctor_user_id'] : 0;
            if (!$doctor_id) {
                return Nevari_Helpers::error('validation_error', 'doctor_user_id is required.', 422);
            }
            $doctor = get_user_by('id', $doctor_id);
            if (!$doctor || !in_array('doctor', (array) $doctor->roles, true) || get_user_meta($doctor_id, '_nevari_doctor_disabled', true)) {
                return Nevari_Helpers::error('doctor_not_found', 'Doctor not found or inactive.', 404);
            }
            $patient_id = (int) $order->get_user_id();
            if (!$patient_id) {
                return Nevari_Helpers::error('order_patient_missing', 'This order is not linked to a patient account.', 409);
            }
            $patient = get_user_by('id', $patient_id);

            $order->update_meta_data('_nevari_assigned_doctor_user_id', $doctor_id);
            $order->update_meta_data('_nevari_assigned_at', Nevari_Helpers::now());
            $order->update_meta_data('_nevari_rx_validation_status', 'awaiting_prescription');
            $order->set_status('awaiting-prescription', __('Doctor assigned and prescription review pending.', 'nevari-pharmacy-core'));
            Nevari_Helpers::ensure_doctor_patient_link($doctor_id, $patient_id, 'order_assignment');

            Nevari_Emails::queue_or_send([
                'template_key' => 'doctor_order_assigned',
                'recipient_user_id' => $doctor_id,
                'subject' => sprintf(__('Order %s assigned for review', 'nevari-pharmacy-core'), $order->get_order_number()),
                'body_html' => sprintf(
                    '<p>Hello %s,</p><p>Order %s has been assigned to you for %s.</p><p>Open your doctor dashboard to create a prescription or schedule an appointment.</p>',
                    esc_html($doctor->display_name),
                    esc_html($order->get_order_number()),
                    esc_html($patient ? $patient->display_name : __('the patient', 'nevari-pharmacy-core'))
                ),
                'related_object_type' => 'shop_order',
                'related_object_id' => (int) $order->get_id(),
                'variables' => [
                    'doctor_name' => $doctor->display_name,
                    'patient_name' => $patient ? $patient->display_name : __('Patient', 'nevari-pharmacy-core'),
                    'order_number' => $order->get_order_number(),
                ],
            ], false);

            Nevari_Audit::log('orders', 'nevari', 'order.doctor_assigned', 'success', [
                'order_id' => $order->get_id(),
                'object_type' => 'shop_order',
                'object_id' => $order->get_id(),
                'related_user_id' => $doctor_id,
                'message' => sprintf('Order assigned to doctor %s.', $doctor->display_name),
            ]);
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

    public static function orders_receipt(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 60, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'receipt'])) {
            return $response;
        }

        $order = self::get_viewable_order((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) ($order->get_error_data()['status'] ?? 404));
        }

        $pdf = self::build_order_receipt_pdf($order);
        return Nevari_Helpers::success([
            'filename' => sprintf('receipt-order-%s.pdf', sanitize_file_name((string) $order->get_order_number())),
            'content_type' => 'application/pdf',
            'base64' => base64_encode($pdf),
        ]);
    }

    private static function get_viewable_order(int $order_id) {
        return self::get_order_scoped($order_id);
    }

    public static function orders_details_pdf(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 60, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'details_pdf'])) {
            return $response;
        }
        $order = self::get_viewable_order((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) ($order->get_error_data()['status'] ?? 404));
        }
        $pdf = self::build_order_details_pdf($order);
        return Nevari_Helpers::success([
            'filename' => sprintf('nevari-order-details-%s.pdf', sanitize_file_name((string) $order->get_order_number())),
            'content_type' => 'application/pdf',
            'base64' => base64_encode($pdf),
        ]);
    }

    public static function orders_prescription_pdf(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_read', 60, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'prescription_pdf'])) {
            return $response;
        }
        $order = self::get_viewable_order((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) ($order->get_error_data()['status'] ?? 404));
        }
        $pdf = self::build_order_prescription_pdf($order);
        if ($pdf === '') {
            return Nevari_Helpers::error('prescription_not_found', 'No viewable prescription is linked to this order.', 404);
        }
        return Nevari_Helpers::success([
            'filename' => sprintf('nevari-prescription-%s.pdf', sanitize_file_name((string) $order->get_order_number())),
            'content_type' => 'application/pdf',
            'base64' => base64_encode($pdf),
        ]);
    }

    public static function orders_cancel(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'cancel'])) {
            return $response;
        }
        $order = self::get_viewable_order((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) ($order->get_error_data()['status'] ?? 404));
        }
        if (!Nevari_Helpers::is_store_admin() && !Nevari_Helpers::is_patient()) {
            return Nevari_Helpers::error('forbidden', 'Only patients or admins can cancel orders.', 403);
        }
        if ($order->get_status() !== 'pending') {
            return Nevari_Helpers::error('order_not_cancellable', 'Only pending orders can be cancelled.', 409);
        }
        $order->update_status('cancelled', __('Cancelled by customer from Nevari dashboard.', 'nevari-pharmacy-core'));
        return Nevari_Helpers::success(self::format_order($order, true));
    }

    public static function orders_refill(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'refill'])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }

        $user_id = Nevari_Auth::api_session_user_id();
        $order = self::get_viewable_order((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) ($order->get_error_data()['status'] ?? 404));
        }
        if ($order->get_status() !== 'completed') {
            return Nevari_Helpers::error('refill_not_available', 'Only completed orders can be refilled.', 409);
        }
        if (!class_exists('Nevari_Subscriptions') || !Nevari_Subscriptions::user_has_paid_access($user_id)) {
            return Nevari_Helpers::error('upgrade_required', 'Upgrade to Nevari Access Pro to request refills.', 403);
        }

        $items = self::refillable_order_items($order);
        if (!$items) {
            return Nevari_Helpers::error('refill_not_available', 'This order does not have any products available for refill.', 422);
        }

        $new_order = wc_create_order([
            'customer_id' => (int) $order->get_user_id(),
            'created_via' => 'nevari_refill',
        ]);
        if (is_wp_error($new_order)) {
            return Nevari_Helpers::error('order_create_failed', $new_order->get_error_message(), 400);
        }

        foreach ($items as $item) {
            $new_order->add_product($item['product'], $item['quantity']);
        }

        $billing = [
            'first_name' => $order->get_billing_first_name(),
            'last_name' => $order->get_billing_last_name(),
            'company' => $order->get_billing_company(),
            'email' => $order->get_billing_email(),
            'phone' => $order->get_billing_phone(),
            'address_1' => $order->get_billing_address_1(),
            'address_2' => $order->get_billing_address_2(),
            'city' => $order->get_billing_city(),
            'state' => $order->get_billing_state(),
            'postcode' => $order->get_billing_postcode(),
            'country' => $order->get_billing_country(),
        ];
        $shipping = [
            'first_name' => $order->get_shipping_first_name() ?: $order->get_billing_first_name(),
            'last_name' => $order->get_shipping_last_name() ?: $order->get_billing_last_name(),
            'company' => $order->get_shipping_company(),
            'address_1' => $order->get_shipping_address_1() ?: $order->get_billing_address_1(),
            'address_2' => $order->get_shipping_address_2() ?: $order->get_billing_address_2(),
            'city' => $order->get_shipping_city() ?: $order->get_billing_city(),
            'state' => $order->get_shipping_state() ?: $order->get_billing_state(),
            'postcode' => $order->get_shipping_postcode() ?: $order->get_billing_postcode(),
            'country' => $order->get_shipping_country() ?: $order->get_billing_country(),
        ];
        $new_order->set_address($billing, 'billing');
        $new_order->set_address($shipping, 'shipping');
        $new_order->set_customer_note(sprintf(
            /* translators: %s: original order number */
            __('Refill reorder from order %s.', 'nevari-pharmacy-core'),
            (string) $order->get_order_number()
        ));
        $new_order->update_meta_data('_nevari_refill_source_order_id', (int) $order->get_id());
        $new_order->set_status('pending');
        $new_order->calculate_totals();
        $new_order->save();

        Nevari_Audit::log('orders', 'nevari', 'order.refill_created', 'success', [
            'order_id' => (int) $new_order->get_id(),
            'source_order_id' => (int) $order->get_id(),
            'object_type' => 'shop_order',
            'object_id' => (int) $new_order->get_id(),
            'related_user_id' => $user_id,
            'message' => 'Refill order created from customer dashboard.',
        ]);

        return Nevari_Helpers::success(self::format_order($new_order, true), ['created' => true], 201);
    }

    public static function orders_send_receipt(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_orders_write', 10, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'send_receipt'])) {
            return $response;
        }

        $params = Nevari_Helpers::get_json_params($request);
        $order = self::get_viewable_order((int) $request['id']);
        if (is_wp_error($order)) {
            return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) ($order->get_error_data()['status'] ?? 404));
        }

        $recipient = sanitize_email((string) $order->get_billing_email());
        if (!$recipient || !is_email($recipient)) {
            return Nevari_Helpers::error('receipt_email_missing', 'This order does not have a valid customer email address.', 422);
        }

        $document_type = isset($params['document_type']) ? sanitize_key((string) $params['document_type']) : 'receipt';
        if (!in_array($document_type, ['receipt', 'invoice'], true)) {
            $document_type = 'receipt';
        }
        $payment_link = isset($params['payment_link']) ? esc_url_raw((string) $params['payment_link']) : '';
        $filename = sprintf('%s-order-%s.pdf', $document_type, sanitize_file_name((string) $order->get_order_number()));
        $pdf = $document_type === 'invoice' ? self::build_order_details_pdf($order) : self::build_order_receipt_pdf($order);
        if (!$pdf) {
            return Nevari_Helpers::error('receipt_pdf_failed', 'The receipt PDF could not be generated.', 500);
        }

        $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()) ?: 'Customer';
        $template_key = $document_type === 'invoice' ? 'order-invoice-email' : 'order-receipt-email';
        $payment_link_html = $payment_link ? sprintf('<a href="%1$s" target="_blank" rel="noopener noreferrer">Pay now</a>', esc_url($payment_link)) : '';
        $variables = [
            'customer_name' => $customer_name,
            'customer_firstname' => trim($order->get_billing_first_name()) ?: $customer_name,
            'customer_lastname' => trim($order->get_billing_last_name()),
            'order_id' => (string) $order->get_id(),
            'order_number' => (string) $order->get_order_number(),
            'order_total' => wc_price((float) $order->get_total(), ['currency' => $order->get_currency() ?: get_woocommerce_currency()]),
            'invoice_total' => wc_price((float) $order->get_total(), ['currency' => $order->get_currency() ?: get_woocommerce_currency()]),
            'payment_link' => $payment_link,
            'payment_link_html' => $payment_link_html,
            'document_type' => $document_type,
            'document_title' => $document_type === 'invoice' ? 'Invoice' : 'Receipt',
            'site_name' => wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES),
            'support_email' => get_option('admin_email'),
        ];

        $result = Nevari_Emails::queue_or_send([
            'template_key' => $template_key,
            'recipient_email' => $recipient,
            'related_object_type' => 'order',
            'related_object_id' => $order->get_id(),
            'subject' => $document_type === 'invoice'
                ? sprintf('Invoice for order #%s', $order->get_order_number())
                : sprintf('Receipt for order #%s', $order->get_order_number()),
            'body_html' => sprintf(
                '<p>Hello %s,</p><p>Your %s for order <strong>#%s</strong> is attached.</p>%s<p>Thank you for shopping with %s.</p>',
                esc_html($customer_name),
                esc_html($document_type === 'invoice' ? 'invoice' : 'receipt'),
                esc_html((string) $order->get_order_number()),
                $payment_link_html ? '<p>' . $payment_link_html . '</p>' : '',
                esc_html(wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES))
            ),
            'body_text' => sprintf(
                'Hello %s, your %s for order #%s is attached.%s Thank you for shopping with %s.',
                $customer_name,
                $document_type === 'invoice' ? 'invoice' : 'receipt',
                (string) $order->get_order_number(),
                $payment_link ? ' Pay now: ' . $payment_link : '',
                wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES)
            ),
            'attachments' => [[
                'filename' => $filename,
                'content_type' => 'application/pdf',
                'mime_type' => 'application/pdf',
                'base64' => base64_encode($pdf),
                'content' => base64_encode($pdf),
            ]],
            'variables' => $variables,
        ], true);

        if (is_wp_error($result)) {
            Nevari_Audit::log('emails', 'nevari', 'receipt.send_failed', 'error', [
                'order_id' => $order->get_id(),
                'message' => $result->get_error_message(),
            ]);
            return Nevari_Helpers::error('receipt_send_failed', $result->get_error_message(), 500);
        }

        Nevari_Audit::log('emails', 'nevari', 'receipt.sent', 'success', [
            'order_id' => $order->get_id(),
            'message' => 'Receipt PDF sent to customer.',
        ]);

        return Nevari_Helpers::success([
            'recipient_email' => $recipient,
            'status' => 'sent',
        ]);
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
            if ((int) $order->get_meta('_nevari_assigned_doctor_user_id') === get_current_user_id()) {
                return $order;
            }
            $prescription_id = (int) $order->get_meta('_nevari_prescription_id');
            $prescription = $prescription_id ? self::get_prescription_row($prescription_id) : null;
            if ($prescription && Nevari_Helpers::can_view_prescription($prescription)) {
                return $order;
            }
        }
        return new WP_Error('forbidden', 'You cannot view this order.', ['status' => 403]);
    }

    public static function patient_owned_order_required(WP_REST_Request $request) {
        if (!Nevari_Auth::api_session_required()) {
            return new WP_Error('rest_forbidden', 'A valid patient session is required.', ['status' => 401]);
        }

        $user_id = Nevari_Auth::api_session_user_id();
        if ($user_id <= 0 || !Nevari_Helpers::is_patient($user_id)) {
            return new WP_Error('rest_forbidden', 'Only patients can refill orders.', ['status' => 403]);
        }
        if (!self::woo_available()) {
            return new WP_Error('woocommerce_missing', 'WooCommerce is required.', ['status' => 503]);
        }

        $order = wc_get_order(absint($request['id']));
        if (!$order) {
            return new WP_Error('order_not_found', 'Order not found.', ['status' => 404]);
        }
        if ((int) $order->get_user_id() !== $user_id) {
            return new WP_Error('forbidden', 'You cannot refill this order.', ['status' => 403]);
        }

        return true;
    }

    private static function refillable_order_items($order): array {
        $items = [];
        if (!$order || !method_exists($order, 'get_items')) {
            return $items;
        }

        foreach ($order->get_items() as $item) {
            if (!is_object($item) || !method_exists($item, 'get_quantity')) {
                continue;
            }
            $product = method_exists($item, 'get_product') ? $item->get_product() : null;
            if (!$product && function_exists('wc_get_product')) {
                $product_id = method_exists($item, 'get_variation_id') && (int) $item->get_variation_id() > 0
                    ? (int) $item->get_variation_id()
                    : (method_exists($item, 'get_product_id') ? (int) $item->get_product_id() : 0);
                $product = $product_id > 0 ? wc_get_product($product_id) : null;
            }
            if (!$product || (method_exists($product, 'is_purchasable') && !$product->is_purchasable())) {
                continue;
            }
            $quantity = max(1, (int) ceil((float) $item->get_quantity()));
            $items[] = [
                'product' => $product,
                'quantity' => $quantity,
            ];
        }

        return $items;
    }

    private static function format_order($order, bool $include_items = false): array {
        $assigned_doctor_id = (int) $order->get_meta('_nevari_assigned_doctor_user_id');
        $assigned_doctor = $assigned_doctor_id ? get_user_by('id', $assigned_doctor_id) : null;
        $customer_user_id = (int) $order->get_user_id();
        $customer_user = $customer_user_id ? get_userdata($customer_user_id) : null;
        $account_first = $customer_user_id ? trim((string) get_user_meta($customer_user_id, 'first_name', true)) : '';
        $account_last = $customer_user_id ? trim((string) get_user_meta($customer_user_id, 'last_name', true)) : '';
        $account_name = trim($account_first . ' ' . $account_last);
        if (!$account_name && $customer_user) {
            $account_name = trim((string) $customer_user->display_name);
        }
        $items = $order->get_items();
        $refillable_items = self::refillable_order_items($order);
        $billing_first = trim((string) $order->get_billing_first_name());
        $billing_last = trim((string) $order->get_billing_last_name());
        $shipping_first = trim((string) $order->get_shipping_first_name());
        $shipping_last = trim((string) $order->get_shipping_last_name());
        $billing_name = trim($billing_first . ' ' . $billing_last);
        $shipping_name = trim($shipping_first . ' ' . $shipping_last);
        $customer_name = $billing_name ?: $shipping_name ?: $account_name ?: trim((string) $order->get_billing_email());
        $items_summary = [];
        foreach ($items as $item) {
            $items_summary[] = wp_strip_all_tags($item->get_name());
        }
        $branded_payment_url = $order->needs_payment() ? self::branded_invoice_payment_url($order) : null;
        $woocommerce_payment_url = $order->needs_payment() ? $order->get_checkout_payment_url(false) : null;
        $data = [
            'id' => $order->get_id(),
            'number' => $order->get_order_number(),
            'invoice_number' => self::invoice_number_for_order($order),
            'status' => $order->get_status(),
            'currency' => $order->get_currency(),
            'total' => $order->get_total(),
            'payment_status' => $order->get_date_paid() ? 'completed' : $order->get_status(),
            // Backend-issued branded invoice URL is the canonical payment link exposed to frontends.
            'payment_url' => $branded_payment_url,
            'branded_payment_url' => $branded_payment_url,
            'payment_token' => $order->needs_payment() ? self::invoice_payment_token($order) : null,
            'woocommerce_payment_url' => $woocommerce_payment_url,
            'customer_id' => $order->get_user_id(),
            'customer_name' => $customer_name ?: null,
            'customer_display_name' => $account_name ?: null,
            'customer_first_name' => $billing_first ?: $account_first ?: null,
            'customer_last_name' => $billing_last ?: $account_last ?: null,
            'customer_email' => $order->get_billing_email() ?: null,
            'billing' => [
                'first_name' => $billing_first,
                'last_name' => $billing_last,
                'email' => $order->get_billing_email(),
                'phone' => $order->get_billing_phone(),
                'company' => $order->get_billing_company(),
                'address_1' => $order->get_billing_address_1(),
                'address_2' => $order->get_billing_address_2(),
                'city' => $order->get_billing_city(),
                'state' => $order->get_billing_state(),
                'postcode' => $order->get_billing_postcode(),
                'country' => $order->get_billing_country(),
            ],
            'rx_status' => $order->get_meta('_nevari_rx_validation_status') ?: null,
            'prescription_id' => $order->get_meta('_nevari_prescription_id') ? (int) $order->get_meta('_nevari_prescription_id') : null,
            'assigned_doctor_user_id' => $assigned_doctor_id ?: null,
            'assigned_doctor' => $assigned_doctor ? [
                'user_id' => (int) $assigned_doctor->ID,
                'display_name' => $assigned_doctor->display_name,
                'email' => $assigned_doctor->user_email,
            ] : null,
            'totals' => [
                'subtotal' => self::order_subtotal($order, $items),
                'discount_total' => (float) $order->get_discount_total(),
                'shipping_total' => (float) $order->get_shipping_total(),
                'shipping_tax' => (float) $order->get_shipping_tax(),
                'tax_total' => (float) $order->get_total_tax(),
                'fees_total' => self::order_fees_total($order),
                'grand_total' => (float) $order->get_total(),
                'items_count' => (int) $order->get_item_count(),
                'items_quantity' => array_reduce($items, static function ($carry, $item) {
                    return $carry + (float) $item->get_quantity();
                }, 0),
            ],
            'items_count' => (int) $order->get_item_count(),
            'items_quantity' => array_reduce($items, static function ($carry, $item) {
                return $carry + (float) $item->get_quantity();
            }, 0),
            'can_refill' => $order->get_status() === 'completed' && !empty($refillable_items),
            'refill_available' => $order->get_status() === 'completed' && !empty($refillable_items),
            'items_summary' => $items_summary,
            'created_at' => $order->get_date_created() ? $order->get_date_created()->date('c') : null,
            'updated_at' => $order->get_date_modified() ? $order->get_date_modified()->date('c') : null,
        ];
        if ($include_items) {
            $notes = [];
            foreach ($order->get_customer_order_notes() as $note) {
                $notes[] = [
                    'id' => (int) $note->id,
                    'content' => wp_strip_all_tags($note->content),
                    'created_at' => isset($note->date_created) && $note->date_created ? $note->date_created->date('c') : null,
                ];
            }
            $data['customer_note'] = $order->get_customer_note();
            $data['shipping'] = [
                'first_name' => $order->get_shipping_first_name(),
                'last_name' => $order->get_shipping_last_name(),
                'company' => $order->get_shipping_company(),
                'address_1' => $order->get_shipping_address_1(),
                'address_2' => $order->get_shipping_address_2(),
                'city' => $order->get_shipping_city(),
                'state' => $order->get_shipping_state(),
                'postcode' => $order->get_shipping_postcode(),
                'country' => $order->get_shipping_country(),
            ];
            $data['order_notes'] = $notes;
            $data['items'] = [];
            foreach ($order->get_items() as $item) {
                try {
                    $product = $item->get_product();
                    $quantity = (float) $item->get_quantity();
                    $line_total = (float) $item->get_total();
                    $line_subtotal = (float) $item->get_subtotal();
                    $unit_price = $quantity > 0 ? $line_subtotal / $quantity : $line_subtotal;
                    $image_url = null;
                    if ($product && $product->get_image_id()) {
                        $image_url = wp_get_attachment_image_url($product->get_image_id(), 'thumbnail') ?: null;
                    }
                    $data['items'][] = [
                        'id' => $item->get_id(),
                        'product_id' => $item->get_product_id(),
                        'variation_id' => $item->get_variation_id(),
                        'name' => $item->get_name(),
                        'sku' => $product ? $product->get_sku() : '',
                        'quantity' => $quantity,
                        'subtotal' => $line_subtotal,
                        'discount_total' => max(0, $line_subtotal - $line_total),
                        'unit_price' => $unit_price,
                        'total' => $line_total,
                        'tax_total' => (float) $item->get_total_tax(),
                        'stock_status' => $product ? $product->get_stock_status() : null,
                        'image_url' => $image_url,
                        'rx_required' => $item->get_meta('_nevari_rx_required') === 'yes',
                        'prescription_id' => $item->get_meta('_nevari_prescription_id') ? (int) $item->get_meta('_nevari_prescription_id') : null,
                    ];
                } catch (Throwable $exception) {
                    error_log(sprintf( // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
                        'Nevari format_order item failed for order %d item %d: %s in %s:%d',
                        (int) $order->get_id(),
                        is_object($item) && method_exists($item, 'get_id') ? (int) $item->get_id() : 0,
                        $exception->getMessage(),
                        $exception->getFile(),
                        $exception->getLine()
                    ));
                }
            }
        }
        return $data;
    }

    private static function get_appointment_invoice_by_invoice_number(string $invoice_number) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('appointment_invoices') . " WHERE invoice_number = %s LIMIT 1",
            sanitize_text_field($invoice_number)
        ));
    }

    private static function get_appointment_invoice_by_appointment_id(int $appointment_id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('appointment_invoices') . " WHERE appointment_id = %d LIMIT 1",
            $appointment_id
        ));
    }

    private static function appointment_invoice_payment_token_is_valid($invoice, string $token): bool {
        if (!$invoice || !$token || strpos($token, '.') === false) {
            return false;
        }
        [$encoded, $signature] = explode('.', $token, 2);
        $provided = Nevari_Helpers::base64url_decode($signature);
        $expected = hash_hmac('sha256', $encoded, Nevari_Helpers::jwt_secret(), true);
        if (!$provided || !hash_equals($expected, $provided)) {
            return false;
        }
        $payload = json_decode(Nevari_Helpers::base64url_decode($encoded), true);
        return is_array($payload)
            && ($payload['purpose'] ?? '') === 'appointment_invoice_payment'
            && (int) ($payload['invoice_id'] ?? 0) === (int) $invoice->id
            && (int) ($payload['appointment_id'] ?? 0) === (int) $invoice->appointment_id
            && (string) ($payload['invoice_number'] ?? '') === (string) $invoice->invoice_number
            && (int) ($payload['exp'] ?? 0) >= time();
    }

    private static function validated_appointment_payment_callback_url(string $candidate, $invoice, string $payment_token) {
        $callback_url = esc_url_raw($candidate);
        $frontend = Nevari_Connections::resolve_request_frontend();
        if (!$callback_url || !$frontend) {
            return new WP_Error('invalid_callback_url', 'Payment callback URL must be provided by an authorized frontend request.');
        }
        $origin = Nevari_Connections::normalize_origin($callback_url);
        $parts = wp_parse_url($callback_url);
        $expected_path = '/pay/' . rawurlencode((string) $invoice->invoice_number);
        $query = [];
        if (!empty($parts['query'])) {
            parse_str((string) $parts['query'], $query);
        }
        if ($origin !== $frontend['frontend_origin']
            || ($parts['path'] ?? '') !== $expected_path
            || !hash_equals($payment_token, sanitize_text_field((string) ($query['payment_token'] ?? '')))) {
            return new WP_Error('invalid_callback_url', 'Payment callback URL is not valid for this invoice.');
        }
        return $callback_url;
    }

    private static function appointment_invoice_payment_data($invoice): array {
        $appointment = self::get_appointment_row((int) $invoice->appointment_id);
        $doctor = $appointment ? get_user_by('id', (int) $appointment->doctor_user_id) : null;
        $patient = $appointment ? get_user_by('id', (int) $appointment->patient_user_id) : null;
        $amount = (float) $invoice->amount;
        $paid = (string) $invoice->status === 'paid';
        $payable = self::appointment_invoice_is_payable($appointment, $invoice);
        $customer_name = (string) ($invoice->customer_name ?: ($patient ? $patient->display_name : 'Customer'));
        return [
            'entity_type' => 'appointment',
            'appointment_id' => (int) $invoice->appointment_id,
            'invoice_id' => (int) $invoice->id,
            'invoice_number' => (string) $invoice->invoice_number,
            'payment_status' => (string) $invoice->status,
            'order_status' => $paid ? 'completed' : ($payable ? 'pending' : 'failed'),
            'customer' => [
                'name' => $customer_name,
                'email' => (string) ($invoice->customer_email ?: ($patient ? $patient->user_email : '')),
                'phone' => $patient ? (string) get_user_meta((int) $patient->ID, 'billing_phone', true) : '',
            ],
            'items' => [[
                'name' => $doctor ? sprintf('Consultation with %s', $doctor->display_name) : 'Consultation booking',
                'qty' => 1,
                'rate' => $amount,
                'tax' => 0,
                'discount' => 0,
                'total' => $amount,
            ]],
            'totals' => [
                'subtotal' => $amount,
                'discount' => 0,
                'tax' => 0,
                'shipping' => 0,
                'total' => $amount,
                'amount_paid' => $paid ? $amount : 0.0,
                'balance_due' => $paid || !$payable ? 0.0 : $amount,
            ],
            'total' => $amount,
            'currency' => (string) $invoice->currency,
            'store_currency' => (string) $invoice->currency,
            'available_gateways' => $payable ? self::available_invoice_gateways() : [],
            'payment_token' => Nevari_Helpers::appointment_invoice_payment_token($invoice),
            'branded_payment_url' => (string) Nevari_Helpers::appointment_invoice_payment_url($invoice),
            'payment_url' => (string) Nevari_Helpers::appointment_invoice_payment_url($invoice),
            'checkout_url' => (string) Nevari_Helpers::appointment_invoice_payment_url($invoice),
            'doctor_name' => $doctor ? (string) $doctor->display_name : '',
            'doctor_notes' => $appointment ? (string) ($appointment->doctor_notes ?? '') : '',
        ];
    }

    private static function appointment_invoice_is_payable($appointment, $invoice): bool {
        if (!$appointment || !$invoice) {
            return false;
        }
        if ((string) ($invoice->status ?? '') === 'paid' || (string) ($appointment->payment_status ?? '') === 'paid') {
            return false;
        }
        if ((string) ($appointment->status ?? '') !== 'awaiting_payment' || (string) ($appointment->payment_status ?? '') !== 'pending') {
            return false;
        }
        $reserved_until = (string) ($appointment->reserved_until ?? '');
        return $reserved_until === '' || strtotime($reserved_until . ' UTC') > time();
    }

    private static function create_or_refresh_appointment_invoice(int $appointment_id, int $patient_id, int $doctor_id, float $amount): ?object {
        global $wpdb;

        $table = Nevari_Helpers::table('appointment_invoices');
        $existing = self::get_appointment_invoice_by_appointment_id($appointment_id);
        $patient = get_user_by('id', $patient_id);
        $customer_name = $patient ? $patient->display_name : 'Customer';
        $customer_email = $patient ? $patient->user_email : '';
        $now = Nevari_Helpers::now();

        if ($existing) {
            $wpdb->update($table, [
                'patient_user_id' => $patient_id,
                'doctor_user_id' => $doctor_id,
                'amount' => $amount,
                'currency' => self::store_currency(),
                'customer_name' => $customer_name,
                'customer_email' => $customer_email,
                'updated_at' => $now,
            ], ['id' => (int) $existing->id], ['%d', '%d', '%f', '%s', '%s', '%s', '%s'], ['%d']);
            return self::get_appointment_invoice_by_appointment_id($appointment_id);
        }

        $wpdb->insert($table, [
            'appointment_id' => $appointment_id,
            'patient_user_id' => $patient_id,
            'doctor_user_id' => $doctor_id,
            'invoice_number' => '',
            'amount' => $amount,
            'currency' => self::store_currency(),
            'status' => 'pending',
            'customer_name' => $customer_name,
            'customer_email' => $customer_email,
            'created_at' => $now,
            'updated_at' => $now,
        ], ['%d', '%d', '%d', '%s', '%f', '%s', '%s', '%s', '%s', '%s', '%s']);
        $invoice_id = (int) $wpdb->insert_id;
        if ($invoice_id < 1) {
            return null;
        }
        $invoice_number = Nevari_Helpers::appointment_invoice_number($invoice_id);
        $wpdb->update($table, ['invoice_number' => $invoice_number], ['id' => $invoice_id], ['%s'], ['%d']);
        return self::get_appointment_invoice_by_appointment_id($appointment_id);
    }

    private static function invoice_number_for_order($order): string {
        return 'NVH-INV-' . str_pad((string) $order->get_order_number(), 5, '0', STR_PAD_LEFT);
    }

    private static function branded_invoice_payment_url($order): string {
        return add_query_arg(
            ['payment_token' => self::invoice_payment_token($order)],
            Nevari_Helpers::payment_frontend_origin() . '/pay/' . rawurlencode(self::invoice_number_for_order($order))
        );
    }

    private static function documents_url_for_order($order): string {
        return home_url('/admin/orders/' . rawurlencode((string) $order->get_id()) . '/documents');
    }

    private static function get_order_for_invoice_number(string $invoice_number) {
        $invoice_number = sanitize_text_field($invoice_number);
        $order_id = 0;
        if (preg_match('/(\d+)$/', $invoice_number, $matches)) {
            $order_id = (int) ltrim($matches[1], '0');
        }
        return $order_id > 0 ? wc_get_order($order_id) : null;
    }

    private static function invoice_payment_token($order): string {
        $payload = [
            'purpose' => 'invoice_payment',
            'order_id' => (int) $order->get_id(),
            'invoice_number' => self::invoice_number_for_order($order),
            'exp' => time() + (int) apply_filters('nevari_invoice_payment_token_ttl', 7 * DAY_IN_SECONDS),
        ];
        $encoded = Nevari_Helpers::base64url_encode(wp_json_encode($payload));
        $signature = Nevari_Helpers::base64url_encode(hash_hmac('sha256', $encoded, Nevari_Helpers::jwt_secret(), true));
        return $encoded . '.' . $signature;
    }

    private static function payment_token_from_request(WP_REST_Request $request, ?array $params = null): string {
        $params = $params ?? Nevari_Helpers::get_json_params($request);
        $token = $request->get_param('payment_token');
        if (!$token && !empty($params['payment_token'])) {
            $token = $params['payment_token'];
        }
        return sanitize_text_field((string) $token);
    }

    private static function invoice_payment_token_is_valid($order, string $token): bool {
        if (!$token || strpos($token, '.') === false) {
            return false;
        }
        [$encoded, $signature] = explode('.', $token, 2);
        $provided = Nevari_Helpers::base64url_decode($signature);
        $expected = hash_hmac('sha256', $encoded, Nevari_Helpers::jwt_secret(), true);
        if (!$provided || !hash_equals($expected, $provided)) {
            return false;
        }
        $payload = json_decode(Nevari_Helpers::base64url_decode($encoded), true);
        return is_array($payload)
            && ($payload['purpose'] ?? '') === 'invoice_payment'
            && (int) ($payload['order_id'] ?? 0) === (int) $order->get_id()
            && (string) ($payload['invoice_number'] ?? '') === self::invoice_number_for_order($order)
            && (int) ($payload['exp'] ?? 0) >= time();
    }

    private static function validated_payment_callback_url(string $candidate, $order, string $payment_token) {
        $callback_url = esc_url_raw($candidate);
        $frontend = Nevari_Connections::resolve_request_frontend();
        if (!$callback_url || !$frontend) {
            return new WP_Error('invalid_callback_url', 'Payment callback URL must be provided by an authorized frontend request.');
        }
        $origin = Nevari_Connections::normalize_origin($callback_url);
        $parts = wp_parse_url($callback_url);
        $expected_path = '/pay/' . rawurlencode(self::invoice_number_for_order($order));
        $query = [];
        if (!empty($parts['query'])) {
            parse_str((string) $parts['query'], $query);
        }
        if ($origin !== $frontend['frontend_origin']
            || ($parts['path'] ?? '') !== $expected_path
            || !hash_equals($payment_token, sanitize_text_field((string) ($query['payment_token'] ?? '')))) {
            return new WP_Error('invalid_callback_url', 'Payment callback URL is not valid for this invoice.');
        }
        return $callback_url;
    }

    private static function invoice_payment_data($order): array {
        $items = $order->get_items();
        $total = (float) $order->get_total();
        $amount_paid = $order->get_date_paid() ? $total : 0.0;
        $balance_due = max(0.0, $total - $amount_paid);
        $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
        $customer_name = $customer_name ?: $order->get_formatted_billing_full_name();
        $line_items = [];
        foreach ($items as $item) {
            $quantity = max(1, (int) $item->get_quantity());
            $line_total = (float) $item->get_total();
            $line_items[] = [
                'name' => (string) $item->get_name(),
                'qty' => $quantity,
                'rate' => $quantity > 0 ? $line_total / $quantity : $line_total,
                'tax' => (float) $item->get_total_tax(),
                'discount' => 0,
                'total' => $line_total + (float) $item->get_total_tax(),
            ];
        }
        return [
            'order_id' => (int) $order->get_id(),
            'order_number' => (string) $order->get_order_number(),
            'invoice_number' => self::invoice_number_for_order($order),
            'payment_status' => $order->get_date_paid() ? 'paid' : ($order->needs_payment() ? 'unpaid' : $order->get_status()),
            'order_status' => (string) $order->get_status(),
            'customer' => [
                'name' => $customer_name ?: 'Customer',
                'email' => (string) $order->get_billing_email(),
                'phone' => (string) $order->get_billing_phone(),
            ],
            'items' => $line_items,
            'totals' => [
                'subtotal' => self::order_subtotal($order, $items),
                'discount' => (float) $order->get_discount_total(),
                'tax' => (float) $order->get_total_tax(),
                'shipping' => (float) $order->get_shipping_total() + (float) $order->get_shipping_tax(),
                'total' => $total,
                'amount_paid' => $amount_paid,
                'balance_due' => $balance_due,
            ],
            'currency' => self::store_currency(),
            'store_currency' => self::store_currency(),
            'available_gateways' => self::available_invoice_gateways(),
            'payment_token' => self::invoice_payment_token($order),
            'branded_payment_url' => self::branded_invoice_payment_url($order),
            'woocommerce_payment_url' => $order->needs_payment() ? $order->get_checkout_payment_url(false) : '',
        ];
    }

    private static function available_invoice_gateways(): array {
        $gateways = [];
        if (Nevari_Paystack::is_configured()) {
            $gateways[] = 'paystack';
        }
        $settings = Nevari_Helpers::payment_gateway_settings();
        if (!empty($settings['flutterwave']['secret_key'])) {
            $gateways[] = 'flutterwave';
        }
        if (!empty($settings['stripe']['secret_key'])) {
            $gateways[] = 'stripe';
        }
        return $gateways;
    }

    private static function invoice_payment_reference($order, string $gateway): string {
        return sprintf('NVH-%d-%s-%s', (int) $order->get_id(), strtoupper($gateway), wp_generate_password(8, false, false));
    }

    private static function initialize_gateway_payment(string $gateway, $order, string $reference, string $callback_url, array $metadata, array $settings) {
        $amount = (float) $order->get_total();
        $currency = $order->get_currency() ?: get_woocommerce_currency();
        $email = $order->get_billing_email() ?: get_option('admin_email');
        $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name());
        return self::initialize_gateway_payment_raw(
            $gateway,
            $reference,
            $callback_url,
            $metadata,
            $settings,
            $amount,
            $currency,
            $email,
            $customer_name,
            'Invoice ' . self::invoice_number_for_order($order)
        );
    }

    private static function initialize_gateway_payment_raw(string $gateway, string $reference, string $callback_url, array $metadata, array $settings, float $amount, string $currency, string $email, string $customer_name, string $title) {
        if ($gateway === 'paystack') {
            return Nevari_Paystack::initialize_payment(
                $reference,
                $callback_url,
                $metadata,
                $amount,
                $currency,
                $email,
                $customer_name,
                $title
            );
        }

        if ($gateway === 'flutterwave') {
            $response = wp_remote_post('https://api.flutterwave.com/v3/payments', [
                'headers' => [
                    'Authorization' => 'Bearer ' . (string) $settings['flutterwave']['secret_key'],
                    'Content-Type' => 'application/json',
                ],
                'body' => wp_json_encode([
                    'tx_ref' => $reference,
                    'amount' => $amount,
                    'currency' => $currency,
                    'redirect_url' => $callback_url,
                    'customer' => ['email' => $email, 'name' => $customer_name],
                    'meta' => $metadata,
                    'customizations' => ['title' => $title],
                ]),
                'timeout' => 30,
            ]);
            return self::payment_init_response($gateway, $reference, $response, ['data', 'link']);
        }

        if ($gateway === 'stripe') {
            $body = [
                'mode' => 'payment',
                'success_url' => add_query_arg(['gateway' => 'stripe'], $callback_url) . '&reference={CHECKOUT_SESSION_ID}',
                'cancel_url' => $callback_url,
                'client_reference_id' => $reference,
                'customer_email' => $email,
                'line_items[0][price_data][currency]' => strtolower($currency),
                'line_items[0][price_data][product_data][name]' => $title,
                'line_items[0][price_data][unit_amount]' => (int) round($amount * 100),
                'line_items[0][quantity]' => 1,
            ];
            foreach ($metadata as $key => $value) {
                $body['metadata[' . $key . ']'] = (string) $value;
            }
            $response = wp_remote_post('https://api.stripe.com/v1/checkout/sessions', [
                'headers' => ['Authorization' => 'Bearer ' . (string) $settings['stripe']['secret_key']],
                'body' => $body,
                'timeout' => 30,
            ]);
            return self::payment_init_response($gateway, $reference, $response, ['url'], ['reference_key' => 'id']);
        }

        return new WP_Error('invalid_gateway', 'Unsupported gateway.');
    }

    private static function payment_init_response(string $gateway, string $reference, $response, array $url_path, array $options = []) {
        if (is_wp_error($response)) {
            return $response;
        }
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($body)) {
            return new WP_Error('gateway_response_invalid', 'Gateway returned an invalid response.');
        }
        $cursor = $body;
        foreach ($url_path as $segment) {
            $cursor = is_array($cursor) && array_key_exists($segment, $cursor) ? $cursor[$segment] : null;
        }
        if (!$cursor) {
            return new WP_Error('gateway_initialize_failed', 'Gateway did not return a payment URL.');
        }
        $reference_key = $options['reference_key'] ?? null;
        return [
            'gateway' => $gateway,
            'payment_url' => esc_url_raw((string) $cursor),
            'reference' => $reference_key && isset($body[$reference_key]) ? sanitize_text_field((string) $body[$reference_key]) : $reference,
        ];
    }

    private static function verify_gateway_payment(string $gateway, string $reference, $order) {
        $stored_gateway = sanitize_key((string) $order->get_meta('_nevari_invoice_payment_gateway'));
        $stored_reference = sanitize_text_field((string) $order->get_meta('_nevari_invoice_payment_reference'));
        if (!$stored_gateway || !$stored_reference
            || !hash_equals($stored_gateway, $gateway)
            || !hash_equals($stored_reference, $reference)) {
            return new WP_Error('payment_context_mismatch', 'Payment does not match the initialized order transaction.');
        }
        return self::verify_gateway_payment_raw(
            $gateway,
            $reference,
            $stored_reference,
            (float) $order->get_total(),
            strtoupper((string) ($order->get_currency() ?: get_woocommerce_currency())),
            ['order_id' => (int) $order->get_id()],
            (string) $order->get_billing_email()
        );
    }

    private static function verify_gateway_payment_raw(string $gateway, string $reference, string $stored_reference, float $expected_amount, string $expected_currency, array $metadata, string $email = '') {
        if (!$stored_reference || !hash_equals($stored_reference, $reference)) {
            return new WP_Error('payment_context_mismatch', 'Payment does not match the initialized transaction.');
        }
        if ($gateway === 'paystack') {
            return Nevari_Paystack::verify_payment(
                $reference,
                $expected_amount,
                $expected_currency,
                $metadata
            );
        }
        $settings = Nevari_Helpers::payment_gateway_settings();
        if ($gateway === 'flutterwave') {
            $response = wp_remote_get('https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' . rawurlencode($reference), [
                'headers' => ['Authorization' => 'Bearer ' . (string) $settings['flutterwave']['secret_key']],
                'timeout' => 30,
            ]);
            return self::verify_gateway_response_raw($response, ['data', 'status'], 'successful', ['data', 'tx_ref'], ['data', 'amount'], 1, ['data', 'currency'], ['data', 'meta'], $expected_amount, $expected_currency, $metadata);
        }
        if ($gateway === 'stripe') {
            $response = wp_remote_get('https://api.stripe.com/v1/checkout/sessions/' . rawurlencode($reference), [
                'headers' => ['Authorization' => 'Bearer ' . (string) $settings['stripe']['secret_key']],
                'timeout' => 30,
            ]);
            return self::verify_gateway_response_raw($response, ['payment_status'], 'paid', ['id'], ['amount_total'], 100, ['currency'], ['metadata'], $expected_amount, $expected_currency, $metadata);
        }
        return new WP_Error('invalid_gateway', 'Unsupported gateway.');
    }

    private static function verify_gateway_response(string $gateway, string $reference, $order, $response, array $status_path, string $paid_value, array $transaction_path, array $amount_path, int $amount_divisor, array $currency_path, array $order_id_path) {
        $result = self::verify_gateway_response_raw(
            $response,
            $status_path,
            $paid_value,
            $transaction_path,
            $amount_path,
            $amount_divisor,
            $currency_path,
            ['data', 'metadata'],
            (float) $order->get_total(),
            strtoupper((string) ($order->get_currency() ?: get_woocommerce_currency())),
            ['order_id' => (int) $order->get_id()]
        );
        if (is_wp_error($result)) {
            return $result;
        }
        $transaction_id = (string) ($result['transaction_id'] ?? $reference);
        self::complete_order_payment($order, $gateway, $transaction_id);
        return ['paid' => true, 'transaction_id' => $transaction_id];
    }

    private static function verify_gateway_response_raw($response, array $status_path, string $paid_value, array $transaction_path, array $amount_path, int $amount_divisor, array $currency_path, array $metadata_path, float $expected_amount, string $expected_currency, array $expected_metadata) {
        if (is_wp_error($response)) {
            return $response;
        }
        $body = json_decode((string) wp_remote_retrieve_body($response), true);
        if (!is_array($body)) {
            return new WP_Error('gateway_response_invalid', 'Gateway verification returned an invalid response.');
        }
        $status = self::array_path($body, $status_path);
        if ((string) $status !== $paid_value) {
            return new WP_Error('payment_not_verified', 'Gateway has not verified this payment as successful.');
        }
        $transaction_id = (string) (self::array_path($body, $transaction_path) ?: '');
        if ($transaction_id === '') {
            return new WP_Error('payment_reference_mismatch', 'Gateway payment reference is missing.');
        }
        $paid_amount = ((float) self::array_path($body, $amount_path)) / max(1, $amount_divisor);
        if (abs($paid_amount - $expected_amount) > 0.00001) {
            return new WP_Error('payment_amount_mismatch', 'Gateway payment amount does not match this invoice.');
        }
        $currency = strtoupper((string) self::array_path($body, $currency_path));
        if (!$currency || !hash_equals(strtoupper($expected_currency), $currency)) {
            return new WP_Error('payment_currency_mismatch', 'Gateway payment currency does not match this invoice.');
        }
        $metadata = self::array_path($body, $metadata_path);
        if (!is_array($metadata)) {
            $metadata = [];
        }
        foreach ($expected_metadata as $key => $value) {
            if ((string) ($metadata[$key] ?? '') !== (string) $value) {
                return new WP_Error('payment_metadata_mismatch', 'Gateway payment metadata does not match this invoice.');
            }
        }
        return ['paid' => true, 'transaction_id' => $transaction_id];
    }

    private static function complete_order_payment($order, string $gateway, string $transaction_id): void {
        $stored_reference = sanitize_text_field((string) $order->get_meta('_nevari_invoice_payment_reference'));
        if ($order->needs_payment()) {
            $order->payment_complete($transaction_id);
        }
        $order->set_transaction_id($transaction_id);
        $order->update_meta_data('_nevari_invoice_payment_gateway', $gateway);
        if ($stored_reference !== '') {
            $order->update_meta_data('_nevari_invoice_payment_reference', $stored_reference);
        }
        $order->add_order_note(sprintf('Payment completed via invoice Pay Now link. Gateway: %s. Reference: %s', ucfirst($gateway), $transaction_id));
        $order->save();
    }

    private static function role_management_routes(): void {
        register_rest_route(NEVARI_PHARMACY_REST_NS, '/admin/users/(?P<id>\d+)/role', [
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => [__CLASS__, 'admin_users_change_role'],
            'permission_callback' => [__CLASS__, 'store_admin_required'],
        ]);
    }

    private static function array_path(array $data, array $path) {
        $cursor = $data;
        foreach ($path as $segment) {
            if (!is_array($cursor) || !array_key_exists($segment, $cursor)) {
                return null;
            }
            $cursor = $cursor[$segment];
        }
        return $cursor;
    }

    private static function gateway_webhook_signature_valid(string $gateway, WP_REST_Request $request, string $raw_body): bool {
        $settings = Nevari_Helpers::payment_gateway_settings();
        if ($gateway === 'paystack') {
            return Nevari_Paystack::webhook_signature_valid($request, $raw_body);
        }
        if ($gateway === 'flutterwave') {
            $secret = (string) $settings['flutterwave']['webhook_secret'];
            $signature = (string) $request->get_header('secret-hash');
            return $secret && $signature && hash_equals($secret, $signature);
        }
        if ($gateway === 'stripe') {
            $secret = (string) $settings['stripe']['webhook_secret'];
            if (!$secret) {
                return false;
            }
            $header = (string) $request->get_header('stripe-signature');
            preg_match('/t=(\d+)/', $header, $timestamp);
            preg_match('/v1=([a-f0-9]+)/', $header, $signature);
            if (empty($timestamp[1]) || empty($signature[1])) {
                return false;
            }
            $expected = hash_hmac('sha256', $timestamp[1] . '.' . $raw_body, $secret);
            return hash_equals($expected, $signature[1]);
        }
        return false;
    }

    private static function webhook_reference(string $gateway, array $payload): string {
        if ($gateway === 'paystack') {
            return sanitize_text_field((string) ($payload['data']['reference'] ?? ''));
        }
        if ($gateway === 'flutterwave') {
            return sanitize_text_field((string) ($payload['data']['tx_ref'] ?? ''));
        }
        if ($gateway === 'stripe') {
            return sanitize_text_field((string) ($payload['data']['object']['id'] ?? ''));
        }
        return '';
    }

    private static function webhook_order_id(string $gateway, array $payload): int {
        if ($gateway === 'stripe') {
            return (int) ($payload['data']['object']['metadata']['order_id'] ?? 0);
        }
        return (int) ($payload['data']['metadata']['order_id'] ?? $payload['data']['meta']['order_id'] ?? 0);
    }

    private static function get_order_for_payment_reference(string $reference) {
        if (!$reference || !function_exists('wc_get_orders')) {
            return null;
        }
        $paystack_order = Nevari_Paystack::get_order_for_reference($reference);
        if ($paystack_order) {
            return $paystack_order;
        }
        $orders = wc_get_orders([
            'limit' => 1,
            'meta_key' => '_nevari_invoice_payment_reference',
            'meta_value' => sanitize_text_field($reference),
        ]);
        return $orders ? $orders[0] : null;
    }

    private static function build_order_receipt_pdf($order): string {
        $items = $order->get_items();
        $currency = $order->get_currency() ?: get_woocommerce_currency();
        $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()) ?: 'Customer';
        $status_label = strtoupper((string) ($order->get_date_paid() ? 'paid' : $order->get_status()));
        $order_date = $order->get_date_created() ? $order->get_date_created()->date_i18n('M j, Y, g:i A') : 'n/a';
        $billing_address = trim(implode("\n", array_filter([
            trim((string) $order->get_billing_address_1()),
            trim((string) $order->get_billing_address_2()),
            trim((string) $order->get_billing_city() . ', ' . $order->get_billing_state() . ' ' . $order->get_billing_postcode()),
            trim((string) $order->get_billing_country()),
        ]))) ?: 'n/a';
        $summary_rows = [
            ['Subtotal', wc_price(self::order_subtotal($order, $items), ['currency' => $currency])],
            ['Discount', wc_price((float) $order->get_discount_total(), ['currency' => $currency])],
            ['Tax', wc_price((float) $order->get_total_tax(), ['currency' => $currency])],
            ['Shipping', wc_price((float) $order->get_shipping_total() + (float) $order->get_shipping_tax(), ['currency' => $currency])],
            ['Amount Paid', wc_price((float) $order->get_total(), ['currency' => $currency])],
            ['Balance Due', wc_price(0, ['currency' => $currency])],
        ];

        $items_rows = [];
        foreach ($items as $item) {
            $quantity = (float) $item->get_quantity();
            $line_total = (float) $item->get_total();
            $unit_price = $quantity > 0 ? ((float) $item->get_subtotal() / $quantity) : (float) $item->get_subtotal();
            $items_rows[] = [
                wp_strip_all_tags($item->get_name()),
                (string) wc_format_decimal($quantity, 0),
                wp_strip_all_tags(wc_price($unit_price, ['currency' => $currency])),
                wp_strip_all_tags(wc_price(0, ['currency' => $currency])),
                wp_strip_all_tags(wc_price(0, ['currency' => $currency])),
                wp_strip_all_tags(wc_price($line_total, ['currency' => $currency])),
            ];
        }

        $content = self::pdf_begin_page();
        $content .= self::pdf_set_rgb(0.10, 0.19, 0.42);
        $content .= self::pdf_draw_rect(20, 740, 572, 38, true);
        $content .= self::pdf_text(44, 771, 24, 'Helvetica-Bold', 1, 1, 1, wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES));
        $content .= self::pdf_draw_circle(46, 770, 14, true);
        $content .= self::pdf_text(40, 765, 12, 'Helvetica-Bold', 1, 1, 1, 'ne');
        $content .= self::pdf_set_rgb(0.10, 0.19, 0.42);
        $content .= self::pdf_text(300, 770, 24, 'Helvetica-Bold', 0.10, 0.19, 0.42, sprintf('Receipt #%s', $order->get_order_number()));
        $content .= self::pdf_text(555, 752, 10, 'Helvetica-Bold', 0.10, 0.19, 0.42, $status_label);
        $content .= self::pdf_text(555, 738, 9, 'Helvetica', 0.34, 0.38, 0.47, $order_date);
        $content .= self::pdf_line(20, 726, 592, 726);
        $content .= self::pdf_text(20, 706, 12, 'Helvetica-Bold', 0.10, 0.19, 0.42, 'CUSTOMER DETAILS');
        $content .= self::pdf_text_block(20, 690, 11, 'Helvetica', 0.10, 0.19, 0.42, [
            strtolower($customer_name),
            strtolower((string) $order->get_billing_email()),
            (string) $order->get_billing_phone(),
            strtolower($billing_address),
        ], 14);

        $content .= self::pdf_fill_rect(20, 560, 572, 28, 0.10, 0.19, 0.42);
        $header_y = 544;
        $headers = ['DESCRIPTION', 'QTY', 'RATE', 'TAX', 'DISCOUNT', 'AMOUNT'];
        $x_positions = [20, 200, 270, 360, 450, 520];
        foreach ($headers as $index => $header) {
            $content .= self::pdf_text($x_positions[$index], $header_y, 10, 'Helvetica-Bold', 1, 1, 1, $header);
        }

        $row_y = 520;
        foreach ($items_rows as $row) {
            $content .= self::pdf_line(20, $row_y + 5, 592, $row_y + 5, 0.88, 0.90, 0.93);
            $content .= self::pdf_text(20, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[0]);
            $content .= self::pdf_text(200, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[1]);
            $content .= self::pdf_text(270, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[2]);
            $content .= self::pdf_text(360, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[3]);
            $content .= self::pdf_text(450, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[4]);
            $content .= self::pdf_text(520, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[5]);
            $row_y -= 34;
        }

        $content .= self::pdf_fill_rect(20, 198, 330, 22, 0.10, 0.19, 0.42);
        $content .= self::pdf_text(20, 174, 12, 'Helvetica-Bold', 0.10, 0.19, 0.42, 'Notes / Instructions');
        $content .= self::pdf_text_block(20, 156, 10, 'Helvetica', 0.10, 0.19, 0.42, [
            trim((string) $order->get_customer_note()) ?: 'Payment confirmed. Keep this receipt for your records.',
        ], 14);

        $summary_x = 350;
        $summary_y = 196;
        $content .= self::pdf_draw_rect($summary_x, 66, 242, 130, false);
        foreach ($summary_rows as $index => [$label, $value]) {
            $rowY = $summary_y - ($index * 18);
            $content .= self::pdf_text($summary_x + 10, $rowY, 10, 'Helvetica', 0.10, 0.19, 0.42, $label);
            $content .= self::pdf_text($summary_x + 202, $rowY, 10, 'Helvetica-Bold', 0.10, 0.19, 0.42, $value);
        }
        $content .= self::pdf_line(20, 60, 592, 60);
        $content .= self::pdf_end_page($content);
        return self::pdf_wrap_document($content);
    }

    private static function build_order_prescription_pdf($order): string {
        global $wpdb;
        $prescription_id = (int) $order->get_meta('_nevari_prescription_id');
        if (!$prescription_id) {
            return '';
        }

        $prescription = self::get_prescription_row($prescription_id);
        if (!$prescription || !Nevari_Helpers::can_view_prescription($prescription)) {
            return '';
        }

        $currency = $order->get_currency() ?: get_woocommerce_currency();
        $patient = get_user_by('id', (int) $prescription->patient_user_id);
        $doctor = get_user_by('id', (int) $prescription->doctor_user_id);
        $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()) ?: ($patient ? $patient->display_name : 'Patient');
        $order_date = !empty($prescription->created_at) ? Nevari_Helpers::iso_datetime($prescription->created_at) : 'n/a';
        $status_label = strtoupper(str_replace('_', ' ', (string) $prescription->status));
        $billing_address = trim(implode("\n", array_filter([
            trim((string) $order->get_billing_address_1()),
            trim((string) $order->get_billing_address_2()),
            trim((string) $order->get_billing_city() . ', ' . $order->get_billing_state() . ' ' . $order->get_billing_postcode()),
            trim((string) $order->get_billing_country()),
        ]))) ?: 'n/a';
        $items_rows = [];

        $items_table = Nevari_Helpers::table('prescription_items');
        $prescription_items = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$items_table} WHERE prescription_id = %d ORDER BY id ASC", $prescription_id));
        if ($prescription_items) {
            foreach ($prescription_items as $prescription_item) {
                $product_name = 'Medication';
                if (!empty($prescription_item->product_id)) {
                    if (function_exists('wc_get_product')) {
                        $product = wc_get_product((int) $prescription_item->product_id);
                        if ($product) {
                            $product_name = $product->get_name();
                        }
                    }
                    if ($product_name === 'Medication') {
                        $title = get_the_title((int) $prescription_item->product_id);
                        if (!empty($title)) {
                            $product_name = $title;
                        }
                    }
                }
                $items_rows[] = [
                    wp_strip_all_tags($product_name ?: 'Medication'),
                    wp_strip_all_tags((string) ($prescription_item->quantity ?: '1')),
                    wp_strip_all_tags((string) ($prescription_item->dosage ?: 'n/a')),
                    wp_strip_all_tags((string) ($prescription_item->frequency ?: 'n/a')),
                    wp_strip_all_tags((string) ($prescription_item->notes ?: '')),
                ];
            }
        }

        if (empty($items_rows)) {
            $items_rows[] = ['No medications added.', '-', '-', '-', '-'];
        }

        $summary_rows = [
            ['Prescription', (string) ($prescription->prescription_number ?: ('#' . $prescription_id))],
            ['Doctor', wp_strip_all_tags($doctor ? $doctor->display_name : ('Doctor #' . (int) $prescription->doctor_user_id))],
            ['Patient', wp_strip_all_tags($patient ? $patient->display_name : ('Patient #' . (int) $prescription->patient_user_id))],
            ['Status', ucfirst(strtolower(str_replace('_', ' ', (string) $prescription->status)))],
            ['Order Total', wp_strip_all_tags(wc_price((float) $order->get_total(), ['currency' => $currency]))],
        ];

        $content = self::pdf_begin_page();
        $content .= self::pdf_set_rgb(0.10, 0.19, 0.42);
        $content .= self::pdf_draw_rect(20, 740, 572, 38, true);
        $content .= self::pdf_text(44, 771, 24, 'Helvetica-Bold', 1, 1, 1, wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES));
        $content .= self::pdf_draw_circle(46, 770, 14, true);
        $content .= self::pdf_text(40, 765, 12, 'Helvetica-Bold', 1, 1, 1, 'ne');
        $content .= self::pdf_set_rgb(0.10, 0.19, 0.42);
        $content .= self::pdf_text(260, 770, 24, 'Helvetica-Bold', 0.10, 0.19, 0.42, sprintf('Prescription #%s', (string) ($prescription->prescription_number ?: ('#' . $prescription_id))));
        $content .= self::pdf_text(555, 752, 10, 'Helvetica-Bold', 0.10, 0.19, 0.42, $status_label);
        $content .= self::pdf_text(555, 738, 9, 'Helvetica', 0.34, 0.38, 0.47, $order_date);
        $content .= self::pdf_line(20, 726, 592, 726);
        $content .= self::pdf_text(20, 706, 12, 'Helvetica-Bold', 0.10, 0.19, 0.42, 'CUSTOMER DETAILS');
        $content .= self::pdf_text_block(20, 690, 11, 'Helvetica', 0.10, 0.19, 0.42, [
            strtolower($customer_name),
            strtolower((string) $order->get_billing_email()),
            (string) $order->get_billing_phone(),
            strtolower($billing_address),
        ], 14);

        $content .= self::pdf_fill_rect(20, 560, 572, 28, 0.10, 0.19, 0.42);
        $header_y = 544;
        $headers = ['MEDICATION', 'QTY', 'DOSAGE', 'FREQUENCY', 'NOTES'];
        $x_positions = [20, 255, 320, 410, 500];
        foreach ($headers as $index => $header) {
            $content .= self::pdf_text($x_positions[$index], $header_y, 10, 'Helvetica-Bold', 1, 1, 1, $header);
        }

        $row_y = 520;
        foreach ($items_rows as $row) {
            $content .= self::pdf_line(20, $row_y + 5, 592, $row_y + 5, 0.88, 0.90, 0.93);
            $content .= self::pdf_text(20, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[0]);
            $content .= self::pdf_text(255, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[1]);
            $content .= self::pdf_text(320, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[2]);
            $content .= self::pdf_text(410, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[3]);
            $content .= self::pdf_text(500, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[4]);
            $row_y -= 34;
        }

        $content .= self::pdf_fill_rect(20, 198, 330, 22, 0.10, 0.19, 0.42);
        $content .= self::pdf_text(20, 174, 12, 'Helvetica-Bold', 0.10, 0.19, 0.42, 'Notes / Instructions');
        $content .= self::pdf_text_block(20, 156, 10, 'Helvetica', 0.10, 0.19, 0.42, [
            wp_strip_all_tags((string) (!empty($prescription->diagnosis) ? $prescription->diagnosis : 'No diagnosis recorded.')),
            wp_strip_all_tags((string) (!empty($prescription->instructions) ? $prescription->instructions : 'Follow your doctor instructions exactly as prescribed.')),
        ], 14);

        $summary_x = 350;
        $summary_y = 196;
        $content .= self::pdf_draw_rect($summary_x, 84, 242, 112, false);
        foreach ($summary_rows as $index => [$label, $value]) {
            $rowY = $summary_y - ($index * 18);
            $content .= self::pdf_text($summary_x + 10, $rowY, 10, 'Helvetica', 0.10, 0.19, 0.42, $label);
            $content .= self::pdf_text($summary_x + 202, $rowY, 10, 'Helvetica-Bold', 0.10, 0.19, 0.42, $value);
        }
        $content .= self::pdf_line(20, 78, 592, 78);
        $content .= self::pdf_end_page($content);
        return self::pdf_wrap_document($content);
    }

    private static function build_order_details_pdf($order): string {
        global $wpdb;
        $items = $order->get_items();
        $currency = $order->get_currency() ?: get_woocommerce_currency();
        $customer_name = trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()) ?: 'Customer';
        $currency_symbol = function_exists('get_woocommerce_currency_symbol') ? get_woocommerce_currency_symbol($currency) : $currency;
        $status_label = strtoupper((string) $order->get_status());
        $order_date = $order->get_date_created() ? $order->get_date_created()->date_i18n('M j, Y, g:i A') : 'n/a';
        $billing_address = trim(implode("\n", array_filter([
            trim((string) $order->get_billing_address_1()),
            trim((string) $order->get_billing_address_2()),
            trim((string) $order->get_billing_city() . ', ' . $order->get_billing_state() . ' ' . $order->get_billing_postcode()),
            trim((string) $order->get_billing_country()),
        ]))) ?: 'n/a';
        $summary_rows = [
            ['Subtotal', wc_price(self::order_subtotal($order, $items), ['currency' => $currency])],
            ['Discount', wc_price((float) $order->get_discount_total(), ['currency' => $currency])],
            ['Tax', wc_price((float) $order->get_total_tax(), ['currency' => $currency])],
            ['Shipping', wc_price((float) $order->get_shipping_total() + (float) $order->get_shipping_tax(), ['currency' => $currency])],
            ['Amount Paid', wc_price((float) $order->get_total(), ['currency' => $currency])],
        ];
        $prescription_lines = [];
        $prescription_id = (int) $order->get_meta('_nevari_prescription_id');
        if ($prescription_id) {
            $prescription = self::get_prescription_row($prescription_id);
            if ($prescription && Nevari_Helpers::can_view_prescription($prescription)) {
                if (!empty($prescription->diagnosis)) {
                    $prescription_lines[] = wp_strip_all_tags((string) $prescription->diagnosis);
                } else {
                    $prescription_lines[] = 'No diagnosis recorded.';
                }
                $items_table = Nevari_Helpers::table('prescription_items');
                $prescription_items = $wpdb->get_results($wpdb->prepare("SELECT * FROM {$items_table} WHERE prescription_id = %d ORDER BY id ASC", $prescription_id));
                if ($prescription_items) {
                    foreach ($prescription_items as $prescription_item) {
                        $product_name = 'Medication';
                        if (!empty($prescription_item->product_id)) {
                            if (function_exists('wc_get_product')) {
                                $product = wc_get_product((int) $prescription_item->product_id);
                                if ($product) {
                                    $product_name = $product->get_name();
                                }
                            }
                            if ($product_name === 'Medication') {
                                $title = get_the_title((int) $prescription_item->product_id);
                                if (!empty($title)) {
                                    $product_name = $title;
                                }
                            }
                        }
                        $prescription_lines[] = sprintf(
                            '%s | %s | %s | %s | %s',
                            wp_strip_all_tags($product_name ?: 'Medication'),
                            wp_strip_all_tags((string) ($prescription_item->quantity ?: '1')),
                            wp_strip_all_tags((string) ($prescription_item->dosage ?: 'n/a')),
                            wp_strip_all_tags((string) ($prescription_item->frequency ?: 'n/a')),
                            wp_strip_all_tags((string) ($prescription_item->notes ?: ''))
                        );
                    }
                } else {
                    $prescription_lines[] = 'No medications added.';
                }
                if (!empty($prescription->instructions)) {
                    $prescription_lines[] = wp_strip_all_tags((string) $prescription->instructions);
                }
            }
        }

        $items_rows = [];
        foreach ($items as $item) {
            $quantity = (float) $item->get_quantity();
            $line_total = (float) $item->get_total();
            $unit_price = $quantity > 0 ? ((float) $item->get_subtotal() / $quantity) : (float) $item->get_subtotal();
            $items_rows[] = [
                wp_strip_all_tags($item->get_name()),
                (string) wc_format_decimal($quantity, 0),
                wp_strip_all_tags(wc_price($unit_price, ['currency' => $currency])),
                wp_strip_all_tags(wc_price(0, ['currency' => $currency])),
                wp_strip_all_tags(wc_price(0, ['currency' => $currency])),
                wp_strip_all_tags(wc_price($line_total, ['currency' => $currency])),
            ];
        }

        $content = self::pdf_begin_page();
        $content .= self::pdf_set_rgb(0.10, 0.19, 0.42);
        $content .= self::pdf_draw_rect(20, 740, 572, 38, true);
        $content .= self::pdf_text(44, 771, 24, 'Helvetica-Bold', 1, 1, 1, wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES));
        $content .= self::pdf_draw_circle(46, 770, 14, true);
        $content .= self::pdf_text(40, 765, 12, 'Helvetica-Bold', 1, 1, 1, 'ne');
        $content .= self::pdf_set_rgb(0.10, 0.19, 0.42);
        $content .= self::pdf_text(300, 770, 24, 'Helvetica-Bold', 0.10, 0.19, 0.42, sprintf('Invoice #%s', $order->get_order_number()));
        $content .= self::pdf_text(555, 752, 10, 'Helvetica-Bold', 0.10, 0.19, 0.42, $status_label);
        $content .= self::pdf_text(555, 738, 9, 'Helvetica', 0.34, 0.38, 0.47, $order_date);
        $content .= self::pdf_line(20, 726, 592, 726);
        $content .= self::pdf_text(20, 706, 12, 'Helvetica-Bold', 0.10, 0.19, 0.42, 'CUSTOMER DETAILS');
        $content .= self::pdf_text_block(20, 690, 11, 'Helvetica', 0.10, 0.19, 0.42, [
            strtolower($customer_name),
            strtolower((string) $order->get_billing_email()),
            (string) $order->get_billing_phone(),
            strtolower($billing_address),
        ], 14);

        $content .= self::pdf_fill_rect(20, 560, 572, 28, 0.10, 0.19, 0.42);
        $header_y = 544;
        $headers = ['ITEM', 'QTY', 'UNIT PRICE', 'DISCOUNT', 'TAX', 'TOTAL'];
        $x_positions = [20, 200, 270, 360, 450, 520];
        foreach ($headers as $index => $header) {
            $content .= self::pdf_text($x_positions[$index], $header_y, 10, 'Helvetica-Bold', 1, 1, 1, $header);
        }

        $row_y = 520;
        foreach ($items_rows as $row) {
            $content .= self::pdf_line(20, $row_y + 5, 592, $row_y + 5, 0.88, 0.90, 0.93);
            $content .= self::pdf_text(20, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[0]);
            $content .= self::pdf_text(200, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[1]);
            $content .= self::pdf_text(270, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[2]);
            $content .= self::pdf_text(360, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[3]);
            $content .= self::pdf_text(450, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[4]);
            $content .= self::pdf_text(520, $row_y, 10, 'Helvetica', 0.10, 0.19, 0.42, $row[5]);
            $row_y -= 34;
        }

        $prescription_box_y = max(250, $row_y - 10);
        $content .= self::pdf_text(20, $prescription_box_y, 12, 'Helvetica-Bold', 0.10, 0.19, 0.42, 'Prescription');
        if (!empty($prescription_lines)) {
            $content .= self::pdf_text_block(20, $prescription_box_y - 18, 10, 'Helvetica', 0.10, 0.19, 0.42, $prescription_lines, 14);
        }
        $content .= self::pdf_fill_rect(20, 198, 330, 22, 0.10, 0.19, 0.42);
        $content .= self::pdf_text(20, 174, 12, 'Helvetica-Bold', 0.10, 0.19, 0.42, 'Notes / Instructions');
        $content .= self::pdf_text_block(20, 156, 10, 'Helvetica', 0.10, 0.19, 0.42, [
            trim((string) $order->get_customer_note()) ?: 'Please pay the hospital account listed on your patient profile.',
        ], 14);

        $summary_x = 350;
        $summary_y = 196;
        $content .= self::pdf_draw_rect($summary_x, 84, 242, 112, false);
        foreach ($summary_rows as $index => [$label, $value]) {
            $rowY = $summary_y - ($index * 18);
            $content .= self::pdf_text($summary_x + 10, $rowY, 10, 'Helvetica', 0.10, 0.19, 0.42, $label);
            $content .= self::pdf_text($summary_x + 202, $rowY, 10, 'Helvetica-Bold', 0.10, 0.19, 0.42, $value);
        }
        $content .= self::pdf_line(20, 78, 592, 78);
        $content .= self::pdf_end_page($content);
        return self::pdf_wrap_document($content);
    }

    private static function build_simple_pdf(array $lines): string {
        $content = "BT\n/F1 12 Tf\n50 770 Td\n";
        foreach ($lines as $index => $line) {
            $safe_line = self::pdf_escape((string) $line);
            if ($index > 0) {
                $content .= "0 -18 Td\n";
            }
            $content .= sprintf("(%s) Tj\n", $safe_line);
        }
        $content .= "ET";

        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
            sprintf("<< /Length %d >>\nstream\n%s\nendstream", strlen($content), $content),
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= sprintf("%d 0 obj\n%s\nendobj\n", $index + 1, $object);
        }

        $xref_offset = strlen($pdf);
        $pdf .= sprintf("xref\n0 %d\n0000000000 65535 f \n", count($objects) + 1);
        foreach (array_slice($offsets, 1) as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }
        $pdf .= sprintf(
            "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF",
            count($objects) + 1,
            $xref_offset
        );

        return $pdf;
    }

    private static function pdf_wrap_document(string $content): string {
        $objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
            sprintf("<< /Length %d >>\nstream\n%s\nendstream", strlen($content), $content),
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
        ];

        $pdf = "%PDF-1.4\n";
        $offsets = [0];
        foreach ($objects as $index => $object) {
            $offsets[] = strlen($pdf);
            $pdf .= sprintf("%d 0 obj\n%s\nendobj\n", $index + 1, $object);
        }

        $xref_offset = strlen($pdf);
        $pdf .= sprintf("xref\n0 %d\n0000000000 65535 f \n", count($objects) + 1);
        foreach (array_slice($offsets, 1) as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }
        $pdf .= sprintf(
            "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF",
            count($objects) + 1,
            $xref_offset
        );

        return $pdf;
    }

    private static function pdf_begin_page(): string {
        return "q\n";
    }

    private static function pdf_end_page(string $content): string {
        return $content . "Q\n";
    }

    private static function pdf_set_rgb(float $r, float $g, float $b): string {
        return sprintf("%.3F %.3F %.3F rg\n%.3F %.3F %.3F RG\n", $r, $g, $b, $r, $g, $b);
    }

    private static function pdf_line(float $x1, float $y1, float $x2, float $y2, float $r = 0.88, float $g = 0.90, float $b = 0.93): string {
        return self::pdf_set_rgb($r, $g, $b) . sprintf("%.2F %.2F m\n%.2F %.2F l\nS\n", $x1, $y1, $x2, $y2);
    }

    private static function pdf_draw_rect(float $x, float $y, float $w, float $h, bool $fill = false): string {
        return sprintf("0 0 0 rg\n0 0 0 RG\n%.2F %.2F %.2F %.2F re\n%s\n", $x, $y, $w, $h, $fill ? 'f' : 'S');
    }

    private static function pdf_fill_rect(float $x, float $y, float $w, float $h, float $r, float $g, float $b): string {
        return self::pdf_set_rgb($r, $g, $b) . sprintf("%.2F %.2F %.2F %.2F re\nf\n", $x, $y, $w, $h);
    }

    private static function pdf_draw_circle(float $cx, float $cy, float $radius, bool $fill = false): string {
        $k = 0.552284749831;
        $ox = $radius * $k;
        $oy = $radius * $k;
        $x0 = $cx - $radius;
        $y0 = $cy;
        $x1 = $cx;
        $y1 = $cy + $radius;
        $x2 = $cx + $radius;
        $y2 = $cy;
        $x3 = $cx;
        $y3 = $cy - $radius;
        return self::pdf_set_rgb(0.10, 0.19, 0.42)
            . sprintf("%.2F %.2F m\n", $x0, $y0)
            . sprintf("%.2F %.2F %.2F %.2F %.2F %.2F c\n", $x0, $y0 + $oy, $x1 - $ox, $y1, $x1, $y1)
            . sprintf("%.2F %.2F %.2F %.2F %.2F %.2F c\n", $x1 + $ox, $y1, $x2, $y0 + $oy, $x2, $y0)
            . sprintf("%.2F %.2F %.2F %.2F %.2F %.2F c\n", $x2, $y0 - $oy, $x1 + $ox, $y3, $x1, $y3)
            . sprintf("%.2F %.2F %.2F %.2F %.2F %.2F c\n", $x1 - $ox, $y3, $x0, $y0 - $oy, $x0, $y0)
            . ($fill ? "f\n" : "S\n");
    }

    private static function pdf_text(float $x, float $y, int $size, string $font, float $r, float $g, float $b, string $text): string {
        return self::pdf_set_rgb($r, $g, $b)
            . sprintf("BT /%s %d Tf %.2F %.2F Td (%s) Tj ET\n", $font, $size, $x, $y, self::pdf_escape($text));
    }

    private static function pdf_text_block(float $x, float $y, int $size, string $font, float $r, float $g, float $b, array $lines, int $lineHeight = 14): string {
        $content = '';
        foreach ($lines as $index => $line) {
            $content .= self::pdf_text($x, $y - ($index * $lineHeight), $size, $font, $r, $g, $b, (string) $line);
        }
        return $content;
    }

    private static function pdf_escape(string $value): string {
        $value = wp_strip_all_tags(html_entity_decode($value, ENT_QUOTES, 'UTF-8'));
        $value = preg_replace('/[^\x20-\x7E]/', '', $value);
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $value);
    }

    private static function order_subtotal($order, array $items): float {
        if (method_exists($order, 'get_subtotal')) {
            return (float) $order->get_subtotal();
        }

        return (float) array_reduce($items, static function ($carry, $item) {
            return $carry + (float) $item->get_subtotal();
        }, 0.0);
    }

    private static function order_fees_total($order): float {
        if (method_exists($order, 'get_total_fees')) {
            return (float) $order->get_total_fees();
        }

        return (float) array_reduce($order->get_items('fee'), static function ($carry, $item) {
            return $carry + (float) $item->get_total();
        }, 0.0);
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

    private static function allowed_product_statuses(): array {
        return ['draft', 'publish', 'pending', 'private'];
    }

    private static function sanitize_product_status_value($value, string $fallback = 'draft'): string {
        $status = sanitize_key((string) $value);
        return in_array($status, self::allowed_product_statuses(), true) ? $status : $fallback;
    }

    private static function sanitize_product_term_names($raw_terms): array {
        if (!is_array($raw_terms)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map(static function ($term) {
            return sanitize_text_field((string) $term);
        }, $raw_terms), static function ($term) {
            return $term !== '';
        })));
    }

    private static function sanitize_product_images_payload($raw_images): array {
        if (!is_array($raw_images)) {
            return [];
        }

        $image_ids = [];
        foreach ($raw_images as $image) {
            $image_id = 0;
            if (is_array($image)) {
                $image_id = isset($image['id']) ? absint($image['id']) : 0;
            } else {
                $image_id = absint($image);
            }
            if ($image_id > 0) {
                $image_ids[] = $image_id;
            }
        }

        return array_values(array_unique($image_ids));
    }

    private static function sanitize_product_meta_payload($raw_meta): array {
        $safe = [];
        if (!is_array($raw_meta)) {
            return $safe;
        }

        foreach ($raw_meta as $item) {
            if (!is_array($item) || empty($item['key'])) {
                continue;
            }

            $key = sanitize_key((string) $item['key']);
            $value = $item['value'] ?? '';

            switch ($key) {
                case 'strength_dosage':
                    $safe[$key] = sanitize_text_field((string) $value);
                    break;
                case 'expiry_date':
                    $safe[$key] = preg_replace('/[^0-9\-]/', '', (string) $value);
                    break;
                case 'prescription_rule':
                    $normalized = sanitize_key((string) $value);
                    $safe[$key] = in_array($normalized, ['no_prescription_needed', 'prescription_required', 'pharmacist_review_required'], true)
                        ? $normalized
                        : 'no_prescription_needed';
                    break;
                case 'prescription_notes':
                    $safe[$key] = sanitize_textarea_field((string) $value);
                    break;
            }
        }

        return $safe;
    }

    private static function apply_product_custom_meta(int $product_id, array $params): void {
        $meta_payload = self::sanitize_product_meta_payload($params['meta_data'] ?? []);
        foreach ($meta_payload as $key => $value) {
            if ($value === '') {
                delete_post_meta($product_id, $key);
                continue;
            }
            update_post_meta($product_id, $key, $value);
        }

        if (array_key_exists('shipping_information', $params)) {
            $shipping_information = sanitize_textarea_field((string) $params['shipping_information']);
            if ($shipping_information === '') {
                delete_post_meta($product_id, '_nevari_shipping_information');
            } else {
                update_post_meta($product_id, '_nevari_shipping_information', $shipping_information);
            }
        }

        if (array_key_exists('linked_products', $params)) {
            $linked_products = sanitize_textarea_field((string) $params['linked_products']);
            if ($linked_products === '') {
                delete_post_meta($product_id, '_nevari_linked_products');
            } else {
                update_post_meta($product_id, '_nevari_linked_products', $linked_products);
            }
        }
    }

    private static function generate_product_sku(): string {
        $attempts = 0;
        do {
            $sku = 'NV-MED-' . strtoupper(wp_generate_password(6, false, false));
            $attempts += 1;
        } while (function_exists('wc_get_product_id_by_sku') && wc_get_product_id_by_sku($sku) && $attempts < 8);

        return $sku;
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
        $categories = self::sanitize_product_term_names($params['categories'] ?? []);
        if (!$categories) {
            return Nevari_Helpers::error('validation_error', 'At least one category is required.', 422);
        }
        $regular_price = array_key_exists('regular_price', $params) ? wc_format_decimal($params['regular_price']) : '';
        $sale_price = array_key_exists('sale_price', $params) ? wc_format_decimal($params['sale_price']) : '';
        if ($regular_price === '') {
            return Nevari_Helpers::error('validation_error', 'regular_price is required.', 422);
        }
        if ($sale_price !== '' && (float) $sale_price > (float) $regular_price) {
            return Nevari_Helpers::error('validation_error', 'sale_price cannot be greater than regular_price.', 422);
        }
        $product = new WC_Product_Simple();
        $product->set_name($name);
        $product->set_status(self::sanitize_product_status_value($params['status'] ?? 'draft'));
        $product->set_sku(self::generate_product_sku());
        $product->set_regular_price($regular_price);
        $product->set_sale_price($sale_price);
        if (isset($params['description'])) {
            $product->set_description(wp_kses_post((string) $params['description']));
        }
        if (isset($params['short_description'])) {
            $product->set_short_description(wp_kses_post((string) $params['short_description']));
        }
        if (isset($params['purchase_note'])) {
            $product->set_purchase_note(sanitize_textarea_field((string) $params['purchase_note']));
        }
        if (array_key_exists('stock_quantity', $params)) {
            $product->set_manage_stock(true);
            $product->set_stock_quantity(max(0, (int) $params['stock_quantity']));
        }
        if (isset($params['stock_status'])) {
            $product->set_stock_status(sanitize_key((string) $params['stock_status']));
        }
        if (isset($params['catalog_visibility']) && method_exists($product, 'set_catalog_visibility')) {
            $product->set_catalog_visibility(sanitize_key((string) $params['catalog_visibility']));
        }
        $product_id = $product->save();
        wp_set_object_terms($product_id, $categories, 'product_cat');
        $tags = self::sanitize_product_term_names($params['tags'] ?? []);
        if ($tags) {
            wp_set_object_terms($product_id, $tags, 'product_tag');
        }
        if (!empty($params['pharmacy_rules']) && is_array($params['pharmacy_rules'])) {
            Nevari_Helpers::update_product_rules($product_id, $params['pharmacy_rules']);
        }
        $image_ids = self::sanitize_product_images_payload($params['images'] ?? []);
        if ($image_ids) {
            $saved_product = wc_get_product($product_id);
            if ($saved_product) {
                $saved_product->set_image_id($image_ids[0] ?? 0);
                $saved_product->set_gallery_image_ids(array_slice($image_ids, 1));
                $saved_product->save();
            }
        }
        self::apply_product_custom_meta($product_id, $params);
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
        foreach (['name', 'status', 'description', 'short_description', 'regular_price', 'sale_price', 'sku', 'stock_quantity', 'stock_status'] as $field) {
            if (!array_key_exists($field, $params)) {
                continue;
            }
            switch ($field) {
                case 'name': $product->set_name(sanitize_text_field((string) $params[$field])); break;
                case 'status': $product->set_status(self::sanitize_product_status_value($params[$field], $product->get_status() ?: 'draft')); break;
                case 'description': $product->set_description(wp_kses_post((string) $params[$field])); break;
                case 'short_description': $product->set_short_description(wp_kses_post((string) $params[$field])); break;
                case 'regular_price': $product->set_regular_price(wc_format_decimal($params[$field])); break;
                case 'sale_price': $product->set_sale_price(wc_format_decimal($params[$field])); break;
                case 'sku': $product->set_sku(sanitize_text_field((string) $params[$field])); break;
                case 'stock_quantity':
                    $product->set_manage_stock(true);
                    $product->set_stock_quantity(max(0, (int) $params[$field]));
                    break;
                case 'stock_status': $product->set_stock_status(sanitize_key((string) $params[$field])); break;
            }
        }
        if (array_key_exists('purchase_note', $params)) {
            $product->set_purchase_note(sanitize_textarea_field((string) $params['purchase_note']));
        }
        if ((string) $product->get_sale_price() !== '' && (float) $product->get_regular_price() > 0 && (float) $product->get_sale_price() > (float) $product->get_regular_price()) {
            return Nevari_Helpers::error('validation_error', 'sale_price cannot be greater than regular_price.', 422);
        }
        if (isset($params['catalog_visibility']) && method_exists($product, 'set_catalog_visibility')) {
            $product->set_catalog_visibility(sanitize_key((string) $params['catalog_visibility']));
        }
        if (array_key_exists('images', $params) && is_array($params['images'])) {
            $image_ids = self::sanitize_product_images_payload($params['images']);
            $product->set_image_id($image_ids[0] ?? 0);
            $product->set_gallery_image_ids(array_slice($image_ids, 1));
        }
        $product->save();
        if (array_key_exists('categories', $params) && is_array($params['categories'])) {
            wp_set_object_terms($product->get_id(), self::sanitize_product_term_names($params['categories']), 'product_cat');
        }
        if (array_key_exists('tags', $params) && is_array($params['tags'])) {
            wp_set_object_terms($product->get_id(), self::sanitize_product_term_names($params['tags']), 'product_tag');
        }
        if (!empty($params['pharmacy_rules']) && is_array($params['pharmacy_rules'])) {
            Nevari_Helpers::update_product_rules($product->get_id(), $params['pharmacy_rules']);
        }
        self::apply_product_custom_meta($product->get_id(), $params);
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

    public static function products_duplicate(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required.', 503);
        }
        $source = wc_get_product((int) $request['id']);
        if (!$source) {
            return Nevari_Helpers::error('product_not_found', 'Product not found.', 404);
        }

        $duplicate = clone $source;
        $duplicate->set_id(0);
        $duplicate->set_name(sanitize_text_field($source->get_name() . ' (copy)'));
        $duplicate->set_status('draft');
        $duplicate->set_sku('');
        $duplicate->set_slug('');

        if (method_exists($duplicate, 'set_catalog_visibility')) {
            $duplicate->set_catalog_visibility($source->get_catalog_visibility());
        }
        $duplicate->set_regular_price($source->get_regular_price());
        $duplicate->set_sale_price($source->get_sale_price());
        $duplicate->set_description($source->get_description());
        $duplicate->set_short_description($source->get_short_description());
        $duplicate->set_manage_stock($source->get_manage_stock());
        $duplicate->set_stock_status($source->get_stock_status());
        if ($source->get_stock_quantity() !== null) {
            $duplicate->set_stock_quantity($source->get_stock_quantity());
        }

        $new_product_id = $duplicate->save();
        if (!$new_product_id) {
            return Nevari_Helpers::error('product_duplicate_failed', 'The product could not be duplicated.', 500);
        }

        $category_ids = wp_get_post_terms($source->get_id(), 'product_cat', ['fields' => 'ids']);
        if (!is_wp_error($category_ids) && $category_ids) {
            wp_set_object_terms($new_product_id, array_map('intval', $category_ids), 'product_cat');
        }

        $tag_ids = wp_get_post_terms($source->get_id(), 'product_tag', ['fields' => 'ids']);
        if (!is_wp_error($tag_ids) && $tag_ids) {
            wp_set_object_terms($new_product_id, array_map('intval', $tag_ids), 'product_tag');
        }

        $image_id = $source->get_image_id();
        if ($image_id) {
            $duplicate->set_image_id($image_id);
        }
        $gallery_ids = $source->get_gallery_image_ids();
        if (is_array($gallery_ids) && $gallery_ids) {
            $duplicate->set_gallery_image_ids(array_map('intval', $gallery_ids));
        }
        $duplicate->save();

        $source_rules = Nevari_Helpers::product_rules($source->get_id());
        if (!empty($source_rules) && is_array($source_rules)) {
            Nevari_Helpers::update_product_rules($new_product_id, $source_rules);
        }

        Nevari_Audit::log('orders', 'nevari', 'product.duplicated', 'success', ['product_id' => $new_product_id, 'source_product_id' => $source->get_id(), 'object_type' => 'product', 'object_id' => $new_product_id]);
        return Nevari_Helpers::success(self::format_product(wc_get_product($new_product_id), true), [], 201);
    }

    public static function products_upload_media(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'media'])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $filename = isset($params['filename']) ? sanitize_file_name((string) $params['filename']) : '';
        $mime_type = isset($params['mime_type']) ? sanitize_text_field((string) $params['mime_type']) : '';
        $data_base64 = isset($params['data_base64']) ? (string) $params['data_base64'] : '';
        if (!$filename || !$mime_type || !$data_base64 || strpos($mime_type, 'image/') !== 0) {
            return Nevari_Helpers::error('validation_error', 'A valid image upload is required.', 422);
        }

        $bytes = base64_decode($data_base64, true);
        if ($bytes === false || !$bytes) {
            return Nevari_Helpers::error('validation_error', 'Image data is invalid.', 422);
        }

        $upload = wp_upload_bits($filename, null, $bytes);
        if (!empty($upload['error'])) {
            return Nevari_Helpers::error('media_upload_failed', sanitize_text_field((string) $upload['error']), 500);
        }

        $attachment_id = wp_insert_attachment([
            'post_mime_type' => $mime_type,
            'post_title' => sanitize_text_field(pathinfo($filename, PATHINFO_FILENAME)),
            'post_status' => 'inherit',
        ], $upload['file']);
        if (is_wp_error($attachment_id) || !$attachment_id) {
            return Nevari_Helpers::error('media_upload_failed', 'The image attachment could not be created.', 500);
        }

        require_once ABSPATH . 'wp-admin/includes/image.php';
        $metadata = wp_generate_attachment_metadata($attachment_id, $upload['file']);
        if ($metadata) {
            wp_update_attachment_metadata($attachment_id, $metadata);
        }

        return Nevari_Helpers::success([
            'id' => (int) $attachment_id,
            'src' => wp_get_attachment_url($attachment_id),
            'alt' => sanitize_text_field(pathinfo($filename, PATHINFO_FILENAME)),
        ], [], 201);
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
        $stock_quantity = $product->get_stock_quantity();
        if ($stock_quantity === null) {
            $raw_stock = get_post_meta($product_id, '_stock', true);
            if ($raw_stock !== '' && $raw_stock !== null) {
                $stock_quantity = wc_stock_amount($raw_stock);
            }
        }
        $data = [
            'id' => $product_id,
            'name' => $product->get_name(),
            'type' => $product->get_type(),
            'status' => $product->get_status(),
            'slug' => $product->get_slug(),
            'permalink' => get_permalink($product_id),
            'date_created' => $product->get_date_created() ? $product->get_date_created()->date('c') : null,
            'date_modified' => $product->get_date_modified() ? $product->get_date_modified()->date('c') : null,
            'sku' => $product->get_sku(),
            'currency' => get_woocommerce_currency(),
            'price' => $product->get_price(),
            'regular_price' => $product->get_regular_price(),
            'sale_price' => $product->get_sale_price(),
            'stock_status' => $product->get_stock_status(),
            'stock_quantity' => $stock_quantity,
            'stock' => $stock_quantity,
            'categories' => wp_get_post_terms($product_id, 'product_cat', ['fields' => 'names']),
            'tags' => wp_get_post_terms($product_id, 'product_tag', ['fields' => 'names']),
            'pharmacy_rules' => Nevari_Helpers::product_rules($product_id),
            'image' => wp_get_attachment_image_url($product->get_image_id(), 'medium') ?: null,
            'images' => array_values(array_filter(array_merge(
                $product->get_image_id() ? [[
                    'id' => (int) $product->get_image_id(),
                    'src' => wp_get_attachment_image_url($product->get_image_id(), 'large') ?: wp_get_attachment_url($product->get_image_id()),
                    'alt' => get_post_meta($product->get_image_id(), '_wp_attachment_image_alt', true) ?: $product->get_name(),
                ]] : [],
                array_map(static function ($attachment_id) use ($product) {
                    return [
                        'id' => (int) $attachment_id,
                        'src' => wp_get_attachment_image_url($attachment_id, 'large') ?: wp_get_attachment_url($attachment_id),
                        'alt' => get_post_meta($attachment_id, '_wp_attachment_image_alt', true) ?: $product->get_name(),
                    ];
                }, $product->get_gallery_image_ids())
            ), static function ($image) {
                return !empty($image['src']);
            })),
        ];
        if ($include_description) {
            $data['description'] = $product->get_description();
            $data['short_description'] = $product->get_short_description();
        }
        $data['purchase_note'] = $product->get_purchase_note();
        $data['shipping_information'] = sanitize_textarea_field((string) get_post_meta($product_id, '_nevari_shipping_information', true));
        $data['linked_products'] = sanitize_textarea_field((string) get_post_meta($product_id, '_nevari_linked_products', true));
        $data['meta_data'] = [
            ['key' => 'strength_dosage', 'value' => sanitize_text_field((string) get_post_meta($product_id, 'strength_dosage', true))],
            ['key' => 'expiry_date', 'value' => sanitize_text_field((string) get_post_meta($product_id, 'expiry_date', true))],
            ['key' => 'prescription_rule', 'value' => sanitize_key((string) get_post_meta($product_id, 'prescription_rule', true))],
            ['key' => 'prescription_notes', 'value' => sanitize_textarea_field((string) get_post_meta($product_id, 'prescription_notes', true))],
        ];
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
            'role__in' => self::staff_directory_roles(),
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
        if (!$user || !self::is_staff_directory_user($user)) {
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
            'position' => self::normalize_doctor_position($params['position'] ?? ($params['pricing_tier'] ?? 'specialist')),
            'is_available' => isset($params['is_available']) ? (int) Nevari_Helpers::bool_param($params['is_available']) : 1,
            'max_workload_per_week' => isset($params['max_workload_per_week']) ? max(1, (int) $params['max_workload_per_week']) : 40,
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

    public static function doctors_settings_show(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_read', 60, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'settings'])) {
            return $response;
        }
        return Nevari_Helpers::success([
            'global_consultation_fee' => Nevari_Helpers::global_doctor_consultation_fee(),
            'store_currency' => self::store_currency(),
        ]);
    }

    public static function doctors_settings_update(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'settings'])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $fee = isset($params['global_consultation_fee']) ? (float) $params['global_consultation_fee'] : 0.0;
        if ($fee <= 0) {
            return Nevari_Helpers::error('validation_error', 'A valid global consultation fee is required.', 422);
        }
        $normalized = Nevari_Helpers::update_global_doctor_consultation_fee($fee);
        Nevari_Audit::log('consultation', 'nevari', 'doctor.global_fee_updated', 'success', [
            'message' => 'Global doctor consultation fee updated.',
            'metadata' => [
                'global_consultation_fee' => $normalized,
                'currency' => self::store_currency(),
            ],
        ]);
        return Nevari_Helpers::success([
            'global_consultation_fee' => $normalized,
            'store_currency' => self::store_currency(),
        ]);
    }

    public static function customers_create(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_customers_write', 20, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $email = isset($params['email']) ? sanitize_email((string) $params['email']) : '';
        $display_name = isset($params['display_name']) ? sanitize_text_field((string) $params['display_name']) : '';
        $first_name = isset($params['first_name']) ? sanitize_text_field((string) $params['first_name']) : '';
        $last_name = isset($params['last_name']) ? sanitize_text_field((string) $params['last_name']) : '';
        if (!$display_name) {
            $display_name = trim($first_name . ' ' . $last_name);
        }
        if (!$email || !is_email($email) || !$display_name) {
            return Nevari_Helpers::error('validation_error', 'Valid email and display_name are required.', 422);
        }
        if (email_exists($email)) {
            return Nevari_Helpers::error('email_exists', 'A user with this email already exists.', 409);
        }

        $password = !empty($params['password']) ? (string) $params['password'] : wp_generate_password(20, true);
        $email_parts = explode('@', $email);
        $login_base = sanitize_user($email_parts[0] . '_' . wp_generate_password(4, false));
        $role = get_role('customer') ? 'customer' : 'subscriber';
        $user_id = wp_insert_user([
            'user_login' => $login_base,
            'user_email' => $email,
            'user_pass' => $password,
            'display_name' => $display_name,
            'role' => $role,
        ]);
        if (is_wp_error($user_id)) {
            return Nevari_Helpers::error('customer_create_failed', $user_id->get_error_message(), 400);
        }

        update_user_meta((int) $user_id, 'first_name', $first_name);
        update_user_meta((int) $user_id, 'last_name', $last_name);
        update_user_meta((int) $user_id, 'billing_first_name', $first_name);
        update_user_meta((int) $user_id, 'billing_last_name', $last_name);
        update_user_meta((int) $user_id, 'billing_email', $email);
        if (!empty($params['phone'])) {
            update_user_meta((int) $user_id, 'billing_phone', sanitize_text_field((string) $params['phone']));
        }
        if (!empty($params['address'])) {
            update_user_meta((int) $user_id, 'billing_address_1', sanitize_text_field((string) $params['address']));
        }

        Nevari_Audit::log('orders', 'nevari', 'customer.created', 'success', ['related_user_id' => (int) $user_id, 'object_type' => 'user', 'object_id' => (int) $user_id]);
        return Nevari_Helpers::success([
            'id' => (int) $user_id,
            'user_id' => (int) $user_id,
            'display_name' => $display_name,
            'email' => $email,
            'first_name' => $first_name,
            'last_name' => $last_name,
        ], [], 201);
    }

    public static function customers_settings_show(WP_REST_Request $request): WP_REST_Response {
        $user_id = get_current_user_id();
        if ($response = Nevari_Helpers::rate_limit('rest_customer_settings_read', 60, MINUTE_IN_SECONDS, ['user:' . $user_id])) {
            return $response;
        }
        if (!$user_id || !Nevari_Helpers::is_patient($user_id)) {
            return Nevari_Helpers::error('forbidden', 'Customer settings are only available to authenticated patients.', 403);
        }

        return Nevari_Helpers::success(self::customer_settings_payload($user_id));
    }

    public static function customers_settings_update(WP_REST_Request $request): WP_REST_Response {
        $user_id = get_current_user_id();
        if ($response = Nevari_Helpers::rate_limit('rest_customer_settings_write', 24, MINUTE_IN_SECONDS, ['user:' . $user_id])) {
            return $response;
        }
        if (!$user_id || !Nevari_Helpers::is_patient($user_id)) {
            return Nevari_Helpers::error('forbidden', 'Customer settings can only be updated by authenticated patients.', 403);
        }

        $params = Nevari_Helpers::get_json_params($request);
        $settings = self::sanitize_customer_settings_payload($params, $user_id);
        if (is_wp_error($settings)) {
            return Nevari_Helpers::error(
                $settings->get_error_code(),
                $settings->get_error_message(),
                (int) ($settings->get_error_data('status') ?: 422)
            );
        }

        $display_name = trim((string) ($settings['displayName'] ?? ''));
        if ($display_name !== '') {
            wp_update_user([
                'ID' => (int) $user_id,
                'display_name' => $display_name,
            ]);
        }

        update_user_meta($user_id, self::CUSTOMER_SETTINGS_META_KEY, $settings);
        update_user_meta($user_id, 'billing_phone', (string) ($settings['phone'] ?? ''));
        update_user_meta($user_id, 'billing_address_1', (string) ($settings['address'] ?? ''));

        return Nevari_Helpers::success(self::customer_settings_payload($user_id));
    }

    public static function customers_profile_image_update(WP_REST_Request $request): WP_REST_Response {
        $user_id = get_current_user_id();
        if (!$user_id || !Nevari_Helpers::is_patient($user_id)) {
            return Nevari_Helpers::error('forbidden', 'Customer profile images can only be updated by authenticated patients.', 403);
        }
        if ($response = Nevari_Helpers::rate_limit('rest_customer_profile_image_write', 12, HOUR_IN_SECONDS, ['user:' . $user_id])) {
            return $response;
        }

        $params = Nevari_Helpers::get_json_params($request);
        $allowed_keys = ['filename', 'mime_type', 'data_base64'];
        foreach (array_keys($params) as $key) {
            if (!in_array((string) $key, $allowed_keys, true)) {
                return Nevari_Helpers::error('validation_error', 'Unexpected profile image field supplied.', 422);
            }
        }

        $filename = isset($params['filename']) ? sanitize_file_name((string) $params['filename']) : '';
        $mime_type = isset($params['mime_type']) ? sanitize_text_field((string) $params['mime_type']) : '';
        $data_base64 = isset($params['data_base64']) ? preg_replace('/\s+/', '', (string) $params['data_base64']) : '';
        $allowed_mimes = [
            'image/jpeg' => ['jpg', 'jpeg'],
            'image/png' => ['png'],
            'image/gif' => ['gif'],
            'image/webp' => ['webp'],
        ];
        $extension = strtolower((string) pathinfo($filename, PATHINFO_EXTENSION));

        if ($filename === '' || $data_base64 === '' || !isset($allowed_mimes[$mime_type]) || !in_array($extension, $allowed_mimes[$mime_type], true)) {
            return Nevari_Helpers::error('validation_error', 'A valid JPG, PNG, GIF, or WebP image is required.', 422);
        }

        $bytes = base64_decode($data_base64, true);
        if ($bytes === false || strlen($bytes) < 1 || strlen($bytes) > 2 * 1024 * 1024 || !@getimagesizefromstring($bytes)) {
            return Nevari_Helpers::error('validation_error', 'Profile image data is invalid or larger than 2 MB.', 422);
        }

        $upload = wp_upload_bits($filename, null, $bytes);
        if (!empty($upload['error'])) {
            return Nevari_Helpers::error('media_upload_failed', 'The profile image could not be uploaded.', 500);
        }

        $attachment_id = wp_insert_attachment([
            'post_mime_type' => $mime_type,
            'post_title' => sanitize_text_field(pathinfo($filename, PATHINFO_FILENAME)),
            'post_status' => 'inherit',
            'post_author' => $user_id,
        ], $upload['file']);
        if (is_wp_error($attachment_id) || !$attachment_id) {
            return Nevari_Helpers::error('media_upload_failed', 'The profile image attachment could not be created.', 500);
        }

        require_once ABSPATH . 'wp-admin/includes/image.php';
        $metadata = wp_generate_attachment_metadata((int) $attachment_id, $upload['file']);
        if ($metadata) {
            wp_update_attachment_metadata((int) $attachment_id, $metadata);
        }

        $url = esc_url_raw((string) wp_get_attachment_url((int) $attachment_id));
        update_user_meta($user_id, self::CUSTOMER_PROFILE_IMAGE_ID_META_KEY, (int) $attachment_id);
        update_user_meta($user_id, self::CUSTOMER_PROFILE_IMAGE_URL_META_KEY, $url);

        return Nevari_Helpers::success([
            'id' => (int) $attachment_id,
            'avatar_url' => $url,
            'profile_image' => $url,
            'profile' => Nevari_Helpers::user_summary($user_id),
        ], [], 201);
    }
    private static function role_change_allowed_targets(string $current_role): array {
        return match ($current_role) {
            'customer', 'patient' => ['doctor', 'pharmacist'],
            'doctor', 'pharmacist' => ['customer'],
            default => [],
        };
    }

    private static function role_change_primary_role(WP_User $user): string {
        foreach (['doctor', 'pharmacist', 'customer', 'patient'] as $role) {
            if (in_array($role, (array) $user->roles, true)) {
                return $role;
            }
        }
        return '';
    }

    public static function admin_users_change_role(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_admin_user_role_change', 12, MINUTE_IN_SECONDS, ['user:' . get_current_user_id()])) {
            return $response;
        }

        $user_id = (int) $request['id'];
        $target_role = sanitize_key((string) $request->get_param('target_role'));
        if ($user_id <= 0 || $target_role === '') {
            return Nevari_Helpers::error('validation_error', 'A valid user id and target_role are required.', 422);
        }

        $user = get_user_by('id', $user_id);
        if (!$user instanceof WP_User) {
            return Nevari_Helpers::error('user_not_found', 'The selected user could not be found.', 404);
        }

        $current_role = self::role_change_primary_role($user);
        if ($current_role === '') {
            return Nevari_Helpers::error('role_change_unsupported', 'This account cannot be changed with this flow.', 409);
        }

        $allowed_targets = self::role_change_allowed_targets($current_role);
        if (!in_array($target_role, $allowed_targets, true)) {
            return Nevari_Helpers::error('role_change_invalid_target', 'This role transition is not allowed.', 422);
        }

        $resolved_target_role = $target_role === 'customer' && !get_role('customer') ? 'subscriber' : $target_role;
        if (!get_role($resolved_target_role)) {
            return Nevari_Helpers::error('role_change_failed', 'The target role is not available on this site.', 409);
        }
        $user->set_role($resolved_target_role);

        if ($target_role === 'customer') {
            delete_user_meta($user_id, '_nevari_doctor_disabled');
        }

        clean_user_cache($user_id);
        $updated_user = get_user_by('id', $user_id);
        $summary = Nevari_Helpers::user_summary($user_id) ?: [
            'id' => $user_id,
            'display_name' => $updated_user ? $updated_user->display_name : '',
            'email' => $updated_user ? $updated_user->user_email : '',
            'roles' => $updated_user ? array_values((array) $updated_user->roles) : [$target_role],
        ];

        Nevari_Audit::log('security', 'nevari', 'admin.user_role_changed', 'success', [
            'actor_user_id' => get_current_user_id(),
            'related_user_id' => $user_id,
            'object_type' => 'user',
            'object_id' => $user_id,
            'from_role' => $current_role,
            'to_role' => $target_role,
            'message' => sprintf('Admin changed %s from %s to %s.', $updated_user ? $updated_user->display_name : ('User #' . $user_id), $current_role, $target_role),
        ]);

        return Nevari_Helpers::success([
            'user' => array_merge($summary, [
                'role' => $target_role,
                'primary_role' => $target_role,
            ]),
            'from_role' => $current_role,
            'target_role' => $target_role,
            'message' => sprintf('%s updated to %s.', $updated_user ? $updated_user->display_name : 'User', ucfirst($target_role)),
        ]);
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
        $availability = get_user_meta($doctor_id, '_nevari_availability', true);
        $availability = is_array($availability) ? $availability : [];
        if (!$request->get_param('date')) {
            return Nevari_Helpers::success([
                'doctor_user_id' => $doctor_id,
                'availability' => $availability,
            ]);
        }
        $date = sanitize_text_field((string) $request->get_param('date'));
        $slots = self::build_available_slots($doctor_id, $date, $availability);
        return Nevari_Helpers::success([
            'doctor_user_id' => $doctor_id,
            'date' => $date,
            'availability' => $availability,
            'slots' => $slots,
        ]);
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

    public static function doctors_products(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_products_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'doctor_products'])) {
            return $response;
        }
        if (!self::woo_available()) {
            return Nevari_Helpers::error('woocommerce_missing', 'WooCommerce is required for products.', 503);
        }
        $doctor_id = (int) $request['id'];
        if (!Nevari_Helpers::is_store_admin() && get_current_user_id() !== $doctor_id) {
            return Nevari_Helpers::error('forbidden', 'You can view only your own assigned products.', 403);
        }
        $category_ids = self::doctor_product_category_ids($doctor_id);
        if (!$category_ids) {
            return Nevari_Helpers::success([]);
        }
        $terms = get_terms([
            'taxonomy' => 'product_cat',
            'include' => $category_ids,
            'hide_empty' => false,
        ]);
        $slugs = array_values(array_filter(array_map(static function ($term) {
            return $term instanceof WP_Term ? $term->slug : '';
        }, is_array($terms) ? $terms : [])));
        if (!$slugs) {
            return Nevari_Helpers::success([]);
        }
        $products = wc_get_products([
            'limit' => min(100, max(1, (int) $request->get_param('per_page') ?: 100)),
            'status' => Nevari_Helpers::is_store_admin() ? ['publish', 'private', 'draft'] : 'publish',
            'category' => $slugs,
            'orderby' => 'date',
            'order' => 'DESC',
        ]);
        return Nevari_Helpers::success(array_map([__CLASS__, 'format_product'], is_array($products) ? $products : []));
    }

    public static function doctor_reviews_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_doctors_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'reviews'])) {
            return $response;
        }
        global $wpdb;
        $doctor_id = (int) $request['id'];
        $doctor = get_user_by('id', $doctor_id);
        if (!$doctor || !in_array('doctor', (array) $doctor->roles, true)) {
            return Nevari_Helpers::error('doctor_not_found', 'Doctor not found.', 404);
        }
        $rows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('appointment_reviews') . " WHERE doctor_user_id = %d AND status = 'approved' ORDER BY created_at DESC",
            $doctor_id
        ));
        return Nevari_Helpers::success([
            'doctor_user_id' => $doctor_id,
            'summary' => Nevari_Helpers::doctor_review_summary($doctor_id),
            'reviews' => array_map(['Nevari_Helpers', 'format_review_row'], $rows ?: []),
        ]);
    }

    private static function ensure_doctor_profile(int $doctor_user_id, array $params): int {
        $existing = get_posts([
            'post_type' => 'nevari_doctor_prof',
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
                'post_type' => 'nevari_doctor_prof',
                'post_status' => 'publish',
                'post_title' => $title,
                'post_content' => $content,
            ]);
            update_post_meta($profile_id, '_nevari_doctor_user_id', $doctor_user_id);
        }
        foreach (['license_number' => '_nevari_license_number', 'years_experience' => '_nevari_years_experience', 'bio_short' => '_nevari_bio_short'] as $input => $meta) {
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
        if (isset($params['product_category_ids']) && is_array($params['product_category_ids'])) {
            self::save_doctor_product_categories($doctor_user_id, $params['product_category_ids']);
        }
        return (int) $profile_id;
    }

    private static function upsert_doctor_settings(int $doctor_id, array $params): void {
        global $wpdb;
        $table = Nevari_Helpers::table('doctor_settings');
        $existing = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE doctor_user_id = %d", $doctor_id));
        $profile = get_posts(['post_type' => 'nevari_doctor_prof', 'meta_key' => '_nevari_doctor_user_id', 'meta_value' => $doctor_id, 'fields' => 'ids', 'numberposts' => 1]);
        $data = [
            'doctor_user_id' => $doctor_id,
            'profile_post_id' => $profile ? (int) $profile[0] : null,
            'license_number' => isset($params['license_number']) ? sanitize_text_field((string) $params['license_number']) : null,
            'position' => self::normalize_doctor_position($params['position'] ?? ($params['pricing_tier'] ?? 'specialist')),
            'is_available' => isset($params['is_available']) ? (int) Nevari_Helpers::bool_param($params['is_available']) : 1,
            'max_workload_per_week' => isset($params['max_workload_per_week']) ? max(1, (int) $params['max_workload_per_week']) : 40,
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
        $profile_ids = get_posts(['post_type' => 'nevari_doctor_prof', 'meta_key' => '_nevari_doctor_user_id', 'meta_value' => $user->ID, 'fields' => 'ids', 'numberposts' => 1]);
        $profile_id = $profile_ids ? (int) $profile_ids[0] : 0;
        $settings = $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('doctor_settings') . " WHERE doctor_user_id = %d", (int) $user->ID));
        $review_summary = Nevari_Helpers::doctor_review_summary((int) $user->ID);
        $roles = array_values(array_filter(array_map('sanitize_key', (array) $user->roles)));
        $profile_image = $profile_id ? get_the_post_thumbnail_url($profile_id, 'medium') : null;
        $avatar_url = esc_url_raw((string) get_user_meta((int) $user->ID, 'nevari_google_picture', true));
        if ($avatar_url === '') {
            $avatar_url = $profile_image ?: (get_avatar_url((int) $user->ID, ['size' => 128]) ?: '');
        }
        $data = [
            'id' => (int) $user->ID,
            'user_id' => (int) $user->ID,
            'display_name' => $user->display_name,
            'email' => $include_private || Nevari_Helpers::is_store_admin() ? $user->user_email : null,
            'avatar_url' => $avatar_url,
            'role' => $roles ? $roles[0] : '',
            'roles' => $roles,
            'store_currency' => self::store_currency(),
            'store_timezone' => self::store_timezone(),
            'profile_post_id' => $profile_id ?: null,
            'bio' => $profile_id ? wp_strip_all_tags(get_post_field('post_content', $profile_id)) : '',
            'bio_short' => $profile_id ? get_post_meta($profile_id, '_nevari_bio_short', true) : '',
            'specialties' => $profile_id ? wp_get_post_terms($profile_id, 'nevari_doctor_specialty', ['fields' => 'names']) : [],
            'languages' => $profile_id ? wp_get_post_terms($profile_id, 'nevari_doctor_language', ['fields' => 'names']) : [],
            'accepting_patients' => $settings ? (bool) $settings->accepts_new_patients : true,
            'telehealth_enabled' => $settings ? (bool) $settings->telehealth_enabled : true,
            'timezone' => $settings ? $settings->timezone : 'UTC',
            'position' => $settings ? self::normalize_doctor_position($settings->position ?? 'specialist') : 'specialist',
            'level_value' => self::doctor_position_level($settings ? (string) ($settings->position ?? 'specialist') : 'specialist'),
            'is_available' => $settings ? (bool) $settings->is_available : true,
            'max_workload_per_week' => $settings ? (int) $settings->max_workload_per_week : 40,
            'profile_image' => $profile_image,
            'disabled' => (bool) get_user_meta((int) $user->ID, '_nevari_doctor_disabled', true),
            'product_category_ids' => self::doctor_product_category_ids((int) $user->ID),
            'product_categories' => self::doctor_product_categories((int) $user->ID),
            'consultation_fee' => Nevari_Helpers::doctor_consultation_fee((int) $user->ID),
            'years_experience' => $profile_id ? (string) get_post_meta($profile_id, '_nevari_years_experience', true) : '',
            'rating_average' => $review_summary['average'],
            'reviews_count' => $review_summary['count'],
            'rating_distribution' => $review_summary['distribution'],
        ];
        if ($include_private || Nevari_Helpers::is_store_admin()) {
            $data['license_number'] = $settings ? $settings->license_number : null;
            $data['default_appointment_duration'] = $settings ? (int) $settings->default_appointment_duration : 30;
        }
        return $data;
    }

    private static function staff_directory_roles(): array {
        return ['doctor', 'pharmacist', 'administrator', 'admin'];
    }

    private static function is_staff_directory_user($user): bool {
        if (!($user instanceof WP_User)) {
            return false;
        }
        return (bool) array_intersect(self::staff_directory_roles(), (array) $user->roles);
    }

    private static function save_doctor_product_categories(int $doctor_id, array $category_ids): void {
        $valid_ids = [];
        foreach ($category_ids as $category_id) {
            $term = get_term((int) $category_id, 'product_cat');
            if ($term instanceof WP_Term && !is_wp_error($term)) {
                $valid_ids[] = (int) $term->term_id;
            }
        }
        update_user_meta($doctor_id, '_nevari_product_category_ids', array_values(array_unique($valid_ids)));
    }

    private static function doctor_product_category_ids(int $doctor_id): array {
        $stored = get_user_meta($doctor_id, '_nevari_product_category_ids', true);
        if (!is_array($stored)) {
            return [];
        }
        return array_values(array_filter(array_map('intval', $stored)));
    }

    private static function doctor_product_categories(int $doctor_id): array {
        $ids = self::doctor_product_category_ids($doctor_id);
        if (!$ids) {
            return [];
        }
        $terms = get_terms([
            'taxonomy' => 'product_cat',
            'include' => $ids,
            'hide_empty' => false,
        ]);
        if (!is_array($terms)) {
            return [];
        }
        return array_values(array_map(static function ($term) {
            return [
                'id' => (int) $term->term_id,
                'name' => $term->name,
                'slug' => $term->slug,
            ];
        }, array_filter($terms, static function ($term) {
            return $term instanceof WP_Term;
        })));
    }

    private static function build_available_slots(int $doctor_id, string $date, array $availability): array {
        global $wpdb;
        $duration = self::doctor_minimum_appointment_duration($doctor_id);
        $weekday = strtolower(gmdate('l', strtotime($date)));
        $ranges = isset($availability[$weekday]) && is_array($availability[$weekday]) ? $availability[$weekday] : [];
        if (!$ranges) {
            return [];
        }
        $booked = $wpdb->get_results($wpdb->prepare(
            "SELECT start_at, end_at FROM " . Nevari_Helpers::table('appointments') . " WHERE doctor_user_id = %d AND status IN ('awaiting_payment','requested','confirmed','checked_in') AND DATE(start_at) = %s",
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

    private static function doctor_minimum_appointment_duration(int $doctor_id): int {
        global $wpdb;
        $settings = $wpdb->get_row($wpdb->prepare("SELECT default_appointment_duration FROM " . Nevari_Helpers::table('doctor_settings') . " WHERE doctor_user_id = %d", $doctor_id));
        return $settings ? max(5, (int) $settings->default_appointment_duration) : 30;
    }

    private static function normalize_doctor_position($value): string {
        $position = sanitize_key((string) $value);
        return in_array($position, ['junior', 'senior', 'specialist'], true) ? $position : 'specialist';
    }

    private static function doctor_position_level(string $position): int {
        return match (self::normalize_doctor_position($position)) {
            'junior' => 1,
            'senior' => 2,
            default => 3,
        };
    }

    private static function appointment_week_bounds(string $start): array {
        $timestamp = strtotime($start . ' UTC');
        if (!$timestamp) {
            return ['', ''];
        }
        $week_start = strtotime('monday this week', $timestamp);
        if ((int) gmdate('N', $timestamp) === 1) {
            $week_start = strtotime(gmdate('Y-m-d 00:00:00', $timestamp) . ' UTC');
        }
        $week_end = $week_start + (7 * DAY_IN_SECONDS);
        return [gmdate('Y-m-d H:i:s', $week_start), gmdate('Y-m-d H:i:s', $week_end)];
    }

    private static function current_weekly_appointment_count(int $doctor_id, string $week_start, string $week_end): int {
        global $wpdb;
        if (!$doctor_id || !$week_start || !$week_end) {
            return 0;
        }
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*)
             FROM " . Nevari_Helpers::table('appointments') . "
             WHERE doctor_user_id = %d
               AND start_at >= %s
               AND start_at < %s
               AND status IN ('awaiting_payment','requested','confirmed','completed')",
            $doctor_id,
            $week_start,
            $week_end
        ));
    }

    private static function eligible_doctors_for_auto_assignment(string $start, string $end): array {
        global $wpdb;

        $users = get_users([
            'role' => 'doctor',
            'orderby' => 'display_name',
            'order' => 'ASC',
        ]);
        if (!$users) {
            return [];
        }

        [$week_start, $week_end] = self::appointment_week_bounds($start);
        $eligible = [];
        foreach ($users as $user) {
            if (!$user instanceof WP_User) {
                continue;
            }
            if (get_user_meta((int) $user->ID, '_nevari_doctor_disabled', true)) {
                continue;
            }

            $settings = $wpdb->get_row($wpdb->prepare(
                "SELECT * FROM " . Nevari_Helpers::table('doctor_settings') . " WHERE doctor_user_id = %d",
                (int) $user->ID
            ));
            if ($settings && !(bool) $settings->is_available) {
                continue;
            }

            $availability = get_user_meta((int) $user->ID, '_nevari_availability', true);
            $availability = is_array($availability) ? $availability : [];
            $minimum_duration = $settings ? max(5, (int) $settings->default_appointment_duration) : 30;
            if (!self::appointment_duration_is_available((int) $user->ID, $start, $end, $availability, $minimum_duration)) {
                continue;
            }

            $position = self::normalize_doctor_position($settings->position ?? 'specialist');
            $weekly_count = self::current_weekly_appointment_count((int) $user->ID, $week_start, $week_end);
            $max_workload = $settings ? max(1, (int) $settings->max_workload_per_week) : 40;
            if ($weekly_count >= $max_workload) {
                continue;
            }

            $eligible[] = [
                'doctor' => $user,
                'position' => $position,
                'level_value' => self::doctor_position_level($position),
                'weekly_count' => $weekly_count,
                'max_workload_per_week' => $max_workload,
            ];
        }

        return $eligible;
    }

    private static function last_assigned_doctor_id(string $position): int {
        global $wpdb;

        $table = Nevari_Helpers::table('round_robin_tracker');
        return (int) $wpdb->get_var($wpdb->prepare(
            "SELECT last_doctor_id FROM {$table} WHERE doctor_level = %s LIMIT 1",
            $position
        ));
    }

    private static function round_robin_rank_for(int $last_doctor_id, int $doctor_id, array $group_doctor_ids): int {
        $ids = array_values(array_unique(array_map('intval', $group_doctor_ids)));
        sort($ids);
        if (!$ids) {
            return 0;
        }
        $last_index = array_search($last_doctor_id, $ids, true);
        if ($last_index === false) {
            $last_index = -1;
        }
        $doctor_index = array_search($doctor_id, $ids, true);
        if ($doctor_index === false) {
            return count($ids);
        }
        // Rank 0 must go to the doctor AFTER the last-assigned one; without the
        // extra -1 the previously assigned doctor ranks first and wins every time.
        return ($doctor_index - $last_index - 1 + 2 * count($ids)) % count($ids);
    }

    private static function select_auto_assigned_doctor(string $start, string $end): ?WP_User {
        global $wpdb;

        $eligible = self::eligible_doctors_for_auto_assignment($start, $end);
        if (!$eligible) {
            return null;
        }

        $by_level = [
            'specialist' => [],
            'senior' => [],
            'junior' => [],
        ];
        foreach ($eligible as $row) {
            $by_level[$row['position']][] = $row;
        }

        foreach (['specialist', 'senior', 'junior'] as $position) {
            if (empty($by_level[$position])) {
                continue;
            }
            $doctor_ids = array_map(static fn($row) => (int) $row['doctor']->ID, $by_level[$position]);
            // Read the tracker once per level and precompute each doctor's rank,
            // instead of querying inside the usort comparator (which runs
            // O(n log n) times and issued two identical SELECTs per comparison).
            $last_doctor_id = self::last_assigned_doctor_id($position);
            $ranks = [];
            foreach ($doctor_ids as $candidate_id) {
                $ranks[$candidate_id] = self::round_robin_rank_for($last_doctor_id, $candidate_id, $doctor_ids);
            }
            usort($by_level[$position], static function (array $left, array $right) use ($ranks) {
                if ($left['weekly_count'] !== $right['weekly_count']) {
                    return $left['weekly_count'] <=> $right['weekly_count'];
                }
                $leftRank = $ranks[(int) $left['doctor']->ID] ?? PHP_INT_MAX;
                $rightRank = $ranks[(int) $right['doctor']->ID] ?? PHP_INT_MAX;
                if ($leftRank !== $rightRank) {
                    return $leftRank <=> $rightRank;
                }
                return strcasecmp((string) $left['doctor']->display_name, (string) $right['doctor']->display_name);
            });
            return $by_level[$position][0]['doctor'];
        }

        return null;
    }

    private static function touch_round_robin_tracker(string $position, int $doctor_id): void {
        global $wpdb;

        $position = self::normalize_doctor_position($position);
        $table = Nevari_Helpers::table('round_robin_tracker');
        $existing = (int) $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE doctor_level = %s", $position));
        $data = [
            'doctor_level' => $position,
            'last_doctor_id' => $doctor_id,
            'updated_at' => Nevari_Helpers::now(),
        ];
        if ($existing) {
            $wpdb->update($table, $data, ['id' => $existing], ['%s', '%d', '%s'], ['%d']);
            return;
        }
        $wpdb->insert($table, $data, ['%s', '%d', '%s']);
    }

    private static function appointment_duration_is_available(int $doctor_id, string $start, string $end, array $availability, int $minimum_duration): bool {
        $start_ts = strtotime($start . ' UTC');
        $end_ts = strtotime($end . ' UTC');
        if (!$start_ts || !$end_ts || $end_ts <= $start_ts) {
            return false;
        }
        $date_key = gmdate('Y-m-d', $start_ts);
        if ($date_key !== gmdate('Y-m-d', $end_ts - 1)) {
            return false;
        }
        $available_slots = self::build_available_slots($doctor_id, $date_key, $availability);
        $available_starts = [];
        foreach ($available_slots as $slot) {
            $slot_start = Nevari_Helpers::normalize_datetime($slot['start_at'] ?? null);
            if ($slot_start) {
                $available_starts[$slot_start] = true;
            }
        }
        for ($cursor = $start_ts; $cursor < $end_ts; $cursor += ($minimum_duration * 60)) {
            $segment_start = gmdate('Y-m-d H:i:s', $cursor);
            if (empty($available_starts[$segment_start])) {
                return false;
            }
        }
        return true;
    }

    public static function appointments_availability(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'availability'])) {
            return $response;
        }

        $date = sanitize_text_field((string) $request->get_param('date'));
        if (!$date || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return Nevari_Helpers::error('validation_error', 'A valid date is required.', 422);
        }
        $time = sanitize_text_field((string) $request->get_param('time'));
        if (!$time || !preg_match('/^\d{2}:\d{2}$/', $time)) {
            return Nevari_Helpers::error('validation_error', 'A valid time is required.', 422);
        }

        $duration_minutes = max(5, (int) $request->get_param('duration_minutes'));
        if (!$duration_minutes) {
            $duration_minutes = 30;
        }
        $start_at = Nevari_Helpers::normalize_datetime($date . ' ' . $time . ':00');
        $start_timestamp = $start_at ? strtotime($start_at . ' UTC') : false;
        if (!$start_at || !$start_timestamp || $start_timestamp <= time()) {
            return Nevari_Helpers::error('invalid_datetime', 'Appointment must be in the future.', 422);
        }
        $end_at = gmdate('Y-m-d H:i:s', $start_timestamp + ($duration_minutes * 60));
        if (gmdate('Y-m-d', $start_timestamp) !== gmdate('Y-m-d', strtotime($end_at . ' UTC') - 1)) {
            return Nevari_Helpers::error('invalid_duration', 'Appointment duration cannot cross into the next day.', 422);
        }

        $eligible = self::eligible_doctors_for_auto_assignment($start_at, $end_at);
        $doctors = array_values(array_filter(array_map(static function (array $row) {
            $summary = Nevari_Helpers::user_summary((int) ($row['doctor']->ID ?? 0));
            if (!$summary) {
                return null;
            }
            return [
                ...$summary,
                'position' => $row['position'] ?? 'specialist',
                'weekly_count' => (int) ($row['weekly_count'] ?? 0),
                'max_workload_per_week' => (int) ($row['max_workload_per_week'] ?? 0),
            ];
        }, $eligible)));

        return Nevari_Helpers::success([
            'date' => $date,
            'time' => $time,
            'duration_minutes' => $duration_minutes,
            'available' => !empty($doctors),
            'doctor_count' => count($doctors),
            'doctors' => $doctors,
        ]);
    }

    public static function appointments_index(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_read', 120, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'index'])) {
            return $response;
        }
        global $wpdb;
        $page = max(1, (int) $request->get_param('page') ?: 1);
        $per_page = min(100, max(1, (int) $request->get_param('per_page') ?: 20));
        $offset = ($page - 1) * $per_page;
        $order = strtoupper((string) $request->get_param('order')) === 'ASC' ? 'ASC' : 'DESC';
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
        $sql = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY start_at {$order} LIMIT %d OFFSET %d";
        $rows = $wpdb->get_results($wpdb->prepare($sql, array_merge($params, [$per_page, $offset])));
        Nevari_Helpers::prime_appointment_caches($rows ?: []);
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
        $order_id = isset($params['order_id']) ? (int) $params['order_id'] : 0;
        $order = null;
        if (Nevari_Helpers::is_store_admin()) {
            $patient_id = !empty($params['patient_user_id']) ? (int) $params['patient_user_id'] : 0;
        } elseif (Nevari_Helpers::is_doctor()) {
            $patient_id = !empty($params['patient_user_id']) ? (int) $params['patient_user_id'] : 0;
        } else {
            $patient_id = get_current_user_id();
        }
        $type = isset($params['type']) ? sanitize_key((string) $params['type']) : 'video';
        $start = Nevari_Helpers::normalize_datetime($params['start_at'] ?? null);
        $end = Nevari_Helpers::normalize_datetime($params['end_at'] ?? null);
        $reason = isset($params['reason']) && trim((string) $params['reason']) !== '' ? sanitize_textarea_field((string) $params['reason']) : 'Doctor consultation booking';
        $title = isset($params['title']) ? sanitize_text_field((string) $params['title']) : '';

        if ($order_id) {
            $order = self::get_order_scoped($order_id);
            if (is_wp_error($order)) {
                return Nevari_Helpers::error($order->get_error_code(), $order->get_error_message(), (int) $order->get_error_data('status') ?: 404);
            }
            if (!$patient_id) {
                $patient_id = (int) $order->get_user_id();
            }
        }

        if (!$patient_id || !$start || !$end || strtotime($end) <= strtotime($start)) {
            return Nevari_Helpers::error('validation_error', 'Valid start_at/end_at are required.', 422);
        }

        $doctor = null;
        if (!$doctor_id && Nevari_Helpers::is_patient() && !Nevari_Helpers::is_store_admin()) {
            $doctor = self::select_auto_assigned_doctor($start, $end);
            if (!$doctor instanceof WP_User) {
                return Nevari_Helpers::error('doctor_unavailable', 'No doctor is available for the selected date and time.', 409);
            }
            $doctor_id = (int) $doctor->ID;
        }

        if (!$doctor_id) {
            return Nevari_Helpers::error('validation_error', 'doctor_user_id is required for this booking flow.', 422);
        }

        $doctor = $doctor instanceof WP_User ? $doctor : get_user_by('id', $doctor_id);
        if (!$doctor || !in_array('doctor', (array) $doctor->roles, true) || get_user_meta($doctor_id, '_nevari_doctor_disabled', true)) {
            return Nevari_Helpers::error('doctor_not_found', 'Doctor not found or inactive.', 404);
        }
        if (Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) {
            if ($doctor_id !== get_current_user_id()) {
                return Nevari_Helpers::error('forbidden', 'Doctors can create appointments only for themselves.', 403);
            }
            if (!Nevari_Helpers::doctor_patient_link_exists($doctor_id, $patient_id)) {
                if (!$order_id || !$order || (int) $order->get_meta('_nevari_assigned_doctor_user_id') !== $doctor_id || (int) $order->get_user_id() !== $patient_id) {
                    return Nevari_Helpers::error('forbidden_patient_scope', 'Doctor can schedule appointments only for assigned patients.', 403);
                }
            }
        }
        $allowed_types = ['video', 'phone', 'in_person', 'async_form'];
        if (!in_array($type, $allowed_types, true)) {
            return Nevari_Helpers::error('validation_error', 'Invalid appointment type.', 422);
        }
        if (strtotime($start) <= time()) {
            return Nevari_Helpers::error('invalid_datetime', 'Appointment must be in the future.', 422);
        }
        $minimum_duration = self::doctor_minimum_appointment_duration($doctor_id);
        $requested_duration = (int) round((strtotime($end) - strtotime($start)) / 60);
        if ($requested_duration < $minimum_duration || $requested_duration % $minimum_duration !== 0 || $requested_duration > ($minimum_duration * 4)) {
            return Nevari_Helpers::error('invalid_duration', sprintf('Appointment duration must be between %1$d and %2$d minutes in %1$d minute intervals.', $minimum_duration, $minimum_duration * 4), 422);
        }
        $availability = get_user_meta($doctor_id, '_nevari_availability', true);
        $availability = is_array($availability) ? $availability : [];
        if (!self::appointment_duration_is_available($doctor_id, $start, $end, $availability, $minimum_duration)) {
            Nevari_Audit::log('consultation', 'nevari', 'appointment.doctor_unavailable', 'error', ['related_user_id' => $patient_id, 'message' => 'Doctor unavailable for requested slot.']);
            return Nevari_Helpers::error('doctor_unavailable', 'Doctor is not available for the selected date and time.', 409);
        }
        $fee = Nevari_Helpers::doctor_consultation_fee($doctor_id);
        if ($fee <= 0) {
            return Nevari_Helpers::error('consultation_fee_missing', 'A valid global consultation fee is not configured.', 422);
        }
        $table = Nevari_Helpers::table('appointments');
        $lock_name = 'nevari_appointment_' . $doctor_id . '_' . md5($start . '|' . $end);
        $lock_acquired = (int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, 10)', $lock_name));
        if ($lock_acquired !== 1) {
            return Nevari_Helpers::error('appointment_slot_lock_failed', 'This slot is being booked by another customer. Try again in a moment.', 409);
        }
        $conflict = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$table} WHERE doctor_user_id = %d AND ((status IN ('requested','confirmed','checked_in') OR (status = 'awaiting_payment' AND (reserved_until IS NULL OR reserved_until > %s)))) AND start_at < %s AND end_at > %s",
            $doctor_id,
            Nevari_Helpers::now(),
            $end,
            $start
        ));
        if ($conflict) {
            $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock_name));
            Nevari_Audit::log('consultation', 'nevari', 'appointment.slot_unavailable', 'error', ['related_user_id' => $patient_id, 'message' => 'Appointment slot unavailable.']);
            return Nevari_Helpers::error('appointment_slot_unavailable', 'This appointment slot is no longer available.', 409);
        }
        $now = Nevari_Helpers::now();
        $reserved_until = gmdate('Y-m-d H:i:s', time() + (30 * MINUTE_IN_SECONDS));
        $wpdb->insert($table, [
            'patient_user_id' => $patient_id,
            'doctor_user_id' => $doctor_id,
            'order_id' => null,
            'type' => $type,
            'title' => $title,
            'status' => 'awaiting_payment',
            'payment_status' => 'pending',
            'payment_required' => 1,
            'start_at' => $start,
            'end_at' => $end,
            'duration_minutes' => $requested_duration,
            'timezone' => isset($params['timezone']) ? sanitize_text_field((string) $params['timezone']) : 'UTC',
            'reason' => $reason,
            'symptoms' => isset($params['symptoms']) ? Nevari_Helpers::json_encode_safe($params['symptoms']) : null,
            'intake_form' => isset($params['intake_form']) ? Nevari_Helpers::json_encode_safe($params['intake_form']) : null,
            'reserved_until' => $reserved_until,
            'created_by' => get_current_user_id(),
            'created_at' => $now,
            'updated_at' => $now,
        ]);
        $appointment_id = (int) $wpdb->insert_id;
        if ($appointment_id < 1) {
            $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock_name));
            return Nevari_Helpers::error('appointment_create_failed', 'Appointment could not be reserved.', 500);
        }
        $settings_row = $wpdb->get_row($wpdb->prepare(
            "SELECT position FROM " . Nevari_Helpers::table('doctor_settings') . " WHERE doctor_user_id = %d",
            $doctor_id
        ));
        self::touch_round_robin_tracker((string) ($settings_row->position ?? 'specialist'), $doctor_id);
        Nevari_Helpers::ensure_doctor_patient_link($doctor_id, $patient_id, 'appointment');
        $invoice = self::create_or_refresh_appointment_invoice($appointment_id, $patient_id, $doctor_id, $fee);
        if (!$invoice) {
            $wpdb->delete($table, ['id' => $appointment_id], ['%d']);
            $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock_name));
            return Nevari_Helpers::error('appointment_invoice_create_failed', 'Appointment invoice could not be created.', 500);
        }
        $auto_paid_by_quota = self::maybe_auto_pay_appointment_invoice_from_quota($invoice, $appointment_id, $patient_id);
        $wpdb->get_var($wpdb->prepare('SELECT RELEASE_LOCK(%s)', $lock_name));
        if ($auto_paid_by_quota) {
            Nevari_Plugin::instance()->handle_custom_appointment_payment_complete($appointment_id);
        } else {
            Nevari_Plugin::instance()->schedule_appointment_reservation_expiry($appointment_id, $reserved_until);
        }
        $patient = get_user_by('id', $patient_id);
        $doctor = get_user_by('id', $doctor_id);
        $payment_link = Nevari_Helpers::appointment_invoice_payment_url($invoice);
        if (!$auto_paid_by_quota && $patient && is_email($patient->user_email) && $payment_link) {
            $appointment_start = gmdate('F j, Y \\a\\t g:i A', strtotime((string) $start . ' UTC'));
            $appointment_date = gmdate('F j, Y', strtotime((string) $start . ' UTC'));
            $appointment_time = gmdate('g:i A', strtotime((string) $start . ' UTC'));
            $payment_link_html = [
                'html' => sprintf('<div style="margin:24px 0 12px;"><a href="%1$s" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E2955;color:#ffffff;text-decoration:none;font-weight:700;">Pay Now</a></div>', esc_url($payment_link)),
                'text' => $payment_link,
            ];
            Nevari_Emails::queue_or_send([
                'template_key' => 'appointment_requested',
                'recipient_email' => $patient->user_email,
                'related_object_type' => 'appointment',
                'related_object_id' => $appointment_id,
                'variables' => [
                    'patient_name' => $patient->display_name ?: 'Patient',
                    'doctor_name' => $doctor ? $doctor->display_name : 'Doctor',
                    'appointment_start' => $appointment_start,
                    'appointment_date' => $appointment_date,
                    'appointment_time' => $appointment_time,
                    'appointment_duration' => '30 minutes',
                    'appointment_reference' => 'APT-' . str_pad((string) $appointment_id, 6, '0', STR_PAD_LEFT),
                    'order_id' => 0,
                    'payment_link' => $payment_link,
                    'payment_link_html' => $payment_link_html,
                    'google_meet_link' => '',
                    'google_meet_link_html' => '',
                    'invoice_number' => (string) $invoice->invoice_number,
                ],
                'body_html' => sprintf(
                    '<p>Hello %1$s,</p><p>Your appointment with %2$s is pending payment.</p><p>Your appointment has been created for %3$s at %4$s.</p><p><strong>Reference:</strong> %5$s<br /><strong>Invoice:</strong> %6$s</p><p>This booking expires after 10 minutes if payment is not completed.</p><div style="margin:24px 0 12px;"><a href="%7$s" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#0E2955;color:#ffffff;text-decoration:none;font-weight:700;">Pay Now</a></div><p>You can also view this booking inside your Nevari dashboard.</p>',
                    esc_html($patient->display_name ?: 'Patient'),
                    esc_html($doctor ? $doctor->display_name : 'Doctor'),
                    esc_html($appointment_date),
                    esc_html($appointment_time),
                    esc_html('APT-' . str_pad((string) $appointment_id, 6, '0', STR_PAD_LEFT)),
                    esc_html((string) $invoice->invoice_number),
                    esc_url($payment_link)
                ),
                'body_text' => sprintf(
                    'Hello %1$s, your appointment with %2$s is pending payment for %3$s at %4$s. Reference: %5$s. Invoice: %6$s. This booking expires after 10 minutes if unpaid. Pay now: %7$s',
                    $patient->display_name ?: 'Patient',
                    $doctor ? $doctor->display_name : 'Doctor',
                    $appointment_date,
                    $appointment_time,
                    'APT-' . str_pad((string) $appointment_id, 6, '0', STR_PAD_LEFT),
                    (string) $invoice->invoice_number,
                    $payment_link
                ),
            ], false);
        }
        Nevari_Audit::log('consultation', 'nevari', 'appointment.created', 'success', ['appointment_id' => $appointment_id, 'related_user_id' => $patient_id, 'message' => 'Appointment created.']);

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
        if (isset($params['title']) && (Nevari_Helpers::is_doctor() || Nevari_Helpers::is_store_admin())) { $data['title'] = sanitize_text_field((string) $params['title']); }
        if (isset($params['duration_minutes']) && (Nevari_Helpers::is_doctor() || Nevari_Helpers::is_store_admin())) { $data['duration_minutes'] = max(0, (int) $params['duration_minutes']); }
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
        $old_start_at = (string) $appointment->start_at;

        if (str_ends_with($route, '/cancel')) {
            $data['status'] = 'cancelled';
            $data['reserved_until'] = null;
            $data['cancelled_at'] = Nevari_Helpers::now();
            $data['cancellation_reason'] = isset($params['reason']) ? sanitize_textarea_field((string) $params['reason']) : null;
            $data['cancelled_by'] = get_current_user_id();
            $action = 'appointment.cancelled';
        } elseif (str_ends_with($route, '/confirm')) {
            if (!Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) { return Nevari_Helpers::error('forbidden', 'Only doctors or admins can confirm appointments.', 403); }
            $data['status'] = 'confirmed';
            $action = 'appointment.confirmed';
        } elseif (str_ends_with($route, '/complete')) {
            if (!Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) { return Nevari_Helpers::error('forbidden', 'Only doctors or admins can complete appointments.', 403); }
            $doctor_notes = isset($params['doctor_notes']) ? trim(wp_strip_all_tags((string) $params['doctor_notes'])) : '';
            if ($doctor_notes === '') {
                return Nevari_Helpers::error('validation_error', 'Doctor remarks are required before completing this appointment.', 422);
            }
            $data['status'] = 'completed';
            $data['completed_at'] = Nevari_Helpers::now();
            $data['doctor_notes'] = wp_kses_post((string) $params['doctor_notes']);
            $action = 'appointment.completed';
        } elseif (str_ends_with($route, '/reschedule')) {
            $start = Nevari_Helpers::normalize_datetime($params['start_at'] ?? null);
            $end = Nevari_Helpers::normalize_datetime($params['end_at'] ?? null);
            if (!$start || !$end || strtotime($end) <= strtotime($start)) { return Nevari_Helpers::error('validation_error', 'Valid start_at and end_at are required.', 422); }
            if (strtotime($start) <= time()) {
                return Nevari_Helpers::error('invalid_datetime', 'Appointment must be in the future.', 422);
            }
            $conflict = (int) $wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM " . Nevari_Helpers::table('appointments') . " WHERE doctor_user_id = %d AND id <> %d AND ((status IN ('requested','confirmed','checked_in') OR (status = 'awaiting_payment' AND (reserved_until IS NULL OR reserved_until > %s)))) AND start_at < %s AND end_at > %s",
                (int) $appointment->doctor_user_id,
                (int) $appointment->id,
                Nevari_Helpers::now(),
                $end,
                $start
            ));
            if ($conflict) {
                return Nevari_Helpers::error('appointment_slot_unavailable', 'This appointment slot is no longer available.', 409);
            }
            $data['start_at'] = $start;
            $data['end_at'] = $end;
            $data['duration_minutes'] = (int) round((strtotime($end) - strtotime($start)) / 60);
            $data['status'] = 'confirmed';
            $data['rescheduled_at'] = Nevari_Helpers::now();
            $data['customer_reminder_24h_sent_at'] = null;
            $data['customer_reminder_1h_sent_at'] = null;
            $data['customer_reminder_2h_sent_at'] = null;
            $data['customer_reminder_30m_sent_at'] = null;
            $data['customer_reminder_5m_sent_at'] = null;
            $data['customer_appointment_start_sent_at'] = null;
            $data['doctor_reminder_24h_sent_at'] = null;
            $data['doctor_reminder_1h_sent_at'] = null;
            $data['doctor_reminder_2h_sent_at'] = null;
            $data['doctor_reminder_30m_sent_at'] = null;
            $data['doctor_reminder_5m_sent_at'] = null;
            $data['doctor_appointment_start_sent_at'] = null;
            $data['customer_ending_soon_sent_at'] = null;
            $data['doctor_ending_soon_sent_at'] = null;
            $data['customer_followup_sent_at'] = null;
            $data['patient_waiting_notify_count'] = 0;
            $data['patient_waiting_notify_last_at'] = null;
            $data['doctor_waiting_notify_count'] = 0;
            $data['doctor_waiting_notify_last_at'] = null;
            $data['patient_join_token_hash'] = null;
            $data['doctor_join_token_hash'] = null;
            $data['join_valid_from_at'] = null;
            $data['join_expires_at'] = null;
            $data['patient_checked_in_at'] = null;
            $data['doctor_checked_in_at'] = null;
            $data['missed_attendance_at'] = null;
            $data['missed_attendance_role'] = null;
            $data['status'] = 'confirmed';
            $action = 'appointment.rescheduled';
        } elseif (str_ends_with($route, '/notes')) {
            if (!Nevari_Helpers::is_doctor() && !Nevari_Helpers::is_store_admin()) { return Nevari_Helpers::error('forbidden', 'Only doctors or admins can update notes.', 403); }
            $data['doctor_notes'] = isset($params['doctor_notes']) ? wp_kses_post((string) $params['doctor_notes']) : '';
            $action = 'appointment.notes_updated';
        }

        Nevari_Audit::log('consultation', 'nevari', 'appointment.cancel_trace', 'success', [
            'appointment_id' => (int) $appointment->id,
            'object_type' => 'appointment',
            'object_id' => (int) $appointment->id,
            'order_id' => isset($appointment->order_id) ? (int) $appointment->order_id : 0,
            'related_user_id' => (int) $appointment->patient_user_id,
            'message' => 'Preparing appointment action update.',
                'metadata' => [
                    'table' => Nevari_Helpers::table('appointments'),
                    'route' => $route,
                    'action' => $action,
                    'before_status' => (string) ($appointment->status ?? ''),
                    'before_payment_status' => (string) ($appointment->payment_status ?? ''),
                    'before_reserved_until' => (string) ($appointment->reserved_until ?? ''),
                'request_payload' => $params,
            ],
        ]);

        $update_result = $wpdb->update(Nevari_Helpers::table('appointments'), $data, ['id' => (int) $appointment->id]);
        if ($action === 'appointment.cancelled') {
            self::sync_cancelled_appointment_order($appointment);
            self::sync_cancelled_appointment_invoice($appointment);
        }
        $updated = self::get_appointment_row((int) $appointment->id);
        if ($action === 'appointment.cancelled') {
            Nevari_Audit::log('consultation', 'nevari', 'appointment.cancel_trace', $updated ? 'success' : 'error', [
                'appointment_id' => (int) $appointment->id,
                'object_type' => 'appointment',
                'object_id' => (int) $appointment->id,
                'order_id' => isset($appointment->order_id) ? (int) $appointment->order_id : 0,
                'related_user_id' => (int) $appointment->patient_user_id,
                'error_code' => $updated ? null : 'post_cancel_read_failed',
                'message' => $updated
                    ? 'Completed cancellation update and reread appointment state.'
                    : 'Appointment could not be reread after cancellation update.',
                'metadata' => [
                    'table' => Nevari_Helpers::table('appointments'),
                    'update_result' => $update_result,
                    'wpdb_last_error' => (string) $wpdb->last_error,
                    'after_status' => (string) ($updated->status ?? ''),
                    'after_payment_status' => (string) ($updated->payment_status ?? ''),
                    'after_reserved_until' => (string) ($updated->reserved_until ?? ''),
                    'after_cancelled_at' => (string) ($updated->cancelled_at ?? ''),
                ],
            ]);
        }
        if ($updated && $updated->status === 'confirmed' && $updated->payment_status === 'paid') {
            Nevari_Plugin::instance()->schedule_appointment_reminder((int) $updated->id, (string) $updated->start_at);
        }
        if ($updated && $action === 'appointment.cancelled') {
            Nevari_Plugin::instance()->send_appointment_cancellation_emails($updated);
        }
        if ($updated && $action === 'appointment.rescheduled') {
            Nevari_Plugin::instance()->send_appointment_reschedule_emails($updated, $old_start_at);
        }
        if ($updated && in_array($action, ['appointment.completed', 'appointment.notes_updated'], true)) {
            Nevari_Plugin::instance()->maybe_send_appointment_doctor_note_email($updated);
        }
        Nevari_Audit::log('consultation', 'nevari', $action, 'success', ['appointment_id' => (int) $appointment->id, 'related_user_id' => (int) $appointment->patient_user_id]);
        return Nevari_Helpers::success(Nevari_Helpers::format_appointment($updated));
    }

    public static function appointment_checkout(WP_REST_Request $request): WP_REST_Response {
        $appointment = self::get_appointment_row((int) $request['id']);
        if (!$appointment || !Nevari_Helpers::can_view_appointment($appointment)) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        $invoice = self::get_appointment_invoice_by_appointment_id((int) $appointment->id);
        if ($invoice) {
            $payload = self::appointment_invoice_payment_data($invoice);
            $payload['appointment'] = Nevari_Helpers::format_appointment($appointment);
            return Nevari_Helpers::success($payload);
        }
        if (!$appointment->order_id || !self::woo_available()) {
            return Nevari_Helpers::error('appointment_checkout_unavailable', 'Appointment checkout is not available.', 404);
        }
        $order = wc_get_order((int) $appointment->order_id);
        if (!$order) {
            return Nevari_Helpers::error('order_not_found', 'Associated order not found.', 404);
        }
        $payment_status = Nevari_Helpers::appointment_payment_status($appointment, $order);
        return Nevari_Helpers::success([
            'appointment' => Nevari_Helpers::format_appointment($appointment),
            'order_id' => (int) $order->get_id(),
            'order_number' => $order->get_order_number(),
            'invoice_number' => self::invoice_number_for_order($order),
            'payment_token' => $order->needs_payment() ? self::invoice_payment_token($order) : null,
            'payment_url' => $order->needs_payment() ? self::branded_invoice_payment_url($order) : null,
            'payment_status' => $payment_status,
            'total' => (float) $order->get_total(),
            'currency' => $order->get_currency(),
        ]);
    }

    public static function appointment_confirmation(WP_REST_Request $request): WP_REST_Response {
        $appointment = self::get_appointment_row((int) $request['id']);
        if (!$appointment || !Nevari_Helpers::can_view_appointment($appointment)) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        $invoice = self::get_appointment_invoice_by_appointment_id((int) $appointment->id);
        $order = $appointment->order_id && self::woo_available() ? wc_get_order((int) $appointment->order_id) : null;
        $payment_status = Nevari_Helpers::appointment_payment_status($appointment, $order, $invoice);
        $formatted = Nevari_Helpers::format_appointment($appointment);
        return Nevari_Helpers::success([
            'appointment' => $formatted,
            'is_confirmed' => in_array((string) $appointment->status, ['confirmed', 'checked_in', 'completed'], true) && $payment_status === 'paid',
            'order_number' => $order ? $order->get_order_number() : null,
            'invoice_number' => $invoice ? (string) $invoice->invoice_number : null,
            'amount' => $invoice ? (float) $invoice->amount : ($order ? (float) $order->get_total() : null),
            'currency' => $invoice ? (string) $invoice->currency : ($order ? $order->get_currency() : null),
            'google_meet_link' => $formatted['google_meet_link'] ?? '',
            'meet_link' => $formatted['meet_link'] ?? '',
            'patient_join_url' => Nevari_Helpers::appointment_join_url($appointment, 'patient'),
            'doctor_join_url' => Nevari_Helpers::appointment_join_url($appointment, 'doctor'),
            'join_url' => $formatted['join_url'] ?? '',
            'calendar' => Nevari_Helpers::appointment_calendar_links($appointment),
        ]);
    }

    private static function resolve_appointment_join_context(WP_REST_Request $request): array {
        $token = sanitize_text_field((string) $request['token']);
        if ($token === '') {
            return ['response' => Nevari_Helpers::error('invalid_token', 'The appointment link is invalid.', 404)];
        }

        $decoded = Nevari_Helpers::decode_appointment_join_token($token);
        if (empty($decoded['valid'])) {
            return ['response' => Nevari_Helpers::error('invalid_token', 'The appointment link is invalid.', 404)];
        }

        $payload = is_array($decoded['payload'] ?? null) ? $decoded['payload'] : [];
        $appointment_id = (int) ($payload['appointment_id'] ?? 0);
        $role = ($payload['role'] ?? '') === 'doctor' ? 'doctor' : 'patient';
        $appointment = self::get_appointment_row($appointment_id);
        if (!$appointment) {
            return ['response' => Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404)];
        }

        $appointment = class_exists('Nevari_Plugin') ? Nevari_Plugin::instance()->ensure_appointment_join_access($appointment) : $appointment;
        $stored_hash = (string) ($role === 'doctor' ? ($appointment->doctor_join_token_hash ?? '') : ($appointment->patient_join_token_hash ?? ''));
        if ($stored_hash === '' || !hash_equals($stored_hash, hash('sha256', $token))) {
            return ['response' => Nevari_Helpers::error('appointment_link_expired', 'This appointment link has expired.', 410)];
        }

        $valid_from_at = (string) ($appointment->join_valid_from_at ?? '') ?: Nevari_Helpers::appointment_join_valid_from_at($appointment);
        $expires_at = (string) ($appointment->join_expires_at ?? '') ?: Nevari_Helpers::appointment_join_expires_at($appointment);
        $valid_from_ts = $valid_from_at ? (int) strtotime($valid_from_at . ' UTC') : 0;
        $expires_ts = $expires_at ? (int) strtotime($expires_at . ' UTC') : 0;
        $now = time();
        $book_url = Nevari_Helpers::appointment_frontend_origin() . '/dashboard';
        $raw_meet_link = Nevari_Helpers::appointment_raw_meeting_link($appointment);

        if (
            in_array((string) ($appointment->status ?? ''), ['cancelled', 'canceled', 'failed'], true)
            || !empty($appointment->google_meet_ended_at)
            || ($expires_ts > 0 && $now > $expires_ts)
        ) {
            return ['response' => Nevari_Helpers::success([
                'state' => 'ended',
                'role' => $role,
                'appointment_id' => $appointment_id,
                'message' => 'Meeting has ended',
                'book_url' => $book_url,
            ])];
        }

        if ($raw_meet_link === '') {
            return ['response' => Nevari_Helpers::success([
                'state' => 'unavailable',
                'role' => $role,
                'appointment_id' => $appointment_id,
                'message' => 'Kindly check back on your appointment time',
                'book_url' => $book_url,
            ])];
        }

        if ($valid_from_ts > 0 && $now < $valid_from_ts) {
            return ['response' => Nevari_Helpers::success([
                'state' => 'unavailable',
                'role' => $role,
                'appointment_id' => $appointment_id,
                'message' => 'Kindly check back on your appointment time',
                'book_url' => $book_url,
                'available_at' => Nevari_Helpers::iso_datetime($valid_from_at),
            ])];
        }

        return [
            'token' => $token,
            'role' => $role,
            'appointment_id' => $appointment_id,
            'appointment' => $appointment,
            'book_url' => $book_url,
            'raw_meet_link' => $raw_meet_link,
        ];
    }

    private static function appointment_notify_state($appointment, string $role): array {
        $role = $role === 'doctor' ? 'doctor' : 'patient';
        $count_column = $role === 'doctor' ? 'doctor_waiting_notify_count' : 'patient_waiting_notify_count';
        $last_column = $role === 'doctor' ? 'doctor_waiting_notify_last_at' : 'patient_waiting_notify_last_at';
        $count = (int) ($appointment->{$count_column} ?? 0);
        $last_sent_at = (string) ($appointment->{$last_column} ?? '');
        $last_ts = $last_sent_at !== '' ? (int) strtotime($last_sent_at . ' UTC') : 0;
        return [
            'disabled' => $count >= 3,
            'cooldown_seconds' => $count >= 3 ? 0 : ($last_ts ? max(0, 60 - (time() - $last_ts)) : 0),
        ];
    }

    public static function appointment_join_access(WP_REST_Request $request): WP_REST_Response {
        $context = self::resolve_appointment_join_context($request);
        if (isset($context['response'])) {
            return $context['response'];
        }

        return Nevari_Helpers::success([
            'state' => 'active',
            'role' => $context['role'],
            'appointment_id' => $context['appointment_id'],
            'redirect_url' => $context['raw_meet_link'],
            'book_url' => $context['book_url'],
            'attendance_status' => Nevari_Helpers::appointment_attendance_status($context['appointment']),
            'notify' => self::appointment_notify_state($context['appointment'], $context['role']),
            'message' => 'Your appointment is ready.',
        ]);
    }

    public static function appointment_join_check_in(WP_REST_Request $request): WP_REST_Response {
        $context = self::resolve_appointment_join_context($request);
        if (isset($context['response'])) {
            return $context['response'];
        }

        global $wpdb;
        $appointment = $context['appointment'];
        $checked_column = $context['role'] === 'doctor' ? 'doctor_checked_in_at' : 'patient_checked_in_at';
        $update = ['updated_at' => Nevari_Helpers::now()];
        if (empty($appointment->{$checked_column})) {
            $update[$checked_column] = Nevari_Helpers::now();
        }
        if ((string) ($appointment->status ?? '') === 'confirmed' && (string) ($appointment->payment_status ?? '') === 'paid') {
            $update['status'] = 'checked_in';
        }
        $wpdb->update(Nevari_Helpers::table('appointments'), $update, ['id' => $context['appointment_id']], array_fill(0, count($update), '%s'), ['%d']);

        return Nevari_Helpers::success([
            'state' => 'active',
            'role' => $context['role'],
            'appointment_id' => $context['appointment_id'],
            'redirect_url' => $context['raw_meet_link'],
            'book_url' => $context['book_url'],
        ]);
    }

    public static function appointment_join_notify(WP_REST_Request $request): WP_REST_Response {
        $context = self::resolve_appointment_join_context($request);
        if (isset($context['response'])) {
            return $context['response'];
        }

        if (!class_exists('Nevari_Plugin')) {
            return Nevari_Helpers::error('notification_unavailable', 'Notification service is unavailable.', 500);
        }

        $result = Nevari_Plugin::instance()->send_appointment_waiting_notification($context['appointment'], $context['role']);
        if (empty($result['success'])) {
            $status = ($result['code'] ?? '') === 'cooldown' ? 429 : 422;
            if (($result['code'] ?? '') === 'limit_reached') {
                $status = 429;
            }
            return Nevari_Helpers::error($result['code'] ?? 'notification_failed', $result['message'] ?? 'Unable to send notification.', $status, [
                'disabled' => !empty($result['disabled']),
                'cooldown_seconds' => (int) ($result['cooldown_seconds'] ?? 0),
            ]);
        }

        return Nevari_Helpers::success([
            'sent' => true,
            'disabled' => !empty($result['disabled']),
            'cooldown_seconds' => (int) ($result['cooldown_seconds'] ?? 60),
            'message' => $result['message'] ?? 'Notification sent.',
        ]);
    }

    public static function appointment_calendar(WP_REST_Request $request): WP_REST_Response {
        $appointment = self::get_appointment_row((int) $request['id']);
        if (!$appointment || !Nevari_Helpers::can_view_appointment($appointment)) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        $doctor = get_user_by('id', (int) $appointment->doctor_user_id);
        $patient = get_user_by('id', (int) $appointment->patient_user_id);
        $response = new WP_REST_Response(Nevari_Helpers::appointment_ics_content($appointment, $doctor ? $doctor->display_name : '', $patient ? $patient->display_name : ''));
        $response->set_status(200);
        $response->header('Content-Type', 'text/calendar; charset=UTF-8');
        $response->header('Content-Disposition', 'attachment; filename="' . Nevari_Helpers::appointment_ics_filename($appointment) . '"');
        return $response;
    }

    public static function appointment_review_show(WP_REST_Request $request): WP_REST_Response {
        $appointment = self::get_appointment_row((int) $request['id']);
        if (!$appointment || !Nevari_Helpers::can_view_appointment($appointment)) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        global $wpdb;
        $review = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM " . Nevari_Helpers::table('appointment_reviews') . " WHERE appointment_id = %d LIMIT 1",
            (int) $appointment->id
        ));
        return Nevari_Helpers::success([
            'appointment_id' => (int) $appointment->id,
            'eligible' => $appointment->status === 'completed' && Nevari_Helpers::is_patient() && (int) $appointment->patient_user_id === get_current_user_id(),
            'review' => $review ? Nevari_Helpers::format_review_row($review) : null,
        ]);
    }

    public static function appointment_review_create(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_appointments_write', 10, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'review'])) {
            return $response;
        }
        if (!Nevari_Helpers::is_patient()) {
            return Nevari_Helpers::error('forbidden', 'Only patients can leave appointment reviews.', 403);
        }
        $appointment = self::get_appointment_row((int) $request['id']);
        if (!$appointment || (int) $appointment->patient_user_id !== get_current_user_id()) {
            return Nevari_Helpers::error('appointment_not_found', 'Appointment not found.', 404);
        }
        if ($appointment->status !== 'completed') {
            return Nevari_Helpers::error('review_not_allowed', 'Reviews are allowed only after completed appointments.', 422);
        }
        global $wpdb;
        $table = Nevari_Helpers::table('appointment_reviews');
        $existing = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE appointment_id = %d LIMIT 1", (int) $appointment->id));
        if ($existing) {
            return Nevari_Helpers::error('review_exists', 'A review has already been submitted for this appointment.', 409);
        }
        $params = Nevari_Helpers::get_json_params($request);
        $rating = isset($params['rating']) ? (int) $params['rating'] : 0;
        $review_text = isset($params['review_text']) ? sanitize_textarea_field((string) $params['review_text']) : '';
        if ($rating < 1 || $rating > 5) {
            return Nevari_Helpers::error('validation_error', 'A rating between 1 and 5 is required.', 422);
        }
        $now = Nevari_Helpers::now();
        $wpdb->insert($table, [
            'appointment_id' => (int) $appointment->id,
            'doctor_user_id' => (int) $appointment->doctor_user_id,
            'patient_user_id' => (int) $appointment->patient_user_id,
            'rating' => $rating,
            'review_text' => $review_text,
            'status' => 'approved',
            'created_at' => $now,
            'updated_at' => $now,
        ], ['%d', '%d', '%d', '%d', '%s', '%s', '%s', '%s']);
        $review = $wpdb->get_row($wpdb->prepare("SELECT * FROM {$table} WHERE appointment_id = %d LIMIT 1", (int) $appointment->id));
        Nevari_Audit::log('consultation', 'nevari', 'appointment.review_created', 'success', ['appointment_id' => (int) $appointment->id, 'related_user_id' => (int) $appointment->patient_user_id]);
        return Nevari_Helpers::success(Nevari_Helpers::format_review_row($review), [], 201);
    }

    private static function get_appointment_row(int $id) {
        global $wpdb;
        return $wpdb->get_row($wpdb->prepare("SELECT * FROM " . Nevari_Helpers::table('appointments') . " WHERE id = %d", $id));
    }

    private static function create_appointment_checkout_order(int $appointment_id, int $patient_id, int $doctor_id, float $fee, string $reason) {
        if (!function_exists('wc_create_order')) {
            return new WP_Error('woocommerce_missing', 'WooCommerce is required.', ['status' => 503]);
        }
        $order = wc_create_order(['customer_id' => $patient_id]);
        if (is_wp_error($order)) {
            return $order;
        }
        $doctor = get_user_by('id', $doctor_id);
        $patient = get_user_by('id', $patient_id);
        $fee_item = new WC_Order_Item_Fee();
        $fee_item->set_name(sprintf('Consultation with %s', $doctor ? $doctor->display_name : 'Doctor'));
        $fee_item->set_amount($fee);
        $fee_item->set_total($fee);
        $order->add_item($fee_item);
        $order->set_customer_note($reason);
        $order->update_meta_data('_nevari_appointment_id', $appointment_id);
        $order->update_meta_data('_nevari_appointment_doctor_user_id', $doctor_id);
        $order->update_meta_data('_nevari_appointment_patient_user_id', $patient_id);
        $order->update_meta_data('_nevari_booking_status', 'pending_payment');
        $order->update_meta_data('_nevari_consultation_fee', $fee);
        $order->update_meta_data('_nevari_consultation_type', 'video');
        $order->update_meta_data('_nevari_reason', $reason);
        $appointment = self::get_appointment_row($appointment_id);
        if ($appointment) {
            $order->update_meta_data('_nevari_appointment_start_at', (string) $appointment->start_at);
            $order->update_meta_data('_nevari_appointment_end_at', (string) $appointment->end_at);
            $order->update_meta_data('_nevari_timezone', (string) $appointment->timezone);
            $order->update_meta_data('_nevari_reserved_until', (string) $appointment->reserved_until);
        }
        if ($patient) {
            $order->set_billing_email($patient->user_email);
            $order->set_billing_first_name(get_user_meta($patient_id, 'first_name', true) ?: $patient->display_name);
            $order->set_billing_last_name(get_user_meta($patient_id, 'last_name', true) ?: '');
        }
        $order->calculate_totals();
        $order->save();
        return $order;
    }

    private static function maybe_auto_pay_appointment_from_quota($order, int $appointment_id, int $patient_id): bool {
        if (!$order || !class_exists('Nevari_Subscriptions')) {
            return false;
        }

        $quota = Nevari_Subscriptions::consultation_quota_snapshot_for_user($patient_id, true);
        $remaining = (int) ($quota['free_consultations_remaining'] ?? 0);
        if (empty($quota['is_paid']) || $remaining <= 0) {
            return false;
        }

        if ($order->is_paid()) {
            return true;
        }

        $order->update_meta_data('_nevari_paid_via_quota', 'yes');
        $order->update_meta_data('_nevari_quota_snapshot_remaining_before_payment', $remaining);
        $order->update_meta_data('_nevari_booking_status', 'confirmed');
        $order->add_order_note(sprintf('Appointment #%d was automatically settled using the patient consultation quota.', $appointment_id));
        $order->save();
        $order->payment_complete('nevari_quota_' . $appointment_id . '_' . time());

        return true;
    }

    private static function maybe_auto_pay_appointment_invoice_from_quota($invoice, int $appointment_id, int $patient_id): bool {
        if (!$invoice || !class_exists('Nevari_Subscriptions')) {
            return false;
        }

        $quota = Nevari_Subscriptions::consultation_quota_snapshot_for_user($patient_id, true);
        $remaining = (int) ($quota['free_consultations_remaining'] ?? 0);
        if (empty($quota['is_paid']) || $remaining <= 0) {
            return false;
        }

        if ((string) $invoice->status === 'paid') {
            return true;
        }

        global $wpdb;
        $reference = 'nevari_quota_' . $appointment_id . '_' . time();
        $wpdb->update(Nevari_Helpers::table('appointment_invoices'), [
            'status' => 'paid',
            'gateway' => 'quota',
            'payment_reference' => $reference,
            'transaction_id' => $reference,
            'paid_at' => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => (int) $invoice->id], ['%s', '%s', '%s', '%s', '%s', '%s'], ['%d']);

        return true;
    }

    private static function sync_cancelled_appointment_order($appointment): void {
        if (!$appointment || empty($appointment->order_id) || !function_exists('wc_get_order')) {
            return;
        }

        $order = wc_get_order((int) $appointment->order_id);
        if (!$order) {
            return;
        }

        $order->update_meta_data('_nevari_booking_status', 'cancelled');
        $order->update_meta_data('_nevari_appointment_cancelled_at', Nevari_Helpers::now());

        if ($order->needs_payment()) {
            $order->update_status('cancelled', __('Appointment cancelled from Nevari dashboard.', 'nevari-pharmacy-core'));
            return;
        }

        $order->add_order_note(sprintf('Appointment #%d was cancelled after payment/quota settlement.', (int) $appointment->id));
        $order->save();
    }

    private static function sync_cancelled_appointment_invoice($appointment): void {
        if (!$appointment) {
            return;
        }

        global $wpdb;
        $invoice = self::get_appointment_invoice_by_appointment_id((int) $appointment->id);
        if (!$invoice) {
            return;
        }

        if ((string) $invoice->status === 'paid') {
            $wpdb->update(Nevari_Helpers::table('appointment_invoices'), [
                'cancelled_at' => Nevari_Helpers::now(),
                'updated_at' => Nevari_Helpers::now(),
            ], ['id' => (int) $invoice->id], ['%s', '%s'], ['%d']);
            return;
        }

        $wpdb->update(Nevari_Helpers::table('appointment_invoices'), [
            'status' => 'cancelled',
            'cancelled_at' => Nevari_Helpers::now(),
            'updated_at' => Nevari_Helpers::now(),
        ], ['id' => (int) $invoice->id], ['%s', '%s', '%s'], ['%d']);
        Nevari_Plugin::instance()->handle_custom_appointment_payment_failed((int) $appointment->id, 'cancelled');
    }

    private static function queue_appointment_staff_notifications($appointment, WP_User $doctor, ?WP_User $patient, array $calendar, array $ics): void {
        $common = [
            'doctor_name' => $doctor->display_name,
            'patient_name' => $patient ? $patient->display_name : 'Patient',
            'appointment_start' => Nevari_Helpers::iso_datetime($appointment->start_at),
            'appointment_status' => 'Awaiting payment',
            'calendar_link' => $calendar['ics_url'],
            'calendar_link_html' => ['html' => '<a href="' . esc_url($calendar['ics_url']) . '">Download calendar invite</a>', 'text' => $calendar['ics_url']],
        ];
        $admin_email = get_option('admin_email');
        if ($admin_email && is_email($admin_email)) {
            Nevari_Emails::queue_or_send([
                'template_key' => 'appointment_admin_notification',
                'recipient_email' => $admin_email,
                'related_object_type' => 'appointment',
                'related_object_id' => (int) $appointment->id,
                'attachments' => [$ics],
                'variables' => $common,
            ], false);
        }
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
        if (in_array($action, ['issued', 'assigned', 'order_linked'], true)) {
            Nevari_Plugin::instance()->maybe_send_appointment_prescription_followup_email($new_row);
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
        $payload = get_option('_nevari_email_payload_' . (int) $row->id, []);
        $payload = is_array($payload) ? $payload : [];
        $data['body_html'] = isset($payload['body_html']) ? (string) $payload['body_html'] : '';
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

    public static function emails_booking_test(WP_REST_Request $request): WP_REST_Response {
        if ($response = Nevari_Helpers::rate_limit('rest_emails_write', 3, MINUTE_IN_SECONDS, ['user:' . get_current_user_id(), 'booking_test'])) {
            return $response;
        }
        $params = Nevari_Helpers::get_json_params($request);
        $email = isset($params['recipient_email']) ? sanitize_email((string) $params['recipient_email']) : '';
        $result = Nevari_Plugin::instance()->send_booking_email_test($email);
        if (empty($result['success'])) {
            return Nevari_Helpers::error((string) ($result['code'] ?? 'booking_test_failed'), (string) ($result['message'] ?? 'Booking email test failed.'), 422);
        }
        return Nevari_Helpers::success($result, [], 201);
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

    public static function dashboard_patient_search(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;

        $user_id = Nevari_Auth::api_session_user_id();
        if ($response = Nevari_Helpers::rate_limit('rest_patient_search', 60, MINUTE_IN_SECONDS, ['user:' . $user_id])) {
            return $response;
        }
        $query = trim(sanitize_text_field((string) $request->get_param('q')));
        $query_length = function_exists('mb_strlen') ? mb_strlen($query) : strlen($query);
        if ($query_length < 3 || $query_length > 80) {
            return Nevari_Helpers::error('invalid_search_query', 'Enter between 3 and 80 characters.', 422);
        }

        $limit = min(30, max(1, absint($request->get_param('limit') ?: 20)));
        $per_group = min(6, $limit);
        $like = '%' . $wpdb->esc_like($query) . '%';
        $items = [];
        $append = static function (array $item) use (&$items, $limit): void {
            if (count($items) >= $limit) return;
            $summary = sanitize_text_field((string) ($item['summary'] ?? $item['meta'] ?? ''));
            $items[] = [
                'type' => sanitize_key((string) ($item['type'] ?? 'page')),
                'id' => sanitize_text_field((string) ($item['id'] ?? '')),
                'area' => sanitize_text_field((string) ($item['area'] ?? 'Dashboard')),
                'title' => sanitize_text_field((string) ($item['title'] ?? 'Result')),
                'summary' => $summary,
                'meta' => $summary,
                'status' => sanitize_key((string) ($item['status'] ?? '')),
                'occurred_at' => sanitize_text_field((string) ($item['occurred_at'] ?? '')),
                'destination' => sanitize_key((string) ($item['destination'] ?? 'overview')),
            ];
        };
        $matches = static function (string $value) use ($query): bool { return stripos($value, $query) !== false; };

        if (function_exists('wc_get_orders')) {
            foreach (wc_get_orders(['customer_id' => $user_id, 'limit' => $per_group, 'search' => '*' . $query . '*', 'orderby' => 'date', 'order' => 'DESC']) as $order) {
                if (!is_a($order, 'WC_Order')) continue;
                $append(['type' => 'order', 'id' => (string) $order->get_id(), 'area' => 'Orders', 'title' => 'Order #' . $order->get_order_number(), 'meta' => $order->get_currency() . ' ' . wc_format_decimal($order->get_total(), 2) . ' · ' . wc_get_order_status_name($order->get_status()), 'destination' => 'orders']);
            }
        }

        $definitions = [
            ['appointments', 'patient_user_id', 'id, doctor_user_id, title, status, start_at', 'CAST(id AS CHAR) LIKE %s OR title LIKE %s OR status LIKE %s OR start_at LIKE %s', 'start_at', 'appointment', 'Appointments', 'appointment'],
            ['prescriptions', 'patient_user_id', 'id, prescription_number, status, updated_at', 'prescription_number LIKE %s OR status LIKE %s OR updated_at LIKE %s', 'updated_at', 'prescription', 'Prescriptions', 'orders'],
            ['mtm_requests', 'customer_user_id', 'id, request_reference, status, created_at', 'CAST(id AS CHAR) LIKE %s OR request_reference LIKE %s OR status LIKE %s OR created_at LIKE %s', 'created_at', 'mtm', 'MTM', 'therapy'],
            ['subscription_payments', 'user_id', 'id, reference, status, amount_kobo, currency, created_at', 'reference LIKE %s OR status LIKE %s OR created_at LIKE %s', 'created_at', 'subscription_payment', 'Payments', 'subscription'],
        ];
        foreach ($definitions as [$table_key, $owner_column, $columns, $where, $order_column, $type, $area, $destination]) {
            $like_count = substr_count($where, '%s');
            $sql = "SELECT {$columns} FROM " . Nevari_Helpers::table($table_key) . " WHERE {$owner_column} = %d AND ({$where}) ORDER BY {$order_column} DESC LIMIT %d";
            $args = array_merge([$user_id], array_fill(0, $like_count, $like), [$per_group]);
            foreach ($wpdb->get_results($wpdb->prepare($sql, ...$args)) as $row) {
                if ($type === 'appointment') {
                    $doctor = get_userdata((int) $row->doctor_user_id);
                    $title = $row->title ?: 'Appointment #' . $row->id;
                    $meta = $row->start_at . ' · ' . ($doctor instanceof WP_User ? $doctor->display_name : 'Doctor') . ' · ' . $row->status;
                } elseif ($type === 'prescription') {
                    $title = 'Prescription ' . $row->prescription_number;
                    $meta = $row->status . ' · ' . $row->updated_at;
                } elseif ($type === 'mtm') {
                    $title = 'MTM request ' . ($row->request_reference ?: '#' . $row->id);
                    $meta = $row->status . ' · ' . $row->created_at;
                } else {
                    $title = 'Payment ' . $row->reference;
                    $meta = $row->currency . ' ' . number_format(((int) $row->amount_kobo) / 100, 2) . ' · ' . $row->status;
                }
                $append(['type' => $type, 'id' => (string) $row->id, 'area' => $area, 'title' => $title, 'meta' => $meta, 'destination' => $destination]);
            }
        }

        foreach ([['nevari_iv_therapy_requests', 'iv_therapy', 'IV Therapy', 'iv-therapy'], ['nevari_nurse_requests', 'nurse_request', 'Nurse Requests', 'nurse-request']] as [$meta_key, $type, $area, $destination]) {
            $stored = get_user_meta($user_id, $meta_key, true);
            if (!is_array($stored)) continue;
            $matched = 0;
            foreach (array_reverse($stored) as $stored_item) {
                if (!is_array($stored_item) || $matched >= $per_group) continue;
                $id = sanitize_text_field((string) ($stored_item['id'] ?? ''));
                $title = sanitize_text_field((string) ($stored_item['title'] ?? $stored_item['careType'] ?? ($type === 'iv_therapy' ? 'IV Therapy Request' : 'Nurse Visit Request')));
                $status = sanitize_key((string) ($stored_item['status'] ?? 'submitted'));
                $date = sanitize_text_field((string) ($stored_item['submittedAt'] ?? $stored_item['createdAt'] ?? $stored_item['updatedAt'] ?? ''));
                $reference = sanitize_text_field((string) ($stored_item['requestReference'] ?? ''));
                if (!$matches($id . ' ' . $title . ' ' . $status . ' ' . $date . ' ' . $reference)) continue;
                $append(['type' => $type, 'id' => $id, 'area' => $area, 'title' => $title . ($reference ? ' ' . $reference : ''), 'meta' => $status . ($date ? ' · ' . $date : ''), 'destination' => $destination]);
                $matched++;
            }
        }

        return Nevari_Helpers::success(['query' => $query, 'items' => $items, 'count' => count($items)]);
    }

    public static function dashboard_patient(WP_REST_Request $request): WP_REST_Response {
        $user_id = get_current_user_id();
        Nevari_Helpers::dashboard_log('dashboard.patient.start', [
            'dashboard' => 'patient',
        ]);
        $prescriptions_response = self::prescriptions_index(new WP_REST_Request('GET', '/prescriptions'));
        $appointments_response = self::appointments_index(new WP_REST_Request('GET', '/appointments'));
        $prescriptions_payload = $prescriptions_response->get_data();
        $appointments_payload = $appointments_response->get_data();
        $prescriptions = $prescriptions_payload['data'] ?? [];
        $appointments = $appointments_payload['data'] ?? [];
        if (empty($prescriptions_payload['success']) || empty($appointments_payload['success'])) {
            Nevari_Helpers::dashboard_log('dashboard.patient.dependency_warning', [
                'dashboard' => 'patient',
                'prescriptions_success' => !empty($prescriptions_payload['success']),
                'appointments_success' => !empty($appointments_payload['success']),
            ], 'warning');
        }
        Nevari_Helpers::dashboard_log('dashboard.patient.success', [
            'dashboard' => 'patient',
            'profile_user_id' => $user_id,
            'prescriptions_recent' => count(array_slice($prescriptions, 0, 5)),
            'appointments_recent' => count(array_slice($appointments, 0, 5)),
        ]);
        return Nevari_Helpers::success([
            'store_currency' => self::store_currency(),
            'store_timezone' => self::store_timezone(),
            'profile' => Nevari_Helpers::user_summary($user_id),
            'settings' => self::customer_settings_payload($user_id),
            'prescriptions' => ['recent' => array_slice($prescriptions, 0, 5)],
            'appointments' => ['recent' => array_slice($appointments, 0, 5)],
        ]);
    }

    private static function customer_settings_payload(int $user_id): array {
        $defaults = self::customer_settings_defaults($user_id);
        $stored = get_user_meta($user_id, self::CUSTOMER_SETTINGS_META_KEY, true);
        if (!is_array($stored)) {
            return $defaults;
        }

        $sanitized = self::sanitize_customer_settings_payload($stored, $user_id, true);
        if (is_wp_error($sanitized)) {
            return $defaults;
        }

        return array_merge($defaults, $sanitized);
    }

    private static function customer_settings_defaults(int $user_id): array {
        $user = get_user_by('id', $user_id);
        $timezone = wp_timezone_string();
        if (!$timezone) {
            $timezone = 'UTC';
        }

        return [
            'displayName' => $user ? (string) $user->display_name : '',
            'email' => $user ? (string) $user->user_email : '',
            'phone' => (string) get_user_meta($user_id, 'billing_phone', true),
            'address' => (string) get_user_meta($user_id, 'billing_address_1', true),
            'timezone' => $timezone,
            'preferredConsultationType' => 'video',
            'preferredDoctorIds' => [],
            'emailReminders' => true,
            'appointmentReminders' => true,
            'prescriptionAlerts' => true,
            'paymentReceipts' => true,
            'marketingOptIn' => false,
            'refundTracking' => true,
            'twoFactorEnabled' => false,
            'savedMethods' => [],
        
            'bloodGroup' => '',
            'genotype' => '',
            'allergies' => [],
            'currentMedications' => [],
            'existingConditions' => [],
            'emergencyContactName' => '',
            'emergencyContactPhoneNumber' => '',
        ];
    }

    private static function sanitize_customer_settings_payload(array $params, int $user_id, bool $allow_partial = false) {
        $defaults = self::customer_settings_defaults($user_id);
        $settings = $allow_partial ? [] : $defaults;

        $text_fields = [
            'displayName' => 120,
            'email' => 254,
            'phone' => 24,
            'address' => 200,
            'timezone' => 80,
            'emergencyContactName' => 120,
            'emergencyContactPhoneNumber' => 24,
        ];
        foreach ($text_fields as $field => $max_length) {
            if (!array_key_exists($field, $params)) {
                continue;
            }
            $value = (string) $params[$field];
            $value = $field === 'address'
                ? sanitize_textarea_field($value)
                : sanitize_text_field($value);
            $value = trim(wp_html_excerpt($value, $max_length, ''));
            if ($field === 'email' && $value !== '' && !is_email($value)) {
                return new WP_Error('validation_error', 'A valid notification email is required.', ['status' => 422]);
            }
            if ($field === 'phone' || $field === 'emergencyContactPhoneNumber') {
                $value = preg_replace('/[^0-9+-s()]/', '', $value);
            }
            $settings[$field] = $value;
        }

        if (array_key_exists('bloodGroup', $params)) {
            $allowed_blood_groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
            $blood_group = strtoupper(trim(sanitize_text_field((string) $params['bloodGroup'])));
            $settings['bloodGroup'] = in_array($blood_group, $allowed_blood_groups, true) ? $blood_group : '';
        }

        if (array_key_exists('genotype', $params)) {
            $allowed_genotypes = ['AA', 'AS', 'AC', 'SS', 'SC', 'CC'];
            $genotype = strtoupper(trim(sanitize_text_field((string) $params['genotype'])));
            $settings['genotype'] = in_array($genotype, $allowed_genotypes, true) ? $genotype : '';
        }

        $array_text_fields = [
            'allergies' => 120,
            'currentMedications' => 120,
            'existingConditions' => 120,
        ];
        foreach ($array_text_fields as $field => $max_length) {
            if (!array_key_exists($field, $params)) {
                continue;
            }
            $values = [];
            if (is_array($params[$field])) {
                foreach ($params[$field] as $raw_value) {
                    $value = trim(wp_html_excerpt(sanitize_text_field((string) $raw_value), $max_length, ''));
                    if ($value !== '') {
                        $values[] = $value;
                    }
                }
            }
            $settings[$field] = array_values(array_unique($values));
        }

        $emergency_name = (string) ($settings['emergencyContactName'] ?? '');
        $emergency_phone = (string) ($settings['emergencyContactPhoneNumber'] ?? '');
        if ($emergency_phone !== '') {
            $digits = preg_replace('/D+/', '', $emergency_phone);
            if (strpos($digits, '234') === 0 && strlen($digits) === 13) {
                $digits = '0' . substr($digits, 3);
            }
            if (strlen($digits) !== 11) {
                return new WP_Error('validation_error', 'Emergency contact phone number must be a valid Nigerian phone number.', ['status' => 422]);
            }
        }
        if ($emergency_name !== '' && $emergency_phone === '') {
            return new WP_Error('validation_error', 'Emergency contact phone number is required when emergency contact name is provided.', ['status' => 422]);
        }

        if (array_key_exists('preferredConsultationType', $params)) {
            $preferred_consultation_type = sanitize_key((string) $params['preferredConsultationType']);
            $allowed_types = ['video', 'phone', 'in_person'];
            $settings['preferredConsultationType'] = in_array($preferred_consultation_type, $allowed_types, true)
                ? $preferred_consultation_type
                : $defaults['preferredConsultationType'];
        }

        if (array_key_exists('preferredDoctorIds', $params)) {
            $doctor_ids = [];
            if (is_array($params['preferredDoctorIds'])) {
                foreach ($params['preferredDoctorIds'] as $raw_doctor_id) {
                    $doctor_id = (int) preg_replace('/\D+/', '', (string) $raw_doctor_id);
                    if ($doctor_id <= 0) {
                        continue;
                    }
                    $doctor = get_user_by('id', $doctor_id);
                    if ($doctor && in_array('doctor', (array) $doctor->roles, true)) {
                        $doctor_ids[] = (string) $doctor_id;
                    }
                }
            }
            $settings['preferredDoctorIds'] = array_values(array_unique($doctor_ids));
        }

        $boolean_fields = [
            'emailReminders',
            'appointmentReminders',
            'prescriptionAlerts',
            'paymentReceipts',
            'marketingOptIn',
            'refundTracking',
            'twoFactorEnabled',
        ];
        foreach ($boolean_fields as $field) {
            if (array_key_exists($field, $params)) {
                $settings[$field] = (bool) Nevari_Helpers::bool_param($params[$field]);
            }
        }

        if (array_key_exists('savedMethods', $params)) {
            $saved_methods = [];
            if (is_array($params['savedMethods'])) {
                foreach ($params['savedMethods'] as $raw_method) {
                    $method = trim(wp_html_excerpt(sanitize_text_field((string) $raw_method), 80, ''));
                    if ($method !== '') {
                        $saved_methods[] = $method;
                    }
                }
            }
            $settings['savedMethods'] = array_values(array_unique($saved_methods));
        }

        return $settings;
    }

    public static function dashboard_doctor(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        $doctor_id = get_current_user_id();
        $appointments_table = Nevari_Helpers::table('appointments');
        $prescriptions_table = Nevari_Helpers::table('prescriptions');
        $today_start = gmdate('Y-m-d 00:00:00');
        $today_end = gmdate('Y-m-d 23:59:59');
        $data = [
            'store_currency' => self::store_currency(),
            'store_timezone' => self::store_timezone(),
            'profile' => Nevari_Helpers::user_summary($doctor_id),
            'appointments_today' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$appointments_table} WHERE doctor_user_id = %d AND start_at BETWEEN %s AND %s", $doctor_id, $today_start, $today_end)),
            'appointments_requested' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$appointments_table} WHERE doctor_user_id = %d AND status = 'requested'", $doctor_id)),
            'prescriptions_draft' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$prescriptions_table} WHERE doctor_user_id = %d AND status = 'draft'", $doctor_id)),
            'prescriptions_assigned' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$prescriptions_table} WHERE doctor_user_id = %d AND status = 'assigned_to_patient'", $doctor_id)),
        ];
        Nevari_Helpers::dashboard_log('dashboard.doctor.success', [
            'dashboard' => 'doctor',
            'doctor_user_id' => $doctor_id,
            'appointments_today' => (int) $data['appointments_today'],
            'appointments_requested' => (int) $data['appointments_requested'],
            'prescriptions_draft' => (int) $data['prescriptions_draft'],
            'prescriptions_assigned' => (int) $data['prescriptions_assigned'],
        ]);
        return Nevari_Helpers::success($data);
    }

    public static function dashboard_store_admin(WP_REST_Request $request): WP_REST_Response {
        global $wpdb;
        Nevari_Helpers::dashboard_log('dashboard.store_admin.start', [
            'dashboard' => 'store-admin',
        ]);
        $appointments = Nevari_Helpers::table('appointments');
        $prescriptions = Nevari_Helpers::table('prescriptions');
        $emails = Nevari_Helpers::table('email_logs');
        $data = [
            'store_currency' => self::store_currency(),
            'store_timezone' => self::store_timezone(),
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
        Nevari_Helpers::dashboard_log('dashboard.store_admin.success', [
            'dashboard' => 'store-admin',
            'sales_today' => $data['sales']['today'] ?? '0',
            'sales_month' => $data['sales']['month'] ?? '0',
            'orders_today' => $data['sales']['orders_today'] ?? 0,
            'products_total' => $data['products']['total'] ?? 0,
            'doctors_total' => $data['doctors']['total'] ?? 0,
            'consultations_requested' => $data['consultations']['requested'] ?? 0,
            'consultations_confirmed' => $data['consultations']['confirmed'] ?? 0,
            'consultations_completed' => $data['consultations']['completed'] ?? 0,
            'emails_sent_today' => $data['emails']['sent_today'] ?? 0,
            'emails_failed_today' => $data['emails']['failed_today'] ?? 0,
        ]);
        return Nevari_Helpers::success($data);
    }

    public static function dashboard_sales(WP_REST_Request $request): WP_REST_Response {
        $data = self::sales_summary();
        Nevari_Helpers::dashboard_log('dashboard.sales.success', [
            'dashboard' => 'store-admin-sales',
            'sales_today' => $data['today'] ?? '0',
            'sales_month' => $data['month'] ?? '0',
            'orders_today' => $data['orders_today'] ?? 0,
            'currency' => $data['currency'] ?? self::store_currency(),
        ]);
        return Nevari_Helpers::success($data);
    }

    private static function sales_summary(): array {
        if (!self::woo_available()) { return ['today' => '0', 'month' => '0', 'orders_today' => 0, 'currency' => self::store_currency()]; }
        $today_orders = wc_get_orders(['limit' => -1, 'date_created' => '>' . gmdate('Y-m-d 00:00:00'), 'status' => ['processing','completed']]);
        $month_orders = wc_get_orders(['limit' => -1, 'date_created' => '>' . gmdate('Y-m-01 00:00:00'), 'status' => ['processing','completed']]);
        $today_total = 0; foreach ($today_orders as $o) { $today_total += (float) $o->get_total(); }
        $month_total = 0; foreach ($month_orders as $o) { $month_total += (float) $o->get_total(); }
        return [
            'today' => wc_format_decimal($today_total, 2),
            'month' => wc_format_decimal($month_total, 2),
            'orders_today' => count($today_orders),
            'currency' => self::store_currency(),
        ];
    }

    private static function store_currency(): string {
        if (function_exists('get_woocommerce_currency')) {
            $currency = get_woocommerce_currency();
            if (is_string($currency) && $currency !== '') {
                return $currency;
            }
        }
        $currency = get_option('woocommerce_currency', 'USD');
        return is_string($currency) && $currency !== '' ? $currency : 'USD';
    }

    private static function store_timezone(): string {
        if (function_exists('wp_timezone_string')) {
            $timezone = wp_timezone_string();
            if (is_string($timezone) && $timezone !== '') {
                return $timezone;
            }
        }

        $timezone = get_option('timezone_string', '');
        if (is_string($timezone) && $timezone !== '') {
            return $timezone;
        }

        $offset = (float) get_option('gmt_offset', 0);
        if ($offset === 0.0) {
            return 'UTC';
        }

        $hours = (int) $offset;
        $minutes = (int) round(abs($offset - $hours) * 60);
        if ($minutes === 0) {
            return sprintf('Etc/GMT%+d', -$hours);
        }

        return sprintf('%+03d:%02d', $hours, $minutes);
    }

    private static function dashboard_name_for_current_user(): string {
        if (Nevari_Helpers::is_store_admin()) {
            return 'store-admin';
        }
        if (Nevari_Helpers::is_doctor()) {
            return 'doctor';
        }
        if (Nevari_Helpers::is_patient()) {
            return 'patient';
        }
        return 'unknown';
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
