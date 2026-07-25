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

        $this->add_shared_style_controls();
        $this->start_controls_section('style_cards', array('label' => __('Section Cards & Fields', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('card_radius', array('label' => __('Card Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 40)), 'default' => array('size' => 14), 'selectors' => array('{{WRAPPER}} .nevari-checkout-card' => 'border-radius:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('card_padding', array('label' => __('Card Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-checkout-card' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_control('field_bg', array('label' => __('Field Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#F5F4F9', 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input' => 'background:{{VALUE}};')));
        $this->add_control('field_focus', array('label' => __('Field Focus Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#16A8E5', 'selectors' => array('{{WRAPPER}} .nevari-delivery-fields input:focus-visible' => 'border-color:{{VALUE}};box-shadow:0 0 0 3px color-mix(in srgb, {{VALUE}} 18%, transparent);')));
        $this->end_controls_section();
        $this->start_controls_section('style_payments', array('label' => __('Payment Grid', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('payment_columns', array('label' => __('Columns', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'desktop_default' => 3, 'tablet_default' => 2, 'mobile_default' => 1, 'min' => 1, 'max' => 3, 'selectors' => array('{{WRAPPER}} .nevari-payment-grid' => 'grid-template-columns:repeat({{VALUE}},minmax(0,1fr));')));
        $this->add_responsive_control('payment_gap', array('label' => __('Grid Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'default' => array('size' => 12), 'selectors' => array('{{WRAPPER}} .nevari-payment-grid' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_control('payment_selected', array('label' => __('Selected Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#16A8E5', 'selectors' => array('{{WRAPPER}} .nevari-payment-option input:checked + .nevari-payment-card' => 'border-color:{{VALUE}};')));
        $this->end_controls_section();
        $this->start_controls_section('style_checkout_action', array('label' => __('Summary, Tips & Place Order', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_control('tip_selected_bg', array('label' => __('Selected Tip Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} [data-nevari-tip].is-selected' => 'background:{{VALUE}};')));
        $this->add_control('place_order_bg', array('label' => __('Place Order Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-place-order' => 'background:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'place_order_typography', 'selector' => '{{WRAPPER}} .nevari-place-order'));
        $this->end_controls_section();
    }

    protected function render() {
        $settings = $this->prepare_settings($this->get_settings_for_display());
        echo Commerce_Module::instance()->renderer()->render_checkout($settings, 'elementor', 'nevari-checkout-' . $this->get_id()); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}

