<?php
define('ABSPATH', __DIR__ . '/');
function register_activation_hook() {}
function add_action() {}
require dirname(__DIR__) . '/nevari-checkout/nevari-checkout.php';
echo 'bootstrap-ok' . PHP_EOL;
