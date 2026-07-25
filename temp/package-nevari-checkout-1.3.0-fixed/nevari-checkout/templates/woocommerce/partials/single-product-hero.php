<?php
/**
 * Product hero section.
 *
 * @package NevariCheckout
 */

defined('ABSPATH') || exit;

if (!isset($product) || !$product instanceof WC_Product) {
    return;
}

$review_stats  = isset($review_payload['stats']) && is_array($review_payload['stats']) ? $review_payload['stats'] : array(
    'total'   => 0,
    'average' => 0,
);
$review_total  = isset($review_stats['total']) ? (int) $review_stats['total'] : 0;
$review_average = isset($review_stats['average']) ? (float) $review_stats['average'] : 0;
$product_badge = $product->is_featured() ? __('Best Seller Product', 'woocommerce') : __('Signature Product', 'woocommerce');
?>
<section class="nevari-product-hero">
    <div class="nevari-product-gallery" data-nevari-gallery>
        <div class="nevari-product-gallery__main">
            <?php if (!empty($gallery)) : ?>
                <img
                    src="<?php echo esc_url($gallery[0]['full']); ?>"
                    alt="<?php echo esc_attr($gallery[0]['alt']); ?>"
                    class="nevari-product-gallery__image"
                    data-nevari-gallery-main
                >
            <?php endif; ?>
        </div>

        <?php if (count($gallery) > 1) : ?>
            <div class="nevari-product-gallery__thumbs" role="list">
                <?php foreach ($gallery as $index => $image) : ?>
                    <button
                        type="button"
                        class="nevari-product-gallery__thumb <?php echo 0 === $index ? 'is-active' : ''; ?>"
                        data-nevari-gallery-thumb
                        data-full="<?php echo esc_url($image['full']); ?>"
                        data-alt="<?php echo esc_attr($image['alt']); ?>"
                        aria-label="<?php echo esc_attr(sprintf(__('Show image %d', 'woocommerce'), $index + 1)); ?>"
                    >
                        <img src="<?php echo esc_url($image['thumb']); ?>" alt="<?php echo esc_attr($image['alt']); ?>">
                    </button>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>

    <div class="nevari-product-summary">
        <div class="nevari-product-summary__eyebrow">
            <span class="nevari-product-summary__badge"><?php echo esc_html($product_badge); ?></span>

            <?php if ($review_total > 0) : ?>
                <a class="nevari-product-summary__reviews-link" href="#nevari-product-reviews">
                    <span class="nevari-product-summary__reviews-stars" aria-hidden="true">&#9733;</span>
                    <?php
                    echo esc_html(
                        sprintf(
                            __('%1$s rating (%2$s reviews)', 'woocommerce'),
                            number_format_i18n($review_average, 1),
                            number_format_i18n($review_total)
                        )
                    );
                    ?>
                </a>
            <?php endif; ?>
        </div>

        <div class="nevari-product-summary__top">
            <h1 class="nevari-product-title"><?php echo esc_html($product->get_name()); ?></h1>

            <div class="nevari-product-pricing">
                <?php if ($unit_price) : ?>
                    <div class="nevari-product-pricing__unit"><?php echo esc_html($unit_price); ?></div>
                <?php endif; ?>

                <div class="nevari-product-pricing__current"><?php echo wp_kses_post($product->get_price_html()); ?></div>

                <?php if ($product->is_in_stock()) : ?>
                    <div class="nevari-product-pricing__stock <?php echo $stock_quantity > 0 && $stock_quantity <= 12 ? 'is-low' : 'is-in-stock'; ?>">
                        <?php
                        if ($stock_quantity > 0) {
                            echo esc_html(sprintf(__('%d Left', 'woocommerce'), $stock_quantity));
                        } else {
                            esc_html_e('In Stock', 'woocommerce');
                        }
                        ?>
                    </div>
                <?php else : ?>
                    <div class="nevari-product-pricing__stock is-out"><?php esc_html_e('Out of stock', 'woocommerce'); ?></div>
                <?php endif; ?>
            </div>
        </div>

        <div class="nevari-product-summary__purchase">
            <div class="nevari-product-add-to-cart">
                <?php
                if ($product->is_type('simple')) {
                    echo do_shortcode('[nevari_ajax_add_to_cart]');
                } else {
                    woocommerce_template_single_add_to_cart();
                }
                ?>
            </div>

            <div class="nevari-product-summary__assurance">
                <span class="nevari-product-summary__assurance-icon" aria-hidden="true"></span>
                <div>
                    <strong><?php esc_html_e('Fast checkout, secure order', 'woocommerce'); ?></strong>
                    <p><?php esc_html_e('Your selection, reviews, and checkout flow remain fully functional.', 'woocommerce'); ?></p>
                </div>
            </div>
        </div>

        <?php if (!empty($highlights)) : ?>
            <div class="nevari-product-about">
                <p class="nevari-product-about__label"><?php esc_html_e('Why shoppers choose it', 'woocommerce'); ?></p>

                <div class="nevari-product-about__items">
                    <?php foreach ($highlights as $highlight) : ?>
                        <div class="nevari-product-about__item">
                            <span class="nevari-product-about__icon is-<?php echo esc_attr($highlight['icon']); ?>" aria-hidden="true"></span>
                            <div class="nevari-product-about__copy">
                                <span class="nevari-product-about__text"><?php echo esc_html($highlight['title']); ?></span>
                            </div>
                            <?php if (!empty($highlight['link']) && !empty($highlight['link_text'])) : ?>
                                <a href="<?php echo esc_url($highlight['link']); ?>" class="nevari-product-about__link"><?php echo esc_html($highlight['link_text']); ?></a>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        <?php endif; ?>
    </div>
</section>
