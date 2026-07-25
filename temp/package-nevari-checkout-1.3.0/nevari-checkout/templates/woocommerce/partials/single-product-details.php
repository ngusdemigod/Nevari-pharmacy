<?php
/**
 * Product details accordion.
 *
 * @package NevariCheckout
 */

defined('ABSPATH') || exit;

if (empty($sections) || !is_array($sections)) {
    return;
}
?>
<section class="nevari-product-details" id="nevari-product-details">
    <div class="nevari-product-details__intro">
        <span class="nevari-product-details__kicker"><?php esc_html_e('Product Details', 'woocommerce'); ?></span>
        <h2 class="nevari-product-details__title"><?php esc_html_e('Everything you need to know before you order', 'woocommerce'); ?></h2>
    </div>

    <div class="nevari-product-accordion">
        <?php foreach ($sections as $index => $section) : ?>
            <div class="nevari-product-accordion__item <?php echo 0 === $index ? 'is-open' : ''; ?>">
                <button type="button" class="nevari-product-accordion__trigger" data-nevari-accordion-trigger aria-expanded="<?php echo 0 === $index ? 'true' : 'false'; ?>">
                    <span><?php echo esc_html($section['title']); ?></span>
                    <span class="nevari-product-accordion__chevron" aria-hidden="true"></span>
                </button>
                <div class="nevari-product-accordion__panel" data-nevari-accordion-panel <?php echo 0 === $index ? '' : 'hidden'; ?>>
                    <div class="nevari-product-accordion__content">
                        <?php echo wpautop(wp_kses_post($section['content'])); ?>
                    </div>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</section>
