<?php

$root = dirname(__DIR__);
$failures = array();

function nevari_assert_source($condition, $message) {
    global $failures;
    if (!$condition) {
        $failures[] = $message;
    }
}

$read = static function ($path) use ($root) {
    $contents = file_get_contents($root . '/' . $path);
    if (false === $contents) {
        throw new RuntimeException('Could not read ' . $path);
    }
    return $contents;
};

$bootstrap = $read('nevari-checkout.php');
$module = $read('includes/elementor/class-commerce-module.php');
$adapter = $read('includes/elementor/class-woocommerce-adapter.php');
$ajax = $read('includes/elementor/class-ajax-controller.php');
$service = $read('includes/elementor/class-checkout-service.php');
$renderer = $read('includes/elementor/class-commerce-renderer.php');

nevari_assert_source(false !== strpos($bootstrap, 'Version: 1.3.2'), 'Plugin version is not 1.3.2.');
nevari_assert_source(false !== strpos($bootstrap, 'add_action(' . chr(39) . 'init' . chr(39)), 'Plugin runtime is not deferred until init.');
nevari_assert_source(false === strpos($bootstrap, 'add_action(' . chr(39) . 'plugins_loaded' . chr(39)), 'Plugin runtime still starts on plugins_loaded.');
foreach (array('class-cart-widget.php', 'class-checkout-widget.php', 'class-order-progress-widget.php') as $widget) {
    nevari_assert_source(false !== strpos($module, $widget), 'Widget is not registered: ' . $widget);
}
nevari_assert_source(false !== strpos($adapter, 'get_current_user_id() === $customer_id'), 'Customer ownership check is missing.');
nevari_assert_source(false !== strpos($adapter, 'get_authorized_order_for_poll'), 'Signed polling authorization is missing.');
nevari_assert_source(false !== strpos($adapter, chr(92) . 'WC_Shipping_Zones::get_zone_matching_package'), 'WooCommerce shipping-zone class is not resolved from the global namespace.');
nevari_assert_source(false === strpos($adapter, "'order_key'       =>"), 'Order key is exposed in public view data.');
foreach (array('nevari-update-cart', 'nevari-checkout-coupon', 'nevari-order-progress', 'nevari-cart-total') as $nonce) {
    nevari_assert_source(false !== strpos($ajax, $nonce), 'Purpose nonce missing: ' . $nonce);
}
nevari_assert_source(false !== strpos($ajax, "'POST' !== strtoupper"), 'AJAX POST enforcement is missing.');
nevari_assert_source(false !== strpos($service, "'publish' !== get_post_status"), 'Published success-page check is missing.');
nevari_assert_source(false !== strpos($service, "hash_hmac('sha256', \$json"), 'Signed tip validation is missing.');
nevari_assert_source(false !== strpos($renderer, 'woocommerce-process_checkout'), 'Native WooCommerce checkout nonce is missing.');
nevari_assert_source(false !== strpos($renderer, 'woocommerce_checkout_place_order'), 'Native checkout submit contract is missing.');
nevari_assert_source(false === stripos($renderer, 'card_number'), 'Raw card number field detected.');
nevari_assert_source(false === stripos($renderer, 'cvv'), 'Raw CVV field detected.');

if ($failures) {
    fwrite(STDERR, implode(PHP_EOL, $failures) . PHP_EOL);
    exit(1);
}

fwrite(STDOUT, "Static commerce contracts passed.\n");
