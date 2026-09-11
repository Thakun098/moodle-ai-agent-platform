<?php
// This file is part of Moodle - http://moodle.org/.

/**
 * AI Learning Insight — Course Risk dashboard.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../../config.php');

$courseid = required_param('id', PARAM_INT);
$snapshotid = optional_param('snapshot_id', '', PARAM_ALPHANUMEXT);
$view = optional_param('view', 'overview', PARAM_ALPHA);

$course = get_course($courseid);
require_login($course);
$context = context_course::instance($courseid);
require_capability('local/agentpoc:view', $context);
require_capability('moodle/course:view', $context);

$PAGE->set_context($context);
$PAGE->set_course($course);
$PAGE->set_url(new moodle_url('/local/agentpoc/course/risk.php', [
    'id' => $courseid,
    'snapshot_id' => $snapshotid !== '' ? $snapshotid : null,
    'view' => $view,
]));
$PAGE->set_pagelayout('incourse');
$PAGE->set_title(get_string('ailearninginsight', 'local_agentpoc'));
$PAGE->set_heading($course->fullname);
$PAGE->navbar->add(get_string('ailearninginsight', 'local_agentpoc'));

$canrefresh = has_capability('local/agentpoc:manage', $context)
    && has_capability('moodle/course:manageactivities', $context);
$showaitesttools = $canrefresh && (bool)get_config('local_agentpoc', 'riskaitesttools');

$config = [
    'courseId' => $courseid,
    'snapshotId' => $snapshotid,
    'initialView' => $view === 'students' ? 'students' : 'overview',
    'canRefresh' => $canrefresh,
    'showAiTestTools' => $showaitesttools,
    'sesskey' => sesskey(),
    'endpoint' => (new moodle_url('/local/agentpoc/risk_ajax.php'))->out(false),
    'studentDetailUrl' => (new moodle_url('/local/agentpoc/course/student_risk.php'))->out(false),
];

$PAGE->requires->js_call_amd('local_agentpoc/risk_dashboard', 'init', [$config]);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_agentpoc/risk_dashboard', [
    'courseid' => $courseid,
    'canrefresh' => $canrefresh,
    'showaitesttools' => $showaitesttools,
    'overviewactive' => $config['initialView'] === 'overview',
    'studentsactive' => $config['initialView'] === 'students',
]);
echo $OUTPUT->footer();
