<?php

namespace Elementor {
    final class Plugin {
        public static $instance;
    }
}

namespace Nevari\Checkout\Elementor {
    final class Visual_Preview_Module {
        public function enqueue_assets($checkout = false) {
        }
    }
}

namespace {
    define('ABSPATH', __DIR__);

    final class Nevari_Visual_Preview_Date {
        public function date_i18n($format) {
            return 'Apr 5, 2022, 10:07 AM';
        }
    }

    function __($text, $domain = '') { return $text; }
    function wc_get_page_permalink($page) { return '#'; }
    function apply_filters($hook, $value) { return $value; }
    function wp_unique_id($prefix = '') { return $prefix . 'preview'; }
    function do_action($hook) {}
    function esc_attr($value) { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
    function esc_html($value) { return htmlspecialchars((string) $value, ENT_QUOTES, 'UTF-8'); }
    function esc_url($value) { return esc_attr($value); }
    function esc_html_e($value, $domain = '') { echo esc_html($value); }
    function esc_attr_e($value, $domain = '') { echo esc_attr($value); }
    function wp_kses_post($value) { return (string) $value; }
    function absint($value) { return abs((int) $value); }
    function wp_unslash($value) { return $value; }
    function current_datetime() { return new Nevari_Visual_Preview_Date(); }
    function get_option($key, $default = false) {
        if ('date_format' === $key) return 'M j, Y';
        if ('time_format' === $key) return 'g:i A';
        return $default;
    }
    function wc_price($value) { return '$' . number_format((float) $value, 2); }
    function wc_placeholder_img_src($size = '') { return 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2264%22 height=%2264%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%23d9dee5%22/%3E%3C/svg%3E'; }
    function add_query_arg($key, $value = null, $url = '') { return '#'; }

    require dirname(__DIR__) . '/nevari-checkout/includes/elementor/class-commerce-renderer.php';

    \Elementor\Plugin::$instance = (object) array(
        'editor' => new class {
            public function is_edit_mode() { return true; }
        },
    );

    $reflection = new \ReflectionClass('\Nevari\Checkout\Elementor\Commerce_Renderer');
    $renderer = $reflection->newInstanceWithoutConstructor();
    $module = $reflection->getProperty('module');
    $module->setAccessible(true);
    $module->setValue($renderer, new \Nevari\Checkout\Elementor\Visual_Preview_Module());

    ?><!doctype html>
    <html lang="en">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Nevari Order Progress Visual Preview</title>
        <link rel="stylesheet" href="/nevari-checkout/assets/css/nevari-commerce-widgets.css">
        <style>html,body{margin:0;background:#fff} .nevari-preview-badge{display:none!important}</style>
    </head>
    <body>
        <?php echo $renderer->render_order_progress(); ?>
    </body>
    </html><?php
}
