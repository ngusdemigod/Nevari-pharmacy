<?php

use PHPUnit\Framework\TestCase;

final class CommerceStaticContractsTest extends TestCase {
    private function source($relative) {
        return file_get_contents(NEVARI_CHECKOUT_TEST_ROOT . '/' . $relative);
    }

    public function test_widgets_have_stable_slugs_and_category() {
        $base = $this->source('includes/elementor/widgets/class-commerce-widget-base.php');
        $this->assertStringContainsString("return array('nevari-checkout')", $base);
        foreach (array('nevari-cart', 'nevari-checkout', 'nevari-order-progress') as $slug) {
            $this->assertStringContainsString("return '" . $slug . "'", $this->source('includes/elementor/widgets/class-' . str_replace('nevari-', '', $slug) . '-widget.php'));
        }
    }

    public function test_runtime_starts_at_init_and_legacy_adapter_loader_exists() {
        $bootstrap = $this->source('nevari-checkout.php');
        $this->assertStringContainsString('add_action(' . chr(39) . 'init' . chr(39), $bootstrap);
        $this->assertStringNotContainsString('add_action(' . chr(39) . 'plugins_loaded' . chr(39), $bootstrap);
        $this->assertFileExists(NEVARI_CHECKOUT_TEST_ROOT . '/includes/elementor/class-nevari-checkout-adapter.php');
    }

    public function test_order_access_is_not_numeric_id_only() {
        $adapter = $this->source('includes/elementor/class-woocommerce-adapter.php');
        $this->assertStringContainsString('get_current_user_id() === $customer_id', $adapter);
        $this->assertStringContainsString('hash_equals((string) $order->get_order_key()', $adapter);
        $this->assertStringContainsString('hash_hmac', $adapter);
    }

    public function test_woocommerce_shipping_zone_uses_global_namespace() {
        $adapter = $this->source('includes/elementor/class-woocommerce-adapter.php');
        $this->assertStringContainsString(chr(92) . 'WC_Shipping_Zones::get_zone_matching_package', $adapter);
    }

    public function test_mutations_require_post_and_nonces() {
        $ajax = $this->source('includes/elementor/class-ajax-controller.php');
        $this->assertStringContainsString("'POST' !== strtoupper", $ajax);
        foreach (array('nevari-update-cart', 'nevari-checkout-coupon', 'nevari-order-progress', 'nevari-cart-total') as $nonce) {
            $this->assertStringContainsString($nonce, $ajax);
        }
    }

    public function test_checkout_does_not_collect_raw_card_fields() {
        $renderer = strtolower($this->source('includes/elementor/class-commerce-renderer.php'));
        $this->assertStringNotContainsString('card_number', $renderer);
        $this->assertStringNotContainsString('cvv', $renderer);
        $this->assertStringNotContainsString('expiry', $renderer);
    }

    public function test_native_woocommerce_checkout_contract_is_preserved() {
        $renderer = $this->source('includes/elementor/class-commerce-renderer.php');
        $service = $this->source('includes/elementor/class-checkout-service.php');
        $this->assertStringContainsString('woocommerce-process_checkout', $renderer);
        $this->assertStringContainsString('woocommerce_checkout_place_order', $renderer);
        $this->assertStringContainsString('woocommerce_checkout_process', $service);
        $this->assertStringContainsString('woocommerce_create_order', $service);
    }

    public function test_success_redirect_and_tip_configuration_are_validated() {
        $service = $this->source('includes/elementor/class-checkout-service.php');
        $this->assertStringContainsString("'publish' !== get_post_status", $service);
        $this->assertStringContainsString('wp_validate_redirect', $service);
        $this->assertStringContainsString("hash_hmac('sha256', " . '$json', $service);
        $this->assertStringContainsString('hash_equals', $service);
    }
}
