<?php
// This file is part of Moodle - http://moodle.org/.

/**
 * Snapshot-scoped Student Risk detail.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../../config.php');

use local_agentpoc\risk\bff_helper;

$courseid = required_param('courseid', PARAM_INT);
$studentid = required_param('studentid', PARAM_INT);
$snapshotid = required_param('snapshotid', PARAM_ALPHANUMEXT);

$course = get_course($courseid);
require_login($course);
$context = context_course::instance($courseid);
require_capability('local/agentpoc:view', $context);
require_capability('moodle/course:view', $context);
bff_helper::require_active_student($context, $studentid);

$student = $DB->get_record('user', ['id' => $studentid, 'deleted' => 0], 'id,firstname,lastname,firstnamephonetic,lastnamephonetic,middlename,alternatename', MUST_EXIST);
$displayname = fullname($student);

$PAGE->set_context($context);
$PAGE->set_course($course);
$PAGE->set_url(new moodle_url('/local/agentpoc/course/student_risk.php', [
    'courseid' => $courseid,
    'studentid' => $studentid,
    'snapshotid' => $snapshotid,
]));
$PAGE->set_pagelayout('incourse');
$PAGE->set_title(get_string('studentriskdetail', 'local_agentpoc') . ': ' . $displayname);
$PAGE->set_heading($course->fullname);
$PAGE->navbar->add(get_string('ailearninginsight', 'local_agentpoc'), new moodle_url('/local/agentpoc/course/risk.php', [
    'id' => $courseid,
    'snapshot_id' => $snapshotid,
]));
$PAGE->navbar->add($displayname);

$showaitesttools = (bool)get_config('local_agentpoc', 'riskaitesttools')
    && has_capability('local/agentpoc:manage', $context)
    && has_capability('moodle/course:manageactivities', $context);

$config = [
    'courseId' => $courseid,
    'studentId' => $studentid,
    'snapshotId' => $snapshotid,
    'showAiTestTools' => $showaitesttools,
    'sesskey' => sesskey(),
    'endpoint' => (new moodle_url('/local/agentpoc/risk_ajax.php'))->out(false),
    'dashboardUrl' => (new moodle_url('/local/agentpoc/course/risk.php', [
        'id' => $courseid,
        'snapshot_id' => $snapshotid,
    ]))->out(false),
];
$PAGE->requires->js_call_amd('local_agentpoc/student_risk_detail', 'init', [$config]);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_agentpoc/student_risk_detail', [
    'studentname' => $displayname,
    'dashboardurl' => $config['dashboardUrl'],
    'showaitesttools' => $showaitesttools,
]);
echo $OUTPUT->footer();
