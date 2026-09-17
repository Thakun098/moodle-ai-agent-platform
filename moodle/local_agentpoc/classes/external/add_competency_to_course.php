<?php
namespace local_agentpoc\external;

use context_course;
use core_competency\api;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/competency/classes/api.php');

final class add_competency_to_course extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'course_id' => new external_value(PARAM_INT, 'Course ID'),
            'competency_id' => new external_value(PARAM_INT, 'Native Competency ID'),
        ]);
    }

    public static function execute(int $course_id, int $competency_id): array {
        $params = self::validate_parameters(self::execute_parameters(), compact('course_id', 'competency_id'));
        $context = context_course::instance($params['course_id']);
        self::validate_context($context);
        require_capability('moodle/competency:coursecompetencymanage', $context);
        api::read_competency($params['competency_id']);
        api::add_competency_to_course($params['course_id'], $params['competency_id']);
        $linked = false;
        foreach (api::list_course_competencies($params['course_id']) as $entry) {
            if ((int)$entry['competency']->get('id') === $params['competency_id']) {
                $linked = true;
                break;
            }
        }
        return ['course_id' => $params['course_id'], 'competency_id' => $params['competency_id'], 'linked' => $linked];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'course_id' => new external_value(PARAM_INT, 'Course ID'),
            'competency_id' => new external_value(PARAM_INT, 'Competency ID'),
            'linked' => new external_value(PARAM_BOOL, 'True when the Competency belongs to the Course'),
        ]);
    }
}
