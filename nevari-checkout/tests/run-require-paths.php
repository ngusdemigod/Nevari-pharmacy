<?php

$plugin_root = dirname(__DIR__);
$module_path = $plugin_root . '/includes/elementor/class-commerce-module.php';
$source = file_get_contents($module_path);

if (false === $source) {
    fwrite(STDERR, "Could not read commerce module.\n");
    exit(1);
}

preg_match_all("/require_once __DIR__ \. '\/([^']+)';/", $source, $matches);
if (empty($matches[1])) {
    fwrite(STDERR, "No module require paths detected.\n");
    exit(1);
}

foreach ($matches[1] as $relative_path) {
    $required_path = dirname($module_path) . '/' . $relative_path;
    if (!is_file($required_path)) {
        fwrite(STDERR, "Missing required file: {$relative_path}\n");
        exit(1);
    }
}

foreach (array(
    'class-woocommerce-adapter.php',
    'class-commerce-renderer.php',
    'class-ajax-controller.php',
    'class-checkout-service.php',
    'class-nevari-checkout-adapter.php',
) as $dependency) {
    if (!is_file(dirname($module_path) . '/' . $dependency)) {
        fwrite(STDERR, 'Missing module dependency: ' . $dependency . PHP_EOL);
        exit(1);
    }
}

fwrite(STDOUT, "All module require paths exist.\n");
