<?php

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Controls_Manager;
use Elementor\Group_Control_Typography;
use Elementor\Widget_Base;

class Nevari_Products_Widget extends Widget_Base {
    public function get_name() {
        return 'nevari-products';
    }

    public function get_title() {
        return __('Nevari Products', 'woocommerce');
    }

    public function get_icon() {
        return 'eicon-products';
    }

    public function get_categories() {
        return array('nevari');
    }

    public function get_style_depends() {
        return array('nevari-products-widget');
    }

    protected function register_controls() {
        $this->register_query_controls();
        $this->register_pagination_controls();
        $this->register_style_controls();
    }

    private function get_font_family_options() {
        return array(
            'Product Sans, Inter, Arial, sans-serif' => __('Product Sans / Inter', 'woocommerce'),
            'Inter, Arial, sans-serif'               => __('Inter', 'woocommerce'),
            'Arial, Helvetica, sans-serif'           => __('Arial', 'woocommerce'),
            'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' => __('System UI', 'woocommerce'),
            'Montserrat, Arial, sans-serif'          => __('Montserrat', 'woocommerce'),
            'Poppins, Arial, sans-serif'             => __('Poppins', 'woocommerce'),
            'Georgia, serif'                         => __('Georgia', 'woocommerce'),
            '"Times New Roman", Times, serif'        => __('Times New Roman', 'woocommerce'),
            'Verdana, Geneva, sans-serif'            => __('Verdana', 'woocommerce'),
        );
    }

    private function get_product_options() {
        $product_ids = get_posts(
            array(
                'post_type'      => 'product',
                'post_status'    => 'publish',
                'fields'         => 'ids',
                'posts_per_page' => 200,
                'orderby'        => 'title',
                'order'          => 'ASC',
            )
        );

        $options = array();

        foreach ($product_ids as $product_id) {
            $options[$product_id] = get_the_title($product_id);
        }

        return $options;
    }

    private function get_term_options($taxonomy) {
        $terms = get_terms(
            array(
                'taxonomy'   => $taxonomy,
                'hide_empty' => false,
            )
        );

        if (is_wp_error($terms) || empty($terms)) {
            return array();
        }

        $options = array();

        foreach ($terms as $term) {
            $options[$term->term_id] = $term->name;
        }

        return $options;
    }

    private function register_query_controls() {
        $this->start_controls_section(
            'section_query',
            array(
                'label' => __('Query', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_CONTENT,
            )
        );

        $this->add_control(
            'source',
            array(
                'label'   => __('Source', 'woocommerce'),
                'type'    => Controls_Manager::SELECT,
                'default' => 'latest',
                'options' => array(
                    'latest'         => __('Latest Products', 'woocommerce'),
                    'featured'       => __('Featured Products', 'woocommerce'),
                    'sale'           => __('Sale Products', 'woocommerce'),
                    'manual'         => __('Manual Selection', 'woocommerce'),
                    'category'       => __('Category', 'woocommerce'),
                    'tag'            => __('Tag', 'woocommerce'),
                    'current_search' => __('Current Search Results', 'woocommerce'),
                    'current_archive'=> __('Current Archive', 'woocommerce'),
                ),
                'description' => __('Use Current Search Results on product search templates and Current Archive on product category or tag templates.', 'woocommerce'),
            )
        );

        $this->add_control(
            'query_relation',
            array(
                'label'     => __('Include / Exclude', 'woocommerce'),
                'type'      => Controls_Manager::CHOOSE,
                'default'   => 'include',
                'options'   => array(
                    'include' => array(
                        'title' => __('Include', 'woocommerce'),
                        'icon'  => 'eicon-plus',
                    ),
                    'exclude' => array(
                        'title' => __('Exclude', 'woocommerce'),
                        'icon'  => 'eicon-minus',
                    ),
                ),
                'toggle'    => false,
                'condition' => array(
                    'source' => array('category', 'tag'),
                ),
            )
        );

        $this->add_control(
            'categories',
            array(
                'label'       => __('Categories', 'woocommerce'),
                'type'        => Controls_Manager::SELECT2,
                'options'     => $this->get_term_options('product_cat'),
                'multiple'    => true,
                'label_block' => true,
                'condition'   => array(
                    'source' => 'category',
                ),
            )
        );

        $this->add_control(
            'tags',
            array(
                'label'       => __('Tags', 'woocommerce'),
                'type'        => Controls_Manager::SELECT2,
                'options'     => $this->get_term_options('product_tag'),
                'multiple'    => true,
                'label_block' => true,
                'condition'   => array(
                    'source' => 'tag',
                ),
            )
        );

        $this->add_control(
            'product_ids',
            array(
                'label'       => __('Products', 'woocommerce'),
                'type'        => Controls_Manager::SELECT2,
                'options'     => $this->get_product_options(),
                'multiple'    => true,
                'label_block' => true,
                'condition'   => array(
                    'source' => 'manual',
                ),
            )
        );

        $this->add_control(
            'author',
            array(
                'label'       => __('Author', 'woocommerce'),
                'type'        => Controls_Manager::TEXT,
                'placeholder' => __('Author user ID', 'woocommerce'),
                'condition'   => array(
                    'source' => array('latest', 'manual', 'category', 'tag', 'featured', 'sale', 'current_search', 'current_archive'),
                ),
            )
        );

        $this->add_control(
            'orderby',
            array(
                'label'   => __('Order By', 'woocommerce'),
                'type'    => Controls_Manager::SELECT,
                'default' => 'date',
                'options' => array(
                    'date'       => __('Date', 'woocommerce'),
                    'title'      => __('Title', 'woocommerce'),
                    'price'      => __('Price', 'woocommerce'),
                    'menu_order' => __('Menu Order', 'woocommerce'),
                    'rand'       => __('Random', 'woocommerce'),
                ),
            )
        );

        $this->add_control(
            'order',
            array(
                'label'   => __('Order', 'woocommerce'),
                'type'    => Controls_Manager::SELECT,
                'default' => 'DESC',
                'options' => array(
                    'ASC'  => __('ASC', 'woocommerce'),
                    'DESC' => __('DESC', 'woocommerce'),
                ),
            )
        );

        $this->add_responsive_control(
            'columns',
            array(
                'label'      => __('Columns', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array(''),
                'range'      => array(
                    '' => array(
                        'min' => 1,
                        'max' => 6,
                    ),
                ),
                'desktop_default' => array(
                    'size' => 5,
                    'unit' => '',
                ),
                'tablet_default' => array(
                    'size' => 3,
                    'unit' => '',
                ),
                'mobile_default' => array(
                    'size' => 1,
                    'unit' => '',
                ),
                'selectors'  => array(
                    '{{WRAPPER}} .nevari-products-widget__grid' => 'grid-template-columns: repeat({{SIZE}}, minmax(0, 1fr));',
                ),
            )
        );

        $this->add_responsive_control(
            'grid_gap',
            array(
                'label'      => __('Grid Gap', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 60,
                    ),
                ),
                'default' => array(
                    'size' => 20,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__grid' => 'gap: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_control(
            'items_limit',
            array(
                'label'      => __('Products Per Page', 'woocommerce'),
                'type'       => Controls_Manager::NUMBER,
                'default'    => 5,
                'min'        => 1,
                'max'        => 100,
                'step'       => 1,
            )
        );

        $this->add_control(
            'show_quantity',
            array(
                'label'        => __('Show Quantity', 'woocommerce'),
                'type'         => Controls_Manager::SWITCHER,
                'label_on'     => __('Yes', 'woocommerce'),
                'label_off'    => __('No', 'woocommerce'),
                'return_value' => 'yes',
                'default'      => 'yes',
            )
        );

        $this->add_control(
            'show_badge',
            array(
                'label'        => __('Show Badge', 'woocommerce'),
                'type'         => Controls_Manager::SWITCHER,
                'label_on'     => __('Yes', 'woocommerce'),
                'label_off'    => __('No', 'woocommerce'),
                'return_value' => 'yes',
                'default'      => 'yes',
            )
        );

        $this->add_control(
            'category_label',
            array(
                'label'       => __('Category Title', 'woocommerce'),
                'type'        => Controls_Manager::TEXT,
                'default'     => '',
                'placeholder' => __('Leave empty to show product categories', 'woocommerce'),
                'dynamic'     => array(
                    'active' => true,
                ),
                'description' => __('Use a dynamic tag or custom text for the category line above the product title.', 'woocommerce'),
            )
        );

        $this->end_controls_section();
    }

    private function register_pagination_controls() {
        $this->start_controls_section(
            'section_pagination',
            array(
                'label' => __('Pagination', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_CONTENT,
            )
        );

        $this->add_control(
            'pagination',
            array(
                'label'   => __('Pagination', 'woocommerce'),
                'type'    => Controls_Manager::SELECT,
                'default' => 'numbers',
                'options' => array(
                    'none'     => __('None', 'woocommerce'),
                    'numbers'  => __('Numbers', 'woocommerce'),
                    'loadmore' => __('Load More', 'woocommerce'),
                ),
            )
        );

        $this->add_control(
            'page_limit',
            array(
                'label'   => __('Page Limit', 'woocommerce'),
                'type'    => Controls_Manager::NUMBER,
                'default' => 5,
                'min'     => 1,
                'max'     => 100,
                'step'    => 1,
            )
        );

        $this->add_control(
            'shorten',
            array(
                'label'        => __('Shorten', 'woocommerce'),
                'type'         => Controls_Manager::SWITCHER,
                'label_on'     => __('Yes', 'woocommerce'),
                'label_off'    => __('No', 'woocommerce'),
                'return_value' => 'yes',
                'default'      => '',
            )
        );

        $this->add_control(
            'pagination_alignment',
            array(
                'label'   => __('Alignment', 'woocommerce'),
                'type'    => Controls_Manager::CHOOSE,
                'default' => 'center',
                'options' => array(
                    'start' => array(
                        'title' => __('Left', 'woocommerce'),
                        'icon'  => 'eicon-text-align-left',
                    ),
                    'center' => array(
                        'title' => __('Center', 'woocommerce'),
                        'icon'  => 'eicon-text-align-center',
                    ),
                    'end' => array(
                        'title' => __('Right', 'woocommerce'),
                        'icon'  => 'eicon-text-align-right',
                    ),
                ),
                'toggle' => false,
            )
        );

        $this->add_control(
            'load_type',
            array(
                'label'   => __('Load Type', 'woocommerce'),
                'type'    => Controls_Manager::SELECT,
                'default' => 'page_reload',
                'options' => array(
                    'page_reload' => __('Page Reload', 'woocommerce'),
                    'load_more'   => __('Load More', 'woocommerce'),
                ),
            )
        );

        $this->add_control(
            'individual_pagination',
            array(
                'label'        => __('Individual Pagination', 'woocommerce'),
                'type'         => Controls_Manager::SWITCHER,
                'label_on'     => __('On', 'woocommerce'),
                'label_off'    => __('Off', 'woocommerce'),
                'return_value' => 'yes',
                'default'      => '',
                'description'  => __('Useful when multiple widgets are on the same page.', 'woocommerce'),
            )
        );

        $this->end_controls_section();
    }

    private function register_style_controls() {
        $this->start_controls_section(
            'section_card',
            array(
                'label' => __('Card', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'card_bg_color',
            array(
                'label'     => __('Background', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => 'transparent',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__card' => 'background-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'card_border_color',
            array(
                'label'     => __('Border Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => 'transparent',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__card' => 'border-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'card_border_width',
            array(
                'label'      => __('Border Width', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 10,
                    ),
                ),
                'default' => array(
                    'size' => 0,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__card' => 'border-width: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_responsive_control(
            'card_radius',
            array(
                'label'      => __('Border Radius', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 40,
                    ),
                ),
                'default' => array(
                    'size' => 16,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__card' => 'border-radius: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_responsive_control(
            'card_padding',
            array(
                'label'      => __('Padding', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 30,
                    ),
                ),
                'default' => array(
                    'size' => 0,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__card' => 'padding: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_control(
            'card_shadow',
            array(
                'label'     => __('Shadow', 'woocommerce'),
                'type'      => Controls_Manager::TEXT,
                'default'   => 'none',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__card' => 'box-shadow: {{VALUE}};',
                ),
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_image',
            array(
                'label' => __('Icon / Image', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'image_bg_color',
            array(
                'label'     => __('Image Background', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#f4f5f8',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__image-link' => 'background-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'image_border_color',
            array(
                'label'     => __('Image Border Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => 'transparent',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__image-link' => 'border-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'image_border_width',
            array(
                'label'      => __('Image Border Width', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 10,
                    ),
                ),
                'default' => array(
                    'size' => 0,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__image-link' => 'border-width: {{SIZE}}{{UNIT}}; border-style: solid;',
                ),
            )
        );

        $this->add_responsive_control(
            'image_radius',
            array(
                'label'      => __('Border Radius', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 40,
                    ),
                ),
                'default' => array(
                    'size' => 14,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__image-link' => 'border-radius: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_badge',
            array(
                'label' => __('Badge', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'badge_sale_bg',
            array(
                'label'     => __('Sale Badge Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#3ec67b',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__badge.is-sale' => 'background-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'badge_featured_bg',
            array(
                'label'     => __('Popular Badge Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#b85dff',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__badge.is-featured' => 'background-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'badge_text_color',
            array(
                'label'     => __('Text Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#ffffff',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__badge' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name'     => 'badge_typography',
                'selector' => '{{WRAPPER}} .nevari-products-widget__badge',
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_title',
            array(
                'label' => __('Typography', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'title_color',
            array(
                'label'     => __('Title Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#243553',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__title' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'title_hover_color',
            array(
                'label'     => __('Title Hover Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#0b2d66',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__title a:hover' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name'     => 'title_typography',
                'selector' => '{{WRAPPER}} .nevari-products-widget__title',
            )
        );

        $this->add_control(
            'category_color',
            array(
                'label'     => __('Category Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#5ca7e0',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__categories' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'category_hover_color',
            array(
                'label'     => __('Category Hover Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#2172b8',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__categories a:hover' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name'     => 'category_typography',
                'selector' => '{{WRAPPER}} .nevari-products-widget__categories',
            )
        );

        $this->add_control(
            'quantity_color',
            array(
                'label'     => __('Quantity Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#8e8792',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__quantity' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name'     => 'quantity_typography',
                'selector' => '{{WRAPPER}} .nevari-products-widget__quantity',
            )
        );

        $this->add_control(
            'price_color',
            array(
                'label'     => __('Price Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#f2991c',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__price' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name'     => 'price_typography',
                'selector' => '{{WRAPPER}} .nevari-products-widget__price',
            )
        );

        $this->add_responsive_control(
            'title_spacing',
            array(
                'label'      => __('Title Spacing', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 20,
                    ),
                ),
                'default' => array(
                    'size' => 4,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__body' => 'gap: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_button',
            array(
                'label' => __('Button', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'button_text',
            array(
                'label'   => __('Button Label', 'woocommerce'),
                'type'    => Controls_Manager::TEXT,
                'default' => __('Select Options', 'woocommerce'),
            )
        );

        $this->add_control(
            'button_icon_type',
            array(
                'label'   => __('Icon', 'woocommerce'),
                'type'    => Controls_Manager::SELECT,
                'default' => 'bag',
                'options' => array(
                    'bag'    => __('Bag', 'woocommerce'),
                    'cart'   => __('Cart', 'woocommerce'),
                    'arrow'  => __('Arrow', 'woocommerce'),
                    'plus'   => __('Plus', 'woocommerce'),
                    'custom' => __('Custom Image', 'woocommerce'),
                ),
            )
        );

        $this->add_control(
            'button_custom_icon',
            array(
                'label'     => __('Custom Icon', 'woocommerce'),
                'type'      => Controls_Manager::MEDIA,
                'condition' => array(
                    'button_icon_type' => 'custom',
                ),
            )
        );

        $this->add_control(
            'button_icon_position',
            array(
                'label'   => __('Icon Position', 'woocommerce'),
                'type'    => Controls_Manager::SELECT,
                'default' => 'right',
                'options' => array(
                    'left'  => __('Left', 'woocommerce'),
                    'right' => __('Right', 'woocommerce'),
                ),
            )
        );

        $this->add_control(
            'button_bg_color',
            array(
                'label'     => __('Background', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#0b2d66',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'background-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'button_text_color',
            array(
                'label'     => __('Text Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#ffffff',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'button_hover_bg_color',
            array(
                'label'     => __('Hover Background', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#143b7d',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button:hover' => 'background-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'button_hover_text_color',
            array(
                'label'     => __('Hover Text Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#ffffff',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button:hover' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'button_border_color',
            array(
                'label'     => __('Border Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => 'transparent',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'border-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'button_border_width',
            array(
                'label'      => __('Border Width', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 8,
                    ),
                ),
                'default' => array(
                    'size' => 0,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'border-width: {{SIZE}}{{UNIT}}; border-style: solid;',
                ),
            )
        );

        $this->add_responsive_control(
            'button_radius',
            array(
                'label'      => __('Border Radius', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 999,
                    ),
                ),
                'default' => array(
                    'size' => 999,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'border-radius: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_responsive_control(
            'button_width',
            array(
                'label'      => __('Button Width', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px', '%'),
                'range'      => array(
                    'px' => array(
                        'min' => 80,
                        'max' => 500,
                    ),
                    '%' => array(
                        'min' => 20,
                        'max' => 100,
                    ),
                ),
                'default' => array(
                    'size' => 100,
                    'unit' => '%',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'width: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_responsive_control(
            'button_height',
            array(
                'label'      => __('Button Height', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 32,
                        'max' => 120,
                    ),
                ),
                'default' => array(
                    'size' => 46,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'height: {{SIZE}}{{UNIT}}; min-height: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name'     => 'button_typography',
                'selector' => '{{WRAPPER}} .nevari-products-widget__button',
            )
        );

        $this->add_responsive_control(
            'button_padding_x',
            array(
                'label'      => __('Horizontal Padding', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 40,
                    ),
                ),
                'default' => array(
                    'size' => 18,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'padding-left: {{SIZE}}{{UNIT}}; padding-right: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_responsive_control(
            'button_padding_y',
            array(
                'label'      => __('Vertical Padding', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 26,
                    ),
                ),
                'default' => array(
                    'size' => 12,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'padding-top: {{SIZE}}{{UNIT}}; padding-bottom: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_responsive_control(
            'button_icon_size',
            array(
                'label'      => __('Icon Size', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 10,
                        'max' => 28,
                    ),
                ),
                'default' => array(
                    'size' => 16,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button-icon' => 'width: {{SIZE}}{{UNIT}}; height: {{SIZE}}{{UNIT}}; flex-basis: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->add_responsive_control(
            'button_icon_gap',
            array(
                'label'      => __('Icon Gap', 'woocommerce'),
                'type'       => Controls_Manager::SLIDER,
                'size_units' => array('px'),
                'range'      => array(
                    'px' => array(
                        'min' => 0,
                        'max' => 24,
                    ),
                ),
                'default' => array(
                    'size' => 8,
                    'unit' => 'px',
                ),
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__button' => 'gap: {{SIZE}}{{UNIT}};',
                ),
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_pagination_style',
            array(
                'label' => __('Pagination', 'woocommerce'),
                'tab'   => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'pagination_color',
            array(
                'label'     => __('Text Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#19386f',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__pagination .page-numbers, {{WRAPPER}} .nevari-products-widget__load-more' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'pagination_active_bg',
            array(
                'label'     => __('Active Background', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#0b2d66',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__pagination .page-numbers.current' => 'background-color: {{VALUE}}; border-color: {{VALUE}};',
                ),
            )
        );

        $this->add_control(
            'pagination_active_color',
            array(
                'label'     => __('Active Text Color', 'woocommerce'),
                'type'      => Controls_Manager::COLOR,
                'default'   => '#ffffff',
                'selectors' => array(
                    '{{WRAPPER}} .nevari-products-widget__pagination .page-numbers.current' => 'color: {{VALUE}};',
                ),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name'     => 'pagination_typography',
                'selector' => '{{WRAPPER}} .nevari-products-widget__pagination .page-numbers, {{WRAPPER}} .nevari-products-widget__load-more',
            )
        );

        $this->end_controls_section();
    }

    protected function render() {
        if (!function_exists('WC') || !WC()) {
            return;
        }

        $settings = $this->get_settings_for_display();
        $query    = $this->get_products_query($settings);

        if (!$query || !$query->have_posts()) {
            echo '<div class="nevari-products-widget"><p>' . esc_html__('No products found.', 'woocommerce') . '</p></div>';
            return;
        }

        $pagination_mode = isset($settings['pagination']) ? $settings['pagination'] : 'numbers';
        $alignment       = isset($settings['pagination_alignment']) ? $settings['pagination_alignment'] : 'center';
        $button_label    = !empty($settings['button_text']) ? $settings['button_text'] : __('Select Options', 'woocommerce');
        $button_icon     = isset($settings['button_icon_type']) ? $settings['button_icon_type'] : 'bag';
        $button_icon_url = !empty($settings['button_custom_icon']['url']) ? $settings['button_custom_icon']['url'] : '';
        $category_label  = isset($settings['category_label']) ? trim((string) $settings['category_label']) : '';
        ?>
        <div class="nevari-products-widget">
            <div class="nevari-products-widget__grid">
                <?php
                while ($query->have_posts()) :
                    $query->the_post();
                    $product = wc_get_product(get_the_ID());

                    if (!$product instanceof WC_Product) {
                        continue;
                    }

                    $image_url = get_the_post_thumbnail_url($product->get_id(), 'woocommerce_thumbnail');
                    $categories = get_the_terms($product->get_id(), 'product_cat');
                    $badges = $this->get_product_badges($product, $settings);
                    $stock_quantity = $product->get_stock_quantity();
                    ?>
                    <article class="nevari-products-widget__card">
                        <a class="nevari-products-widget__image-link" href="<?php echo esc_url(get_permalink($product->get_id())); ?>">
                            <?php if (!empty($badges)) : ?>
                                <span class="nevari-products-widget__badge <?php echo esc_attr($badges['class']); ?>">
                                    <?php echo esc_html($badges['label']); ?>
                                </span>
                            <?php endif; ?>

                            <?php if (!empty($image_url)) : ?>
                                <?php echo wp_kses_post($product->get_image('woocommerce_thumbnail', array('loading' => 'lazy'))); ?>
                            <?php else : ?>
                                <?php echo wc_placeholder_img('woocommerce_thumbnail'); ?>
                            <?php endif; ?>
                        </a>

                        <div class="nevari-products-widget__body">
                            <?php if ('' !== $category_label) : ?>
                                <div class="nevari-products-widget__categories">
                                    <?php echo esc_html($category_label); ?>
                                </div>
                            <?php elseif (!empty($categories) && !is_wp_error($categories)) : ?>
                                <div class="nevari-products-widget__categories">
                                    <?php
                                    $category_links = array();
                                    foreach ($categories as $category) {
                                        $category_links[] = sprintf(
                                            '<a href="%1$s">%2$s</a>',
                                            esc_url(get_term_link($category)),
                                            esc_html($category->name)
                                        );
                                    }
                                    echo wp_kses_post(implode(', ', $category_links));
                                    ?>
                                </div>
                            <?php endif; ?>

                            <h3 class="nevari-products-widget__title">
                                <a href="<?php echo esc_url(get_permalink($product->get_id())); ?>">
                                    <?php echo esc_html($product->get_name()); ?>
                                </a>
                            </h3>

                            <?php if (!empty($settings['show_quantity'])) : ?>
                                <div class="nevari-products-widget__quantity">
                                    <?php
                                    echo esc_html(
                                        sprintf(
                                            __('Quantity: %s', 'woocommerce'),
                                            null !== $stock_quantity ? (string) $stock_quantity : __('In stock', 'woocommerce')
                                        )
                                    );
                                    ?>
                                </div>
                            <?php endif; ?>

                            <div class="nevari-products-widget__price">
                                <?php echo wp_kses_post($product->get_price_html()); ?>
                            </div>
                        </div>

                        <a class="nevari-products-widget__button" href="<?php echo esc_url(get_permalink($product->get_id())); ?>">
                            <?php if ('left' === $settings['button_icon_position']) : ?>
                                <?php echo $this->render_button_icon($button_icon, $button_icon_url); ?>
                            <?php endif; ?>
                            <span class="nevari-products-widget__button-label"><?php echo esc_html($button_label); ?></span>
                            <?php if ('right' === $settings['button_icon_position']) : ?>
                                <?php echo $this->render_button_icon($button_icon, $button_icon_url); ?>
                            <?php endif; ?>
                        </a>
                    </article>
                <?php endwhile; ?>
            </div>

            <?php echo wp_kses_post($this->render_pagination($query, $settings, $alignment, $pagination_mode)); ?>
        </div>
        <?php

        wp_reset_postdata();
    }

    protected function get_current_page($settings) {
        if (!empty($settings['individual_pagination'])) {
            $query_var = 'nevari_products_page_' . $this->get_id();
            $page      = isset($_GET[$query_var]) ? absint(wp_unslash($_GET[$query_var])) : 1;

            return max(1, $page);
        }

        $paged = get_query_var('paged');

        if (!$paged) {
            $paged = isset($_GET['paged']) ? absint(wp_unslash($_GET['paged'])) : 1;
        }

        return max(1, $paged);
    }

    protected function get_products_per_page($settings) {
        if (!empty($settings['items_limit'])) {
            return max(1, absint($settings['items_limit']));
        }

        if (!empty($settings['page_limit'])) {
            return max(1, absint($settings['page_limit']));
        }

        return 5;
    }

    protected function get_products_query($settings) {
        $posts_per_page = $this->get_products_per_page($settings);
        $paged          = $this->get_current_page($settings);
        $source         = isset($settings['source']) ? $settings['source'] : 'latest';
        $orderby        = isset($settings['orderby']) ? $settings['orderby'] : 'date';
        $order          = isset($settings['order']) ? $settings['order'] : 'DESC';

        $args = array(
            'post_type'           => 'product',
            'post_status'         => 'publish',
            'ignore_sticky_posts'  => true,
            'posts_per_page'      => $posts_per_page,
            'paged'               => $paged,
            'orderby'             => $orderby,
            'order'               => $order,
            'no_found_rows'       => false,
        );

        if ('price' === $orderby) {
            $args['meta_key'] = '_price';
            $args['orderby']  = 'meta_value_num';
        }

        if ('current_search' === $source) {
            if (!$this->apply_current_search_context($args)) {
                return new WP_Query($this->get_empty_query_args($args));
            }
        }

        if ('current_archive' === $source) {
            if (!$this->apply_current_archive_context($args)) {
                return new WP_Query($this->get_empty_query_args($args));
            }
        }

        if (!empty($settings['author'])) {
            $args['author'] = absint($settings['author']);
        }

        $tax_query = !empty($args['tax_query']) && is_array($args['tax_query']) ? $args['tax_query'] : array();

        if (function_exists('wc_get_product_visibility_term_ids')) {
            $visibility = wc_get_product_visibility_term_ids();
            if (!empty($visibility['exclude-from-catalog'])) {
                $tax_query[] = array(
                    'taxonomy' => 'product_visibility',
                    'field'    => 'term_taxonomy_id',
                    'terms'    => array($visibility['exclude-from-catalog']),
                    'operator' => 'NOT IN',
                );
            }
        }

        if ('featured' === $source) {
            $tax_query[] = array(
                'taxonomy' => 'product_visibility',
                'field'    => 'name',
                'terms'    => array('featured'),
            );
        } elseif ('sale' === $source) {
            $sale_ids = function_exists('wc_get_product_ids_on_sale') ? wc_get_product_ids_on_sale() : array();
            $args['post__in'] = !empty($sale_ids) ? $sale_ids : array(0);
            $args['orderby']  = 'post__in';
        } elseif ('manual' === $source) {
            $product_ids = !empty($settings['product_ids']) && is_array($settings['product_ids']) ? array_map('absint', $settings['product_ids']) : array();
            $args['post__in'] = !empty($product_ids) ? $product_ids : array(0);
            $args['orderby']  = 'post__in';
        } elseif ('category' === $source) {
            $terms = !empty($settings['categories']) && is_array($settings['categories']) ? array_map('absint', $settings['categories']) : array();

            if (!empty($terms)) {
                $tax_query[] = array(
                    'taxonomy' => 'product_cat',
                    'field'    => 'term_id',
                    'terms'    => $terms,
                    'operator' => ('exclude' === $settings['query_relation']) ? 'NOT IN' : 'IN',
                );
            }
        } elseif ('tag' === $source) {
            $terms = !empty($settings['tags']) && is_array($settings['tags']) ? array_map('absint', $settings['tags']) : array();

            if (!empty($terms)) {
                $tax_query[] = array(
                    'taxonomy' => 'product_tag',
                    'field'    => 'term_id',
                    'terms'    => $terms,
                    'operator' => ('exclude' === $settings['query_relation']) ? 'NOT IN' : 'IN',
                );
            }
        }

        if (!empty($tax_query)) {
            if (count($tax_query) > 1) {
                $tax_query['relation'] = 'AND';
            }

            $args['tax_query'] = $tax_query;
        }

        return new WP_Query($args);
    }

    protected function apply_current_search_context(&$args) {
        if (!$this->is_product_search_context()) {
            return false;
        }

        $search_term = get_search_query();

        if (!is_string($search_term) || '' === trim($search_term)) {
            return false;
        }

        $args['s'] = sanitize_text_field(wp_unslash($search_term));
        $args['post_type'] = 'product';

        return true;
    }

    protected function apply_current_archive_context(&$args) {
        if (!is_tax(array('product_cat', 'product_tag'))) {
            return false;
        }

        $queried_object = get_queried_object();

        if (!is_object($queried_object) || empty($queried_object->taxonomy) || empty($queried_object->term_id)) {
            return false;
        }

        if (!in_array($queried_object->taxonomy, array('product_cat', 'product_tag'), true)) {
            return false;
        }

        $args['tax_query'][] = array(
            'taxonomy' => $queried_object->taxonomy,
            'field'    => 'term_id',
            'terms'    => array(absint($queried_object->term_id)),
        );

        return true;
    }

    protected function is_product_search_context() {
        if (!is_search()) {
            return false;
        }

        $query_post_type = get_query_var('post_type');

        if (empty($query_post_type)) {
            return is_post_type_archive('product') || is_tax(array('product_cat', 'product_tag'));
        }

        if (is_array($query_post_type)) {
            return in_array('product', $query_post_type, true);
        }

        return 'product' === $query_post_type;
    }

    protected function get_empty_query_args($args) {
        $args['post__in'] = array(0);
        $args['s'] = '';

        return $args;
    }

    protected function get_product_badges($product, $settings) {
        if (empty($settings['show_badge'])) {
            return array();
        }

        if ($product->is_on_sale()) {
            return array(
                'class' => 'is-sale',
                'label' => __('Sale', 'woocommerce'),
            );
        }

        if ($product->is_featured()) {
            return array(
                'class' => 'is-featured',
                'label' => __('Popular', 'woocommerce'),
            );
        }

        return array();
    }

    protected function render_button_icon($icon_type, $custom_url = '') {
        $icon_type = sanitize_key($icon_type);

        if ('custom' === $icon_type && !empty($custom_url)) {
            return sprintf(
                '<span class="nevari-products-widget__button-icon"><img src="%1$s" alt="" aria-hidden="true"></span>',
                esc_url($custom_url)
            );
        }

        $paths = array(
            'bag' => '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7H20L18.5 20H5.5L4 7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 7V6.2C9 4.43269 10.567 3 12.5 3C14.433 3 16 4.43269 16 6.2V7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
            'cart' => '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 5H5L7 16H18L20 9H6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 20C9.55228 20 10 19.5523 10 19C10 18.4477 9.55228 18 9 18C8.44772 18 8 18.4477 8 19C8 19.5523 8.44772 20 9 20Z" fill="currentColor"/><path d="M17 20C17.5523 20 18 19.5523 18 19C18 18.4477 17.5523 18 17 18C16.4477 18 16 18.4477 16 19C16 19.5523 16.4477 20 17 20Z" fill="currentColor"/></svg>',
            'arrow' => '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M13 6L19 12L13 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            'plus' => '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5V19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M5 12H19" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
        );

        $svg = isset($paths[$icon_type]) ? $paths[$icon_type] : $paths['bag'];

        return '<span class="nevari-products-widget__button-icon">' . $svg . '</span>';
    }

    protected function render_pagination($query, $settings, $alignment, $pagination_mode) {
        if ('none' === $pagination_mode) {
            return '';
        }

        $total_pages = (int) $query->max_num_pages;

        if ($total_pages <= 1) {
            return '';
        }

        $current    = $this->get_current_page($settings);

        if ('loadmore' === $pagination_mode || 'load_more' === $settings['load_type']) {
            $next_page = $current + 1;

            if ($next_page > $total_pages) {
                return '';
            }

            $url = $this->get_page_url($settings, $next_page);

            return sprintf(
                '<div class="nevari-products-widget__pagination is-%1$s"><a class="nevari-products-widget__load-more" href="%2$s">%3$s</a></div>',
                esc_attr($alignment),
                esc_url($url),
                esc_html__('Load More', 'woocommerce')
            );
        }

        $links = paginate_links(
            array(
                'base'      => $this->get_page_url($settings, '%#%'),
                'format'    => '',
                'current'   => $current,
                'total'     => $total_pages,
                'type'      => 'plain',
                'mid_size'  => !empty($settings['shorten']) ? 1 : 2,
                'end_size'  => !empty($settings['shorten']) ? 1 : 2,
                'prev_text' => '&lsaquo;',
                'next_text' => '&rsaquo;',
            )
        );

        if (empty($links)) {
            return '';
        }

        return sprintf(
            '<div class="nevari-products-widget__pagination is-%1$s">%2$s</div>',
            esc_attr($alignment),
            wp_kses_post($links)
        );
    }

    protected function get_page_url($settings, $page) {
        $base_id  = get_queried_object_id();
        $base_url = $base_id ? get_permalink($base_id) : home_url('/');

        if (!empty($settings['individual_pagination'])) {
            $query_var = 'nevari_products_page_' . $this->get_id();
            $base_url  = remove_query_arg($query_var, $base_url);

            if ('%#%' === $page) {
                return add_query_arg($query_var, '%#%', $base_url);
            }

            return add_query_arg($query_var, max(1, absint($page)), $base_url);
        }

        if ('%#%' === $page) {
            return add_query_arg('paged', '%#%', $base_url);
        }

        return add_query_arg('paged', max(1, absint($page)), $base_url);
    }
}
