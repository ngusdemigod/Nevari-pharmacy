<?php
/**
 * AJAX add to cart button.
 *
 * @package NevariCheckout
 */

defined('ABSPATH') || exit;

if (!isset($product) || !$product instanceof WC_Product) {
    return;
}

$nevari_product_experience = Nevari_Product_Experience::instance();
$defaults = $nevari_product_experience ? $nevari_product_experience->get_add_to_cart_button_default_options() : array();
$module_settings = isset($add_to_cart_options) && is_array($add_to_cart_options)
    ? wp_parse_args($add_to_cart_options, $defaults)
    : $defaults;

$product_id   = $product->get_id();
$initial_quantity = max(1, (int) $quantity);
$icon_url = !empty($module_settings['icon_url']) ? esc_url($module_settings['icon_url']) : '';
$icon_type = isset($module_settings['button_icon_type']) ? $module_settings['button_icon_type'] : 'cart';
$icon_size = isset($module_settings['button_icon_size']) ? (int) $module_settings['button_icon_size'] : 20;
$button_class = 'nevari-ajax-add-to-cart button';
$button_style = sprintf(
    '--nevari-ajax-button-bg:%1$s;--nevari-ajax-button-text:%2$s;--nevari-ajax-button-hover:%3$s;--nevari-ajax-button-icon:%4$s;--nevari-ajax-button-font:%5$s;--nevari-ajax-button-font-size:%6$dpx;--nevari-ajax-button-font-weight:%7$d;--nevari-ajax-button-radius:%8$dpx;--nevari-ajax-button-icon-size:%9$dpx;--nevari-ajax-notice-bg:%10$s;--nevari-ajax-notice-text:%11$s;--nevari-ajax-notice-icon:%12$s;--nevari-ajax-notice-font:%13$s;--nevari-ajax-notice-font-size:%14$dpx;--nevari-ajax-notice-font-weight:%15$d;--nevari-ajax-notice-radius:%16$dpx;--nevari-ajax-notice-icon-size:%17$dpx;',
    esc_attr($module_settings['button_bg_color']),
    esc_attr($module_settings['button_text_color']),
    esc_attr($module_settings['button_hover_color']),
    esc_attr($module_settings['button_icon_color']),
    esc_attr($module_settings['button_font_family']),
    (int) $module_settings['button_font_size'],
    (int) $module_settings['button_font_weight'],
    (int) $module_settings['button_border_radius'],
    (int) $icon_size,
    esc_attr($module_settings['notice_bg_color']),
    esc_attr($module_settings['notice_text_color']),
    esc_attr($module_settings['notice_icon_color']),
    esc_attr($module_settings['notice_font_family']),
    (int) $module_settings['notice_font_size'],
    (int) $module_settings['notice_font_weight'],
    (int) $module_settings['notice_border_radius'],
    (int) $icon_size
);

if (!empty($extra_class)) {
    $button_class .= ' ' . sanitize_html_class($extra_class);
}

$button_class .= $product->is_purchasable() && $product->is_in_stock() && 'simple' === $product->get_type()
    ? ' is-enabled'
    : ' is-disabled';

$is_disabled = !($product->is_purchasable() && $product->is_in_stock() && 'simple' === $product->get_type());
$button_text  = $is_disabled ? __('Select options', 'woocommerce') : $module_settings['button_label'];
?>
<div class="nevari-ajax-add-to-cart-wrap" style="<?php echo esc_attr($button_style); ?>">
    <?php if ($is_disabled) : ?>
    <a
            class="<?php echo esc_attr($button_class); ?>"
            href="<?php echo esc_url($product->get_permalink()); ?>"
            aria-label="<?php echo esc_attr($button_text); ?>"
        >
            <?php if (!empty($module_settings['button_show_icon'])) : ?>
                <?php echo $nevari_product_experience ? $nevari_product_experience->get_add_to_cart_icon_markup($icon_type, $icon_url, $module_settings['button_icon_color'], $icon_size, 'button') : ''; ?>
            <?php endif; ?>
            <span class="nevari-ajax-add-to-cart__label"><?php echo esc_html($button_text); ?></span>
        </a>
    <?php else : ?>
        <div class="nevari-ajax-add-to-cart-purchase">
            <div class="nevari-cart-qty-control nevari-ajax-add-to-cart-qty" data-nevari-ajax-qty-control>
                <div class="nevari-cart-qty-main">
                    <button type="button" class="nevari-cart-qty-btn is-light" data-qty-action="decrease" aria-label="<?php esc_attr_e('Decrease quantity', 'woocommerce'); ?>">
                        <span class="nevari-cart-minus" aria-hidden="true"></span>
                    </button>
                    <input
                        type="number"
                        class="nevari-cart-qty-input"
                        value="<?php echo esc_attr($initial_quantity); ?>"
                        min="1"
                        step="1"
                        inputmode="numeric"
                        aria-label="<?php esc_attr_e('Quantity', 'woocommerce'); ?>"
                        data-nevari-ajax-quantity-input
                    >
                    <button type="button" class="nevari-cart-qty-btn is-dark" data-qty-action="increase" aria-label="<?php esc_attr_e('Increase quantity', 'woocommerce'); ?>">
                        <span class="nevari-cart-plus" aria-hidden="true"></span>
                    </button>
                </div>
            </div>
            <span class="nevari-cart-qty-loader" aria-hidden="true"></span>

            <button
                type="button"
                class="<?php echo esc_attr($button_class); ?>"
                data-nevari-ajax-add-to-cart
                data-product-id="<?php echo esc_attr($product_id); ?>"
                data-quantity="<?php echo esc_attr($initial_quantity); ?>"
                data-added-label="<?php echo esc_attr($module_settings['button_added_label']); ?>"
                data-snackbar-template="<?php echo esc_attr($module_settings['notice_template']); ?>"
                data-product-name="<?php echo esc_attr($product->get_name()); ?>"
                aria-label="<?php echo esc_attr($button_text); ?>"
            >
                <?php if (!empty($module_settings['button_show_icon'])) : ?>
                    <?php echo $nevari_product_experience ? $nevari_product_experience->get_add_to_cart_icon_markup($icon_type, $icon_url, $module_settings['button_icon_color'], $icon_size, 'button') : ''; ?>
                <?php endif; ?>
                <span class="nevari-ajax-add-to-cart__label"><?php echo esc_html($button_text); ?></span>
            </button>
        </div>
    <?php endif; ?>
    <span class="nevari-ajax-add-to-cart__status screen-reader-text" aria-live="polite"></span>
</div>
