<?php

declare(strict_types=1);

$rest_file = dirname(__DIR__) . '/nevari-pharmacy-core/includes/class-nevari-rest.php';
$source = file_get_contents($rest_file);

if ($source === false) {
    fwrite(STDERR, "Could not read class-nevari-rest.php.\n");
    exit(1);
}

$contracts = [
    'manual customer details are required for guest orders' => "Customer name, email, and phone are required for a manual order.",
    'doctor orders require a customer id' => "customer_id is required for doctor-created orders.",
    'doctor orders enforce the care relationship' => "doctor_patient_link_exists(\$doctor_id, \$customer_id)",
    'delivery method has a closed allowlist' => "\$allowed_delivery_methods = ['', 'pickup', 'local_delivery', 'shipping'];",
    'delivery and shipping require an address' => "A delivery address is required for this delivery method.",
    'duplicate product quantities are combined before stock validation' => "\$combined_items[\$product_id]['quantity'] += (int) \$item['quantity'];",
    'out-of-stock products are rejected' => "product_out_of_stock",
    'managed stock quantity is checked' => "insufficient_stock",
    'fulfilment note uses the WooCommerce customer note' => "set_customer_note(sanitize_textarea_field",
    'delivery method is persisted' => "update_meta_data('_nevari_delivery_method'",
    'delivery method is returned by the formatter' => "'delivery_method' => sanitize_key((string) \$order->get_meta('_nevari_delivery_method'))",
    'media request fields are allowlisted' => "\$allowed_keys = ['filename', 'mime_type', 'data_base64'];",
    'media is capped at ten megabytes' => "strlen(\$bytes) > 10 * 1024 * 1024",
    'malformed base64 is rejected' => "base64_decode(\$data_base64, true)",
    'decoded image bytes are inspected' => "getimagesizefromstring(\$bytes)",
    'declared and actual image MIME must match' => "hash_equals(\$mime_type, (string) \$image_info['mime'])",
];

$failures = [];
foreach ($contracts as $label => $needle) {
    if (strpos($source, $needle) === false) {
        $failures[] = $label;
    }
}

$validation_position = strpos($source, '$validated_items = [];');
$order_position = strpos($source, '$order = wc_create_order([');
if ($validation_position === false || $order_position === false || $validation_position >= $order_position) {
    $failures[] = 'all product validation happens before WooCommerce order creation';
}

$upload_position = strpos($source, '$upload = wp_upload_bits(');
$image_validation_position = strpos($source, 'getimagesizefromstring($bytes)');
if ($upload_position === false || $image_validation_position === false || $image_validation_position >= $upload_position) {
    $failures[] = 'image validation happens before permanent storage';
}

if ($failures) {
    fwrite(STDERR, "Creation API contract failures:\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo "Creation API contracts verified (" . count($contracts) . " assertions plus ordering checks).\n";
