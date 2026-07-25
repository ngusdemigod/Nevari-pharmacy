<?php

if (!defined('ABSPATH')) {
    exit;
}

final class Nevari_Product_Experience {
    private static $instance = null;
    private $plugin_file = '';
    private $plugin_path = '';
    private $plugin_url = '';
    private $add_to_cart_snackbar_enabled = false;
    private $add_to_cart_snackbar_rendered = false;

    public static function instance($plugin_file = '') {
        if (null === self::$instance) {
            if (empty($plugin_file)) {
                return null;
            }

            self::$instance = new self($plugin_file);
        }

        return self::$instance;
    }

    private function __construct($plugin_file) {
        $this->plugin_file = $plugin_file;
        $this->plugin_path = plugin_dir_path($plugin_file);
        $this->plugin_url  = plugin_dir_url($plugin_file);

        add_filter('woocommerce_locate_template', array($this, 'locate_woocommerce_templates'), 20, 3);
        add_filter('wc_get_template_part', array($this, 'locate_woocommerce_template_part'), 20, 3);
        add_filter('comments_template', array($this, 'filter_comments_template'), 20);
        add_filter('woocommerce_product_tabs', array($this, 'remove_default_product_tabs'), 98);
        add_action('nevari_single_product_content', array($this, 'render_single_product_hero_section'), 10);
        add_action('nevari_single_product_content', array($this, 'render_single_product_reviews_section'), 20);
        add_action('nevari_single_product_content', array($this, 'render_single_product_details_section'), 30);
        add_shortcode('nevari_product_reviews', array($this, 'render_product_reviews_shortcode'));
        add_shortcode('nevari_ajax_add_to_cart', array($this, 'render_ajax_add_to_cart_shortcode'));

        add_action('admin_init', array($this, 'register_reviews_module_settings'));
        add_action('admin_init', array($this, 'register_add_to_cart_button_settings'));
        add_action('admin_menu', array($this, 'register_reviews_module_settings_page'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
        add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
        add_action('wp_footer', array($this, 'render_add_to_cart_snackbar'), 20);
        add_filter('preprocess_comment', array($this, 'validate_review_submission'), 5);
        add_action('wp_ajax_nevari_add_to_cart', array($this, 'handle_ajax_add_to_cart'));
        add_action('wp_ajax_nopriv_nevari_add_to_cart', array($this, 'handle_ajax_add_to_cart'));
    }

    public static function activate() {
        $instance = self::instance();

        if (!$instance) {
            return;
        }

        flush_rewrite_rules();
    }

    public function register_review_post_type() {
        register_post_type(
            'nevari_review',
            array(
                'labels' => array(
                    'name'               => __('Product Reviews', 'woocommerce'),
                    'singular_name'      => __('Product Review', 'woocommerce'),
                    'add_new_item'       => __('Add New Review', 'woocommerce'),
                    'edit_item'          => __('Edit Review', 'woocommerce'),
                    'new_item'           => __('New Review', 'woocommerce'),
                    'view_item'          => __('View Review', 'woocommerce'),
                    'search_items'       => __('Search Reviews', 'woocommerce'),
                    'not_found'          => __('No reviews found.', 'woocommerce'),
                    'not_found_in_trash' => __('No reviews found in trash.', 'woocommerce'),
                ),
                'public'              => false,
                'show_ui'             => true,
                'show_in_menu'        => 'woocommerce',
                'supports'            => array('title', 'editor'),
                'map_meta_cap'        => true,
                'capability_type'     => 'post',
                'has_archive'         => false,
                'rewrite'             => false,
                'menu_icon'           => 'dashicons-star-filled',
                'show_in_rest'        => false,
            )
        );
    }

    public function enqueue_assets($force = false) {
        if (!$force && (!function_exists('is_product') || !is_product())) {
            return;
        }

        $this->add_to_cart_snackbar_enabled = true;
        $this->enqueue_product_assets();
    }

    public function register_reviews_module_settings() {
        register_setting(
            'nevari_reviews_module_settings',
            'nevari_reviews_module_options',
            array(
                'type'              => 'array',
                'sanitize_callback' => array($this, 'sanitize_reviews_module_options'),
                'default'           => $this->get_reviews_module_default_options(),
            )
        );
    }

    public function register_add_to_cart_button_settings() {
        register_setting(
            'nevari_add_to_cart_button_settings',
            'nevari_add_to_cart_button_options',
            array(
                'type'              => 'array',
                'sanitize_callback' => array($this, 'sanitize_add_to_cart_button_options'),
                'default'           => $this->get_add_to_cart_button_default_options(),
            )
        );
    }

    public function get_add_to_cart_button_default_options() {
        return array(
            'button_label'         => __('Add to Cart', 'woocommerce'),
            'button_added_label'   => __('Added to Cart', 'woocommerce'),
            'button_bg_color'      => '#0b2d66',
            'button_text_color'    => '#ffffff',
            'button_hover_color'   => '#102f61',
            'button_icon_color'    => '#ffffff',
            'button_icon_type'     => 'cart',
            'button_icon_size'     => 20,
            'button_font_family'   => 'Product Sans, Inter, Arial, sans-serif',
            'button_font_size'     => 18,
            'button_font_weight'   => 500,
            'button_show_icon'     => 1,
            'button_border_radius' => 999,
            'icon_url'             => '',
            'notice_template'      => '{product_name} has been added to cart',
            'notice_bg_color'      => '#0b2d66',
            'notice_text_color'    => '#ffffff',
            'notice_icon_color'    => '#ffffff',
            'notice_font_family'   => 'Product Sans, Inter, Arial, sans-serif',
            'notice_font_size'     => 18,
            'notice_font_weight'   => 500,
            'notice_show_icon'     => 1,
            'notice_border_radius' => 999,
            'snackbar_position'    => 'top-right',
            'snackbar_duration'    => 3800,
            'snackbar_show_cart_link' => 1,
            'snackbar_show_continue_link' => 1,
            'snackbar_cart_label'  => __('View cart', 'woocommerce'),
            'snackbar_continue_label' => __('Continue shopping', 'woocommerce'),
        );
    }

    public function get_add_to_cart_button_options() {
        $options = get_option('nevari_add_to_cart_button_options', array());

        return wp_parse_args(is_array($options) ? $options : array(), $this->get_add_to_cart_button_default_options());
    }

    public function get_add_to_cart_icon_type_options() {
        return array(
            'cart'   => __('Cart', 'woocommerce'),
            'bag'    => __('Shopping bag', 'woocommerce'),
            'box'    => __('Box', 'woocommerce'),
            'plus'   => __('Plus', 'woocommerce'),
            'arrow'  => __('Arrow', 'woocommerce'),
            'custom' => __('Custom image', 'woocommerce'),
        );
    }

    public function get_add_to_cart_icon_markup($icon_type = 'cart', $icon_url = '', $icon_color = '#ffffff', $icon_size = 20, $context = 'button') {
        $icon_type = sanitize_key($icon_type);
        $icon_url  = esc_url($icon_url);
        $icon_size = max(12, absint($icon_size));
        $variant   = in_array($icon_type, array('cart', 'bag', 'box', 'plus', 'arrow', 'custom'), true) ? $icon_type : 'cart';

        if ('custom' === $variant && '' === $icon_url) {
            $variant = 'cart';
        }

        if ('custom' === $variant && '' !== $icon_url) {
            return sprintf(
                '<img class="%1$s" src="%2$s" alt="" aria-hidden="true" style="width:%3$dpx;height:%3$dpx;">',
                esc_attr('button' === $context ? 'nevari-ajax-add-to-cart__icon-image' : 'nevari-add-to-cart-snackbar__icon-image'),
                $icon_url,
                (int) $icon_size
            );
        }

        $base_class = 'button' === $context ? 'nevari-ajax-add-to-cart__icon' : 'nevari-add-to-cart-snackbar__icon';

        return sprintf(
            '<span class="%1$s is-%2$s" data-nevari-icon-type="%2$s" style="--nevari-icon-color:%3$s;--nevari-icon-size:%4$dpx;" aria-hidden="true"></span>',
            esc_attr($base_class),
            esc_attr($variant),
            esc_attr($icon_color),
            (int) $icon_size
        );
    }

    public function get_add_to_cart_snackbar_config() {
        $options = $this->get_add_to_cart_button_options();
        $position = isset($options['snackbar_position']) && in_array($options['snackbar_position'], array('top-right', 'bottom-right'), true)
            ? $options['snackbar_position']
            : 'top-right';
        $duration = isset($options['snackbar_duration']) ? max(1800, absint($options['snackbar_duration'])) : 3800;

        $config = array(
            'messageTemplate'    => isset($options['notice_template']) ? $options['notice_template'] : __('Product added to cart.', 'woocommerce'),
            'position'           => $position,
            'duration'           => $duration,
            'showCartLink'       => !empty($options['snackbar_show_cart_link']),
            'showContinueLink'   => !empty($options['snackbar_show_continue_link']),
            'cartLabel'          => isset($options['snackbar_cart_label']) ? $options['snackbar_cart_label'] : __('View cart', 'woocommerce'),
            'continueLabel'      => isset($options['snackbar_continue_label']) ? $options['snackbar_continue_label'] : __('Continue shopping', 'woocommerce'),
            'cartUrl'            => wc_get_cart_url(),
            'continueUrl'        => $this->get_continue_shopping_url(),
            'title'              => __('Product added to cart', 'woocommerce'),
            'bgColor'            => isset($options['notice_bg_color']) ? $options['notice_bg_color'] : '#0b2d66',
            'textColor'          => isset($options['notice_text_color']) ? $options['notice_text_color'] : '#ffffff',
            'iconColor'          => isset($options['notice_icon_color']) ? $options['notice_icon_color'] : '#ffffff',
            'iconType'           => isset($options['button_icon_type']) ? $options['button_icon_type'] : 'cart',
            'iconSize'           => isset($options['button_icon_size']) ? absint($options['button_icon_size']) : 20,
            'fontFamily'         => isset($options['notice_font_family']) ? $options['notice_font_family'] : 'Product Sans, Inter, Arial, sans-serif',
            'fontSize'           => isset($options['notice_font_size']) ? absint($options['notice_font_size']) : 18,
            'fontWeight'         => isset($options['notice_font_weight']) ? absint($options['notice_font_weight']) : 500,
            'radius'             => isset($options['notice_border_radius']) ? absint($options['notice_border_radius']) : 999,
            'showIcon'           => !empty($options['notice_show_icon']),
            'iconUrl'            => isset($options['icon_url']) ? $options['icon_url'] : '',
        );

        return apply_filters('nevari_add_to_cart_snackbar_config', $config, $options);
    }

    public function get_font_family_options() {
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

    public function enqueue_admin_assets($hook_suffix) {
        $allowed = array(
            'toplevel_page_nevari-customizations',
            'woocommerce_page_nevari-customizations-add-to-cart',
            'woocommerce_page_nevari-customizations-reviews-module',
        );
        $page = isset($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : '';

        if (!in_array($hook_suffix, $allowed, true) && !in_array($page, array('nevari-customizations', 'nevari-customizations-add-to-cart', 'nevari-customizations-reviews-module'), true)) {
            return;
        }

        wp_enqueue_media();
        wp_enqueue_style('wp-color-picker');
        wp_enqueue_script('wp-color-picker');
        wp_add_inline_script(
            'wp-color-picker',
            'jQuery(function($){
                $(".nevari-color-field").wpColorPicker();

                $(".nevari-media-upload-field").each(function(){
                    var $field = $(this);
                    var frame = null;

                    $field.on("click", "[data-nevari-media-upload]", function(e){
                        e.preventDefault();

                        if (!frame) {
                            frame = wp.media({
                                title: $field.data("frameTitle") || "Select image",
                                button: {
                                    text: $field.data("frameButton") || "Use image"
                                },
                                library: {
                                    type: "image"
                                },
                                multiple: false
                            });

                            frame.on("select", function(){
                                var attachment = frame.state().get("selection").first().toJSON();
                                var url = attachment && attachment.url ? attachment.url : "";

                                $field.find("[data-nevari-media-input]").val(url).trigger("change");

                                if (url) {
                                    $field.find("[data-nevari-media-preview]").attr("src", url).prop("hidden", false);
                                    $field.find("[data-nevari-media-clear]").prop("disabled", false);
                                }
                            });
                        }

                        frame.open();
                    });

                    $field.on("click", "[data-nevari-media-clear]", function(e){
                        e.preventDefault();

                        $field.find("[data-nevari-media-input]").val("").trigger("change");
                        $field.find("[data-nevari-media-preview]").attr("src", "").prop("hidden", true);
                        $field.find("[data-nevari-media-clear]").prop("disabled", true);
                    });
                });
            });'
        );
    }

    public function render_font_family_select($field_name, $field_id, $value) {
        $options = $this->get_font_family_options();

        if ('' !== $value && !isset($options[$value])) {
            $options = array(
                $value => sprintf(__('Custom: %s', 'woocommerce'), $value),
            ) + $options;
        }
        ?>
        <select name="<?php echo esc_attr($field_name); ?>" id="<?php echo esc_attr($field_id); ?>" class="regular-text nevari-font-family-select">
            <?php foreach ($options as $option_value => $option_label) : ?>
                <option value="<?php echo esc_attr($option_value); ?>" <?php selected($value, $option_value); ?>><?php echo esc_html($option_label); ?></option>
            <?php endforeach; ?>
        </select>
        <?php
    }

    public function sanitize_add_to_cart_button_options($input) {
        $defaults = $this->get_add_to_cart_button_default_options();
        $input    = is_array($input) ? $input : array();
        $icon_types = array_keys($this->get_add_to_cart_icon_type_options());
        $button_icon_type = isset($input['button_icon_type']) ? sanitize_key(wp_unslash($input['button_icon_type'])) : $defaults['button_icon_type'];

        if (!in_array($button_icon_type, $icon_types, true)) {
            $button_icon_type = $defaults['button_icon_type'];
        }

        return array(
            'button_label'         => isset($input['button_label']) ? sanitize_text_field(wp_unslash($input['button_label'])) : $defaults['button_label'],
            'button_added_label'   => isset($input['button_added_label']) ? sanitize_text_field(wp_unslash($input['button_added_label'])) : $defaults['button_added_label'],
            'button_bg_color'      => isset($input['button_bg_color']) ? sanitize_hex_color($input['button_bg_color']) : $defaults['button_bg_color'],
            'button_text_color'    => isset($input['button_text_color']) ? sanitize_hex_color($input['button_text_color']) : $defaults['button_text_color'],
            'button_hover_color'   => isset($input['button_hover_color']) ? sanitize_hex_color($input['button_hover_color']) : $defaults['button_hover_color'],
            'button_icon_color'    => isset($input['button_icon_color']) ? sanitize_hex_color($input['button_icon_color']) : $defaults['button_icon_color'],
            'button_icon_type'     => $button_icon_type,
            'button_icon_size'     => isset($input['button_icon_size']) ? max(12, absint($input['button_icon_size'])) : $defaults['button_icon_size'],
            'button_font_family'   => isset($input['button_font_family']) ? sanitize_text_field(wp_unslash($input['button_font_family'])) : $defaults['button_font_family'],
            'button_font_size'     => isset($input['button_font_size']) ? max(12, absint($input['button_font_size'])) : $defaults['button_font_size'],
            'button_font_weight'   => isset($input['button_font_weight']) ? max(300, min(900, absint($input['button_font_weight']))) : $defaults['button_font_weight'],
            'button_show_icon'     => !empty($input['button_show_icon']) ? 1 : 0,
            'button_border_radius' => isset($input['button_border_radius']) ? max(0, absint($input['button_border_radius'])) : $defaults['button_border_radius'],
            'icon_url'             => isset($input['icon_url']) ? esc_url_raw(wp_unslash($input['icon_url'])) : $defaults['icon_url'],
            'notice_template'      => isset($input['notice_template']) ? sanitize_text_field(wp_unslash($input['notice_template'])) : $defaults['notice_template'],
            'notice_bg_color'      => isset($input['notice_bg_color']) ? sanitize_hex_color($input['notice_bg_color']) : $defaults['notice_bg_color'],
            'notice_text_color'    => isset($input['notice_text_color']) ? sanitize_hex_color($input['notice_text_color']) : $defaults['notice_text_color'],
            'notice_icon_color'    => isset($input['notice_icon_color']) ? sanitize_hex_color($input['notice_icon_color']) : $defaults['notice_icon_color'],
            'notice_font_family'   => isset($input['notice_font_family']) ? sanitize_text_field(wp_unslash($input['notice_font_family'])) : $defaults['notice_font_family'],
            'notice_font_size'     => isset($input['notice_font_size']) ? max(12, absint($input['notice_font_size'])) : $defaults['notice_font_size'],
            'notice_font_weight'   => isset($input['notice_font_weight']) ? max(300, min(900, absint($input['notice_font_weight']))) : $defaults['notice_font_weight'],
            'notice_show_icon'     => !empty($input['notice_show_icon']) ? 1 : 0,
            'notice_border_radius' => isset($input['notice_border_radius']) ? max(0, absint($input['notice_border_radius'])) : $defaults['notice_border_radius'],
            'snackbar_position'    => isset($input['snackbar_position']) && in_array(sanitize_key(wp_unslash($input['snackbar_position'])), array('top-right', 'bottom-right'), true)
                ? sanitize_key(wp_unslash($input['snackbar_position']))
                : $defaults['snackbar_position'],
            'snackbar_duration'    => isset($input['snackbar_duration']) ? max(1800, absint($input['snackbar_duration'])) : $defaults['snackbar_duration'],
            'snackbar_show_cart_link' => !empty($input['snackbar_show_cart_link']) ? 1 : 0,
            'snackbar_show_continue_link' => !empty($input['snackbar_show_continue_link']) ? 1 : 0,
            'snackbar_cart_label'  => isset($input['snackbar_cart_label']) ? sanitize_text_field(wp_unslash($input['snackbar_cart_label'])) : $defaults['snackbar_cart_label'],
            'snackbar_continue_label' => isset($input['snackbar_continue_label']) ? sanitize_text_field(wp_unslash($input['snackbar_continue_label'])) : $defaults['snackbar_continue_label'],
        );
    }

    public function register_reviews_module_settings_page() {
        add_submenu_page(
            'nevari-customizations',
            __('Add to Cart Button', 'woocommerce'),
            __('Add to Cart Button', 'woocommerce'),
            'manage_woocommerce',
            'nevari-customizations-add-to-cart',
            array($this, 'render_add_to_cart_settings_page')
        );

        add_submenu_page(
            'nevari-customizations',
            __('Reviews Module', 'woocommerce'),
            __('Reviews Module', 'woocommerce'),
            'manage_woocommerce',
            'nevari-customizations-reviews-module',
            array($this, 'render_reviews_module_settings_page')
        );
    }

    public function get_reviews_module_default_options() {
        return array(
            'heading'              => __('Customer Reviews', 'woocommerce'),
            'intro'                => __('Average rating: {average} ({total})', 'woocommerce'),
            'show_distribution'    => 1,
            'show_sort'            => 1,
            'show_reviewer_name'   => 1,
            'show_verified_badge'   => 1,
            'reviews_limit'        => 0,
            'empty_state'          => __('No approved reviews yet. Be the first verified buyer to submit one.', 'woocommerce'),
            'heading_color'        => '#16161c',
            'intro_color'          => '#6f6a76',
            'accent_color'         => '#5b9be8',
            'star_filled_color'    => '#ff7a00',
            'star_empty_color'     => '#c9c5d1',
            'track_color'          => 'rgba(150, 155, 184, 0.22)',
            'card_background'      => 'rgba(255, 255, 255, 0.72)',
            'card_border_color'    => 'rgba(222, 224, 235, 0.7)',
            'body_text_color'      => '#5f5a64',
            'title_font_family'    => 'Product Sans, Inter, Arial, sans-serif',
            'body_font_family'     => 'Inter, Arial, sans-serif',
            'heading_font_size'    => 19,
            'body_font_size'       => 14,
        );
    }

    public function get_reviews_module_options() {
        $options = get_option('nevari_reviews_module_options', array());

        return wp_parse_args(is_array($options) ? $options : array(), $this->get_reviews_module_default_options());
    }

    public function sanitize_reviews_module_options($input) {
        $defaults = $this->get_reviews_module_default_options();
        $input    = is_array($input) ? $input : array();

        return array(
            'heading'            => isset($input['heading']) ? sanitize_text_field(wp_unslash($input['heading'])) : $defaults['heading'],
            'intro'              => isset($input['intro']) ? sanitize_text_field(wp_unslash($input['intro'])) : $defaults['intro'],
            'show_distribution'   => !empty($input['show_distribution']) ? 1 : 0,
            'show_sort'           => !empty($input['show_sort']) ? 1 : 0,
            'show_reviewer_name'  => !empty($input['show_reviewer_name']) ? 1 : 0,
            'show_verified_badge'  => !empty($input['show_verified_badge']) ? 1 : 0,
            'reviews_limit'       => isset($input['reviews_limit']) ? max(0, absint($input['reviews_limit'])) : 0,
            'empty_state'         => isset($input['empty_state']) ? sanitize_textarea_field(wp_unslash($input['empty_state'])) : $defaults['empty_state'],
            'heading_color'       => isset($input['heading_color']) ? sanitize_hex_color($input['heading_color']) : $defaults['heading_color'],
            'intro_color'         => isset($input['intro_color']) ? sanitize_hex_color($input['intro_color']) : $defaults['intro_color'],
            'accent_color'        => isset($input['accent_color']) ? sanitize_hex_color($input['accent_color']) : $defaults['accent_color'],
            'star_filled_color'   => isset($input['star_filled_color']) ? sanitize_hex_color($input['star_filled_color']) : $defaults['star_filled_color'],
            'star_empty_color'    => isset($input['star_empty_color']) ? sanitize_hex_color($input['star_empty_color']) : $defaults['star_empty_color'],
            'track_color'         => isset($input['track_color']) ? sanitize_text_field(wp_unslash($input['track_color'])) : $defaults['track_color'],
            'card_background'     => isset($input['card_background']) ? sanitize_text_field(wp_unslash($input['card_background'])) : $defaults['card_background'],
            'card_border_color'   => isset($input['card_border_color']) ? sanitize_text_field(wp_unslash($input['card_border_color'])) : $defaults['card_border_color'],
            'body_text_color'     => isset($input['body_text_color']) ? sanitize_hex_color($input['body_text_color']) : $defaults['body_text_color'],
            'title_font_family'   => isset($input['title_font_family']) ? sanitize_text_field(wp_unslash($input['title_font_family'])) : $defaults['title_font_family'],
            'body_font_family'    => isset($input['body_font_family']) ? sanitize_text_field(wp_unslash($input['body_font_family'])) : $defaults['body_font_family'],
            'heading_font_size'   => isset($input['heading_font_size']) ? max(12, absint($input['heading_font_size'])) : $defaults['heading_font_size'],
            'body_font_size'      => isset($input['body_font_size']) ? max(10, absint($input['body_font_size'])) : $defaults['body_font_size'],
        );
    }

    public function render_add_to_cart_settings_page() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }

        $options = $this->get_add_to_cart_button_options();
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Add to Cart Button', 'woocommerce'); ?></h1>
            <p><?php esc_html_e('Use the [nevari_ajax_add_to_cart] shortcode in Elementor or any page builder. On a single product template, it resolves the loaded product automatically. You can also pass product_id manually.', 'woocommerce'); ?></p>
            <p><code>[nevari_ajax_add_to_cart]</code></p>
            <p class="description"><?php esc_html_e('Use {product_name} in the snack bar text to insert the current product name.', 'woocommerce'); ?></p>

            <form method="post" action="options.php">
                <?php settings_fields('nevari_add_to_cart_button_settings'); ?>

                <h2><?php esc_html_e('Button', 'woocommerce'); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_label"><?php esc_html_e('Button label', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_label]" id="nevari_add_to_cart_button_label" type="text" class="regular-text" value="<?php echo esc_attr($options['button_label']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_added_label"><?php esc_html_e('Added label', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_added_label]" id="nevari_add_to_cart_button_added_label" type="text" class="regular-text" value="<?php echo esc_attr($options['button_added_label']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_bg"><?php esc_html_e('Background color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_bg_color]" id="nevari_add_to_cart_button_bg" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['button_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_text"><?php esc_html_e('Text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_text_color]" id="nevari_add_to_cart_button_text" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['button_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_hover"><?php esc_html_e('Hover color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_hover_color]" id="nevari_add_to_cart_button_hover" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['button_hover_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_icon"><?php esc_html_e('Icon color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_icon_color]" id="nevari_add_to_cart_button_icon" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['button_icon_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_icon_type"><?php esc_html_e('Icon type', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_add_to_cart_button_options[button_icon_type]" id="nevari_add_to_cart_button_icon_type">
                                <?php foreach ($this->get_add_to_cart_icon_type_options() as $value => $label) : ?>
                                    <option value="<?php echo esc_attr($value); ?>" <?php selected($options['button_icon_type'], $value); ?>><?php echo esc_html($label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <p class="description"><?php esc_html_e('Choose the built-in icon style or switch to a custom image.', 'woocommerce'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_icon_size"><?php esc_html_e('Icon size', 'woocommerce'); ?></label></th>
                        <td>
                            <input name="nevari_add_to_cart_button_options[button_icon_size]" id="nevari_add_to_cart_button_icon_size" type="number" min="12" max="48" step="1" class="small-text" value="<?php echo esc_attr((int) $options['button_icon_size']); ?>">
                            <p class="description"><?php esc_html_e('Size in pixels for the built-in icon or custom image.', 'woocommerce'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_icon_url"><?php esc_html_e('Icon image', 'woocommerce'); ?></label></th>
                        <td>
                            <div class="nevari-media-upload-field" data-frame-title="<?php echo esc_attr__('Select icon image', 'woocommerce'); ?>" data-frame-button="<?php echo esc_attr__('Use this image', 'woocommerce'); ?>">
                                <input
                                    name="nevari_add_to_cart_button_options[icon_url]"
                                    id="nevari_add_to_cart_button_icon_url"
                                    type="url"
                                    class="regular-text"
                                    value="<?php echo esc_attr($options['icon_url']); ?>"
                                    data-nevari-media-input
                                >
                                <p class="description"><?php esc_html_e('Used when Icon type is set to Custom image.', 'woocommerce'); ?></p>
                                <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-top:10px;">
                                    <button type="button" class="button" data-nevari-media-upload><?php esc_html_e('Upload / Select', 'woocommerce'); ?></button>
                                    <button type="button" class="button" data-nevari-media-clear <?php disabled('', $options['icon_url']); ?>><?php esc_html_e('Remove', 'woocommerce'); ?></button>
                                    <img
                                        src="<?php echo esc_url($options['icon_url']); ?>"
                                        alt=""
                                        data-nevari-media-preview
                                        <?php echo empty($options['icon_url']) ? 'hidden' : ''; ?>
                                        style="width:36px;height:36px;object-fit:contain;border:1px solid #ddd;border-radius:8px;padding:4px;<?php echo empty($options['icon_url']) ? 'display:none;' : ''; ?>"
                                    >
                                </div>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_font_family"><?php esc_html_e('Typography font family', 'woocommerce'); ?></label></th>
                        <td><?php $this->render_font_family_select('nevari_add_to_cart_button_options[button_font_family]', 'nevari_add_to_cart_button_font_family', $options['button_font_family']); ?></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_font_size"><?php esc_html_e('Typography font size', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_font_size]" id="nevari_add_to_cart_button_font_size" type="number" min="12" step="1" class="small-text" value="<?php echo esc_attr((int) $options['button_font_size']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_font_weight"><?php esc_html_e('Typography font weight', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_font_weight]" id="nevari_add_to_cart_button_font_weight" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $options['button_font_weight']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Show icon', 'woocommerce'); ?></th>
                        <td><label><input type="checkbox" name="nevari_add_to_cart_button_options[button_show_icon]" value="1" <?php checked(1, (int) $options['button_show_icon']); ?>> <?php esc_html_e('Display the cart icon inside the button', 'woocommerce'); ?></label></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_button_radius"><?php esc_html_e('Border radius', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[button_border_radius]" id="nevari_add_to_cart_button_radius" type="number" min="0" step="1" class="small-text" value="<?php echo esc_attr((int) $options['button_border_radius']); ?>"></td>
                    </tr>
                </table>

                <h2><?php esc_html_e('Snack bar content', 'woocommerce'); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_notice_template"><?php esc_html_e('Snack bar text', 'woocommerce'); ?></label></th>
                        <td>
                            <input name="nevari_add_to_cart_button_options[notice_template]" id="nevari_add_to_cart_notice_template" type="text" class="large-text" value="<?php echo esc_attr($options['notice_template']); ?>">
                            <p class="description"><?php esc_html_e('Use {product_name} to insert the active product name.', 'woocommerce'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_notice_bg"><?php esc_html_e('Background color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[notice_bg_color]" id="nevari_add_to_cart_notice_bg" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['notice_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_notice_text"><?php esc_html_e('Text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[notice_text_color]" id="nevari_add_to_cart_notice_text" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['notice_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_notice_icon"><?php esc_html_e('Icon color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[notice_icon_color]" id="nevari_add_to_cart_notice_icon" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['notice_icon_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_notice_font_family"><?php esc_html_e('Typography font family', 'woocommerce'); ?></label></th>
                        <td><?php $this->render_font_family_select('nevari_add_to_cart_button_options[notice_font_family]', 'nevari_add_to_cart_notice_font_family', $options['notice_font_family']); ?></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_notice_font_size"><?php esc_html_e('Typography font size', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[notice_font_size]" id="nevari_add_to_cart_notice_font_size" type="number" min="12" step="1" class="small-text" value="<?php echo esc_attr((int) $options['notice_font_size']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_notice_font_weight"><?php esc_html_e('Typography font weight', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[notice_font_weight]" id="nevari_add_to_cart_notice_font_weight" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $options['notice_font_weight']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Show icon', 'woocommerce'); ?></th>
                        <td><label><input type="checkbox" name="nevari_add_to_cart_button_options[notice_show_icon]" value="1" <?php checked(1, (int) $options['notice_show_icon']); ?>> <?php esc_html_e('Display the cart icon inside the snack bar', 'woocommerce'); ?></label></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_notice_radius"><?php esc_html_e('Border radius', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[notice_border_radius]" id="nevari_add_to_cart_notice_radius" type="number" min="0" step="1" class="small-text" value="<?php echo esc_attr((int) $options['notice_border_radius']); ?>"></td>
                    </tr>
                </table>

                <h2><?php esc_html_e('Snack bar placement', 'woocommerce'); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_snackbar_position"><?php esc_html_e('Position', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_add_to_cart_button_options[snackbar_position]" id="nevari_add_to_cart_snackbar_position">
                                <option value="top-right" <?php selected($options['snackbar_position'], 'top-right'); ?>><?php esc_html_e('Top right', 'woocommerce'); ?></option>
                                <option value="bottom-right" <?php selected($options['snackbar_position'], 'bottom-right'); ?>><?php esc_html_e('Bottom right', 'woocommerce'); ?></option>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_snackbar_duration"><?php esc_html_e('Auto hide delay', 'woocommerce'); ?></label></th>
                        <td>
                            <input name="nevari_add_to_cart_button_options[snackbar_duration]" id="nevari_add_to_cart_snackbar_duration" type="number" min="1800" step="100" class="small-text" value="<?php echo esc_attr((int) $options['snackbar_duration']); ?>">
                            <p class="description"><?php esc_html_e('Delay in milliseconds before the snack bar fades away.', 'woocommerce'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Cart link', 'woocommerce'); ?></th>
                        <td><label><input type="checkbox" name="nevari_add_to_cart_button_options[snackbar_show_cart_link]" value="1" <?php checked(1, (int) $options['snackbar_show_cart_link']); ?>> <?php esc_html_e('Show a link to the cart page', 'woocommerce'); ?></label></td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Continue link', 'woocommerce'); ?></th>
                        <td><label><input type="checkbox" name="nevari_add_to_cart_button_options[snackbar_show_continue_link]" value="1" <?php checked(1, (int) $options['snackbar_show_continue_link']); ?>> <?php esc_html_e('Show a continue shopping link', 'woocommerce'); ?></label></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_snackbar_cart_label"><?php esc_html_e('Cart label', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[snackbar_cart_label]" id="nevari_add_to_cart_snackbar_cart_label" type="text" class="regular-text" value="<?php echo esc_attr($options['snackbar_cart_label']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_add_to_cart_snackbar_continue_label"><?php esc_html_e('Continue label', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_add_to_cart_button_options[snackbar_continue_label]" id="nevari_add_to_cart_snackbar_continue_label" type="text" class="regular-text" value="<?php echo esc_attr($options['snackbar_continue_label']); ?>"></td>
                    </tr>
                </table>

                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    public function render_reviews_module_settings_page() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }

        $options = $this->get_reviews_module_options();
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Reviews Module', 'woocommerce'); ?></h1>
            <p><?php esc_html_e('These settings control the [nevari_product_reviews] shortcode used in Elementor or any other page builder.', 'woocommerce'); ?></p>
            <p><code>[nevari_product_reviews]</code></p>
            <p class="description"><?php esc_html_e('Placed on a single product template, the shortcode loads reviews for the product currently being viewed.', 'woocommerce'); ?></p>

            <form method="post" action="options.php">
                <?php settings_fields('nevari_reviews_module_settings'); ?>

                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">
                            <label for="nevari_reviews_module_heading"><?php esc_html_e('Section heading', 'woocommerce'); ?></label>
                        </th>
                        <td>
                            <input
                                name="nevari_reviews_module_options[heading]"
                                id="nevari_reviews_module_heading"
                                type="text"
                                class="regular-text"
                                value="<?php echo esc_attr($options['heading']); ?>"
                            >
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="nevari_reviews_module_intro"><?php esc_html_e('Intro text', 'woocommerce'); ?></label>
                        </th>
                        <td>
                            <input
                                name="nevari_reviews_module_options[intro]"
                                id="nevari_reviews_module_intro"
                                type="text"
                                class="regular-text"
                                value="<?php echo esc_attr($options['intro']); ?>"
                            >
                            <p class="description"><?php esc_html_e('Use {average} and {total} as placeholders.', 'woocommerce'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php esc_html_e('Visibility', 'woocommerce'); ?></th>
                        <td>
                            <label><input type="checkbox" name="nevari_reviews_module_options[show_distribution]" value="1" <?php checked(1, (int) $options['show_distribution']); ?>> <?php esc_html_e('Show rating distribution', 'woocommerce'); ?></label><br>
                            <label><input type="checkbox" name="nevari_reviews_module_options[show_sort]" value="1" <?php checked(1, (int) $options['show_sort']); ?>> <?php esc_html_e('Show sort dropdown', 'woocommerce'); ?></label><br>
                            <label><input type="checkbox" name="nevari_reviews_module_options[show_reviewer_name]" value="1" <?php checked(1, (int) $options['show_reviewer_name']); ?>> <?php esc_html_e('Show reviewer name', 'woocommerce'); ?></label><br>
                            <label><input type="checkbox" name="nevari_reviews_module_options[show_verified_badge]" value="1" <?php checked(1, (int) $options['show_verified_badge']); ?>> <?php esc_html_e('Show verified buyer badge', 'woocommerce'); ?></label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="nevari_reviews_module_limit"><?php esc_html_e('Review limit', 'woocommerce'); ?></label>
                        </th>
                        <td>
                            <input
                                name="nevari_reviews_module_options[reviews_limit]"
                                id="nevari_reviews_module_limit"
                                type="number"
                                min="0"
                                step="1"
                                class="small-text"
                                value="<?php echo esc_attr((int) $options['reviews_limit']); ?>"
                            >
                            <p class="description"><?php esc_html_e('Use 0 to show all reviews for the current product.', 'woocommerce'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row">
                            <label for="nevari_reviews_module_empty"><?php esc_html_e('Empty state message', 'woocommerce'); ?></label>
                        </th>
                        <td>
                            <textarea
                                name="nevari_reviews_module_options[empty_state]"
                                id="nevari_reviews_module_empty"
                                rows="4"
                                class="large-text"
                            ><?php echo esc_textarea($options['empty_state']); ?></textarea>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_heading_color"><?php esc_html_e('Heading color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[heading_color]" id="nevari_reviews_module_heading_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['heading_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_intro_color"><?php esc_html_e('Intro text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[intro_color]" id="nevari_reviews_module_intro_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['intro_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_accent_color"><?php esc_html_e('Accent color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[accent_color]" id="nevari_reviews_module_accent_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['accent_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_star_filled_color"><?php esc_html_e('Star fill color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[star_filled_color]" id="nevari_reviews_module_star_filled_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['star_filled_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_star_empty_color"><?php esc_html_e('Star empty color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[star_empty_color]" id="nevari_reviews_module_star_empty_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['star_empty_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_track_color"><?php esc_html_e('Track color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[track_color]" id="nevari_reviews_module_track_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['track_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_card_bg"><?php esc_html_e('Card background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[card_background]" id="nevari_reviews_module_card_bg" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['card_background']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_card_border"><?php esc_html_e('Card border color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[card_border_color]" id="nevari_reviews_module_card_border" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['card_border_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_body_text"><?php esc_html_e('Body text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[body_text_color]" id="nevari_reviews_module_body_text" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($options['body_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_title_font_family"><?php esc_html_e('Title font family', 'woocommerce'); ?></label></th>
                        <td><?php $this->render_font_family_select('nevari_reviews_module_options[title_font_family]', 'nevari_reviews_module_title_font_family', $options['title_font_family']); ?></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_body_font_family"><?php esc_html_e('Body font family', 'woocommerce'); ?></label></th>
                        <td><?php $this->render_font_family_select('nevari_reviews_module_options[body_font_family]', 'nevari_reviews_module_body_font_family', $options['body_font_family']); ?></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_heading_font_size"><?php esc_html_e('Heading font size', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[heading_font_size]" id="nevari_reviews_module_heading_font_size" type="number" min="12" step="1" class="small-text" value="<?php echo esc_attr((int) $options['heading_font_size']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_reviews_module_body_font_size"><?php esc_html_e('Body font size', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_reviews_module_options[body_font_size]" id="nevari_reviews_module_body_font_size" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $options['body_font_size']); ?>"></td>
                    </tr>
                </table>

                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    private function enqueue_product_assets() {
        $css_path = $this->plugin_path . 'assets/css/product-page.css';
        $js_path  = $this->plugin_path . 'assets/js/product-page.js';
        $css_ver  = file_exists($css_path) ? (string) filemtime($css_path) : '1.1.1';
        $js_ver   = file_exists($js_path) ? (string) filemtime($js_path) : '1.1.1';

        wp_register_style(
            'nevari-product-experience',
            $this->plugin_url . 'assets/css/product-page.css',
            array(),
            $css_ver
        );
        wp_enqueue_style('nevari-product-experience');

        wp_register_script(
            'nevari-product-experience',
            $this->plugin_url . 'assets/js/product-page.js',
            array(),
            $js_ver,
            true
        );
        wp_enqueue_script('nevari-product-experience');
        wp_localize_script(
            'nevari-product-experience',
            'NevariProductPage',
            array(
                'ajaxUrl'        => admin_url('admin-ajax.php'),
                'addToCartNonce'  => wp_create_nonce('nevari-add-to-cart'),
                'cartUrl'        => wc_get_cart_url(),
                'snackbar'       => $this->get_add_to_cart_snackbar_config(),
                'messages'       => array(
                    'addToCartDone'  => __('Added to cart.', 'woocommerce'),
                    'addToCartError' => __('Unable to add this product to the cart.', 'woocommerce'),
                ),
            )
        );
    }

    public function should_use_full_product_redesign() {
        if (!function_exists('is_product') || !is_product()) {
            return false;
        }

        return (bool) apply_filters('nevari_use_full_product_redesign', false);
    }

    public function locate_woocommerce_templates($template, $template_name, $template_path) {
        if (!$this->should_use_full_product_redesign()) {
            return $template;
        }

        $supported = array(
            'single-product.php'                => 'templates/woocommerce/single-product.php',
            'content-single-product.php'        => 'templates/woocommerce/content-single-product.php',
            'native-single-product-reviews.php' => 'templates/woocommerce/native-single-product-reviews.php',
            'single-product-reviews.php'        => 'templates/woocommerce/native-single-product-reviews.php',
        );

        if (!isset($supported[$template_name])) {
            return $template;
        }

        $candidate = $this->plugin_path . $supported[$template_name];

        return file_exists($candidate) ? $candidate : $template;
    }

    public function locate_woocommerce_template_part($template, $slug, $name) {
        if (!$this->should_use_full_product_redesign()) {
            return $template;
        }

        if ('content' !== $slug || 'single-product' !== $name) {
            return $template;
        }

        $candidate = $this->plugin_path . 'templates/woocommerce/content-single-product.php';

        return file_exists($candidate) ? $candidate : $template;
    }

    public function remove_default_product_tabs($tabs) {
        if (!$this->should_use_full_product_redesign()) {
            return $tabs;
        }

        unset($tabs['description'], $tabs['additional_information'], $tabs['reviews']);

        return $tabs;
    }

    public function resolve_product($product = null) {
        if ($product instanceof WC_Product) {
            return $product;
        }

        return $this->get_current_product();
    }

    public function get_current_product() {
        global $product;

        if ($product instanceof WC_Product) {
            return $product;
        }

        $product_id = get_the_ID();

        if (!$product_id && function_exists('get_queried_object_id')) {
            $product_id = absint(get_queried_object_id());
        }

        return $product_id ? wc_get_product($product_id) : false;
    }

    public function render_product_reviews_shortcode($atts = array(), $content = '', $tag = '') {
        $atts = shortcode_atts(
            array(
                'product_id' => 0,
            ),
            $atts,
            'nevari_product_reviews'
        );

        if (!empty($atts['product_id'])) {
            $product = wc_get_product(absint($atts['product_id']));
        } else {
            $product = $this->get_current_product();
        }

        if (!$product instanceof WC_Product) {
            return '';
        }

        $this->enqueue_assets(true);

        $options = $this->get_reviews_module_options();
        $payload  = $this->get_frontend_reviews_payload($product->get_id(), (int) $options['reviews_limit']);

        ob_start();
        $this->render_plugin_template(
            'templates/woocommerce/native-single-product-reviews.php',
            array(
                'product'               => $product,
                'review_payload'        => $payload,
                'review_module_options' => $options,
            )
        );
        return ob_get_clean();
    }

    public function render_ajax_add_to_cart_shortcode($atts = array(), $content = '', $tag = '') {
        $atts = shortcode_atts(
            array(
                'product_id'  => 0,
                'quantity'    => 1,
                'label'       => __('Add to Cart', 'woocommerce'),
                'added_label' => __('Added to Cart', 'woocommerce'),
                'class'       => '',
            ),
            $atts,
            'nevari_ajax_add_to_cart'
        );

        if (!empty($atts['product_id'])) {
            $product = wc_get_product(absint($atts['product_id']));
        } else {
            $product = $this->get_current_product();
        }

        if (!$product instanceof WC_Product) {
            return '';
        }

        $this->enqueue_assets(true);
        $options = $this->get_add_to_cart_button_options();
        $label_override = sanitize_text_field($atts['label']);
        $added_override  = sanitize_text_field($atts['added_label']);

        if ('' !== $label_override) {
            $options['button_label'] = $label_override;
        }

        if ('' !== $added_override) {
            $options['button_added_label'] = $added_override;
        }

        ob_start();
        $this->render_plugin_template(
            'templates/woocommerce/partials/ajax-add-to-cart-button.php',
            array(
                'product'      => $product,
                'quantity'     => max(1, absint($atts['quantity'])),
                'extra_class'  => sanitize_text_field($atts['class']),
                'add_to_cart_options' => $options,
            )
        );

        return ob_get_clean();
    }

    public function render_plugin_template($relative_path, $args = array()) {
        $template_file = $this->plugin_path . ltrim($relative_path, '/');

        if (!file_exists($template_file)) {
            return;
        }

        if (!empty($args) && is_array($args)) {
            extract($args, EXTR_SKIP);
        }

        include $template_file;
    }

    public function get_single_product_view_data($product) {
        $product = $this->resolve_product($product);

        if (!$product instanceof WC_Product) {
            return array();
        }

        return array(
            'product'              => $product,
            'gallery'              => $this->get_product_gallery($product),
            'highlights'           => $this->get_about_highlights($product),
            'sections'             => $this->get_product_sections($product),
            'review_payload'       => $this->get_frontend_reviews_payload($product->get_id()),
            'review_module_options' => $this->get_reviews_module_options(),
            'stock_quantity'       => $product->managing_stock() ? (int) $product->get_stock_quantity() : 0,
            'unit_price'           => get_post_meta($product->get_id(), '_nevari_unit_price_label', true),
        );
    }

    public function render_single_product_hero_section($product = null) {
        $product = $this->resolve_product($product);

        if (!$product instanceof WC_Product) {
            return;
        }

        $this->render_plugin_template(
            'templates/woocommerce/partials/single-product-hero.php',
            $this->get_single_product_view_data($product)
        );
    }

    public function render_single_product_reviews_section($product = null) {
        $product = $this->resolve_product($product);

        if (!$product instanceof WC_Product) {
            return;
        }

        $options = $this->get_reviews_module_options();
        $this->render_plugin_template(
            'templates/woocommerce/native-single-product-reviews.php',
            array_merge(
                $this->get_single_product_view_data($product),
                array(
                    'review_payload'        => $this->get_frontend_reviews_payload($product->get_id(), (int) $options['reviews_limit']),
                    'review_module_options' => $options,
                )
            )
        );
    }

    public function render_single_product_details_section($product = null) {
        $product = $this->resolve_product($product);

        if (!$product instanceof WC_Product) {
            return;
        }

        $this->render_plugin_template(
            'templates/woocommerce/partials/single-product-details.php',
            $this->get_single_product_view_data($product)
        );
    }

    public function handle_ajax_add_to_cart() {
        check_ajax_referer('nevari-add-to-cart', 'nonce');

        if (!function_exists('wc_load_cart')) {
            wp_send_json_error(array('message' => __('Cart is unavailable.', 'woocommerce')), 400);
        }

        wc_load_cart();

        if (!WC()->cart) {
            wp_send_json_error(array('message' => __('Cart is unavailable.', 'woocommerce')), 400);
        }

        $product_id = isset($_POST['product_id']) ? absint(wp_unslash($_POST['product_id'])) : 0;
        $quantity   = isset($_POST['quantity']) ? max(1, absint(wp_unslash($_POST['quantity']))) : 1;
        $product    = $product_id ? wc_get_product($product_id) : false;

        if (!$product instanceof WC_Product) {
            wp_send_json_error(array('message' => __('Product not found.', 'woocommerce')), 404);
        }

        if (!$product->is_purchasable()) {
            wp_send_json_error(array('message' => __('This product cannot be purchased.', 'woocommerce')), 400);
        }

        if (!$product->is_in_stock()) {
            wp_send_json_error(array('message' => __('This product is out of stock.', 'woocommerce')), 400);
        }

        if ('simple' !== $product->get_type()) {
            wp_send_json_error(
                array(
                    'message' => __('Choose product options before adding to cart.', 'woocommerce'),
                    'url'     => $product->get_permalink(),
                ),
                400
            );
        }

        $cart_item_key = WC()->cart->add_to_cart($product_id, $quantity);

        if (!$cart_item_key) {
            wp_send_json_error(array('message' => __('Unable to add product to cart.', 'woocommerce')), 400);
        }

        do_action('woocommerce_ajax_added_to_cart', $product_id);
        $snackbar = $this->build_add_to_cart_snackbar_payload($product, $quantity);

        wp_send_json_success(
            array(
                'message'    => __('Added to cart.', 'woocommerce'),
                'cart_count' => WC()->cart->get_cart_contents_count(),
                'product_id' => $product_id,
                'quantity'   => $quantity,
                'snackbar'   => $snackbar,
            )
        );
    }

    public function register_review_meta_boxes() {
        add_meta_box(
            'nevari-review-details',
            __('Review Details', 'woocommerce'),
            array($this, 'render_review_meta_box'),
            'nevari_review',
            'normal',
            'high'
        );
    }

    public function render_review_meta_box($post) {
        $product_id     = absint(get_post_meta($post->ID, '_nevari_review_product_id', true));
        $rating         = max(1, min(5, absint(get_post_meta($post->ID, '_nevari_review_rating', true))));
        $reviewer_name  = get_post_meta($post->ID, '_nevari_review_reviewer_name', true);
        $reviewer_email = get_post_meta($post->ID, '_nevari_review_reviewer_email', true);
        $verified       = get_post_meta($post->ID, '_nevari_review_verified', true);
        $helpful_count  = absint(get_post_meta($post->ID, '_nevari_review_helpful_count', true));

        wp_nonce_field('nevari_save_review_meta', 'nevari_review_meta_nonce');
        ?>
        <table class="form-table" role="presentation">
            <tr>
                <th scope="row"><label for="nevari-review-product-id"><?php esc_html_e('Product ID', 'woocommerce'); ?></label></th>
                <td><input type="number" min="1" id="nevari-review-product-id" name="nevari_review_product_id" value="<?php echo esc_attr($product_id); ?>" class="regular-text"></td>
            </tr>
            <tr>
                <th scope="row"><label for="nevari-review-rating"><?php esc_html_e('Rating', 'woocommerce'); ?></label></th>
                <td>
                    <select id="nevari-review-rating" name="nevari_review_rating">
                        <?php for ($i = 5; $i >= 1; $i--) : ?>
                            <option value="<?php echo esc_attr($i); ?>" <?php selected($rating, $i); ?>><?php echo esc_html(sprintf(_n('%d star', '%d stars', $i, 'woocommerce'), $i)); ?></option>
                        <?php endfor; ?>
                    </select>
                </td>
            </tr>
            <tr>
                <th scope="row"><label for="nevari-review-reviewer-name"><?php esc_html_e('Reviewer Name', 'woocommerce'); ?></label></th>
                <td><input type="text" id="nevari-review-reviewer-name" name="nevari_review_reviewer_name" value="<?php echo esc_attr($reviewer_name); ?>" class="regular-text"></td>
            </tr>
            <tr>
                <th scope="row"><label for="nevari-review-reviewer-email"><?php esc_html_e('Reviewer Email', 'woocommerce'); ?></label></th>
                <td><input type="email" id="nevari-review-reviewer-email" name="nevari_review_reviewer_email" value="<?php echo esc_attr($reviewer_email); ?>" class="regular-text"></td>
            </tr>
            <tr>
                <th scope="row"><label for="nevari-review-helpful-count"><?php esc_html_e('Helpful Count', 'woocommerce'); ?></label></th>
                <td><input type="number" min="0" id="nevari-review-helpful-count" name="nevari_review_helpful_count" value="<?php echo esc_attr($helpful_count); ?>" class="small-text"></td>
            </tr>
            <tr>
                <th scope="row"><?php esc_html_e('Verified Buyer', 'woocommerce'); ?></th>
                <td><label><input type="checkbox" name="nevari_review_verified" value="1" <?php checked($verified, '1'); ?>> <?php esc_html_e('Mark reviewer as verified buyer', 'woocommerce'); ?></label></td>
            </tr>
        </table>
        <?php
    }

    public function save_review_meta_boxes($post_id, $post) {
        if (!isset($_POST['nevari_review_meta_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['nevari_review_meta_nonce'])), 'nevari_save_review_meta')) {
            return;
        }

        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return;
        }

        if ('nevari_review' !== $post->post_type || !current_user_can('edit_post', $post_id)) {
            return;
        }

        $product_id     = isset($_POST['nevari_review_product_id']) ? absint(wp_unslash($_POST['nevari_review_product_id'])) : 0;
        $rating         = isset($_POST['nevari_review_rating']) ? max(1, min(5, absint(wp_unslash($_POST['nevari_review_rating'])))) : 5;
        $reviewer_name  = isset($_POST['nevari_review_reviewer_name']) ? sanitize_text_field(wp_unslash($_POST['nevari_review_reviewer_name'])) : '';
        $reviewer_email = isset($_POST['nevari_review_reviewer_email']) ? sanitize_email(wp_unslash($_POST['nevari_review_reviewer_email'])) : '';
        $helpful_count  = isset($_POST['nevari_review_helpful_count']) ? absint(wp_unslash($_POST['nevari_review_helpful_count'])) : 0;
        $verified       = isset($_POST['nevari_review_verified']) ? '1' : '0';

        update_post_meta($post_id, '_nevari_review_product_id', $product_id);
        update_post_meta($post_id, '_nevari_review_rating', $rating);
        update_post_meta($post_id, '_nevari_review_reviewer_name', $reviewer_name);
        update_post_meta($post_id, '_nevari_review_reviewer_email', $reviewer_email);
        update_post_meta($post_id, '_nevari_review_helpful_count', $helpful_count);
        update_post_meta($post_id, '_nevari_review_verified', $verified);

        $this->sync_product_rating_cache($product_id);
    }

    public function render_review_admin_filters($post_type) {
        if ('nevari_review' !== $post_type) {
            return;
        }

        $selected_product = isset($_GET['nevari_product_filter']) ? absint(wp_unslash($_GET['nevari_product_filter'])) : 0;
        $reviewer_filter  = isset($_GET['nevari_reviewer_filter']) ? sanitize_text_field(wp_unslash($_GET['nevari_reviewer_filter'])) : '';
        $products         = get_posts(
            array(
                'post_type'      => 'product',
                'posts_per_page' => 100,
                'orderby'        => 'title',
                'order'          => 'ASC',
            )
        );
        ?>
        <select name="nevari_product_filter">
            <option value="0"><?php esc_html_e('All products', 'woocommerce'); ?></option>
            <?php foreach ($products as $product_post) : ?>
                <option value="<?php echo esc_attr($product_post->ID); ?>" <?php selected($selected_product, $product_post->ID); ?>>
                    <?php echo esc_html($product_post->post_title); ?>
                </option>
            <?php endforeach; ?>
        </select>
        <input type="search" name="nevari_reviewer_filter" value="<?php echo esc_attr($reviewer_filter); ?>" placeholder="<?php esc_attr_e('Filter by reviewer', 'woocommerce'); ?>">
        <?php
    }

    public function filter_review_admin_query($query) {
        if (!is_admin() || !$query->is_main_query() || 'nevari_review' !== $query->get('post_type')) {
            return;
        }

        $meta_query = (array) $query->get('meta_query');
        $product_id = isset($_GET['nevari_product_filter']) ? absint(wp_unslash($_GET['nevari_product_filter'])) : 0;
        $reviewer   = isset($_GET['nevari_reviewer_filter']) ? sanitize_text_field(wp_unslash($_GET['nevari_reviewer_filter'])) : '';

        if ($product_id > 0) {
            $meta_query[] = array(
                'key'   => '_nevari_review_product_id',
                'value' => $product_id,
            );
        }

        if ('' !== $reviewer) {
            $meta_query[] = array(
                'relation' => 'OR',
                array(
                    'key'     => '_nevari_review_reviewer_name',
                    'value'   => $reviewer,
                    'compare' => 'LIKE',
                ),
                array(
                    'key'     => '_nevari_review_reviewer_email',
                    'value'   => $reviewer,
                    'compare' => 'LIKE',
                ),
            );
        }

        if (!empty($meta_query)) {
            $query->set('meta_query', $meta_query);
        }
    }

    public function register_review_columns($columns) {
        return array(
            'cb'       => isset($columns['cb']) ? $columns['cb'] : '',
            'title'    => __('Review Title', 'woocommerce'),
            'product'  => __('Product', 'woocommerce'),
            'reviewer' => __('Reviewer', 'woocommerce'),
            'rating'   => __('Rating', 'woocommerce'),
            'status'   => __('Status', 'woocommerce'),
            'date'     => __('Date', 'woocommerce'),
        );
    }

    public function render_review_column($column, $post_id) {
        if ('product' === $column) {
            $product_id = absint(get_post_meta($post_id, '_nevari_review_product_id', true));
            $product    = $product_id ? wc_get_product($product_id) : false;
            echo $product ? esc_html($product->get_name()) : '&mdash;';
            return;
        }

        if ('reviewer' === $column) {
            $name  = get_post_meta($post_id, '_nevari_review_reviewer_name', true);
            $email = get_post_meta($post_id, '_nevari_review_reviewer_email', true);
            echo esc_html($name ?: __('Anonymous', 'woocommerce'));

            if ($email) {
                echo '<br><small>' . esc_html($email) . '</small>';
            }
            return;
        }

        if ('rating' === $column) {
            echo wp_kses_post(str_repeat('&#9733;', absint(get_post_meta($post_id, '_nevari_review_rating', true))));
            return;
        }

        if ('status' === $column) {
            $status = get_post_status($post_id);

            if ('publish' === $status) {
                esc_html_e('Approved', 'woocommerce');
            } elseif ('pending' === $status) {
                esc_html_e('Pending', 'woocommerce');
            } elseif ('draft' === $status) {
                esc_html_e('Rejected', 'woocommerce');
            } else {
                echo esc_html(ucfirst((string) $status));
            }
        }
    }

    public function filter_review_title_placeholder($placeholder) {
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;

        if ($screen && 'nevari_review' === $screen->post_type) {
            return __('Review heading', 'woocommerce');
        }

        return $placeholder;
    }

    public function sync_review_status_change($new_status, $old_status, $post) {
        if (!$post instanceof WP_Post || 'nevari_review' !== $post->post_type || $new_status === $old_status) {
            return;
        }

        $product_id = absint(get_post_meta($post->ID, '_nevari_review_product_id', true));
        $this->sync_product_rating_cache($product_id);
    }

    public function register_review_row_actions($actions, $post) {
        if ('nevari_review' !== $post->post_type || !current_user_can('edit_post', $post->ID)) {
            return $actions;
        }

        $approve_url = wp_nonce_url(
            admin_url('admin.php?action=nevari_approve_review&review_id=' . $post->ID),
            'nevari_review_action_' . $post->ID
        );
        $reject_url = wp_nonce_url(
            admin_url('admin.php?action=nevari_reject_review&review_id=' . $post->ID),
            'nevari_review_action_' . $post->ID
        );

        if ('publish' !== get_post_status($post)) {
            $actions['nevari_approve'] = '<a href="' . esc_url($approve_url) . '">' . esc_html__('Approve', 'woocommerce') . '</a>';
        }

        if ('draft' !== get_post_status($post)) {
            $actions['nevari_reject'] = '<a href="' . esc_url($reject_url) . '">' . esc_html__('Reject', 'woocommerce') . '</a>';
        }

        return $actions;
    }

    public function handle_approve_review_action() {
        $this->update_review_status_from_admin_action('publish');
    }

    public function handle_reject_review_action() {
        $this->update_review_status_from_admin_action('draft');
    }

    private function update_review_status_from_admin_action($status) {
        $review_id = isset($_GET['review_id']) ? absint(wp_unslash($_GET['review_id'])) : 0;

        if (!$review_id || !current_user_can('edit_post', $review_id)) {
            wp_die(esc_html__('You are not allowed to update this review.', 'woocommerce'));
        }

        check_admin_referer('nevari_review_action_' . $review_id);

        wp_update_post(
            array(
                'ID'          => $review_id,
                'post_status' => $status,
            )
        );

        $product_id = absint(get_post_meta($review_id, '_nevari_review_product_id', true));
        $this->sync_product_rating_cache($product_id);

        wp_safe_redirect(wp_get_referer() ? wp_get_referer() : admin_url('edit.php?post_type=nevari_review'));
        exit;
    }

    public function handle_review_submission() {
        if (!isset($_POST['nevari_review_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['nevari_review_nonce'])), 'nevari_submit_review')) {
            wp_die(esc_html__('Security check failed.', 'woocommerce'));
        }

        $product_id = isset($_POST['product_id']) ? absint(wp_unslash($_POST['product_id'])) : 0;
        $product    = $product_id ? wc_get_product($product_id) : false;

        if (!$product) {
            wp_safe_redirect($this->get_product_redirect_url($product_id, 'invalid-product'));
            exit;
        }

        if (!is_user_logged_in()) {
            wp_safe_redirect($this->get_product_redirect_url($product_id, 'login-required'));
            exit;
        }

        $user = wp_get_current_user();

        if (!$this->user_can_review_product($product_id, $user->ID)) {
            wp_safe_redirect($this->get_product_redirect_url($product_id, 'not-eligible'));
            exit;
        }

        $rating = isset($_POST['rating']) ? max(1, min(5, absint(wp_unslash($_POST['rating'])))) : 0;
        $title  = isset($_POST['review_title']) ? sanitize_text_field(wp_unslash($_POST['review_title'])) : '';
        $text   = isset($_POST['review_content']) ? wp_kses_post(wp_unslash($_POST['review_content'])) : '';

        if (!$rating || '' === $title || '' === trim(wp_strip_all_tags($text))) {
            wp_safe_redirect($this->get_product_redirect_url($product_id, 'missing-fields'));
            exit;
        }

        $existing_review_id = $this->get_existing_user_review($product_id, $user->ID);
        $review_data = array(
            'post_type'    => 'nevari_review',
            'post_title'   => $title,
            'post_content' => $text,
            'post_status'  => 'pending',
        );

        if ($existing_review_id) {
            $review_data['ID'] = $existing_review_id;
            $review_id = wp_update_post($review_data, true);
        } else {
            $review_id = wp_insert_post($review_data, true);
        }

        if (is_wp_error($review_id)) {
            wp_safe_redirect($this->get_product_redirect_url($product_id, 'save-failed'));
            exit;
        }

        update_post_meta($review_id, '_nevari_review_product_id', $product_id);
        update_post_meta($review_id, '_nevari_review_rating', $rating);
        update_post_meta($review_id, '_nevari_review_reviewer_name', $user->display_name ?: $user->user_login);
        update_post_meta($review_id, '_nevari_review_reviewer_email', $user->user_email);
        update_post_meta($review_id, '_nevari_review_user_id', $user->ID);
        update_post_meta($review_id, '_nevari_review_verified', '1');
        update_post_meta($review_id, '_nevari_review_helpful_count', absint(get_post_meta($review_id, '_nevari_review_helpful_count', true)));

        wp_safe_redirect($this->get_product_redirect_url($product_id, 'submitted'));
        exit;
    }

    public function handle_helpful_vote() {
        check_ajax_referer('nevari-review-helpful', 'nonce');

        $review_id = isset($_POST['review_id']) ? absint(wp_unslash($_POST['review_id'])) : 0;

        if (!$review_id || 'nevari_review' !== get_post_type($review_id) || 'publish' !== get_post_status($review_id)) {
            wp_send_json_error(array('message' => __('Review not found.', 'woocommerce')), 404);
        }

        $count = absint(get_post_meta($review_id, '_nevari_review_helpful_count', true));
        $count++;
        update_post_meta($review_id, '_nevari_review_helpful_count', $count);

        wp_send_json_success(
            array(
                'count' => $count,
            )
        );
    }

    public function render_add_to_cart_snackbar() {
        if (!$this->add_to_cart_snackbar_enabled || $this->add_to_cart_snackbar_rendered) {
            return;
        }

        $this->add_to_cart_snackbar_rendered = true;

        $config = $this->get_add_to_cart_snackbar_config();
        $snackbar_style = sprintf(
            '--nevari-snackbar-bg:%1$s;--nevari-snackbar-text:%2$s;--nevari-snackbar-icon:%3$s;--nevari-snackbar-font:%4$s;--nevari-snackbar-font-size:%5$dpx;--nevari-snackbar-font-weight:%6$d;--nevari-snackbar-radius:%7$dpx;--nevari-snackbar-icon-size:%8$dpx;',
            esc_attr($config['bgColor']),
            esc_attr($config['textColor']),
            esc_attr($config['iconColor']),
            esc_attr($config['fontFamily']),
            (int) $config['fontSize'],
            (int) $config['fontWeight'],
            (int) $config['radius'],
            (int) $config['iconSize']
        );
        ?>
        <div
            class="nevari-add-to-cart-snackbar nevari-add-to-cart-snackbar--<?php echo esc_attr($config['position']); ?>"
            data-nevari-add-to-cart-snackbar
            data-position="<?php echo esc_attr($config['position']); ?>"
            data-duration="<?php echo esc_attr((int) $config['duration']); ?>"
            style="<?php echo esc_attr($snackbar_style); ?>"
            hidden
            aria-hidden="true"
            role="status"
            aria-live="polite"
            aria-atomic="true"
        >
            <div class="nevari-add-to-cart-snackbar__surface">
                <?php if (!empty($config['showIcon'])) : ?>
                    <?php echo $this->get_add_to_cart_icon_markup($config['iconType'], $config['iconUrl'], $config['iconColor'], $config['iconSize'], 'snackbar'); ?>
                <?php endif; ?>
                <div class="nevari-add-to-cart-snackbar__content">
                    <strong class="nevari-add-to-cart-snackbar__title" data-nevari-snackbar-title><?php echo esc_html($config['title']); ?></strong>
                    <span class="nevari-add-to-cart-snackbar__message" data-nevari-snackbar-message></span>
                </div>
                <div class="nevari-add-to-cart-snackbar__actions">
                    <a
                        class="nevari-add-to-cart-snackbar__action nevari-add-to-cart-snackbar__action--cart"
                        data-nevari-snackbar-cart
                        href="<?php echo esc_url($config['cartUrl']); ?>"
                    >
                        <?php echo esc_html($config['cartLabel']); ?>
                    </a>
                    <a
                        class="nevari-add-to-cart-snackbar__action nevari-add-to-cart-snackbar__action--continue"
                        data-nevari-snackbar-continue
                        href="<?php echo esc_url($config['continueUrl']); ?>"
                    >
                        <?php echo esc_html($config['continueLabel']); ?>
                    </a>
                </div>
            </div>
        </div>
        <?php
    }

    public function build_add_to_cart_snackbar_payload($product, $quantity = 1) {
        if (!$product instanceof WC_Product) {
            return array();
        }

        $config = $this->get_add_to_cart_snackbar_config();
        $message = str_replace('{product_name}', $product->get_name(), $config['messageTemplate']);

        return array(
            'title'            => $config['title'],
            'message'          => $message,
            'cartUrl'          => $config['cartUrl'],
            'continueUrl'      => $config['continueUrl'],
            'cartLabel'        => $config['cartLabel'],
            'continueLabel'    => $config['continueLabel'],
            'showCartLink'     => $config['showCartLink'],
            'showContinueLink' => $config['showContinueLink'],
            'position'         => $config['position'],
            'duration'         => $config['duration'],
            'quantity'         => max(1, absint($quantity)),
            'productName'      => $product->get_name(),
        );
    }

    public function get_product_notice() {
        if (empty($_GET['nevari-review-status'])) {
            return '';
        }

        $status = sanitize_key(wp_unslash($_GET['nevari-review-status']));
        $map = array(
            'submitted'      => array('success', __('Your review has been submitted for approval.', 'woocommerce')),
            'not-eligible'   => array('error', __('Only verified buyers can review this product.', 'woocommerce')),
            'login-required' => array('notice', __('Please sign in to submit a verified review.', 'woocommerce')),
            'missing-fields' => array('error', __('Please complete the rating, title, and review message fields.', 'woocommerce')),
            'save-failed'    => array('error', __('The review could not be saved. Please try again.', 'woocommerce')),
            'invalid-product'=> array('error', __('The requested product could not be found.', 'woocommerce')),
        );

        if (!isset($map[$status])) {
            return '';
        }

        list($type, $message) = $map[$status];

        return '<div class="nevari-product-notice nevari-product-notice--' . esc_attr($type) . '">' . esc_html($message) . '</div>';
    }

    public function get_product_gallery($product) {
        $image_ids = array_filter(
            array_merge(
                array($product->get_image_id()),
                $product->get_gallery_image_ids()
            )
        );

        if (empty($image_ids)) {
            return array(
                array(
                    'id'    => 0,
                    'full'  => wc_placeholder_img_src('full'),
                    'thumb' => wc_placeholder_img_src('woocommerce_thumbnail'),
                    'alt'   => $product->get_name(),
                ),
            );
        }

        $gallery = array();

        foreach ($image_ids as $image_id) {
            $gallery[] = array(
                'id'    => $image_id,
                'full'  => wp_get_attachment_image_url($image_id, 'large'),
                'thumb' => wp_get_attachment_image_url($image_id, 'woocommerce_thumbnail'),
                'alt'   => get_post_meta($image_id, '_wp_attachment_image_alt', true) ?: $product->get_name(),
            );
        }

        return $gallery;
    }

    public function get_about_highlights($product) {
        $highlights = array();
        $badge_text = $this->get_product_attribute_or_meta($product, array('product-badge', 'badge', 'highlight_badge'), '_nevari_product_badge');
        $guarantee  = $this->get_product_attribute_or_meta($product, array('guarantee', 'satisfaction-guarantee', 'satisfaction_guarantee'), '_nevari_satisfaction_guarantee');

        if ($badge_text) {
            $highlights[] = array(
                'icon'  => 'award',
                'title' => $badge_text,
                'link'  => '#nevari-product-details',
                'link_text' => __('View More', 'woocommerce'),
            );
        } elseif ($product->is_featured()) {
            $highlights[] = array(
                'icon'  => 'award',
                'title' => __('Best Seller Product', 'woocommerce'),
                'link'  => '#nevari-product-details',
                'link_text' => __('View More', 'woocommerce'),
            );
        }

        $short_description = trim(wp_strip_all_tags($product->get_short_description()));

        if ($short_description) {
            $highlights[] = array(
                'icon'  => 'spark',
                'title' => wp_trim_words($short_description, 10, ''),
            );
        }

        if ($guarantee) {
            $highlights[] = array(
                'icon'  => 'check',
                'title' => $guarantee,
            );
        }

        return array_slice($highlights, 0, 3);
    }

    public function get_product_sections($product) {
        $description = $product->get_description();
        $storage     = $this->get_product_attribute_or_meta($product, array('storage', 'conservation-and-storage', 'conservation_storage'), '_nevari_conservation_storage');
        $ingredients = $this->get_product_attribute_or_meta($product, array('ingredients', 'ingredient'), '_nevari_ingredients');
        $sections    = array();

        if ('' !== trim(wp_strip_all_tags($description))) {
            $sections[] = array(
                'slug'    => 'details',
                'title'   => __('Details', 'woocommerce'),
                'content' => $description,
            );
        }

        if ('' !== trim(wp_strip_all_tags($storage))) {
            $sections[] = array(
                'slug'    => 'storage',
                'title'   => __('Conservation and storage', 'woocommerce'),
                'content' => $storage,
            );
        }

        if ('' !== trim(wp_strip_all_tags($ingredients))) {
            $sections[] = array(
                'slug'    => 'ingredients',
                'title'   => __('Ingredients', 'woocommerce'),
                'content' => $ingredients,
            );
        }

        return $sections;
    }

    public function get_product_review_stats($product_id) {
        $product = wc_get_product($product_id);

        if (!$product instanceof WC_Product) {
            return array(
                'total'        => 0,
                'average'      => 0,
                'distribution'  => array(5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0),
            );
        }

        $distribution = $product->get_rating_counts();

        return array(
            'total'        => (int) $product->get_review_count(),
            'average'      => (float) $product->get_average_rating(),
            'distribution' => array(
                5 => isset($distribution[5]) ? absint($distribution[5]) : 0,
                4 => isset($distribution[4]) ? absint($distribution[4]) : 0,
                3 => isset($distribution[3]) ? absint($distribution[3]) : 0,
                2 => isset($distribution[2]) ? absint($distribution[2]) : 0,
                1 => isset($distribution[1]) ? absint($distribution[1]) : 0,
            ),
        );
    }

    public function get_frontend_reviews_payload($product_id, $limit = 0) {
        $product = wc_get_product($product_id);

        if (!$product instanceof WC_Product) {
            return array(
                'stats'        => array('total' => 0, 'average' => 0, 'distribution' => array(5 => 0, 4 => 0, 3 => 0, 2 => 0, 1 => 0)),
                'distribution' => array(),
                'reviews'      => array(),
                'page'         => 1,
                'pages'        => 1,
                'per_page'     => 0,
                'total'        => 0,
                'can_review'   => false,
                'access_type'  => 'missing',
                'access_message' => __('The requested product could not be found.', 'woocommerce'),
            );
        }

        $current_page = isset($_GET['cpage']) ? max(1, absint(wp_unslash($_GET['cpage']))) : 1;
        $per_page     = $limit > 0 ? absint($limit) : 0;
        if (0 === $per_page) {
            $per_page = 5;
        }

        $comments_args = array(
            'post_id'                => $product_id,
            'status'                 => 'approve',
            'type__in'               => array('review', 'comment'),
            'parent'                 => 0,
            'orderby'                => 'comment_date_gmt',
            'order'                  => 'DESC',
            'count'                  => false,
            'number'                 => $per_page,
            'offset'                 => ($current_page - 1) * $per_page,
            'update_comment_meta_cache' => true,
            'update_comment_post_cache'  => false,
        );

        $reviews_comments = get_comments($comments_args);
        $total_reviews     = (int) get_comments(array(
            'post_id' => $product_id,
            'status'  => 'approve',
            'type__in' => array('review', 'comment'),
            'parent'  => 0,
            'count'   => true,
        ));
        $stats = $this->get_product_review_stats($product_id);
        $reviews = array();

        foreach ($reviews_comments as $comment) {
            $rating = max(1, min(5, absint(get_comment_meta($comment->comment_ID, 'rating', true))));

            $reviews[] = array(
                'id'            => $comment->comment_ID,
                'title'         => '',
                'content'       => wp_kses_post(wpautop(apply_filters('comment_text', $comment->comment_content, $comment))),
                'rating'        => $rating,
                'reviewer_name' => get_comment_author($comment),
                'verified'      => function_exists('wc_review_is_from_verified_owner') ? wc_review_is_from_verified_owner($comment->comment_ID) : false,
                'date'          => get_comment_date('', $comment),
                'date_iso'      => get_comment_date('c', $comment),
            );
        }

        $distribution = array();

        for ($stars = 5; $stars >= 1; $stars--) {
            $count = isset($stats['distribution'][$stars]) ? (int) $stats['distribution'][$stars] : 0;

            $distribution[] = array(
                'stars'   => $stars,
                'count'   => $count,
                'percent' => !empty($stats['total']) ? round(($count / max(1, $stats['total'])) * 100, 2) : 0,
            );
        }

        $can_review = $this->is_user_eligible_to_review_product($product_id, get_current_user_id());
        $access_type = 'eligible';
        $access_message = '';
        $login_url = '';

        if (!$can_review) {
            if (!is_user_logged_in()) {
                $access_type = 'login';
                $login_url = wc_get_page_permalink('myaccount');
                $access_message = $login_url
                    ? sprintf(
                        __('Please %1$ssign in%2$s to review this product.', 'woocommerce'),
                        '<a href="' . esc_url($login_url) . '">',
                        '</a>'
                    )
                    : __('Please sign in to review this product.', 'woocommerce');
            } else {
                $access_type = 'purchase';
                $access_message = __('Only customers who have purchased this product can leave a review', 'woocommerce');
            }
        }

        return array(
            'stats'          => $stats,
            'distribution'   => $distribution,
            'reviews'        => $reviews,
            'page'           => $current_page,
            'pages'          => max(1, (int) ceil($total_reviews / $per_page)),
            'per_page'       => $per_page,
            'total'          => $total_reviews,
            'can_review'     => $can_review,
            'access_type'    => $access_type,
            'access_message' => $access_message,
            'login_url'      => $login_url,
            'sort'           => 'recent',
            'sort_options'   => array(),
        );
    }

    public function get_current_review_sort() {
        $allowed = array('recent', 'rating_high', 'rating_low', 'helpful');
        $sort    = isset($_GET['nevari_review_sort']) ? sanitize_key(wp_unslash($_GET['nevari_review_sort'])) : 'recent';

        return in_array($sort, $allowed, true) ? $sort : 'recent';
    }

    public function get_review_sort_options() {
        return array(
            'recent'      => __('Recent', 'woocommerce'),
            'rating_high' => __('Highest rating', 'woocommerce'),
            'rating_low'  => __('Lowest rating', 'woocommerce'),
            'helpful'     => __('Most helpful', 'woocommerce'),
        );
    }

    public function user_can_review_product($product_id, $user_id) {
        return $this->is_user_eligible_to_review_product($product_id, $user_id);
    }

    public function get_existing_user_review($product_id, $user_id) {
        return 0;
    }

    public function render_stars($rating) {
        $rating = max(0, min(5, (int) $rating));
        $output = '<span class="nevari-review-stars" aria-label="' . esc_attr(sprintf(__('Rated %d out of 5', 'woocommerce'), $rating)) . '">';

        for ($i = 1; $i <= 5; $i++) {
            $output .= '<span class="' . ($i <= $rating ? 'is-filled' : '') . '">&#9733;</span>';
        }

        $output .= '</span>';

        return $output;
    }

    public function sync_product_rating_cache($product_id) {
        if (!$product_id) {
            return;
        }

        $product = wc_get_product($product_id);

        if (!$product instanceof WC_Product) {
            return;
        }

        if (class_exists('WC_Comments')) {
            $product->set_rating_counts(WC_Comments::get_rating_counts_for_product($product));
            $product->set_average_rating(WC_Comments::get_average_rating_for_product($product));
            $product->set_review_count(WC_Comments::get_review_count_for_product($product));
            $product->save();
        }
    }

    public function is_user_eligible_to_review_product($product_id, $user_id = 0) {
        $user_id = absint($user_id);

        if (!$user_id || !is_user_logged_in()) {
            return false;
        }

        $user = get_userdata($user_id);

        if (!$user) {
            return false;
        }

        return wc_customer_bought_product($user->user_email, $user_id, $product_id);
    }

    public function filter_comments_template($template) {
        if (!function_exists('is_product') || !is_product()) {
            return $template;
        }

        $candidate = $this->plugin_path . 'templates/woocommerce/native-single-product-reviews.php';

        return file_exists($candidate) ? $candidate : $template;
    }

    public function validate_review_submission($commentdata) {
        if (is_admin() || empty($commentdata['comment_post_ID'])) {
            return $commentdata;
        }

        $post_id = absint($commentdata['comment_post_ID']);

        if ('product' !== get_post_type($post_id)) {
            return $commentdata;
        }

        if (
            !isset($_POST['nevari_review_nonce']) ||
            !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['nevari_review_nonce'])), 'nevari_submit_review')
        ) {
            wp_die(esc_html__('Security check failed.', 'woocommerce'), esc_html__('Reviews are restricted', 'woocommerce'), array('response' => 403));
        }

        $rating = isset($_POST['rating']) ? absint(wp_unslash($_POST['rating'])) : 0;

        if (!is_user_logged_in()) {
            wp_die(esc_html__('Only customers who have purchased this product can leave a review', 'woocommerce'), esc_html__('Reviews are restricted', 'woocommerce'), array('response' => 403));
        }

        if (!$this->is_user_eligible_to_review_product($post_id, get_current_user_id())) {
            wp_die(esc_html__('Only customers who have purchased this product can leave a review', 'woocommerce'), esc_html__('Reviews are restricted', 'woocommerce'), array('response' => 403));
        }

        if ($rating < 1 || $rating > 5) {
            wp_die(esc_html__('Please choose a rating before submitting your review.', 'woocommerce'), esc_html__('Rating required', 'woocommerce'), array('response' => 400));
        }

        $comment_type = isset($commentdata['comment_type']) ? (string) $commentdata['comment_type'] : '';

        if ('' === $comment_type || 'comment' === $comment_type) {
            $commentdata['comment_type'] = 'review';
        }

        return $commentdata;
    }

    private function get_product_attribute_or_meta($product, $attribute_keys, $meta_key) {
        $meta = trim((string) get_post_meta($product->get_id(), $meta_key, true));

        if ('' !== $meta) {
            return $meta;
        }

        foreach ($attribute_keys as $attribute_key) {
            $value = $product->get_attribute($attribute_key);

            if ('' !== trim((string) $value)) {
                return $value;
            }

            $taxonomy_value = $product->get_attribute('pa_' . $attribute_key);

            if ('' !== trim((string) $taxonomy_value)) {
                return $taxonomy_value;
            }
        }

        return '';
    }

    private function get_continue_shopping_url() {
        if (function_exists('wc_get_page_permalink')) {
            $shop_url = wc_get_page_permalink('shop');

            if ($shop_url) {
                return $shop_url;
            }
        }

        return home_url('/');
    }

    private function get_product_redirect_url($product_id, $status) {
        $url = $product_id ? get_permalink($product_id) : home_url('/');

        return add_query_arg('nevari-review-status', sanitize_key($status), $url);
    }
}
