<?php
// Isolated PHPUnit database acceptance. Never bootstraps or changes the live Moodle site.
if (isset($_SERVER['REMOTE_ADDR'])) {
    die('CLI only');
}
$worker = ($argv[1] ?? '') === '--worker';
if ($worker) {
    // A worker must not reset the shared PHPUnit fixture while another worker is ensuring it.
    define('PHPUNIT_UTIL', true);
}
$publicroot = dirname(__DIR__, 3);
require_once(dirname($publicroot) . '/vendor/autoload.php');
require_once($publicroot . '/lib/phpunit/bootstrap.php');
if ($DB->get_prefix() !== $CFG->phpunit_prefix || $CFG->dataroot !== $CFG->phpunit_dataroot ||
        !\phpunit_util::is_test_site()) {
    throw new \RuntimeException('Refusing to run outside the isolated PHPUnit database.');
}
\advanced_testcase::setAdminUser();
set_config('enabled', 1, 'core_competency');
if ($worker) {
    $result = \local_agentpoc\external\competency_framework_preflight::execute();
    echo json_encode($result, JSON_THROW_ON_ERROR) . PHP_EOL;
    exit($result['status'] === 'ENABLED' ? 0 : 1);
}

try {
    require_once($CFG->dirroot . '/lib/gradelib.php');
    foreach (\grade_scale::fetch_all_global() ?: [] as $existing) {
        $existing->delete();
    }
    $scale = new \grade_scale(null, false);
    $scale->courseid = 0;
    $scale->name = get_string('defaultcompetencescale');
    $scale->scale = 'Not yet competent,Competent';
    $scale->userid = 0;
    $scale->description = '';
    $scale->insert();
    $workers = [];
    for ($i = 0; $i < 6; $i++) {
        $process = proc_open([PHP_BINARY, __FILE__, '--worker'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new \RuntimeException('Could not start test worker.');
        fclose($pipes[0]);
        $workers[] = [$process, $pipes];
    }
    $ids = [];
    foreach ($workers as [$process, $pipes]) {
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        if (proc_close($process) !== 0) throw new \RuntimeException('Worker failed: ' . $stderr . $stdout);
        $result = json_decode(trim($stdout), true, 512, JSON_THROW_ON_ERROR);
        $ids[] = $result['framework_id'];
    }
    $retry = \local_agentpoc\external\competency_framework_preflight::execute();
    $canonical = \core_competency\competency_framework::get_records([
        'idnumber' => \local_agentpoc\external\competency_framework_preflight::DEFAULT_IDNUMBER,
    ]);
    if (count(array_unique($ids)) !== 1 || count($canonical) !== 1 || $retry['framework_id'] !== $ids[0]) {
        throw new \RuntimeException('Concurrent ensure did not reconcile a single canonical identity.');
    }
    echo json_encode(['passed' => true, 'workers' => 6, 'framework_id' => $ids[0], 'canonical_count' => count($canonical),
        'retry_reused' => true, 'database_prefix' => $DB->get_prefix()], JSON_THROW_ON_ERROR) . PHP_EOL;
} finally {
    \phpunit_util::reset_all_data();
}
