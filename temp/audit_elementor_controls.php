<?php
$files = glob(__DIR__ . '/../nevari-checkout/includes/elementor/widgets/*.php');
foreach ($files as $file) {
    $source = file_get_contents($file);
    preg_match_all('/->add_(?:responsive_)?control\(\s*[\'\"]([^\'\"]+)[\'\"]/', $source, $matches);
    $counts = array_count_values($matches[1]);
    $dupes = array();
    foreach ($counts as $id => $count) {
        if ($count > 1) {
            $dupes[$id] = $count;
        }
    }
    echo basename($file) . ': ' . count($matches[1]) . ' controls';
    echo $dupes ? ' DUPLICATES=' . json_encode($dupes) : ' duplicate-controls=none';
    echo PHP_EOL;
}
