<?php
/**
 * Shared Elementor widget control helpers.
 */

namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

abstract class Commerce_Widget_Base extends \Elementor\Widget_Base {
    public function get_categories() {
        return array('nevari-checkout');
    }

    public function get_style_depends() {
        return array('nevari-commerce-widgets');
    }

    public function get_script_depends() {
        return array('nevari-commerce-widgets');
    }

    protected function add_heading_controls($defaults) {
        $this->add_control('show_back', array('label' => __('Show Back Link', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => $defaults['show_back']));
        $this->add_control('back_label', array('label' => __('Back Label', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $defaults['back_label'], 'condition' => array('show_back' => 'yes')));
        $this->add_control('back_url', array('label' => __('Back URL', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::URL, 'default' => array('url' => $defaults['back_url']), 'condition' => array('show_back' => 'yes')));
        $this->add_control('heading', array('label' => __('Page Heading', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $defaults['heading']));
        $this->add_control('heading_tag', array('label' => __('Heading HTML Tag', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SELECT, 'default' => 'h1', 'options' => array('h1' => 'H1', 'h2' => 'H2', 'h3' => 'H3', 'h4' => 'H4', 'div' => 'DIV')));
    }

    protected function add_shared_style_controls($max_width = 1440, $padding = array(), $column_ratio = 2.1, $column_gap = 64) {
        $padding = wp_parse_args($padding, array('top' => 28, 'right' => 40, 'bottom' => 56, 'left' => 40));
        $this->start_controls_section('style_wrapper', array('label' => __('Page Wrapper', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_control('primary_color', array('label' => __('Primary Navy', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-commerce' => '--nevari-primary:{{VALUE}};')));
        $this->add_control('accent_color', array('label' => __('Accent Blue', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#09A6E7', 'selectors' => array('{{WRAPPER}} .nevari-commerce' => '--nevari-accent:{{VALUE}};')));
        $this->add_control('text_color', array('label' => __('Text Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-commerce' => '--nevari-text:{{VALUE}};')));
        $this->add_control('muted_color', array('label' => __('Secondary Text', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-commerce' => '--nevari-muted:{{VALUE}};')));
        $this->add_control('border_color', array('label' => __('Border Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-commerce' => '--nevari-border:{{VALUE}};')));
        $this->add_control('surface_color', array('label' => __('Soft Surface', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#F7F8FA', 'selectors' => array('{{WRAPPER}} .nevari-commerce' => '--nevari-surface:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'base_typography', 'selector' => '{{WRAPPER}} .nevari-commerce'));
        $this->add_control('wrapper_background', array('label' => __('Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-commerce' => 'background-color:{{VALUE}};')));
        $this->add_responsive_control('wrapper_max_width', array('label' => __('Max Width', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'size_units' => array('px', '%'), 'range' => array('px' => array('min' => 640, 'max' => 1800)), 'default' => array('size' => $max_width, 'unit' => 'px'), 'selectors' => array('{{WRAPPER}} .nevari-commerce' => 'max-width:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('wrapper_padding', array('label' => __('Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', 'em', '%'), 'default' => array('top' => $padding['top'], 'right' => $padding['right'], 'bottom' => $padding['bottom'], 'left' => $padding['left'], 'unit' => 'px', 'isLinked' => false), 'selectors' => array('{{WRAPPER}} .nevari-commerce' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->end_controls_section();

        $this->start_controls_section('style_layout', array('label' => __('Columns & Spacing', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $layout_selector = '{{WRAPPER}} .nevari-cart-layout, {{WRAPPER}} .nevari-checkout-layout, {{WRAPPER}} .nevari-order-layout';
        $this->add_responsive_control('main_column_ratio', array('label' => __('Main Column Ratio', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 1, 'max' => 4, 'step' => 0.05)), 'default' => array('size' => $column_ratio), 'selectors' => array($layout_selector => 'grid-template-columns:minmax(0,{{SIZE}}fr) minmax(300px,1fr);')));
        $this->add_responsive_control('column_gap', array('label' => __('Column Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 160)), 'default' => array('size' => $column_gap), 'selectors' => array($layout_selector => 'column-gap:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('layout_row_gap', array('label' => __('Stacked Row Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 100)), 'default' => array('size' => 40), 'selectors' => array($layout_selector => 'row-gap:{{SIZE}}{{UNIT}};')));
        $this->end_controls_section();

        $this->start_controls_section('style_header', array('label' => __('Header & Heading', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'heading_typography', 'selector' => '{{WRAPPER}} .nevari-page-title'));
        $this->add_control('heading_color', array('label' => __('Heading Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-page-title' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'back_typography', 'selector' => '{{WRAPPER}} .nevari-back-link'));
        $this->add_control('back_color', array('label' => __('Back Link Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-back-link' => 'color:{{VALUE}};')));
        $this->add_control('back_hover_color', array('label' => __('Back Link Hover Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-back-link:hover, {{WRAPPER}} .nevari-back-link:focus-visible' => 'color:{{VALUE}};')));
        $this->add_responsive_control('back_icon_size', array('label' => __('Back Icon Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 8, 'max' => 40)), 'default' => array('size' => 18), 'selectors' => array('{{WRAPPER}} .nevari-back-link svg' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('back_gap', array('label' => __('Back Icon Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 40)), 'default' => array('size' => 12), 'selectors' => array('{{WRAPPER}} .nevari-back-link' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('back_bottom_gap', array('label' => __('Back Link Bottom Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 80)), 'default' => array('size' => 24), 'selectors' => array('{{WRAPPER}} .nevari-back-link' => 'margin-bottom:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('header_gap', array('label' => __('Header Bottom Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 120)), 'default' => array('size' => 48), 'selectors' => array('{{WRAPPER}} .nevari-page-header' => 'margin-bottom:{{SIZE}}{{UNIT}};')));
        $this->end_controls_section();
    }

    protected function prepare_settings($settings) {
        foreach (array('back_url', 'continue_url', 'checkout_url') as $key) {
            if (isset($settings[$key]) && is_array($settings[$key])) {
                $settings[$key] = isset($settings[$key]['url']) ? $settings[$key]['url'] : '';
            }
        }
        return $settings;
    }
}
