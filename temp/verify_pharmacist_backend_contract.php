<?php
define('ABSPATH', __DIR__ . '/');

final class Nevari_Auth {
    public static $authenticated = true;
    public static $user_id = 44;
    public static function api_session_required(): bool { return self::$authenticated; }
    public static function api_session_user_id(): int { return self::$user_id; }
}

final class Nevari_Helpers {
    public static $roles = [44 => 'pharmacist', 45 => 'patient', 46 => 'store_admin'];
    public static function is_pharmacist(?int $user_id = null): bool {
        return (self::$roles[$user_id ?? Nevari_Auth::$user_id] ?? '') === 'pharmacist';
    }
    public static function is_store_admin(?int $user_id = null): bool {
        return (self::$roles[$user_id ?? Nevari_Auth::$user_id] ?? '') === 'store_admin';
    }
}

require_once dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-rest.php';
require_once dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-subscriptions.php';

function expect_value($actual, $expected, string $label): void {
    if ($actual !== $expected) {
        fwrite(STDERR, "FAIL {$label}\n");
        exit(1);
    }
}

Nevari_Auth::$authenticated = false;
expect_value(Nevari_Rest::auth_required(), false, 'unauthenticated general REST denial');

Nevari_Auth::$authenticated = true;
Nevari_Auth::$user_id = 44;
expect_value(Nevari_Rest::auth_required(), false, 'pharmacist general REST denial');
expect_value(Nevari_Rest::orders_access_required(), false, 'pharmacist order denial');
expect_value(Nevari_Subscriptions::auth_required(), false, 'pharmacist subscription/payment denial');

Nevari_Auth::$user_id = 45;
expect_value(Nevari_Rest::auth_required(), true, 'patient general REST compatibility');
expect_value(Nevari_Subscriptions::auth_required(), true, 'patient subscription compatibility');

Nevari_Auth::$user_id = 46;
expect_value(Nevari_Rest::auth_required(), true, 'store admin general REST compatibility');

$mtm_source = file_get_contents(dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-mtm.php');
expect_value(strpos($mtm_source, "'/pharmacist/mtm-requests/(?P<id>\\d+)/pharmacy-products'") !== false, true, 'owned MTM product route');
expect_value(strpos($mtm_source, "'permission_callback' => [__CLASS__, 'pharmacist_request_permission']") !== false, true, 'MTM ownership callback');
expect_value(strpos($mtm_source, "MTM product orders are created from the products already attached to this case.") !== false, true, 'linked order body rejection');

$iv_source = file_get_contents(dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-iv-therapy.php');
expect_value(strpos($iv_source, 'assigned_clinician_user_id = %d') !== false, true, 'IV list assignment scope');
expect_value(strpos($iv_source, "find_request_for_staff") !== false, true, 'IV detail assignment scope');

echo "PASS pharmacist backend authorization contract\n";
