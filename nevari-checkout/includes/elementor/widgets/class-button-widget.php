<?php
namespace Nevari\Checkout\Elementor;

defined('ABSPATH') || exit;

final class Button_Widget extends \Elementor\Widget_Base {
    public function get_name() { return 'nevari-button'; }
    public function get_title() { return __('Nevari Button', 'nevari-checkout'); }
    public function get_icon() { return 'eicon-button'; }
    public function get_categories() { return array('nevari-checkout'); }
    public function get_style_depends() { return array('nevari-commerce-widgets'); }

    protected function register_controls() {
        $this->start_controls_section('content_button', array('label' => __('Button', 'nevari-checkout')));
        $this->add_control('text', array('label' => __('Text', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::TEXT, 'default' => __('Shop Now', 'nevari-checkout')));
        $this->add_control('link', array('label' => __('Link', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::URL, 'placeholder' => __('https://your-link.com', 'nevari-checkout'), 'default' => array('url' => '#')));
        $this->add_control('show_icon', array('label' => __('Show Arrow Icon', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SWITCHER, 'default' => 'yes'));
        $this->add_control('alignment', array('label' => __('Alignment', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::CHOOSE, 'default' => 'left', 'options' => array(
            'left' => array('title' => __('Left', 'nevari-checkout'), 'icon' => 'eicon-text-align-left'),
            'center' => array('title' => __('Center', 'nevari-checkout'), 'icon' => 'eicon-text-align-center'),
            'right' => array('title' => __('Right', 'nevari-checkout'), 'icon' => 'eicon-text-align-right'),
            'stretch' => array('title' => __('Stretch', 'nevari-checkout'), 'icon' => 'eicon-text-align-justify'),
        ), 'selectors_dictionary' => array('left' => 'flex-start', 'center' => 'center', 'right' => 'flex-end', 'stretch' => 'stretch'), 'selectors' => array('{{WRAPPER}} .nevari-button-widget-wrap' => 'display:flex;justify-content:{{VALUE}};')));
        $this->end_controls_section();

        $this->start_controls_section('style_button', array('label' => __('Button', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE));
        $this->add_group_control(\Elementor\Group_Control_Typography::get_type(), array('name' => 'typography', 'selector' => '{{WRAPPER}} .nevari-button-widget'));
        $this->add_control('text_color', array('label' => __('Text Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-button-widget' => 'color:{{VALUE}};')));
        $this->add_control('background_color', array('label' => __('Background Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#123F63', 'selectors' => array('{{WRAPPER}} .nevari-button-widget' => 'background-color:{{VALUE}};')));
        $this->add_control('hover_text_color', array('label' => __('Hover Text Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#FFFFFF', 'selectors' => array('{{WRAPPER}} .nevari-button-widget:hover, {{WRAPPER}} .nevari-button-widget:focus-visible' => 'color:{{VALUE}};')));
        $this->add_control('hover_background_color', array('label' => __('Hover Background Color', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::COLOR, 'default' => '#062F5F', 'selectors' => array('{{WRAPPER}} .nevari-button-widget:hover, {{WRAPPER}} .nevari-button-widget:focus-visible' => 'background-color:{{VALUE}};')));
        $this->add_responsive_control('border_radius', array('label' => __('Border Radius', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', '%'), 'default' => array('top' => '999', 'right' => '999', 'bottom' => '999', 'left' => '999', 'unit' => 'px', 'isLinked' => true), 'selectors' => array('{{WRAPPER}} .nevari-button-widget' => 'border-radius:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('padding', array('label' => __('Padding', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::DIMENSIONS, 'size_units' => array('px', 'em', '%'), 'default' => array('top' => 16, 'right' => 32, 'bottom' => 16, 'left' => 32, 'unit' => 'px', 'isLinked' => false), 'selectors' => array('{{WRAPPER}} .nevari-button-widget' => 'padding:{{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};')));
        $this->add_responsive_control('min_height', array('label' => __('Minimum Height', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 32, 'max' => 100)), 'default' => array('size' => 52), 'selectors' => array('{{WRAPPER}} .nevari-button-widget' => 'min-height:{{SIZE}}{{UNIT}};')));
        $this->add_group_control(\Elementor\Group_Control_Box_Shadow::get_type(), array('name' => 'box_shadow', 'selector' => '{{WRAPPER}} .nevari-button-widget'));
        $this->end_controls_section();

        $this->start_controls_section('style_icon', array('label' => __('Icon', 'nevari-checkout'), 'tab' => \Elementor\Controls_Manager::TAB_STYLE, 'condition' => array('show_icon' => 'yes')));
        $this->add_responsive_control('icon_size', array('label' => __('Icon Size', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 10, 'max' => 40)), 'default' => array('size' => 18), 'selectors' => array('{{WRAPPER}} .nevari-button-widget svg' => 'width:{{SIZE}}{{UNIT}};height:{{SIZE}}{{UNIT}};')));
        $this->add_responsive_control('icon_gap', array('label' => __('Icon Gap', 'nevari-checkout'), 'type' => \Elementor\Controls_Manager::SLIDER, 'range' => array('px' => array('min' => 0, 'max' => 40)), 'default' => array('size' => 10), 'selectors' => array('{{WRAPPER}} .nevari-button-widget' => 'gap:{{SIZE}}{{UNIT}};')));
        $this->end_controls_section();
    }

    protected function render() {
        $settings = $this->get_settings_for_display();
        $link = isset($settings['link']) && is_array($settings['link']) ? $settings['link'] : array();
        $url = !empty($link['url']) ? $link['url'] : '#';

        $attributes = array('class="nevari-button-widget"', 'href="' . esc_url($url) . '"');
        if (!empty($link['is_external'])) {
            $attributes[] = 'target="_blank"';
        }
        if (!empty($link['nofollow'])) {
            $attributes[] = 'rel="nofollow"';
        }
        ?>
        <div class="nevari-button-widget-wrap">
            <a <?php echo implode(' ', $attributes); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>>
                <span><?php echo esc_html($settings['text']); ?></span>
                <?php if ('yes' === $settings['show_icon']) : ?>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
                <?php endif; ?>
            </a>
        </div>
        <?php
    }
}
