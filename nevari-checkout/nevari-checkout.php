<?php
/**
 * Plugin Name: Nevari Checkout
 * Description: Replaces WooCommerce checkout page content with a custom two-column checkout layout.
 * Version: 1.1.0
 * Author: Silvera Tech
 * Requires Plugins: woocommerce
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/includes/class-nevari-checkout.php';

register_activation_hook(__FILE__, function () {
    if (class_exists('Nevari_Product_Experience')) {
        Nevari_Product_Experience::instance(__FILE__);
        Nevari_Product_Experience::activate();
    }
});

add_action('plugins_loaded', function () {
    if (class_exists('WooCommerce')) {
        Nevari_Checkout::instance(__FILE__);
    }
});
