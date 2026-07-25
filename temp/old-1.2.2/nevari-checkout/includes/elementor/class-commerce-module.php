<?php
/**
 * Elementor commerce module bootstrap.
 */

namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

require_once __DIR__ . '/class-woocommerce-adapter.php';
require_once __DIR__ . '/class-commerce-renderer.php';
require_once __DIR__ . '/class-ajax-controller.php';
require_once __DIR__ . '/class-checkout-service.php';

final class Commerce_Module {
    const VERSION = '1.2.2';

    private static $instance = null;
    private $plugin_file;
    private $plugin_url;
    private $core;
    private $adapter;
    private $renderer;
    private $ajax;
    private $checkout_service;
    private $runtime_localized = false;

    public static function instance($plugin_file = '', $core = null) {
        if (null === self::$instance && $plugin_file && $core) {
            self::$instance = new self($plugin_file, $core);
        }

        return self::$instance;
    }

    private function __construct($plugin_file, $core) {
        $this->plugin_file = $plugin_file;
        $this->plugin_url  = plugin_dir_url($plugin_file);
        $this->core        = $core;
        $this->adapter     = new WooCommerce_Adapter($core);
        $this->renderer    = new Commerce_Renderer($this, $this->adapter, $core);
        $this->ajax        = new Ajax_Controller($this->adapter);
        $this->checkout_service = new Checkout_Service($core, $this->adapter, $this->renderer);

        add_action('wp_enqueue_scripts', array($this, 'register_assets'), 5);
        add_action('wp_enqueue_scripts', array($this, 'maybe_enqueue_compatibility_assets'), 20);
        add_action('elementor/editor/before_enqueue_scripts', array($this, 'register_assets'), 5);

        if (did_action('elementor/loaded')) {
            $this->register_elementor_hooks();
        } else {
            add_action('elementor/loaded', array($this, 'register_elementor_hooks'));
        }
    }

    public function register_assets() {
        wp_register_style(
            'nevari-commerce-widgets',
            $this->plugin_url . 'assets/css/nevari-commerce-widgets.css',
            array(),
            self::VERSION
        );

        wp_register_script(
            'nevari-commerce-widgets',
            $this->plugin_url . 'assets/js/nevari-commerce-widgets.js',
            array('jquery'),
            self::VERSION,
            true
        );
        wp_set_script_translations('nevari-commerce-widgets', 'nevari-checkout', plugin_dir_path($this->plugin_file) . 'languages');
    }

    public function enqueue_assets($checkout = false) {
        $this->register_assets();
        wp_enqueue_style('nevari-commerce-widgets');
        wp_enqueue_script('nevari-commerce-widgets');

        if ($checkout) {
            wp_enqueue_script('wc-checkout');
            wp_enqueue_script('wc-country-select');
        }

        if (!$this->runtime_localized) {
            $this->runtime_localized = true;
            wp_localize_script(
                'nevari-commerce-widgets',
                'NevariCommerce',
                array(
                    'ajaxUrl'      => admin_url('admin-ajax.php'),
                    'cartNonce'    => wp_create_nonce('nevari-update-cart'),
                    'couponNonce'  => wp_create_nonce('nevari-checkout-coupon'),
                    'orderNonce'   => wp_create_nonce('nevari-order-progress'),
                    'totalNonce'   => wp_create_nonce('nevari-cart-total'),
                    'messages'     => array(
                        'genericError' => __('Something went wrong. Please try again.', 'nevari-checkout'),
                        'cartUpdating' => __('Updating cart…', 'nevari-checkout'),
                        'orderUpdating' => __('Checking order status…', 'nevari-checkout'),
                    ),
                )
            );
        }
    }

    public function maybe_enqueue_compatibility_assets() {
        if ((function_exists('is_cart') && is_cart()) || (function_exists('is_checkout') && is_checkout())) {
            $this->enqueue_assets(function_exists('is_checkout') && is_checkout() && (!function_exists('is_order_received_page') || !is_order_received_page()));
        }
    }

    public function register_elementor_hooks() {
        if (!defined('ELEMENTOR_VERSION') || version_compare(ELEMENTOR_VERSION, '3.15.0', '<')) {
            add_action('admin_notices', array($this, 'render_elementor_version_notice'));
            return;
        }

        add_action('elementor/elements/categories_registered', array($this, 'register_category'));
        add_action('elementor/widgets/register', array($this, 'register_widgets'));
    }

    public function render_elementor_version_notice() {
        if (!current_user_can('activate_plugins')) {
            return;
        }

        echo '<div class="notice notice-warning"><p>'
            . esc_html__('Nevari Checkout commerce widgets require Elementor 3.15 or newer. Existing Nevari Checkout features remain available.', 'nevari-checkout')
            . '</p></div>';
    }

    public function register_category($elements_manager) {
        if (!is_object($elements_manager) || !method_exists($elements_manager, 'add_category')) {
            return;
        }

        $elements_manager->add_category(
            'nevari-checkout',
            array(
                'title' => __('Nevari Checkout', 'nevari-checkout'),
                'icon'  => 'eicon-cart-medium',
            )
        );
    }

    public function register_widgets($widgets_manager) {
        require_once __DIR__ . '/widgets/class-commerce-widget-base.php';
        require_once __DIR__ . '/widgets/class-cart-widget.php';
        require_once __DIR__ . '/widgets/class-checkout-widget.php';
        require_once __DIR__ . '/widgets/class-order-progress-widget.php';

        foreach (array(new Cart_Widget(), new Checkout_Widget(), new Order_Progress_Widget()) as $widget) {
            if (method_exists($widgets_manager, 'register')) {
                $widgets_manager->register($widget);
            } else {
                $widgets_manager->register_widget_type($widget);
            }
        }
    }

    public function adapter() {
        return $this->adapter;
    }

    public function renderer() {
        return $this->renderer;
    }
}
