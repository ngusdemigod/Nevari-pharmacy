<?php
/**
 * Product reviews block compatibility wrapper.
 *
 * @package NevariCheckout
 */

defined('ABSPATH') || exit;

if (!isset($product) || !$product instanceof WC_Product) {
    return;
}

$nevari_product_experience = Nevari_Product_Experience::instance();

if (!$nevari_product_experience) {
    return;
}

$nevari_product_experience->render_plugin_template(
    'templates/woocommerce/native-single-product-reviews.php',
    array(
        'product'               => $product,
        'review_payload'        => isset($review_payload) && is_array($review_payload) ? $review_payload : array(),
        'review_module_options' => isset($review_module_options) && is_array($review_module_options) ? $review_module_options : array(),
    )
);
