<?php
namespace local_agentpoc\external;

use context_system;
use core_competency\api;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/competency/classes/api.php');

final class list_competency_frameworks extends external_api {
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([]);
    }

    public static function execute(): array {
        $context = context_system::instance();
        self::validate_context($context);
        $frameworks = api::list_frameworks('shortname', 'ASC', 0, 0, $context, 'children', true);
        $out = [];
        foreach ($frameworks as $framework) {
            $frameworkcontext = $framework->get_context();
            $out[] = [
                'framework_id' => (int)$framework->get('id'),
                'shortname' => (string)$framework->get('shortname'),
                'idnumber' => (string)$framework->get('idnumber'),
                'visible' => (bool)$framework->get('visible'),
                'can_manage' => has_capability('moodle/competency:competencymanage', $frameworkcontext),
            ];
        }
        return $out;
    }

    public static function execute_returns(): external_multiple_structure {
        return new external_multiple_structure(new external_single_structure([
            'framework_id' => new external_value(PARAM_INT, 'Framework ID'),
            'shortname' => new external_value(PARAM_TEXT, 'Framework shortname'),
            'idnumber' => new external_value(PARAM_RAW, 'Framework idnumber'),
            'visible' => new external_value(PARAM_BOOL, 'Framework visible'),
            'can_manage' => new external_value(PARAM_BOOL, 'Caller can manage framework'),
        ]));
    }
}
