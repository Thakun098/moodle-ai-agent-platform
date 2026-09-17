<?php
namespace local_agentpoc\external;

use core_competency\api;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use invalid_parameter_exception;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/competency/classes/api.php');

final class create_competency extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'framework_id' => new external_value(PARAM_INT, 'Existing visible Competency Framework ID'),
            'idnumber' => new external_value(PARAM_RAW, 'Stable planning-derived competency idnumber'),
            'shortname' => new external_value(PARAM_TEXT, 'Competency shortname'),
            'description' => new external_value(PARAM_RAW, 'Competency description', VALUE_DEFAULT, ''),
        ]);
    }

    public static function execute(int $framework_id, string $idnumber, string $shortname, string $description = ''): array {
        $params = self::validate_parameters(self::execute_parameters(), compact('framework_id', 'idnumber', 'shortname', 'description'));
        $framework = api::read_framework($params['framework_id']);
        $context = $framework->get_context();
        self::validate_context($context);
        require_capability('moodle/competency:competencymanage', $context);
        if (!$framework->get('visible')) {
            throw new invalid_parameter_exception('The configured Competency Framework must be visible.');
        }
        $idnumber = trim($params['idnumber']);
        $shortname = trim($params['shortname']);
        if ($idnumber === '' || $shortname === '') {
            throw new invalid_parameter_exception('Competency idnumber and shortname are required.');
        }

        foreach (api::search_competencies('', $params['framework_id']) as $existing) {
            if ((string)$existing->get('idnumber') !== $idnumber) continue;
            if ((string)$existing->get('shortname') !== $shortname || (string)$existing->get('description') !== $params['description']) {
                throw new invalid_parameter_exception('Existing Competency idnumber conflicts with the approved definition.');
            }
            return [
                'competency_id' => (int)$existing->get('id'),
                'framework_id' => (int)$existing->get('competencyframeworkid'),
                'idnumber' => (string)$existing->get('idnumber'),
                'shortname' => (string)$existing->get('shortname'),
                'created' => false,
            ];
        }

        $created = api::create_competency((object)[
            'shortname' => $shortname,
            'idnumber' => $idnumber,
            'description' => $params['description'],
            'descriptionformat' => FORMAT_HTML,
            'competencyframeworkid' => $params['framework_id'],
            'parentid' => 0,
            'ruleoutcome' => 0,
        ]);
        return [
            'competency_id' => (int)$created->get('id'),
            'framework_id' => (int)$created->get('competencyframeworkid'),
            'idnumber' => (string)$created->get('idnumber'),
            'shortname' => (string)$created->get('shortname'),
            'created' => true,
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'competency_id' => new external_value(PARAM_INT, 'Native Moodle Competency ID'),
            'framework_id' => new external_value(PARAM_INT, 'Framework ID'),
            'idnumber' => new external_value(PARAM_RAW, 'Competency idnumber'),
            'shortname' => new external_value(PARAM_TEXT, 'Competency shortname'),
            'created' => new external_value(PARAM_BOOL, 'True when created; false when reconciled to existing exact definition'),
        ]);
    }
}
