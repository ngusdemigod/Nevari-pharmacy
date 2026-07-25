<?php
define('ABSPATH', __DIR__ . '/');
define('MINUTE_IN_SECONDS', 60);
function wp_timezone_string() { return 'Africa/Lagos'; }
final class Nevari_Helpers { public static function now(): string { return gmdate('Y-m-d H:i:s'); } }
require dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-mtm.php';

$method = new ReflectionMethod('Nevari_Mtm', 'slot_hold_expiry');
$method->setAccessible(true);
$hold = $method->invoke(null);
$local = (new DateTimeImmutable($hold['mysql'], new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Africa/Lagos'));
if ($local->format('H:i:s') !== '23:59:59') {
    throw new RuntimeException('Hold does not expire at store-day end.');
}
if ((int)$hold['timestamp'] <= time()) {
    throw new RuntimeException('Hold expiry is not in the future.');
}
echo "mtm-hold-contract-ok\n";
