<?php
/**
 * Custom reviews section for single product pages.
 *
 * @package NevariCheckout
 */

defined('ABSPATH') || exit;

global $product;

if (!$product instanceof WC_Product) {
    return;
}

$nevari_product_experience = Nevari_Product_Experience::instance();
$review_payload            = isset($nevari_review_payload) && is_array($nevari_review_payload) ? $nevari_review_payload : array(
    'reviews' => array(),
);
$reviews                   = isset($review_payload['reviews']) && is_array($review_payload['reviews']) ? $review_payload['reviews'] : array();
$module_settings           = isset($review_module_options) && is_array($review_module_options)
    ? wp_parse_args($review_module_options, $nevari_product_experience ? $nevari_product_experience->get_reviews_module_default_options() : array())
    : array();
$show_reviewer_name        = !isset($module_settings['show_reviewer_name']) || (int) $module_settings['show_reviewer_name'] === 1;
$show_verified_badge       = !isset($module_settings['show_verified_badge']) || (int) $module_settings['show_verified_badge'] === 1;
$empty_state               = isset($module_settings['empty_state']) && '' !== trim((string) $module_settings['empty_state'])
    ? $module_settings['empty_state']
    : __('No approved reviews yet. Be the first verified buyer to submit one.', 'woocommerce');
?>
<div class="nevari-review-list">
    <?php if (!empty($reviews)) : ?>
        <?php foreach ($reviews as $review) : ?>
            <?php $review_title = isset($review['title']) && '' !== trim((string) $review['title']) ? $review['title'] : __('Review', 'woocommerce'); ?>
            <article class="nevari-review-card">
                <div class="nevari-review-card__header">
                    <div class="nevari-review-card__title-wrap">
                        <h3 class="nevari-review-card__title"><?php echo esc_html($review_title); ?></h3>
                        <div class="nevari-review-card__meta">
                            <?php if ($show_reviewer_name && !empty($review['reviewer_name'])) : ?>
                                <span class="nevari-review-card__author"><?php echo esc_html($review['reviewer_name']); ?></span>
                            <?php endif; ?>

                            <?php if ($show_verified_badge && !empty($review['verified'])) : ?>
                                <span class="nevari-review-card__verified"><?php esc_html_e('Verified buyer', 'woocommerce'); ?></span>
                            <?php endif; ?>
                        </div>
                    </div>

                    <div class="nevari-review-card__stars">
                        <?php echo $nevari_product_experience ? wp_kses_post($nevari_product_experience->render_stars((int) $review['rating'])) : ''; ?>
                    </div>
                </div>

                <div class="nevari-review-card__content"><?php echo wp_kses_post($review['content']); ?></div>
            </article>
        <?php endforeach; ?>
    <?php else : ?>
        <div class="nevari-review-card nevari-review-card--empty">
            <p><?php echo esc_html($empty_state); ?></p>
        </div>
    <?php endif; ?>
</div>
