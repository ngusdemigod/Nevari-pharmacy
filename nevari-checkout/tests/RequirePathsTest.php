<?php

use PHPUnit\Framework\TestCase;

final class RequirePathsTest extends TestCase {
    public function test_module_relative_require_paths_exist() {
        $module_path = NEVARI_CHECKOUT_TEST_ROOT . '/includes/elementor/class-commerce-module.php';
        $source = file_get_contents($module_path);
        preg_match_all("/require_once __DIR__ \. '\/([^']+)';/", $source, $matches);

        $this->assertNotEmpty($matches[1], 'No module require paths were detected.');
        foreach ($matches[1] as $relative_path) {
            $this->assertFileExists(dirname($module_path) . '/' . $relative_path);
        }
        foreach (array(
            'class-woocommerce-adapter.php',
            'class-commerce-renderer.php',
            'class-ajax-controller.php',
            'class-checkout-service.php',
            'class-nevari-checkout-adapter.php',
        ) as $dependency) {
            $this->assertFileExists(dirname($module_path) . '/' . $dependency);
        }
    }
}
