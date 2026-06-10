<?php
/**
 * Native WooCommerce product reviews rendered in the Nevari layout.
 *
 * @package NevariCheckout
 */

defined('ABSPATH') || exit;

global $product;

if (!$product instanceof WC_Product) {
    $product = function_exists('wc_get_product') && get_the_ID() ? wc_get_product(get_the_ID()) : false;
}

if (!$product instanceof WC_Product) {
    return;
}

$nevari_product_experience = Nevari_Product_Experience::instance();
$module_settings = isset($review_module_options) && is_array($review_module_options)
    ? wp_parse_args($review_module_options, $nevari_product_experience ? $nevari_product_experience->get_reviews_module_default_options() : array())
    : ($nevari_product_experience ? $nevari_product_experience->get_reviews_module_options() : array());

if (!isset($review_payload) || !is_array($review_payload)) {
    $review_payload = $nevari_product_experience
        ? $nevari_product_experience->get_frontend_reviews_payload($product->get_id(), (int) ($module_settings['reviews_limit'] ?? 0))
        : array();
}

$stats            = isset($review_payload['stats']) && is_array($review_payload['stats']) ? $review_payload['stats'] : array('total' => 0, 'average' => 0, 'distribution' => array(5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0));
$distribution     = isset($review_payload['distribution']) && is_array($review_payload['distribution']) ? $review_payload['distribution'] : array();
$reviews          = isset($review_payload['reviews']) && is_array($review_payload['reviews']) ? $review_payload['reviews'] : array();
$can_review       = !empty($review_payload['can_review']);
$access_type      = isset($review_payload['access_type']) ? (string) $review_payload['access_type'] : '';
$access_message   = isset($review_payload['access_message']) ? (string) $review_payload['access_message'] : '';
$total_reviews    = isset($review_payload['total']) ? (int) $review_payload['total'] : (int) $product->get_review_count();
$pages            = isset($review_payload['pages']) ? max(1, (int) $review_payload['pages']) : 1;
$page             = isset($review_payload['page']) ? max(1, (int) $review_payload['page']) : 1;
$heading          = isset($module_settings['heading']) ? $module_settings['heading'] : __('Customer Reviews', 'woocommerce');
$intro_template    = isset($module_settings['intro']) ? $module_settings['intro'] : __('Average rating: {average} ({total})', 'woocommerce');
$intro_text        = str_replace(
    array('{average}', '{total}'),
    array(number_format_i18n((float) $stats['average'], 1), number_format_i18n($total_reviews)),
    $intro_template
);
$show_distribution = !isset($module_settings['show_distribution']) || (int) $module_settings['show_distribution'] === 1;
$show_reviewer_name = !isset($module_settings['show_reviewer_name']) || (int) $module_settings['show_reviewer_name'] === 1;
$show_verified_badge = !isset($module_settings['show_verified_badge']) || (int) $module_settings['show_verified_badge'] === 1;
$empty_state = isset($module_settings['empty_state']) && '' !== trim((string) $module_settings['empty_state'])
    ? $module_settings['empty_state']
    : __('No approved reviews yet. Be the first verified buyer to submit one.', 'woocommerce');
$reviews_url = get_permalink($product->get_id());
$commenter = wp_get_current_commenter();

$format_count = static function ($count) {
    $count = max(0, (int) $count);

    if ($count >= 1000000) {
        $value = rtrim(rtrim(number_format($count / 1000000, 2, '.', ''), '0'), '.');
        return $value . 'M';
    }

    if ($count >= 1000) {
        $value = rtrim(rtrim(number_format($count / 1000, 2, '.', ''), '0'), '.');
        return $value . 'K';
    }

    return number_format_i18n($count);
};

$render_pagination_link = static function ($target_page, $label) use ($reviews_url) {
    $url = add_query_arg('cpage', max(1, (int) $target_page), $reviews_url) . '#nevari-product-reviews';

    return '<a class="nevari-review-pagination__link" href="' . esc_url($url) . '">' . esc_html($label) . '</a>';
};

$render_rating_field = static function () {
    $options = array(
        ''  => __('Rate&hellip;', 'woocommerce'),
        5   => __('Perfect', 'woocommerce'),
        4   => __('Good', 'woocommerce'),
        3   => __('Average', 'woocommerce'),
        2   => __('Not that bad', 'woocommerce'),
        1   => __('Very poor', 'woocommerce'),
    );

    ob_start();
    ?>
    <div class="nevari-review-form__field nevari-review-form__field--rating">
        <label for="rating" id="comment-form-rating-label">
            <?php esc_html_e('Your rating', 'woocommerce'); ?>
            <span class="required">*</span>
        </label>
        <select name="rating" id="rating" required>
            <?php foreach ($options as $value => $label) : ?>
                <option value="<?php echo esc_attr($value); ?>"><?php echo esc_html($label); ?></option>
            <?php endforeach; ?>
        </select>
    </div>
    <?php
    return ob_get_clean();
};
?>
<section class="nevari-review-block" id="nevari-product-reviews">
    <aside class="nevari-review-block__summary">
        <div class="nevari-review-block__heading">
            <h2><?php echo esc_html($heading); ?></h2>
            <p><?php echo esc_html($intro_text); ?></p>
        </div>

        <div class="nevari-review-summary__score" aria-label="<?php echo esc_attr(sprintf(__('Average rating %1$s out of 5', 'woocommerce'), number_format_i18n((float) $stats['average'], 1))); ?>">
            <span class="nevari-review-summary__score-value"><?php echo esc_html(number_format_i18n((float) $stats['average'], 1)); ?></span>
            <div class="nevari-review-summary__score-stars">
                <?php echo wp_kses_post($nevari_product_experience ? $nevari_product_experience->render_stars((int) round((float) $stats['average'])) : ''); ?>
            </div>
            <span class="nevari-review-summary__score-total"><?php echo esc_html(sprintf('(%s)', number_format_i18n($total_reviews))); ?></span>
        </div>

        <?php if ($show_distribution) : ?>
            <div class="nevari-review-distribution" aria-label="<?php esc_attr_e('Review distribution', 'woocommerce'); ?>">
                <?php foreach ($distribution as $distribution_item) : ?>
                    <div class="nevari-review-distribution__row">
                        <div class="nevari-review-distribution__label">
                            <span class="nevari-review-distribution__stars"><?php echo esc_html((string) $distribution_item['stars']); ?></span>
                            <span class="nevari-review-distribution__star" aria-hidden="true">&#9733;</span>
                        </div>
                        <div class="nevari-review-distribution__track" aria-hidden="true">
                            <span class="nevari-review-distribution__fill" style="width: <?php echo esc_attr((string) $distribution_item['percent']); ?>%;"></span>
                        </div>
                        <div class="nevari-review-distribution__count"><?php echo esc_html($format_count($distribution_item['count'])); ?></div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

        <?php if ($can_review) : ?>
            <button type="button" class="nevari-review-form__jump" data-nevari-review-scroll>
                <?php esc_html_e('Write a Review', 'woocommerce'); ?>
            </button>
        <?php endif; ?>
    </aside>

    <div class="nevari-review-block__list">
        <div class="nevari-review-block__list-header">
            <div class="nevari-review-block__list-heading">
                <h2><?php esc_html_e('Reviews', 'woocommerce'); ?></h2>
            </div>
            <div class="nevari-review-block__list-count">
                <?php echo esc_html(sprintf(_n('%s review', '%s reviews', $total_reviews, 'woocommerce'), number_format_i18n($total_reviews))); ?>
            </div>
        </div>

        <?php if (!empty($reviews)) : ?>
            <div class="nevari-review-list" aria-live="polite">
                <?php foreach ($reviews as $review) : ?>
                    <article class="nevari-review-card" id="review-<?php echo esc_attr((string) $review['id']); ?>">
                        <div class="nevari-review-card__header">
                            <div class="nevari-review-card__title-wrap">
                                <div class="nevari-review-card__title">
                                    <?php echo esc_html(($show_reviewer_name && !empty($review['reviewer_name'])) ? $review['reviewer_name'] : 'admin'); ?>
                                </div>

                                <div class="nevari-review-card__stars">
                                <?php echo $nevari_product_experience ? wp_kses_post($nevari_product_experience->render_stars((int) $review['rating'])) : ''; ?>
                                </div>
                            </div>
                        </div>

                        <div class="nevari-review-card__content">
                            <?php echo wp_kses_post($review['content']); ?>
                        </div>
                    </article>
                <?php endforeach; ?>
            </div>
        <?php else : ?>
            <div class="nevari-review-card nevari-review-card--empty">
                <p><?php echo esc_html($empty_state); ?></p>
            </div>
        <?php endif; ?>

        <?php if ($pages > 1) : ?>
            <nav class="nevari-review-pagination" aria-label="<?php esc_attr_e('Review pagination', 'woocommerce'); ?>">
                <?php if ($page > 1) : ?>
                    <?php echo wp_kses_post($render_pagination_link($page - 1, __('Previous', 'woocommerce'))); ?>
                <?php endif; ?>

                <span class="nevari-review-pagination__status">
                    <?php echo esc_html(sprintf(__('Page %1$s of %2$s', 'woocommerce'), number_format_i18n($page), number_format_i18n($pages))); ?>
                </span>

                <?php if ($page < $pages) : ?>
                    <?php echo wp_kses_post($render_pagination_link($page + 1, __('Next', 'woocommerce'))); ?>
                <?php endif; ?>
            </nav>
        <?php endif; ?>

        <div class="nevari-review-form-wrap" id="review_form_wrapper">
            <div class="nevari-review-form-wrap__header">
                <h2 id="review_form_title"><?php esc_html_e('Write a Review', 'woocommerce'); ?></h2>
                <?php if ($can_review) : ?>
                    <p><?php esc_html_e('Your review will be saved as a native WooCommerce product comment and can be moderated by admins.', 'woocommerce'); ?></p>
                <?php else : ?>
                    <p><?php echo wp_kses_post($access_message); ?></p>
                <?php endif; ?>
            </div>

            <?php if ($can_review && comments_open($product->get_id())) : ?>
                <div id="review_form" class="nevari-review-form">
                    <?php
                    $comment_form = array(
                        'title_reply'         => '',
                        'title_reply_before'  => '',
                        'title_reply_after'   => '',
                        'comment_notes_before'=> '',
                        'comment_notes_after' => wp_nonce_field('nevari_submit_review', 'nevari_review_nonce', true, false),
                        'label_submit'        => esc_html__('Submit Review', 'woocommerce'),
                        'logged_in_as'        => '',
                        'must_log_in'         => '',
                        'fields'              => array(),
                        'class_form'          => 'nevari-review-form__form',
                        'class_submit'        => 'button nevari-review-form__submit',
                    );

                    $comment_form['comment_field']  = $render_rating_field();
                    $comment_form['comment_field'] .= '<div class="nevari-review-form__field nevari-review-form__field--comment"><label for="comment">' . esc_html__('Your review', 'woocommerce') . '&nbsp;<span class="required">*</span></label><textarea id="comment" name="comment" cols="45" rows="8" required></textarea></div>';

                    $comment_form['submit_field'] = '<p class="form-submit nevari-review-form__submit-wrap">%1$s %2$s</p>';

                    comment_form(
                        apply_filters('woocommerce_product_review_comment_form_args', $comment_form),
                        $product->get_id()
                    );
                    ?>
                </div>
            <?php elseif (!$can_review && !empty($access_type) && 'login' === $access_type) : ?>
                <p class="nevari-review-access">
                    <?php echo wp_kses_post($access_message); ?>
                </p>
            <?php elseif (!$can_review && !empty($access_type) && 'purchase' === $access_type) : ?>
                <p class="nevari-review-access">
                    <?php echo esc_html($access_message); ?>
                </p>
            <?php else : ?>
                <p class="nevari-review-access"><?php esc_html_e('Reviews are currently closed for this product.', 'woocommerce'); ?></p>
            <?php endif; ?>
        </div>
    </div>
</section>
