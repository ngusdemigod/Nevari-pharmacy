<?php
define('ABSPATH', __DIR__ . '/');
$activation = null;
function register_activation_hook($file, $callback) { global $activation; $activation = $callback; }
function add_action() {}
function add_filter() {}
function add_shortcode() {}
function plugin_dir_path($file) { return dirname($file) . '/'; }
function plugin_dir_url($file) { return 'https://example.test/wp-content/plugins/nevari-checkout/'; }
function flush_rewrite_rules() {}
require dirname(__DIR__) . '/nevari-checkout/nevari-checkout.php';
if (!is_callable($activation)) { throw new RuntimeException('Activation callback was not registered.'); }
call_user_func($activation);
echo 'activation-hook-smoke-ok' . PHP_EOL;
