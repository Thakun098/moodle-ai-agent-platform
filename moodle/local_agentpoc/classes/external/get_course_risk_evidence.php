<?php
namespace local_agentpoc\external;

use context_course;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use local_agentpoc\risk\course_risk_evidence_assembler;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->libdir . '/completionlib.php');
require_once($CFG->dirroot . '/mod/assign/locallib.php');

final class get_course_risk_evidence extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'course_id' => new external_value(PARAM_INT, 'Course ID to inspect', VALUE_REQUIRED),
        ]);
    }

    public static function execute(int $course_id): array {
        global $DB;
        $params = self::validate_parameters(self::execute_parameters(), ['course_id' => $course_id]);
        $course = $DB->get_record('course', ['id' => $params['course_id']], '*', MUST_EXIST);
        $context = context_course::instance((int) $course->id);
        self::validate_context($context);
        require_capability('local/agentpoc:view', $context);
        require_capability('moodle/course:view', $context);

        $payload = course_risk_evidence_assembler::assemble($course);
        return [
            'schema_version' => '0.1',
            'observed_at' => (int) $payload['observed_at'],
            'payload_json' => json_encode(
                $payload,
                JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            ),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'schema_version' => new external_value(PARAM_TEXT, 'CourseRiskEvidence contract version'),
            'observed_at' => new external_value(PARAM_INT, 'Unix timestamp when factual readback started'),
            'payload_json' => new external_value(PARAM_RAW, 'CourseRiskEvidence v0.1 JSON payload'),
        ]);
    }
}
