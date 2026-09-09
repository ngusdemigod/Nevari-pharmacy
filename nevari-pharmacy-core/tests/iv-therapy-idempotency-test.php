<?php

$source = file_get_contents(dirname(__DIR__) . '/includes/class-nevari-iv-therapy.php');

$expectations = [
    "get_header('Idempotency-Key')" => 'reads the idempotency key from a request header',
    "add_option(\$idempotency_option" => 'uses an atomic unique option lock',
    "'resource_id' => \$resource_id" => 'stores only the created record identifier for replay',
    "'idempotent_replay' => true" => 'marks a replayed response',
    "delete_option(\$idempotency_option)" => 'releases the lock after a failed insert',
    "AND customer_user_id = %d" => 'rechecks patient ownership when replaying a result',
];

foreach ($expectations as $needle => $description) {
    if (strpos($source, $needle) === false) {
        fwrite(STDERR, "Missing idempotency guarantee: {$description}.\n");
        exit(1);
    }
}

echo "IV therapy idempotency contract tests passed.\n";
