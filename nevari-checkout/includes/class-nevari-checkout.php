<?php
/**
 * Core implementation for Nevari Checkout.
 */

if (!defined('ABSPATH')) {
    exit;
}

require_once __DIR__ . '/class-nevari-product-experience.php';
require_once __DIR__ . '/class-nevari-elementor.php';

final class Nevari_Checkout {
    private static $instance = null;
    private static $plugin_file = '';
    private $cart_total_shortcode_assets_enqueued = false;

    public static function instance($plugin_file = '') {
        if (!empty($plugin_file)) {
            self::$plugin_file = $plugin_file;
        }

        if (self::$instance === null) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    private function __construct() {
    add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
    add_action('admin_enqueue_scripts', array($this, 'enqueue_admin_assets'));
    add_action('admin_init', array($this, 'redirect_legacy_admin_pages'), 1);
    add_action('wp_ajax_nevari_get_cart_total', array($this, 'ajax_get_cart_total'));
    add_action('wp_ajax_nopriv_nevari_get_cart_total', array($this, 'ajax_get_cart_total'));
    add_action('wp_ajax_nevari_update_cart_quantity', array($this, 'ajax_update_cart_quantity'));
    add_action('wp_ajax_nopriv_nevari_update_cart_quantity', array($this, 'ajax_update_cart_quantity'));
    add_action('wp_ajax_nevari_apply_checkout_coupon', array($this, 'ajax_apply_checkout_coupon'));
    add_action('wp_ajax_nopriv_nevari_apply_checkout_coupon', array($this, 'ajax_apply_checkout_coupon'));
    add_action('wp_ajax_nevari_remove_checkout_coupon', array($this, 'ajax_remove_checkout_coupon'));
    add_action('wp_ajax_nopriv_nevari_remove_checkout_coupon', array($this, 'ajax_remove_checkout_coupon'));
    add_action('wp_ajax_nevari_auth_widget_login', array($this, 'ajax_auth_widget_login'));
    add_action('wp_ajax_nopriv_nevari_auth_widget_login', array($this, 'ajax_auth_widget_login'));
    add_action('wp_ajax_nevari_auth_widget_signup', array($this, 'ajax_auth_widget_signup'));
    add_action('wp_ajax_nopriv_nevari_auth_widget_signup', array($this, 'ajax_auth_widget_signup'));
    add_action('wp_ajax_nevari_auth_widget_reset_password', array($this, 'ajax_auth_widget_reset_password'));
    add_action('wp_ajax_nopriv_nevari_auth_widget_reset_password', array($this, 'ajax_auth_widget_reset_password'));
    add_action('wp_ajax_nevari_auth_widget_verify_code', array($this, 'ajax_auth_widget_verify_code'));
    add_action('wp_ajax_nopriv_nevari_auth_widget_verify_code', array($this, 'ajax_auth_widget_verify_code'));
    add_action('wp_ajax_nevari_auth_widget_resend_code', array($this, 'ajax_auth_widget_resend_code'));
    add_action('wp_ajax_nopriv_nevari_auth_widget_resend_code', array($this, 'ajax_auth_widget_resend_code'));
    add_action('admin_init', array($this, 'register_settings'));
    add_action('admin_menu', array($this, 'register_settings_page'));
    add_shortcode('nevari_cart_total', array($this, 'render_cart_total_shortcode'));
    add_shortcode('nevari_cart', array($this, 'render_cart_shortcode'));
    add_shortcode('nevari_cart_page', array($this, 'render_cart_shortcode'));
    add_shortcode('nevari_checkout', array($this, 'render_checkout_shortcode'));
    add_shortcode('nevari_checkout_page', array($this, 'render_checkout_shortcode'));
    // Checkout page override
    add_filter('the_content', array($this, 'replace_checkout_page_content'), 999);

    // Thank you page override (ADD THIS)
    add_filter('the_content', array($this, 'replace_thankyou_page_content'), 1000);

    add_filter('woocommerce_checkout_fields', array($this, 'make_default_fields_optional'));
    add_action('woocommerce_checkout_process', array($this, 'validate_custom_fields'));
    add_action('woocommerce_checkout_create_order', array($this, 'save_custom_fields'), 20, 2);

    add_action('woocommerce_cart_calculate_fees', array($this, 'apply_tip_fee'));
    add_action('woocommerce_checkout_update_order_review', array($this, 'update_tip_session_from_checkout'));
    add_filter('woocommerce_package_rates', array($this, 'maybe_apply_free_shipping_rates'), 100, 2);

    Nevari_Product_Experience::instance($this->get_plugin_file());

    if (did_action('elementor/loaded')) {
        Nevari_Elementor::instance($this->get_plugin_file());
    } else {
        add_action('elementor/loaded', function () {
            Nevari_Elementor::instance($this->get_plugin_file());
        });
    }
    }

    private function get_plugin_file() {
        return self::$plugin_file;
    }

    public function register_settings() {
        register_setting(
            'nevari_checkout_settings',
            'nevari_free_shipping_threshold',
            array(
                'type' => 'number',
                'sanitize_callback' => array($this, 'sanitize_price_setting'),
                'default' => 0,
            )
        );

        register_setting(
            'nevari_checkout_settings',
            'nevari_checkout_design_options',
            array(
                'type'              => 'array',
                'sanitize_callback' => array($this, 'sanitize_checkout_design_options'),
                'default'           => $this->get_checkout_design_default_options(),
            )
        );

        register_setting(
            'nevari_checkout_settings',
            'nevari_thankyou_design_options',
            array(
                'type'              => 'array',
                'sanitize_callback' => array($this, 'sanitize_thankyou_design_options'),
                'default'           => $this->get_thankyou_design_default_options(),
            )
        );

        register_setting(
            'nevari_checkout_settings',
            'nevari_tip_options',
            array(
                'type'              => 'array',
                'sanitize_callback' => array($this, 'sanitize_tip_options'),
                'default'           => $this->get_tip_default_options(),
            )
        );
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

    public function get_ui_icon_options() {
        return array(
            'info'   => __('Info', 'woocommerce'),
            'shield' => __('Shield', 'woocommerce'),
            'spark'  => __('Spark', 'woocommerce'),
            'gift'   => __('Gift', 'woocommerce'),
            'pin'    => __('Pin', 'woocommerce'),
            'check'  => __('Check', 'woocommerce'),
            'heart'  => __('Heart', 'woocommerce'),
        );
    }

    public function get_checkout_design_default_options() {
        return array(
            'page_font_family'       => 'Product Sans, Inter, Arial, sans-serif',
            'title_color'            => '#123b5c',
            'title_font_family'      => 'Product Sans, Inter, Arial, sans-serif',
            'title_font_size'        => 40,
            'title_font_weight'      => 500,
            'review_title_color'     => '#123b5c',
            'review_title_font_family' => 'Product Sans, Inter, Arial, sans-serif',
            'review_title_font_size' => 22,
            'review_title_font_weight' => 500,
            'banner_enabled'         => 1,
            'banner_title'           => __('Checkout with confidence', 'woocommerce'),
            'banner_text'            => __('Review your delivery details and choose a tip before placing the order.', 'woocommerce'),
            'banner_icon'            => 'shield',
            'banner_icon_custom_url' => '',
            'banner_bg_color'        => '#f7f5fb',
            'banner_text_color'      => '#123b5c',
            'banner_accent_color'    => '#184363',
            'banner_font_family'     => 'Inter, Arial, sans-serif',
            'banner_font_size'       => 14,
            'banner_font_weight'     => 500,
            'card_bg_color'          => '#ffffff',
            'card_border_color'      => '#eeeeee',
            'card_border_radius'     => 14,
            'summary_bg_color'       => '#ffffff',
            'summary_border_color'   => '#eeeeee',
            'summary_border_radius'  => 14,
            'summary_text_color'     => '#111111',
            'summary_heading_color'  => '#123b5c',
            'summary_heading_font_family' => 'Product Sans, Inter, Arial, sans-serif',
            'summary_heading_font_size' => 22,
            'summary_heading_font_weight' => 500,
            'summary_label_color'    => '#6b6673',
            'summary_label_font_family' => 'Inter, Arial, sans-serif',
            'summary_label_font_size' => 14,
            'summary_label_font_weight' => 500,
            'summary_value_color'    => '#111111',
            'summary_value_font_family' => 'Inter, Arial, sans-serif',
            'summary_value_font_size' => 14,
            'summary_value_font_weight' => 600,
            'tip_heading_color'      => '#123b5c',
            'tip_heading_font_family' => 'Product Sans, Inter, Arial, sans-serif',
            'tip_heading_font_size'  => 20,
            'tip_heading_font_weight' => 500,
            'tip_note_color'         => '#777777',
            'tip_note_font_family'   => 'Inter, Arial, sans-serif',
            'tip_note_font_size'     => 11,
            'tip_note_font_weight'   => 400,
            'coupon_label_color'     => '#123b5c',
            'coupon_label_font_family' => 'Inter, Arial, sans-serif',
            'coupon_label_font_size' => 14,
            'coupon_label_font_weight' => 500,
            'coupon_toggle_color'    => '#0a9af2',
            'coupon_toggle_font_family' => 'Inter, Arial, sans-serif',
            'coupon_toggle_font_size' => 11,
            'coupon_toggle_font_weight' => 500,
            'coupon_input_bg_color'  => '#f7f5fb',
            'coupon_input_text_color' => '#031b39',
            'coupon_input_font_family' => 'Inter, Arial, sans-serif',
            'coupon_input_font_size' => 14,
            'coupon_input_font_weight' => 400,
            'coupon_submit_bg_color'  => '#17496c',
            'coupon_submit_text_color' => '#ffffff',
            'coupon_submit_font_family' => 'Inter, Arial, sans-serif',
            'coupon_submit_font_size' => 12,
            'coupon_submit_font_weight' => 500,
            'total_color'            => '#111111',
            'total_font_family'      => 'Inter, Arial, sans-serif',
            'total_font_size'        => 16,
            'total_font_weight'      => 600,
            'legal_color'            => '#777777',
            'legal_font_family'      => 'Inter, Arial, sans-serif',
            'legal_font_size'        => 11,
            'legal_font_weight'      => 400,
            'place_order_bg_color'   => '#17496c',
            'place_order_text_color' => '#ffffff',
            'place_order_font_family' => 'Inter, Arial, sans-serif',
            'place_order_font_size'  => 14,
            'place_order_font_weight' => 600,
            'review_badge_icon'      => 'info',
            'review_badge_icon_custom_url' => '',
            'review_badge_icon_color' => '#123b5c',
            'info_notice_bg_color'   => '#f2f7fb',
            'info_notice_text_color' => '#17496c',
            'info_notice_icon'       => 'info',
            'info_notice_icon_custom_url' => '',
        );
    }

    public function get_thankyou_design_default_options() {
        return array(
            'page_font_family'       => 'Product Sans, Inter, Arial, sans-serif',
            'title_color'            => '#184363',
            'title_font_family'      => 'Product Sans, Inter, Arial, sans-serif',
            'title_font_size'        => 36,
            'title_font_weight'      => 400,
            'banner_enabled'         => 1,
            'banner_title'           => __('Order received', 'woocommerce'),
            'banner_text'            => __('Your order is being prepared. Keep this page open for the latest progress.', 'woocommerce'),
            'banner_icon'            => 'check',
            'banner_bg_color'        => '#f2f7fb',
            'banner_text_color'      => '#123b5c',
            'banner_accent_color'    => '#184363',
            'banner_font_family'     => 'Inter, Arial, sans-serif',
            'banner_font_size'       => 14,
            'banner_font_weight'     => 500,
            'card_bg_color'          => '#ffffff',
            'card_border_color'      => '#eeeeee',
            'summary_bg_color'       => '#ffffff',
            'summary_border_color'   => '#eeeeee',
            'summary_text_color'     => '#122f4b',
        );
    }

    public function get_tip_default_options() {
        return array(
            'tip_list'               => "5\n10\n15\n20\n25\n30",
            'title'                  => __('Delivery Tip', 'woocommerce'),
            'note'                   => __('Your delivery person keeps 100% of tips.', 'woocommerce'),
            'button_bg_color'        => '#faf8f9',
            'button_text_color'      => '#111111',
            'button_active_bg_color' => '#184363',
            'button_active_text_color' => '#ffffff',
            'button_font_family'     => 'Inter, Arial, sans-serif',
            'button_font_size'       => 11,
            'button_font_weight'     => 500,
            'button_border_radius'   => 12,
            'button_icon_color'      => '#184363',
            'button_icon'            => 'heart',
        );
    }

    public function get_checkout_design_options() {
        $options = get_option('nevari_checkout_design_options', array());

        return wp_parse_args(is_array($options) ? $options : array(), $this->get_checkout_design_default_options());
    }

    public function get_thankyou_design_options() {
        $options = get_option('nevari_thankyou_design_options', array());

        return wp_parse_args(is_array($options) ? $options : array(), $this->get_thankyou_design_default_options());
    }

    public function get_tip_settings() {
        $options = get_option('nevari_tip_options', array());

        return wp_parse_args(is_array($options) ? $options : array(), $this->get_tip_default_options());
    }

    public function sanitize_checkout_design_options($input) {
        $defaults = $this->get_checkout_design_default_options();
        $input    = is_array($input) ? $input : array();
        $icon_options = array_keys($this->get_ui_icon_options());

        return array(
            'page_font_family'       => isset($input['page_font_family']) ? sanitize_text_field(wp_unslash($input['page_font_family'])) : $defaults['page_font_family'],
            'title_color'            => isset($input['title_color']) && sanitize_hex_color($input['title_color']) ? sanitize_hex_color($input['title_color']) : $defaults['title_color'],
            'title_font_family'      => isset($input['title_font_family']) ? sanitize_text_field(wp_unslash($input['title_font_family'])) : $defaults['title_font_family'],
            'title_font_size'        => isset($input['title_font_size']) ? max(16, absint($input['title_font_size'])) : $defaults['title_font_size'],
            'title_font_weight'      => isset($input['title_font_weight']) ? max(300, min(900, absint($input['title_font_weight']))) : $defaults['title_font_weight'],
            'review_title_color'     => isset($input['review_title_color']) && sanitize_hex_color($input['review_title_color']) ? sanitize_hex_color($input['review_title_color']) : $defaults['review_title_color'],
            'review_title_font_family' => isset($input['review_title_font_family']) ? sanitize_text_field(wp_unslash($input['review_title_font_family'])) : $defaults['review_title_font_family'],
            'review_title_font_size' => isset($input['review_title_font_size']) ? max(14, absint($input['review_title_font_size'])) : $defaults['review_title_font_size'],
            'review_title_font_weight' => isset($input['review_title_font_weight']) ? max(300, min(900, absint($input['review_title_font_weight']))) : $defaults['review_title_font_weight'],
            'banner_enabled'         => !empty($input['banner_enabled']) ? 1 : 0,
            'banner_title'           => isset($input['banner_title']) ? sanitize_text_field(wp_unslash($input['banner_title'])) : $defaults['banner_title'],
            'banner_text'            => isset($input['banner_text']) ? sanitize_textarea_field(wp_unslash($input['banner_text'])) : $defaults['banner_text'],
            'banner_icon'            => isset($input['banner_icon']) && in_array(sanitize_key(wp_unslash($input['banner_icon'])), $icon_options, true) ? sanitize_key(wp_unslash($input['banner_icon'])) : $defaults['banner_icon'],
            'banner_icon_custom_url' => isset($input['banner_icon_custom_url']) ? esc_url_raw(wp_unslash($input['banner_icon_custom_url'])) : $defaults['banner_icon_custom_url'],
            'banner_bg_color'        => isset($input['banner_bg_color']) && sanitize_hex_color($input['banner_bg_color']) ? sanitize_hex_color($input['banner_bg_color']) : $defaults['banner_bg_color'],
            'banner_text_color'      => isset($input['banner_text_color']) && sanitize_hex_color($input['banner_text_color']) ? sanitize_hex_color($input['banner_text_color']) : $defaults['banner_text_color'],
            'banner_accent_color'    => isset($input['banner_accent_color']) && sanitize_hex_color($input['banner_accent_color']) ? sanitize_hex_color($input['banner_accent_color']) : $defaults['banner_accent_color'],
            'banner_font_family'     => isset($input['banner_font_family']) ? sanitize_text_field(wp_unslash($input['banner_font_family'])) : $defaults['banner_font_family'],
            'banner_font_size'       => isset($input['banner_font_size']) ? max(12, absint($input['banner_font_size'])) : $defaults['banner_font_size'],
            'banner_font_weight'     => isset($input['banner_font_weight']) ? max(300, min(900, absint($input['banner_font_weight']))) : $defaults['banner_font_weight'],
            'card_bg_color'          => isset($input['card_bg_color']) && sanitize_hex_color($input['card_bg_color']) ? sanitize_hex_color($input['card_bg_color']) : $defaults['card_bg_color'],
            'card_border_color'      => isset($input['card_border_color']) && sanitize_hex_color($input['card_border_color']) ? sanitize_hex_color($input['card_border_color']) : $defaults['card_border_color'],
            'card_border_radius'     => isset($input['card_border_radius']) ? max(0, absint($input['card_border_radius'])) : $defaults['card_border_radius'],
            'summary_bg_color'       => isset($input['summary_bg_color']) && sanitize_hex_color($input['summary_bg_color']) ? sanitize_hex_color($input['summary_bg_color']) : $defaults['summary_bg_color'],
            'summary_border_color'   => isset($input['summary_border_color']) && sanitize_hex_color($input['summary_border_color']) ? sanitize_hex_color($input['summary_border_color']) : $defaults['summary_border_color'],
            'summary_border_radius'  => isset($input['summary_border_radius']) ? max(0, absint($input['summary_border_radius'])) : $defaults['summary_border_radius'],
            'summary_text_color'     => isset($input['summary_text_color']) && sanitize_hex_color($input['summary_text_color']) ? sanitize_hex_color($input['summary_text_color']) : $defaults['summary_text_color'],
            'summary_heading_color'  => isset($input['summary_heading_color']) && sanitize_hex_color($input['summary_heading_color']) ? sanitize_hex_color($input['summary_heading_color']) : $defaults['summary_heading_color'],
            'summary_heading_font_family' => isset($input['summary_heading_font_family']) ? sanitize_text_field(wp_unslash($input['summary_heading_font_family'])) : $defaults['summary_heading_font_family'],
            'summary_heading_font_size' => isset($input['summary_heading_font_size']) ? max(14, absint($input['summary_heading_font_size'])) : $defaults['summary_heading_font_size'],
            'summary_heading_font_weight' => isset($input['summary_heading_font_weight']) ? max(300, min(900, absint($input['summary_heading_font_weight']))) : $defaults['summary_heading_font_weight'],
            'summary_label_color'    => isset($input['summary_label_color']) && sanitize_hex_color($input['summary_label_color']) ? sanitize_hex_color($input['summary_label_color']) : $defaults['summary_label_color'],
            'summary_label_font_family' => isset($input['summary_label_font_family']) ? sanitize_text_field(wp_unslash($input['summary_label_font_family'])) : $defaults['summary_label_font_family'],
            'summary_label_font_size' => isset($input['summary_label_font_size']) ? max(10, absint($input['summary_label_font_size'])) : $defaults['summary_label_font_size'],
            'summary_label_font_weight' => isset($input['summary_label_font_weight']) ? max(300, min(900, absint($input['summary_label_font_weight']))) : $defaults['summary_label_font_weight'],
            'summary_value_color'    => isset($input['summary_value_color']) && sanitize_hex_color($input['summary_value_color']) ? sanitize_hex_color($input['summary_value_color']) : $defaults['summary_value_color'],
            'summary_value_font_family' => isset($input['summary_value_font_family']) ? sanitize_text_field(wp_unslash($input['summary_value_font_family'])) : $defaults['summary_value_font_family'],
            'summary_value_font_size' => isset($input['summary_value_font_size']) ? max(10, absint($input['summary_value_font_size'])) : $defaults['summary_value_font_size'],
            'summary_value_font_weight' => isset($input['summary_value_font_weight']) ? max(300, min(900, absint($input['summary_value_font_weight']))) : $defaults['summary_value_font_weight'],
            'tip_heading_color'      => isset($input['tip_heading_color']) && sanitize_hex_color($input['tip_heading_color']) ? sanitize_hex_color($input['tip_heading_color']) : $defaults['tip_heading_color'],
            'tip_heading_font_family' => isset($input['tip_heading_font_family']) ? sanitize_text_field(wp_unslash($input['tip_heading_font_family'])) : $defaults['tip_heading_font_family'],
            'tip_heading_font_size'  => isset($input['tip_heading_font_size']) ? max(14, absint($input['tip_heading_font_size'])) : $defaults['tip_heading_font_size'],
            'tip_heading_font_weight' => isset($input['tip_heading_font_weight']) ? max(300, min(900, absint($input['tip_heading_font_weight']))) : $defaults['tip_heading_font_weight'],
            'tip_note_color'         => isset($input['tip_note_color']) && sanitize_hex_color($input['tip_note_color']) ? sanitize_hex_color($input['tip_note_color']) : $defaults['tip_note_color'],
            'tip_note_font_family'   => isset($input['tip_note_font_family']) ? sanitize_text_field(wp_unslash($input['tip_note_font_family'])) : $defaults['tip_note_font_family'],
            'tip_note_font_size'     => isset($input['tip_note_font_size']) ? max(10, absint($input['tip_note_font_size'])) : $defaults['tip_note_font_size'],
            'tip_note_font_weight'   => isset($input['tip_note_font_weight']) ? max(300, min(900, absint($input['tip_note_font_weight']))) : $defaults['tip_note_font_weight'],
            'coupon_label_color'     => isset($input['coupon_label_color']) && sanitize_hex_color($input['coupon_label_color']) ? sanitize_hex_color($input['coupon_label_color']) : $defaults['coupon_label_color'],
            'coupon_label_font_family' => isset($input['coupon_label_font_family']) ? sanitize_text_field(wp_unslash($input['coupon_label_font_family'])) : $defaults['coupon_label_font_family'],
            'coupon_label_font_size' => isset($input['coupon_label_font_size']) ? max(10, absint($input['coupon_label_font_size'])) : $defaults['coupon_label_font_size'],
            'coupon_label_font_weight' => isset($input['coupon_label_font_weight']) ? max(300, min(900, absint($input['coupon_label_font_weight']))) : $defaults['coupon_label_font_weight'],
            'coupon_toggle_color'    => isset($input['coupon_toggle_color']) && sanitize_hex_color($input['coupon_toggle_color']) ? sanitize_hex_color($input['coupon_toggle_color']) : $defaults['coupon_toggle_color'],
            'coupon_toggle_font_family' => isset($input['coupon_toggle_font_family']) ? sanitize_text_field(wp_unslash($input['coupon_toggle_font_family'])) : $defaults['coupon_toggle_font_family'],
            'coupon_toggle_font_size' => isset($input['coupon_toggle_font_size']) ? max(10, absint($input['coupon_toggle_font_size'])) : $defaults['coupon_toggle_font_size'],
            'coupon_toggle_font_weight' => isset($input['coupon_toggle_font_weight']) ? max(300, min(900, absint($input['coupon_toggle_font_weight']))) : $defaults['coupon_toggle_font_weight'],
            'coupon_input_bg_color'  => isset($input['coupon_input_bg_color']) && sanitize_hex_color($input['coupon_input_bg_color']) ? sanitize_hex_color($input['coupon_input_bg_color']) : $defaults['coupon_input_bg_color'],
            'coupon_input_text_color' => isset($input['coupon_input_text_color']) && sanitize_hex_color($input['coupon_input_text_color']) ? sanitize_hex_color($input['coupon_input_text_color']) : $defaults['coupon_input_text_color'],
            'coupon_input_font_family' => isset($input['coupon_input_font_family']) ? sanitize_text_field(wp_unslash($input['coupon_input_font_family'])) : $defaults['coupon_input_font_family'],
            'coupon_input_font_size' => isset($input['coupon_input_font_size']) ? max(10, absint($input['coupon_input_font_size'])) : $defaults['coupon_input_font_size'],
            'coupon_input_font_weight' => isset($input['coupon_input_font_weight']) ? max(300, min(900, absint($input['coupon_input_font_weight']))) : $defaults['coupon_input_font_weight'],
            'coupon_submit_bg_color' => isset($input['coupon_submit_bg_color']) && sanitize_hex_color($input['coupon_submit_bg_color']) ? sanitize_hex_color($input['coupon_submit_bg_color']) : $defaults['coupon_submit_bg_color'],
            'coupon_submit_text_color' => isset($input['coupon_submit_text_color']) && sanitize_hex_color($input['coupon_submit_text_color']) ? sanitize_hex_color($input['coupon_submit_text_color']) : $defaults['coupon_submit_text_color'],
            'coupon_submit_font_family' => isset($input['coupon_submit_font_family']) ? sanitize_text_field(wp_unslash($input['coupon_submit_font_family'])) : $defaults['coupon_submit_font_family'],
            'coupon_submit_font_size' => isset($input['coupon_submit_font_size']) ? max(10, absint($input['coupon_submit_font_size'])) : $defaults['coupon_submit_font_size'],
            'coupon_submit_font_weight' => isset($input['coupon_submit_font_weight']) ? max(300, min(900, absint($input['coupon_submit_font_weight']))) : $defaults['coupon_submit_font_weight'],
            'total_color'            => isset($input['total_color']) && sanitize_hex_color($input['total_color']) ? sanitize_hex_color($input['total_color']) : $defaults['total_color'],
            'total_font_family'      => isset($input['total_font_family']) ? sanitize_text_field(wp_unslash($input['total_font_family'])) : $defaults['total_font_family'],
            'total_font_size'        => isset($input['total_font_size']) ? max(10, absint($input['total_font_size'])) : $defaults['total_font_size'],
            'total_font_weight'      => isset($input['total_font_weight']) ? max(300, min(900, absint($input['total_font_weight']))) : $defaults['total_font_weight'],
            'legal_color'            => isset($input['legal_color']) && sanitize_hex_color($input['legal_color']) ? sanitize_hex_color($input['legal_color']) : $defaults['legal_color'],
            'legal_font_family'      => isset($input['legal_font_family']) ? sanitize_text_field(wp_unslash($input['legal_font_family'])) : $defaults['legal_font_family'],
            'legal_font_size'        => isset($input['legal_font_size']) ? max(10, absint($input['legal_font_size'])) : $defaults['legal_font_size'],
            'legal_font_weight'      => isset($input['legal_font_weight']) ? max(300, min(900, absint($input['legal_font_weight']))) : $defaults['legal_font_weight'],
            'place_order_bg_color'   => isset($input['place_order_bg_color']) && sanitize_hex_color($input['place_order_bg_color']) ? sanitize_hex_color($input['place_order_bg_color']) : $defaults['place_order_bg_color'],
            'place_order_text_color' => isset($input['place_order_text_color']) && sanitize_hex_color($input['place_order_text_color']) ? sanitize_hex_color($input['place_order_text_color']) : $defaults['place_order_text_color'],
            'place_order_font_family' => isset($input['place_order_font_family']) ? sanitize_text_field(wp_unslash($input['place_order_font_family'])) : $defaults['place_order_font_family'],
            'place_order_font_size'  => isset($input['place_order_font_size']) ? max(10, absint($input['place_order_font_size'])) : $defaults['place_order_font_size'],
            'place_order_font_weight' => isset($input['place_order_font_weight']) ? max(300, min(900, absint($input['place_order_font_weight']))) : $defaults['place_order_font_weight'],
            'review_badge_icon'      => isset($input['review_badge_icon']) && in_array(sanitize_key(wp_unslash($input['review_badge_icon'])), $icon_options, true) ? sanitize_key(wp_unslash($input['review_badge_icon'])) : $defaults['review_badge_icon'],
            'review_badge_icon_custom_url' => isset($input['review_badge_icon_custom_url']) ? esc_url_raw(wp_unslash($input['review_badge_icon_custom_url'])) : $defaults['review_badge_icon_custom_url'],
            'review_badge_icon_color' => isset($input['review_badge_icon_color']) && sanitize_hex_color($input['review_badge_icon_color']) ? sanitize_hex_color($input['review_badge_icon_color']) : $defaults['review_badge_icon_color'],
            'info_notice_bg_color'   => isset($input['info_notice_bg_color']) && sanitize_hex_color($input['info_notice_bg_color']) ? sanitize_hex_color($input['info_notice_bg_color']) : $defaults['info_notice_bg_color'],
            'info_notice_text_color' => isset($input['info_notice_text_color']) && sanitize_hex_color($input['info_notice_text_color']) ? sanitize_hex_color($input['info_notice_text_color']) : $defaults['info_notice_text_color'],
            'info_notice_icon'       => isset($input['info_notice_icon']) && in_array(sanitize_key(wp_unslash($input['info_notice_icon'])), $icon_options, true) ? sanitize_key(wp_unslash($input['info_notice_icon'])) : $defaults['info_notice_icon'],
            'info_notice_icon_custom_url' => isset($input['info_notice_icon_custom_url']) ? esc_url_raw(wp_unslash($input['info_notice_icon_custom_url'])) : $defaults['info_notice_icon_custom_url'],
        );
    }

    public function sanitize_thankyou_design_options($input) {
        $defaults = $this->get_thankyou_design_default_options();
        $input    = is_array($input) ? $input : array();
        $icon_options = array_keys($this->get_ui_icon_options());

        return array(
            'page_font_family'       => isset($input['page_font_family']) ? sanitize_text_field(wp_unslash($input['page_font_family'])) : $defaults['page_font_family'],
            'title_color'            => isset($input['title_color']) && sanitize_hex_color($input['title_color']) ? sanitize_hex_color($input['title_color']) : $defaults['title_color'],
            'title_font_family'      => isset($input['title_font_family']) ? sanitize_text_field(wp_unslash($input['title_font_family'])) : $defaults['title_font_family'],
            'title_font_size'        => isset($input['title_font_size']) ? max(16, absint($input['title_font_size'])) : $defaults['title_font_size'],
            'title_font_weight'      => isset($input['title_font_weight']) ? max(300, min(900, absint($input['title_font_weight']))) : $defaults['title_font_weight'],
            'banner_enabled'         => !empty($input['banner_enabled']) ? 1 : 0,
            'banner_title'           => isset($input['banner_title']) ? sanitize_text_field(wp_unslash($input['banner_title'])) : $defaults['banner_title'],
            'banner_text'            => isset($input['banner_text']) ? sanitize_textarea_field(wp_unslash($input['banner_text'])) : $defaults['banner_text'],
            'banner_icon'            => isset($input['banner_icon']) && in_array(sanitize_key(wp_unslash($input['banner_icon'])), $icon_options, true) ? sanitize_key(wp_unslash($input['banner_icon'])) : $defaults['banner_icon'],
            'banner_bg_color'        => isset($input['banner_bg_color']) && sanitize_hex_color($input['banner_bg_color']) ? sanitize_hex_color($input['banner_bg_color']) : $defaults['banner_bg_color'],
            'banner_text_color'      => isset($input['banner_text_color']) && sanitize_hex_color($input['banner_text_color']) ? sanitize_hex_color($input['banner_text_color']) : $defaults['banner_text_color'],
            'banner_accent_color'    => isset($input['banner_accent_color']) && sanitize_hex_color($input['banner_accent_color']) ? sanitize_hex_color($input['banner_accent_color']) : $defaults['banner_accent_color'],
            'banner_font_family'     => isset($input['banner_font_family']) ? sanitize_text_field(wp_unslash($input['banner_font_family'])) : $defaults['banner_font_family'],
            'banner_font_size'       => isset($input['banner_font_size']) ? max(12, absint($input['banner_font_size'])) : $defaults['banner_font_size'],
            'banner_font_weight'     => isset($input['banner_font_weight']) ? max(300, min(900, absint($input['banner_font_weight']))) : $defaults['banner_font_weight'],
            'card_bg_color'          => isset($input['card_bg_color']) && sanitize_hex_color($input['card_bg_color']) ? sanitize_hex_color($input['card_bg_color']) : $defaults['card_bg_color'],
            'card_border_color'      => isset($input['card_border_color']) && sanitize_hex_color($input['card_border_color']) ? sanitize_hex_color($input['card_border_color']) : $defaults['card_border_color'],
            'summary_bg_color'       => isset($input['summary_bg_color']) && sanitize_hex_color($input['summary_bg_color']) ? sanitize_hex_color($input['summary_bg_color']) : $defaults['summary_bg_color'],
            'summary_border_color'   => isset($input['summary_border_color']) && sanitize_hex_color($input['summary_border_color']) ? sanitize_hex_color($input['summary_border_color']) : $defaults['summary_border_color'],
            'summary_text_color'     => isset($input['summary_text_color']) && sanitize_hex_color($input['summary_text_color']) ? sanitize_hex_color($input['summary_text_color']) : $defaults['summary_text_color'],
        );
    }

    public function sanitize_tip_options($input) {
        $defaults = $this->get_tip_default_options();
        $input    = is_array($input) ? $input : array();
        $icon_options = array_keys($this->get_ui_icon_options());
        $rows = array();

        if (!empty($input['tip_rows']) && is_array($input['tip_rows'])) {
            foreach ($input['tip_rows'] as $row) {
                $amount = isset($row['amount']) ? (float) preg_replace('/[^0-9.]/', '', (string) $row['amount']) : 0;

                if ($amount <= 0) {
                    continue;
                }

                $icon = isset($row['icon']) ? sanitize_key(wp_unslash($row['icon'])) : '';

                if ('' !== $icon && !in_array($icon, $icon_options, true)) {
                    $icon = '';
                }

                $rows[] = array(
                    'amount' => $this->format_tip_value($amount),
                    'label'  => isset($row['label']) ? sanitize_text_field(wp_unslash($row['label'])) : '',
                    'icon'   => $icon,
                );
            }
        }

        return array(
            'tip_list'               => $rows ? $this->build_tip_list_from_rows($rows) : (isset($input['tip_list']) ? sanitize_textarea_field(wp_unslash($input['tip_list'])) : $defaults['tip_list']),
            'tip_rows'               => $rows,
            'title'                  => isset($input['title']) ? sanitize_text_field(wp_unslash($input['title'])) : $defaults['title'],
            'note'                   => isset($input['note']) ? sanitize_text_field(wp_unslash($input['note'])) : $defaults['note'],
            'button_bg_color'        => isset($input['button_bg_color']) && sanitize_hex_color($input['button_bg_color']) ? sanitize_hex_color($input['button_bg_color']) : $defaults['button_bg_color'],
            'button_text_color'      => isset($input['button_text_color']) && sanitize_hex_color($input['button_text_color']) ? sanitize_hex_color($input['button_text_color']) : $defaults['button_text_color'],
            'button_active_bg_color' => isset($input['button_active_bg_color']) && sanitize_hex_color($input['button_active_bg_color']) ? sanitize_hex_color($input['button_active_bg_color']) : $defaults['button_active_bg_color'],
            'button_active_text_color' => isset($input['button_active_text_color']) && sanitize_hex_color($input['button_active_text_color']) ? sanitize_hex_color($input['button_active_text_color']) : $defaults['button_active_text_color'],
            'button_font_family'     => isset($input['button_font_family']) ? sanitize_text_field(wp_unslash($input['button_font_family'])) : $defaults['button_font_family'],
            'button_font_size'       => isset($input['button_font_size']) ? max(10, absint($input['button_font_size'])) : $defaults['button_font_size'],
            'button_font_weight'     => isset($input['button_font_weight']) ? max(300, min(900, absint($input['button_font_weight']))) : $defaults['button_font_weight'],
            'button_border_radius'   => isset($input['button_border_radius']) ? max(0, absint($input['button_border_radius'])) : $defaults['button_border_radius'],
            'button_icon_color'      => isset($input['button_icon_color']) && sanitize_hex_color($input['button_icon_color']) ? sanitize_hex_color($input['button_icon_color']) : $defaults['button_icon_color'],
            'button_icon'            => isset($input['button_icon']) && in_array(sanitize_key(wp_unslash($input['button_icon'])), $icon_options, true) ? sanitize_key(wp_unslash($input['button_icon'])) : $defaults['button_icon'],
        );
    }

    public function parse_tip_list($tip_list) {
        $tip_list = is_string($tip_list) ? trim($tip_list) : '';

        if ('' === $tip_list) {
            $tip_list = $this->get_tip_default_options()['tip_list'];
        }

        $tips = array();
        $lines = preg_split('/\r\n|\r|\n/', $tip_list);

        foreach ($lines as $line) {
            $line = trim((string) $line);

            if ('' === $line) {
                continue;
            }

            $parts = array_map('trim', explode('|', $line));
            $amount = isset($parts[0]) ? (float) preg_replace('/[^0-9.]/', '', $parts[0]) : 0;

            if ($amount <= 0) {
                continue;
            }

            $label = isset($parts[1]) && '' !== $parts[1]
                ? sanitize_text_field($parts[1])
                : wp_strip_all_tags(wc_price($amount));
            $icon = isset($parts[2]) ? sanitize_key($parts[2]) : '';

            if ($icon && !array_key_exists($icon, $this->get_ui_icon_options())) {
                $icon = '';
            }

            $tips[] = array(
                'amount' => $amount,
                'label'  => $label,
                'icon'   => $icon,
                'value'  => $this->format_tip_value($amount),
            );
        }

        return $tips;
    }

    public function parse_tip_rows_from_settings($settings) {
        $settings = is_array($settings) ? $settings : array();
        $rows = array();

        if (!empty($settings['tip_rows']) && is_array($settings['tip_rows'])) {
            foreach ($settings['tip_rows'] as $row) {
                $amount = isset($row['amount']) ? (float) preg_replace('/[^0-9.]/', '', (string) $row['amount']) : 0;

                if ($amount <= 0) {
                    continue;
                }

                $rows[] = array(
                    'amount' => $this->format_tip_value($amount),
                    'label'  => isset($row['label']) && '' !== trim((string) $row['label']) ? sanitize_text_field(wp_unslash($row['label'])) : '',
                    'icon'   => isset($row['icon']) ? sanitize_key(wp_unslash($row['icon'])) : '',
                );
            }
        }

        if ($rows) {
            return $rows;
        }

        $legacy_rows = $this->parse_tip_list(isset($settings['tip_list']) ? $settings['tip_list'] : '');

        $normalized = array();

        foreach ($legacy_rows as $row) {
            $normalized[] = array(
                'amount' => $this->format_tip_value($row['amount']),
                'label'  => $row['label'],
                'icon'   => isset($row['icon']) ? $row['icon'] : '',
            );
        }

        return $normalized;
    }

    private function build_tip_list_from_rows($rows) {
        $rows = is_array($rows) ? $rows : array();
        $lines = array();

        foreach ($rows as $row) {
            $amount = isset($row['amount']) ? (float) preg_replace('/[^0-9.]/', '', (string) $row['amount']) : 0;

            if ($amount <= 0) {
                continue;
            }

            $label = isset($row['label']) ? sanitize_text_field(wp_unslash($row['label'])) : '';
            $icon  = isset($row['icon']) ? sanitize_key(wp_unslash($row['icon'])) : '';
            $parts = array($this->format_tip_value($amount));

            if ('' !== $label) {
                $parts[] = $label;
            }

            if ('' !== $icon) {
                $parts[] = $icon;
            }

            $lines[] = implode('|', $parts);
        }

        return implode("\n", $lines);
    }

    private function format_tip_value($amount) {
        return rtrim(rtrim(number_format((float) $amount, 2, '.', ''), '0'), '.');
    }

    private function get_price_format_settings() {
        return array(
            'currencySymbol'    => html_entity_decode(get_woocommerce_currency_symbol(), ENT_QUOTES, get_bloginfo('charset')),
            'currencyPosition'  => get_option('woocommerce_currency_pos', 'left'),
            'decimalSeparator'  => wc_get_price_decimal_separator(),
            'thousandSeparator' => wc_get_price_thousand_separator(),
            'decimals'          => wc_get_price_decimals(),
        );
    }

    private function get_ui_icon_markup($icon_type, $color = '#184363', $size = 18, $class = '', $custom_icon_url = '') {
        $icon_type = sanitize_key($icon_type);
        $size = max(12, absint($size));
        $custom_icon_url = esc_url($custom_icon_url);

        if ('' !== $custom_icon_url) {
            return sprintf(
                '<img class="%1$s" src="%2$s" alt="" aria-hidden="true" style="width:%3$dpx;height:%3$dpx;object-fit:contain;display:block;">',
                esc_attr($class),
                $custom_icon_url,
                (int) $size
            );
        }

        $paths = array(
            'info' => '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 10.5v6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1" fill="currentColor"/>',
            'shield' => '<path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.8 12.1 11 14.3 15.5 9.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
            'spark' => '<path d="M12 3.8 14.1 9l5.2 2.1-5.2 2.1L12 18.4 9.9 13.2 4.7 11.1 9.9 9 12 3.8Z" fill="currentColor"/>',
            'gift' => '<path d="M5 9h14v4H5z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 9v12M5 13v8h14v-8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M12 9V5a2 2 0 1 1 2 2h-2ZM12 9V5a2 2 0 1 0-2 2h2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
            'pin' => '<path d="M12 21s6-5.6 6-10a6 6 0 1 0-12 0c0 4.4 6 10 6 10Z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="11" r="2.2" fill="currentColor"/>',
            'check' => '<path d="M20 7 10.5 17 4 10.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
            'heart' => '<path d="M12 20s-7-4.3-7-10a4.3 4.3 0 0 1 7-3.4A4.3 4.3 0 0 1 19 10c0 5.7-7 10-7 10Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
        );

        if (!isset($paths[$icon_type])) {
            $icon_type = 'info';
        }

        return sprintf(
            '<span class="nevari-ui-icon %4$s is-%1$s" aria-hidden="true" style="width:%2$dpx;height:%2$dpx;color:%3$s;"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">%5$s</svg></span>',
            esc_attr($icon_type),
            (int) $size,
            esc_attr($color),
            esc_attr($class),
            $paths[$icon_type]
        );
    }

    private function get_notice_icon_character($icon_type) {
        switch (sanitize_key($icon_type)) {
            case 'shield':
                return '!';
            case 'spark':
                return '*';
            case 'gift':
                return '+';
            case 'pin':
                return '@';
            case 'check':
                return 'v';
            case 'heart':
                return '<3';
            case 'info':
            default:
                return 'i';
        }
    }

    private function build_inline_style(array $styles) {
        $pairs = array();

        foreach ($styles as $key => $value) {
            if ('' === $value || null === $value) {
                continue;
            }

            $pairs[] = $key . ':' . $value;
        }

        return $pairs ? ' style="' . esc_attr(implode(';', $pairs)) . '"' : '';
    }

    public function sanitize_price_setting($value) {
        return max(0, wc_format_decimal($value));
    }

    public function redirect_legacy_admin_pages() {
        $page = isset($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : '';

        if (!in_array($page, array('nevari-checkout-customizations', 'nevari-checkout-documentation', 'nevari-checkout-settings'), true)) {
            return;
        }

        wp_safe_redirect(admin_url('admin.php?page=nevari-customizations'));
        exit;
    }

    public function register_settings_page() {
        add_menu_page(
            __('Nevari Customizations', 'woocommerce'),
            __('Nevari Customizations', 'woocommerce'),
            'manage_woocommerce',
            'nevari-customizations',
            array($this, 'render_settings_page'),
            'dashicons-admin-generic',
            58
        );

        add_submenu_page(
            'woocommerce',
            __('Nevari Tips', 'woocommerce'),
            __('Tips', 'woocommerce'),
            'manage_woocommerce',
            'nevari-checkout-tips',
            array($this, 'render_tips_page')
        );
    }

    public function render_customizations_dashboard_page() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Nevari Customizations', 'woocommerce'); ?></h1>
            <p><?php esc_html_e('Use this area to configure checkout styling, tip controls, and review the plugin documentation.', 'woocommerce'); ?></p>

            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:24px;">
                <div class="postbox" style="padding:16px;">
                    <h2 style="margin-top:0;"><?php esc_html_e('Customization Settings', 'woocommerce'); ?></h2>
                    <p><?php esc_html_e('Typography, colors, icons, border radius, width, background colors, and buttons.', 'woocommerce'); ?></p>
                    <p><a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=nevari-customizations')); ?>"><?php esc_html_e('Open Settings', 'woocommerce'); ?></a></p>
                </div>

                <div class="postbox" style="padding:16px;">
                    <h2 style="margin-top:0;"><?php esc_html_e('Documentation', 'woocommerce'); ?></h2>
                    <p><?php esc_html_e('Read shortcode usage, page behavior, and customization notes.', 'woocommerce'); ?></p>
                    <p><a class="button" href="<?php echo esc_url(admin_url('admin.php?page=nevari-customizations')); ?>"><?php esc_html_e('View Settings', 'woocommerce'); ?></a></p>
                </div>

                <div class="postbox" style="padding:16px;">
                    <h2 style="margin-top:0;"><?php esc_html_e('Tips', 'woocommerce'); ?></h2>
                    <p><?php esc_html_e('Edit the delivery tip values, labels, icons, and button styles.', 'woocommerce'); ?></p>
                    <p><a class="button" href="<?php echo esc_url(admin_url('admin.php?page=nevari-checkout-tips')); ?>"><?php esc_html_e('Manage Tips', 'woocommerce'); ?></a></p>
                </div>
            </div>
        </div>
<?php
    }

    public function render_documentation_page() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Nevari Documentation', 'woocommerce'); ?></h1>

            <div class="postbox" style="padding:16px;margin-top:16px;">
                <h2 style="margin-top:0;"><?php esc_html_e('Shortcodes', 'woocommerce'); ?></h2>
                <ul style="list-style:disc;padding-left:20px;">
                    <li><code>[nevari_cart]</code> - renders the custom cart UI.</li>
                    <li><code>[nevari_cart_page]</code> - alias for the cart UI shortcode.</li>
                    <li><code>[nevari_cart_total]</code> - renders the live cart total only.</li>
                    <li><code>[nevari_checkout]</code> - renders the custom checkout UI.</li>
                    <li><code>[nevari_checkout_page]</code> - alias for the checkout UI shortcode.</li>
                </ul>
            </div>

            <div class="postbox" style="padding:16px;margin-top:16px;">
                <h2 style="margin-top:0;"><?php esc_html_e('Behavior', 'woocommerce'); ?></h2>
                <ul style="list-style:disc;padding-left:20px;">
                    <li><?php esc_html_e('The checkout page is customized by the plugin.', 'woocommerce'); ?></li>
                    <li><?php esc_html_e('The default WooCommerce cart page is not overridden anymore.', 'woocommerce'); ?></li>
                    <li><?php esc_html_e('Delivery tips are added as fees and coupon codes use WooCommerce coupons.', 'woocommerce'); ?></li>
                </ul>
            </div>

            <div class="postbox" style="padding:16px;margin-top:16px;">
                <h2 style="margin-top:0;"><?php esc_html_e('Customization Areas', 'woocommerce'); ?></h2>
                <ul style="list-style:disc;padding-left:20px;">
                    <li><?php esc_html_e('Checkout design and thank-you page styling.', 'woocommerce'); ?></li>
                    <li><?php esc_html_e('Free shipping threshold.', 'woocommerce'); ?></li>
                    <li><?php esc_html_e('Tip button labels, order, icons, and colors.', 'woocommerce'); ?></li>
                </ul>
            </div>
        </div>
        <?php
    }

    public function render_settings_page() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }
        $checkout = $this->get_checkout_design_options();
        $thankyou = $this->get_thankyou_design_options();
        $font_options = $this->get_font_family_options();
        $icon_options  = $this->get_ui_icon_options();
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Nevari Checkout Settings', 'woocommerce'); ?></h1>
            <form method="post" action="options.php">
                <?php settings_fields('nevari_checkout_settings'); ?>
                <?php settings_errors(); ?>
                <h2><?php esc_html_e('General', 'woocommerce'); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">
                            <label for="nevari_free_shipping_threshold"><?php esc_html_e('Free shipping threshold', 'woocommerce'); ?></label>
                        </th>
                        <td>
                            <input
                                name="nevari_free_shipping_threshold"
                                id="nevari_free_shipping_threshold"
                                type="number"
                                min="0"
                                step="0.01"
                                class="regular-text"
                                value="<?php echo esc_attr(get_option('nevari_free_shipping_threshold', 0)); ?>"
                            >
                            <p class="description">
                                <?php esc_html_e('When the cart items total reaches this amount, shipping becomes free for that cart.', 'woocommerce'); ?>
                            </p>
                        </td>
                    </tr>
                </table>

                <hr>
                <h2><?php esc_html_e('Checkout Design', 'woocommerce'); ?></h2>
                <table class="form-table" role="presentation">
                    <tr><th colspan="2"><h3 style="margin:0;"><?php esc_html_e('Typography', 'woocommerce'); ?></h3></th></tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_page_font_family"><?php esc_html_e('Page font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[page_font_family]" id="nevari_checkout_page_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['page_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_title_font_family"><?php esc_html_e('Page title font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[title_font_family]" id="nevari_checkout_title_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['title_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[title_font_size]" type="number" min="16" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['title_font_size']); ?>">
                            <input name="nevari_checkout_design_options[title_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['title_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_review_title_font_family"><?php esc_html_e('Section heading font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[review_title_font_family]" id="nevari_checkout_review_title_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['review_title_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[review_title_font_size]" type="number" min="14" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['review_title_font_size']); ?>">
                            <input name="nevari_checkout_design_options[review_title_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['review_title_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_banner_font_family"><?php esc_html_e('Banner font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[banner_font_family]" id="nevari_checkout_banner_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['banner_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[banner_font_size]" type="number" min="12" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['banner_font_size']); ?>">
                            <input name="nevari_checkout_design_options[banner_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['banner_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_heading_font_family"><?php esc_html_e('Summary heading font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[summary_heading_font_family]" id="nevari_checkout_summary_heading_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['summary_heading_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[summary_heading_font_size]" type="number" min="14" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['summary_heading_font_size']); ?>">
                            <input name="nevari_checkout_design_options[summary_heading_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['summary_heading_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_label_font_family"><?php esc_html_e('Summary label font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[summary_label_font_family]" id="nevari_checkout_summary_label_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['summary_label_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[summary_label_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['summary_label_font_size']); ?>">
                            <input name="nevari_checkout_design_options[summary_label_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['summary_label_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_value_font_family"><?php esc_html_e('Summary value font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[summary_value_font_family]" id="nevari_checkout_summary_value_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['summary_value_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[summary_value_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['summary_value_font_size']); ?>">
                            <input name="nevari_checkout_design_options[summary_value_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['summary_value_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_tip_heading_font_family"><?php esc_html_e('Tip heading font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[tip_heading_font_family]" id="nevari_checkout_tip_heading_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['tip_heading_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[tip_heading_font_size]" type="number" min="14" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['tip_heading_font_size']); ?>">
                            <input name="nevari_checkout_design_options[tip_heading_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['tip_heading_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_tip_note_font_family"><?php esc_html_e('Tip note font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[tip_note_font_family]" id="nevari_checkout_tip_note_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['tip_note_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[tip_note_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['tip_note_font_size']); ?>">
                            <input name="nevari_checkout_design_options[tip_note_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['tip_note_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_label_font_family"><?php esc_html_e('Coupon label font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[coupon_label_font_family]" id="nevari_checkout_coupon_label_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['coupon_label_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[coupon_label_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['coupon_label_font_size']); ?>">
                            <input name="nevari_checkout_design_options[coupon_label_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['coupon_label_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_toggle_font_family"><?php esc_html_e('Coupon toggle font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[coupon_toggle_font_family]" id="nevari_checkout_coupon_toggle_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['coupon_toggle_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[coupon_toggle_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['coupon_toggle_font_size']); ?>">
                            <input name="nevari_checkout_design_options[coupon_toggle_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['coupon_toggle_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_input_font_family"><?php esc_html_e('Coupon input font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[coupon_input_font_family]" id="nevari_checkout_coupon_input_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['coupon_input_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[coupon_input_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['coupon_input_font_size']); ?>">
                            <input name="nevari_checkout_design_options[coupon_input_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['coupon_input_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_submit_font_family"><?php esc_html_e('Coupon button font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[coupon_submit_font_family]" id="nevari_checkout_coupon_submit_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['coupon_submit_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[coupon_submit_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['coupon_submit_font_size']); ?>">
                            <input name="nevari_checkout_design_options[coupon_submit_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['coupon_submit_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_total_font_family"><?php esc_html_e('Total font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[total_font_family]" id="nevari_checkout_total_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['total_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[total_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['total_font_size']); ?>">
                            <input name="nevari_checkout_design_options[total_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['total_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_legal_font_family"><?php esc_html_e('Legal text font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[legal_font_family]" id="nevari_checkout_legal_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['legal_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[legal_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['legal_font_size']); ?>">
                            <input name="nevari_checkout_design_options[legal_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['legal_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_place_order_font_family"><?php esc_html_e('Place order font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[place_order_font_family]" id="nevari_checkout_place_order_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($checkout['place_order_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[place_order_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['place_order_font_size']); ?>">
                            <input name="nevari_checkout_design_options[place_order_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $checkout['place_order_font_weight']); ?>">
                        </td>
                    </tr>

                    <tr><th colspan="2"><h3 style="margin:0;"><?php esc_html_e('Color', 'woocommerce'); ?></h3></th></tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_title_color"><?php esc_html_e('Page title color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[title_color]" id="nevari_checkout_title_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['title_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_review_title_color"><?php esc_html_e('Section heading color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[review_title_color]" id="nevari_checkout_review_title_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['review_title_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_banner_bg_color"><?php esc_html_e('Banner background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[banner_bg_color]" id="nevari_checkout_banner_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['banner_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_banner_text_color"><?php esc_html_e('Banner text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[banner_text_color]" id="nevari_checkout_banner_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['banner_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_banner_accent_color"><?php esc_html_e('Banner accent color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[banner_accent_color]" id="nevari_checkout_banner_accent_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['banner_accent_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_heading_color"><?php esc_html_e('Summary heading color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[summary_heading_color]" id="nevari_checkout_summary_heading_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['summary_heading_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_label_color"><?php esc_html_e('Summary label color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[summary_label_color]" id="nevari_checkout_summary_label_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['summary_label_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_value_color"><?php esc_html_e('Summary value color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[summary_value_color]" id="nevari_checkout_summary_value_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['summary_value_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_tip_heading_color"><?php esc_html_e('Tip heading color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[tip_heading_color]" id="nevari_checkout_tip_heading_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['tip_heading_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_tip_note_color"><?php esc_html_e('Tip note color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[tip_note_color]" id="nevari_checkout_tip_note_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['tip_note_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_label_color"><?php esc_html_e('Coupon label color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[coupon_label_color]" id="nevari_checkout_coupon_label_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['coupon_label_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_toggle_color"><?php esc_html_e('Coupon toggle color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[coupon_toggle_color]" id="nevari_checkout_coupon_toggle_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['coupon_toggle_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_input_bg_color"><?php esc_html_e('Coupon input background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[coupon_input_bg_color]" id="nevari_checkout_coupon_input_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['coupon_input_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_input_text_color"><?php esc_html_e('Coupon input text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[coupon_input_text_color]" id="nevari_checkout_coupon_input_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['coupon_input_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_submit_bg_color"><?php esc_html_e('Coupon button background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[coupon_submit_bg_color]" id="nevari_checkout_coupon_submit_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['coupon_submit_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_coupon_submit_text_color"><?php esc_html_e('Coupon button text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[coupon_submit_text_color]" id="nevari_checkout_coupon_submit_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['coupon_submit_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_total_color"><?php esc_html_e('Total color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[total_color]" id="nevari_checkout_total_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['total_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_legal_color"><?php esc_html_e('Legal text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[legal_color]" id="nevari_checkout_legal_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['legal_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_place_order_bg_color"><?php esc_html_e('Place order background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[place_order_bg_color]" id="nevari_checkout_place_order_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['place_order_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_place_order_text_color"><?php esc_html_e('Place order text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[place_order_text_color]" id="nevari_checkout_place_order_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['place_order_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_notice_bg_color"><?php esc_html_e('WooCommerce info background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[info_notice_bg_color]" id="nevari_checkout_notice_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['info_notice_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_notice_text_color"><?php esc_html_e('WooCommerce info text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[info_notice_text_color]" id="nevari_checkout_notice_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['info_notice_text_color']); ?>"></td>
                    </tr>

                    <tr><th colspan="2"><h3 style="margin:0;"><?php esc_html_e('Borders', 'woocommerce'); ?></h3></th></tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_card_bg_color"><?php esc_html_e('Card background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[card_bg_color]" id="nevari_checkout_card_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['card_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_card_border_color"><?php esc_html_e('Card border', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[card_border_color]" id="nevari_checkout_card_border_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['card_border_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_card_border_radius"><?php esc_html_e('Card radius', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[card_border_radius]" id="nevari_checkout_card_border_radius" type="number" min="0" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['card_border_radius']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_bg_color"><?php esc_html_e('Summary background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[summary_bg_color]" id="nevari_checkout_summary_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['summary_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_border_color"><?php esc_html_e('Summary border', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[summary_border_color]" id="nevari_checkout_summary_border_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['summary_border_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_summary_border_radius"><?php esc_html_e('Summary radius', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_checkout_design_options[summary_border_radius]" id="nevari_checkout_summary_border_radius" type="number" min="0" step="1" class="small-text" value="<?php echo esc_attr((int) $checkout['summary_border_radius']); ?>"></td>
                    </tr>

                    <tr><th colspan="2"><h3 style="margin:0;"><?php esc_html_e('Icon', 'woocommerce'); ?></h3></th></tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_banner_icon"><?php esc_html_e('Banner icon', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[banner_icon]" id="nevari_checkout_banner_icon">
                                <?php foreach ($icon_options as $icon_value => $icon_label) : ?>
                                    <option value="<?php echo esc_attr($icon_value); ?>" <?php selected($checkout['banner_icon'], $icon_value); ?>><?php echo esc_html($icon_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_review_badge_icon"><?php esc_html_e('Section badge icon', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[review_badge_icon]" id="nevari_checkout_review_badge_icon">
                                <?php foreach ($icon_options as $icon_value => $icon_label) : ?>
                                    <option value="<?php echo esc_attr($icon_value); ?>" <?php selected($checkout['review_badge_icon'], $icon_value); ?>><?php echo esc_html($icon_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_checkout_design_options[review_badge_icon_color]" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($checkout['review_badge_icon_color']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_notice_icon"><?php esc_html_e('WooCommerce info icon', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_checkout_design_options[info_notice_icon]" id="nevari_checkout_notice_icon">
                                <?php foreach ($icon_options as $icon_value => $icon_label) : ?>
                                    <option value="<?php echo esc_attr($icon_value); ?>" <?php selected($checkout['info_notice_icon'], $icon_value); ?>><?php echo esc_html($icon_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>

                    <tr><th colspan="2"><h3 style="margin:0;"><?php esc_html_e('Custom Icons', 'woocommerce'); ?></h3></th></tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_banner_icon_custom_url"><?php esc_html_e('Banner custom icon', 'woocommerce'); ?></label></th>
                        <td>
                            <div class="nevari-media-upload-field" data-frame-title="<?php echo esc_attr__('Select banner icon image', 'woocommerce'); ?>" data-frame-button="<?php echo esc_attr__('Use this image', 'woocommerce'); ?>">
                                <input type="hidden" name="nevari_checkout_design_options[banner_icon_custom_url]" data-nevari-media-input value="<?php echo esc_attr($checkout['banner_icon_custom_url']); ?>">
                                <img src="<?php echo esc_url($checkout['banner_icon_custom_url']); ?>" alt="" data-nevari-media-preview <?php echo empty($checkout['banner_icon_custom_url']) ? 'hidden' : ''; ?> style="max-width:56px;height:auto;margin:0 0 8px;display:block;">
                                <p class="description"><?php esc_html_e('Used instead of the built-in banner icon.', 'woocommerce'); ?></p>
                                <button type="button" class="button" data-nevari-media-upload><?php esc_html_e('Upload / Select', 'woocommerce'); ?></button>
                                <button type="button" class="button" data-nevari-media-clear <?php disabled('', $checkout['banner_icon_custom_url']); ?>><?php esc_html_e('Remove', 'woocommerce'); ?></button>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_review_badge_icon_custom_url"><?php esc_html_e('Section badge custom icon', 'woocommerce'); ?></label></th>
                        <td>
                            <div class="nevari-media-upload-field" data-frame-title="<?php echo esc_attr__('Select section badge image', 'woocommerce'); ?>" data-frame-button="<?php echo esc_attr__('Use this image', 'woocommerce'); ?>">
                                <input type="hidden" name="nevari_checkout_design_options[review_badge_icon_custom_url]" data-nevari-media-input value="<?php echo esc_attr($checkout['review_badge_icon_custom_url']); ?>">
                                <img src="<?php echo esc_url($checkout['review_badge_icon_custom_url']); ?>" alt="" data-nevari-media-preview <?php echo empty($checkout['review_badge_icon_custom_url']) ? 'hidden' : ''; ?> style="max-width:56px;height:auto;margin:0 0 8px;display:block;">
                                <p class="description"><?php esc_html_e('Used instead of the built-in section badge icon.', 'woocommerce'); ?></p>
                                <button type="button" class="button" data-nevari-media-upload><?php esc_html_e('Upload / Select', 'woocommerce'); ?></button>
                                <button type="button" class="button" data-nevari-media-clear <?php disabled('', $checkout['review_badge_icon_custom_url']); ?>><?php esc_html_e('Remove', 'woocommerce'); ?></button>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_checkout_notice_icon_custom_url"><?php esc_html_e('Info notice custom icon', 'woocommerce'); ?></label></th>
                        <td>
                            <div class="nevari-media-upload-field" data-frame-title="<?php echo esc_attr__('Select info notice image', 'woocommerce'); ?>" data-frame-button="<?php echo esc_attr__('Use this image', 'woocommerce'); ?>">
                                <input type="hidden" name="nevari_checkout_design_options[info_notice_icon_custom_url]" data-nevari-media-input value="<?php echo esc_attr($checkout['info_notice_icon_custom_url']); ?>">
                                <img src="<?php echo esc_url($checkout['info_notice_icon_custom_url']); ?>" alt="" data-nevari-media-preview <?php echo empty($checkout['info_notice_icon_custom_url']) ? 'hidden' : ''; ?> style="max-width:56px;height:auto;margin:0 0 8px;display:block;">
                                <p class="description"><?php esc_html_e('Used instead of the built-in info notice icon.', 'woocommerce'); ?></p>
                                <button type="button" class="button" data-nevari-media-upload><?php esc_html_e('Upload / Select', 'woocommerce'); ?></button>
                                <button type="button" class="button" data-nevari-media-clear <?php disabled('', $checkout['info_notice_icon_custom_url']); ?>><?php esc_html_e('Remove', 'woocommerce'); ?></button>
                            </div>
                        </td>
                    </tr>
                </table>

                <hr>
                <h2><?php esc_html_e('Thank You Design', 'woocommerce'); ?></h2>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_page_font_family"><?php esc_html_e('Page font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_thankyou_design_options[page_font_family]" id="nevari_thankyou_page_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($thankyou['page_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_title_color"><?php esc_html_e('Page title color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[title_color]" id="nevari_thankyou_title_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['title_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_title_font_family"><?php esc_html_e('Page title font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_thankyou_design_options[title_font_family]" id="nevari_thankyou_title_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($thankyou['title_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_thankyou_design_options[title_font_size]" type="number" min="16" step="1" class="small-text" value="<?php echo esc_attr((int) $thankyou['title_font_size']); ?>">
                            <input name="nevari_thankyou_design_options[title_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $thankyou['title_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_banner_enabled"><?php esc_html_e('Info banner', 'woocommerce'); ?></label></th>
                        <td>
                            <label><input name="nevari_thankyou_design_options[banner_enabled]" id="nevari_thankyou_banner_enabled" type="checkbox" value="1" <?php checked(1, (int) $thankyou['banner_enabled']); ?>> <?php esc_html_e('Show a custom thank you banner', 'woocommerce'); ?></label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_banner_title"><?php esc_html_e('Banner title', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[banner_title]" id="nevari_thankyou_banner_title" type="text" class="large-text" value="<?php echo esc_attr($thankyou['banner_title']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_banner_text"><?php esc_html_e('Banner text', 'woocommerce'); ?></label></th>
                        <td><textarea name="nevari_thankyou_design_options[banner_text]" id="nevari_thankyou_banner_text" class="large-text" rows="3"><?php echo esc_textarea($thankyou['banner_text']); ?></textarea></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_banner_icon"><?php esc_html_e('Banner icon', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_thankyou_design_options[banner_icon]" id="nevari_thankyou_banner_icon">
                                <?php foreach ($icon_options as $icon_value => $icon_label) : ?>
                                    <option value="<?php echo esc_attr($icon_value); ?>" <?php selected($thankyou['banner_icon'], $icon_value); ?>><?php echo esc_html($icon_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_banner_bg_color"><?php esc_html_e('Banner background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[banner_bg_color]" id="nevari_thankyou_banner_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['banner_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_banner_text_color"><?php esc_html_e('Banner text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[banner_text_color]" id="nevari_thankyou_banner_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['banner_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_banner_accent_color"><?php esc_html_e('Banner accent color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[banner_accent_color]" id="nevari_thankyou_banner_accent_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['banner_accent_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_banner_font_family"><?php esc_html_e('Banner font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_thankyou_design_options[banner_font_family]" id="nevari_thankyou_banner_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($thankyou['banner_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_thankyou_design_options[banner_font_size]" type="number" min="12" step="1" class="small-text" value="<?php echo esc_attr((int) $thankyou['banner_font_size']); ?>">
                            <input name="nevari_thankyou_design_options[banner_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $thankyou['banner_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_card_bg_color"><?php esc_html_e('Card background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[card_bg_color]" id="nevari_thankyou_card_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['card_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_card_border_color"><?php esc_html_e('Card border', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[card_border_color]" id="nevari_thankyou_card_border_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['card_border_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_summary_bg_color"><?php esc_html_e('Summary background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[summary_bg_color]" id="nevari_thankyou_summary_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['summary_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_summary_border_color"><?php esc_html_e('Summary border', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[summary_border_color]" id="nevari_thankyou_summary_border_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['summary_border_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_thankyou_summary_text_color"><?php esc_html_e('Summary text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_thankyou_design_options[summary_text_color]" id="nevari_thankyou_summary_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($thankyou['summary_text_color']); ?>"></td>
                    </tr>
                </table>

                <p><a class="button button-primary" href="<?php echo esc_url(admin_url('admin.php?page=nevari-checkout-tips')); ?>"><?php esc_html_e('Edit Tips', 'woocommerce'); ?></a></p>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    public function render_tips_page() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }

        $tips = $this->get_tip_settings();
        $font_options = $this->get_font_family_options();
        $icon_options  = $this->get_ui_icon_options();
        $rows = $this->parse_tip_rows_from_settings($tips);
        ?>
        <div class="wrap">
            <h1><?php esc_html_e('Nevari Tips', 'woocommerce'); ?></h1>
            <form method="post" action="options.php">
                <?php settings_fields('nevari_checkout_settings'); ?>
                <?php settings_errors(); ?>
                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row"><label for="nevari_tip_title"><?php esc_html_e('Tips title', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_tip_options[title]" id="nevari_tip_title" type="text" class="large-text" value="<?php echo esc_attr($tips['title']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_tip_note"><?php esc_html_e('Tips note', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_tip_options[note]" id="nevari_tip_note" type="text" class="large-text" value="<?php echo esc_attr($tips['note']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label><?php esc_html_e('Tip list', 'woocommerce'); ?></label></th>
                        <td>
                            <div class="nevari-tip-repeater" data-nevari-tip-repeater>
                                <div class="nevari-tip-repeater__head">
                                    <strong><?php esc_html_e('Amount', 'woocommerce'); ?></strong>
                                    <strong><?php esc_html_e('Label', 'woocommerce'); ?></strong>
                                    <strong><?php esc_html_e('Icon', 'woocommerce'); ?></strong>
                                    <span></span>
                                </div>
                                <div class="nevari-tip-repeater__rows" data-nevari-tip-rows>
                                    <?php foreach ($rows as $row_index => $row) : ?>
                                        <div class="nevari-tip-row" data-nevari-tip-row>
                                            <input type="number" min="0" step="0.01" name="nevari_tip_options[tip_rows][<?php echo esc_attr($row_index); ?>][amount]" value="<?php echo esc_attr($row['amount']); ?>" placeholder="0.00">
                                            <input type="text" name="nevari_tip_options[tip_rows][<?php echo esc_attr($row_index); ?>][label]" value="<?php echo esc_attr($row['label']); ?>" placeholder="<?php esc_attr_e('Label', 'woocommerce'); ?>">
                                            <select name="nevari_tip_options[tip_rows][<?php echo esc_attr($row_index); ?>][icon]">
                                                <option value=""><?php esc_html_e('None', 'woocommerce'); ?></option>
                                                <?php foreach ($icon_options as $icon_value => $icon_label) : ?>
                                                    <option value="<?php echo esc_attr($icon_value); ?>" <?php selected($row['icon'], $icon_value); ?>><?php echo esc_html($icon_label); ?></option>
                                                <?php endforeach; ?>
                                            </select>
                                            <div class="nevari-tip-row__actions">
                                                <button type="button" class="button" data-nevari-tip-up><?php esc_html_e('Up', 'woocommerce'); ?></button>
                                                <button type="button" class="button" data-nevari-tip-down><?php esc_html_e('Down', 'woocommerce'); ?></button>
                                                <button type="button" class="button-link-delete" data-nevari-tip-remove><?php esc_html_e('Remove', 'woocommerce'); ?></button>
                                            </div>
                                        </div>
                                    <?php endforeach; ?>
                                </div>
                                <button type="button" class="button" data-nevari-tip-add><?php esc_html_e('Add tip', 'woocommerce'); ?></button>
                                <template data-nevari-tip-template>
                                    <div class="nevari-tip-row" data-nevari-tip-row>
                                        <input type="number" min="0" step="0.01" name="nevari_tip_options[tip_rows][__INDEX__][amount]" value="" placeholder="0.00">
                                        <input type="text" name="nevari_tip_options[tip_rows][__INDEX__][label]" value="" placeholder="<?php esc_attr_e('Label', 'woocommerce'); ?>">
                                        <select name="nevari_tip_options[tip_rows][__INDEX__][icon]">
                                            <option value=""><?php esc_html_e('None', 'woocommerce'); ?></option>
                                            <?php foreach ($icon_options as $icon_value => $icon_label) : ?>
                                                <option value="<?php echo esc_attr($icon_value); ?>"><?php echo esc_html($icon_label); ?></option>
                                            <?php endforeach; ?>
                                        </select>
                                        <div class="nevari-tip-row__actions">
                                            <button type="button" class="button" data-nevari-tip-up><?php esc_html_e('Up', 'woocommerce'); ?></button>
                                            <button type="button" class="button" data-nevari-tip-down><?php esc_html_e('Down', 'woocommerce'); ?></button>
                                            <button type="button" class="button-link-delete" data-nevari-tip-remove><?php esc_html_e('Remove', 'woocommerce'); ?></button>
                                        </div>
                                    </div>
                                </template>
                                <p class="description"><?php esc_html_e('Add the amount you want charged, and optionally override the label and icon shown on checkout. Drag order is controlled with the Up and Down buttons.', 'woocommerce'); ?></p>
                            </div>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_tip_button_bg_color"><?php esc_html_e('Button background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_tip_options[button_bg_color]" id="nevari_tip_button_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($tips['button_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_tip_button_text_color"><?php esc_html_e('Button text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_tip_options[button_text_color]" id="nevari_tip_button_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($tips['button_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_tip_button_active_bg_color"><?php esc_html_e('Active button background', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_tip_options[button_active_bg_color]" id="nevari_tip_button_active_bg_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($tips['button_active_bg_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_tip_button_active_text_color"><?php esc_html_e('Active button text color', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_tip_options[button_active_text_color]" id="nevari_tip_button_active_text_color" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($tips['button_active_text_color']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_tip_button_font_family"><?php esc_html_e('Button font', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_tip_options[button_font_family]" id="nevari_tip_button_font_family">
                                <?php foreach ($font_options as $font_value => $font_label) : ?>
                                    <option value="<?php echo esc_attr($font_value); ?>" <?php selected($tips['button_font_family'], $font_value); ?>><?php echo esc_html($font_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_tip_options[button_font_size]" type="number" min="10" step="1" class="small-text" value="<?php echo esc_attr((int) $tips['button_font_size']); ?>">
                            <input name="nevari_tip_options[button_font_weight]" type="number" min="300" max="900" step="100" class="small-text" value="<?php echo esc_attr((int) $tips['button_font_weight']); ?>">
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_tip_button_border_radius"><?php esc_html_e('Button radius', 'woocommerce'); ?></label></th>
                        <td><input name="nevari_tip_options[button_border_radius]" id="nevari_tip_button_border_radius" type="number" min="0" step="1" class="small-text" value="<?php echo esc_attr((int) $tips['button_border_radius']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="nevari_tip_button_icon"><?php esc_html_e('Default button icon', 'woocommerce'); ?></label></th>
                        <td>
                            <select name="nevari_tip_options[button_icon]" id="nevari_tip_button_icon">
                                <?php foreach ($icon_options as $icon_value => $icon_label) : ?>
                                    <option value="<?php echo esc_attr($icon_value); ?>" <?php selected($tips['button_icon'], $icon_value); ?>><?php echo esc_html($icon_label); ?></option>
                                <?php endforeach; ?>
                            </select>
                            <input name="nevari_tip_options[button_icon_color]" type="text" class="regular-text nevari-color-field" value="<?php echo esc_attr($tips['button_icon_color']); ?>">
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }

    public function enqueue_admin_assets($hook_suffix) {
        $allowed = array(
            'toplevel_page_nevari-customizations',
            'woocommerce_page_nevari-checkout-tips',
            'nevari-customizations_page_nevari-customizations-add-to-cart',
            'nevari-customizations_page_nevari-customizations-reviews-module',
        );

        if (!in_array($hook_suffix, $allowed, true)) {
            return;
        }

        wp_enqueue_style('wp-color-picker');
        wp_enqueue_script('wp-color-picker');
        wp_add_inline_style(
            'wp-color-picker',
            '.nevari-tip-repeater{display:flex;flex-direction:column;gap:12px}.nevari-tip-repeater__head,.nevari-tip-row{display:grid;grid-template-columns:minmax(90px,120px) minmax(180px,1fr) minmax(140px,180px) auto;gap:12px;align-items:center}.nevari-tip-repeater__head{padding:0 6px;font-size:12px;color:#666}.nevari-tip-row{padding:12px;border:1px solid #dcdcde;border-radius:10px;background:#fff}.nevari-tip-row input[type="text"],.nevari-tip-row input[type="number"],.nevari-tip-row select{width:100%;max-width:100%}.nevari-tip-row__actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.nevari-tip-row__actions .button-link-delete{line-height:2.2}.nevari-tip-row.is-dragging{opacity:.6}'
        );
        wp_add_inline_script(
            'wp-color-picker',
            'jQuery(function($){
                $(".nevari-color-field").wpColorPicker();

                function renumberTipRows($container){
                    $container.find("[data-nevari-tip-row]").each(function(index){
                        $(this).find("input, select").each(function(){
                            var name = $(this).attr("name");
                            if (!name) {
                                return;
                            }

                            $(this).attr("name", name.replace(/tip_rows\\]\\[\\d+\\]/, "tip_rows][" + index + "]"));
                        });
                    });
                }

                function rowTemplate($wrapper){
                    var template = $wrapper.find("[data-nevari-tip-template]").html() || "";
                    var nextIndex = $wrapper.find("[data-nevari-tip-row]").length;
                    return template.replace(/__INDEX__/g, nextIndex);
                }

                $(document).on("click", "[data-nevari-tip-add]", function(e){
                    e.preventDefault();
                    var $wrapper = $(this).closest("[data-nevari-tip-repeater]");
                    var $rows = $wrapper.find("[data-nevari-tip-rows]");
                    $rows.append(rowTemplate($wrapper));
                    renumberTipRows($rows);
                });

                $(document).on("click", "[data-nevari-tip-remove]", function(e){
                    e.preventDefault();
                    var $rows = $(this).closest("[data-nevari-tip-rows]");
                    $(this).closest("[data-nevari-tip-row]").remove();
                    renumberTipRows($rows);
                });

                $(document).on("click", "[data-nevari-tip-up], [data-nevari-tip-down]", function(e){
                    e.preventDefault();
                    var $row = $(this).closest("[data-nevari-tip-row]");
                    var $rows = $row.parent();

                    if ($(this).is("[data-nevari-tip-up]")) {
                        var $prev = $row.prev("[data-nevari-tip-row]");
                        if ($prev.length) {
                            $row.insertBefore($prev);
                        }
                    } else {
                        var $next = $row.next("[data-nevari-tip-row]");
                        if ($next.length) {
                            $row.insertAfter($next);
                        }
                    }

                    renumberTipRows($rows);
                });
            });'
        );
    }

    public function replace_checkout_page_content($content) {
        if (is_admin() || !function_exists('is_checkout') || !is_checkout()) {
            return $content;
        }

        if (!is_main_query() || !in_the_loop()) {
            return $content;
        }

        return $this->render_checkout_v2();
    }

    public function replace_cart_page_content($content) {
        if (is_admin() || !function_exists('is_cart') || !is_cart()) {
            return $content;
        }

        if (!is_main_query() || !in_the_loop()) {
            return $content;
        }

        return $this->render_cart();
    }

    public function render_cart_shortcode($atts = array()) {
        return $this->render_cart();
    }

    public function render_checkout_shortcode($atts = array()) {
        return $this->render_checkout_v2();
    }

   
public function replace_thankyou_page_content($content) {
    if (is_admin() || !function_exists('is_order_received_page') || !is_order_received_page()) {
        return $content;
    }

    if (!is_main_query() || !in_the_loop()) {
        return $content;
    }

    global $wp;

    if (empty($wp->query_vars['order-received'])) {
        return $content;
    }

    $order_id = absint($wp->query_vars['order-received']);
    $order = wc_get_order($order_id);

    if (!$order) {
        return '<p>Order not found.</p>';
    }

    return $this->render_thankyou($order);
}

    public function enqueue_assets() {
        $should_enqueue = (function_exists('is_checkout') && is_checkout())
            || (function_exists('is_cart') && is_cart())
            || (function_exists('is_product') && is_product());

        if (!$should_enqueue) {
            return;
        }

        wp_register_style('nevari-checkout', false, array(), '1.0.4');
        wp_enqueue_style('nevari-checkout');
        wp_add_inline_style('nevari-checkout', $this->css());

        if (function_exists('is_checkout') && is_checkout()) {
            $checkout_design = $this->get_checkout_design_options();
            $notice_icon = $this->get_notice_icon_character(isset($checkout_design['info_notice_icon']) ? $checkout_design['info_notice_icon'] : 'info');
            $notice_css = sprintf(
                '.woocommerce-notices-wrapper .woocommerce-info{background:%1$s;color:%2$s;}.woocommerce-notices-wrapper .woocommerce-info::before{content:"%3$s";background:%4$s;color:%2$s;}',
                esc_attr($checkout_design['info_notice_bg_color']),
                esc_attr($checkout_design['info_notice_text_color']),
                esc_attr($notice_icon),
                esc_attr($checkout_design['banner_accent_color'])
            );
            wp_add_inline_style('nevari-checkout', $notice_css);
        }

        wp_register_script('nevari-checkout', false, array('jquery'), '1.0.4', true);
        wp_enqueue_script('nevari-checkout');
        wp_add_inline_script(
            'nevari-checkout',
            'window.NevariCheckout = ' . wp_json_encode(
                array(
                    'ajaxUrl' => admin_url('admin-ajax.php'),
                    'cartNonce' => wp_create_nonce('nevari-update-cart'),
                    'checkoutNonce' => wp_create_nonce('nevari-checkout-coupon'),
                    'priceFormat' => $this->get_price_format_settings(),
                )
            ) . ';',
            'before'
        );

        wp_add_inline_script('nevari-checkout', $this->js());
    }

    private function get_cart_total_html() {
        if (!function_exists('WC') || !WC()->cart) {
            return wc_price(0);
        }

        return wc_price((float) WC()->cart->get_total('edit'));
    }

    private function enqueue_cart_total_shortcode_assets() {
        if ($this->cart_total_shortcode_assets_enqueued) {
            return;
        }

        $this->cart_total_shortcode_assets_enqueued = true;

        wp_register_script('nevari-cart-total-shortcode', false, array('jquery'), '1.0.0', true);
        wp_enqueue_script('nevari-cart-total-shortcode');
        wp_add_inline_script(
            'nevari-cart-total-shortcode',
            'window.NevariCartTotal = window.NevariCartTotal || {};
            window.NevariCartTotal.ajaxUrl = ' . wp_json_encode(admin_url('admin-ajax.php')) . ';
            window.NevariCartTotal.action = "nevari_get_cart_total";

            (function () {
                function refreshTotals() {
                    var nodes = document.querySelectorAll("[data-nevari-cart-total]");

                    if (!nodes.length || !window.fetch) {
                        return;
                    }

                    var body = new URLSearchParams();
                    body.set("action", window.NevariCartTotal.action);

                    fetch(window.NevariCartTotal.ajaxUrl, {
                        method: "POST",
                        credentials: "same-origin",
                        headers: {
                            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"
                        },
                        body: body.toString()
                    }).then(function (response) {
                        return response.json();
                    }).then(function (payload) {
                        if (!payload || !payload.success || !payload.data) {
                            return;
                        }

                        nodes.forEach(function (node) {
                            node.innerHTML = payload.data.total_html || "";
                        });
                    });
                }

                document.addEventListener("DOMContentLoaded", refreshTotals);
                document.addEventListener("nevari_cart_updated", refreshTotals);

                if (window.jQuery) {
                    jQuery(document.body).on("updated_cart_totals updated_checkout wc_fragments_refreshed added_to_cart removed_from_cart", refreshTotals);
                }
            })();',
            'after'
        );
    }

    public function ajax_get_cart_total() {
        if (function_exists('wc_load_cart')) {
            wc_load_cart();
        }

        wp_send_json_success(
            array(
                'total_html' => $this->get_cart_total_html(),
            )
        );
    }

    public function render_cart_total_shortcode($atts = array()) {
        $this->enqueue_cart_total_shortcode_assets();

        $atts = shortcode_atts(
            array(
                'class' => '',
            ),
            (array) $atts,
            'nevari_cart_total'
        );

        $classes = trim('nevari-cart-total-shortcode ' . sanitize_html_class($atts['class']));

        return sprintf(
            '<span class="%1$s" data-nevari-cart-total>%2$s</span>',
            esc_attr($classes),
            wp_kses_post($this->get_cart_total_html())
        );
    }

    public function ajax_update_cart_quantity() {
        check_ajax_referer('nevari-update-cart', 'nonce');

        if (!function_exists('WC') || !WC()->cart) {
            wp_send_json_error(
                array(
                    'message' => __('Cart is unavailable.', 'woocommerce'),
                ),
                400
            );
        }

        $cart_item_key = isset($_POST['cart_item_key'])
            ? wc_clean(wp_unslash($_POST['cart_item_key']))
            : '';
        $quantity = isset($_POST['quantity']) ? max(1, absint(wp_unslash($_POST['quantity']))) : 1;

        if (!$cart_item_key || !WC()->cart->find_product_in_cart($cart_item_key)) {
            wp_send_json_error(
                array(
                    'message' => __('Cart item could not be found.', 'woocommerce'),
                ),
                404
            );
        }

        WC()->cart->set_quantity($cart_item_key, $quantity, true);
        WC()->cart->calculate_totals();

        wp_send_json_success(
            array(
                'html' => $this->render_cart(),
            )
        );
    }

    private function get_checkout_tip_amount() {
        if (!WC()->session) {
            return 0;
        }

        return $this->parse_tip_amount(WC()->session->get('nevari_selected_tip'));
    }

    private function get_checkout_discount_total() {
        if (!WC()->cart || WC()->cart->is_empty()) {
            return 0;
        }

        $discount_total = (float) WC()->cart->get_discount_total();

        if (method_exists(WC()->cart, 'get_discount_tax')) {
            $discount_total += (float) WC()->cart->get_discount_tax();
        }

        return max(0, $discount_total);
    }

    private function get_checkout_items_total() {
        if (!WC()->cart || WC()->cart->is_empty()) {
            return 0;
        }

        return max(0, (float) WC()->cart->get_cart_contents_total());
    }

    private function get_checkout_summary_totals($selected_tip_amount = null) {
        $items_total = $this->get_checkout_items_total();
        $discount_total = $this->get_checkout_discount_total();
        $tip_total = $selected_tip_amount === null ? $this->get_checkout_tip_amount() : max(0, (float) $selected_tip_amount);
        $display_total = max(0, $items_total - $discount_total + $tip_total);

        return array(
            'items_total'    => $items_total,
            'discount_total' => $discount_total,
            'tip_total'      => $tip_total,
            'display_total'  => $display_total,
        );
    }

    private function render_checkout_summary_markup($checkout_design, $tip_settings, $selected_tip = '', $selected_tip_amount = 0) {
        $totals = $this->get_checkout_summary_totals($selected_tip_amount);
        $applied_coupons = WC()->cart ? WC()->cart->get_applied_coupons() : array();
        $tip_options = $this->get_tip_options();
        $selected_tip_label = WC()->session ? WC()->session->get('nevari_selected_tip_label') : '';
        $coupon_code_value = '';
        $summary_title_style = $this->build_inline_style(array(
            'color' => $checkout_design['summary_heading_color'],
            'font-family' => $checkout_design['summary_heading_font_family'],
            'font-size' => (int) $checkout_design['summary_heading_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['summary_heading_font_weight'],
        ));
        $summary_label_style = $this->build_inline_style(array(
            'color' => $checkout_design['summary_label_color'],
            'font-family' => $checkout_design['summary_label_font_family'],
            'font-size' => (int) $checkout_design['summary_label_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['summary_label_font_weight'],
        ));
        $summary_value_style = $this->build_inline_style(array(
            'color' => $checkout_design['summary_value_color'],
            'font-family' => $checkout_design['summary_value_font_family'],
            'font-size' => (int) $checkout_design['summary_value_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['summary_value_font_weight'],
        ));
        $tip_heading_style = $this->build_inline_style(array(
            'color' => $checkout_design['tip_heading_color'],
            'font-family' => $checkout_design['tip_heading_font_family'],
            'font-size' => (int) $checkout_design['tip_heading_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['tip_heading_font_weight'],
        ));
        $tip_note_style = $this->build_inline_style(array(
            'color' => $checkout_design['tip_note_color'],
            'font-family' => $checkout_design['tip_note_font_family'],
            'font-size' => (int) $checkout_design['tip_note_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['tip_note_font_weight'],
        ));
        $coupon_label_style = $this->build_inline_style(array(
            'color' => $checkout_design['coupon_label_color'],
            'font-family' => $checkout_design['coupon_label_font_family'],
            'font-size' => (int) $checkout_design['coupon_label_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['coupon_label_font_weight'],
        ));
        $coupon_toggle_style = $this->build_inline_style(array(
            'color' => $checkout_design['coupon_toggle_color'],
            'font-family' => $checkout_design['coupon_toggle_font_family'],
            'font-size' => (int) $checkout_design['coupon_toggle_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['coupon_toggle_font_weight'],
        ));
        $coupon_input_style = $this->build_inline_style(array(
            'background' => $checkout_design['coupon_input_bg_color'],
            'color' => $checkout_design['coupon_input_text_color'],
            'font-family' => $checkout_design['coupon_input_font_family'],
            'font-size' => (int) $checkout_design['coupon_input_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['coupon_input_font_weight'],
        ));
        $coupon_submit_style = $this->build_inline_style(array(
            'background' => $checkout_design['coupon_submit_bg_color'],
            'color' => $checkout_design['coupon_submit_text_color'],
            'font-family' => $checkout_design['coupon_submit_font_family'],
            'font-size' => (int) $checkout_design['coupon_submit_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['coupon_submit_font_weight'],
        ));
        $total_style = $this->build_inline_style(array(
            'color' => $checkout_design['total_color'],
            'font-family' => $checkout_design['total_font_family'],
            'font-size' => (int) $checkout_design['total_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['total_font_weight'],
        ));
        $legal_style = $this->build_inline_style(array(
            'color' => $checkout_design['legal_color'],
            'font-family' => $checkout_design['legal_font_family'],
            'font-size' => (int) $checkout_design['legal_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['legal_font_weight'],
        ));
        $place_order_style = $this->build_inline_style(array(
            'background' => $checkout_design['place_order_bg_color'],
            'color' => $checkout_design['place_order_text_color'],
            'font-family' => $checkout_design['place_order_font_family'],
            'font-size' => (int) $checkout_design['place_order_font_size'] . 'px',
            'font-weight' => (int) $checkout_design['place_order_font_weight'],
        ));

        if (!empty($applied_coupons)) {
            $first_coupon = reset($applied_coupons);
            $coupon_code_value = $first_coupon ? wc_format_coupon_code($first_coupon) : '';
        }

        ob_start();
        ?>
        <aside class="nevari-summary nevari-summary--checkout" data-nevari-summary style="background:<?php echo esc_attr($checkout_design['summary_bg_color']); ?>;border:1px solid <?php echo esc_attr($checkout_design['summary_border_color']); ?>;border-radius:<?php echo esc_attr((int) $checkout_design['summary_border_radius']); ?>px;color:<?php echo esc_attr($checkout_design['summary_text_color']); ?>;padding:18px;">
            <h3 style="<?php echo esc_attr($summary_title_style); ?>">Order Summary</h3>

            <div
                class="nevari-summary-totals"
                data-nevari-summary-totals
                data-items-total="<?php echo esc_attr(number_format($totals['items_total'], 2, '.', '')); ?>"
                data-discount-total="<?php echo esc_attr(number_format($totals['discount_total'], 2, '.', '')); ?>"
                data-tip-total="<?php echo esc_attr(number_format($totals['tip_total'], 2, '.', '')); ?>"
            >
                <div class="nevari-row">
                    <span style="<?php echo esc_attr($summary_label_style); ?>">Items total</span>
                    <strong style="<?php echo esc_attr($summary_value_style); ?>"><?php echo wp_kses_post(wc_price($totals['items_total'])); ?></strong>
                </div>

                <div class="nevari-row">
                    <span style="<?php echo esc_attr($summary_label_style); ?>">Discount</span>
                    <strong style="<?php echo esc_attr($summary_value_style); ?>"><?php echo wp_kses_post($totals['discount_total'] > 0 ? '-' . wc_price($totals['discount_total']) : wc_price(0)); ?></strong>
                </div>

                <div class="nevari-row">
                    <span style="<?php echo esc_attr($summary_label_style); ?>"><?php echo esc_html($tip_settings['title']); ?></span>
                    <strong style="<?php echo esc_attr($summary_value_style); ?>" data-nevari-tip-amount><?php echo wp_kses_post(wc_price($totals['tip_total'])); ?></strong>
                </div>
            </div>

            <hr>

            <h3 style="<?php echo esc_attr($tip_heading_style); ?>"><?php echo esc_html($tip_settings['title']); ?></h3>
            <p class="nevari-tip-note" style="<?php echo esc_attr($tip_note_style); ?>"><?php echo esc_html($tip_settings['note']); ?></p>

            <input type="hidden" name="nevari_selected_tip" value="<?php echo esc_attr($selected_tip); ?>">
            <input type="hidden" name="nevari_selected_tip_label" value="<?php echo esc_attr($selected_tip_label); ?>">

            <div class="nevari-tip-grid">
                <?php foreach ($tip_options as $tip_option) :
                    $tip_value = $tip_option['value'];
                    $tip_label = $tip_option['label'];
                    $tip_icon = isset($tip_option['icon']) ? $tip_option['icon'] : '';
                    $is_selected_tip = (float) $tip_value === $selected_tip_amount;
                    ?>
                    <button
                        type="button"
                        class="nevari-tip <?php echo $is_selected_tip ? 'is-selected' : ''; ?>"
                        data-tip="<?php echo esc_attr($tip_value); ?>"
                        data-tip-label="<?php echo esc_attr($tip_label); ?>"
                        data-tip-icon="<?php echo esc_attr($tip_icon); ?>"
                        style="--nevari-tip-bg:<?php echo esc_attr($tip_settings['button_bg_color']); ?>;--nevari-tip-text:<?php echo esc_attr($tip_settings['button_text_color']); ?>;--nevari-tip-active-bg:<?php echo esc_attr($tip_settings['button_active_bg_color']); ?>;--nevari-tip-active-text:<?php echo esc_attr($tip_settings['button_active_text_color']); ?>;--nevari-tip-radius:<?php echo esc_attr((int) $tip_settings['button_border_radius']); ?>px;--nevari-tip-font-family:<?php echo esc_attr($tip_settings['button_font_family']); ?>;--nevari-tip-font-size:<?php echo esc_attr((int) $tip_settings['button_font_size']); ?>px;--nevari-tip-font-weight:<?php echo esc_attr((int) $tip_settings['button_font_weight']); ?>;--nevari-tip-icon-color:<?php echo esc_attr($tip_settings['button_icon_color']); ?>;"
                    >
                        <?php if (!empty($tip_icon)) : ?>
                            <?php echo $this->get_ui_icon_markup($tip_icon, $tip_settings['button_icon_color'], 14, 'nevari-tip__icon'); ?>
                        <?php endif; ?>
                        <?php echo esc_html($tip_label); ?>
                    </button>
                <?php endforeach; ?>
            </div>

            <hr>

            <div class="nevari-coupon-shell">
                <div class="nevari-coupon">
                    <span style="<?php echo esc_attr($coupon_label_style); ?>">Coupon</span>
                    <button
                        type="button"
                        class="nevari-coupon-toggle"
                        data-nevari-coupon-toggle
                        style="<?php echo esc_attr($coupon_toggle_style); ?>"
                        aria-expanded="<?php echo !empty($applied_coupons) ? 'true' : 'false'; ?>"
                    >
                        <?php echo !empty($applied_coupons) ? esc_html__('Update Coupon', 'woocommerce') : esc_html__('+ Add Coupon', 'woocommerce'); ?>
                    </button>
                </div>

                <div class="nevari-coupon-panel" data-nevari-coupon-panel <?php echo !empty($applied_coupons) ? '' : 'hidden'; ?>>
                    <form class="nevari-coupon-form" data-nevari-coupon-form>
                        <label class="screen-reader-text" for="nevari_coupon_code">Coupon code</label>
                        <div class="nevari-coupon-controls">
                            <input
                                id="nevari_coupon_code"
                                name="coupon_code"
                                type="text"
                                autocomplete="off"
                                placeholder="Enter coupon code"
                                value="<?php echo esc_attr($coupon_code_value); ?>"
                                style="<?php echo esc_attr($coupon_input_style); ?>"
                            >
                            <button type="submit" class="nevari-coupon-submit" style="<?php echo esc_attr($coupon_submit_style); ?>">Apply</button>
                        </div>
                    </form>

                    <div class="nevari-coupon-status" data-nevari-coupon-status>
                        <?php if (!empty($applied_coupons)) : ?>
                            <div class="nevari-coupon-applied">
                                <?php foreach ($applied_coupons as $applied_coupon) : ?>
                                    <span class="nevari-coupon-chip">
                                        <?php echo esc_html($applied_coupon); ?>
                                        <button type="button" class="nevari-coupon-chip__remove" data-nevari-remove-coupon="<?php echo esc_attr($applied_coupon); ?>" aria-label="<?php echo esc_attr(sprintf(__('Remove coupon %s', 'woocommerce'), $applied_coupon)); ?>">&times;</button>
                                    </span>
                                <?php endforeach; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>

            <div class="nevari-total" data-nevari-total>
                <span style="<?php echo esc_attr($summary_label_style); ?>">Total</span>
                <strong style="<?php echo esc_attr($total_style); ?>" data-nevari-total-amount><?php echo wp_kses_post(wc_price($totals['display_total'])); ?></strong>
            </div>

            <p class="nevari-legal" style="<?php echo esc_attr($legal_style); ?>">
                By placing this order, you are agreeing to
                <a href="<?php echo esc_url(wc_get_page_permalink('terms')); ?>">Terms and Conditions.</a>
            </p>

            <button type="submit" class="nevari-place-order" name="woocommerce_checkout_place_order" id="place_order" value="Place order" style="<?php echo esc_attr($place_order_style); ?>">
                Place Order
            </button>
        </aside>
        <?php
        return ob_get_clean();
    }

    public function ajax_apply_checkout_coupon() {
        check_ajax_referer('nevari-checkout-coupon', 'nonce');

        if (function_exists('wc_load_cart')) {
            wc_load_cart();
        }

        if (!function_exists('WC') || !WC()->cart) {
            wp_send_json_error(
                array(
                    'message' => __('Cart is unavailable.', 'woocommerce'),
                ),
                400
            );
        }

        $coupon_code = isset($_POST['coupon_code'])
            ? wc_format_coupon_code(wp_unslash($_POST['coupon_code']))
            : '';

        if ('' === $coupon_code) {
            wc_add_notice(__('Please enter a coupon code.', 'woocommerce'), 'error');
        } elseif (WC()->cart->has_discount($coupon_code)) {
            wc_add_notice(__('That coupon is already applied.', 'woocommerce'), 'notice');
        } elseif (!WC()->cart->apply_coupon($coupon_code)) {
            if (!wc_notice_count('error')) {
                wc_add_notice(__('That coupon could not be applied.', 'woocommerce'), 'error');
            }
        }

        WC()->cart->calculate_totals();

        ob_start();
        wc_print_notices();
        $notices_html = ob_get_clean();

        wp_send_json_success(
            array(
                'notices_html' => $notices_html,
                'summary_html'  => $this->render_checkout_summary_markup(
                    $this->get_checkout_design_options(),
                    $this->get_tip_settings(),
                    WC()->session ? WC()->session->get('nevari_selected_tip') : '',
                    $this->get_checkout_tip_amount()
                ),
            )
        );
    }

    public function ajax_remove_checkout_coupon() {
        check_ajax_referer('nevari-checkout-coupon', 'nonce');

        if (function_exists('wc_load_cart')) {
            wc_load_cart();
        }

        if (!function_exists('WC') || !WC()->cart) {
            wp_send_json_error(
                array(
                    'message' => __('Cart is unavailable.', 'woocommerce'),
                ),
                400
            );
        }

        $coupon_code = isset($_POST['coupon_code'])
            ? wc_format_coupon_code(wp_unslash($_POST['coupon_code']))
            : '';

        if ($coupon_code && WC()->cart->has_discount($coupon_code)) {
            WC()->cart->remove_coupon($coupon_code);
            wc_add_notice(__('Coupon removed.', 'woocommerce'), 'notice');
        }

        WC()->cart->calculate_totals();

        ob_start();
        wc_print_notices();
        $notices_html = ob_get_clean();

        wp_send_json_success(
            array(
                'notices_html' => $notices_html,
                'summary_html'  => $this->render_checkout_summary_markup(
                    $this->get_checkout_design_options(),
                    $this->get_tip_settings(),
                    WC()->session ? WC()->session->get('nevari_selected_tip') : '',
                    $this->get_checkout_tip_amount()
                ),
            )
        );
    }

    public function make_default_fields_optional($fields) {
        foreach ($fields as $group => $group_fields) {
            foreach ($group_fields as $key => $field) {
                $fields[$group][$key]['required'] = false;
            }
        }

        return $fields;
    }

    public function validate_custom_fields() {
        if (empty($_POST['nevari_delivery_address'])) {
            wc_add_notice(__('Please enter your delivery address.', 'woocommerce'), 'error');
        }
    }

    public function save_custom_fields($order, $data) {
        $address = isset($_POST['nevari_delivery_address'])
            ? sanitize_text_field(wp_unslash($_POST['nevari_delivery_address']))
            : '';

        $tip = isset($_POST['nevari_selected_tip'])
            ? sanitize_text_field(wp_unslash($_POST['nevari_selected_tip']))
            : '';

        $tip_label = isset($_POST['nevari_selected_tip_label'])
            ? sanitize_text_field(wp_unslash($_POST['nevari_selected_tip_label']))
            : '';

        if ($address) {
            $order->update_meta_data('_nevari_delivery_address', $address);
            $order->set_billing_address_1($address);
            $order->set_shipping_address_1($address);
        }

        if ($tip) {
            $order->update_meta_data('_nevari_selected_tip', $tip);
        }

        if ($tip_label) {
            $order->update_meta_data('_nevari_selected_tip_label', $tip_label);
        }
    }

    private function parse_tip_amount($tip) {
        $amount = preg_replace('/[^0-9.]/', '', (string) $tip);

        return $amount !== '' ? (float) $amount : 0;
    }

    private function get_tip_options() {
        $settings = $this->get_tip_settings();

        return $this->parse_tip_list(isset($settings['tip_list']) ? $settings['tip_list'] : '');
    }

    public function apply_tip_fee($cart) {
        if (is_admin() && !defined('DOING_AJAX')) {
            return;
        }

        if (!WC()->session) {
            return;
        }

        $tip = WC()->session->get('nevari_selected_tip');
        $tip_amount = $this->parse_tip_amount($tip);

        if ($tip_amount > 0) {
            $settings = $this->get_tip_settings();
            $fee_label = isset($settings['title']) && '' !== $settings['title'] ? $settings['title'] : __('Delivery Tip', 'woocommerce');
            $cart->add_fee($fee_label, $tip_amount, false);
        }
    }

    public function update_tip_session_from_checkout($posted_data) {
        if (!WC()->session) {
            return;
        }

        parse_str((string) $posted_data, $parsed_data);

        $tip = isset($parsed_data['nevari_selected_tip'])
            ? sanitize_text_field(wp_unslash($parsed_data['nevari_selected_tip']))
            : '';

        $tip_label = isset($parsed_data['nevari_selected_tip_label'])
            ? sanitize_text_field(wp_unslash($parsed_data['nevari_selected_tip_label']))
            : '';

        WC()->session->set('nevari_selected_tip', $tip);
        WC()->session->set('nevari_selected_tip_label', $tip_label);
    }

    private function get_configured_free_shipping_threshold() {
        return (float) get_option('nevari_free_shipping_threshold', 0);
    }

    private function is_cart_eligible_for_free_shipping() {
        if (!function_exists('WC') || !WC()->cart) {
            return false;
        }

        $threshold = $this->get_free_shipping_threshold();

        if ($threshold <= 0) {
            return false;
        }

        return (float) WC()->cart->get_cart_contents_total() >= $threshold;
    }

    public function maybe_apply_free_shipping_rates($rates, $package) {
        if (!$this->is_cart_eligible_for_free_shipping()) {
            return $rates;
        }

        foreach ($rates as $rate_key => $rate) {
            $rates[$rate_key]->cost = 0;

            if (!empty($rates[$rate_key]->taxes) && is_array($rates[$rate_key]->taxes)) {
                $rates[$rate_key]->taxes = array_map(
                    static function () {
                        return 0;
                    },
                    $rates[$rate_key]->taxes
                );
            }

            $rates[$rate_key]->label = __('Free delivery', 'woocommerce');
        }

        return $rates;
    }

    private function get_cart_images() {
        if (!WC()->cart || WC()->cart->is_empty()) {
            return array();
        }

        $images = array();

        foreach (WC()->cart->get_cart() as $cart_item) {
            if (empty($cart_item['data'])) {
                continue;
            }

            $product = $cart_item['data'];

            if (!$product || !$product->exists()) {
                continue;
            }

            $quantity = isset($cart_item['quantity']) ? max(1, absint($cart_item['quantity'])) : 1;
            $image_id = $product->get_image_id();

            $image_url = $image_id
                ? wp_get_attachment_image_url($image_id, 'woocommerce_thumbnail')
                : wc_placeholder_img_src('woocommerce_thumbnail');

            for ($i = 0; $i < $quantity; $i++) {
                $images[] = array(
                    'url'  => $image_url,
                    'name' => $product->get_name(),
                    'link' => $product->is_visible() ? $product->get_permalink($cart_item) : '#',
                );
            }
        }

        return $images;
    }

    private function get_cart_discount_total() {
        if (!WC()->cart || WC()->cart->is_empty()) {
            return 0;
        }

        $discount_total = 0;

        foreach (WC()->cart->get_cart() as $cart_item) {
            if (empty($cart_item['data'])) {
                continue;
            }

            $product = $cart_item['data'];

            if (!$product || !$product->exists()) {
                continue;
            }

            $quantity = isset($cart_item['quantity']) ? max(1, absint($cart_item['quantity'])) : 1;
            $regular_price = (float) $product->get_regular_price();
            $current_price = (float) wc_get_price_to_display($product);

            if ($regular_price > $current_price) {
                $discount_total += ($regular_price - $current_price) * $quantity;
            }
        }

        return max(0, $discount_total);
    }

    private function get_first_gateway_id() {
        if (!WC()->payment_gateways()) {
            return '';
        }

        $gateways = WC()->payment_gateways()->get_available_payment_gateways();

        if (empty($gateways)) {
            return '';
        }

        $ids = array_keys($gateways);

        return $ids[0];
    }

    private function get_checkout_gateways() {
        if (!WC()->payment_gateways()) {
            return array();
        }

        $gateways = WC()->payment_gateways()->get_available_payment_gateways();

        if (!empty($gateways)) {
            return $gateways;
        }

        $registered_gateways = WC()->payment_gateways()->payment_gateways();

        if (!is_array($registered_gateways)) {
            return array();
        }

        return array_filter(
            $registered_gateways,
            function ($gateway) {
                return $gateway instanceof WC_Payment_Gateway && 'yes' === $gateway->enabled;
            }
        );
    }

    private function prime_chosen_gateway($gateways) {
        if (empty($gateways) || !is_array($gateways)) {
            return '';
        }

        $gateway_ids = array_keys($gateways);
        $chosen = isset($_POST['payment_method']) ? wc_clean(wp_unslash($_POST['payment_method'])) : '';

        if ('' === $chosen && WC()->session) {
            $chosen = (string) WC()->session->get('chosen_payment_method');
        }

        if ('' === $chosen || !isset($gateways[$chosen])) {
            $chosen = (string) reset($gateway_ids);
        }

        if (WC()->session) {
            WC()->session->set('chosen_payment_method', $chosen);
        }

        foreach ($gateways as $gateway_id => $gateway) {
            $gateway->chosen = ($gateway_id === $chosen);
        }

        return $chosen;
    }

    private function render_checkout_payment_methods() {
        if (!WC()->cart || !WC()->cart->needs_payment()) {
            return '';
        }

        $gateways = $this->get_checkout_gateways();
        $this->prime_chosen_gateway($gateways);

        if (empty($gateways)) {
            return '<p class="nevari-payment-empty">' . esc_html__('No payment methods are available for your order right now. Please confirm your WooCommerce payment gateway configuration.', 'woocommerce') . '</p>';
        }

        ob_start();
        ?>
        <div id="payment" class="woocommerce-checkout-payment">
            <ul class="wc_payment_methods payment_methods methods">
                <?php foreach ($gateways as $gateway) : ?>
                    <?php wc_get_template('checkout/payment-method.php', array('gateway' => $gateway)); ?>
                <?php endforeach; ?>
            </ul>
        </div>
        <?php

        return ob_get_clean();
    }

    private function get_free_shipping_threshold() {
        $configured_threshold = $this->get_configured_free_shipping_threshold();

        if ($configured_threshold > 0) {
            return $configured_threshold;
        }

        if (!class_exists('WC_Shipping_Zones')) {
            return 0;
        }

        $thresholds = array();
        $zones = WC_Shipping_Zones::get_zones();

        foreach ($zones as $zone_data) {
            if (empty($zone_data['shipping_methods'])) {
                continue;
            }

            foreach ($zone_data['shipping_methods'] as $method) {
                if ('free_shipping' !== $method->id || 'yes' !== $method->enabled) {
                    continue;
                }

                $minimum = (float) $method->get_option('min_amount', 0);

                if ($minimum > 0) {
                    $thresholds[] = $minimum;
                }
            }
        }

        $default_zone = WC_Shipping_Zones::get_zone(0);

        if ($default_zone) {
            foreach ($default_zone->get_shipping_methods(true) as $method) {
                if ('free_shipping' !== $method->id || 'yes' !== $method->enabled) {
                    continue;
                }

                $minimum = (float) $method->get_option('min_amount', 0);

                if ($minimum > 0) {
                    $thresholds[] = $minimum;
                }
            }
        }

        return $thresholds ? min($thresholds) : 0;
    }

    public function render_cart() {
        if (!class_exists('WooCommerce') || !WC()->cart) {
            return '<p>WooCommerce cart is unavailable.</p>';
        }

        $cart = WC()->cart;
        $cart_items = $cart->get_cart();
        $cart_url = wc_get_cart_url();
        $checkout_url = wc_get_checkout_url();
        $free_shipping_threshold = $this->get_free_shipping_threshold();
        $items_total = (float) $cart->get_cart_contents_total();
        $delivery_fee = (float) $cart->get_shipping_total();
        $totals = $cart->get_totals();
        $subtotal = isset($totals['total']) ? (float) $totals['total'] : ($items_total + $delivery_fee);
        $progress_total = $free_shipping_threshold > 0 ? $free_shipping_threshold : max($items_total, 1);
        $progress_percent = $progress_total > 0 ? min(100, ($items_total / $progress_total) * 100) : 0;
        $savings_amount = $this->get_cart_discount_total();

        if ($free_shipping_threshold > 0 && $items_total < $free_shipping_threshold) {
            $progress_message = sprintf(
                __('Add %s more to unlock free delivery', 'woocommerce'),
                wp_strip_all_tags(wc_price($free_shipping_threshold - $items_total))
            );
        } else {
            $progress_message = sprintf(
                __('Free delivery + saving %s on this order', 'woocommerce'),
                wp_strip_all_tags(wc_price($savings_amount))
            );
        }

        ob_start();
        do_action('woocommerce_before_cart');
        ?>

        <div class="nevari-cart-page">
            <div class="nevari-cart-header">
                <a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>" class="nevari-cart-back">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Back
                </a>
                <h1 class="nevari-cart-title">Your Cart</h1>
            </div>

            <?php wc_print_notices(); ?>

            <?php if ($cart->is_empty()) : ?>
                <div class="nevari-cart-empty">
                    <p>Your cart is currently empty.</p>
                    <a href="<?php echo esc_url(wc_get_page_permalink('shop')); ?>" class="nevari-cart-empty-link">Continue shopping</a>
                </div>
            <?php else : ?>
                <div class="nevari-cart-layout">
                    <form class="nevari-cart-form" action="<?php echo esc_url($cart_url); ?>" method="post">
                        <?php foreach ($cart_items as $cart_item_key => $cart_item) :
                            if (empty($cart_item['data']) || !apply_filters('woocommerce_cart_item_visible', true, $cart_item, $cart_item_key)) {
                                continue;
                            }

                            $product = $cart_item['data'];

                            if (!$product || !$product->exists() || $cart_item['quantity'] <= 0) {
                                continue;
                            }

                            $product_name = $product->get_name();
                            $product_permalink = $product->is_visible() ? $product->get_permalink($cart_item) : '';
                            $image_id = $product->get_image_id();
                            $image_url = $image_id
                                ? wp_get_attachment_image_url($image_id, 'woocommerce_thumbnail')
                                : wc_placeholder_img_src('woocommerce_thumbnail');
                            $display_price = wc_price((float) wc_get_price_to_display($product));
                            $regular_price = (float) $product->get_regular_price();
                            $sale_price = (float) $product->get_price();
                            $quantity = max(1, (int) $cart_item['quantity']);
                            $remove_url = wc_get_cart_remove_url($cart_item_key);
                            ?>
                            <div class="nevari-cart-item">
                                <div class="nevari-cart-item-main">
                                    <?php if ($product_permalink) : ?>
                                        <a href="<?php echo esc_url($product_permalink); ?>" class="nevari-cart-item-image">
                                            <img src="<?php echo esc_url($image_url); ?>" alt="<?php echo esc_attr($product_name); ?>">
                                        </a>
                                    <?php else : ?>
                                        <span class="nevari-cart-item-image">
                                            <img src="<?php echo esc_url($image_url); ?>" alt="<?php echo esc_attr($product_name); ?>">
                                        </span>
                                    <?php endif; ?>

                                    <div class="nevari-cart-item-details">
                                        <div class="nevari-cart-item-name"><?php echo esc_html($product_name); ?></div>
                                        <div class="nevari-cart-item-prices">
                                            <span class="nevari-cart-item-price-current"><?php echo wp_kses_post($display_price); ?></span>
                                            <?php if ($regular_price > 0 && $regular_price > $sale_price) : ?>
                                                <span class="nevari-cart-item-price-original"><?php echo wp_kses_post(wc_price($regular_price)); ?></span>
                                            <?php endif; ?>
                                        </div>
                                    </div>
                                </div>

                                <div class="nevari-cart-item-actions">
                                    <div class="nevari-cart-qty-control" data-cart-qty data-cart-item-key="<?php echo esc_attr($cart_item_key); ?>">
                                        <div class="nevari-cart-qty-main">
                                            <button type="button" class="nevari-cart-qty-btn is-light" data-qty-action="decrease" aria-label="Decrease quantity">
                                                <span class="nevari-cart-minus" aria-hidden="true"></span>
                                            </button>
                                            <input type="number" class="nevari-cart-qty-input" name="cart[<?php echo esc_attr($cart_item_key); ?>][qty]" value="<?php echo esc_attr($quantity); ?>" min="1" step="1" inputmode="numeric" aria-label="Quantity">
                                            <button type="button" class="nevari-cart-qty-btn is-dark" data-qty-action="increase" aria-label="Increase quantity">
                                                <span class="nevari-cart-plus" aria-hidden="true"></span>
                                            </button>
                                        </div>
                                    </div>
                                    <span class="nevari-cart-qty-loader" aria-hidden="true"></span>

                                    <a href="<?php echo esc_url($remove_url); ?>" class="nevari-cart-remove">Remove</a>
                                </div>
                            </div>
                        <?php endforeach; ?>

                        <?php wp_nonce_field('woocommerce-cart', 'woocommerce-cart-nonce'); ?>
                        <button type="submit" class="nevari-cart-update-trigger" name="update_cart" value="1">Update cart</button>
                    </form>

                    <aside class="nevari-cart-summary">
                        <div class="nevari-cart-summary-card">
                            <div class="nevari-cart-progress">
                                <div class="nevari-cart-progress-track">
                                    <span class="nevari-cart-progress-fill" style="width: <?php echo esc_attr(round($progress_percent, 2)); ?>%;"></span>
                                </div>
                                <p class="nevari-cart-progress-text"><?php echo esc_html($progress_message); ?></p>
                            </div>

                            <div class="nevari-cart-summary-block">
                                <h2 class="nevari-cart-summary-title">Order Summary</h2>

                                <div class="nevari-cart-summary-rows">
                                    <div class="nevari-cart-summary-row">
                                        <span>Items total</span>
                                        <span><?php echo wp_kses_post(wc_price($items_total)); ?></span>
                                    </div>
                                    <div class="nevari-cart-summary-row">
                                        <span>Delivery fee</span>
                                        <span><?php echo wp_kses_post(wc_price($delivery_fee)); ?></span>
                                    </div>
                                </div>

                                <div class="nevari-cart-summary-divider"></div>

                                <div class="nevari-cart-summary-total">
                                    <span>Subtotal</span>
                                    <span><?php echo wp_kses_post(wc_price($subtotal)); ?></span>
                                </div>
                            </div>

                            <button type="button" class="nevari-cart-checkout" onclick="window.location.href='<?php echo esc_url($checkout_url); ?>'">
                                <span class="nevari-cart-checkout-main">
                                    <img src="<?php echo esc_url(plugins_url('card.svg', __FILE__)); ?>" alt="" aria-hidden="true">
                                    <span>Checkout</span>
                                </span>
                                <span class="nevari-cart-checkout-total"><?php echo wp_kses_post(wc_price($subtotal)); ?></span>
                            </button>
                        </div>
                    </aside>
                </div>
            <?php endif; ?>
        </div>

        <?php
        do_action('woocommerce_after_cart');
        return ob_get_clean();
    }

    public function render_checkout_v2() {
        if (!class_exists('WooCommerce')) {
            return '<p>WooCommerce is required.</p>';
        }

        if (!WC()->cart || WC()->cart->is_empty()) {
            return '<div class="nevari-checkout-page"><p>Your cart is currently empty.</p></div>';
        }

        $checkout = WC()->checkout();
        $cart_images = $this->get_cart_images();
        $user = wp_get_current_user();
        $selected_tip = WC()->session ? WC()->session->get('nevari_selected_tip') : '';
        $selected_tip_amount = $this->parse_tip_amount($selected_tip);
        $checkout_design = $this->get_checkout_design_options();
        $tip_settings = $this->get_tip_settings();
        $payment_methods_markup = $this->render_checkout_payment_methods();
        $page_title_style = sprintf(
            'color:%1$s;font-family:%2$s;font-size:%3$dpx;font-weight:%4$d;',
            esc_attr($checkout_design['title_color']),
            esc_attr($checkout_design['title_font_family']),
            (int) $checkout_design['title_font_size'],
            (int) $checkout_design['title_font_weight']
        );
        $section_heading_style = sprintf(
            'color:%1$s;font-family:%2$s;font-size:%3$dpx;font-weight:%4$d;',
            esc_attr($checkout_design['review_title_color']),
            esc_attr($checkout_design['review_title_font_family']),
            (int) $checkout_design['review_title_font_size'],
            (int) $checkout_design['review_title_font_weight']
        );

        ob_start();

        do_action('woocommerce_before_checkout_form', $checkout);
        ?>

        <form name="checkout" method="post" class="checkout woocommerce-checkout nevari-checkout-form" action="<?php echo esc_url(wc_get_checkout_url()); ?>" enctype="multipart/form-data">
            <?php wp_nonce_field('woocommerce-process_checkout', 'woocommerce-process-checkout-nonce'); ?>

            <input type="hidden" name="billing_first_name" value="<?php echo esc_attr($user->first_name ?: 'Customer'); ?>">
            <input type="hidden" name="billing_last_name" value="<?php echo esc_attr($user->last_name ?: 'Guest'); ?>">
            <input type="hidden" name="billing_email" value="<?php echo esc_attr($user->user_email ?: get_option('admin_email')); ?>">
            <input type="hidden" name="billing_country" value="<?php echo esc_attr(WC()->countries->get_base_country()); ?>">
            <input type="hidden" name="billing_city" value="<?php echo esc_attr(WC()->countries->get_base_city() ?: 'City'); ?>">
            <input type="hidden" name="billing_postcode" value="00000">

            <div class="nevari-checkout-page" style="font-family:<?php echo esc_attr($checkout_design['page_font_family']); ?>;">
                <a href="<?php echo esc_url(wc_get_cart_url()); ?>" class="nevari-back">
                    <svg class="nevari-back-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Back</span>
                </a>

                <h1 class="nevari-title" style="<?php echo esc_attr($page_title_style); ?>">Checkout</h1>

                <?php if (!empty($checkout_design['banner_enabled'])) : ?>
                    <section
                        class="nevari-info-panel nevari-info-panel--checkout"
                        style="background:<?php echo esc_attr($checkout_design['banner_bg_color']); ?>;color:<?php echo esc_attr($checkout_design['banner_text_color']); ?>;"
                    >
                        <div class="nevari-info-panel__icon" style="color:<?php echo esc_attr($checkout_design['banner_accent_color']); ?>;">
                            <?php echo $this->get_ui_icon_markup($checkout_design['banner_icon'], $checkout_design['banner_accent_color'], 24, 'nevari-info-panel__icon-markup', isset($checkout_design['banner_icon_custom_url']) ? $checkout_design['banner_icon_custom_url'] : ''); ?>
                        </div>
                        <div class="nevari-info-panel__content" style="font-family:<?php echo esc_attr($checkout_design['banner_font_family']); ?>;font-size:<?php echo esc_attr((int) $checkout_design['banner_font_size']); ?>px;font-weight:<?php echo esc_attr((int) $checkout_design['banner_font_weight']); ?>;">
                            <strong class="nevari-info-panel__title"><?php echo esc_html($checkout_design['banner_title']); ?></strong>
                            <span class="nevari-info-panel__text"><?php echo esc_html($checkout_design['banner_text']); ?></span>
                        </div>
                    </section>
                <?php endif; ?>

                <?php wc_print_notices(); ?>

                <div class="nevari-layout">
                    <div class="nevari-left">
                        <section class="nevari-card" style="background:<?php echo esc_attr($checkout_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($checkout_design['card_border_color']); ?>;border-radius:<?php echo esc_attr((int) $checkout_design['card_border_radius']); ?>px;">
                            <div class="nevari-card-header">
                                <h2 style="<?php echo esc_attr($section_heading_style); ?>">Delivery info <?php echo $this->get_ui_icon_markup(isset($checkout_design['review_badge_icon']) ? $checkout_design['review_badge_icon'] : 'info', isset($checkout_design['review_badge_icon_color']) ? $checkout_design['review_badge_icon_color'] : $checkout_design['title_color'], 18, 'nevari-review-badge__icon', isset($checkout_design['review_badge_icon_custom_url']) ? $checkout_design['review_badge_icon_custom_url'] : ''); ?></h2>
                            </div>

                            <label for="nevari_delivery_address">Deliver To:</label>
                            <input
                                id="nevari_delivery_address"
                                name="nevari_delivery_address"
                                type="text"
                                placeholder="Enter your delivery address"
                                value="<?php echo isset($_POST['nevari_delivery_address']) ? esc_attr(sanitize_text_field(wp_unslash($_POST['nevari_delivery_address']))) : ''; ?>"
                                required
                            >
                        </section>

                        <section class="nevari-card" style="background:<?php echo esc_attr($checkout_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($checkout_design['card_border_color']); ?>;border-radius:<?php echo esc_attr((int) $checkout_design['card_border_radius']); ?>px;">
                            <div class="nevari-card-header">
                                <h2 style="<?php echo esc_attr($section_heading_style); ?>">Payment method <?php echo $this->get_ui_icon_markup(isset($checkout_design['review_badge_icon']) ? $checkout_design['review_badge_icon'] : 'info', isset($checkout_design['review_badge_icon_color']) ? $checkout_design['review_badge_icon_color'] : $checkout_design['title_color'], 18, 'nevari-review-badge__icon', isset($checkout_design['review_badge_icon_custom_url']) ? $checkout_design['review_badge_icon_custom_url'] : ''); ?></h2>
                            </div>
                            <div class="nevari-payment-methods">
                                <?php echo $payment_methods_markup; ?>
                            </div>
                        </section>

                        <section class="nevari-card" style="background:<?php echo esc_attr($checkout_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($checkout_design['card_border_color']); ?>;border-radius:<?php echo esc_attr((int) $checkout_design['card_border_radius']); ?>px;">
                            <div class="nevari-card-header nevari-review-title">
                                <h2 style="<?php echo esc_attr($section_heading_style); ?>">Review Order <?php echo $this->get_ui_icon_markup(isset($checkout_design['review_badge_icon']) ? $checkout_design['review_badge_icon'] : 'info', isset($checkout_design['review_badge_icon_color']) ? $checkout_design['review_badge_icon_color'] : $checkout_design['title_color'], 18, 'nevari-review-badge__icon', isset($checkout_design['review_badge_icon_custom_url']) ? $checkout_design['review_badge_icon_custom_url'] : ''); ?></h2>
                            </div>

                            <div class="nevari-review-strip">
                                <div class="nevari-review-images" data-nevari-review-images>
                                    <?php foreach ($cart_images as $image) : ?>
                                        <a href="<?php echo esc_url($image['link']); ?>" class="nevari-review-image-link">
                                            <img src="<?php echo esc_url($image['url']); ?>" alt="<?php echo esc_attr($image['name']); ?>" loading="lazy">
                                        </a>
                                    <?php endforeach; ?>
                                </div>

                                <div class="nevari-review-more" data-nevari-more hidden>+0</div>
                                <button type="button" class="nevari-review-arrow" data-nevari-arrow hidden aria-label="Scroll order items">
                                    <img src="<?php echo esc_url(plugins_url('arrow-right.svg', __FILE__)); ?>" alt="" aria-hidden="true">
                                </button>
                            </div>
                        </section>
                    </div>

                    <?php echo $this->render_checkout_summary_markup($checkout_design, $tip_settings, $selected_tip, $selected_tip_amount); ?>
                </div>
            </div>
        </form>

        <?php
        do_action('woocommerce_after_checkout_form', $checkout);

        return ob_get_clean();
    }

    public function render_checkout() {
        if (!class_exists('WooCommerce')) {
            return '<p>WooCommerce is required.</p>';
        }

        if (!WC()->cart || WC()->cart->is_empty()) {
            return '<div class="nevari-checkout-page"><p>Your cart is currently empty.</p></div>';
        }

        $checkout = WC()->checkout();
        $cart_images = $this->get_cart_images();
        $user = wp_get_current_user();
        $selected_tip = WC()->session ? WC()->session->get('nevari_selected_tip') : '';
        $selected_tip_amount = $this->parse_tip_amount($selected_tip);
        $checkout_design = $this->get_checkout_design_options();
        $tip_settings = $this->get_tip_settings();
        $tip_options = $this->get_tip_options();
        $payment_methods_markup = $this->render_checkout_payment_methods();
        $page_title_style = sprintf(
            'color:%1$s;font-family:%2$s;font-size:%3$dpx;font-weight:%4$d;',
            esc_attr($checkout_design['title_color']),
            esc_attr($checkout_design['title_font_family']),
            (int) $checkout_design['title_font_size'],
            (int) $checkout_design['title_font_weight']
        );

        ob_start();

        do_action('woocommerce_before_checkout_form', $checkout);
        ?>

        <form name="checkout" method="post" class="checkout woocommerce-checkout nevari-checkout-form" action="<?php echo esc_url(wc_get_checkout_url()); ?>" enctype="multipart/form-data">

            <?php wp_nonce_field('woocommerce-process_checkout', 'woocommerce-process-checkout-nonce'); ?>

            <input type="hidden" name="billing_first_name" value="<?php echo esc_attr($user->first_name ?: 'Customer'); ?>">
            <input type="hidden" name="billing_last_name" value="<?php echo esc_attr($user->last_name ?: 'Guest'); ?>">
            <input type="hidden" name="billing_email" value="<?php echo esc_attr($user->user_email ?: get_option('admin_email')); ?>">
            <input type="hidden" name="billing_country" value="<?php echo esc_attr(WC()->countries->get_base_country()); ?>">
            <input type="hidden" name="billing_city" value="<?php echo esc_attr(WC()->countries->get_base_city() ?: 'City'); ?>">
            <input type="hidden" name="billing_postcode" value="00000">

            <div class="nevari-checkout-page" style="font-family:<?php echo esc_attr($checkout_design['page_font_family']); ?>;">
                <a href="<?php echo esc_url(wc_get_cart_url()); ?>" class="nevari-back">
                    <svg class="nevari-back-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>Back</span>
                </a>

                <h1 class="nevari-title" style="<?php echo esc_attr($page_title_style); ?>">Checkout</h1>

                <?php if (!empty($checkout_design['banner_enabled'])) : ?>
                    <section
                        class="nevari-info-panel nevari-info-panel--checkout"
                        style="background:<?php echo esc_attr($checkout_design['banner_bg_color']); ?>;color:<?php echo esc_attr($checkout_design['banner_text_color']); ?>;"
                    >
                        <div class="nevari-info-panel__icon" style="color:<?php echo esc_attr($checkout_design['banner_accent_color']); ?>;">
                            <?php echo $this->get_ui_icon_markup($checkout_design['banner_icon'], $checkout_design['banner_accent_color'], 24, 'nevari-info-panel__icon-markup'); ?>
                        </div>
                        <div class="nevari-info-panel__content" style="font-family:<?php echo esc_attr($checkout_design['banner_font_family']); ?>;font-size:<?php echo esc_attr((int) $checkout_design['banner_font_size']); ?>px;font-weight:<?php echo esc_attr((int) $checkout_design['banner_font_weight']); ?>;">
                            <strong class="nevari-info-panel__title"><?php echo esc_html($checkout_design['banner_title']); ?></strong>
                            <span class="nevari-info-panel__text"><?php echo esc_html($checkout_design['banner_text']); ?></span>
                        </div>
                    </section>
                <?php endif; ?>

                <div class="nevari-layout">
                    <div class="nevari-left">

                        <section class="nevari-card" style="background:<?php echo esc_attr($checkout_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($checkout_design['card_border_color']); ?>;border-radius:<?php echo esc_attr((int) $checkout_design['card_border_radius']); ?>px;">
                            <div class="nevari-card-header">
                                <h2 style="<?php echo esc_attr($section_heading_style); ?>">Delivery info <?php echo $this->get_ui_icon_markup(isset($checkout_design['review_badge_icon']) ? $checkout_design['review_badge_icon'] : 'info', isset($checkout_design['review_badge_icon_color']) ? $checkout_design['review_badge_icon_color'] : $checkout_design['title_color'], 18, 'nevari-review-badge__icon', isset($checkout_design['review_badge_icon_custom_url']) ? $checkout_design['review_badge_icon_custom_url'] : ''); ?></h2>
                                
                            </div>

                            <label for="nevari_delivery_address">Deliver To:</label>
                            <input
                                id="nevari_delivery_address"
                                name="nevari_delivery_address"
                                type="text"
                                placeholder="Enter your delivery address"
                                value="<?php echo isset($_POST['nevari_delivery_address']) ? esc_attr(sanitize_text_field(wp_unslash($_POST['nevari_delivery_address']))) : ''; ?>"
                                required
                            >
                        </section>

                        <section class="nevari-card" style="background:<?php echo esc_attr($checkout_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($checkout_design['card_border_color']); ?>;border-radius:<?php echo esc_attr((int) $checkout_design['card_border_radius']); ?>px;">
                            <div class="nevari-card-header">
                                <h2 style="<?php echo esc_attr($section_heading_style); ?>">Payment method <?php echo $this->get_ui_icon_markup(isset($checkout_design['review_badge_icon']) ? $checkout_design['review_badge_icon'] : 'info', isset($checkout_design['review_badge_icon_color']) ? $checkout_design['review_badge_icon_color'] : $checkout_design['title_color'], 18, 'nevari-review-badge__icon', isset($checkout_design['review_badge_icon_custom_url']) ? $checkout_design['review_badge_icon_custom_url'] : ''); ?></h2>
                                
                            </div>
                            <div class="nevari-payment-methods">
                                <?php echo $payment_methods_markup; ?>
                            </div>
                        </section>

                        <section class="nevari-card" style="background:<?php echo esc_attr($checkout_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($checkout_design['card_border_color']); ?>;border-radius:<?php echo esc_attr((int) $checkout_design['card_border_radius']); ?>px;">
                            <div class="nevari-card-header nevari-review-title">
                                <h2 style="<?php echo esc_attr($section_heading_style); ?>">Review Order <?php echo $this->get_ui_icon_markup(isset($checkout_design['review_badge_icon']) ? $checkout_design['review_badge_icon'] : 'info', isset($checkout_design['review_badge_icon_color']) ? $checkout_design['review_badge_icon_color'] : $checkout_design['title_color'], 18, 'nevari-review-badge__icon', isset($checkout_design['review_badge_icon_custom_url']) ? $checkout_design['review_badge_icon_custom_url'] : ''); ?></h2>
                            </div>

                            <div class="nevari-review-strip">
                                <div class="nevari-review-images" data-nevari-review-images>
                                    <?php foreach ($cart_images as $image) : ?>
                                        <a href="<?php echo esc_url($image['link']); ?>" class="nevari-review-image-link">
                                            <img src="<?php echo esc_url($image['url']); ?>" alt="<?php echo esc_attr($image['name']); ?>" loading="lazy">
                                        </a>
                                    <?php endforeach; ?>
                                </div>

                                <div class="nevari-review-more" data-nevari-more hidden>+0</div>
                                <button type="button" class="nevari-review-arrow" data-nevari-arrow hidden aria-label="Scroll order items">
                                    <img src="<?php echo esc_url(plugins_url('arrow-right.svg', __FILE__)); ?>" alt="" aria-hidden="true">
                                </button>
                            </div>
                        </section>
                    </div>

                    <aside class="nevari-summary" style="background:<?php echo esc_attr($checkout_design['summary_bg_color']); ?>;border:1px solid <?php echo esc_attr($checkout_design['summary_border_color']); ?>;border-radius:14px;color:<?php echo esc_attr($checkout_design['summary_text_color']); ?>;padding:18px;">
                        <h3>Order Summary</h3>

                        <div class="nevari-row">
                            <span>Delivery fee</span>
                            <strong><?php echo wp_kses_post(wc_price((float) WC()->cart->get_shipping_total())); ?></strong>
                        </div>

                        <div class="nevari-row">
                            <span>Service fee</span>
                            <strong><?php echo wp_kses_post(wc_price((float) WC()->cart->get_fee_total())); ?></strong>
                        </div>

                        <?php if ($selected_tip_amount > 0) : ?>
                            <div class="nevari-row">
                                <span><?php echo esc_html($tip_settings['title']); ?></span>
                                <strong><?php echo wp_kses_post(wc_price($selected_tip_amount)); ?></strong>
                            </div>
                        <?php endif; ?>

                        <div class="nevari-row">
                            <span>Items total</span>
                            <strong><?php echo wp_kses_post(WC()->cart->get_cart_subtotal()); ?></strong>
                        </div>

                        <hr>

                        <h3><?php echo esc_html($tip_settings['title']); ?></h3>
                        <p class="nevari-tip-note"><?php echo esc_html($tip_settings['note']); ?></p>

                        <input type="hidden" name="nevari_selected_tip" value="<?php echo esc_attr($selected_tip); ?>">
                        <input type="hidden" name="nevari_selected_tip_label" value="<?php echo esc_attr(WC()->session ? WC()->session->get('nevari_selected_tip_label') : ''); ?>">

                        <div class="nevari-tip-grid">
                            <?php foreach ($tip_options as $tip_option) :
                                $tip_value = $tip_option['value'];
                                $tip_label = $tip_option['label'];
                                $tip_icon = isset($tip_option['icon']) ? $tip_option['icon'] : '';
                                $is_selected_tip = (float) $tip_value === $selected_tip_amount;
                                ?>
                                <button
                                    type="button"
                                    class="nevari-tip <?php echo $is_selected_tip ? 'is-selected' : ''; ?>"
                                    data-tip="<?php echo esc_attr($tip_value); ?>"
                                    data-tip-label="<?php echo esc_attr($tip_label); ?>"
                                    data-tip-icon="<?php echo esc_attr($tip_icon); ?>"
                                    style="--nevari-tip-bg:<?php echo esc_attr($tip_settings['button_bg_color']); ?>;--nevari-tip-text:<?php echo esc_attr($tip_settings['button_text_color']); ?>;--nevari-tip-active-bg:<?php echo esc_attr($tip_settings['button_active_bg_color']); ?>;--nevari-tip-active-text:<?php echo esc_attr($tip_settings['button_active_text_color']); ?>;--nevari-tip-radius:<?php echo esc_attr((int) $tip_settings['button_border_radius']); ?>px;--nevari-tip-font-family:<?php echo esc_attr($tip_settings['button_font_family']); ?>;--nevari-tip-font-size:<?php echo esc_attr((int) $tip_settings['button_font_size']); ?>px;--nevari-tip-font-weight:<?php echo esc_attr((int) $tip_settings['button_font_weight']); ?>;--nevari-tip-icon-color:<?php echo esc_attr($tip_settings['button_icon_color']); ?>;"
                                >
                                    <?php if (!empty($tip_icon)) : ?>
                                        <?php echo $this->get_ui_icon_markup($tip_icon, $tip_settings['button_icon_color'], 14, 'nevari-tip__icon'); ?>
                                    <?php endif; ?>
                                    <?php echo esc_html($tip_label); ?>
                                </button>
                            <?php endforeach; ?>
                        </div>

                        <hr>

                        <div class="nevari-coupon">
                            <span>Coupon</span>
                            <a href="<?php echo esc_url(wc_get_cart_url()); ?>">＋ Add Coupon</a>
                        </div>

                        <div class="nevari-total" data-nevari-total data-base-total="<?php echo esc_attr(number_format((float) $base_total, 2, '.', '')); ?>">
                            <span>Total</span>
                            <strong data-nevari-total-amount><?php echo wp_kses_post(WC()->cart->get_total()); ?></strong>
                        </div>

                        <p class="nevari-legal">
                            By placing this order, you are agreeing to
                            <a href="<?php echo esc_url(wc_get_page_permalink('terms')); ?>">Terms and Conditions.</a>
                        </p>

                        <button type="submit" class="nevari-place-order" name="woocommerce_checkout_place_order" id="place_order" value="Place order">
                            Place Order
                        </button>
                    </aside>
                </div>
            </div>
        </form>

        <?php
        do_action('woocommerce_after_checkout_form', $checkout);

        return ob_get_clean();
    }

    private function get_payment_display($order) {
        $payment_title = $order->get_payment_method_title();
        $card_last4 = $order->get_meta('_card_last4');
        $txn_id = $order->get_transaction_id();
        
        if ($card_last4) {
            return $payment_title . ' ' . $card_last4;
        } elseif ($txn_id && strlen($txn_id) >= 4) {
            return $payment_title . ' ' . substr($txn_id, -4);
        }
        return $payment_title;
    }

    private function get_delivery_address($order) {
        $address = [];
        if ($order->get_billing_address_1()) $address[] = $order->get_billing_address_1();
        if ($order->get_billing_address_2()) $address[] = $order->get_billing_address_2();
        if ($order->get_billing_city()) $address[] = $order->get_billing_city();
        if ($order->get_billing_postcode()) $address[] = $order->get_billing_postcode();
        if ($order->get_billing_country()) {
            $country = WC()->countries->countries[$order->get_billing_country()];
            $address[] = $country;
        }
        return implode(', ', $address);
    }

    private function render_thankyou($order) {
        ob_start();

        $items = $order->get_items();
        $order_number = $order->get_id();
        $order_date = $order->get_date_created();
        $delivery_fee = $order->get_shipping_total() > 0 ? $order->get_shipping_total() : 0;
        $order_total = $order->get_total();
        $payment_display = $this->get_payment_display($order);
        $delivery_address = $this->get_delivery_address($order);
        $thankyou_design = $this->get_thankyou_design_options();
        $tip_amount = $this->parse_tip_amount($order->get_meta('_nevari_selected_tip'));
        $tip_label = $order->get_meta('_nevari_selected_tip_label');

        if ($tip_amount <= 0) {
            foreach ($order->get_items('fee') as $fee_item) {
                if (false !== stripos($fee_item->get_name(), 'tip')) {
                    $tip_amount += (float) $fee_item->get_total();
                    if (!$tip_label) {
                        $tip_label = $fee_item->get_name();
                    }
                }
            }
        }

        $items_per_page = 3;
        $total_items = count($items);
        $total_pages = ceil($total_items / $items_per_page);
        $current_page = isset($_GET['thankyou-page']) ? max(1, intval($_GET['thankyou-page'])) : 1;
        $offset = ($current_page - 1) * $items_per_page;
        $date_label = $order_date ? $order_date->date_i18n('M j, Y, g:i A') : '';
        $base_page_url = remove_query_arg('thankyou-page');
        $display_order_number = '#' . $order_number;
        $delivery_address_label = $delivery_address ? $delivery_address : __('Address unavailable', 'woocommerce');
        $page_title_style = sprintf(
            'color:%1$s;font-family:%2$s;font-size:%3$dpx;font-weight:%4$d;',
            esc_attr($thankyou_design['title_color']),
            esc_attr($thankyou_design['title_font_family']),
            (int) $thankyou_design['title_font_size'],
            (int) $thankyou_design['title_font_weight']
        );
        ?>

        <div class="nevari-thankyou" style="font-family:<?php echo esc_attr($thankyou_design['page_font_family']); ?>;">
            <div class="nevari-thankyou-header">
                <a href="<?php echo esc_url(wc_get_checkout_url()); ?>" class="nevari-back-link">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Back
                </a>
                <h1 class="nevari-title" style="<?php echo esc_attr($page_title_style); ?>">Order in Progress</h1>
                <?php if (!empty($thankyou_design['banner_enabled'])) : ?>
                    <section
                        class="nevari-info-panel nevari-info-panel--thankyou"
                        style="background:<?php echo esc_attr($thankyou_design['banner_bg_color']); ?>;color:<?php echo esc_attr($thankyou_design['banner_text_color']); ?>;"
                    >
                        <div class="nevari-info-panel__icon" style="color:<?php echo esc_attr($thankyou_design['banner_accent_color']); ?>;">
                            <?php echo $this->get_ui_icon_markup($thankyou_design['banner_icon'], $thankyou_design['banner_accent_color'], 24, 'nevari-info-panel__icon-markup'); ?>
                        </div>
                        <div class="nevari-info-panel__content" style="font-family:<?php echo esc_attr($thankyou_design['banner_font_family']); ?>;font-size:<?php echo esc_attr((int) $thankyou_design['banner_font_size']); ?>px;font-weight:<?php echo esc_attr((int) $thankyou_design['banner_font_weight']); ?>;">
                            <strong class="nevari-info-panel__title"><?php echo esc_html($thankyou_design['banner_title']); ?></strong>
                            <span class="nevari-info-panel__text"><?php echo esc_html($thankyou_design['banner_text']); ?></span>
                        </div>
                    </section>
                <?php endif; ?>
            </div>

            <div class="nevari-progress">
                <div class="nevari-progress-top">
                    <div class="nevari-step is-active">
                        <div class="nevari-step-circle">
                            <span class="nevari-confetti nevari-confetti-left" aria-hidden="true"></span>
                            <span class="nevari-confetti nevari-confetti-right" aria-hidden="true"></span>
                            <span class="nevari-step-circle-inner">
                                <svg class="nevari-step-check" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                    <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </span>
                        </div>
                        <p class="nevari-step-label">Order is Placed</p>
                    </div>
                    <div class="nevari-progress-bar-wrap" aria-hidden="true">
                        <div class="nevari-step-track">
                            <span class="nevari-step-track-fill"></span>
                        </div>
                    </div>
                    <div class="nevari-progress-bottom">
                        <div class="nevari-step-date-item is-active">
                            <span class="nevari-step-date-dot"></span>
                            <span class="nevari-step-date-text"><?php echo esc_html($date_label); ?></span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="nevari-layout">
                <div class="nevari-left">
                    <div class="nevari-items-panel">
                        <div class="nevari-items-header">
                            <h3>Items Name</h3>
                            <span class="nevari-items-count"><?php echo esc_html($total_items); ?> item<?php echo 1 === $total_items ? '' : 's'; ?></span>
                        </div>

                        <div class="nevari-items-list">
                        <?php
                        $item_count = 0;
                        foreach ($items as $item):
                            if ($item_count < $offset || $item_count >= $offset + $items_per_page) {
                                $item_count++;
                                continue;
                            }
                            $product = $item->get_product();
                            if (!$product) {
                                $item_count++;
                                continue;
                            }

                            $product_name = $item->get_name();
                            $image_id = $product->get_image_id();
                            $product_image = $image_id
                                ? wp_get_attachment_image_url($image_id, 'woocommerce_thumbnail')
                                : wc_placeholder_img_src('woocommerce_thumbnail');
                            $current_price = wc_price($item->get_total());
                            $original_price_raw = (float) $item->get_subtotal();
                            $quantity = $item->get_quantity();
                            $item_count++;
                        ?>
                            <div class="nevari-item">
                                <div class="nevari-item-main">
                                    <img src="<?php echo esc_url($product_image); ?>" alt="<?php echo esc_attr($product_name); ?>">
                                    <div class="nevari-item-details">
                                        <p class="nevari-item-name"><?php echo esc_html($product_name); ?></p>
                                        <div class="nevari-item-prices">
                                            <span class="nevari-item-price-current"><?php echo $current_price; ?></span>
                                            <?php if ($original_price_raw > (float) $item->get_total()) : ?>
                                                <span class="nevari-item-price-original"><?php echo wc_price($original_price_raw); ?></span>
                                            <?php endif; ?>
                                        </div>
                                    </div>
                                </div>
                                <strong class="nevari-item-quantity"><?php echo $quantity; ?></strong>
                            </div>
                        <?php endforeach; ?>
                        </div>

                        <?php if ($total_pages > 1): ?>
                            <div class="nevari-pagination">
                                <?php if ($current_page > 1) : ?>
                                    <a href="<?php echo esc_url(add_query_arg('thankyou-page', $current_page - 1, $base_page_url)); ?>" class="nevari-pagination-btn" aria-label="Previous page">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </a>
                                <?php else : ?>
                                    <span class="nevari-pagination-btn is-disabled" aria-hidden="true">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                            <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </span>
                                <?php endif; ?>

                                <?php for ($i = 1; $i <= $total_pages; $i++): ?>
                                    <a href="<?php echo esc_url(add_query_arg('thankyou-page', $i, $base_page_url)); ?>" class="nevari-pagination-page <?php echo $i === $current_page ? 'active' : ''; ?>">
                                        <?php echo $i; ?>
                                    </a>
                                <?php endfor; ?>

                                <?php if ($current_page < $total_pages) : ?>
                                    <a href="<?php echo esc_url(add_query_arg('thankyou-page', $current_page + 1, $base_page_url)); ?>" class="nevari-pagination-btn" aria-label="Next page">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </a>
                                <?php else : ?>
                                    <span class="nevari-pagination-btn is-disabled" aria-hidden="true">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                            <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                        </svg>
                                    </span>
                                <?php endif; ?>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>

                <aside class="nevari-summary" style="background:<?php echo esc_attr($thankyou_design['summary_bg_color']); ?>;border:1px solid <?php echo esc_attr($thankyou_design['summary_border_color']); ?>;border-radius:14px;color:<?php echo esc_attr($thankyou_design['summary_text_color']); ?>;padding:18px;">
                    <div class="nevari-card nevari-card-summary" style="background:<?php echo esc_attr($thankyou_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($thankyou_design['card_border_color']); ?>;">
                        <h3 class="nevari-card-title">Order Summary</h3>
                        <div class="nevari-card-content">
                            <div class="nevari-row nevari-row-order-number">
                                <span>Order Number</span>
                                <strong class="nevari-order-number"><?php echo esc_html($display_order_number); ?></strong>
                            </div>
                            <div class="nevari-row">
                                <span>Delivery Fees</span>
                                <span><?php echo wc_price($delivery_fee); ?></span>
                            </div>
                            <?php if ($tip_amount > 0) : ?>
                                <div class="nevari-row">
                                    <span><?php echo esc_html($tip_label ? $tip_label : __('Tip', 'woocommerce')); ?></span>
                                    <span><?php echo wc_price($tip_amount); ?></span>
                                </div>
                            <?php endif; ?>
                            <div class="nevari-row nevari-row-total">
                                <span>Total</span>
                                <strong><?php echo $order->get_formatted_order_total(); ?></strong>
                            </div>
                        </div>
                    </div>

                    <div class="nevari-card nevari-card-payment" style="background:<?php echo esc_attr($thankyou_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($thankyou_design['card_border_color']); ?>;">
                        <h3 class="nevari-card-title">Paid With</h3>
                        <div class="nevari-card-content">
                            <div class="nevari-payment-info">
                                <div class="nevari-card-icon nevari-card-icon-payment" aria-hidden="true">
                                    <span class="nevari-card-chip"></span>
                                    <span class="nevari-card-band"></span>
                                </div>
                                <span class="nevari-payment-text"><?php echo esc_html($payment_display); ?></span>
                            </div>
                        </div>
                    </div>

                    <div class="nevari-card nevari-card-address" style="background:<?php echo esc_attr($thankyou_design['card_bg_color']); ?>;border-color:<?php echo esc_attr($thankyou_design['card_border_color']); ?>;">
                        <h3 class="nevari-card-title">Delivery Address</h3>
                        <div class="nevari-card-content">
                            <div class="nevari-address-info">
                                <div class="nevari-card-icon nevari-card-icon-location" aria-hidden="true">
                                    <svg width="15" height="19" viewBox="0 0 24 24" fill="none">
                                        <path d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z" fill="currentColor"/>
                                        <circle cx="12" cy="9" r="2.8" fill="#ffffff"/>
                                    </svg>
                                </div>
                                <span class="nevari-address-text"><?php echo esc_html($delivery_address_label); ?></span>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>

        <?php
        return ob_get_clean();
    }

    private function css() {
        return <<<CSS

/* =========================
   NOTICE TOASTS
========================= */

.woocommerce-notices-wrapper {
    position: fixed;
    top: 24px;
    right: 24px;
    left: auto;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
    width: min(420px, calc(100vw - 32px));
    pointer-events: none;
}

.woocommerce-notices-wrapper:empty {
    display: none;
}

.woocommerce-notices-wrapper .woocommerce-message,
.woocommerce-notices-wrapper .woocommerce-error,
.woocommerce-notices-wrapper .woocommerce-info {
    position: relative;
    width: 100%;
    margin: 0;
    padding: 16px 18px 16px 52px;
    border: 0;
    border-radius: 18px;
    background: rgba(18, 47, 75, 0.96);
    color: #ffffff;
    box-shadow: 0 18px 40px rgba(7, 20, 33, 0.18);
    backdrop-filter: blur(14px);
    pointer-events: auto;
    opacity: 0;
    transform: translate3d(0, -12px, 0) scale(0.98);
    animation: nevari-toast-in 0.28s ease-out forwards;
}

.woocommerce-notices-wrapper .woocommerce-message {
    background: linear-gradient(135deg, rgba(16, 119, 67, 0.96), rgba(11, 87, 53, 0.96));
}

.woocommerce-notices-wrapper .woocommerce-error {
    background: linear-gradient(135deg, rgba(187, 45, 59, 0.96), rgba(132, 22, 35, 0.96));
}

.woocommerce-notices-wrapper .woocommerce-info {
    background: linear-gradient(135deg, rgba(24, 67, 99, 0.96), rgba(21, 95, 147, 0.96));
}

.woocommerce-notices-wrapper .woocommerce-message::before,
.woocommerce-notices-wrapper .woocommerce-error::before,
.woocommerce-notices-wrapper .woocommerce-info::before {
    position: absolute;
    top: 50%;
    left: 18px;
    width: 24px;
    height: 24px;
    margin: 0;
    border-radius: 999px;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
}

.woocommerce-notices-wrapper .woocommerce-message::before {
    content: "✓";
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
}

.woocommerce-notices-wrapper .woocommerce-error::before {
    content: "!";
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
}

.woocommerce-notices-wrapper .woocommerce-info::before {
    content: "i";
    background: rgba(255, 255, 255, 0.18);
    color: #ffffff;
}

.woocommerce-notices-wrapper .woocommerce-message::after,
.woocommerce-notices-wrapper .woocommerce-error::after,
.woocommerce-notices-wrapper .woocommerce-info::after {
    display: none;
}

.woocommerce-notices-wrapper .woocommerce-message a,
.woocommerce-notices-wrapper .woocommerce-error a,
.woocommerce-notices-wrapper .woocommerce-info a {
    color: inherit;
}

.woocommerce-notices-wrapper .woocommerce-message[data-nevari-toast-state="closing"],
.woocommerce-notices-wrapper .woocommerce-error[data-nevari-toast-state="closing"],
.woocommerce-notices-wrapper .woocommerce-info[data-nevari-toast-state="closing"] {
    animation: nevari-toast-out 0.24s ease-in forwards;
}

@keyframes nevari-toast-in {
    from {
        opacity: 0;
        transform: translate3d(0, -12px, 0) scale(0.98);
    }
    to {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
    }
}

@keyframes nevari-toast-out {
    from {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
    }
    to {
        opacity: 0;
        transform: translate3d(0, -10px, 0) scale(0.98);
    }
}

@media (max-width: 767px) {
    .woocommerce-notices-wrapper {
        top: 12px;
        right: 12px;
        width: calc(100vw - 24px);
    }

    .woocommerce-notices-wrapper .woocommerce-message,
    .woocommerce-notices-wrapper .woocommerce-error,
    .woocommerce-notices-wrapper .woocommerce-info {
        padding: 14px 16px 14px 48px;
        border-radius: 16px;
    }

    .woocommerce-notices-wrapper .woocommerce-message::before,
    .woocommerce-notices-wrapper .woocommerce-error::before,
    .woocommerce-notices-wrapper .woocommerce-info::before {
        left: 16px;
        width: 22px;
        height: 22px;
    }
}

/* =========================
   THANK YOU PAGE STYLES
========================= */

.nevari-thankyou,
.nevari-thankyou * {
    box-sizing: border-box;
    font-family: "Product Sans", "Google Sans", Arial, sans-serif;
}

.nevari-thankyou {
    width: 100%;
    max-width: 1278px;
    margin: 0 auto;
    padding: 0 0 48px;
    color: #122f4b;
    background: #ffffff;
}

.nevari-thankyou-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 54px;
}

.nevari-thankyou .nevari-back-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #979797;
    font-size: 16px;
    font-weight: 400;
    text-decoration: none;
}

.nevari-thankyou .nevari-back-link:hover {
    color: #234c72;
}

.nevari-thankyou .nevari-title {
    margin: 0;
    color: #184363;
    font-size: clamp(32px, 4vw, 36px);
    line-height: 32px;
    font-weight: 400;
}

.nevari-thankyou .nevari-progress {
    width: 100%;
    max-width: 684px;
    margin-bottom: 72px;
}

.nevari-progress-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    width: 100%;
}

.nevari-progress-bottom {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    margin-top: 16px;
}

.nevari-thankyou .nevari-step {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 16px;
    width: 100%;
    max-width: 240px;
}

.nevari-thankyou .nevari-step-circle {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    background: #ffffff;
    border: 1px solid #f0eef0;
    color: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0;
    font-weight: 500;
}

.nevari-thankyou .nevari-step.is-active .nevari-step-circle {
    width: 84px;
    height: 84px;
    background: #caf5ca;
    border: 0;
    color: #10b74f;
    position: relative;
    overflow: visible;
}

.nevari-step-circle-inner {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    background: #00ba00;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: nevari-check-pulse 2s ease-in-out infinite;
}

.nevari-confetti {
    position: absolute;
    top: 50%;
    width: 34px;
    height: 34px;
    transform: translateY(-50%);
    pointer-events: none;
}

.nevari-confetti::before,
.nevari-confetti::after {
    content: "";
    position: absolute;
    inset: 0;
    background-repeat: no-repeat;
}

.nevari-confetti-left {
    left: -20px;
    animation: nevari-confetti-left 1.8s ease-out infinite;
}

.nevari-confetti-left::before {
    background-image:
        radial-gradient(circle at 8px 8px, #ff7a00 0 3px, transparent 3.5px),
        radial-gradient(circle at 16px 18px, #15a9e3 0 2.5px, transparent 3px),
        linear-gradient(135deg, #ffd54a 0 100%);
    background-size: 8px 8px, 6px 6px, 3px 10px;
    background-position: 2px 4px, 14px 16px, 24px 6px;
    transform: rotate(-18deg);
}

.nevari-confetti-left::after {
    background-image:
        linear-gradient(135deg, #9b5cff 0 100%),
        radial-gradient(circle at 6px 6px, #00ba00 0 2.5px, transparent 3px);
    background-size: 4px 12px, 6px 6px;
    background-position: 10px 3px, 22px 24px;
    transform: rotate(24deg);
}

.nevari-confetti-right {
    right: -20px;
    animation: nevari-confetti-right 1.8s ease-out infinite;
}

.nevari-confetti-right::before {
    background-image:
        radial-gradient(circle at 8px 10px, #15a9e3 0 3px, transparent 3.5px),
        radial-gradient(circle at 18px 20px, #ff4d6d 0 2.5px, transparent 3px),
        linear-gradient(135deg, #ffd54a 0 100%);
    background-size: 8px 8px, 6px 6px, 3px 10px;
    background-position: 20px 4px, 8px 18px, 6px 8px;
    transform: rotate(18deg);
}

.nevari-confetti-right::after {
    background-image:
        linear-gradient(135deg, #00ba00 0 100%),
        radial-gradient(circle at 6px 6px, #ff7a00 0 2.5px, transparent 3px);
    background-size: 4px 12px, 6px 6px;
    background-position: 18px 6px, 4px 24px;
    transform: rotate(-24deg);
}

.nevari-thankyou .nevari-step-label {
    margin: 0;
    color: #000000;
    font-size: 20px;
    line-height: 24px;
    font-weight: 400;
}

.nevari-step-check {
    animation: nevari-check-pop 0.8s ease-out both;
    transform-origin: center;
}

.nevari-progress-bar-wrap {
    width: 100%;
}

.nevari-step-track {
    height: 8px;
    width: 100%;
    border-radius: 12px;
    background: #f8f7f8;
    overflow: hidden;
}

.nevari-step-track-fill {
    display: block;
    width: 33.333%;
    height: 100%;
    border-radius: 12px;
    background: #15a9e3;
    animation: nevari-track-fill 1s ease-out both;
}

.nevari-step-date-item {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #807681;
    font-size: 14px;
    font-family: Inter, Arial, sans-serif;
    line-height: 21px;
}

.nevari-step-date-item.is-active {
    color: #807681;
}

.nevari-step-date-dot {
    width: 16px;
    height: 16px;
    border-radius: 999px;
    border: 1px solid #f0eef0;
    flex-shrink: 0;
    position: relative;
}

.nevari-step-date-item.is-active .nevari-step-date-dot {
    border-color: #15a9e3;
    background: #15a9e3;
}

.nevari-step-date-item.is-active .nevari-step-date-dot::after {
    content: "";
    position: absolute;
    left: 4px;
    top: 3px;
    width: 6px;
    height: 3px;
    border-left: 2px solid #ffffff;
    border-bottom: 2px solid #ffffff;
    transform: rotate(-45deg);
}

.nevari-thankyou .nevari-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 416px;
    gap: 62px;
    align-items: start;
}

.nevari-thankyou .nevari-left {
    min-width: 0;
}

.nevari-thankyou .nevari-items-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    padding: 0 0 8px;
}

.nevari-thankyou .nevari-items-header h3,
.nevari-thankyou .nevari-items-count {
    margin: 0;
    color: #0d0c0d;
    font-size: 16px;
    line-height: 27.2px;
    font-weight: 700;
}

.nevari-thankyou .nevari-items-count {
    color: #0d0c0d;
    font-size: 14px;
    font-family: Inter, Arial, sans-serif;
    line-height: 23.8px;
    font-weight: 500;
    text-align: right;
}

.nevari-items-panel {
    border: 1px solid #f8f7f8;
    border-radius: 32px;
    background: #ffffff;
    overflow: hidden;
    padding: 24px 24px 28px;
}

.nevari-thankyou .nevari-items-list {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.nevari-thankyou .nevari-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 24px;
    padding: 16px 0;
    border-bottom: 1px solid #eaeaea;
    background: #ffffff;
}

.nevari-thankyou .nevari-item-main {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
}

.nevari-thankyou .nevari-item img {
    width: 64px;
    height: 64px;
    object-fit: cover;
    border-radius: 12.19px;
    display: block;
    flex-shrink: 0;
}

.nevari-thankyou .nevari-item-details {
    min-width: 0;
}

.nevari-thankyou .nevari-item-name {
    margin: 0 0 8px;
    color: #0d0c0d;
    font-size: 16px;
    line-height: 20px;
    font-weight: 400;
}

.nevari-thankyou .nevari-item-prices {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.nevari-thankyou .nevari-item-price-current {
    color: #f2971f;
    font-size: 14px;
    line-height: 20px;
    font-weight: 400;
}

.nevari-thankyou .nevari-item-price-original {
    color: #9c939d;
    font-size: 14px;
    line-height: 20px;
    text-decoration: line-through;
}

.nevari-thankyou .nevari-item-quantity {
    min-width: 41px;
    padding: 8px;
    border-radius: 21.33px;
    background: #f7f7f8;
    color: #0d0c0d;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 14.22px;
    font-family: Inter, Arial, sans-serif;
    line-height: 19.2px;
    font-weight: 500;
}

.nevari-thankyou .nevari-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 24px;
    padding-top: 24px;
}

.nevari-thankyou .nevari-pagination-btn,
.nevari-thankyou .nevari-pagination-page {
    width: 40px;
    height: 40px;
    border-radius: 26.67px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    text-decoration: none;
    transition: 0.2s ease;
}

.nevari-thankyou .nevari-pagination-btn {
    color: #2b3743;
    border: 1px solid #f8f7f8;
    background: #ffffff;
}

.nevari-thankyou .nevari-pagination-btn:hover {
    color: #2ba6e8;
}

.nevari-thankyou .nevari-pagination-btn.is-disabled {
    color: #c9d0d8;
}

.nevari-thankyou .nevari-pagination-page {
    border: 1px solid #f8f7f8;
    color: #3e3b3f;
    font-size: 14px;
    font-family: Inter, Arial, sans-serif;
    font-weight: 500;
}

.nevari-thankyou .nevari-pagination-page.active,
.nevari-thankyou .nevari-pagination-page:hover {
    border-color: #15a9e3;
    color: #0d0c0d;
    background: #faf8f9;
}

.nevari-thankyou .nevari-summary {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.nevari-thankyou .nevari-card {
    background: #ffffff;
    border: 1px solid #e9e9e9;
    border-radius: 16px;
    padding: 24px;
    box-shadow: none;
}

.nevari-thankyou .nevari-card-summary {
    min-height: 264px;
}

.nevari-thankyou .nevari-card-payment,
.nevari-thankyou .nevari-card-address {
    min-height: 106px;
}

.nevari-thankyou .nevari-card-title {
    margin: 0 0 8px;
    color: #0d0c0d;
    font-size: 16px;
    line-height: 22px;
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
}

.nevari-thankyou .nevari-card-content {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.nevari-thankyou .nevari-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 14px 0;
    color: #0d0c0d;
    font-size: 14px;
    line-height: 20px;
    font-weight: 400;
}

.nevari-thankyou .nevari-row span:last-child,
.nevari-thankyou .nevari-row strong {
    color: #1e2732;
}

.nevari-thankyou .nevari-row-order-number {
    padding-top: 0;
    justify-content: flex-start;
    gap: 8px;
}

.nevari-thankyou .nevari-row-order-number .nevari-order-number {
    color: #15a9e3;
    font-size: 12px;
    line-height: 16px;
    font-weight: 400;
}

.nevari-thankyou .nevari-row + .nevari-row {
    border-top: 1px solid #f8f7f8;
}

.nevari-thankyou .nevari-row-total {
    margin-top: auto;
    padding-top: 20px;
    font-size: 16px;
    font-weight: 600;
    font-family: Inter, Arial, sans-serif;
}

.nevari-thankyou .nevari-row-total span,
.nevari-thankyou .nevari-row-total strong {
    color: #0d0c0d;
}

.nevari-thankyou .nevari-payment-info,
.nevari-thankyou .nevari-address-info {
    display: flex;
    align-items: center;
    gap: 10px;
}

.nevari-thankyou .nevari-card-icon {
    width: 25px;
    height: 20px;
    flex-shrink: 0;
    position: relative;
    color: #2ba6e8;
}

.nevari-card-icon-payment {
    width: 25px;
    height: 20px;
    border-radius: 3.75px;
    background: #100f11;
    overflow: hidden;
    border: 1px solid #efe4ed;
}

.nevari-card-chip {
    position: absolute;
    display: none;
}

.nevari-card-band {
    position: absolute;
    left: 6px;
    top: 6px;
    width: 7.5px;
    height: 7.5px;
    border-radius: 999px;
    background: #f9a000;
    box-shadow: -4px 0 0 #ee0005;
}

.nevari-card-band::after {
    content: "";
    position: absolute;
    left: -0.5px;
    top: 0;
    width: 2.84px;
    height: 5.88px;
    margin-top: 0.8px;
    background: #ff6300;
}

.nevari-thankyou .nevari-payment-text,
.nevari-thankyou .nevari-address-text {
    color: #15a9e3;
    font-size: 15px;
    font-family: Inter, Arial, sans-serif;
    line-height: 22.5px;
    font-weight: 500;
}

@keyframes nevari-check-pulse {
    0%,
    100% {
        transform: scale(1);
        box-shadow: 0 0 0 0 rgba(0, 186, 0, 0.18);
    }
    50% {
        transform: scale(1.06);
        box-shadow: 0 0 0 10px rgba(0, 186, 0, 0);
    }
}

@keyframes nevari-check-pop {
    0% {
        opacity: 0;
        transform: scale(0.65);
    }
    70% {
        opacity: 1;
        transform: scale(1.08);
    }
    100% {
        opacity: 1;
        transform: scale(1);
    }
}

@keyframes nevari-track-fill {
    0% {
        width: 0;
    }
    100% {
        width: 33.333%;
    }
}

@keyframes nevari-confetti-left {
    0%,
    100% {
        opacity: 0;
        transform: translateY(-50%) translateX(0) scale(0.8) rotate(-8deg);
    }
    20% {
        opacity: 1;
    }
    50% {
        opacity: 1;
        transform: translateY(-62%) translateX(-10px) scale(1) rotate(-18deg);
    }
    80% {
        opacity: 0;
        transform: translateY(-38%) translateX(-14px) scale(0.9) rotate(-28deg);
    }
}

@keyframes nevari-confetti-right {
    0%,
    100% {
        opacity: 0;
        transform: translateY(-50%) translateX(0) scale(0.8) rotate(8deg);
    }
    20% {
        opacity: 1;
    }
    50% {
        opacity: 1;
        transform: translateY(-64%) translateX(10px) scale(1) rotate(18deg);
    }
    80% {
        opacity: 0;
        transform: translateY(-36%) translateX(14px) scale(0.9) rotate(28deg);
    }
}

@media (max-width: 1200px) {
    .nevari-thankyou .nevari-layout {
        grid-template-columns: 1fr;
        gap: 24px;
    }

    .nevari-thankyou .nevari-progress {
        max-width: none;
    }

    .nevari-thankyou .nevari-summary {
        width: 100%;
    }

    .nevari-thankyou .nevari-card {
        width: 100%;
    }
}

@media (max-width: 680px) {
    .nevari-thankyou {
        padding: 0 0 36px;
    }

    .nevari-thankyou-header {
        gap: 16px;
        margin-bottom: 32px;
    }

    .nevari-progress-bottom,
    .nevari-progress-bar-wrap {
        gap: 12px;
    }

    .nevari-progress-bottom {
        justify-content: center;
    }

    .nevari-thankyou .nevari-item {
        grid-template-columns: 1fr;
        gap: 12px;
    }

    .nevari-thankyou .nevari-item-quantity {
        justify-self: start;
    }

    .nevari-items-panel {
        padding: 18px 16px 22px;
    }
}

.nevari-cart-page,
.nevari-cart-page * {
    box-sizing: border-box;
    font-family: "Product Sans", "Google Sans", Arial, sans-serif;
}

.nevari-cart-page {
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 0 0 40px;
    color: #0d0c0d;
}

.nevari-cart-header {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 24px;
    margin-bottom: 44px;
}

.nevari-cart-back {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #979797;
    text-decoration: none;
    font-size: 16px;
    font-weight: 400;
}

.nevari-cart-back:hover {
    color: #184363;
}

.nevari-cart-title {
    margin: 0;
    color: #184363;
    font-size: 36px;
    font-weight: 400;
    line-height: 32px;
}

.nevari-cart-layout {
    display: grid;
    grid-template-columns: minmax(0, 800px) 384px;
    gap: 56px;
    align-items: start;
}

.nevari-cart-form {
    width: 100%;
    display: flex;
    flex-direction: column;
}

.nevari-cart-item {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 24px;
    width: 100%;
    padding: 16px 0;
    border-bottom: 1px solid #eaeaea;
}

.nevari-cart-item-main {
    display: flex;
    align-items: center;
    gap: 18px;
    min-width: 0;
}

.nevari-cart-item-image {
    width: 64px;
    height: 64px;
    border-radius: 12.19px;
    overflow: hidden;
    flex-shrink: 0;
    display: inline-flex;
}

.nevari-cart-item-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.nevari-cart-item-details {
    min-width: 0;
}

.nevari-cart-item-name {
    margin: 0 0 8px;
    color: #0d0c0d;
    font-size: 17px;
    font-weight: 400;
    line-height: 20px;
}

.nevari-cart-item-prices {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.nevari-cart-item-price-current {
    color: #f2971f;
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
}

.nevari-cart-item-price-original {
    color: #9c939d;
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
    text-decoration: line-through;
}

.nevari-cart-item-actions {
    display: flex;
    rid-template-rows: 1fr;
    align-items: center;
    gap: 16px;
}

.nevari-cart-qty-control {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 93.44px;
    min-width: 93.44px;
    min-height: 34px;
    padding: 0;
    border-radius: 999px;
    flex: 0 0 auto;
    position: relative;
}

.nevari-cart-qty-control.is-updating {
    opacity: 0.72;
    pointer-events: none;
}

.nevari-cart-qty-main {
    display: flex !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 0 !important;
    width: 93.44px !important;
    min-width: 93.44px !important;
    padding: 2px !important;
    min-height: 34px !important;
    background: #f8f7f8 !important;
    border: 0 !important;
    border-radius: 999px !important;
    overflow: visible !important;
}

.nevari-cart-qty-btn {
    width: 32px !important;
    height: 32px !important;
    min-width: 32px;
    min-height: 32px;
    padding: 0;
    border-radius: 50% !important;
    border: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.15s ease, opacity 0.15s ease, background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}

.nevari-cart-qty-btn:hover {
    opacity: 1;
}

.nevari-cart-qty-btn:active {
    transform: scale(0.96);
}

.nevari-cart-qty-btn:disabled,
.nevari-cart-qty-btn[disabled] {
    cursor: not-allowed !important;
    opacity: 0.55 !important;
    box-shadow: none !important;
}

.nevari-cart-qty-btn.is-light {
    background: #ffffff;
    color: #313131;
    padding: 0px !important;

    border: 1px solid #f1ece8;
    
}

.nevari-cart-qty-btn.is-dark {
    background: #0A2A5E;
    padding: 0px !important;
    color: #ffffff;
    border: 0;
   
}

.nevari-cart-qty-btn.is-light:hover:not(:disabled) {
    background: #0A2A5E !important;
    color: #ffffff !important;
    border-color: #0A2A5E !important;
}

.nevari-cart-qty-btn.is-dark:hover:not(:disabled) {
    background: #ffffff !important;
    color: #0A2A5E !important;
    border: 1px solid #0A2A5E !important;
}

.nevari-cart-minus,
.nevari-cart-plus {
    position: relative;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 16px !important;
    height: 16px !important;
    margin: 0 auto !important;
    line-height: 1 !important;
}

.nevari-cart-minus::before,
.nevari-cart-plus::before,
.nevari-cart-plus::after {
    content: "" !important;
    position: absolute !important;
    top: 50% !important;
    left: 50% !important;
    display: block !important;
    background: currentColor !important;
    transform: translate(-50%, -50%) !important;
    border-radius: 999px !important;
    margin: 0 !important;
    font-size: 0 !important;
    line-height: 0 !important;
}

.nevari-cart-minus::before,
.nevari-cart-plus::before {
    width: 10px !important;
    height: 1.8px !important;
}

.nevari-cart-plus::after {
    width: 1.8px !important;
    height: 10px !important;
}

.nevari-cart-qty-input {
    display: block !important;
    flex: 1 1 auto !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: 21px !important;
    border: 0 !important;
    padding: 0 !important;
    background: transparent !important;
    color: #2f2f2f !important;
    text-align: center !important;
    font-size: 15px !important;
    font-family: Inter, Arial, sans-serif !important;
    font-weight: 600 !important;
    line-height: 1 !important;
    -moz-appearance: textfield !important;
    appearance: textfield !important;
    outline: none !important;
    opacity: 1 !important;
    visibility: visible !important;
    margin: 0 3px !important;
    overflow: visible !important;
}

.nevari-cart-qty-input::-webkit-outer-spin-button,
.nevari-cart-qty-input::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.nevari-cart-qty-loader {
    display: none;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    align-self: center;
    margin-left: 10px;
    border-radius: 50%;
    border: 2px solid rgba(10, 42, 94, 0.18);
    border-top-color: #0A2A5E;
    box-sizing: border-box;
    animation: nevari-spin 0.75s linear infinite;
}

.nevari-cart-qty-control.is-updating + .nevari-cart-qty-loader,
.nevari-cart-qty-control.is-updating .nevari-cart-qty-loader {
    display: inline-block;
}

.nevari-cart-remove {
    appearance: none;
    border: 0;
    background: transparent;
    color: #15a9e3;
    padding: 0;
    text-decoration: none;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.15s ease;
}

.nevari-cart-remove:hover {
    color: #0A2A5E;
    text-decoration: underline;
}

.nevari-cart-remove:focus-visible {
    outline: 2px solid #15a9e3;
    outline-offset: 2px;
}

@keyframes nevari-spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.nevari-cart-summary-card {
    display: flex;
    flex-direction: column;
    gap: 24px;
    padding: 32px 20px;
    border-radius: 32px;
    background: #ffffff;
}

.nevari-cart-progress {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.nevari-cart-progress-track {
    width: 100%;
    height: 6px;
    border-radius: 12px;
    background: #faf8f9;
    overflow: hidden;
}

.nevari-cart-progress-fill {
    display: block;
    height: 100%;
    border-radius: 24px;
    background: #15a9e3;
}

.nevari-cart-progress-text {
    margin: 0;
    color: #0d0c0d;
    text-align: center;
    font-size: 14px;
    font-weight: 400;
    line-height: 20px;
}

.nevari-cart-summary-block {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.nevari-cart-summary-title {
    margin: 0;
    color: #0d0c0d;
    font-size: 20px;
    font-weight: 400;
    line-height: 24px;
    letter-spacing: 0.1px;
}

.nevari-cart-summary-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.nevari-cart-summary-row,
.nevari-cart-summary-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
}

.nevari-cart-summary-row {
    color: #3e3b3f;
    font-size: 16px;
    font-weight: 400;
    line-height: 22px;
    letter-spacing: 0.1px;
}

.nevari-cart-summary-divider {
    width: 100%;
    height: 1px;
    background: #f0eef0;
}

.nevari-cart-summary-total {
    color: #0d0c0d;
    font-size: 16px;
    font-family: Inter, Arial, sans-serif;
    line-height: 27.2px;
}

.nevari-cart-summary-total span:first-child {
    font-weight: 600;
}

.nevari-cart-summary-total span:last-child {
    color: #3e3b3f;
    font-weight: 400;
}

.nevari-cart-checkout {
    appearance: none !important;
    -webkit-appearance: none !important;
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    gap: 16px !important;
    width: 100% !important;
    min-height: 48px !important;
    padding: 14px 18px 14px 20px !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: #0A2A5E !important;
    color: #ffffff !important;
    text-decoration: none !important;
    cursor: pointer !important;
    box-shadow: none !important;
    font: inherit !important;
    line-height: 1 !important;
    text-align: left !important;
}

.nevari-cart-checkout-main {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: flex-start !important;
    flex: 0 1 auto !important;
    gap: 10px !important;
    color: inherit !important;
    font-size: 16px !important;
    font-weight: 500 !important;
    line-height: 20px !important;
    text-align: left !important;
}

.nevari-cart-checkout-main img {
    width: 22px !important;
    height: 22px !important;
    flex-shrink: 0 !important;
    display: block !important;
}

.nevari-cart-checkout-total {
    display: inline-block !important;
    flex: 0 0 auto !important;
    margin-left: auto !important;
    color: inherit !important;
    text-align: right !important;
    font-size: 16px !important;
    font-weight: 500 !important;
    line-height: 20px !important;
}

.nevari-cart-checkout:hover {
    background: #0A2A5E !important;
    color: #ffffff !important;
}

.nevari-cart-checkout:focus-visible {
    outline: 2px solid #0A2A5E !important;
    outline-offset: 2px !important;
}

.nevari-cart-update-trigger {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
}

.nevari-cart-empty {
    padding: 32px 0;
}

.nevari-cart-empty-link {
    color: #15a9e3;
    text-decoration: none;
}

@media (max-width: 1200px) {
    .nevari-cart-layout {
        grid-template-columns: 1fr;
        gap: 32px;
    }
}

@media (max-width: 760px) {
    .nevari-cart-page {
        padding-bottom: 28px;
    }

    .nevari-cart-item {
        grid-template-rows: 1fr;
        gap: 16px;
    }

    .nevari-cart-item-actions {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: flex-start;
        gap: 8px;
        width: auto;
    }

    .nevari-cart-qty-main {
        gap: 0 !important;
        padding: 2px !important;
    }

    .nevari-cart-qty-btn.is-light {
        width: 32px !important;
        height: 32px !important;
    }

    .nevari-cart-qty-btn.is-dark {
        width: 32px !important;
        height: 32px !important;
    }

    .nevari-cart-qty-input {
        max-width: 21px !important;
        margin: 0 3px !important;
    }

    .nevari-cart-qty-input {
        width: 20px;
        min-width: 20px;
        font-size: 15px;
    }

    .nevari-cart-remove {
        font-size: 13px;
    }
}

.nevari-checkout-page,
.nevari-checkout-page *,
.nevari-checkout-form,
.nevari-checkout-form * {
    font-family: "Product Sans", "Google Sans", Arial, sans-serif !important;
    box-sizing: border-box;
}

body.woocommerce-checkout {
    background: #ffffff;
}

.nevari-checkout-page {
    width: 100%;
    max-width: 1160px;
    margin: 0 auto;
    padding: 18px 24px 40px;
    color: #111111;
}

.nevari-back {
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    color: #999999 !important;
    font-size: 13px !important;
    text-decoration: none !important;
    line-height: 1 !important;
    padding-bottom: 24px !important;
}

.nevari-back svg,
.nevari-back-icon {
    display: inline-block !important;
    width: 16px !important;
    height: 16px !important;
    min-width: 16px !important;
    color: #999999 !important;
    stroke: currentColor !important;
    fill: none !important;
}

.nevari-back-icon path {
    stroke-width: 2px;
}

.nevari-back:hover {
    color: #184363 !important;
}

.nevari-back:hover svg,
.nevari-back:hover .nevari-back-icon {
    color: #184363 !important;
}

.nevari-title {
    margin: 0 0 40px;
    color: #123b5c;
    font-size: clamp(36px, 4vw, 40px);
    line-height: 1.1;
    font-weight: 500;
}

.nevari-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 330px;
    gap: 42px;
    align-items: start;
}

.nevari-left {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
}

.nevari-card {
    width: 100%;
    background: #ffffff;
    border: 1px solid #eeeeee;
    border-radius: 14px;
    padding: 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.nevari-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 18px;
}

.nevari-card-header h2 {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 20px;
    font-weight: 600;
}

.nevari-card-header h2 span {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 13px;
    height: 13px;
    border: 1.4px solid #111111;
    border-radius: 50%;
    font-size: 9px;
    line-height: 1;
    font-weight: 600;
}

.nevari-card-header b {
    font-size: 28px;
    line-height: 1;
    color: #111111;
    font-weight: 300;
}

.nevari-card label {
    display: block;
    margin-bottom: 8px;
    color: #979797;
    font-size: 14px !important;
    font-weight: 400 !important;
}

.nevari-card input {
    width: 100%;
    max-width: 100%;
    height: 44px;
    border: 0 !important;
    border-radius: 12px !important;
    background: #f7f5fb;
    padding: 0 14px;
    font-size: 14px;
    color: #031b39;
}

.nevari-card input::placeholder {
    color: #BEBEBE !important;
}

.nevari-payment-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.nevari-payment-methods #payment {
    background: transparent;
}

.nevari-payment-methods .wc_payment_methods {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.nevari-payment-methods .wc_payment_method {
    margin: 0;
    padding: 14px 16px;
    border: 1px solid #e6e8ef;
    border-radius: 18px;
    background: #fafbfd;
}

.nevari-payment-methods .wc_payment_method > label {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: #123b5c;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
}

.nevari-payment-methods .wc_payment_method > input[type="radio"] {
    margin: 0;
}

.nevari-payment-methods .payment_box {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #e6e8ef;
    color: #5f6b7a;
    font-size: 13px;
}

.nevari-payment-empty {
    margin: 0;
    color: #5f6b7a;
    font-size: 14px;
}

.nevari-review-strip {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: #f7f5fb;
    border-radius: 18px;
    padding: 8px;
    overflow: hidden;
}

.nevari-review-images {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
}

.nevari-review-images::-webkit-scrollbar {
    display: none;
}

.nevari-review-image-link {
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
    border-radius: 9px;
    overflow: hidden;
    display: block;
    background: #eeeeee;
}

.nevari-review-image-link img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    border-radius: 9px;
}

.nevari-review-more {
    flex: 0 0 auto;
    width: 64px;
    height: 64px;
    border-radius: 9px;
    background: #ffffff;
    color: #6b6673;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    justify-content: center;
    align-items: center;
}

.nevari-review-more[hidden],
.nevari-review-arrow[hidden] {
    display: none;
}

.nevari-review-arrow {
    appearance: none !important;
    flex: 0 0 auto;
    border: 0 !important;
    background: transparent !important;
    width: 30px;
    height: 40px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 !important;
    box-shadow: none !important;
}

.nevari-review-arrow:hover {
    background: transparent !important;
}

.nevari-review-arrow img {
    display: block;
    width: 18px;
    height: 18px;
}

.nevari-review-arrow:disabled {
    cursor: default;
    opacity: 0.4;
}

.nevari-summary {
    width: 100%;
    min-width: 0;
    padding-top: 6px;
}

.nevari-info-panel {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin: 0 0 24px;
    padding: 16px 18px;
    border-radius: 16px;
}

.nevari-info-panel__icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
}

.nevari-info-panel__icon .nevari-ui-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.nevari-ui-icon svg {
    display: block;
    width: 100%;
    height: 100%;
}

.nevari-info-panel__content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.nevari-info-panel__title {
    font-size: 15px;
    line-height: 1.3;
}

.nevari-info-panel__text {
    font-size: 13px;
    line-height: 1.5;
    opacity: 0.9;
}

.nevari-summary h3 {
    margin: 0 0 16px;
    font-size: 14px;
    font-weight: 500;
}

.nevari-summary .nevari-row {
    color: inherit;
}

.nevari-summary .nevari-row strong {
    color: inherit;
}

.nevari-summary-totals {
    display: flex;
    flex-direction: column;

}

.nevari-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 10px;
    color: #777777;
    font-size: 13px;
}

.nevari-row strong {
    color: #111111;
    font-weight: 500;
    text-align: right;
}

.nevari-summary hr {
    border: 0;
    height: 1px;
    background: #f1f1f1;
    margin: 20px 0;
}

.nevari-coupon-shell {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.nevari-tip-note {
    margin: -8px 0 14px;
    font-size: 10px;
    color: #999999;
}

.nevari-tip-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    gap: 12px !important;
}

.nevari-tip {
    appearance: none !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: var(--nevari-tip-bg, #faf8f9) !important;
    color: var(--nevari-tip-text, #111111) !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 38px !important;
    padding: 0 14px !important;
    cursor: pointer !important;
    font-size: var(--nevari-tip-font-size, 11px) !important;
    line-height: 1 !important;
    font-family: var(--nevari-tip-font-family, "Product Sans", "Google Sans", Arial, sans-serif) !important;
    font-weight: var(--nevari-tip-font-weight, 500) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    box-sizing: border-box !important;
    box-shadow: none !important;
}

.nevari-tip:hover,
.nevari-tip.is-selected {
    background: var(--nevari-tip-active-bg, #184363) !important;
    color: var(--nevari-tip-active-text, #ffffff) !important;
}

.nevari-tip__icon {
    margin-right: 6px;
    vertical-align: -2px;
}

.nevari-tip .nevari-ui-icon {
    display: inline-flex;
    vertical-align: middle;
}

.nevari-coupon,
.nevari-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
}

.nevari-coupon {
    font-size: 14px;
}

.nevari-coupon-toggle {
    appearance: none;
    border: 0;
    background: transparent;
    color: #0a9af2;
    text-decoration: none;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
    padding: 0;
}

.nevari-coupon-panel {
    border: 0;
    border-radius: 0;
    background: transparent;
    padding: 0;
}

.nevari-coupon-controls {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
}

.nevari-coupon-controls input {
    flex: 1 1 auto;
    min-width: 0;
    margin: 0;
    width: 100%;
    max-width: 100%;
    height: 44px;
    border: 0 !important;
    border-radius: 12px !important;
    background: #f7f5fb;
    padding: 0 14px;
    font-size: 14px;
    color: #031b39;
}

.nevari-coupon-controls input::placeholder {
    color: #bebebe;
}

.nevari-coupon-submit {
    appearance: none;
    border: 0;
    border-radius: 999px;
    background: #17496c;
    color: #ffffff;
    height: 36px;
    padding: 0 14px;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    flex: 0 0 auto;
}

.nevari-coupon-submit:hover {
    background: #123b5c;
}

.nevari-coupon-status {
    margin-top: 10px;
}

.nevari-coupon-applied {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.nevari-coupon-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: #ffffff;
    border: 1px solid #e8e4ef;
    color: #123b5c;
    font-size: 12px;
}

.nevari-coupon-chip__remove {
    appearance: none;
    border: 0;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0;
}

.nevari-total {
    margin: 22px 0;
    font-size: 16px;
}

.nevari-total strong {
    font-size: 16px;
    font-weight: 500;
    text-align: right;
}

.nevari-legal {
    margin: 0 0 28px;
    font-size: 11px;
    color: #777777;
    line-height: 1.5;
}

.nevari-legal a {
    color: #777777;
    text-decoration: none;
}

.nevari-place-order {
    appearance: none !important;
    width: 100% !important;
    height: 46px !important;
    border: 0 !important;
    border-radius: 999px !important;
    background: #17496c !important;
    color: #ffffff !important;
    font-size: 14px !important;
    cursor: pointer !important;
    padding: 0 !important;
    box-shadow: none !important;
}

.nevari-place-order:hover {
    background: #123b5c !important;
    color: #ffffff !important;
}

.woocommerce-NoticeGroup {
    max-width: 1160px;
    margin: 0 auto 16px;
    padding: 0 24px;
}

@media (max-width: 900px) {
    .nevari-checkout-page {
        padding: 18px 20px 36px;
    }

    .nevari-layout {
        grid-template-columns: 1fr;
        gap: 28px;
    }

    .nevari-summary {
        padding-top: 0;
    }

    .nevari-tip-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
    }

    .nevari-coupon-controls {
        flex-direction: column;
        align-items: stretch;
    }

    .nevari-coupon-submit {
        width: 100%;
        height: 42px;
    }
}

@media (max-width: 640px) {
    .nevari-checkout-page {
        padding: 16px 14px 32px;
    }

    .nevari-title {
        margin-bottom: 20px;
        font-size: 26px;
    }

    .nevari-layout {
        gap: 22px;
    }

    .nevari-left {
        gap: 12px;
    }

    .nevari-card {
        padding: 15px;
        border-radius: 13px;
    }

    .nevari-card-header {
        margin-bottom: 15px;
    }

    .nevari-card-header h2 {
        font-size: 20px;
    }

    .nevari-payment-grid {
        grid-template-columns: 1fr;
        gap: 10px;
    }

    .nevari-card input {
        height: 42px;
        font-size: 13px;
    }

    .nevari-review-strip {
        border-radius: 15px;
        gap: 6px;
        padding: 7px;
    }

    .nevari-review-image-link,
    .nevari-review-more {
        width: 48px;
        height: 48px;
        border-radius: 8px;
    }

    .nevari-review-arrow {
        width: 24px;
        height: 36px;
        font-size: 24px;
    }

    .nevari-tip-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
        gap: 10px !important;
    }

    .nevari-tip {
        height: 38px !important;
        font-size: 11px !important;
    }

    .nevari-summary {
        border-top: 1px solid #f1f1f1;
        padding-top: 20px;
    }

    .nevari-place-order {
        height: 48px !important;
    }
}

@media (max-width: 380px) {
    .nevari-checkout-page {
        padding-left: 12px;
        padding-right: 12px;
    }

    .nevari-card {
        padding: 14px;
    }

    .nevari-review-image-link,
    .nevari-review-more {
        width: 42px;
        height: 42px;
    }

    .nevari-tip-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }

    .nevari-row,
    .nevari-total {
        font-size: 13px;
    }

    .nevari-coupon {
        font-size: 13px;
    }
}
CSS;
    }

    public function ajax_auth_widget_login() {
        $this->verify_auth_widget_ajax_request();

        if ($response = $this->auth_widget_rate_limit_response('auth_login_ip', 5, 15 * MINUTE_IN_SECONDS, array($this->auth_widget_client_ip()))) {
            $this->send_auth_widget_rate_limited_response($response);
        }

        $username = isset($_POST['username']) ? sanitize_text_field(wp_unslash($_POST['username'])) : '';
        $password = isset($_POST['password']) ? (string) wp_unslash($_POST['password']) : '';
        $remember = !empty($_POST['remember_me']);
        $return_url = isset($_POST['return_url']) ? (string) wp_unslash($_POST['return_url']) : '';
        $fallback_redirect_path = isset($_POST['fallback_redirect_path']) ? (string) wp_unslash($_POST['fallback_redirect_path']) : '';
        $username_key = $username ? sanitize_user(strtolower($username), true) : 'unknown';

        if ($response = $this->auth_widget_rate_limit_response('auth_login_user', 10, 15 * MINUTE_IN_SECONDS, array($username_key))) {
            $this->send_auth_widget_rate_limited_response($response);
        }

        if ($username === '' || $password === '') {
            wp_send_json_error(array('message' => __('Please enter your username and password.', 'woocommerce')), 422);
        }

        $user = wp_authenticate($username, $password);
        if (is_wp_error($user) || !($user instanceof WP_User)) {
            $this->audit_auth_widget_event('auth.widget_login_failed', array(
                'username_hash' => hash('sha256', strtolower($username)),
            ), 'warning');

            wp_send_json_error(array('message' => __('Unable to sign you in with those details.', 'woocommerce')), 401);
        }

        wp_set_current_user((int) $user->ID);
        wp_set_auth_cookie((int) $user->ID, $remember, is_ssl());

        $redirect_url = $this->auth_widget_redirect_url($user, $return_url, $fallback_redirect_path);

        $this->audit_auth_widget_event('auth.widget_login_success', array(
            'user_id' => (int) $user->ID,
            'redirect_url' => $redirect_url,
        ));

        wp_send_json_success(array(
            'redirect_url' => $redirect_url,
            'message' => __('Login successful.', 'woocommerce'),
        ));
    }

    public function ajax_auth_widget_signup() {
        $this->verify_auth_widget_ajax_request();

        if ($response = $this->auth_widget_rate_limit_response('auth_register_ip', 10, 15 * MINUTE_IN_SECONDS, array($this->auth_widget_client_ip()))) {
            $this->send_auth_widget_rate_limited_response($response);
        }

        $first_name = isset($_POST['first_name']) ? sanitize_text_field(wp_unslash($_POST['first_name'])) : '';
        $last_name = isset($_POST['last_name']) ? sanitize_text_field(wp_unslash($_POST['last_name'])) : '';
        $email = isset($_POST['email']) ? sanitize_email(wp_unslash($_POST['email'])) : '';
        $password = isset($_POST['password']) ? (string) wp_unslash($_POST['password']) : '';
        $return_url = isset($_POST['return_url']) ? (string) wp_unslash($_POST['return_url']) : '';
        $fallback_redirect_path = isset($_POST['fallback_redirect_path']) ? (string) wp_unslash($_POST['fallback_redirect_path']) : '';

        if ($response = $this->auth_widget_rate_limit_response('auth_register_email', 5, HOUR_IN_SECONDS, array(strtolower($email ?: 'unknown')))) {
            $this->send_auth_widget_rate_limited_response($response);
        }

        if ($first_name === '' || $last_name === '' || !is_email($email) || strlen($password) < 8) {
            wp_send_json_error(array('message' => __('Please provide a valid name, email, and password.', 'woocommerce')), 422);
        }

        if (email_exists($email)) {
            $this->audit_auth_widget_event('auth.widget_signup_processed', array('result' => 'existing_account'));
            wp_send_json_success(array(
                'message' => __('Your request has been received. If the account can be used, you can sign in now.', 'woocommerce'),
                'redirect_url' => $this->auth_widget_safe_same_site_url($return_url) ?: $this->auth_widget_safe_previous_page_url(),
            ));
        }

        $email_parts = explode('@', $email);
        $user_login_seed = sanitize_user((string) ($email_parts[0] ?? 'nevari_user'), true);
        $user_login_seed = $user_login_seed !== '' ? $user_login_seed : 'nevari_user';
        $user_login = $user_login_seed;
        $suffix = 1;

        while (username_exists($user_login)) {
            $user_login = $user_login_seed . $suffix;
            $suffix++;
        }

        $role = $this->auth_widget_registration_role();
        $user_id = wp_insert_user(array(
            'user_login' => $user_login,
            'user_email' => $email,
            'user_pass' => $password,
            'display_name' => trim($first_name . ' ' . $last_name),
            'first_name' => $first_name,
            'last_name' => $last_name,
            'role' => $role,
        ));

        if (is_wp_error($user_id)) {
            $this->audit_auth_widget_event('auth.widget_signup_failed', array(
                'error_code' => $user_id->get_error_code(),
            ), 'warning');

            wp_send_json_error(array('message' => __('We could not create your account right now.', 'woocommerce')), 400);
        }

        update_user_meta((int) $user_id, 'billing_first_name', $first_name);
        update_user_meta((int) $user_id, 'billing_last_name', $last_name);
        update_user_meta((int) $user_id, 'billing_email', $email);

        wp_set_current_user((int) $user_id);
        wp_set_auth_cookie((int) $user_id, true, is_ssl());

        $redirect_url = $this->auth_widget_redirect_url(get_user_by('id', (int) $user_id), $return_url, $fallback_redirect_path);

        $this->audit_auth_widget_event('auth.widget_signup_success', array(
            'user_id' => (int) $user_id,
            'role' => $role,
            'redirect_url' => $redirect_url,
        ));

        wp_send_json_success(array(
            'message' => __('Your account has been created.', 'woocommerce'),
            'redirect_url' => $redirect_url,
        ));
    }

    public function ajax_auth_widget_reset_password() {
        $this->verify_auth_widget_ajax_request();

        if ($response = $this->auth_widget_rate_limit_response('auth_password_reset_ip', 5, 15 * MINUTE_IN_SECONDS, array($this->auth_widget_client_ip()))) {
            $this->send_auth_widget_rate_limited_response($response);
        }

        $username = isset($_POST['username']) ? sanitize_text_field(wp_unslash($_POST['username'])) : '';
        $username_key = $username ? sanitize_user(strtolower($username), true) : 'unknown';

        if ($response = $this->auth_widget_rate_limit_response('auth_password_reset_user', 5, 15 * MINUTE_IN_SECONDS, array($username_key))) {
            $this->send_auth_widget_rate_limited_response($response);
        }

        if ($username !== '') {
            retrieve_password($username);
        }

        $this->audit_auth_widget_event('auth.widget_password_reset_requested', array(
            'username_hash' => $username ? hash('sha256', strtolower($username)) : '',
        ));

        wp_send_json_success(array(
            'message' => __('If the account exists, reset instructions will be sent shortly.', 'woocommerce'),
        ));
    }

    public function ajax_auth_widget_verify_code() {
        $this->verify_auth_widget_ajax_request();

        $challenge_id = isset($_POST['challenge_id']) ? sanitize_text_field(wp_unslash($_POST['challenge_id'])) : '';
        $code = isset($_POST['code']) ? preg_replace('/\D+/', '', (string) wp_unslash($_POST['code'])) : '';
        $frontend_type = isset($_POST['frontend_type']) ? sanitize_key(wp_unslash($_POST['frontend_type'])) : '';
        $return_url = isset($_POST['return_url']) ? (string) wp_unslash($_POST['return_url']) : '';
        $sso_transaction_id = isset($_POST['sso_transaction_id']) ? sanitize_text_field(wp_unslash($_POST['sso_transaction_id'])) : '';

        if ($challenge_id === '' || strlen($code) !== 6 || $frontend_type === '') {
            wp_send_json_error(array('message' => __('Enter a valid six-digit verification code.', 'woocommerce')), 422);
        }

        $frontend = $this->auth_widget_trusted_frontend($frontend_type);
        if (!$frontend) {
            wp_send_json_error(array('message' => __('This verification request could not be completed.', 'woocommerce')), 403);
        }

        $response = $this->auth_widget_call_core_auth_endpoint('verify-code', array(
            'challenge_id' => $challenge_id,
            'code' => $code,
            'frontend_type' => $frontend_type,
            'frontend_url' => (string) $frontend['frontend_url'],
            'frontend_origin' => (string) $frontend['frontend_origin'],
            'sso_transaction_id' => $sso_transaction_id,
        ));

        if (!$response['success']) {
            wp_send_json_error(
                array('message' => !empty($response['message']) ? $response['message'] : __('The verification code could not be confirmed.', 'woocommerce')),
                isset($response['status']) ? (int) $response['status'] : 400
            );
        }

        $data = is_array($response['data']) ? $response['data'] : array();
        $redirect_url = $this->auth_widget_safe_same_site_url($return_url);

        if ($redirect_url === '' && !empty($data['return_path'])) {
            $redirect_url = $this->auth_widget_dashboard_return_url((string) $data['return_path'], $frontend_type);
        }

        if ($redirect_url === '') {
            $redirect_url = home_url('/');
        }

        $this->audit_auth_widget_event('auth.widget_code_verified', array(
            'frontend_type' => $frontend_type,
            'has_sso_transaction' => $sso_transaction_id !== '',
        ));

        wp_send_json_success(array(
            'message' => __('Verification successful.', 'woocommerce'),
            'redirect_url' => $redirect_url,
            'verified' => true,
        ));
    }

    public function ajax_auth_widget_resend_code() {
        $this->verify_auth_widget_ajax_request();

        $challenge_id = isset($_POST['challenge_id']) ? sanitize_text_field(wp_unslash($_POST['challenge_id'])) : '';
        $frontend_type = isset($_POST['frontend_type']) ? sanitize_key(wp_unslash($_POST['frontend_type'])) : '';

        if ($challenge_id === '' || $frontend_type === '') {
            wp_send_json_error(array('message' => __('We could not resend the code right now.', 'woocommerce')), 422);
        }

        $frontend = $this->auth_widget_trusted_frontend($frontend_type);
        if (!$frontend) {
            wp_send_json_error(array('message' => __('This verification request could not be completed.', 'woocommerce')), 403);
        }

        $response = $this->auth_widget_call_core_auth_endpoint('resend-code', array(
            'challenge_id' => $challenge_id,
            'frontend_type' => $frontend_type,
            'frontend_url' => (string) $frontend['frontend_url'],
            'frontend_origin' => (string) $frontend['frontend_origin'],
        ));

        if (!$response['success']) {
            wp_send_json_error(
                array('message' => !empty($response['message']) ? $response['message'] : __('We could not resend the code right now.', 'woocommerce')),
                isset($response['status']) ? (int) $response['status'] : 400
            );
        }

        $data = is_array($response['data']) ? $response['data'] : array();

        $this->audit_auth_widget_event('auth.widget_code_resent', array(
            'frontend_type' => $frontend_type,
        ));

        wp_send_json_success(array(
            'message' => __('A new verification code has been sent.', 'woocommerce'),
            'masked_email' => !empty($data['masked_email']) ? sanitize_text_field((string) $data['masked_email']) : '',
            'challenge_id' => !empty($data['challenge_id']) ? sanitize_text_field((string) $data['challenge_id']) : $challenge_id,
        ));
    }

    private function verify_auth_widget_ajax_request() {
        check_ajax_referer('nevari-auth-widget', 'nonce');
    }

    private function auth_widget_rate_limit_response($bucket, $limit, $window_seconds, array $segments = array()) {
        if (!class_exists('Nevari_Helpers') || !method_exists('Nevari_Helpers', 'rate_limit')) {
            return null;
        }

        return Nevari_Helpers::rate_limit($bucket, $limit, $window_seconds, $segments);
    }

    private function send_auth_widget_rate_limited_response($response) {
        $data = $response instanceof WP_REST_Response ? $response->get_data() : array();
        $status = $response instanceof WP_REST_Response ? $response->get_status() : 429;
        $message = !empty($data['error']['message']) ? (string) $data['error']['message'] : __('Too many requests. Please try again later.', 'woocommerce');

        wp_send_json_error(array(
            'message' => $message,
            'error' => isset($data['error']) ? $data['error'] : array(),
        ), $status);
    }

    private function auth_widget_redirect_url($user, $return_url, $fallback_redirect_path) {
        $safe_return = $this->auth_widget_safe_same_site_url($return_url);
        if ($safe_return !== '') {
            return $safe_return;
        }

        $previous = $this->auth_widget_safe_previous_page_url();
        if ($previous !== '') {
            return $previous;
        }

        $fallback = $this->auth_widget_safe_relative_path($fallback_redirect_path);
        if ($fallback !== '') {
            return home_url($fallback);
        }

        $dashboard_launch = $this->auth_widget_dashboard_launch_url($user);
        if ($dashboard_launch !== '') {
            return $dashboard_launch;
        }

        return home_url('/');
    }

    private function auth_widget_dashboard_launch_url($user) {
        if (!$user instanceof WP_User) {
            return '';
        }

        if (!class_exists('Nevari_SSO') || !class_exists('Nevari_Auth')) {
            return '';
        }

        foreach (array('storefront', 'doctors_dashboard', 'pharmacist_dashboard', 'patient_dashboard') as $frontend_type) {
            if (Nevari_Auth::user_can_access_frontend($user, $frontend_type)) {
                return add_query_arg(array(
                    'nevari_sso_action' => 'dashboard_launch',
                    'frontend' => $frontend_type,
                ), home_url('/'));
            }
        }

        return '';
    }

    private function auth_widget_safe_same_site_url($url) {
        $url = trim((string) $url);
        if ($url === '') {
            return '';
        }

        $home = wp_parse_url(home_url());
        $target = wp_parse_url($url);
        if (!is_array($target)) {
            return '';
        }

        if (empty($target['host'])) {
            return esc_url_raw(home_url('/' . ltrim($url, '/')));
        }

        $home_host = !empty($home['host']) ? strtolower((string) $home['host']) : '';
        $target_host = !empty($target['host']) ? strtolower((string) $target['host']) : '';

        if ($home_host !== '' && $home_host === $target_host) {
            return esc_url_raw($url);
        }

        return '';
    }

    private function auth_widget_safe_previous_page_url() {
        $referer = wp_get_referer();
        $safe_referer = $this->auth_widget_safe_same_site_url(is_string($referer) ? $referer : '');
        if ($safe_referer === '' || $safe_referer === esc_url_raw(admin_url('admin-ajax.php'))) {
            return '';
        }

        return $safe_referer;
    }

    private function auth_widget_safe_relative_path($path) {
        $path = trim((string) $path);
        if ($path === '' || strpos($path, '//') === 0 || $path[0] !== '/') {
            return '';
        }

        return preg_match('#^/[A-Za-z0-9/_\-\?\=\&\.\%]*$#', $path) ? $path : '';
    }

    private function auth_widget_registration_role() {
        if (get_role('customer')) {
            return 'customer';
        }

        if (get_role('patient')) {
            return 'patient';
        }

        return 'subscriber';
    }

    private function auth_widget_client_ip() {
        if (class_exists('Nevari_Helpers') && method_exists('Nevari_Helpers', 'client_ip')) {
            return (string) Nevari_Helpers::client_ip();
        }

        return !empty($_SERVER['REMOTE_ADDR']) ? sanitize_text_field(wp_unslash($_SERVER['REMOTE_ADDR'])) : 'unknown';
    }

    private function auth_widget_trusted_frontend($frontend_type) {
        if (!class_exists('Nevari_Connections') || !method_exists('Nevari_Connections', 'trusted_frontend_for_type')) {
            return null;
        }

        return Nevari_Connections::trusted_frontend_for_type((string) $frontend_type);
    }

    private function auth_widget_call_core_auth_endpoint($endpoint, array $payload) {
        if (!class_exists('Nevari_Auth') || !class_exists('Nevari_Connections') || !class_exists('Nevari_Helpers')) {
            return array(
                'success' => false,
                'status' => 500,
                'message' => __('Nevari core authentication is unavailable.', 'woocommerce'),
            );
        }

        $namespace = defined('NEVARI_PHARMACY_REST_NS') ? NEVARI_PHARMACY_REST_NS : 'nevari/v1';
        $request = new WP_REST_Request('POST', '/' . trim($namespace, '/') . '/auth/' . ltrim($endpoint, '/'));
        $request->set_body(wp_json_encode($payload));
        $request->set_header('Content-Type', 'application/json');

        $server_keys = array('HTTP_ORIGIN', 'HTTP_X_NEVARI_FRONTEND_TYPE', 'HTTP_X_NEVARI_FRONTEND_ORIGIN', 'HTTP_REFERER');
        $server_snapshot = array();

        foreach ($server_keys as $server_key) {
            $server_snapshot[$server_key] = isset($_SERVER[$server_key]) ? $_SERVER[$server_key] : null;
        }

        $_SERVER['HTTP_ORIGIN'] = (string) ($payload['frontend_origin'] ?? '');
        $_SERVER['HTTP_X_NEVARI_FRONTEND_TYPE'] = (string) ($payload['frontend_type'] ?? '');
        $_SERVER['HTTP_X_NEVARI_FRONTEND_ORIGIN'] = (string) ($payload['frontend_origin'] ?? '');
        $_SERVER['HTTP_REFERER'] = (string) ($payload['frontend_url'] ?? '');

        try {
            if ($endpoint === 'verify-code') {
                $response = Nevari_Auth::verify_code($request);
            } elseif ($endpoint === 'resend-code') {
                $response = Nevari_Auth::resend_code($request);
            } else {
                $response = new WP_REST_Response(array(
                    'success' => false,
                    'error' => array('message' => 'Unsupported auth endpoint.'),
                ), 400);
            }
        } finally {
            foreach ($server_snapshot as $server_key => $server_value) {
                if ($server_value === null) {
                    unset($_SERVER[$server_key]);
                } else {
                    $_SERVER[$server_key] = $server_value;
                }
            }
        }

        if (!($response instanceof WP_REST_Response)) {
            return array(
                'success' => false,
                'status' => 500,
                'message' => __('Authentication response was invalid.', 'woocommerce'),
            );
        }

        $response_data = $response->get_data();
        $success = !empty($response_data['success']);

        return array(
            'success' => $success,
            'status' => (int) $response->get_status(),
            'data' => $success && !empty($response_data['data']) && is_array($response_data['data']) ? $response_data['data'] : array(),
            'message' => !$success && !empty($response_data['error']['message']) ? (string) $response_data['error']['message'] : '',
        );
    }

    private function auth_widget_dashboard_return_url($return_path, $frontend_type) {
        $return_path = $this->auth_widget_safe_relative_path($return_path);
        if ($return_path !== '') {
            $trusted = $this->auth_widget_trusted_frontend($frontend_type);
            if ($trusted && !empty($trusted['frontend_origin'])) {
                return untrailingslashit((string) $trusted['frontend_origin']) . $return_path;
            }
        }

        return '';
    }

    private function audit_auth_widget_event($event, array $metadata = array(), $severity = 'info') {
        if (!class_exists('Nevari_Audit')) {
            return;
        }

        Nevari_Audit::log('security', 'nevari', $event, $severity === 'warning' || $severity === 'error' ? 'error' : 'success', array(
            'actor_user_id' => get_current_user_id() ?: null,
            'severity' => $severity,
            'message' => 'Nevari auth widget event recorded.',
            'metadata' => $metadata,
        ));
    }

    private function js() {
        return <<<JS
(function () {
    function bindToastNotices() {
        document.querySelectorAll('.woocommerce-notices-wrapper .woocommerce-message, .woocommerce-notices-wrapper .woocommerce-error, .woocommerce-notices-wrapper .woocommerce-info').forEach(function (notice) {
            if (notice.dataset.nevariToastBound === 'true') {
                return;
            }

            notice.dataset.nevariToastBound = 'true';

            window.setTimeout(function () {
                notice.dataset.nevariToastState = 'closing';

                window.setTimeout(function () {
                    if (notice && notice.parentNode) {
                        notice.parentNode.removeChild(notice);
                    }
                }, 260);
            }, 2600);
        });
    }

    function updateNoticesHtml(html) {
        var notices = document.querySelector('.woocommerce-notices-wrapper');

        if (!notices) {
            if (!html) {
                return;
            }

            notices = document.createElement('div');
            notices.className = 'woocommerce-notices-wrapper';

            var page = document.querySelector('.nevari-checkout-page') || document.querySelector('.nevari-cart-page');

            if (page && page.parentNode) {
                page.parentNode.insertBefore(notices, page);
            } else {
                document.body.insertBefore(notices, document.body.firstChild);
            }
        }

        notices.innerHTML = html || '';
        bindToastNotices();
    }

    function getReviewStripState(imageWrap) {
        var items = imageWrap ? imageWrap.querySelectorAll('.nevari-review-image-link') : [];
        var hiddenCount = 0;
        var viewportRight = (imageWrap ? imageWrap.scrollLeft : 0) + (imageWrap ? imageWrap.clientWidth : 0);
        var maxScroll = imageWrap ? Math.max(0, imageWrap.scrollWidth - imageWrap.clientWidth) : 0;

        items.forEach(function (item) {
            if (!item) {
                return;
            }

            var itemRight = item.offsetLeft + item.offsetWidth;

            if (itemRight > viewportRight + 1) {
                hiddenCount++;
            }
        });

        return {
            hiddenCount: hiddenCount,
            canScrollNext: imageWrap ? imageWrap.scrollLeft < (maxScroll - 1) : false,
            hasOverflow: maxScroll > 0,
            maxScroll: maxScroll
        };
    }

    function updateReviewImages() {
        document.querySelectorAll('.nevari-review-strip').forEach(function (strip) {
            var imageWrap = strip.querySelector('.nevari-review-images');
            var more = strip.querySelector('[data-nevari-more]');
            var arrow = strip.querySelector('[data-nevari-arrow]');

            if (!imageWrap || !more || !arrow) {
                return;
            }

            var state = getReviewStripState(imageWrap);

            more.hidden = state.hiddenCount <= 0;
            more.textContent = state.hiddenCount > 0 ? '+' + state.hiddenCount : '+0';

            arrow.hidden = !state.hasOverflow;
            arrow.disabled = !state.canScrollNext;
            arrow.setAttribute('aria-disabled', state.canScrollNext ? 'false' : 'true');
        });
    }

    function getPriceFormat() {
        return window.NevariCheckout && window.NevariCheckout.priceFormat ? window.NevariCheckout.priceFormat : {
            currencySymbol: '$',
            currencyPosition: 'left',
            decimalSeparator: '.',
            thousandSeparator: ',',
            decimals: 2
        };
    }

    function formatPrice(amount) {
        var settings = getPriceFormat();
        var decimals = typeof settings.decimals === 'number' ? settings.decimals : 2;
        var fixed = (Number(amount) || 0).toFixed(decimals);
        var parts = fixed.split('.');
        var integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, settings.thousandSeparator || ',');
        var decimalPart = parts[1] ? settings.decimalSeparator + parts[1] : '';
        var formatted = integerPart + decimalPart;

        switch (settings.currencyPosition) {
            case 'right':
                return formatted + (settings.currencySymbol || '$');
            case 'left_space':
                return (settings.currencySymbol || '$') + ' ' + formatted;
            case 'right_space':
                return formatted + ' ' + (settings.currencySymbol || '$');
            case 'left':
            default:
                return (settings.currencySymbol || '$') + formatted;
        }
    }

    function updateCheckoutTotal() {
        var totalWrap = document.querySelector('[data-nevari-total]');
        var totalAmount = document.querySelector('[data-nevari-total-amount]');
        var tipAmountNode = document.querySelector('[data-nevari-tip-amount]');

        if (!totalWrap || !totalAmount) {
            return;
        }

        var summaryTotals = totalWrap.closest('[data-nevari-summary]') ? totalWrap.closest('[data-nevari-summary]').querySelector('[data-nevari-summary-totals]') : document.querySelector('[data-nevari-summary-totals]');
        var itemsTotal = summaryTotals ? parseFloat(summaryTotals.getAttribute('data-items-total') || '0') : 0;
        var discountTotal = summaryTotals ? parseFloat(summaryTotals.getAttribute('data-discount-total') || '0') : 0;
        var tipTotal = summaryTotals ? parseFloat(summaryTotals.getAttribute('data-tip-total') || '0') : 0;

        if (isNaN(itemsTotal)) {
            itemsTotal = 0;
        }

        if (isNaN(discountTotal)) {
            discountTotal = 0;
        }

        if (isNaN(tipTotal)) {
            tipTotal = 0;
        }

        var selectedTipInput = document.querySelector('input[name="nevari_selected_tip"]');

        if (selectedTipInput) {
            var selectedTipValue = parseFloat(selectedTipInput.value || '0');

            if (!isNaN(selectedTipValue)) {
                tipTotal = selectedTipValue;
            }
        }

        if (tipAmountNode) {
            tipAmountNode.textContent = formatPrice(tipTotal);
        }

        totalAmount.textContent = formatPrice(Math.max(0, itemsTotal - discountTotal + tipTotal));
    }

    function replaceCheckoutSummary(html) {
        var wrap = document.querySelector('.nevari-summary');

        if (!wrap || !html) {
            return;
        }

        var container = document.createElement('div');
        container.innerHTML = html;

        var nextSummary = container.querySelector('.nevari-summary');

        if (!nextSummary) {
            return;
        }

        wrap.replaceWith(nextSummary);
        init();
    }

    function updateCouponPanelState(panel, toggleButton, shouldOpen) {
        if (!panel || !toggleButton) {
            return;
        }

        panel.hidden = !shouldOpen;
        toggleButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    }

    function bindCouponToggle() {
        document.querySelectorAll('[data-nevari-coupon-toggle]').forEach(function (button) {
            if (button.dataset.bound === 'true') {
                return;
            }

            button.dataset.bound = 'true';

            button.addEventListener('click', function () {
                var shell = button.closest('.nevari-coupon-shell');
                var panel = shell ? shell.querySelector('[data-nevari-coupon-panel]') : null;
                var isOpen = panel ? !panel.hidden : false;

                updateCouponPanelState(panel, button, !isOpen);
            });
        });
    }

    function sendCheckoutCouponRequest(action, couponCode) {
        var body = new URLSearchParams();

        body.set('action', action);
        body.set('nonce', window.NevariCheckout && window.NevariCheckout.checkoutNonce ? window.NevariCheckout.checkoutNonce : '');
        body.set('coupon_code', couponCode || '');

        return fetch(window.NevariCheckout.ajaxUrl, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: body.toString()
        }).then(function (response) {
            return response.json();
        });
    }

    function bindCouponForm() {
        document.querySelectorAll('[data-nevari-coupon-form]').forEach(function (form) {
            if (form.dataset.bound === 'true') {
                return;
            }

            form.dataset.bound = 'true';
            var shell = form.closest('.nevari-coupon-shell');

            form.addEventListener('submit', function (event) {
                event.preventDefault();

                if (form.dataset.loading === 'true') {
                    return;
                }

                var input = form.querySelector('input[name="coupon_code"]');
                var code = input ? input.value.trim() : '';

                if (!code) {
                    return;
                }

                form.dataset.loading = 'true';

                sendCheckoutCouponRequest('nevari_apply_checkout_coupon', code).then(function (payload) {
                    form.dataset.loading = 'false';

                    if (payload && payload.success && payload.data) {
                        if (payload.data.notices_html !== undefined) {
                            updateNoticesHtml(payload.data.notices_html || '');
                        }

                        if (payload.data.summary_html) {
                            replaceCheckoutSummary(payload.data.summary_html);
                        }

                        if (window.jQuery) {
                            jQuery(document.body).trigger('update_checkout');
                        }
                    }
                }).catch(function () {
                    form.dataset.loading = 'false';
                });
            });

            if (!shell) {
                return;
            }

            shell.querySelectorAll('[data-nevari-remove-coupon]').forEach(function (button) {
                if (button.dataset.bound === 'true') {
                    return;
                }

                button.dataset.bound = 'true';

                button.addEventListener('click', function () {
                    var couponCode = button.getAttribute('data-nevari-remove-coupon') || '';

                    if (!couponCode) {
                        return;
                    }

                    sendCheckoutCouponRequest('nevari_remove_checkout_coupon', couponCode).then(function (payload) {
                        if (payload && payload.success && payload.data) {
                            if (payload.data.notices_html !== undefined) {
                                updateNoticesHtml(payload.data.notices_html || '');
                            }

                            if (payload.data.summary_html) {
                                replaceCheckoutSummary(payload.data.summary_html);
                            }

                            if (window.jQuery) {
                                jQuery(document.body).trigger('update_checkout');
                            }
                        }
                    });
                });
            });
        });
    }

    function bindReviewArrow() {
        document.querySelectorAll('[data-nevari-arrow]').forEach(function (button) {
            if (button.dataset.scrollBound === 'true') {
                return;
            }

            button.dataset.scrollBound = 'true';

            button.addEventListener('click', function () {
                var strip = button.closest('.nevari-review-strip');

                if (!strip) {
                    return;
                }

                var imageWrap = strip.querySelector('.nevari-review-images');

                if (!imageWrap) {
                    return;
                }

                var state = getReviewStripState(imageWrap);

                if (!state.canScrollNext) {
                    updateReviewImages();
                    return;
                }

                var firstItem = imageWrap.querySelector('.nevari-review-image-link');
                var itemWidth = firstItem ? firstItem.offsetWidth : 64;
                var scrollAmount = (itemWidth + 5) * 2;
                var nextScrollLeft = Math.min(imageWrap.scrollLeft + scrollAmount, state.maxScroll);

                if (nextScrollLeft === imageWrap.scrollLeft) {
                    updateReviewImages();
                    return;
                }

                imageWrap.scrollTo({
                    left: nextScrollLeft,
                    behavior: 'smooth'
                });

                window.requestAnimationFrame(updateReviewImages);
            });
        });

        document.querySelectorAll('.nevari-review-images').forEach(function (imageWrap) {
            if (imageWrap.dataset.scrollBound === 'true') {
                return;
            }

            imageWrap.dataset.scrollBound = 'true';

            imageWrap.addEventListener('scroll', function () {
                window.requestAnimationFrame(updateReviewImages);
            }, { passive: true });
        });
    }

    function bindButtons() {
        document.querySelectorAll('.nevari-tip').forEach(function (button) {
            if (button.dataset.bound === 'true') return;

            button.dataset.bound = 'true';

            button.addEventListener('click', function () {
                document.querySelectorAll('.nevari-tip').forEach(function (btn) {
                    btn.classList.remove('is-selected');
                });

                button.classList.add('is-selected');

                var tip = button.getAttribute('data-tip') || '';
                var tipLabel = button.getAttribute('data-tip-label') || '';
                var input = document.querySelector('input[name="nevari_selected_tip"]');
                var labelInput = document.querySelector('input[name="nevari_selected_tip_label"]');

                if (input) {
                    input.value = tip;
                }

                if (labelInput) {
                    labelInput.value = tipLabel;
                }

                updateCheckoutTotal();

                if (!window.jQuery) {
                    return;
                }

                jQuery(document.body).trigger('update_checkout');
            });
        });
    }

    function bindCartControls() {
        document.querySelectorAll('[data-cart-qty]').forEach(function (control) {
            if (control.dataset.bound === 'true') {
                return;
            }

            control.dataset.bound = 'true';

            var input = control.querySelector('.nevari-cart-qty-input');
            var cartPage = control.closest('.nevari-cart-page');
            var cartItemKey = control.getAttribute('data-cart-item-key');
            var decreaseButton = control.querySelector('[data-qty-action="decrease"]');
            var increaseButton = control.querySelector('[data-qty-action="increase"]');

            if (!input || !cartPage || !cartItemKey) {
                return;
            }

            function syncCartControlState() {
                var currentValue = parseInt(input.value, 10);
                var isMinimumQuantity = isNaN(currentValue) || currentValue <= 1;

                if (decreaseButton) {
                    decreaseButton.disabled = isMinimumQuantity;
                    decreaseButton.setAttribute('aria-disabled', isMinimumQuantity ? 'true' : 'false');
                }
            }

            function replaceCartHtml(html) {
                var wrapper = document.createElement('div');
                wrapper.innerHTML = html;

                var nextCartPage = wrapper.querySelector('.nevari-cart-page');

                if (!nextCartPage) {
                    return;
                }

                cartPage.replaceWith(nextCartPage);
                init();

                document.dispatchEvent(new CustomEvent('nevari_cart_updated'));
            }

            function updateCartQuantity(nextValue) {
                var parsedValue = parseInt(nextValue, 10);

                if (isNaN(parsedValue) || parsedValue < 1 || control.dataset.loading === 'true') {
                    input.value = Math.max(parseInt(input.value, 10) || 1, 1);
                    return;
                }

                control.dataset.loading = 'true';
                control.classList.add('is-updating');
                input.disabled = true;
                if (decreaseButton) {
                    decreaseButton.disabled = true;
                }
                if (increaseButton) {
                    increaseButton.disabled = true;
                }
                input.value = parsedValue;
                syncCartControlState();

                var body = new URLSearchParams();
                body.set('action', 'nevari_update_cart_quantity');
                body.set('nonce', window.NevariCheckout && window.NevariCheckout.cartNonce ? window.NevariCheckout.cartNonce : '');
                body.set('cart_item_key', cartItemKey);
                body.set('quantity', parsedValue);

                fetch(window.NevariCheckout.ajaxUrl, {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                    },
                    body: body.toString()
                }).then(function (response) {
                    return response.json();
                }).then(function (payload) {
                    if (!payload || !payload.success || !payload.data || !payload.data.html) {
                        throw new Error(payload && payload.data && payload.data.message ? payload.data.message : 'Unable to update cart.');
                    }

                    replaceCartHtml(payload.data.html);
                }).catch(function () {
                    control.dataset.loading = 'false';
                    control.classList.remove('is-updating');
                    input.disabled = false;
                    if (decreaseButton) {
                        decreaseButton.disabled = false;
                    }
                    if (increaseButton) {
                        increaseButton.disabled = false;
                    }
                    input.value = Math.max(parseInt(input.defaultValue, 10) || 1, 1);
                    syncCartControlState();
                });
            }

            control.querySelectorAll('[data-qty-action]').forEach(function (button) {
                button.addEventListener('click', function () {
                    var action = button.getAttribute('data-qty-action');
                    var currentValue = parseInt(input.value, 10);

                    if (isNaN(currentValue) || currentValue < 1) {
                        currentValue = 1;
                    }

                    if (action === 'increase') {
                        currentValue = currentValue + 1;
                    } else {
                        currentValue = Math.max(1, currentValue - 1);
                    }

                    input.value = currentValue;
                    syncCartControlState();
                    updateCartQuantity(currentValue);
                });
            });

            input.addEventListener('change', function () {
                var nextValue = parseInt(input.value, 10);
                input.value = !isNaN(nextValue) && nextValue > 0 ? nextValue : 1;
                syncCartControlState();
                updateCartQuantity(input.value);
            });

            syncCartControlState();
        });
    }

    function init() {
        bindToastNotices();
        bindButtons();
        bindCouponToggle();
        bindCouponForm();
        bindCartControls();
        bindReviewArrow();
        window.requestAnimationFrame(updateReviewImages);
        updateCheckoutTotal();
    }

    document.addEventListener('DOMContentLoaded', init);
    window.addEventListener('resize', updateReviewImages);

    if (window.jQuery) {
        jQuery(document.body).on('updated_checkout', init);
    }
})();
JS;
    }
}
