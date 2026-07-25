<?php
namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

final class Order_Progress_Widget extends Commerce_Widget_Base {
    public function get_name() { return 'nevari-order-progress'; }
    public function get_title() { return __('Nevari Order Progress', 'nevari-checkout'); }
    public function get_icon() { return 'eicon-check-circle'; }

    protected function register_controls() {
        $d = Commerce_Renderer::order_defaults();
        $this->start_controls_section('content_general', array('label' => __('Header & Status', 'nevari-checkout')));
        $this->add_heading_controls($d);
        $this->add_control('success_title', array('label' => __('Success Title', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['success_title']));
        $this->add_control('animate_check', array('label' => __('Animate Checkmark', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        $this->add_control('auto_refresh', array('label' => __('Auto-refresh Status', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        $this->add_control('refresh_interval', array('label' => __('Refresh Interval (seconds)', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 30, 'min' => 15, 'max' => 300, 'condition' => array('auto_refresh' => 'yes')));
        $this->add_control('missing_message', array('label' => __('Missing Order Message', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['missing_message']));
        $this->add_control('unauthorized_message', array('label' => __('Unauthorized Message', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['unauthorized_message']));
        $this->end_controls_section();

        $this->start_controls_section('content_timeline_items', array('label' => __('Timeline & Items', 'nevari-checkout')));
        $this->add_control('show_timeline', array('label' => __('Show Timeline', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        $this->add_control('items_heading', array('label' => __('Items Heading', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['items_heading']));
        $this->add_control('quantity_heading', array('label' => __('Quantity Heading', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d['quantity_heading']));
        $this->add_control('rows_per_page', array('label' => __('Rows Per Page', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::NUMBER, 'default' => 3, 'min' => 1, 'max' => 24));
        $this->add_control('show_pagination', array('label' => __('Show Pagination', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        $this->end_controls_section();

        $this->start_controls_section('content_sidebar', array('label' => __('Summary Cards', 'nevari-checkout')));
        foreach (array('summary_heading', 'order_number_label', 'delivery_label', 'total_label', 'address_heading') as $key) {
            $this->add_control($key, array('label' => ucwords(str_replace('_', ' ', $key)), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => $d[$key]));
        }
        $this->end_controls_section();

        $this->add_shared_style_controls();
        $this->start_controls_section('style_confirmation', array('label' => __('Confirmation & Timeline', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_control('success_color', array('label' => __('Success Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#19C43A', 'selectors' => array('{{WRAPPER}} .nevari-success-icon span' => 'background:{{VALUE}};', '{{WRAPPER}} .nevari-success-icon' => 'color:{{VALUE}};')));
        $this->add_responsive_control('success_size', array('label' => __('Success Circle Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 56, 'max' => 140)), 'default' => array('size' => 88), 'selectors' => array('{{WRAPPER}} .nevari-success-icon' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->add_control('timeline_complete', array('label' => __('Completed Track', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#16A8E5', 'selectors' => array('{{WRAPPER}} .nevari-timeline .is-complete .nevari-timeline-bar, {{WRAPPER}} .nevari-timeline .is-active .nevari-timeline-bar' => 'background:{{VALUE}};')));
        $this->end_controls_section();
        $this->start_controls_section('style_order_items', array('label' => __('Order Items', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_control('items_top_border', array('label' => __('Top Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'selectors' => array('{{WRAPPER}} .nevari-order-items' => 'border-top:1px solid var(--nevari-border);')));
        $this->add_control('items_right_border', array('label' => __('Right Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'selectors' => array('{{WRAPPER}} .nevari-order-items' => 'border-right:1px solid var(--nevari-border);')));
        $this->add_control('items_bottom_border', array('label' => __('Bottom Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes', 'selectors' => array('{{WRAPPER}} .nevari-order-items' => 'border-bottom:1px solid var(--nevari-border);')));
        $this->add_control('items_left_border', array('label' => __('Left Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'selectors' => array('{{WRAPPER}} .nevari-order-items' => 'border-left:1px solid var(--nevari-border);')));
        $this->end_controls_section();
        $this->start_controls_section('style_sidebar', array('label' => __('Summary Cards', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('sidebar_radius', array('label' => __('Card Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'default' => array('size' => 14), 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar > section' => 'border-radius:{{SIZE}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Box_Shadow::get_type(), array('name' => 'sidebar_shadow', 'selector' => '{{WRAPPER}} .nevari-order-sidebar > section'));
        $this->end_controls_section();
    }

    protected function render() {
        $settings = $this->prepare_settings($this->get_settings_for_display());
        echo Commerce_Module::instance()->renderer()->render_order_progress($settings, 'elementor', 'nevari-order-' . $this->get_id()); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}

