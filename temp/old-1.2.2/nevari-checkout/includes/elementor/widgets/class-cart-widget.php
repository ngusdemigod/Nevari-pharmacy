<?php
namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

final class Cart_Widget extends Commerce_Widget_Base {
    public function get_name() { return 'nevari-cart'; }
    public function get_title() { return __('Nevari Cart', 'nevari-checkout'); }
    public function get_icon() { return 'eicon-cart'; }

    protected function register_controls() {
        $d = Commerce_Renderer::cart_defaults();
        $this->start_controls_section('content_general', array('label' => __('General', 'nevari-checkout')));
        $this->add_heading_controls($d);
        $this->add_control('update_mode', array('label' => __('Update Mode', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SELECT, 'default' => 'immediate', 'options' => array('immediate' => __('Immediate', 'nevari-checkout'), 'manual' => __('Manual button', 'nevari-checkout'))));
        $this->add_control('debounce', array('label' => __('Quantity Debounce (ms)', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 350, 'min' => 100, 'max' => 2000, 'condition' => array('update_mode' => 'immediate')));
        $this->add_control('sticky_summary', array('label' => __('Sticky Summary', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER));
        $this->add_control('sticky_offset', array('label' => __('Sticky Offset', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 24, 'condition' => array('sticky_summary' => 'yes')));
        $this->end_controls_section();

        $this->start_controls_section('content_product', array('label' => __('Product Rows', 'nevari-checkout')));
        foreach (array('show_image' => __('Show Image', 'nevari-checkout'), 'show_regular_price' => __('Show Regular Price', 'nevari-checkout'), 'show_remove_icon' => __('Show Remove Icon', 'nevari-checkout'), 'show_remove_text' => __('Show Remove Text', 'nevari-checkout')) as $key => $label) {
            $this->add_control($key, array('label' => $label, 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        }
        $this->add_control('remove_label', array('label' => __('Remove Label', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['remove_label'], 'condition' => array('show_remove_text' => 'yes')));
        $this->end_controls_section();

        $this->start_controls_section('content_summary', array('label' => __('Delivery & Summary', 'nevari-checkout')));
        $this->add_control('show_progress', array('label' => __('Show Delivery Progress', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        foreach (array('summary_heading', 'items_total_label', 'delivery_label', 'subtotal_label', 'checkout_label') as $key) {
            $this->add_control($key, array('label' => ucwords(str_replace('_', ' ', $key)), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d[$key]));
        }
        $this->add_control('checkout_url', array('label' => __('Checkout URL', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::URL, 'default' => array('url' => $d['checkout_url'])));
        $this->end_controls_section();

        $this->start_controls_section('content_empty', array('label' => __('Empty Cart', 'nevari-checkout')));
        foreach (array('empty_heading', 'empty_message', 'continue_label') as $key) {
            $this->add_control($key, array('label' => ucwords(str_replace('_', ' ', $key)), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d[$key]));
        }
        $this->add_control('continue_url', array('label' => __('Continue URL', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::URL, 'default' => array('url' => $d['continue_url'])));
        $this->end_controls_section();

        $this->add_shared_style_controls();
        $this->start_controls_section('style_rows', array('label' => __('Product Rows', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('row_padding', array('label' => __('Row Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-cart-row' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('image_size', array('label' => __('Image Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 40, 'max' => 120)), 'default' => array('size' => 64), 'selectors' => array('{{WRAPPER}} .nevari-product-image, {{WRAPPER}} .nevari-product-image img' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->add_control('price_color', array('label' => __('Current Price Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FF8A00', 'selectors' => array('{{WRAPPER}} .nevari-price-current' => 'color:{{VALUE}};')));
        $this->end_controls_section();
        $this->start_controls_section('style_actions', array('label' => __('Quantity & Remove', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('quantity_size', array('label' => __('Button Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 28, 'max' => 60)), 'default' => array('size' => 36), 'selectors' => array('{{WRAPPER}} .nevari-qty-button' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->add_control('plus_bg', array('label' => __('Plus Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#062F5F', 'selectors' => array('{{WRAPPER}} .nevari-qty-plus' => 'background:{{VALUE}};')));
        $this->add_control('remove_color', array('label' => __('Remove Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#09A6E7', 'selectors' => array('{{WRAPPER}} .nevari-remove-text' => 'color:{{VALUE}};')));
        $this->end_controls_section();
        $this->start_controls_section('style_summary', array('label' => __('Summary & Checkout Button', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_control('button_bg', array('label' => __('Button Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#0B3A68', 'selectors' => array('{{WRAPPER}} .nevari-checkout-button' => 'background:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'button_typography', 'selector' => '{{WRAPPER}} .nevari-checkout-button'));
        $this->end_controls_section();
    }

    protected function render() {
        $settings = $this->prepare_settings($this->get_settings_for_display());
        echo Commerce_Module::instance()->renderer()->render_cart($settings, 'elementor', 'nevari-cart-' . $this->get_id()); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}

