<?php
/**
 * Plugin-owned single product template.
 *
 * @package NevariCheckout
 */

defined('ABSPATH') || exit;

get_header('shop');
?>
<?php
    do_action('woocommerce_before_main_content');
?>

<?php while (have_posts()) : ?>
    <?php the_post(); ?>
    <?php
    $nevari_product_experience = Nevari_Product_Experience::instance();

    if ($nevari_product_experience) {
        $nevari_product_experience->render_plugin_template('templates/woocommerce/content-single-product.php');
    }
    ?>
<?php endwhile; ?>

<?php
    do_action('woocommerce_after_main_content');
    do_action('woocommerce_sidebar');
?>

<?php get_footer('shop'); ?>
