<?php
/**
 * Plugin Name: Nevari Pharmacy Core
 * Plugin URI: https://example.com/nevari-pharmacy-core
 * Description: WooCommerce pharmacy consultation, prescription, email, and audit-log API layer for a Next.js admin dashboard.
 * Version: 0.1.0
 * Author: Nevari
 * Text Domain: nevari-pharmacy-core
 * Requires at least: 6.2
 * Requires PHP: 7.4
 * WC requires at least: 7.0
 */

if (!defined('ABSPATH')) {
    exit;
}

define('NEVARI_PHARMACY_VERSION', '0.4.0');
define('NEVARI_PHARMACY_FILE', __FILE__);
define('NEVARI_PHARMACY_DIR', plugin_dir_path(__FILE__));
define('NEVARI_PHARMACY_URL', plugin_dir_url(__FILE__));
define('NEVARI_PHARMACY_REST_NS', 'nevari/v1');

require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-helpers.php';
require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-activator.php';
require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-audit.php';
require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-auth.php';
require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-connections.php';
require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-emails.php';
require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-rest.php';
require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-admin.php';
require_once NEVARI_PHARMACY_DIR . 'includes/class-nevari-plugin.php';

register_activation_hook(__FILE__, ['Nevari_Activator', 'activate']);
register_deactivation_hook(__FILE__, ['Nevari_Activator', 'deactivate']);

add_action('plugins_loaded', static function () {
    Nevari_Activator::maybe_upgrade();
    Nevari_Plugin::instance()->init();
});
