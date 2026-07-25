<?php
define('ABSPATH', __DIR__ . '/');

function absint($value) { return abs((int) $value); }

final class Nevari_Helpers {
    public static function table(string $suffix): string { return 'wp_nevari_' . $suffix; }
}

final class FakeWpdb {
    public function prepare($query, $args = []) { return $query; }
    public function get_results($query): array {
        return [
            (object) ['assigned_pharmacist_user_id' => 1, 'last_assigned_at' => '2026-07-20 09:00:00'],
            (object) ['assigned_pharmacist_user_id' => 2, 'last_assigned_at' => '2026-07-21 09:00:00'],
        ];
    }
}

$GLOBALS['wpdb'] = new FakeWpdb();
require dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-mtm.php';

$method = new ReflectionMethod('Nevari_Mtm', 'round_robin_pharmacist_ids');
$method->setAccessible(true);
$ordered = $method->invoke(null, [2, 3, 1, 2]);
if ($ordered !== [3, 1, 2]) {
    throw new RuntimeException('Least-recently-assigned ordering or stable tie handling failed.');
}

$source = file_get_contents(dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-mtm.php');
foreach ([
    "array_diff(array_keys(\$body), ['start_at','timezone'])",
    "assigned_pharmacist_user_id'=>\$pharmacist_id",
    "Nevari_User_Governance::can_authenticate",
    "slot_has_conflict(\$candidate_id",
] as $required) {
    if (strpos($source, $required) === false) {
        throw new RuntimeException('Missing MTM assignment guard: ' . $required);
    }
}

echo "mtm-round-robin-contract-ok\n";
