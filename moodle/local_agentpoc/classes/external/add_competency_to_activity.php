<?php
namespace local_agentpoc\external;

use context_module;
use core_competency\api;
use core_competency\course_module_competency;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use invalid_parameter_exception;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/competency/classes/api.php');
require_once($CFG->dirroot . '/competency/classes/course_module_competency.php');

final class add_competency_to_activity extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'activity_id' => new external_value(PARAM_INT, 'Course module ID'),
            'competency_id' => new external_value(PARAM_INT, 'Native Competency ID'),
            'rule_outcome' => new external_value(PARAM_ALPHA, 'none or evidence'),
        ]);
    }

    public static function execute(int $activity_id, int $competency_id, string $rule_outcome): array {
        global $DB;
        $params = self::validate_parameters(self::execute_parameters(), compact('activity_id', 'competency_id', 'rule_outcome'));
        $context = context_module::instance($params['activity_id']);
        self::validate_context($context);
        require_capability('moodle/competency:coursecompetencymanage', $context);
        $outcome = match ($params['rule_outcome']) {
            'none' => course_module_competency::OUTCOME_NONE,
            'evidence' => course_module_competency::OUTCOME_EVIDENCE,
            default => throw new invalid_parameter_exception('rule_outcome must be none or evidence.'),
        };

        $transaction = $DB->start_delegated_transaction();
        api::add_competency_to_course_module($params['activity_id'], $params['competency_id']);
        $relation = null;
        foreach (api::list_course_module_competencies($params['activity_id']) as $entry) {
            if ((int)$entry['competency']->get('id') === $params['competency_id']) {
                $relation = $entry['coursemodulecompetency'];
                break;
            }
        }
        if (!$relation) {
            throw new invalid_parameter_exception('Moodle did not expose the requested Activity competency relation after linking.');
        }
        if ((int)$relation->get('ruleoutcome') !== $outcome) {
            api::set_course_module_competency_ruleoutcome($relation, $outcome);
            $relation = api::list_course_module_competencies($params['activity_id']);
            foreach ($relation as $entry) {
                if ((int)$entry['competency']->get('id') === $params['competency_id']) {
                    $relation = $entry['coursemodulecompetency'];
                    break;
                }
            }
        }
        $transaction->allow_commit();
        return [
            'link_id' => (int)$relation->get('id'),
            'activity_id' => $params['activity_id'],
            'competency_id' => $params['competency_id'],
            'rule_outcome' => (int)$relation->get('ruleoutcome'),
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'link_id' => new external_value(PARAM_INT, 'Native module competency relation ID'),
            'activity_id' => new external_value(PARAM_INT, 'Course module ID'),
            'competency_id' => new external_value(PARAM_INT, 'Competency ID'),
            'rule_outcome' => new external_value(PARAM_INT, 'Moodle course_module_competency rule outcome'),
        ]);
    }
}
