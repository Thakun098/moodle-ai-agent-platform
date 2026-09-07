<?php
define('CLI_SCRIPT', true);

require(__DIR__ . '/../../../../config.php');
require_once($CFG->libdir . '/externallib.php');

$admin = $DB->get_record('user', ['username' => 'admin'], '*', MUST_EXIST);
$service = $DB->get_record('external_services', ['shortname' => 'local_agentpoc_service'], '*', MUST_EXIST);

// Check if token already exists
$tokenrec = $DB->get_record('external_tokens', [
    'userid' => $admin->id,
    'externalserviceid' => $service->id,
    'tokentype' => EXTERNAL_TOKEN_PERMANENT,
]);

if ($tokenrec) {
    echo $tokenrec->token . "\n";
    exit(0);
}

$token = external_generate_token(EXTERNAL_TOKEN_PERMANENT, $service, $admin->id, context_system::instance());
echo $token . "\n";
