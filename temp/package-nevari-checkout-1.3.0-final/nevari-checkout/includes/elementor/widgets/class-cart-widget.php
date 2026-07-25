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
            $this->add_control($key, array('label' => $label, 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => isset($d[$key]) ? $d[$key] : 'yes'));
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

        $this->add_shared_style_controls(1536, array('top' => 28, 'right' => 56, 'bottom' => 60, 'left' => 56), 2.2, 88);
        $this->start_controls_section('style_rows', array('label' => __('Product Rows', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('row_padding', array('label' => __('Row Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-cart-row' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('row_min_height', array('label' => __('Row Minimum Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 64, 'max' => 220)), 'default' => array('size' => 112), 'selectors' => array('{{WRAPPER}} .nevari-cart-row' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('row_gap', array('label' => __('Image / Content Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 60)), 'default' => array('size' => 18), 'selectors' => array('{{WRAPPER}} .nevari-product-main' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_control('row_divider_color', array('label' => __('Divider Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-cart-row' => 'border-color:{{VALUE}};')));
        $this->add_responsive_control('row_divider_width', array('label' => __('Divider Width', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 5)), 'default' => array('size' => 1), 'selectors' => array('{{WRAPPER}} .nevari-cart-row' => 'border-bottom-width:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('image_size', array('label' => __('Image Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 40, 'max' => 120)), 'default' => array('size' => 64), 'selectors' => array('{{WRAPPER}} .nevari-product-image, {{WRAPPER}} .nevari-product-image img' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('image_radius', array('label' => __('Image Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-product-image, {{WRAPPER}} .nevari-product-image img' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_control('image_background', array('label' => __('Image Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'selectors' => array('{{WRAPPER}} .nevari-product-image' => 'background-color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'product_name_typography', 'selector' => '{{WRAPPER}} .nevari-product-name'));
        $this->add_control('product_name_color', array('label' => __('Product Name Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-product-name' => 'color:{{VALUE}};')));
        $this->add_control('product_name_hover_color', array('label' => __('Product Name Hover', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-product-name:hover' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'current_price_typography', 'selector' => '{{WRAPPER}} .nevari-price-current'));
        $this->add_control('price_color', array('label' => __('Current Price Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FF8A00', 'selectors' => array('{{WRAPPER}} .nevari-price-current' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'regular_price_typography', 'selector' => '{{WRAPPER}} .nevari-product-prices del'));
        $this->add_control('regular_price_color', array('label' => __('Regular Price Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-product-prices del' => 'color:{{VALUE}};')));
        $this->add_responsive_control('price_gap', array('label' => __('Price Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 30)), 'default' => array('size' => 10), 'selectors' => array('{{WRAPPER}} .nevari-product-prices' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->end_controls_section();
        $this->start_controls_section('style_actions', array('label' => __('Quantity & Remove', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('actions_gap', array('label' => __('Actions Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 50)), 'default' => array('size' => 16), 'selectors' => array('{{WRAPPER}} .nevari-cart-actions' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('quantity_gap', array('label' => __('Quantity Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 30)), 'default' => array('size' => 12), 'selectors' => array('{{WRAPPER}} .nevari-quantity' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('quantity_size', array('label' => __('Button Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 28, 'max' => 60)), 'default' => array('size' => 36), 'selectors' => array('{{WRAPPER}} .nevari-qty-button' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('quantity_radius', array('label' => __('Button Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-qty-button' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_control('minus_bg', array('label' => __('Minus Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-qty-minus' => 'background-color:{{VALUE}};')));
        $this->add_control('minus_color', array('label' => __('Minus Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-qty-minus::before' => 'background-color:{{VALUE}};')));
        $this->add_control('minus_border_color', array('label' => __('Minus Border Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-qty-minus' => 'border-color:{{VALUE}};')));
        $this->add_control('plus_bg', array('label' => __('Plus Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#062F5F', 'selectors' => array('{{WRAPPER}} .nevari-qty-plus' => 'background:{{VALUE}};')));
        $this->add_control('plus_color', array('label' => __('Plus Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-qty-plus::before, {{WRAPPER}} .nevari-qty-plus::after' => 'background-color:{{VALUE}};')));
        $this->add_control('quantity_text_color', array('label' => __('Quantity Text Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} input.nevari-qty-value' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'quantity_typography', 'selector' => '{{WRAPPER}} input.nevari-qty-value'));
        $this->add_responsive_control('quantity_width', array('label' => __('Quantity Width', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 24, 'max' => 110)), 'default' => array('size' => 24), 'selectors' => array('{{WRAPPER}} input.nevari-qty-value' => 'width:{{SIZE}}{{UNIT}};')));
        $this->add_control('quantity_bg', array('label' => __('Quantity Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => 'transparent', 'selectors' => array('{{WRAPPER}} input.nevari-qty-value' => 'background-color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'remove_typography', 'selector' => '{{WRAPPER}} .nevari-remove-text'));
        $this->add_control('remove_color', array('label' => __('Remove Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#09A6E7', 'selectors' => array('{{WRAPPER}} .nevari-remove-text' => 'color:{{VALUE}};')));
        $this->add_control('remove_hover_color', array('label' => __('Remove Hover Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-remove-text:hover, {{WRAPPER}} .nevari-remove-text:focus-visible' => 'color:{{VALUE}};')));
        $this->add_control('remove_background', array('label' => __('Remove Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => 'transparent', 'selectors' => array('{{WRAPPER}} button.nevari-remove-text' => 'background-color:{{VALUE}};')));
        $this->add_responsive_control('remove_padding', array('label' => __('Remove Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-remove-text' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_control('trash_background', array('label' => __('Trash Button Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#062F5F', 'condition' => array('show_remove_icon' => 'yes'), 'selectors' => array('{{WRAPPER}} .nevari-remove-icon' => 'background-color:{{VALUE}};')));
        $this->add_control('trash_color', array('label' => __('Trash Icon Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'condition' => array('show_remove_icon' => 'yes'), 'selectors' => array('{{WRAPPER}} .nevari-remove-icon' => 'color:{{VALUE}};')));
        $this->end_controls_section();
        $this->start_controls_section('style_summary', array('label' => __('Summary & Checkout Button', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('progress_bottom_gap', array('label' => __('Progress Bottom Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 100)), 'default' => array('size' => 28), 'selectors' => array('{{WRAPPER}} .nevari-delivery-progress' => 'margin-bottom:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('progress_height', array('label' => __('Progress Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 2, 'max' => 20)), 'default' => array('size' => 6), 'selectors' => array('{{WRAPPER}} .nevari-progress-track' => 'height:{{SIZE}}{{UNIT}};')));
        $this->add_control('progress_track_color', array('label' => __('Progress Track', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#DDF3FC', 'selectors' => array('{{WRAPPER}} .nevari-progress-track' => 'background-color:{{VALUE}};')));
        $this->add_control('progress_fill_color', array('label' => __('Progress Fill', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#09A6E7', 'selectors' => array('{{WRAPPER}} .nevari-progress-track span' => 'background-color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'progress_message_typography', 'selector' => '{{WRAPPER}} .nevari-delivery-progress p'));
        $this->add_control('progress_message_color', array('label' => __('Progress Message Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-delivery-progress p' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'summary_heading_typography', 'selector' => '{{WRAPPER}} .nevari-cart-summary h2'));
        $this->add_control('summary_heading_color', array('label' => __('Summary Heading Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-cart-summary h2' => 'color:{{VALUE}};')));
        $this->add_responsive_control('summary_heading_gap', array('label' => __('Heading Bottom Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 80)), 'default' => array('size' => 22), 'selectors' => array('{{WRAPPER}} .nevari-cart-summary h2' => 'margin-bottom:{{SIZE}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'summary_label_typography', 'selector' => '{{WRAPPER}} .nevari-summary-list dt'));
        $this->add_control('summary_label_color', array('label' => __('Summary Label Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-summary-list dt' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'summary_value_typography', 'selector' => '{{WRAPPER}} .nevari-summary-list dd'));
        $this->add_control('summary_value_color', array('label' => __('Summary Value Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-summary-list dd' => 'color:{{VALUE}};')));
        $this->add_responsive_control('summary_row_gap', array('label' => __('Summary Row Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 60)), 'default' => array('size' => 22), 'selectors' => array('{{WRAPPER}} .nevari-summary-list' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_control('summary_divider_color', array('label' => __('Summary Divider', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-summary-total' => 'border-color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'total_typography', 'selector' => '{{WRAPPER}} .nevari-summary-total'));
        $this->add_control('total_label_color', array('label' => __('Total Label Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-summary-total span' => 'color:{{VALUE}};')));
        $this->add_control('total_value_color', array('label' => __('Total Value Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-summary-total strong' => 'color:{{VALUE}};')));
        $this->add_control('button_bg', array('label' => __('Button Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#0B3A68', 'selectors' => array('{{WRAPPER}} .nevari-checkout-button' => 'background:{{VALUE}};')));
        $this->add_control('button_color', array('label' => __('Button Text Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-checkout-button' => 'color:{{VALUE}};')));
        $this->add_control('button_hover_bg', array('label' => __('Button Hover Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#062F5F', 'selectors' => array('{{WRAPPER}} .nevari-checkout-button:hover, {{WRAPPER}} .nevari-checkout-button:focus-visible' => 'background-color:{{VALUE}};')));
        $this->add_control('button_hover_color', array('label' => __('Button Hover Text', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-checkout-button:hover, {{WRAPPER}} .nevari-checkout-button:focus-visible' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'button_typography', 'selector' => '{{WRAPPER}} .nevari-checkout-button'));
        $this->add_responsive_control('button_height', array('label' => __('Button Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 44, 'max' => 90)), 'default' => array('size' => 54), 'selectors' => array('{{WRAPPER}} .nevari-checkout-button' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('button_radius', array('label' => __('Button Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'default' => array('top' => 28, 'right' => 28, 'bottom' => 28, 'left' => 28, 'unit' => 'px', 'isLinked' => true), 'selectors' => array('{{WRAPPER}} .nevari-checkout-button' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('button_icon_size', array('label' => __('Button Icon Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 12, 'max' => 40)), 'default' => array('size' => 22), 'selectors' => array('{{WRAPPER}} .nevari-checkout-button svg' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->end_controls_section();

        $this->start_controls_section('style_empty', array('label' => __('Empty Cart State', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_control('empty_background', array('label' => __('Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#F7F8FA', 'selectors' => array('{{WRAPPER}} .nevari-empty-state' => 'background-color:{{VALUE}};')));
        $this->add_control('empty_border_color', array('label' => __('Border Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-empty-state' => 'border-color:{{VALUE}};')));
        $this->add_responsive_control('empty_radius', array('label' => __('Border Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-empty-state' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('empty_padding', array('label' => __('Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-empty-state' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'empty_heading_typography', 'selector' => '{{WRAPPER}} .nevari-empty-state h2'));
        $this->add_control('empty_heading_color', array('label' => __('Heading Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-empty-state h2' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'empty_text_typography', 'selector' => '{{WRAPPER}} .nevari-empty-state p'));
        $this->add_control('empty_text_color', array('label' => __('Message Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-empty-state p' => 'color:{{VALUE}};')));
        $this->end_controls_section();
    }

    protected function render() {
        $settings = $this->prepare_settings($this->get_settings_for_display());
        echo Commerce_Module::instance()->renderer()->render_cart($settings, 'elementor', 'nevari-cart-' . $this->get_id()); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}
