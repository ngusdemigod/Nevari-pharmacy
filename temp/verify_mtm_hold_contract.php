<?php
define('ABSPATH', __DIR__ . '/');
define('MINUTE_IN_SECONDS', 60);
function wp_timezone_string() { return 'Africa/Lagos'; }
final class Nevari_Helpers { public static function now(): string { return gmdate('Y-m-d H:i:s'); } }
require dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-mtm.php';

$method = new ReflectionMethod('Nevari_Mtm', 'slot_hold_expiry');
$method->setAccessible(true);
$started_at = time();
$hold = $method->invoke(null);
$elapsed = (int) $hold['timestamp'] - $started_at;
if ($elapsed < (5 * MINUTE_IN_SECONDS) || $elapsed > (5 * MINUTE_IN_SECONDS) + 1) {
    throw new RuntimeException(sprintf('Hold must expire after 5 minutes; got %d seconds.', $elapsed));
}
if ($hold['mysql'] !== gmdate('Y-m-d H:i:s', (int) $hold['timestamp'])) {
    throw new RuntimeException('Hold timestamp and stored UTC expiry do not match.');
}
echo "mtm-hold-contract-ok\n";
