<?php

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Controls_Manager;
use Elementor\Group_Control_Border;
use Elementor\Group_Control_Box_Shadow;
use Elementor\Group_Control_Typography;
use Elementor\Widget_Base;

/**
 * Nevari Product Reviews — self-contained Elementor widget for the single-product
 * template. Reads WooCommerce product reviews (comments + `rating` meta) directly
 * via native WC functions; does not depend on the product-experience module.
 */
class Nevari_Reviews_Widget extends Widget_Base {

    const STAR_PATH = 'M12 3l2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84-5.4 2.84 1.03-6L3.27 9.35l6.03-.88L12 3z';
    const NONCE_ACTION = 'nevari-reviews-widget';
    const TITLE_META = 'nevari_review_title';

    public function get_name() {
        return 'nevari-product-reviews';
    }

    public function get_title() {
        return __('Nevari Product Reviews', 'woocommerce');
    }

    public function get_icon() {
        return 'eicon-review';
    }

    public function get_categories() {
        return array('nevari');
    }

    public function get_style_depends() {
        return array('nevari-reviews-widget');
    }

    public function get_script_depends() {
        return array('nevari-reviews-widget');
    }

    /* ============================================================
     * Controls
     * ============================================================ */

    protected function register_controls() {
        $this->register_content_controls();
        $this->register_style_controls();
    }

    private function register_content_controls() {
        /* ---- Layout & data ---- */
        $this->start_controls_section('section_data', array(
            'label' => __('Layout & Data', 'woocommerce'),
            'tab' => Controls_Manager::TAB_CONTENT,
        ));

        $this->add_control('product_source', array(
            'label' => __('Product', 'woocommerce'),
            'type' => Controls_Manager::SELECT,
            'default' => 'current',
            'options' => array(
                'current' => __('Current product', 'woocommerce'),
                'manual' => __('Specific product ID', 'woocommerce'),
            ),
        ));

        $this->add_control('product_id', array(
            'label' => __('Product ID', 'woocommerce'),
            'type' => Controls_Manager::NUMBER,
            'condition' => array('product_source' => 'manual'),
        ));

        $this->add_control('heading_text', array(
            'label' => __('Summary Heading', 'woocommerce'),
            'type' => Controls_Manager::TEXT,
            'default' => __('Customer Reviews', 'woocommerce'),
        ));

        $this->add_control('average_template', array(
            'label' => __('Average Line', 'woocommerce'),
            'type' => Controls_Manager::TEXT,
            'default' => __('Average rating: {average} ({total})', 'woocommerce'),
            'description' => __('Use {average} and {total} placeholders.', 'woocommerce'),
        ));

        $this->add_control('reviews_heading_text', array(
            'label' => __('Reviews Heading', 'woocommerce'),
            'type' => Controls_Manager::TEXT,
            'default' => __('Reviews', 'woocommerce'),
        ));

        $this->add_control('per_page', array(
            'label' => __('Reviews Per Page', 'woocommerce'),
            'type' => Controls_Manager::NUMBER,
            'default' => 5,
            'min' => 1,
            'max' => 50,
        ));

        $this->add_control('default_sort', array(
            'label' => __('Default Sort', 'woocommerce'),
            'type' => Controls_Manager::SELECT,
            'default' => 'recent',
            'options' => self::sort_options(),
        ));

        $this->add_control('empty_text', array(
            'label' => __('Empty State Text', 'woocommerce'),
            'type' => Controls_Manager::TEXTAREA,
            'default' => __('No approved reviews yet. Be the first verified buyer to submit one.', 'woocommerce'),
        ));

        $this->end_controls_section();

        /* ---- Elements ---- */
        $this->start_controls_section('section_elements', array(
            'label' => __('Elements', 'woocommerce'),
            'tab' => Controls_Manager::TAB_CONTENT,
        ));

        foreach (array(
            'show_summary' => __('Show Summary Column', 'woocommerce'),
            'show_breakdown' => __('Show Rating Breakdown', 'woocommerce'),
            'show_sort' => __('Show Sort Dropdown', 'woocommerce'),
            'show_title' => __('Show Review Title', 'woocommerce'),
            'show_verified' => __('Show Verified Badge', 'woocommerce'),
            'show_reviewer' => __('Show Reviewer Name', 'woocommerce'),
            'show_date' => __('Show Review Date', 'woocommerce'),
            'show_form' => __('Show Submission Form', 'woocommerce'),
        ) as $key => $label) {
            $this->add_control($key, array(
                'label' => $label,
                'type' => Controls_Manager::SWITCHER,
                'default' => 'yes',
            ));
        }

        $this->end_controls_section();

        /* ---- Sort options ---- */
        $this->start_controls_section('section_sort', array(
            'label' => __('Sort Options', 'woocommerce'),
            'tab' => Controls_Manager::TAB_CONTENT,
            'condition' => array('show_sort' => 'yes'),
        ));

        $this->add_control('sort_options', array(
            'label' => __('Available Sort Orders', 'woocommerce'),
            'type' => Controls_Manager::SELECT2,
            'multiple' => true,
            'default' => array('recent', 'oldest', 'highest', 'lowest'),
            'options' => self::sort_options(),
        ));

        $this->end_controls_section();

        /* ---- Form text ---- */
        $this->start_controls_section('section_form_text', array(
            'label' => __('Form Text', 'woocommerce'),
            'tab' => Controls_Manager::TAB_CONTENT,
            'condition' => array('show_form' => 'yes'),
        ));

        foreach (array(
            'form_heading' => array(__('Form Heading', 'woocommerce'), __('Write a review', 'woocommerce')),
            'form_notice' => array(__('Verified-only Notice', 'woocommerce'), __('Only verified buyers can submit a review.', 'woocommerce')),
            'label_rating' => array(__('Rating Label', 'woocommerce'), __('Your rating', 'woocommerce')),
            'label_title' => array(__('Title Label', 'woocommerce'), __('Review title', 'woocommerce')),
            'label_review' => array(__('Review Label', 'woocommerce'), __('Your review', 'woocommerce')),
            'label_name' => array(__('Name Label', 'woocommerce'), __('Name', 'woocommerce')),
            'label_email' => array(__('Email Label', 'woocommerce'), __('Email', 'woocommerce')),
            'submit_text' => array(__('Submit Button Text', 'woocommerce'), __('Submit review', 'woocommerce')),
            'msg_success' => array(__('Success Message', 'woocommerce'), __('Thanks! Your review has been posted.', 'woocommerce')),
            'msg_pending' => array(__('Pending Message', 'woocommerce'), __('Thanks! Your review is awaiting approval.', 'woocommerce')),
            'msg_not_buyer' => array(__('Not-a-buyer Message', 'woocommerce'), __('Only customers who purchased this product can leave a review.', 'woocommerce')),
        ) as $key => $pair) {
            $this->add_control($key, array(
                'label' => $pair[0],
                'type' => Controls_Manager::TEXT,
                'default' => $pair[1],
                'label_block' => true,
            ));
        }

        $this->end_controls_section();
    }

    private function register_style_controls() {
        /* 1. Container / Card */
        $this->open_style('section_card', __('Container', 'woocommerce'));
        $this->add_control('card_bg', $this->color_ctl(__('Background', 'woocommerce'), '.nevari-reviews__card', 'background-color'));
        $this->add_group_control(Group_Control_Border::get_type(), array('name' => 'card_border', 'selector' => '{{WRAPPER}} .nevari-reviews__card'));
        $this->add_control('card_radius', $this->slider_ctl(__('Border Radius', 'woocommerce'), '.nevari-reviews__card', 'border-radius', 48));
        $this->add_group_control(Group_Control_Box_Shadow::get_type(), array('name' => 'card_shadow', 'selector' => '{{WRAPPER}} .nevari-reviews__card'));
        $this->add_responsive_control('card_padding', $this->dim_ctl(__('Padding', 'woocommerce'), '.nevari-reviews__card', 'padding'));
        $this->end_controls_section();

        /* 2. Columns */
        $this->open_style('section_layout', __('Columns', 'woocommerce'));
        $this->add_responsive_control('columns_gap', array(
            'label' => __('Column Gap', 'woocommerce'),
            'type' => Controls_Manager::SLIDER,
            'range' => array('px' => array('min' => 0, 'max' => 120)),
            'selectors' => array('{{WRAPPER}} .nevari-reviews__inner' => 'gap: {{SIZE}}{{UNIT}};'),
        ));
        $this->add_responsive_control('summary_width', array(
            'label' => __('Summary Column Width', 'woocommerce'),
            'type' => Controls_Manager::SLIDER,
            'range' => array('px' => array('min' => 180, 'max' => 520)),
            'selectors' => array('{{WRAPPER}} .nevari-reviews__inner' => 'grid-template-columns: minmax(0, {{SIZE}}{{UNIT}}) minmax(0, 1fr);'),
        ));
        $this->end_controls_section();

        /* 3. Summary heading */
        $this->open_style('section_heading', __('Summary Heading', 'woocommerce'));
        $this->add_control('heading_color', $this->color_ctl(__('Color', 'woocommerce'), '.nevari-reviews__heading'));
        $this->add_group_control(Group_Control_Typography::get_type(), array('name' => 'heading_typo', 'selector' => '{{WRAPPER}} .nevari-reviews__heading'));
        $this->end_controls_section();

        /* 4. Average line */
        $this->open_style('section_average', __('Average Line', 'woocommerce'));
        $this->add_control('average_color', $this->color_ctl(__('Color', 'woocommerce'), '.nevari-reviews__average'));
        $this->add_group_control(Group_Control_Typography::get_type(), array('name' => 'average_typo', 'selector' => '{{WRAPPER}} .nevari-reviews__average'));
        $this->end_controls_section();

        /* 5. Breakdown */
        $this->open_style('section_breakdown', __('Rating Breakdown', 'woocommerce'));
        $this->add_responsive_control('breakdown_gap', array(
            'label' => __('Row Gap', 'woocommerce'),
            'type' => Controls_Manager::SLIDER,
            'range' => array('px' => array('min' => 4, 'max' => 40)),
            'selectors' => array('{{WRAPPER}} .nevari-reviews__breakdown' => 'gap: {{SIZE}}{{UNIT}};'),
        ));
        $this->add_control('breakdown_label_color', $this->color_ctl(__('Label Color', 'woocommerce'), '.nevari-reviews__breakdown-label'));
        $this->add_control('breakdown_star_color', $this->color_ctl(__('Star Color', 'woocommerce'), '.nevari-reviews__breakdown-star'));
        $this->add_control('bar_track_color', $this->color_ctl(__('Bar Track Color', 'woocommerce'), '.nevari-reviews__bar', 'background-color'));
        $this->add_control('bar_fill_color', $this->color_ctl(__('Bar Fill Color', 'woocommerce'), '.nevari-reviews__bar-fill', 'background-color'));
        $this->add_control('bar_height', $this->slider_ctl(__('Bar Height', 'woocommerce'), '.nevari-reviews__bar', 'height', 24));
        $this->add_control('breakdown_count_color', $this->color_ctl(__('Count Color', 'woocommerce'), '.nevari-reviews__breakdown-count'));
        $this->end_controls_section();

        /* 6. Reviews heading */
        $this->open_style('section_reviews_heading', __('Reviews Heading', 'woocommerce'));
        $this->add_control('reviews_heading_color', $this->color_ctl(__('Color', 'woocommerce'), '.nevari-reviews__reviews-heading'));
        $this->add_group_control(Group_Control_Typography::get_type(), array('name' => 'reviews_heading_typo', 'selector' => '{{WRAPPER}} .nevari-reviews__reviews-heading'));
        $this->end_controls_section();

        /* 7. Sort dropdown */
        $this->open_style('section_sort_style', __('Sort Dropdown', 'woocommerce'));
        $this->add_control('sort_color', array(
            'label' => __('Color', 'woocommerce'),
            'type' => Controls_Manager::COLOR,
            'selectors' => array(
                '{{WRAPPER}} .nevari-reviews__sort-select' => 'color: {{VALUE}};',
                '{{WRAPPER}} .nevari-reviews__sort::after' => 'border-color: {{VALUE}};',
            ),
        ));
        $this->add_group_control(Group_Control_Typography::get_type(), array('name' => 'sort_typo', 'selector' => '{{WRAPPER}} .nevari-reviews__sort-select'));
        $this->end_controls_section();

        /* 8. Review item */
        $this->open_style('section_review_item', __('Review Item', 'woocommerce'));
        $this->add_responsive_control('list_gap', array(
            'label' => __('Spacing Between Reviews', 'woocommerce'),
            'type' => Controls_Manager::SLIDER,
            'range' => array('px' => array('min' => 8, 'max' => 64)),
            'selectors' => array('{{WRAPPER}} .nevari-reviews__list' => 'gap: {{SIZE}}{{UNIT}};'),
        ));
        $this->add_control('item_divider', array(
            'label' => __('Divider', 'woocommerce'),
            'type' => Controls_Manager::COLOR,
            'selectors' => array('{{WRAPPER}} .nevari-reviews__card-item:not(:last-child)' => 'border-bottom: 1px solid {{VALUE}}; padding-bottom: var(--nvr-item-pad, 20px);'),
        ));
        $this->end_controls_section();

        /* 9. Review title */
        $this->open_style('section_review_title', __('Review Title', 'woocommerce'), array('show_title' => 'yes'));
        $this->add_control('review_title_color', $this->color_ctl(__('Color', 'woocommerce'), '.nevari-reviews__title'));
        $this->add_group_control(Group_Control_Typography::get_type(), array('name' => 'review_title_typo', 'selector' => '{{WRAPPER}} .nevari-reviews__title'));
        $this->end_controls_section();

        /* 10. Review stars */
        $this->open_style('section_review_stars', __('Review Stars', 'woocommerce'));
        $this->add_control('star_full_color', array(
            'label' => __('Filled Star Color', 'woocommerce'),
            'type' => Controls_Manager::COLOR,
            'selectors' => array('{{WRAPPER}} .nevari-reviews__star-full' => 'fill: {{VALUE}};'),
        ));
        $this->add_control('star_empty_color', array(
            'label' => __('Empty Star Color', 'woocommerce'),
            'type' => Controls_Manager::COLOR,
            'selectors' => array('{{WRAPPER}} .nevari-reviews__star-empty' => 'fill: {{VALUE}};'),
        ));
        $this->add_control('star_size', array(
            'label' => __('Star Size', 'woocommerce'),
            'type' => Controls_Manager::SLIDER,
            'range' => array('px' => array('min' => 10, 'max' => 40)),
            'selectors' => array('{{WRAPPER}} .nevari-reviews__stars svg' => 'width: {{SIZE}}{{UNIT}}; height: {{SIZE}}{{UNIT}};'),
        ));
        $this->end_controls_section();

        /* 11. Review body */
        $this->open_style('section_review_body', __('Review Body', 'woocommerce'));
        $this->add_control('review_body_color', $this->color_ctl(__('Color', 'woocommerce'), '.nevari-reviews__body'));
        $this->add_group_control(Group_Control_Typography::get_type(), array('name' => 'review_body_typo', 'selector' => '{{WRAPPER}} .nevari-reviews__body'));
        $this->end_controls_section();

        /* 12. Reviewer meta */
        $this->open_style('section_meta', __('Reviewer Meta', 'woocommerce'));
        $this->add_control('meta_color', $this->color_ctl(__('Color', 'woocommerce'), '.nevari-reviews__meta'));
        $this->add_control('author_color', $this->color_ctl(__('Author Color', 'woocommerce'), '.nevari-reviews__author'));
        $this->add_group_control(Group_Control_Typography::get_type(), array('name' => 'meta_typo', 'selector' => '{{WRAPPER}} .nevari-reviews__meta'));
        $this->end_controls_section();

        /* 13. Verified badge */
        $this->open_style('section_verified', __('Verified Badge', 'woocommerce'), array('show_verified' => 'yes'));
        $this->add_control('verified_color', $this->color_ctl(__('Text Color', 'woocommerce'), '.nevari-reviews__verified'));
        $this->add_control('verified_bg', $this->color_ctl(__('Background', 'woocommerce'), '.nevari-reviews__verified', 'background-color'));
        $this->add_control('verified_radius', $this->slider_ctl(__('Radius', 'woocommerce'), '.nevari-reviews__verified', 'border-radius', 999));
        $this->end_controls_section();

        /* 14. Form */
        $this->open_style('section_form_style', __('Submission Form', 'woocommerce'), array('show_form' => 'yes'));
        $this->add_control('form_heading_color', $this->color_ctl(__('Heading Color', 'woocommerce'), '.nevari-reviews__form-heading'));
        $this->add_control('form_label_color', $this->color_ctl(__('Label Color', 'woocommerce'), '.nevari-reviews__label'));
        $this->add_control('input_bg', $this->color_ctl(__('Input Background', 'woocommerce'), '.nevari-reviews__input, {{WRAPPER}} .nevari-reviews__textarea', 'background-color'));
        $this->add_control('input_text_color', $this->color_ctl(__('Input Text Color', 'woocommerce'), '.nevari-reviews__input, {{WRAPPER}} .nevari-reviews__textarea'));
        $this->add_control('input_border_color', array(
            'label' => __('Input Border Color', 'woocommerce'),
            'type' => Controls_Manager::COLOR,
            'selectors' => array('{{WRAPPER}} .nevari-reviews__input, {{WRAPPER}} .nevari-reviews__textarea' => 'border-color: {{VALUE}};'),
        ));
        $this->add_control('input_radius', array(
            'label' => __('Input Radius', 'woocommerce'),
            'type' => Controls_Manager::SLIDER,
            'range' => array('px' => array('min' => 0, 'max' => 30)),
            'selectors' => array('{{WRAPPER}} .nevari-reviews__input, {{WRAPPER}} .nevari-reviews__textarea' => 'border-radius: {{SIZE}}{{UNIT}};'),
        ));
        $this->add_control('form_star_color', array(
            'label' => __('Form Star Color', 'woocommerce'),
            'type' => Controls_Manager::COLOR,
            'selectors' => array('{{WRAPPER}} .nevari-reviews__star-input button.is-active svg, {{WRAPPER}} .nevari-reviews__star-input button.is-hover svg' => 'fill: {{VALUE}};'),
        ));
        $this->add_control('submit_bg', $this->color_ctl(__('Button Background', 'woocommerce'), '.nevari-reviews__submit', 'background-color'));
        $this->add_control('submit_color', $this->color_ctl(__('Button Text Color', 'woocommerce'), '.nevari-reviews__submit'));
        $this->add_control('submit_radius', $this->slider_ctl(__('Button Radius', 'woocommerce'), '.nevari-reviews__submit', 'border-radius', 30));
        $this->add_responsive_control('submit_padding', $this->dim_ctl(__('Button Padding', 'woocommerce'), '.nevari-reviews__submit', 'padding'));
        $this->end_controls_section();

        /* 15. Empty state */
        $this->open_style('section_empty', __('Empty State', 'woocommerce'));
        $this->add_control('empty_color', $this->color_ctl(__('Color', 'woocommerce'), '.nevari-reviews__empty'));
        $this->add_group_control(Group_Control_Typography::get_type(), array('name' => 'empty_typo', 'selector' => '{{WRAPPER}} .nevari-reviews__empty'));
        $this->end_controls_section();

        /* 16. Load more */
        $this->open_style('section_load_more', __('Load More Button', 'woocommerce'));
        $this->add_control('load_more_bg', $this->color_ctl(__('Background', 'woocommerce'), '.nevari-reviews__load-more', 'background-color'));
        $this->add_control('load_more_color', $this->color_ctl(__('Text Color', 'woocommerce'), '.nevari-reviews__load-more'));
        $this->add_control('load_more_radius', $this->slider_ctl(__('Radius', 'woocommerce'), '.nevari-reviews__load-more', 'border-radius', 30));
        $this->end_controls_section();
    }

    /* ---- control helpers ---- */

    private function open_style($id, $label, $condition = array()) {
        $args = array('label' => $label, 'tab' => Controls_Manager::TAB_STYLE);
        if ($condition) {
            $args['condition'] = $condition;
        }
        $this->start_controls_section($id, $args);
    }

    private function color_ctl($label, $selector, $prop = 'color') {
        return array(
            'label' => $label,
            'type' => Controls_Manager::COLOR,
            'selectors' => array('{{WRAPPER}} ' . $selector => $prop . ': {{VALUE}};'),
        );
    }

    private function slider_ctl($label, $selector, $prop, $max) {
        return array(
            'label' => $label,
            'type' => Controls_Manager::SLIDER,
            'range' => array('px' => array('min' => 0, 'max' => $max)),
            'selectors' => array('{{WRAPPER}} ' . $selector => $prop . ': {{SIZE}}{{UNIT}};'),
        );
    }

    private function dim_ctl($label, $selector, $prop) {
        return array(
            'label' => $label,
            'type' => Controls_Manager::DIMENSIONS,
            'size_units' => array('px', '%', 'em'),
            'selectors' => array('{{WRAPPER}} ' . $selector => $prop . ': {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'),
        );
    }

    private static function sort_options() {
        return array(
            'recent' => __('Recent', 'woocommerce'),
            'oldest' => __('Oldest', 'woocommerce'),
            'highest' => __('Highest rated', 'woocommerce'),
            'lowest' => __('Lowest rated', 'woocommerce'),
        );
    }

    /* ============================================================
     * Data layer (self-contained; native WooCommerce only)
     * ============================================================ */

    private static function resolve_product_id(array $settings = array()) {
        if (!empty($settings['product_source']) && 'manual' === $settings['product_source'] && !empty($settings['product_id'])) {
            $product = function_exists('wc_get_product') ? wc_get_product((int) $settings['product_id']) : null;
            return $product ? (int) $product->get_id() : 0;
        }
        $id = get_the_ID();
        if ($id && 'product' === get_post_type($id)) {
            return (int) $id;
        }
        return 0;
    }

    public static function get_stats($product_id) {
        $product = function_exists('wc_get_product') ? wc_get_product($product_id) : null;
        $distribution = array(5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0);
        $total = 0;
        $average = 0.0;

        if ($product) {
            $counts = $product->get_rating_counts();
            if (is_array($counts)) {
                foreach ($counts as $star => $count) {
                    $star = (int) $star;
                    if (isset($distribution[$star])) {
                        $distribution[$star] = (int) $count;
                        $total += (int) $count;
                    }
                }
            }
            $average = (float) $product->get_average_rating();
            $review_count = (int) $product->get_review_count();
            if ($review_count > $total) {
                $total = $review_count;
            }
        }

        return array('total' => $total, 'average' => $average, 'distribution' => $distribution);
    }

    private static function get_reviews($product_id, $sort, $page, $per_page) {
        $args = array(
            'post_id' => (int) $product_id,
            'status' => 'approve',
            'parent' => 0,
            'number' => (int) $per_page,
            'offset' => max(0, ((int) $page - 1) * (int) $per_page),
        );

        switch ($sort) {
            case 'oldest':
                $args['orderby'] = 'comment_date_gmt';
                $args['order'] = 'ASC';
                break;
            case 'highest':
                $args['meta_key'] = 'rating';
                $args['orderby'] = array('meta_value_num' => 'DESC', 'comment_date_gmt' => 'DESC');
                break;
            case 'lowest':
                $args['meta_key'] = 'rating';
                $args['orderby'] = array('meta_value_num' => 'ASC', 'comment_date_gmt' => 'DESC');
                break;
            case 'recent':
            default:
                $args['orderby'] = 'comment_date_gmt';
                $args['order'] = 'DESC';
                break;
        }

        $comments = get_comments($args);
        $reviews = array();
        foreach ($comments as $comment) {
            $rating = (int) get_comment_meta($comment->comment_ID, 'rating', true);
            $reviews[] = array(
                'author' => (string) $comment->comment_author,
                'date' => get_comment_date(get_option('date_format'), $comment->comment_ID),
                'rating' => max(0, min(5, $rating)),
                'title' => (string) get_comment_meta($comment->comment_ID, self::TITLE_META, true),
                'body' => (string) $comment->comment_content,
                'verified' => function_exists('wc_review_is_from_verified_owner') ? (bool) wc_review_is_from_verified_owner($comment->comment_ID) : false,
            );
        }
        return $reviews;
    }

    /* ---- markup helpers ---- */

    private static function star_svg($class) {
        return '<svg class="' . esc_attr($class) . '" viewBox="0 0 24 24" aria-hidden="true"><path d="' . self::STAR_PATH . '"/></svg>';
    }

    private static function render_star_row($rating) {
        $rating = (int) $rating;
        $out = '';
        for ($i = 1; $i <= 5; $i++) {
            $out .= self::star_svg($i <= $rating ? 'nevari-reviews__star-full' : 'nevari-reviews__star-empty');
        }
        return $out;
    }

    private static function default_display_opts() {
        return array(
            'show_title' => true,
            'show_verified' => true,
            'show_reviewer' => true,
            'show_date' => true,
        );
    }

    public static function render_reviews_list_html($product_id, $sort, $page, $per_page, array $opts, $empty_text = '') {
        $reviews = self::get_reviews($product_id, $sort, $page, $per_page);
        if (empty($reviews)) {
            if ($page > 1) {
                return '';
            }
            return '<p class="nevari-reviews__empty">' . esc_html($empty_text) . '</p>';
        }

        ob_start();
        foreach ($reviews as $review) {
            ?>
            <article class="nevari-reviews__card-item">
                <?php if (!empty($opts['show_title']) && '' !== $review['title']) : ?>
                    <h3 class="nevari-reviews__title"><?php echo esc_html($review['title']); ?></h3>
                <?php endif; ?>
                <div class="nevari-reviews__stars" aria-label="<?php echo esc_attr(sprintf(__('Rated %d out of 5', 'woocommerce'), $review['rating'])); ?>">
                    <?php echo self::render_star_row($review['rating']); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                </div>
                <p class="nevari-reviews__body"><?php echo esc_html($review['body']); ?></p>
                <?php if (!empty($opts['show_reviewer']) || !empty($opts['show_date']) || (!empty($opts['show_verified']) && $review['verified'])) : ?>
                    <div class="nevari-reviews__meta">
                        <?php if (!empty($opts['show_reviewer']) && '' !== $review['author']) : ?>
                            <span class="nevari-reviews__author"><?php echo esc_html($review['author']); ?></span>
                        <?php endif; ?>
                        <?php if (!empty($opts['show_verified']) && $review['verified']) : ?>
                            <span class="nevari-reviews__verified">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.55 17.3l-4.4-4.4 1.4-1.4 3 3 7.9-7.9 1.4 1.4z"/></svg><?php echo esc_html__('Verified', 'woocommerce'); ?>
                            </span>
                        <?php endif; ?>
                        <?php if (!empty($opts['show_date']) && '' !== $review['date']) : ?>
                            <span class="nevari-reviews__date"><?php echo esc_html($review['date']); ?></span>
                        <?php endif; ?>
                    </div>
                <?php endif; ?>
            </article>
            <?php
        }
        return ob_get_clean();
    }

    /* ============================================================
     * Render
     * ============================================================ */

    protected function render() {
        $settings = $this->get_settings_for_display();
        $product_id = self::resolve_product_id($settings);

        if (!$product_id) {
            if (\Elementor\Plugin::$instance->editor->is_edit_mode()) {
                echo '<div class="nevari-reviews"><div class="nevari-reviews__card"><p class="nevari-reviews__empty">' . esc_html__('Place this widget on a single-product template, or set a specific Product ID.', 'woocommerce') . '</p></div></div>';
            }
            return;
        }

        $stats = self::get_stats($product_id);
        $per_page = max(1, (int) ($settings['per_page'] ?? 5));
        $default_sort = !empty($settings['default_sort']) ? $settings['default_sort'] : 'recent';
        $sort_options = !empty($settings['sort_options']) && is_array($settings['sort_options']) ? $settings['sort_options'] : array('recent');
        $all_sorts = self::sort_options();

        $opts = array(
            'show_title' => 'yes' === ($settings['show_title'] ?? 'yes'),
            'show_verified' => 'yes' === ($settings['show_verified'] ?? 'yes'),
            'show_reviewer' => 'yes' === ($settings['show_reviewer'] ?? 'yes'),
            'show_date' => 'yes' === ($settings['show_date'] ?? 'yes'),
        );

        $average_line = str_replace(
            array('{average}', '{total}'),
            array(number_format_i18n($stats['average'], 1), number_format_i18n($stats['total'])),
            (string) ($settings['average_template'] ?? '')
        );

        wp_enqueue_script('nevari-reviews-widget');
        wp_localize_script('nevari-reviews-widget', 'NevariReviews', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce(self::NONCE_ACTION),
        ));

        $config = wp_json_encode(array(
            'productId' => $product_id,
            'perPage' => $per_page,
            'sort' => $default_sort,
            'opts' => $opts,
            'emptyText' => (string) ($settings['empty_text'] ?? ''),
            'messages' => array(
                'success' => (string) ($settings['msg_success'] ?? ''),
                'pending' => (string) ($settings['msg_pending'] ?? ''),
                'notBuyer' => (string) ($settings['msg_not_buyer'] ?? ''),
                'error' => __('Something went wrong. Please try again.', 'woocommerce'),
            ),
        ));
        ?>
        <div class="nevari-reviews" data-nevari-reviews="<?php echo esc_attr($config); ?>">
            <div class="nevari-reviews__card">
                <div class="nevari-reviews__inner">
                    <?php if ('yes' === ($settings['show_summary'] ?? 'yes')) : ?>
                        <aside class="nevari-reviews__summary">
                            <h2 class="nevari-reviews__heading"><?php echo esc_html($settings['heading_text'] ?? ''); ?></h2>
                            <p class="nevari-reviews__average"><?php echo esc_html($average_line); ?></p>
                            <?php if ('yes' === ($settings['show_breakdown'] ?? 'yes')) : ?>
                                <div class="nevari-reviews__breakdown">
                                    <?php
                                    $total = max(1, (int) $stats['total']);
                                    for ($star = 5; $star >= 1; $star--) :
                                        $count = (int) $stats['distribution'][$star];
                                        $pct = max(0, min(100, round(($count / $total) * 100)));
                                        ?>
                                        <div class="nevari-reviews__breakdown-row">
                                            <span class="nevari-reviews__breakdown-label"><?php echo esc_html($star); ?></span>
                                            <span class="nevari-reviews__breakdown-star"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="<?php echo esc_attr(self::STAR_PATH); ?>"/></svg></span>
                                            <span class="nevari-reviews__bar"><span class="nevari-reviews__bar-fill" style="width: <?php echo esc_attr($pct); ?>%;"></span></span>
                                            <span class="nevari-reviews__breakdown-count"><?php echo esc_html(number_format_i18n($count)); ?></span>
                                        </div>
                                    <?php endfor; ?>
                                </div>
                            <?php endif; ?>
                        </aside>
                    <?php endif; ?>

                    <div class="nevari-reviews__main">
                        <div class="nevari-reviews__main-head">
                            <h2 class="nevari-reviews__reviews-heading"><?php echo esc_html($settings['reviews_heading_text'] ?? ''); ?></h2>
                            <?php if ('yes' === ($settings['show_sort'] ?? 'yes')) : ?>
                                <div class="nevari-reviews__sort">
                                    <select class="nevari-reviews__sort-select" data-nevari-reviews-sort aria-label="<?php echo esc_attr__('Sort reviews', 'woocommerce'); ?>">
                                        <?php foreach ($sort_options as $sort_key) :
                                            if (!isset($all_sorts[$sort_key])) {
                                                continue;
                                            } ?>
                                            <option value="<?php echo esc_attr($sort_key); ?>" <?php selected($default_sort, $sort_key); ?>><?php echo esc_html($all_sorts[$sort_key]); ?></option>
                                        <?php endforeach; ?>
                                    </select>
                                </div>
                            <?php endif; ?>
                        </div>

                        <div class="nevari-reviews__list" data-nevari-reviews-list>
                            <?php echo self::render_reviews_list_html($product_id, $default_sort, 1, $per_page, $opts, (string) ($settings['empty_text'] ?? '')); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
                        </div>

                        <?php if ((int) $stats['total'] > $per_page) : ?>
                            <button type="button" class="nevari-reviews__load-more" data-nevari-reviews-load-more><?php echo esc_html__('Load more reviews', 'woocommerce'); ?></button>
                        <?php endif; ?>

                        <?php if ('yes' === ($settings['show_form'] ?? 'yes')) : ?>
                            <?php $this->render_form($settings, $product_id); ?>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }

    private function render_form(array $settings, $product_id) {
        $is_logged_in = is_user_logged_in();
        ?>
        <div class="nevari-reviews__form-wrap">
            <h3 class="nevari-reviews__form-heading"><?php echo esc_html($settings['form_heading'] ?? ''); ?></h3>
            <?php if ('' !== ($settings['form_notice'] ?? '')) : ?>
                <p class="nevari-reviews__form-notice"><?php echo esc_html($settings['form_notice']); ?></p>
            <?php endif; ?>
            <div class="nevari-reviews__message" hidden></div>
            <form class="nevari-reviews__form" data-nevari-reviews-form>
                <input type="hidden" name="product_id" value="<?php echo esc_attr($product_id); ?>" />
                <div class="nevari-reviews__field">
                    <span class="nevari-reviews__label"><?php echo esc_html($settings['label_rating'] ?? ''); ?></span>
                    <div class="nevari-reviews__star-input" data-nevari-reviews-star-input>
                        <?php for ($i = 1; $i <= 5; $i++) : ?>
                            <button type="button" data-value="<?php echo esc_attr($i); ?>" aria-label="<?php echo esc_attr(sprintf(_n('%d star', '%d stars', $i, 'woocommerce'), $i)); ?>"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="<?php echo esc_attr(self::STAR_PATH); ?>"/></svg></button>
                        <?php endfor; ?>
                    </div>
                    <input type="hidden" name="rating" value="0" data-nevari-reviews-rating />
                </div>
                <label class="nevari-reviews__field">
                    <span class="nevari-reviews__label"><?php echo esc_html($settings['label_title'] ?? ''); ?></span>
                    <input class="nevari-reviews__input" type="text" name="title" maxlength="120" />
                </label>
                <?php if (!$is_logged_in) : ?>
                    <label class="nevari-reviews__field">
                        <span class="nevari-reviews__label"><?php echo esc_html($settings['label_name'] ?? ''); ?></span>
                        <input class="nevari-reviews__input" type="text" name="author" required />
                    </label>
                    <label class="nevari-reviews__field">
                        <span class="nevari-reviews__label"><?php echo esc_html($settings['label_email'] ?? ''); ?></span>
                        <input class="nevari-reviews__input" type="email" name="email" required />
                    </label>
                <?php endif; ?>
                <label class="nevari-reviews__field">
                    <span class="nevari-reviews__label"><?php echo esc_html($settings['label_review'] ?? ''); ?></span>
                    <textarea class="nevari-reviews__textarea" name="review" required></textarea>
                </label>
                <button type="submit" class="nevari-reviews__submit"><?php echo esc_html($settings['submit_text'] ?? ''); ?></button>
            </form>
        </div>
        <?php
    }

    /* ============================================================
     * AJAX
     * ============================================================ */

    public static function ajax_fetch_reviews() {
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $product_id = isset($_POST['product_id']) ? absint($_POST['product_id']) : 0;
        $sort = isset($_POST['sort']) ? sanitize_key(wp_unslash($_POST['sort'])) : 'recent';
        $page = isset($_POST['page']) ? max(1, absint($_POST['page'])) : 1;
        $per_page = isset($_POST['per_page']) ? min(50, max(1, absint($_POST['per_page']))) : 5;
        $empty_text = isset($_POST['empty_text']) ? sanitize_text_field(wp_unslash($_POST['empty_text'])) : '';

        if (!$product_id || 'product' !== get_post_type($product_id)) {
            wp_send_json_error(array('message' => __('Invalid product.', 'woocommerce')), 400);
        }

        $allowed_sorts = array('recent', 'oldest', 'highest', 'lowest');
        if (!in_array($sort, $allowed_sorts, true)) {
            $sort = 'recent';
        }

        $opts = array(
            'show_title' => empty($_POST['hide_title']),
            'show_verified' => empty($_POST['hide_verified']),
            'show_reviewer' => empty($_POST['hide_reviewer']),
            'show_date' => empty($_POST['hide_date']),
        );

        $html = self::render_reviews_list_html($product_id, $sort, $page, $per_page, $opts, $empty_text);
        wp_send_json_success(array('html' => $html, 'hasMore' => '' !== trim($html) && count(self::get_reviews($product_id, $sort, $page + 1, $per_page)) > 0));
    }

    public static function ajax_submit_review() {
        check_ajax_referer(self::NONCE_ACTION, 'nonce');

        $product_id = isset($_POST['product_id']) ? absint($_POST['product_id']) : 0;
        $rating = isset($_POST['rating']) ? absint($_POST['rating']) : 0;
        $title = isset($_POST['title']) ? sanitize_text_field(wp_unslash($_POST['title'])) : '';
        $body = isset($_POST['review']) ? sanitize_textarea_field(wp_unslash($_POST['review'])) : '';

        if (!$product_id || 'product' !== get_post_type($product_id)) {
            wp_send_json_error(array('message' => __('Invalid product.', 'woocommerce')), 400);
        }
        if ($rating < 1 || $rating > 5) {
            wp_send_json_error(array('message' => __('Please select a rating between 1 and 5.', 'woocommerce')), 422);
        }
        if ('' === trim($body)) {
            wp_send_json_error(array('message' => __('Please write your review.', 'woocommerce')), 422);
        }
        if (mb_strlen($title) > 120) {
            $title = mb_substr($title, 0, 120);
        }

        $user = wp_get_current_user();
        if ($user && $user->exists()) {
            $author = $user->display_name;
            $email = $user->user_email;
            $user_id = (int) $user->ID;
        } else {
            $author = isset($_POST['author']) ? sanitize_text_field(wp_unslash($_POST['author'])) : '';
            $email = isset($_POST['email']) ? sanitize_email(wp_unslash($_POST['email'])) : '';
            $user_id = 0;
            if ('' === $author || !is_email($email)) {
                wp_send_json_error(array('message' => __('Please provide a valid name and email.', 'woocommerce')), 422);
            }
        }

        // Verified-buyer gate — authoritative, server-side.
        $bought = function_exists('wc_customer_bought_product') ? wc_customer_bought_product($email, $user_id, $product_id) : false;
        if (!$bought) {
            wp_send_json_error(array('message' => __('Only customers who purchased this product can leave a review.', 'woocommerce'), 'code' => 'not_buyer'), 403);
        }

        // Basic flood protection (native WP).
        if (function_exists('check_comment_flood_db')) {
            check_comment_flood_db($email, '', current_time('mysql'));
        }

        $commentdata = array(
            'comment_post_ID' => $product_id,
            'comment_author' => $author,
            'comment_author_email' => $email,
            'comment_author_IP' => isset($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : '',
            'comment_agent' => isset($_SERVER['HTTP_USER_AGENT']) ? substr(sanitize_text_field(wp_unslash($_SERVER['HTTP_USER_AGENT'])), 0, 254) : '',
            'comment_content' => $body,
            'comment_type' => 'review',
            'comment_parent' => 0,
            'user_id' => $user_id,
        );
        $approved = wp_allow_comment($commentdata);
        $commentdata['comment_approved'] = ('spam' === $approved || 'trash' === $approved) ? 0 : $approved;

        $comment_id = wp_insert_comment(wp_filter_comment($commentdata));
        if (!$comment_id) {
            wp_send_json_error(array('message' => __('Your review could not be saved.', 'woocommerce')), 500);
        }

        update_comment_meta($comment_id, 'rating', $rating);
        update_comment_meta($comment_id, 'verified', 1);
        if ('' !== $title) {
            update_comment_meta($comment_id, self::TITLE_META, $title);
        }

        $status = wp_get_comment_status($comment_id);
        wp_send_json_success(array('pending' => ('approved' !== $status)));
    }
}
