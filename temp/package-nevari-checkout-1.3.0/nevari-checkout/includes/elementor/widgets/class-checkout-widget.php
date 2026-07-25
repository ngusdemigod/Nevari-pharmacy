<?php
namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

final class Checkout_Widget extends Commerce_Widget_Base {
    public function get_name() { return 'nevari-checkout'; }
    public function get_title() { return __('Nevari Checkout', 'nevari-checkout'); }
    public function get_icon() { return 'eicon-checkout'; }

    protected function register_controls() {
        $d = Commerce_Renderer::checkout_defaults();
        $this->start_controls_section('content_general', array('label' => __('General', 'nevari-checkout')));
        $this->add_heading_controls($d);
        $this->add_control('sticky_summary', array('label' => __('Sticky Summary', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER));
        $this->add_control('sticky_offset', array('label' => __('Sticky Offset', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 24, 'condition' => array('sticky_summary' => 'yes')));
        $this->end_controls_section();

        $this->start_controls_section('content_delivery', array('label' => __('Delivery Information', 'nevari-checkout')));
        foreach (array('delivery_heading', 'full_name_label', 'full_name_placeholder', 'email_label', 'email_placeholder', 'address_label', 'address_placeholder') as $key) {
            $this->add_control($key, array('label' => ucwords(str_replace('_', ' ', $key)), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d[$key]));
        }
        $this->end_controls_section();

        $this->start_controls_section('content_payment', array('label' => __('Payment & Review', 'nevari-checkout')));
        $this->add_control('payment_heading', array('label' => __('Payment Heading', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['payment_heading']));
        $this->add_control('review_heading', array('label' => __('Review Heading', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['review_heading']));
        $this->add_control('max_thumbnails', array('label' => __('Visible Thumbnails', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 6, 'min' => 1, 'max' => 12));
        $this->end_controls_section();

        $this->start_controls_section('content_tip', array('label' => __('Delivery Tip', 'nevari-checkout')));
        $this->add_control('show_tip', array('label' => __('Show Delivery Tip', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        $this->add_control('tip_source', array('label' => __('Tip Source', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SELECT, 'default' => 'fixed', 'options' => array('fixed' => __('Fixed amounts', 'nevari-checkout'), 'percentage' => __('Cart percentage', 'nevari-checkout'), 'plugin' => __('Plugin-defined', 'nevari-checkout')), 'condition' => array('show_tip' => 'yes')));
        foreach (array('tip_heading', 'tip_helper', 'tip_values', 'other_tip_label') as $key) {
            $this->add_control($key, array('label' => ucwords(str_replace('_', ' ', $key)), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d[$key]));
        }
        $this->add_control('custom_tip_min', array('label' => __('Custom Minimum', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 0, 'min' => 0));
        $this->add_control('custom_tip_max', array('label' => __('Custom Maximum', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 500, 'min' => 0));
        $this->end_controls_section();

        $this->start_controls_section('content_coupon_summary', array('label' => __('Coupon, Summary & Action', 'nevari-checkout')));
        $this->add_control('show_coupon', array('label' => __('Show Coupon', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        $this->add_control('coupon_remove', array('label' => __('Remove Coupon Label', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['coupon_remove'], 'condition' => array('show_coupon' => 'yes')));
        foreach (array('coupon_heading', 'coupon_trigger', 'coupon_placeholder', 'coupon_apply', 'summary_heading', 'items_total_label', 'delivery_label', 'service_fee_label', 'discount_label', 'tax_label', 'total_label', 'terms_text', 'place_order_label', 'loading_label') as $key) {
            $type = 'terms_text' === $key ? \Elementor\Controls_Manager::TEXTAREA : \Elementor\Controls_Manager::TEXT;
            $this->add_control($key, array('label' => ucwords(str_replace('_', ' ', $key)), 'type' => $type, 'default' => $d[$key]));
        }
        $this->add_control('success_page_id', array('label' => __('Order Progress Page', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 0, 'min' => 0, 'description' => __('Published same-site page ID only. Zero uses the WooCommerce order-received page.', 'nevari-checkout')));
        $this->end_controls_section();

        $this->add_shared_style_controls(1332, array('top' => 28, 'right' => 0, 'bottom' => 40, 'left' => 0), 2.17, 60);
        $this->start_controls_section('style_cards', array('label' => __('Section Cards & Fields', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('card_gap', array('label' => __('Card Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 70)), 'default' => array('size' => 22), 'selectors' => array('{{WRAPPER}} .nevari-checkout-main' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_control('card_background', array('label' => __('Card Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-checkout-card' => 'background-color:{{VALUE}};')));
        $this->add_control('card_border_color', array('label' => __('Card Border Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-checkout-card' => 'border-color:{{VALUE}};')));
        $this->add_responsive_control('card_border_width', array('label' => __('Card Border Width', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 6)), 'default' => array('size' => 1), 'selectors' => array('{{WRAPPER}} .nevari-checkout-card' => 'border-width:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('card_radius', array('label' => __('Card Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 40)), 'default' => array('size' => 14), 'selectors' => array('{{WRAPPER}} .nevari-checkout-card' => 'border-radius:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('card_padding', array('label' => __('Card Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-checkout-card' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Box_Shadow::get_type(), array('name' => 'card_shadow', 'selector' => '{{WRAPPER}} .nevari-checkout-card'));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'card_heading_typography', 'selector' => '{{WRAPPER}} .nevari-checkout-card > header h2'));
        $this->add_control('card_heading_color', array('label' => __('Card Heading Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-checkout-card > header h2' => 'color:{{VALUE}};')));
        $this->add_responsive_control('card_heading_gap', array('label' => __('Heading Bottom Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 80)), 'default' => array('size' => 26), 'selectors' => array('{{WRAPPER}} .nevari-checkout-card > header h2' => 'margin-bottom:{{SIZE}}{{UNIT}};')));
        $this->add_control('card_icon_color', array('label' => __('Info Icon Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-checkout-card > header h2 svg' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'field_label_typography', 'selector' => '{{WRAPPER}} .nevari-delivery-fields label > span'));
        $this->add_control('field_label_color', array('label' => __('Field Label Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields label > span' => 'color:{{VALUE}};')));
        $this->add_responsive_control('field_gap', array('label' => __('Field Grid Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 50)), 'default' => array('size' => 18), 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'field_typography', 'selector' => '{{WRAPPER}} .nevari-delivery-fields input'));
        $this->add_control('field_text_color', array('label' => __('Field Text Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input' => 'color:{{VALUE}};')));
        $this->add_control('field_placeholder_color', array('label' => __('Placeholder Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#A6ABB3', 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input::placeholder' => 'color:{{VALUE}};opacity:1;')));
        $this->add_control('field_bg', array('label' => __('Field Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#F5F4F9', 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input' => 'background:{{VALUE}};')));
        $this->add_control('field_border_color', array('label' => __('Field Border Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => 'transparent', 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input' => 'border-color:{{VALUE}};')));
        $this->add_responsive_control('field_height', array('label' => __('Field Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 44, 'max' => 90)), 'default' => array('size' => 50), 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('field_radius', array('label' => __('Field Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('field_padding', array('label' => __('Field Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_control('field_focus', array('label' => __('Field Focus Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#16A8E5', 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input:focus-visible' => 'border-color:{{VALUE}};box-shadow:0 0 0 3px color-mix(in srgb, {{VALUE}} 18%, transparent);')));
        $this->end_controls_section();
        $this->start_controls_section('style_payments', array('label' => __('Payment Grid', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('payment_columns', array('label' => __('Columns', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'desktop_default' => 3, 'tablet_default' => 2, 'mobile_default' => 1, 'min' => 1, 'max' => 3, 'selectors' => array('{{WRAPPER}} .nevari-payment-grid' => 'grid-template-columns:repeat({{VALUE}},minmax(0,1fr));')));
        $this->add_responsive_control('payment_gap', array('label' => __('Grid Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'default' => array('size' => 12), 'selectors' => array('{{WRAPPER}} .nevari-payment-grid' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('payment_min_height', array('label' => __('Card Minimum Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 60, 'max' => 150)), 'default' => array('size' => 86), 'selectors' => array('{{WRAPPER}} .nevari-payment-card' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('payment_padding', array('label' => __('Card Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-payment-card' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_control('payment_background', array('label' => __('Card Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FAFAFD', 'selectors' => array('{{WRAPPER}} .nevari-payment-card' => 'background-color:{{VALUE}};')));
        $this->add_control('payment_border', array('label' => __('Card Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-payment-card' => 'border-color:{{VALUE}};')));
        $this->add_responsive_control('payment_radius', array('label' => __('Card Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-payment-card' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_control('payment_hover_background', array('label' => __('Hover Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#F4FBFE', 'selectors' => array('{{WRAPPER}} .nevari-payment-option:hover .nevari-payment-card' => 'background-color:{{VALUE}};')));
        $this->add_control('payment_selected', array('label' => __('Selected Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#16A8E5', 'selectors' => array('{{WRAPPER}} .nevari-payment-option input:checked + .nevari-payment-card' => 'border-color:{{VALUE}};')));
        $this->add_control('payment_selected_bg', array('label' => __('Selected Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#F4FBFE', 'selectors' => array('{{WRAPPER}} .nevari-payment-option input:checked + .nevari-payment-card' => 'background-color:{{VALUE}};')));
        $this->add_responsive_control('payment_logo_size', array('label' => __('Logo Box Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 24, 'max' => 80)), 'default' => array('size' => 42), 'selectors' => array('{{WRAPPER}} .nevari-payment-logo' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};flex-basis:{{SIZE}}{{UNIT}};')));
        $this->add_control('payment_logo_bg', array('label' => __('Logo Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-payment-logo' => 'background-color:{{VALUE}};')));
        $this->add_control('payment_check_bg', array('label' => __('Selected Check Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#09A6E7', 'selectors' => array('{{WRAPPER}} .nevari-payment-check' => 'background-color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'payment_title_typography', 'selector' => '{{WRAPPER}} .nevari-payment-card strong'));
        $this->add_control('payment_title_color', array('label' => __('Payment Title Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-payment-card strong' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'payment_description_typography', 'selector' => '{{WRAPPER}} .nevari-payment-card small'));
        $this->add_control('payment_description_color', array('label' => __('Description Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-payment-card small' => 'color:{{VALUE}};')));
        $this->end_controls_section();

        $this->start_controls_section('style_review', array('label' => __('Review Order Strip', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_control('review_background', array('label' => __('Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#F5F4F9', 'selectors' => array('{{WRAPPER}} .nevari-review-strip' => 'background-color:{{VALUE}};')));
        $this->add_responsive_control('review_min_height', array('label' => __('Minimum Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 60, 'max' => 150)), 'default' => array('size' => 94), 'selectors' => array('{{WRAPPER}} .nevari-review-strip' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('review_padding', array('label' => __('Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-review-strip' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('review_radius', array('label' => __('Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-review-strip' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('review_image_size', array('label' => __('Thumbnail Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 32, 'max' => 100)), 'default' => array('size' => 64), 'selectors' => array('{{WRAPPER}} .nevari-review-images img, {{WRAPPER}} .nevari-review-more' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};flex-basis:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('review_image_radius', array('label' => __('Thumbnail Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-review-images img, {{WRAPPER}} .nevari-review-more' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('review_image_gap', array('label' => __('Thumbnail Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 30)), 'default' => array('size' => 9), 'selectors' => array('{{WRAPPER}} .nevari-review-images' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_control('review_more_color', array('label' => __('More Count Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#717780', 'selectors' => array('{{WRAPPER}} .nevari-review-more' => 'color:{{VALUE}};')));
        $this->add_control('review_more_bg', array('label' => __('More Count Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-review-more' => 'background-color:{{VALUE}};')));
        $this->add_control('review_arrow_color', array('label' => __('Arrow Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-review-strip > svg' => 'color:{{VALUE}};')));
        $this->end_controls_section();
        $this->start_controls_section('style_checkout_action', array('label' => __('Summary, Tips & Place Order', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'checkout_summary_heading_typography', 'selector' => '{{WRAPPER}} .nevari-checkout-summary > h2'));
        $this->add_control('checkout_summary_heading_color', array('label' => __('Summary Heading Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-checkout-summary > h2' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'checkout_summary_label_typography', 'selector' => '{{WRAPPER}} .nevari-checkout-summary .nevari-summary-list dt'));
        $this->add_control('checkout_summary_label_color', array('label' => __('Summary Label Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-checkout-summary .nevari-summary-list dt' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'checkout_summary_value_typography', 'selector' => '{{WRAPPER}} .nevari-checkout-summary .nevari-summary-list dd'));
        $this->add_control('checkout_summary_value_color', array('label' => __('Summary Value Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-checkout-summary .nevari-summary-list dd' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'tip_heading_typography', 'selector' => '{{WRAPPER}} .nevari-tip-section h3'));
        $this->add_control('tip_heading_color', array('label' => __('Tip Heading Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-tip-section h3' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'tip_helper_typography', 'selector' => '{{WRAPPER}} .nevari-tip-section > p'));
        $this->add_control('tip_helper_color', array('label' => __('Tip Helper Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-tip-section > p' => 'color:{{VALUE}};')));
        $this->add_responsive_control('tip_gap', array('label' => __('Tip Button Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 30)), 'default' => array('size' => 10), 'selectors' => array('{{WRAPPER}} .nevari-tip-options' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_control('tip_bg', array('label' => __('Tip Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FAFAFA', 'selectors' => array('{{WRAPPER}} .nevari-tip-options button' => 'background-color:{{VALUE}};')));
        $this->add_control('tip_color', array('label' => __('Tip Text Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-tip-options button' => 'color:{{VALUE}};')));
        $this->add_control('tip_hover_bg', array('label' => __('Tip Hover Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#EEF8FC', 'selectors' => array('{{WRAPPER}} .nevari-tip-options button:hover' => 'background-color:{{VALUE}};')));
        $this->add_control('tip_selected_bg', array('label' => __('Selected Tip Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} [data-nevari-tip].is-selected' => 'background:{{VALUE}};')));
        $this->add_control('tip_selected_color', array('label' => __('Selected Tip Text', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} [data-nevari-tip].is-selected' => 'color:{{VALUE}};')));
        $this->add_responsive_control('tip_radius', array('label' => __('Tip Button Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-tip-options button' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'coupon_heading_typography', 'selector' => '{{WRAPPER}} .nevari-coupon-section h3'));
        $this->add_control('coupon_heading_color', array('label' => __('Coupon Heading Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-coupon-section h3' => 'color:{{VALUE}};')));
        $this->add_control('coupon_trigger_color', array('label' => __('Coupon Trigger Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#09A6E7', 'selectors' => array('{{WRAPPER}} .nevari-coupon-section [data-nevari-coupon-toggle]' => 'color:{{VALUE}};')));
        $this->add_control('coupon_button_bg', array('label' => __('Coupon Apply Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-coupon-panel > button' => 'background-color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'checkout_total_typography', 'selector' => '{{WRAPPER}} .nevari-checkout-total'));
        $this->add_control('checkout_total_color', array('label' => __('Total Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-checkout-total' => 'color:{{VALUE}};')));
        $this->add_control('checkout_divider_color', array('label' => __('Total Divider', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-checkout-total' => 'border-color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'terms_typography', 'selector' => '{{WRAPPER}} .nevari-terms-copy, {{WRAPPER}} .nevari-terms-checkbox'));
        $this->add_control('terms_color', array('label' => __('Terms Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-terms-copy, {{WRAPPER}} .nevari-terms-checkbox' => 'color:{{VALUE}};')));
        $this->add_control('place_order_bg', array('label' => __('Place Order Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-place-order' => 'background:{{VALUE}};')));
        $this->add_control('place_order_color', array('label' => __('Place Order Text', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-place-order' => 'color:{{VALUE}};')));
        $this->add_control('place_order_hover_bg', array('label' => __('Place Order Hover Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#062F5F', 'selectors' => array('{{WRAPPER}} .nevari-place-order:hover, {{WRAPPER}} .nevari-place-order:focus-visible' => 'background-color:{{VALUE}};')));
        $this->add_control('place_order_hover_color', array('label' => __('Place Order Hover Text', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-place-order:hover, {{WRAPPER}} .nevari-place-order:focus-visible' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'place_order_typography', 'selector' => '{{WRAPPER}} .nevari-place-order'));
        $this->add_responsive_control('place_order_height', array('label' => __('Button Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 44, 'max' => 90)), 'default' => array('size' => 58), 'selectors' => array('{{WRAPPER}} .nevari-place-order' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('place_order_radius', array('label' => __('Button Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-place-order' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->end_controls_section();
    }

    protected function render() {
        $settings = $this->prepare_settings($this->get_settings_for_display());
        echo Commerce_Module::instance()->renderer()->render_checkout($settings, 'elementor', 'nevari-checkout-' . $this->get_id()); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}
