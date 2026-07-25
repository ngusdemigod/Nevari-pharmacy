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
        $this->add_control('show_status_label', array('label' => __('Show WooCommerce Status Label', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => $d['show_status_label'], 'selectors' => array('{{WRAPPER}} .nevari-confirmation strong' => 'display:block;')));
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

        $this->add_shared_style_controls(1280, array('top' => 28, 'right' => 0, 'bottom' => 40, 'left' => 0), 1.93, 62);
        $this->start_controls_section('style_confirmation', array('label' => __('Confirmation & Timeline', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('confirmation_height', array('label' => __('Confirmation Minimum Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 120, 'max' => 360)), 'default' => array('size' => 190), 'selectors' => array('{{WRAPPER}} .nevari-confirmation' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_control('success_color', array('label' => __('Success Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#19C43A', 'selectors' => array('{{WRAPPER}} .nevari-success-icon span' => 'background:{{VALUE}};', '{{WRAPPER}} .nevari-success-icon' => 'color:{{VALUE}};')));
        $this->add_control('success_outer_bg', array('label' => __('Success Outer Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#DCFCE5', 'selectors' => array('{{WRAPPER}} .nevari-success-icon' => 'background-color:{{VALUE}};')));
        $this->add_control('success_check_color', array('label' => __('Checkmark Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-success-icon span' => 'color:{{VALUE}};')));
        $this->add_responsive_control('success_size', array('label' => __('Success Circle Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 56, 'max' => 140)), 'default' => array('size' => 88), 'selectors' => array('{{WRAPPER}} .nevari-success-icon' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'success_title_typography', 'selector' => '{{WRAPPER}} .nevari-confirmation p'));
        $this->add_control('success_title_color', array('label' => __('Success Title Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-confirmation p' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'status_label_typography', 'selector' => '{{WRAPPER}} .nevari-confirmation strong'));
        $this->add_control('status_label_color', array('label' => __('Status Label Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'condition' => array('show_status_label' => 'yes'), 'selectors' => array('{{WRAPPER}} .nevari-confirmation strong' => 'color:{{VALUE}};')));
        $this->add_responsive_control('timeline_gap', array('label' => __('Milestone Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 60)), 'default' => array('size' => 20), 'selectors' => array('{{WRAPPER}} .nevari-timeline' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('timeline_height', array('label' => __('Track Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 2, 'max' => 20)), 'default' => array('size' => 7), 'selectors' => array('{{WRAPPER}} .nevari-timeline-bar' => 'height:{{SIZE}}{{UNIT}};')));
        $this->add_control('timeline_upcoming', array('label' => __('Upcoming Track', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#F1F2F4', 'selectors' => array('{{WRAPPER}} .nevari-timeline-bar' => 'background-color:{{VALUE}};')));
        $this->add_control('timeline_complete', array('label' => __('Completed Track', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#16A8E5', 'selectors' => array('{{WRAPPER}} .nevari-timeline .is-complete .nevari-timeline-bar, {{WRAPPER}} .nevari-timeline .is-active .nevari-timeline-bar' => 'background:{{VALUE}};')));
        $this->add_control('timeline_dot_border', array('label' => __('Upcoming Dot Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-timeline-dot' => 'border-color:{{VALUE}};')));
        $this->add_control('timeline_dot_complete', array('label' => __('Completed Dot', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#16A8E5', 'selectors' => array('{{WRAPPER}} .nevari-timeline .is-complete .nevari-timeline-dot' => 'border-color:{{VALUE}};background-color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'timeline_label_typography', 'selector' => '{{WRAPPER}} .nevari-timeline li > div'));
        $this->add_control('timeline_label_color', array('label' => __('Milestone Label Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-timeline li > div' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'timeline_date_typography', 'selector' => '{{WRAPPER}} .nevari-timeline time'));
        $this->end_controls_section();
        $this->start_controls_section('style_order_items', array('label' => __('Order Items', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_control('items_top_border', array('label' => __('Top Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'selectors' => array('{{WRAPPER}} .nevari-order-items' => 'border-top:1px solid var(--nevari-border);')));
        $this->add_control('items_right_border', array('label' => __('Right Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'selectors' => array('{{WRAPPER}} .nevari-order-items' => 'border-right:1px solid var(--nevari-border);')));
        $this->add_control('items_bottom_border', array('label' => __('Bottom Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes', 'selectors' => array('{{WRAPPER}} .nevari-order-items' => 'border-bottom:1px solid var(--nevari-border);')));
        $this->add_control('items_left_border', array('label' => __('Left Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'selectors' => array('{{WRAPPER}} .nevari-order-items' => 'border-left:1px solid var(--nevari-border);')));
        $this->add_control('items_border_color', array('label' => __('Border / Divider Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-order-items, {{WRAPPER}} .nevari-order-items > header, {{WRAPPER}} .nevari-order-items > article' => 'border-color:{{VALUE}};')));
        $this->add_responsive_control('items_header_height', array('label' => __('Header Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 36, 'max' => 100)), 'default' => array('size' => 52), 'selectors' => array('{{WRAPPER}} .nevari-order-items > header' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'items_header_typography', 'selector' => '{{WRAPPER}} .nevari-order-items > header'));
        $this->add_control('items_header_color', array('label' => __('Header Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-order-items > header' => 'color:{{VALUE}};')));
        $this->add_responsive_control('item_row_height', array('label' => __('Row Minimum Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 70, 'max' => 180)), 'default' => array('size' => 108), 'selectors' => array('{{WRAPPER}} .nevari-order-items > article' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('item_row_padding', array('label' => __('Row Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-order-items > article' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('item_image_size', array('label' => __('Image Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 36, 'max' => 100)), 'default' => array('size' => 64), 'selectors' => array('{{WRAPPER}} .nevari-order-items .nevari-product-image' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};flex-basis:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('item_image_radius', array('label' => __('Image Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'selectors' => array('{{WRAPPER}} .nevari-order-items .nevari-product-image' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'item_name_typography', 'selector' => '{{WRAPPER}} .nevari-order-items .nevari-product-name'));
        $this->add_control('item_name_color', array('label' => __('Item Name Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-order-items .nevari-product-name' => 'color:{{VALUE}};')));
        $this->add_control('item_price_color', array('label' => __('Current Price Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FF8A00', 'selectors' => array('{{WRAPPER}} .nevari-order-items .nevari-price-current' => 'color:{{VALUE}};')));
        $this->add_control('item_regular_price_color', array('label' => __('Regular Price Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-order-items del' => 'color:{{VALUE}};')));
        $this->add_control('item_count_bg', array('label' => __('Quantity Badge Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FAFAFA', 'selectors' => array('{{WRAPPER}} .nevari-item-count' => 'background-color:{{VALUE}};')));
        $this->add_control('item_count_color', array('label' => __('Quantity Badge Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-item-count' => 'color:{{VALUE}};')));
        $this->add_responsive_control('item_count_size', array('label' => __('Quantity Badge Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 32, 'max' => 70)), 'default' => array('size' => 42), 'selectors' => array('{{WRAPPER}} .nevari-item-count' => 'min-width:{{SIZE}}{{UNIT}};min-height:{{SIZE}}{{UNIT}};')));
        $this->add_control('pagination_color', array('label' => __('Pagination Text', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-pagination a' => 'color:{{VALUE}};')));
        $this->add_control('pagination_active', array('label' => __('Active Page Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#09A6E7', 'selectors' => array('{{WRAPPER}} .nevari-pagination a[aria-current=page]' => 'border-color:{{VALUE}};')));
        $this->end_controls_section();
        $this->start_controls_section('style_sidebar', array('label' => __('Summary Cards', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_responsive_control('sidebar_gap', array('label' => __('Card Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 70)), 'default' => array('size' => 22), 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->add_control('sidebar_background', array('label' => __('Card Background', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar > section' => 'background-color:{{VALUE}};')));
        $this->add_control('sidebar_border', array('label' => __('Card Border', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar > section' => 'border-color:{{VALUE}};')));
        $this->add_responsive_control('sidebar_padding', array('label' => __('Card Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar > section' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('sidebar_radius', array('label' => __('Card Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'default' => array('size' => 14), 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar > section' => 'border-radius:{{SIZE}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Box_Shadow::get_type(), array('name' => 'sidebar_shadow', 'selector' => '{{WRAPPER}} .nevari-order-sidebar > section'));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'sidebar_heading_typography', 'selector' => '{{WRAPPER}} .nevari-order-sidebar h2'));
        $this->add_control('sidebar_heading_color', array('label' => __('Heading Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar h2' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'sidebar_label_typography', 'selector' => '{{WRAPPER}} .nevari-order-sidebar dt, {{WRAPPER}} .nevari-order-number span'));
        $this->add_control('sidebar_label_color', array('label' => __('Label Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#8A9099', 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar dt, {{WRAPPER}} .nevari-order-number span' => 'color:{{VALUE}};')));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'sidebar_value_typography', 'selector' => '{{WRAPPER}} .nevari-order-sidebar dd, {{WRAPPER}} .nevari-order-number strong'));
        $this->add_control('sidebar_value_color', array('label' => __('Value Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#111827', 'selectors' => array('{{WRAPPER}} .nevari-order-sidebar dd' => 'color:{{VALUE}};')));
        $this->add_control('sidebar_link_color', array('label' => __('Order / Address Link Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#09A6E7', 'selectors' => array('{{WRAPPER}} .nevari-order-number strong, {{WRAPPER}} .nevari-sidebar-link' => 'color:{{VALUE}};')));
        $this->add_control('sidebar_divider', array('label' => __('Total Divider Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#E7E9EE', 'selectors' => array('{{WRAPPER}} .nevari-sidebar-total' => 'border-color:{{VALUE}};')));
        $this->add_responsive_control('sidebar_icon_size', array('label' => __('Payment / Address Icon Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 12, 'max' => 40)), 'default' => array('size' => 20), 'selectors' => array('{{WRAPPER}} .nevari-sidebar-link svg' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};flex-basis:{{SIZE}}{{UNIT}};')));
        $this->end_controls_section();
    }

    protected function render() {
        $settings = $this->prepare_settings($this->get_settings_for_display());
        echo Commerce_Module::instance()->renderer()->render_order_progress($settings, 'elementor', 'nevari-order-' . $this->get_id()); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
    }
}
