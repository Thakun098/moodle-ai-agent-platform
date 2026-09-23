<?php
namespace local_agentpoc\external;

use context_course;
use core_competency\api;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/competency/classes/api.php');

final class get_course_competencies extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'course_id' => new external_value(PARAM_INT, 'Course ID'),
        ]);
    }

    public static function execute(int $course_id): array {
        $params = self::validate_parameters(self::execute_parameters(), compact('course_id'));
        $context = context_course::instance($params['course_id']);
        self::validate_context($context);
        if (!has_any_capability(['moodle/competency:coursecompetencyview', 'moodle/competency:coursecompetencymanage'], $context)) {
            require_capability('moodle/competency:coursecompetencyview', $context);
        }

        $competencies = [];
        foreach (api::list_course_competencies($params['course_id']) as $entry) {
            $competency = $entry['competency'];
            $coursecomp = $entry['coursecompetency'];
            $competencies[] = [
                'course_link_id' => (int)$coursecomp->get('id'),
                'competency_id' => (int)$competency->get('id'),
                'framework_id' => (int)$competency->get('competencyframeworkid'),
                'idnumber' => (string)$competency->get('idnumber'),
                'shortname' => (string)$competency->get('shortname'),
                'description' => (string)$competency->get('description'),
            ];
        }

        $links = [];
        $modinfo = get_fast_modinfo($params['course_id']);
        foreach ($modinfo->get_cms() as $cm) {
            foreach (api::list_course_module_competencies($cm) as $entry) {
                $competency = $entry['competency'];
                $relation = $entry['coursemodulecompetency'];
                $links[] = [
                    'link_id' => (int)$relation->get('id'),
                    'activity_id' => (int)$cm->id,
                    'competency_id' => (int)$competency->get('id'),
                    'rule_outcome' => (int)$relation->get('ruleoutcome'),
                ];
            }
        }
        return ['course_id' => $params['course_id'], 'course_competencies' => $competencies, 'activity_links' => $links];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'course_id' => new external_value(PARAM_INT, 'Course ID'),
            'course_competencies' => new external_multiple_structure(new external_single_structure([
                'course_link_id' => new external_value(PARAM_INT, 'Course competency relation ID'),
                'competency_id' => new external_value(PARAM_INT, 'Competency ID'),
                'framework_id' => new external_value(PARAM_INT, 'Framework ID'),
                'idnumber' => new external_value(PARAM_RAW, 'Competency idnumber'),
                'shortname' => new external_value(PARAM_TEXT, 'Competency shortname'),
                'description' => new external_value(PARAM_RAW, 'Competency description'),
            ])),
            'activity_links' => new external_multiple_structure(new external_single_structure([
                'link_id' => new external_value(PARAM_INT, 'Activity competency relation ID'),
                'activity_id' => new external_value(PARAM_INT, 'Course module ID'),
                'competency_id' => new external_value(PARAM_INT, 'Competency ID'),
                'rule_outcome' => new external_value(PARAM_INT, 'Moodle rule outcome'),
            ])),
        ]);
    }
}
