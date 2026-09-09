<?php
define('ABSPATH', dirname(__DIR__) . '/');
require_once dirname(__DIR__) . '/includes/class-nevari-helpers.php';

$cases = [
    ['2026-09-10T09:00:00', 'Africa/Lagos', '2026-09-10 08:00:00'],
    ['2026-09-10T08:00:00Z', 'Africa/Lagos', '2026-09-10 08:00:00'],
    ['2026-09-10T09:00:00+01:00', 'UTC', '2026-09-10 08:00:00'],
];

foreach ($cases as [$input, $timezone, $expected]) {
    $actual = Nevari_Helpers::normalize_appointment_datetime($input, $timezone);
    if ($actual !== $expected) {
        fwrite(STDERR, "Expected {$expected}, received {$actual}.\n");
        exit(1);
    }
}

echo "Appointment datetime tests passed.\n";
