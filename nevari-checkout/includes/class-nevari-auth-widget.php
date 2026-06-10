<?php

if (!defined('ABSPATH')) {
    exit;
}

use Elementor\Controls_Manager;
use Elementor\Group_Control_Typography;
use Elementor\Widget_Base;

class Nevari_Auth_Widget extends Widget_Base {
    public function get_name() {
        return 'nevari-auth';
    }

    public function get_title() {
        return __('Nevari Auth', 'woocommerce');
    }

    public function get_icon() {
        return 'eicon-lock-user';
    }

    public function get_categories() {
        return array('nevari');
    }

    public function get_style_depends() {
        return array('nevari-auth-widget');
    }

    public function get_script_depends() {
        return array('nevari-auth-widget');
    }

    protected function register_controls() {
        $this->register_content_controls();
        $this->register_style_controls();
    }

    private function register_content_controls() {
        $this->start_controls_section(
            'section_content',
            array(
                'label' => __('Content', 'woocommerce'),
                'tab' => Controls_Manager::TAB_CONTENT,
            )
        );

        $this->add_control(
            'login_tab_label',
            array(
                'label' => __('Login Tab Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Log in', 'woocommerce'),
            )
        );

        $this->add_control(
            'signup_tab_label',
            array(
                'label' => __('Signup Tab Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Sign up', 'woocommerce'),
            )
        );

        $this->add_control(
            'show_signup',
            array(
                'label' => __('Show Signup Tab', 'woocommerce'),
                'type' => Controls_Manager::SWITCHER,
                'default' => 'yes',
            )
        );

        $this->add_control(
            'show_forgot_password',
            array(
                'label' => __('Show Forgot Password', 'woocommerce'),
                'type' => Controls_Manager::SWITCHER,
                'default' => 'yes',
            )
        );

        $this->add_control(
            'show_remember_me',
            array(
                'label' => __('Show Remember Me', 'woocommerce'),
                'type' => Controls_Manager::SWITCHER,
                'default' => 'yes',
            )
        );

        $this->add_control(
            'show_verify_state',
            array(
                'label' => __('Show Verify Code State', 'woocommerce'),
                'type' => Controls_Manager::SWITCHER,
                'default' => 'yes',
            )
        );

        $this->add_control(
            'fallback_redirect_path',
            array(
                'label' => __('Fallback Redirect Path', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'placeholder' => '/dashboard',
                'description' => __('Optional same-site relative path used before dashboard fallback.', 'woocommerce'),
            )
        );

        $this->add_control(
            'login_heading',
            array(
                'label' => __('Login Heading', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Welcome back', 'woocommerce'),
            )
        );

        $this->add_control(
            'login_description',
            array(
                'label' => __('Login Description', 'woocommerce'),
                'type' => Controls_Manager::TEXTAREA,
                'default' => __('Log in with your Nevari account to continue.', 'woocommerce'),
            )
        );

        $this->add_control(
            'signup_heading',
            array(
                'label' => __('Signup Heading', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Create your account', 'woocommerce'),
                'condition' => array('show_signup' => 'yes'),
            )
        );

        $this->add_control(
            'signup_description',
            array(
                'label' => __('Signup Description', 'woocommerce'),
                'type' => Controls_Manager::TEXTAREA,
                'default' => __('Create a customer account to place orders faster.', 'woocommerce'),
                'condition' => array('show_signup' => 'yes'),
            )
        );

        $this->add_control(
            'verify_heading',
            array(
                'label' => __('Verify Heading', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Verify your code', 'woocommerce'),
                'condition' => array('show_verify_state' => 'yes'),
            )
        );

        $this->add_control(
            'verify_description',
            array(
                'label' => __('Verify Description', 'woocommerce'),
                'type' => Controls_Manager::TEXTAREA,
                'default' => __('Enter the six-digit code sent to your email.', 'woocommerce'),
                'condition' => array('show_verify_state' => 'yes'),
            )
        );

        $this->add_control(
            'reset_heading',
            array(
                'label' => __('Reset Heading', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Reset password', 'woocommerce'),
                'condition' => array('show_forgot_password' => 'yes'),
            )
        );

        $this->add_control(
            'reset_description',
            array(
                'label' => __('Reset Description', 'woocommerce'),
                'type' => Controls_Manager::TEXTAREA,
                'default' => __('Enter your email or username to receive reset instructions.', 'woocommerce'),
                'condition' => array('show_forgot_password' => 'yes'),
            )
        );

        $this->add_control(
            'username_label',
            array(
                'label' => __('Username Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Email or username', 'woocommerce'),
            )
        );

        $this->add_control(
            'username_placeholder',
            array(
                'label' => __('Username Placeholder', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Enter your email or username', 'woocommerce'),
            )
        );

        $this->add_control(
            'password_label',
            array(
                'label' => __('Password Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Password', 'woocommerce'),
            )
        );

        $this->add_control(
            'password_placeholder',
            array(
                'label' => __('Password Placeholder', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Enter your password', 'woocommerce'),
            )
        );

        $this->add_control(
            'first_name_label',
            array(
                'label' => __('First Name Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('First name', 'woocommerce'),
                'condition' => array('show_signup' => 'yes'),
            )
        );

        $this->add_control(
            'last_name_label',
            array(
                'label' => __('Last Name Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Last name', 'woocommerce'),
                'condition' => array('show_signup' => 'yes'),
            )
        );

        $this->add_control(
            'signup_email_label',
            array(
                'label' => __('Signup Email Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Email', 'woocommerce'),
                'condition' => array('show_signup' => 'yes'),
            )
        );

        $this->add_control(
            'signup_password_label',
            array(
                'label' => __('Signup Password Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Password', 'woocommerce'),
                'condition' => array('show_signup' => 'yes'),
            )
        );

        $this->add_control(
            'code_label',
            array(
                'label' => __('Verification Code Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Verification code', 'woocommerce'),
                'condition' => array('show_verify_state' => 'yes'),
            )
        );

        $this->add_control(
            'remember_me_label',
            array(
                'label' => __('Remember Me Label', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Remember me', 'woocommerce'),
                'condition' => array('show_remember_me' => 'yes'),
            )
        );

        $this->add_control(
            'login_button_text',
            array(
                'label' => __('Login Button Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Log in', 'woocommerce'),
            )
        );

        $this->add_control(
            'signup_button_text',
            array(
                'label' => __('Signup Button Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Create account', 'woocommerce'),
                'condition' => array('show_signup' => 'yes'),
            )
        );

        $this->add_control(
            'verify_button_text',
            array(
                'label' => __('Verify Button Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Verify code', 'woocommerce'),
                'condition' => array('show_verify_state' => 'yes'),
            )
        );

        $this->add_control(
            'reset_button_text',
            array(
                'label' => __('Reset Button Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Send reset link', 'woocommerce'),
                'condition' => array('show_forgot_password' => 'yes'),
            )
        );

        $this->add_control(
            'resend_button_text',
            array(
                'label' => __('Resend Button Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Resend code', 'woocommerce'),
                'condition' => array('show_verify_state' => 'yes'),
            )
        );

        $this->add_control(
            'forgot_password_text',
            array(
                'label' => __('Forgot Password Link Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Forgot password?', 'woocommerce'),
                'condition' => array('show_forgot_password' => 'yes'),
            )
        );

        $this->add_control(
            'back_to_login_text',
            array(
                'label' => __('Back to Login Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Back to login', 'woocommerce'),
            )
        );

        $this->add_control(
            'logged_in_heading',
            array(
                'label' => __('Logged-in Heading', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('You are signed in', 'woocommerce'),
            )
        );

        $this->add_control(
            'logged_in_description',
            array(
                'label' => __('Logged-in Description', 'woocommerce'),
                'type' => Controls_Manager::TEXTAREA,
                'default' => __('Continue where you left off or sign out of this device.', 'woocommerce'),
            )
        );

        $this->add_control(
            'continue_button_text',
            array(
                'label' => __('Continue Button Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Continue', 'woocommerce'),
            )
        );

        $this->add_control(
            'logout_button_text',
            array(
                'label' => __('Logout Button Text', 'woocommerce'),
                'type' => Controls_Manager::TEXT,
                'default' => __('Log out', 'woocommerce'),
            )
        );

        $this->end_controls_section();
    }

    private function register_style_controls() {
        $this->start_controls_section(
            'section_card_style',
            array(
                'label' => __('Card', 'woocommerce'),
                'tab' => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'card_background_color',
            array(
                'label' => __('Background', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget' => 'background-color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'card_border_color',
            array(
                'label' => __('Border Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget' => 'border-color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'card_border_radius',
            array(
                'label' => __('Border Radius', 'woocommerce'),
                'type' => Controls_Manager::SLIDER,
                'range' => array('px' => array('min' => 0, 'max' => 48)),
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget' => 'border-radius: {{SIZE}}{{UNIT}};'),
            )
        );

        $this->add_responsive_control(
            'card_padding',
            array(
                'label' => __('Padding', 'woocommerce'),
                'type' => Controls_Manager::DIMENSIONS,
                'size_units' => array('px', '%'),
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'),
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_heading_style',
            array(
                'label' => __('Headings & Text', 'woocommerce'),
                'tab' => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'heading_color',
            array(
                'label' => __('Heading Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__heading' => 'color: {{VALUE}};'),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name' => 'heading_typography',
                'selector' => '{{WRAPPER}} .nevari-auth-widget__heading',
            )
        );

        $this->add_control(
            'description_color',
            array(
                'label' => __('Description Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__description' => 'color: {{VALUE}};'),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name' => 'description_typography',
                'selector' => '{{WRAPPER}} .nevari-auth-widget__description',
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_tabs_style',
            array(
                'label' => __('Tabs', 'woocommerce'),
                'tab' => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'tab_text_color',
            array(
                'label' => __('Text Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__tab' => 'color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'tab_active_color',
            array(
                'label' => __('Active Text Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__tab.is-active' => 'color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'tab_active_background',
            array(
                'label' => __('Active Background', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__tab.is-active' => 'background-color: {{VALUE}};'),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name' => 'tab_typography',
                'selector' => '{{WRAPPER}} .nevari-auth-widget__tab',
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_field_style',
            array(
                'label' => __('Fields', 'woocommerce'),
                'tab' => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'label_color',
            array(
                'label' => __('Label Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__label' => 'color: {{VALUE}};'),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name' => 'label_typography',
                'selector' => '{{WRAPPER}} .nevari-auth-widget__label',
            )
        );

        $this->add_control(
            'input_text_color',
            array(
                'label' => __('Input Text Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__input' => 'color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'input_background_color',
            array(
                'label' => __('Input Background', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__input' => 'background-color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'input_border_color',
            array(
                'label' => __('Input Border Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__input' => 'border-color: {{VALUE}};'),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name' => 'input_typography',
                'selector' => '{{WRAPPER}} .nevari-auth-widget__input',
            )
        );

        $this->add_control(
            'input_border_radius',
            array(
                'label' => __('Input Radius', 'woocommerce'),
                'type' => Controls_Manager::SLIDER,
                'range' => array('px' => array('min' => 0, 'max' => 36)),
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__input' => 'border-radius: {{SIZE}}{{UNIT}};'),
            )
        );

        $this->add_responsive_control(
            'field_padding',
            array(
                'label' => __('Field Padding', 'woocommerce'),
                'type' => Controls_Manager::DIMENSIONS,
                'size_units' => array('px', '%'),
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__input' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'),
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_button_style',
            array(
                'label' => __('Buttons', 'woocommerce'),
                'tab' => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'button_text_color',
            array(
                'label' => __('Text Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__button--primary' => 'color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'button_background_color',
            array(
                'label' => __('Background', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__button--primary' => 'background-color: {{VALUE}};'),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name' => 'button_typography',
                'selector' => '{{WRAPPER}} .nevari-auth-widget__button',
            )
        );

        $this->add_control(
            'button_border_radius',
            array(
                'label' => __('Button Radius', 'woocommerce'),
                'type' => Controls_Manager::SLIDER,
                'range' => array('px' => array('min' => 0, 'max' => 36)),
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__button' => 'border-radius: {{SIZE}}{{UNIT}};'),
            )
        );

        $this->add_responsive_control(
            'button_padding',
            array(
                'label' => __('Button Padding', 'woocommerce'),
                'type' => Controls_Manager::DIMENSIONS,
                'size_units' => array('px', '%'),
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__button' => 'padding: {{TOP}}{{UNIT}} {{RIGHT}}{{UNIT}} {{BOTTOM}}{{UNIT}} {{LEFT}}{{UNIT}};'),
            )
        );

        $this->end_controls_section();

        $this->start_controls_section(
            'section_message_style',
            array(
                'label' => __('Messages', 'woocommerce'),
                'tab' => Controls_Manager::TAB_STYLE,
            )
        );

        $this->add_control(
            'message_text_color',
            array(
                'label' => __('Message Text Color', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__message' => 'color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'message_background_color',
            array(
                'label' => __('Message Background', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__message' => 'background-color: {{VALUE}};'),
            )
        );

        $this->add_control(
            'message_error_background_color',
            array(
                'label' => __('Error Background', 'woocommerce'),
                'type' => Controls_Manager::COLOR,
                'selectors' => array('{{WRAPPER}} .nevari-auth-widget__message.is-error' => 'background-color: {{VALUE}};'),
            )
        );

        $this->add_group_control(
            Group_Control_Typography::get_type(),
            array(
                'name' => 'message_typography',
                'selector' => '{{WRAPPER}} .nevari-auth-widget__message',
            )
        );

        $this->end_controls_section();
    }

    protected function render() {
        $settings = $this->get_settings_for_display();
        $widget_id = 'nevari-auth-widget-' . $this->get_id();
        $is_logged_in = is_user_logged_in();
        $current_user = $is_logged_in ? wp_get_current_user() : null;
        $return_url = $this->requested_return_url();
        $logout_return_url = $this->current_page_url();
        $challenge_id = isset($_GET['nevari_challenge']) ? sanitize_text_field(wp_unslash($_GET['nevari_challenge'])) : '';
        $masked_email = isset($_GET['nevari_masked_email']) ? sanitize_text_field(wp_unslash($_GET['nevari_masked_email'])) : '';
        $frontend_type = isset($_GET['nevari_frontend_type']) ? sanitize_key(wp_unslash($_GET['nevari_frontend_type'])) : '';
        $sso_transaction_id = isset($_GET['nevari_sso_transaction']) ? sanitize_text_field(wp_unslash($_GET['nevari_sso_transaction'])) : '';

        wp_enqueue_script('nevari-auth-widget');
        wp_localize_script(
            'nevari-auth-widget',
            'NevariAuthWidget',
            array(
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('nevari-auth-widget'),
                'defaultMessage' => __('Please wait while we process your request.', 'woocommerce'),
                'verifyStateEnabled' => ('yes' === $settings['show_verify_state']),
                'resendButtonText' => $settings['resend_button_text'],
                'backToLoginText' => $settings['back_to_login_text'],
            )
        );

        $redirect_url = $is_logged_in ? $this->logged_in_redirect_url($current_user, $settings, $return_url) : '';
        ?>
        <div
            id="<?php echo esc_attr($widget_id); ?>"
            class="nevari-auth-widget"
            data-widget-id="<?php echo esc_attr($widget_id); ?>"
            data-show-signup="<?php echo esc_attr($settings['show_signup']); ?>"
            data-show-verify="<?php echo esc_attr($settings['show_verify_state']); ?>"
            data-initial-challenge="<?php echo esc_attr($challenge_id); ?>"
            data-initial-masked-email="<?php echo esc_attr($masked_email); ?>"
            data-initial-frontend-type="<?php echo esc_attr($frontend_type); ?>"
            data-initial-sso-transaction="<?php echo esc_attr($sso_transaction_id); ?>"
        >
            <?php if ($is_logged_in && $current_user instanceof WP_User) : ?>
                <div class="nevari-auth-widget__state nevari-auth-widget__state--loggedin is-active">
                    <h3 class="nevari-auth-widget__heading"><?php echo esc_html($settings['logged_in_heading']); ?></h3>
                    <p class="nevari-auth-widget__description">
                        <?php
                        echo esc_html(
                            sprintf(
                                '%s %s',
                                $settings['logged_in_description'],
                                $current_user->display_name ? '(' . $current_user->display_name . ')' : ''
                            )
                        );
                        ?>
                    </p>
                    <div class="nevari-auth-widget__actions">
                        <a class="nevari-auth-widget__button nevari-auth-widget__button--primary" href="<?php echo esc_url($redirect_url); ?>">
                            <?php echo esc_html($settings['continue_button_text']); ?>
                        </a>
                        <a class="nevari-auth-widget__button nevari-auth-widget__button--ghost" href="<?php echo esc_url(wp_logout_url($logout_return_url)); ?>">
                            <?php echo esc_html($settings['logout_button_text']); ?>
                        </a>
                    </div>
                </div>
            <?php else : ?>
                <div class="nevari-auth-widget__tabs" role="tablist">
                    <button type="button" class="nevari-auth-widget__tab is-active" data-nevari-auth-tab="login"><?php echo esc_html($settings['login_tab_label']); ?></button>
                    <?php if ('yes' === $settings['show_signup']) : ?>
                        <button type="button" class="nevari-auth-widget__tab" data-nevari-auth-tab="signup"><?php echo esc_html($settings['signup_tab_label']); ?></button>
                    <?php endif; ?>
                </div>

                <div class="nevari-auth-widget__message" hidden></div>

                <div class="nevari-auth-widget__state is-active" data-nevari-auth-state="login">
                    <h3 class="nevari-auth-widget__heading"><?php echo esc_html($settings['login_heading']); ?></h3>
                    <p class="nevari-auth-widget__description"><?php echo esc_html($settings['login_description']); ?></p>
                    <form class="nevari-auth-widget__form" data-nevari-auth-form="login">
                        <input type="hidden" name="action" value="nevari_auth_widget_login" />
                        <input type="hidden" name="nonce" value="<?php echo esc_attr(wp_create_nonce('nevari-auth-widget')); ?>" />
                        <input type="hidden" name="return_url" value="<?php echo esc_attr($return_url); ?>" />
                        <input type="hidden" name="fallback_redirect_path" value="<?php echo esc_attr($settings['fallback_redirect_path']); ?>" />
                        <label class="nevari-auth-widget__field">
                            <span class="nevari-auth-widget__label"><?php echo esc_html($settings['username_label']); ?></span>
                            <input class="nevari-auth-widget__input" type="text" name="username" placeholder="<?php echo esc_attr($settings['username_placeholder']); ?>" required />
                        </label>
                        <label class="nevari-auth-widget__field">
                            <span class="nevari-auth-widget__label"><?php echo esc_html($settings['password_label']); ?></span>
                            <input class="nevari-auth-widget__input" type="password" name="password" placeholder="<?php echo esc_attr($settings['password_placeholder']); ?>" required />
                        </label>
                        <?php if ('yes' === $settings['show_remember_me']) : ?>
                            <label class="nevari-auth-widget__checkbox">
                                <input type="checkbox" name="remember_me" value="1" />
                                <span><?php echo esc_html($settings['remember_me_label']); ?></span>
                            </label>
                        <?php endif; ?>
                        <button type="submit" class="nevari-auth-widget__button nevari-auth-widget__button--primary"><?php echo esc_html($settings['login_button_text']); ?></button>
                    </form>
                    <?php if ('yes' === $settings['show_forgot_password']) : ?>
                        <button type="button" class="nevari-auth-widget__link" data-nevari-auth-view="reset"><?php echo esc_html($settings['forgot_password_text']); ?></button>
                    <?php endif; ?>
                </div>

                <?php if ('yes' === $settings['show_signup']) : ?>
                    <div class="nevari-auth-widget__state" data-nevari-auth-state="signup" hidden>
                        <h3 class="nevari-auth-widget__heading"><?php echo esc_html($settings['signup_heading']); ?></h3>
                        <p class="nevari-auth-widget__description"><?php echo esc_html($settings['signup_description']); ?></p>
                        <form class="nevari-auth-widget__form" data-nevari-auth-form="signup">
                            <input type="hidden" name="action" value="nevari_auth_widget_signup" />
                            <input type="hidden" name="nonce" value="<?php echo esc_attr(wp_create_nonce('nevari-auth-widget')); ?>" />
                            <input type="hidden" name="return_url" value="<?php echo esc_attr($return_url); ?>" />
                            <input type="hidden" name="fallback_redirect_path" value="<?php echo esc_attr($settings['fallback_redirect_path']); ?>" />
                            <label class="nevari-auth-widget__field">
                                <span class="nevari-auth-widget__label"><?php echo esc_html($settings['first_name_label']); ?></span>
                                <input class="nevari-auth-widget__input" type="text" name="first_name" required />
                            </label>
                            <label class="nevari-auth-widget__field">
                                <span class="nevari-auth-widget__label"><?php echo esc_html($settings['last_name_label']); ?></span>
                                <input class="nevari-auth-widget__input" type="text" name="last_name" required />
                            </label>
                            <label class="nevari-auth-widget__field">
                                <span class="nevari-auth-widget__label"><?php echo esc_html($settings['signup_email_label']); ?></span>
                                <input class="nevari-auth-widget__input" type="email" name="email" required />
                            </label>
                            <label class="nevari-auth-widget__field">
                                <span class="nevari-auth-widget__label"><?php echo esc_html($settings['signup_password_label']); ?></span>
                                <input class="nevari-auth-widget__input" type="password" name="password" minlength="8" required />
                            </label>
                            <button type="submit" class="nevari-auth-widget__button nevari-auth-widget__button--primary"><?php echo esc_html($settings['signup_button_text']); ?></button>
                        </form>
                        <button type="button" class="nevari-auth-widget__link" data-nevari-auth-view="login"><?php echo esc_html($settings['back_to_login_text']); ?></button>
                    </div>
                <?php endif; ?>

                <?php if ('yes' === $settings['show_verify_state']) : ?>
                    <div class="nevari-auth-widget__state" data-nevari-auth-state="verify" hidden>
                        <h3 class="nevari-auth-widget__heading"><?php echo esc_html($settings['verify_heading']); ?></h3>
                        <p class="nevari-auth-widget__description"><?php echo esc_html($settings['verify_description']); ?></p>
                        <form class="nevari-auth-widget__form" data-nevari-auth-form="verify">
                            <input type="hidden" name="action" value="nevari_auth_widget_verify_code" />
                            <input type="hidden" name="nonce" value="<?php echo esc_attr(wp_create_nonce('nevari-auth-widget')); ?>" />
                            <input type="hidden" name="challenge_id" value="<?php echo esc_attr($challenge_id); ?>" data-nevari-auth-challenge />
                            <input type="hidden" name="frontend_type" value="<?php echo esc_attr($frontend_type); ?>" data-nevari-auth-frontend-type />
                            <input type="hidden" name="sso_transaction_id" value="<?php echo esc_attr($sso_transaction_id); ?>" data-nevari-auth-sso-transaction />
                            <input type="hidden" name="return_url" value="<?php echo esc_attr($return_url); ?>" />
                            <div class="nevari-auth-widget__verify-meta" data-nevari-auth-masked-email><?php echo $masked_email ? esc_html($masked_email) : ''; ?></div>
                            <label class="nevari-auth-widget__field">
                                <span class="nevari-auth-widget__label"><?php echo esc_html($settings['code_label']); ?></span>
                                <input class="nevari-auth-widget__input nevari-auth-widget__input--code" type="text" name="code" inputmode="numeric" maxlength="6" required />
                            </label>
                            <button type="submit" class="nevari-auth-widget__button nevari-auth-widget__button--primary"><?php echo esc_html($settings['verify_button_text']); ?></button>
                        </form>
                        <div class="nevari-auth-widget__inline-actions">
                            <button type="button" class="nevari-auth-widget__link" data-nevari-auth-resend><?php echo esc_html($settings['resend_button_text']); ?></button>
                            <button type="button" class="nevari-auth-widget__link" data-nevari-auth-view="login"><?php echo esc_html($settings['back_to_login_text']); ?></button>
                        </div>
                    </div>
                <?php endif; ?>

                <?php if ('yes' === $settings['show_forgot_password']) : ?>
                    <div class="nevari-auth-widget__state" data-nevari-auth-state="reset" hidden>
                        <h3 class="nevari-auth-widget__heading"><?php echo esc_html($settings['reset_heading']); ?></h3>
                        <p class="nevari-auth-widget__description"><?php echo esc_html($settings['reset_description']); ?></p>
                        <form class="nevari-auth-widget__form" data-nevari-auth-form="reset">
                            <input type="hidden" name="action" value="nevari_auth_widget_reset_password" />
                            <input type="hidden" name="nonce" value="<?php echo esc_attr(wp_create_nonce('nevari-auth-widget')); ?>" />
                            <label class="nevari-auth-widget__field">
                                <span class="nevari-auth-widget__label"><?php echo esc_html($settings['username_label']); ?></span>
                                <input class="nevari-auth-widget__input" type="text" name="username" placeholder="<?php echo esc_attr($settings['username_placeholder']); ?>" required />
                            </label>
                            <button type="submit" class="nevari-auth-widget__button nevari-auth-widget__button--primary"><?php echo esc_html($settings['reset_button_text']); ?></button>
                        </form>
                        <button type="button" class="nevari-auth-widget__link" data-nevari-auth-view="login"><?php echo esc_html($settings['back_to_login_text']); ?></button>
                    </div>
                <?php endif; ?>
            <?php endif; ?>
        </div>
        <?php
    }

    private function logged_in_redirect_url(WP_User $user, array $settings, string $return_url): string {
        $fallback_path = !empty($settings['fallback_redirect_path']) ? (string) $settings['fallback_redirect_path'] : '';
        $safe_return = $this->safe_return_url($return_url);

        if ($safe_return) {
            return $safe_return;
        }

        if ($fallback_path && 0 === strpos($fallback_path, '/')) {
            return home_url($fallback_path);
        }

        if (class_exists('Nevari_SSO') && class_exists('Nevari_Auth')) {
            foreach (array('storefront', 'doctors_dashboard', 'pharmacist_dashboard', 'patient_dashboard') as $frontend_type) {
                if (Nevari_Auth::user_can_access_frontend($user, $frontend_type)) {
                    return add_query_arg(
                        array(
                            'nevari_sso_action' => 'dashboard_launch',
                            'frontend' => $frontend_type,
                        ),
                        home_url('/')
                    );
                }
            }
        }

        return home_url('/');
    }

    private function safe_return_url(string $url): string {
        $url = trim($url);
        if ($url === '') {
            return '';
        }

        $home = wp_parse_url(home_url());
        $target = wp_parse_url($url);
        if (!$target) {
            return '';
        }

        if (empty($target['host'])) {
            return esc_url_raw(home_url('/' . ltrim($url, '/')));
        }

        if (!empty($home['host']) && strtolower((string) $home['host']) === strtolower((string) $target['host'])) {
            return esc_url_raw($url);
        }

        return '';
    }

    private function current_page_url(): string {
        $scheme = is_ssl() ? 'https://' : 'http://';
        $host = !empty($_SERVER['HTTP_HOST']) ? wp_unslash($_SERVER['HTTP_HOST']) : wp_parse_url(home_url(), PHP_URL_HOST);
        $uri = !empty($_SERVER['REQUEST_URI']) ? wp_unslash($_SERVER['REQUEST_URI']) : '/';
        return esc_url_raw($scheme . $host . $uri);
    }

    private function requested_return_url(): string {
        $candidates = array(
            isset($_GET['redirect_to']) ? wp_unslash($_GET['redirect_to']) : '',
            isset($_GET['return_to']) ? wp_unslash($_GET['return_to']) : '',
            isset($_GET['return_url']) ? wp_unslash($_GET['return_url']) : '',
        );

        foreach ($candidates as $candidate) {
            $safe = $this->safe_return_url((string) $candidate);
            if ($safe !== '') {
                return $safe;
            }
        }

        return '';
    }
}
