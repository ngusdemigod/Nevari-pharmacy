<?php
/**
 * Plugin Name: Nevari Checkout
 * Description: Secure Elementor cart, checkout, and order-progress widgets for WooCommerce.
 * Version: 1.3.0
 * Author: Silvera Tech
 * Requires Plugins: woocommerce
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 * Elementor requires at least: 3.15
 * Text Domain: nevari-checkout
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/includes/class-nevari-checkout.php';
require_once __DIR__ . '/includes/elementor/class-commerce-module.php';

register_activation_hook(__FILE__, function () {
    if (class_exists('Nevari_Product_Experience')) {
        Nevari_Product_Experience::instance(__FILE__);
        Nevari_Product_Experience::activate();
    }
});

add_action('plugins_loaded', function () {
    if (class_exists('WooCommerce')) {
        $core = Nevari_Checkout::instance(__FILE__);
        \Nevari\Checkout\Elementor\Commerce_Module::instance(__FILE__, $core);
    }
});
