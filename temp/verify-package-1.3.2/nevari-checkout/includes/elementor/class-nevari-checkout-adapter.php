<?php
/**
 * Backward-compatible loader for packages that referenced the adapter's old filename.
 */

namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

$nevari_woocommerce_adapter = __DIR__ . '/class-woocommerce-adapter.php';
if (is_readable($nevari_woocommerce_adapter)) {
    require_once $nevari_woocommerce_adapter;
}
