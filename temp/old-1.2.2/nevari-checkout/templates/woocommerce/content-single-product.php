<?php
/**
 * Hook-driven single product wrapper for the plugin-owned redesign.
 *
 * @package NevariCheckout
 */

defined('ABSPATH') || exit;

$nevari_product_experience = Nevari_Product_Experience::instance();
$product                   = $nevari_product_experience ? $nevari_product_experience->get_current_product() : false;

if (!$product instanceof WC_Product) {
    return;
}

do_action('woocommerce_before_single_product');

if (post_password_required()) {
    echo get_the_password_form();
    return;
}
?>
<div id="product-<?php the_ID(); ?>" <?php wc_product_class('nevari-product-shell', $product); ?>>
    <?php echo $nevari_product_experience ? wp_kses_post($nevari_product_experience->get_product_notice()) : ''; ?>
    <?php do_action('nevari_single_product_content', $product); ?>
</div>
<?php do_action('woocommerce_after_single_product'); ?>
