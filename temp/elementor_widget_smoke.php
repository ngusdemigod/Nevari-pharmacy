<?php
namespace Elementor {
    class Controls_Manager { const TAB_STYLE = 'style'; const SWITCHER = 'switcher'; const TEXT = 'text'; const URL = 'url'; const SELECT = 'select'; const NUMBER = 'number'; const TEXTAREA = 'textarea'; const SLIDER = 'slider'; const DIMENSIONS = 'dimensions'; const COLOR = 'color'; }
    class Widget_Base {
        public function __construct() { if (method_exists($this, 'register_controls')) { $this->register_controls(); } }
        public function start_controls_section() {}
        public function end_controls_section() {}
        public function add_control() {}
        public function add_responsive_control() {}
        public function add_group_control() {}
        public function get_settings_for_display() { return array(); }
        public function get_id() { return 'smoke'; }
    }
    class Group_Control_Typography { public static function get_type() { return 'typography'; } }
    class Group_Control_Box_Shadow { public static function get_type() { return 'shadow'; } }
}
namespace Nevari\Checkout\Elementor {
    function wp_parse_args($args, $defaults) { return array_merge($defaults, (array) $args); }
}
namespace {
    define('ABSPATH', __DIR__ . '/');
    function wc_get_page_permalink($page) { return 'https://example.test/' . $page . '/'; }
    function wc_get_checkout_url() { return 'https://example.test/checkout/'; }
    function wc_get_cart_url() { return 'https://example.test/cart/'; }
    function __($text) { return $text; }
    function wp_parse_args($args, $defaults) { return array_merge($defaults, (array) $args); }
    require dirname(__DIR__) . '/nevari-checkout/includes/elementor/class-commerce-renderer.php';
    require dirname(__DIR__) . '/nevari-checkout/includes/elementor/widgets/class-commerce-widget-base.php';
    require dirname(__DIR__) . '/nevari-checkout/includes/elementor/widgets/class-cart-widget.php';
    require dirname(__DIR__) . '/nevari-checkout/includes/elementor/widgets/class-checkout-widget.php';
    require dirname(__DIR__) . '/nevari-checkout/includes/elementor/widgets/class-order-progress-widget.php';
    new \Nevari\Checkout\Elementor\Cart_Widget();
    new \Nevari\Checkout\Elementor\Checkout_Widget();
    new \Nevari\Checkout\Elementor\Order_Progress_Widget();
    echo 'elementor-widget-smoke-ok' . PHP_EOL;
}
