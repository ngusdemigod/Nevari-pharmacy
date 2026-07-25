<?php

if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Elementor {
    private static $instance = null;
    private $plugin_file = '';
    private $plugin_path = '';
    private $plugin_url = '';

    public static function instance($plugin_file = '') {
        if (null === self::$instance) {
            if (empty($plugin_file)) {
                return null;
            }

            self::$instance = new self($plugin_file);
        }

        return self::$instance;
    }

    private function __construct($plugin_file) {
        $this->plugin_file = $plugin_file;
        $this->plugin_path = plugin_dir_path($plugin_file);
        $this->plugin_url  = plugin_dir_url($plugin_file);

        add_action('elementor/widgets/register', array($this, 'register_widgets'));
        add_action('elementor/elements/categories_registered', array($this, 'register_category'));
        add_action('wp_enqueue_scripts', array($this, 'register_assets'));
        add_action('elementor/editor/before_enqueue_scripts', array($this, 'register_assets'));
    }

    public function register_assets() {
        wp_register_style(
            'nevari-products-widget',
            $this->plugin_url . 'assets/css/nevari-products-widget.css',
            array(),
            '1.0.0'
        );

        wp_register_style(
            'nevari-product-list-grid-widget',
            $this->plugin_url . 'assets/css/nevari-product-list-grid-widget.css',
            array(),
            '1.0.0'
        );

        wp_register_style(
            'nevari-auth-widget',
            $this->plugin_url . 'assets/css/nevari-auth-widget.css',
            array(),
            '1.0.0'
        );

        wp_register_script(
            'nevari-auth-widget',
            $this->plugin_url . 'assets/js/nevari-auth-widget.js',
            array(),
            '1.0.0',
            true
        );

        wp_register_style(
            'nevari-reviews-widget',
            $this->plugin_url . 'assets/css/nevari-reviews-widget.css',
            array(),
            '1.0.0'
        );

        wp_register_script(
            'nevari-reviews-widget',
            $this->plugin_url . 'assets/js/nevari-reviews-widget.js',
            array(),
            '1.0.0',
            true
        );
    }

    public function register_category($elements_manager) {
        if (!is_object($elements_manager) || !method_exists($elements_manager, 'add_category')) {
            return;
        }

        $elements_manager->add_category(
            'nevari',
            array(
                'title' => __('Nevari', 'woocommerce'),
                'icon'  => 'fa fa-plug',
            )
        );
    }

    public function register_widgets($widgets_manager) {
        $widget_file = $this->plugin_path . 'includes/class-nevari-products-widget.php';
        $list_widget_file = $this->plugin_path . 'includes/class-nevari-product-list-grid-widget.php';
        $auth_widget_file = $this->plugin_path . 'includes/class-nevari-auth-widget.php';
        $reviews_widget_file = $this->plugin_path . 'includes/class-nevari-reviews-widget.php';

        if (file_exists($widget_file)) {
            require_once $widget_file;
        }

        if (class_exists('Nevari_Products_Widget') && file_exists($list_widget_file)) {
            require_once $list_widget_file;
        }

        if (file_exists($auth_widget_file)) {
            require_once $auth_widget_file;
        }

        if (file_exists($reviews_widget_file)) {
            require_once $reviews_widget_file;
        }

        $widgets = array();

        if (class_exists('Nevari_Products_Widget')) {
            $widgets[] = new Nevari_Products_Widget();
        }

        if (class_exists('Nevari_Product_List_Grid_Widget')) {
            $widgets[] = new Nevari_Product_List_Grid_Widget();
        }

        if (class_exists('Nevari_Auth_Widget')) {
            $widgets[] = new Nevari_Auth_Widget();
        }

        if (class_exists('Nevari_Reviews_Widget')) {
            $widgets[] = new Nevari_Reviews_Widget();
        }

        foreach ($widgets as $widget) {
            if (method_exists($widgets_manager, 'register')) {
                $widgets_manager->register($widget);
            } elseif (method_exists($widgets_manager, 'register_widget_type')) {
                $widgets_manager->register_widget_type($widget);
            }
        }
    }
}
