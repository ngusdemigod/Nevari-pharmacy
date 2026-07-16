<?php
// Standalone checks for the two PHP bug fixes (logic mirrored from source).

$failures = 0;
function check(string $name, bool $ok, string $detail = ''): void {
    global $failures;
    if (!$ok) $failures++;
    echo ($ok ? 'PASS' : 'FAIL') . " - {$name}" . ($detail !== '' ? " :: {$detail}" : '') . "\n";
}

// --- Fix 6: round_robin_rank (class-nevari-rest.php) ---
function round_robin_rank_fixed(int $last_doctor_id, int $doctor_id, array $group_doctor_ids): int {
    $ids = array_values(array_unique(array_map('intval', $group_doctor_ids)));
    sort($ids);
    if (!$ids) return 0;
    $last_index = array_search($last_doctor_id, $ids, true);
    if ($last_index === false) $last_index = -1;
    $doctor_index = array_search($doctor_id, $ids, true);
    if ($doctor_index === false) return count($ids);
    return ($doctor_index - $last_index - 1 + 2 * count($ids)) % count($ids);
}

$doctors = [101, 102, 103];

// After 101 was assigned, 102 must rank first and 101 last.
$ranks = [];
foreach ($doctors as $d) $ranks[$d] = round_robin_rank_fixed(101, $d, $doctors);
asort($ranks);
check('round-robin: after 101, order is 102,103,101', array_keys($ranks) === [102, 103, 101], json_encode($ranks));

// Simulate 6 consecutive bookings with equal workload: expect full rotation twice.
$last = 0; $sequence = [];
for ($i = 0; $i < 6; $i++) {
    $best = null; $bestRank = PHP_INT_MAX;
    foreach ($doctors as $d) {
        $r = round_robin_rank_fixed($last, $d, $doctors);
        if ($r < $bestRank) { $bestRank = $r; $best = $d; }
    }
    $sequence[] = $best;
    $last = $best;
}
check('round-robin: 6 bookings rotate 101,102,103,101,102,103', $sequence === [101, 102, 103, 101, 102, 103], implode(',', $sequence));

// Wrap-around: after last doctor (103), first doctor (101) is next.
check('round-robin: wraps from 103 back to 101', round_robin_rank_fixed(103, 101, $doctors) === 0);

// No tracker row yet (last_doctor_id = 0): lowest ID wins, no negative ranks.
$r0 = [];
foreach ($doctors as $d) $r0[$d] = round_robin_rank_fixed(0, $d, $doctors);
check('round-robin: empty tracker gives 101 rank 0, none negative', $r0[101] === 0 && min($r0) >= 0, json_encode($r0));

// --- Fix 4a: sanitize_deep key handling (class-nevari-nurse-requests.php) ---
function sanitize_text_field_stub($value) { return trim((string) $value); }
function sanitize_deep_fixed($value) {
    if (is_array($value)) {
        $result = [];
        foreach ($value as $key => $item) {
            $safe_key = preg_replace('/[^A-Za-z0-9_\-]/', '', (string) $key);
            if ($safe_key === '') continue;
            $result[$safe_key] = sanitize_deep_fixed($item);
        }
        return $result;
    }
    return sanitize_text_field_stub($value);
}

$care = sanitize_deep_fixed([
    'preferredDate' => '2026-07-24',
    'preferredTime' => '12:00',
    'visitType' => 'One Time',
    'careShift' => 'Day',
    'bad key<script>' => 'x',
]);
check('sanitize_deep: preferredDate key preserved', isset($care['preferredDate']) && $care['preferredDate'] === '2026-07-24', json_encode(array_keys($care)));
check('sanitize_deep: preferredTime key preserved', isset($care['preferredTime']));
check('sanitize_deep: camelCase keys not lowercased', isset($care['visitType'], $care['careShift']));
check('sanitize_deep: hostile key characters stripped', isset($care['badkeyscript']) && !isset($care['bad key<script>']));
check('sanitize_deep: empty($care["preferredDate"]) now false', !empty($care['preferredDate']));

exit($failures > 0 ? 1 : 0);
