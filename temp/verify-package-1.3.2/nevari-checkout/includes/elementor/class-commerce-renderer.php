<?php
/**
 * Canonical server-rendered commerce views.
 */

namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

final class Commerce_Renderer {
    private $module;
    private $adapter;
    private $core;

    public function __construct(Commerce_Module $module, WooCommerce_Adapter $adapter, $core) {
        $this->module  = $module;
        $this->adapter = $adapter;
        $this->core    = $core;
    }

    public static function cart_defaults() {
        return array(
            'show_back' => 'yes', 'back_label' => __('Back', 'nevari-checkout'), 'back_url' => wc_get_page_permalink('shop'),
            'heading' => __('Your Cart', 'nevari-checkout'), 'heading_tag' => 'h1', 'update_mode' => 'immediate', 'debounce' => 350,
            'show_image' => 'yes', 'show_regular_price' => 'yes', 'show_remove_icon' => 'no', 'show_remove_text' => 'yes',
            'remove_label' => __('Remove', 'nevari-checkout'), 'show_progress' => 'yes', 'summary_heading' => __('Order Summary', 'nevari-checkout'),
            'items_total_label' => __('Items total', 'nevari-checkout'), 'delivery_label' => __('Delivery fee', 'nevari-checkout'),
            'subtotal_label' => __('Subtotal', 'nevari-checkout'), 'checkout_label' => __('Checkout', 'nevari-checkout'),
            'empty_heading' => __('Your cart is empty', 'nevari-checkout'), 'empty_message' => __('Add something you need and it will appear here.', 'nevari-checkout'),
            'continue_label' => __('Continue shopping', 'nevari-checkout'), 'continue_url' => wc_get_page_permalink('shop'),
            'checkout_url' => wc_get_checkout_url(), 'sticky_summary' => '', 'sticky_offset' => 24,
        );
    }

    public static function checkout_defaults() {
        return array(
            'show_back' => 'yes', 'back_label' => __('Back', 'nevari-checkout'), 'back_url' => wc_get_cart_url(),
            'heading' => __('Checkout', 'nevari-checkout'), 'heading_tag' => 'h1', 'delivery_heading' => __('Delivery info', 'nevari-checkout'),
            'full_name_label' => __('Full name', 'nevari-checkout'), 'full_name_placeholder' => __('Enter your full name', 'nevari-checkout'),
            'email_label' => __('Email address', 'nevari-checkout'), 'email_placeholder' => __('Enter your email address', 'nevari-checkout'),
            'address_label' => __('Deliver To:', 'nevari-checkout'), 'address_placeholder' => __('Enter your delivery address', 'nevari-checkout'),
            'payment_heading' => __('Payment Method', 'nevari-checkout'), 'review_heading' => __('Review Order', 'nevari-checkout'),
            'max_thumbnails' => 6, 'show_tip' => 'yes', 'tip_source' => 'fixed', 'tip_heading' => __('Delivery Tip', 'nevari-checkout'),
            'tip_helper' => __('Your delivery person keeps 100% of tips.', 'nevari-checkout'), 'tip_values' => '5,10,15,20,30',
            'other_tip_label' => __('Other', 'nevari-checkout'), 'custom_tip_min' => 0, 'custom_tip_max' => 500,
            'show_coupon' => 'yes', 'coupon_heading' => __('Coupon', 'nevari-checkout'), 'coupon_trigger' => __('Add Coupon', 'nevari-checkout'),
            'coupon_placeholder' => __('Enter coupon code', 'nevari-checkout'), 'coupon_apply' => __('Apply', 'nevari-checkout'), 'coupon_remove' => __('Remove', 'nevari-checkout'),
            'summary_heading' => __('Order Summary', 'nevari-checkout'), 'items_total_label' => __('Items total', 'nevari-checkout'),
            'delivery_label' => __('Delivery fee', 'nevari-checkout'), 'service_fee_label' => __('Service fee', 'nevari-checkout'),
            'discount_label' => __('Discount', 'nevari-checkout'), 'tax_label' => __('Tax', 'nevari-checkout'), 'total_label' => __('Total', 'nevari-checkout'),
            'terms_text' => __('By placing this order, you agree to the Terms and Conditions.', 'nevari-checkout'),
            'place_order_label' => __('Place Order', 'nevari-checkout'), 'loading_label' => __('Placing order…', 'nevari-checkout'),
            'success_page_id' => 0, 'sticky_summary' => '', 'sticky_offset' => 24,
        );
    }

    public static function order_defaults() {
        return array(
            'show_back' => 'yes', 'back_label' => __('Back', 'nevari-checkout'), 'back_url' => wc_get_page_permalink('shop'),
            'heading' => __('Order in Progress', 'nevari-checkout'), 'heading_tag' => 'h1', 'success_title' => __('Order is Placed', 'nevari-checkout'), 'show_status_label' => 'no',
            'show_timeline' => 'yes', 'items_heading' => __('Items Name', 'nevari-checkout'), 'quantity_heading' => __('No. of items', 'nevari-checkout'),
            'rows_per_page' => 3, 'show_pagination' => 'yes', 'summary_heading' => __('Order Summary', 'nevari-checkout'),
            'order_number_label' => __('Order Number', 'nevari-checkout'), 'delivery_label' => __('Delivery Fees', 'nevari-checkout'),
            'total_label' => __('Total', 'nevari-checkout'), 'address_heading' => __('Delivery Address', 'nevari-checkout'),
            'missing_message' => __('Order not found.', 'nevari-checkout'), 'unauthorized_message' => __('This order is not available.', 'nevari-checkout'),
            'auto_refresh' => 'yes', 'refresh_interval' => 30, 'animate_check' => 'yes',
        );
    }

    private function settings(array $defaults, $settings) {
        return array_merge($defaults, is_array($settings) ? $settings : array());
    }

    private function is_editor() {
        return class_exists('\\Elementor\\Plugin')
            && isset(\Elementor\Plugin::$instance->editor)
            && \Elementor\Plugin::$instance->editor->is_edit_mode();
    }

    private function heading_tag($tag) {
        return in_array($tag, array('h1', 'h2', 'h3', 'h4', 'div'), true) ? $tag : 'h1';
    }

    public function render_cart($settings = array(), $context = 'frontend', $widget_id = '') {
        $settings = $this->settings(self::cart_defaults(), $settings);
        $editor = $this->is_editor();
        $data = $editor ? $this->sample_cart_data() : $this->adapter->get_cart_view_data();
        $root_id = $widget_id ?: wp_unique_id('nevari-cart-');
        $tag = $this->heading_tag($settings['heading_tag']);
        $this->module->enqueue_assets(false);

        do_action('nevari_elementor_before_cart_render', $data, $settings);
        ob_start();
        ?>
        <section id="<?php echo esc_attr($root_id); ?>" class="nevari-commerce nevari-cart-widget<?php echo $editor ? ' is-editor-preview' : ''; ?>" data-nevari-widget="cart" data-update-mode="<?php echo esc_attr($settings['update_mode']); ?>" data-debounce="<?php echo esc_attr(max(100, min(2000, absint($settings['debounce'])))); ?>" aria-busy="false">
            <?php if ($editor) : ?><div class="nevari-preview-badge"><?php esc_html_e('Editor preview data', 'nevari-checkout'); ?></div><?php endif; ?>
            <header class="nevari-page-header">
                <?php if ('yes' === $settings['show_back']) : ?>
                    <a class="nevari-back-link" href="<?php echo esc_url($settings['back_url']); ?>"><?php echo $this->icon('chevron-left'); ?><span><?php echo esc_html($settings['back_label']); ?></span></a>
                <?php endif; ?>
                <<?php echo esc_html($tag); ?> class="nevari-page-title"><?php echo esc_html($settings['heading']); ?></<?php echo esc_html($tag); ?>>
            </header>
            <div class="nevari-live-message" data-nevari-message role="status" aria-live="polite"></div>
            <div class="nevari-empty-state" data-nevari-empty <?php echo empty($data['empty']) ? 'hidden' : ''; ?>>
                <h2><?php echo esc_html($settings['empty_heading']); ?></h2><p><?php echo esc_html($settings['empty_message']); ?></p>
                <a class="nevari-primary-link" href="<?php echo esc_url($settings['continue_url']); ?>"><?php echo esc_html($settings['continue_label']); ?></a>
            </div>
            <div class="nevari-cart-layout" data-nevari-content <?php echo !empty($data['empty']) ? 'hidden' : ''; ?>>
                <form class="nevari-cart-items" method="post" action="<?php echo esc_url(wc_get_cart_url()); ?>">
                    <?php foreach ($data['items'] as $item) : ?>
                        <article class="nevari-cart-row" data-cart-item-key="<?php echo esc_attr($item['key']); ?>">
                            <div class="nevari-product-main">
                                <?php if ('yes' === $settings['show_image']) : ?>
                                    <?php if ($item['url']) : ?><a class="nevari-product-image" href="<?php echo esc_url($item['url']); ?>"><?php endif; ?>
                                    <img src="<?php echo esc_url($item['image']); ?>" alt="<?php echo esc_attr($item['name']); ?>" loading="lazy" width="64" height="64">
                                    <?php if ($item['url']) : ?></a><?php endif; ?>
                                <?php endif; ?>
                                <div class="nevari-product-copy"><a class="nevari-product-name" href="<?php echo esc_url($item['url']); ?>"><?php echo esc_html($item['name']); ?></a>
                                    <div class="nevari-product-prices"><span class="nevari-price-current"><?php echo wp_kses_post($item['current_price']); ?></span><?php if ('yes' === $settings['show_regular_price'] && $item['regular_price']) : ?><del><?php echo wp_kses_post($item['regular_price']); ?></del><?php endif; ?></div>
                                </div>
                            </div>
                            <div class="nevari-cart-actions">
                                <?php if ('yes' === $settings['show_remove_icon']) : ?><button class="nevari-remove-icon" type="button" data-nevari-remove aria-label="<?php echo esc_attr(sprintf(__('Remove %s', 'nevari-checkout'), $item['name'])); ?>"><?php echo $this->icon('trash'); ?></button><?php endif; ?>
                                <div class="nevari-quantity" role="group" aria-label="<?php echo esc_attr(sprintf(__('Quantity for %s', 'nevari-checkout'), $item['name'])); ?>">
                                    <button type="button" class="nevari-qty-button nevari-qty-minus" data-nevari-quantity="decrease" aria-label="<?php esc_attr_e('Decrease quantity', 'nevari-checkout'); ?>" <?php disabled($item['quantity'] <= $item['minimum']); ?>><span aria-hidden="true"></span></button>
                                    <input class="nevari-qty-value" type="number" name="cart[<?php echo esc_attr($item['key']); ?>][qty]" value="<?php echo esc_attr($item['quantity']); ?>" min="<?php echo esc_attr($item['minimum']); ?>" max="<?php echo esc_attr($item['maximum']); ?>" inputmode="numeric" aria-label="<?php esc_attr_e('Quantity', 'nevari-checkout'); ?>">
                                    <button type="button" class="nevari-qty-button nevari-qty-plus" data-nevari-quantity="increase" aria-label="<?php esc_attr_e('Increase quantity', 'nevari-checkout'); ?>" <?php disabled($item['quantity'] >= $item['maximum']); ?>><span aria-hidden="true"></span></button>
                                </div>
                                <?php if ('yes' === $settings['show_remove_text']) : ?><button class="nevari-remove-text" type="button" data-nevari-remove><?php echo esc_html($settings['remove_label']); ?></button><?php endif; ?>
                                <noscript><a class="nevari-remove-text" href="<?php echo esc_url($item['remove_url']); ?>"><?php echo esc_html($settings['remove_label']); ?></a></noscript>
                            </div>
                        </article>
                    <?php endforeach; ?>
                    <?php wp_nonce_field('woocommerce-cart', 'woocommerce-cart-nonce'); ?>
                    <button class="nevari-manual-update" type="button" data-nevari-manual-update <?php echo 'manual' === $settings['update_mode'] ? '' : 'hidden'; ?>><?php esc_html_e('Update cart', 'nevari-checkout'); ?></button>
                    <noscript><button class="nevari-manual-update" type="submit" name="update_cart" value="1"><?php esc_html_e('Update cart', 'nevari-checkout'); ?></button></noscript>
                </form>
                <?php $this->render_cart_summary($data['snapshot'], $settings); ?>
            </div>
        </section>
        <?php
        $html = ob_get_clean();
        do_action('nevari_elementor_after_cart_render', $data, $settings);
        return $html;
    }

    private function render_cart_summary($snapshot, $settings) {
        ?>
        <aside class="nevari-cart-summary<?php echo 'yes' === $settings['sticky_summary'] ? ' is-sticky' : ''; ?>" style="--nevari-sticky-offset:<?php echo esc_attr(absint($settings['sticky_offset'])); ?>px">
            <?php if ('yes' === $settings['show_progress']) : ?><div class="nevari-delivery-progress"><div class="nevari-progress-track"><span data-nevari-progress-fill style="width:<?php echo esc_attr($snapshot['progress']); ?>%"></span></div><p data-nevari-progress-message><?php echo esc_html($snapshot['progressMessage']); ?></p></div><?php endif; ?>
            <h2><?php echo esc_html($settings['summary_heading']); ?></h2>
            <dl class="nevari-summary-list"><div><dt><?php echo esc_html($settings['items_total_label']); ?></dt><dd data-nevari-items-total><?php echo wp_kses_post($snapshot['itemsTotalHtml']); ?></dd></div><div><dt><?php echo esc_html($settings['delivery_label']); ?></dt><dd data-nevari-shipping><?php echo wp_kses_post($snapshot['shippingHtml']); ?></dd></div></dl>
            <div class="nevari-summary-total"><span><?php echo esc_html($settings['subtotal_label']); ?></span><strong data-nevari-total><?php echo wp_kses_post($snapshot['totalHtml']); ?></strong></div>
            <a class="nevari-checkout-button" href="<?php echo esc_url($settings['checkout_url']); ?>"><span><?php echo $this->icon('card'); ?><?php echo esc_html($settings['checkout_label']); ?></span><strong data-nevari-button-total><?php echo wp_kses_post($snapshot['totalHtml']); ?></strong></a>
        </aside>
        <?php
    }

    public function render_checkout($settings = array(), $context = 'frontend', $widget_id = '') {
        $settings = $this->settings(self::checkout_defaults(), $settings);
        $editor = $this->is_editor();
        $data = $editor ? $this->sample_checkout_data() : $this->adapter->get_checkout_view_data();
        $root_id = $widget_id ?: wp_unique_id('nevari-checkout-');
        $tag = $this->heading_tag($settings['heading_tag']);
        $this->module->enqueue_assets(true);

        if (!$editor && (!empty($data['cart']['empty']) || empty($data['cart']['available']))) {
            return '<div class="nevari-commerce nevari-state-card"><p>' . esc_html__('Your cart is currently empty.', 'nevari-checkout') . '</p><a href="' . esc_url(wc_get_page_permalink('shop')) . '">' . esc_html__('Continue shopping', 'nevari-checkout') . '</a></div>';
        }

        $tip_options = $this->build_tip_options($settings);
        $tips = wp_list_pluck($tip_options, 'amount');
        $tip_config = wp_json_encode(array('values' => $tips, 'min' => (float) $settings['custom_tip_min'], 'max' => (float) $settings['custom_tip_max']));
        $tip_signature = hash_hmac('sha256', $tip_config, wp_salt('auth'));
        $open = $editor ? '<div' : '<form name="checkout" method="post" action="' . esc_url(wc_get_checkout_url()) . '" enctype="multipart/form-data"';
        do_action('nevari_elementor_before_checkout_render', $data, $settings);
        ob_start();
        ?>
        <?php echo $open; ?> id="<?php echo esc_attr($root_id); ?>" class="nevari-commerce nevari-checkout-widget<?php echo $editor ? ' is-editor-preview' : ' checkout woocommerce-checkout'; ?>" data-nevari-widget="checkout" aria-busy="false">
            <?php if ($editor) : ?><div class="nevari-preview-badge"><?php esc_html_e('Editor preview data', 'nevari-checkout'); ?></div><?php else : ?><?php wp_nonce_field('woocommerce-process_checkout', 'woocommerce-process-checkout-nonce'); ?><?php endif; ?>
            <header class="nevari-page-header"><?php if ('yes' === $settings['show_back']) : ?><a class="nevari-back-link" href="<?php echo esc_url($settings['back_url']); ?>"><?php echo $this->icon('chevron-left'); ?><span><?php echo esc_html($settings['back_label']); ?></span></a><?php endif; ?><<?php echo esc_html($tag); ?> class="nevari-page-title"><?php echo esc_html($settings['heading']); ?></<?php echo esc_html($tag); ?>></header>
            <div class="nevari-live-message" data-nevari-message role="status" aria-live="polite"></div>
            <div class="nevari-checkout-layout">
                <div class="nevari-checkout-main">
                    <section class="nevari-checkout-card"><header><h2><?php echo esc_html($settings['delivery_heading']); ?> <?php echo $this->icon('info'); ?></h2></header><div class="nevari-delivery-fields">
                        <label><span><?php echo esc_html($settings['full_name_label']); ?></span><input type="text" name="nevari_full_name" value="<?php echo esc_attr($data['customer']['full_name']); ?>" placeholder="<?php echo esc_attr($settings['full_name_placeholder']); ?>" minlength="2" maxlength="150" autocomplete="name" required></label>
                        <label><span><?php echo esc_html($settings['email_label']); ?></span><input type="email" name="billing_email" value="<?php echo esc_attr($data['customer']['email']); ?>" placeholder="<?php echo esc_attr($settings['email_placeholder']); ?>" maxlength="254" autocomplete="email" required></label>
                        <label class="nevari-address-field"><span><?php echo esc_html($settings['address_label']); ?></span><input type="text" name="nevari_delivery_address" value="<?php echo esc_attr($data['customer']['address']); ?>" placeholder="<?php echo esc_attr($settings['address_placeholder']); ?>" minlength="5" maxlength="255" autocomplete="street-address" required></label>
                    </div></section>
                    <section class="nevari-checkout-card"><header><h2><?php echo esc_html($settings['payment_heading']); ?> <?php echo $this->icon('info'); ?></h2></header><div class="nevari-payment-grid" role="radiogroup" aria-label="<?php echo esc_attr($settings['payment_heading']); ?>">
                        <?php foreach ($data['gateways'] as $index => $gateway) : $chosen = !empty($gateway['chosen']) || (0 === $index && !array_filter(wp_list_pluck($data['gateways'], 'chosen'))); ?>
                            <label class="nevari-payment-option"><input type="radio" name="payment_method" value="<?php echo esc_attr($gateway['id']); ?>" <?php checked($chosen); ?>><span class="nevari-payment-card"><span class="nevari-payment-check"><?php echo $this->icon('check'); ?></span><span class="nevari-payment-logo"><?php echo $this->gateway_icon($gateway); ?></span><span><strong><?php echo esc_html($gateway['title']); ?></strong><?php if ($gateway['description']) : ?><small><?php echo esc_html(wp_trim_words($gateway['description'], 7)); ?></small><?php endif; ?></span></span></label>
                        <?php endforeach; ?>
                        <?php if (empty($data['gateways'])) : ?><p class="nevari-inline-error"><?php esc_html_e('No fieldless payment methods are currently available.', 'nevari-checkout'); ?></p><?php endif; ?>
                    </div></section>
                    <section class="nevari-checkout-card"><header><h2><?php echo esc_html($settings['review_heading']); ?> <?php echo $this->icon('info'); ?></h2></header><a class="nevari-review-strip" href="<?php echo esc_url(wc_get_cart_url()); ?>" aria-label="<?php esc_attr_e('Review cart items', 'nevari-checkout'); ?>"><span class="nevari-review-images">
                        <?php $max = max(1, min(12, absint($settings['max_thumbnails']))); foreach (array_slice($data['cart']['items'], 0, $max) as $item) : ?><img src="<?php echo esc_url($item['image']); ?>" alt="<?php echo esc_attr($item['name']); ?>" width="64" height="64"><?php endforeach; ?>
                        <?php if (count($data['cart']['items']) > $max) : ?><span class="nevari-review-more">+<?php echo esc_html(count($data['cart']['items']) - $max); ?></span><?php endif; ?></span><?php echo $this->icon('chevron-right'); ?></a></section>
                </div>
                <?php $this->render_checkout_summary($data['cart']['snapshot'], $settings, $tip_options); ?>
            </div>
            <?php if (!$editor) : ?>
                <input type="hidden" name="billing_first_name" value=""><input type="hidden" name="billing_last_name" value="">
                <input type="hidden" name="billing_country" value="<?php echo esc_attr(WC()->countries->get_base_country()); ?>"><input type="hidden" name="billing_state" value="<?php echo esc_attr(WC()->countries->get_base_state()); ?>"><input type="hidden" name="billing_city" value="<?php echo esc_attr(WC()->countries->get_base_city()); ?>"><input type="hidden" name="billing_postcode" value="<?php echo esc_attr(WC()->countries->get_base_postcode()); ?>">
                <input type="hidden" name="nevari_tip_config" value="<?php echo esc_attr(base64_encode($tip_config)); ?>"><input type="hidden" name="nevari_tip_signature" value="<?php echo esc_attr($tip_signature); ?>"><input type="hidden" name="nevari_selected_tip" value="0"><input type="hidden" name="nevari_selected_tip_label" value="">
                <input type="hidden" name="nevari_success_page_id" value="<?php echo esc_attr(absint($settings['success_page_id'])); ?>"><input type="hidden" name="nevari_checkout_token" value="<?php echo esc_attr($this->checkout_token()); ?>">
            <?php endif; ?>
        <?php echo $editor ? '</div>' : '</form>'; ?>
        <?php
        $html = ob_get_clean();
        do_action('nevari_elementor_after_checkout_render', $data, $settings);
        return $html;
    }

    private function render_checkout_summary($snapshot, $settings, $tip_options) {
        ?>
        <aside class="nevari-checkout-summary<?php echo 'yes' === $settings['sticky_summary'] ? ' is-sticky' : ''; ?>" style="--nevari-sticky-offset:<?php echo esc_attr(absint($settings['sticky_offset'])); ?>px">
            <h2><?php echo esc_html($settings['summary_heading']); ?></h2><dl class="nevari-summary-list"><div><dt><?php echo esc_html($settings['delivery_label']); ?></dt><dd data-nevari-shipping><?php echo wp_kses_post($snapshot['shippingHtml']); ?></dd></div><div><dt><?php echo esc_html($settings['service_fee_label']); ?></dt><dd data-nevari-service-fee><?php echo wp_kses_post($snapshot['serviceFeeHtml']); ?></dd></div><div><dt><?php echo esc_html($settings['items_total_label']); ?></dt><dd data-nevari-items-total><?php echo wp_kses_post($snapshot['itemsTotalHtml']); ?></dd></div><div data-nevari-discount-row <?php echo empty($snapshot['appliedCoupons']) ? 'hidden' : ''; ?>><dt><?php echo esc_html($settings['discount_label']); ?></dt><dd data-nevari-discount><?php echo wp_kses_post($snapshot['discountHtml']); ?></dd></div><div><dt><?php echo esc_html($settings['tax_label']); ?></dt><dd data-nevari-tax><?php echo wp_kses_post($snapshot['taxHtml']); ?></dd></div></dl>
            <?php if ('yes' === $settings['show_tip']) : ?><section class="nevari-tip-section"><h3><?php echo esc_html($settings['tip_heading']); ?></h3><p><?php echo esc_html($settings['tip_helper']); ?></p><div class="nevari-tip-options"><?php foreach ($tip_options as $tip) : ?><button type="button" data-nevari-tip="<?php echo esc_attr($tip['amount']); ?>"><?php echo wp_kses_post($tip['label']); ?></button><?php endforeach; ?><button type="button" data-nevari-tip="other"><?php echo esc_html($settings['other_tip_label']); ?></button></div><label class="nevari-custom-tip" hidden><span class="screen-reader-text"><?php echo esc_html($settings['other_tip_label']); ?></span><input type="number" min="<?php echo esc_attr($settings['custom_tip_min']); ?>" max="<?php echo esc_attr($settings['custom_tip_max']); ?>" step="0.01" data-nevari-custom-tip></label></section><?php endif; ?>
            <?php if ('yes' === $settings['show_coupon']) : ?><section class="nevari-coupon-section"><div><h3><?php echo esc_html($settings['coupon_heading']); ?></h3><button type="button" data-nevari-coupon-toggle aria-expanded="false"><?php echo $this->icon('plus'); ?><?php echo esc_html($settings['coupon_trigger']); ?></button></div><div class="nevari-coupon-panel" hidden><label><span class="screen-reader-text"><?php echo esc_html($settings['coupon_placeholder']); ?></span><input type="text" maxlength="50" placeholder="<?php echo esc_attr($settings['coupon_placeholder']); ?>" data-nevari-coupon-code></label><button type="button" data-nevari-coupon-apply><?php echo esc_html($settings['coupon_apply']); ?></button><div data-nevari-coupon-list data-remove-label="<?php echo esc_attr($settings['coupon_remove']); ?>"></div></div></section><?php endif; ?>
            <div class="nevari-checkout-total"><span><?php echo esc_html($settings['total_label']); ?></span><strong data-nevari-total><?php echo wp_kses_post($snapshot['totalHtml']); ?></strong></div><p class="nevari-terms-copy"><?php echo wp_kses_post($settings['terms_text']); ?></p>
            <?php if (function_exists('wc_terms_and_conditions_checkbox_enabled') && wc_terms_and_conditions_checkbox_enabled()) : ?><label class="nevari-terms-checkbox"><input type="checkbox" name="terms" value="1" required><span><?php esc_html_e('I have read and agree to the terms and conditions', 'nevari-checkout'); ?></span></label><input type="hidden" name="terms-field" value="1"><?php endif; ?>
            <button type="submit" class="nevari-place-order" name="woocommerce_checkout_place_order" id="place_order" value="<?php echo esc_attr($settings['place_order_label']); ?>" data-value="<?php echo esc_attr($settings['place_order_label']); ?>" data-loading-label="<?php echo esc_attr($settings['loading_label']); ?>" <?php disabled(empty($snapshot) || false); ?>><?php echo esc_html($settings['place_order_label']); ?></button>
        </aside>
        <?php
    }

    public function render_order_progress($settings = array(), $context = 'frontend', $widget_id = '') {
        $settings = $this->settings(self::order_defaults(), $settings);
        $editor = $this->is_editor();
        $order = $editor ? null : $this->adapter->resolve_order_from_request();
        if (!$editor && is_wp_error($order)) {
            $message = 'nevari_order_forbidden' === $order->get_error_code() ? $settings['unauthorized_message'] : $settings['missing_message'];
            return '<section class="nevari-commerce nevari-state-card" role="alert"><p>' . esc_html($message) . '</p></section>';
        }

        $data = $editor ? $this->sample_order_data() : $this->adapter->get_order_view_data($order);
        $root_id = $widget_id ?: wp_unique_id('nevari-order-');
        $tag = $this->heading_tag($settings['heading_tag']);
        $page = isset($_GET['nevari_items_page']) ? max(1, absint(wp_unslash($_GET['nevari_items_page']))) : 1;
        $per_page = max(1, min(24, absint($settings['rows_per_page'])));
        $pages = max(1, (int) ceil(count($data['items']) / $per_page));
        $page = min($page, $pages);
        $visible_items = array_slice($data['items'], ($page - 1) * $per_page, $per_page);
        $poll_token = $editor ? '' : $this->adapter->create_order_poll_token($order);
        $this->module->enqueue_assets(false);

        do_action('nevari_elementor_before_order_progress_render', $data, $settings);
        ob_start();
        ?>
        <section id="<?php echo esc_attr($root_id); ?>" class="nevari-commerce nevari-order-widget stage-<?php echo esc_attr($data['stage']); ?><?php echo $editor ? ' is-editor-preview' : ''; ?>" data-nevari-widget="order-progress" data-order-id="<?php echo esc_attr($data['id']); ?>" data-poll-token="<?php echo esc_attr($poll_token); ?>" data-auto-refresh="<?php echo esc_attr($settings['auto_refresh']); ?>" data-refresh-interval="<?php echo esc_attr(max(15, min(300, absint($settings['refresh_interval'])))); ?>" data-final="<?php echo $data['final'] ? 'yes' : 'no'; ?>" aria-busy="false">
            <?php if ($editor) : ?><div class="nevari-preview-badge"><?php esc_html_e('Editor preview data', 'nevari-checkout'); ?></div><?php endif; ?>
            <header class="nevari-page-header"><?php if ('yes' === $settings['show_back']) : ?><a class="nevari-back-link" href="<?php echo esc_url($settings['back_url']); ?>"><?php echo $this->icon('chevron-left'); ?><span><?php echo esc_html($settings['back_label']); ?></span></a><?php endif; ?><<?php echo esc_html($tag); ?> class="nevari-page-title"><?php echo esc_html($settings['heading']); ?></<?php echo esc_html($tag); ?>></header>
            <div class="nevari-live-message" data-nevari-message role="status" aria-live="polite"></div><div class="nevari-order-layout"><main class="nevari-order-main"><div class="nevari-confirmation"><div class="nevari-success-icon<?php echo 'yes' === $settings['animate_check'] ? ' is-animated' : ''; ?>"><span><?php echo $this->icon('large-check'); ?></span></div><p><?php echo esc_html($settings['success_title']); ?></p><strong data-nevari-status-label><?php echo esc_html($data['status_label']); ?></strong></div>
                <?php if ('yes' === $settings['show_timeline']) : ?><ol class="nevari-timeline" data-nevari-timeline><?php foreach ($data['milestones'] as $milestone) : $state = $this->milestone_state($milestone['key'], $data['stage']); ?><li class="is-<?php echo esc_attr($state); ?>" data-stage="<?php echo esc_attr($milestone['key']); ?>"><span class="nevari-timeline-bar"></span><div><span class="nevari-timeline-dot"><?php if ('complete' === $state) : echo $this->icon('check'); endif; ?></span><span><?php echo esc_html($milestone['label']); ?></span><?php if (!empty($milestone['date']) && is_object($milestone['date'])) : ?><time><?php echo esc_html($milestone['date']->date_i18n(get_option('date_format') . ', ' . get_option('time_format'))); ?></time><?php endif; ?></div></li><?php endforeach; ?></ol><?php endif; ?>
                <section class="nevari-order-items"><header><span><?php echo esc_html($settings['items_heading']); ?></span><span><?php echo esc_html($settings['quantity_heading']); ?></span></header><?php foreach ($visible_items as $item) : ?><article><div class="nevari-product-main"><img class="nevari-product-image" src="<?php echo esc_url($item['image']); ?>" alt="<?php echo esc_attr($item['name']); ?>" width="64" height="64"><div class="nevari-product-copy"><span class="nevari-product-name"><?php echo esc_html($item['name']); ?></span><div class="nevari-product-prices"><span class="nevari-price-current"><?php echo wp_kses_post($item['current_price']); ?></span><?php if ($item['regular_price']) : ?><del><?php echo wp_kses_post($item['regular_price']); ?></del><?php endif; ?></div></div></div><strong class="nevari-item-count"><?php echo esc_html($item['quantity']); ?></strong></article><?php endforeach; ?>
                    <?php if ('yes' === $settings['show_pagination'] && $pages > 1) : ?><nav class="nevari-pagination" aria-label="<?php esc_attr_e('Order items pages', 'nevari-checkout'); ?>"><?php for ($i = 1; $i <= $pages; $i++) : ?><a href="<?php echo esc_url(add_query_arg('nevari_items_page', $i)); ?>" <?php echo $i === $page ? 'aria-current="page"' : ''; ?>><?php echo esc_html($i); ?></a><?php endfor; ?></nav><?php endif; ?>
                </section></main><aside class="nevari-order-sidebar"><section><h2><?php echo esc_html($settings['summary_heading']); ?></h2><div class="nevari-order-number"><span><?php echo esc_html($settings['order_number_label']); ?></span><strong>#<?php echo esc_html($data['number']); ?></strong></div><dl><div><dt><?php echo esc_html($settings['delivery_label']); ?></dt><dd><?php echo wp_kses_post($data['shipping_html']); ?></dd></div><div class="nevari-sidebar-total"><dt><?php echo esc_html($settings['total_label']); ?></dt><dd><?php echo wp_kses_post($data['total_html']); ?></dd></div></dl></section><section><h2><?php echo esc_html($data['payment_heading']); ?></h2><p class="nevari-sidebar-link"><?php echo $this->icon('card'); ?><span><?php echo esc_html($data['payment_title']); ?></span></p></section><section><h2><?php echo esc_html($settings['address_heading']); ?></h2><p class="nevari-sidebar-link"><?php echo $this->icon('location'); ?><span><?php echo esc_html($data['address'] ?: __('Address unavailable', 'nevari-checkout')); ?></span></p></section></aside></div>
        </section>
        <?php
        $html = ob_get_clean();
        do_action('nevari_elementor_after_order_progress_render', $data, $settings);
        return $html;
    }

    private function milestone_state($key, $stage) {
        $order = array('placed' => 1, 'processing' => 2, 'completed' => 3);
        if ('exception' === $stage) {
            return 'upcoming';
        }
        $current = isset($order[$stage]) ? $order[$stage] : 1;
        $target = isset($order[$key]) ? $order[$key] : 99;
        return $target < $current ? 'complete' : ($target === $current ? 'active' : 'upcoming');
    }

    private function build_tip_options($settings) {
        $source = in_array($settings['tip_source'], array('fixed', 'percentage', 'plugin'), true) ? $settings['tip_source'] : 'fixed';
        $raw = $settings['tip_values'];
        if ('plugin' === $source && method_exists($this->core, 'get_tip_settings')) {
            $plugin_settings = $this->core->get_tip_settings();
            $raw = isset($plugin_settings['tip_list']) ? $plugin_settings['tip_list'] : $raw;
        }
        $subtotal = function_exists('WC') && WC()->cart ? (float) WC()->cart->get_cart_contents_total() : 100;
        $options = array();
        foreach ($this->parse_tip_values($raw) as $value) {
            $amount = 'percentage' === $source ? round($subtotal * min(100, $value) / 100, wc_get_price_decimals()) : $value;
            $options[] = array(
                'amount' => max(0, min(100000, $amount)),
                'label'  => 'percentage' === $source ? wc_format_decimal($value) . '%' : wc_price($amount),
            );
        }
        $options = apply_filters('nevari_elementor_tip_options', $options, $source, $settings);

        return array_slice(is_array($options) ? $options : array(), 0, 8);
    }

    private function parse_tip_values($value) {
        $values = array();
        foreach (preg_split('/[\s,]+/', (string) $value) as $amount) {
            if (is_numeric($amount) && (float) $amount >= 0) {
                $values[] = min(500, (float) $amount);
            }
        }
        return array_slice(array_values(array_unique($values)), 0, 8);
    }

    private function checkout_token() {
        if (!function_exists('WC') || !WC()->session) {
            return '';
        }
        $token = WC()->session->get('nevari_checkout_token');
        if (!$token) {
            $token = wp_generate_uuid4();
            WC()->session->set('nevari_checkout_token', $token);
        }
        return $token;
    }

    private function gateway_icon($gateway) {
        $name = strtolower($gateway['id'] . ' ' . $gateway['title']);
        if (false !== strpos($name, 'paystack')) {
            return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 10h11M5 14h8M5 18h5"/></svg>';
        }
        if (false !== strpos($name, 'flutter') || false !== strpos($name, 'rave')) {
            return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 14c3-6 7-9 13-9-2 2-3 4-3 6 2-1 4-1 6 0-2 5-6 8-12 9 1-2 1-4 1-5-2 1-3 1-5-1Z"/></svg>';
        }
        if (false !== strpos($name, 'delivery') || 'cod' === $gateway['id']) {
            return $this->icon('truck');
        }
        if (!empty($gateway['icon'])) {
            return wp_kses($gateway['icon'], array('img' => array('src' => true, 'alt' => true, 'class' => true, 'width' => true, 'height' => true)));
        }
        return $this->icon('card');
    }

    private function icon($name) {
        $icons = array(
            'chevron-left' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
            'chevron-right' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
            'trash' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>',
            'card' => '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>',
            'truck' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v11H3zM14 10h4l3 4v3h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
            'location' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Z"/><circle cx="12" cy="9" r="2"/></svg>',
            'info' => '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/></svg>',
            'check' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
            'large-check' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>',
            'plus' => '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
        );
        return isset($icons[$name]) ? $icons[$name] : '';
    }

    private function sample_cart_data() {
        $image = wc_placeholder_img_src('woocommerce_thumbnail');
        $items = array();
        for ($i = 1; $i <= 4; $i++) {
            $items[] = array('key' => 'sample-' . $i, 'name' => __('Total Care Men Face Serum', 'nevari-checkout'), 'url' => '#', 'image' => $image, 'quantity' => 1, 'minimum' => 1, 'maximum' => 10, 'current_price' => wc_price(99.99), 'regular_price' => wc_price(60), 'remove_url' => '#');
        }
        return array('available' => true, 'empty' => false, 'items' => $items, 'snapshot' => array('progress' => 54, 'progressMessage' => __('Free delivery + saving on this order', 'nevari-checkout'), 'itemsTotalHtml' => wc_price(128.78), 'shippingHtml' => wc_price(5.78), 'serviceFeeHtml' => wc_price(0), 'discountHtml' => wc_price(0), 'taxHtml' => wc_price(0), 'tipHtml' => wc_price(0), 'subtotalHtml' => wc_price(134.56), 'totalHtml' => wc_price(134.56), 'appliedCoupons' => array()));
    }

    private function sample_checkout_data() {
        $cart = $this->sample_cart_data();
        return array('cart' => $cart, 'customer' => array('full_name' => '', 'email' => '', 'address' => ''), 'gateways' => array(array('id' => 'paystack', 'title' => 'Paystack', 'description' => 'Card or bank', 'icon' => '', 'chosen' => true), array('id' => 'flutterwave', 'title' => 'Flutterwave', 'description' => 'Secure checkout', 'icon' => '', 'chosen' => false), array('id' => 'cod', 'title' => 'Pay on Delivery', 'description' => 'Cash on arrival', 'icon' => '', 'chosen' => false)));
    }

    private function sample_order_data() {
        $cart = $this->sample_cart_data();
        return array('id' => 123321, 'number' => '123-321', 'status' => 'processing', 'status_label' => __('Processing', 'nevari-checkout'), 'stage' => 'placed', 'final' => false, 'items' => array_slice($cart['items'], 0, 3), 'milestones' => array(array('key' => 'placed', 'label' => __('Order Placed', 'nevari-checkout'), 'date' => current_datetime()), array('key' => 'processing', 'label' => __('Processing', 'nevari-checkout'), 'date' => null), array('key' => 'completed', 'label' => __('Completed', 'nevari-checkout'), 'date' => null)), 'shipping_html' => wc_price(5.78), 'total_html' => wc_price(134.56), 'payment_heading' => __('Paid With', 'nevari-checkout'), 'payment_title' => 'MasterCard', 'address' => __('Shopping in 07114', 'nevari-checkout'));
    }
}
