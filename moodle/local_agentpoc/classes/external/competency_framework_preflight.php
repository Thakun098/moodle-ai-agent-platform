<?php
namespace local_agentpoc\external;

use context_system;
use core_competency\api;
use core_competency\competency_framework;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();
require_once($CFG->dirroot . '/lib/gradelib.php');

/** Deterministic infrastructure readiness; never creates Course Competencies. */
final class competency_framework_preflight extends external_api {
    const DEFAULT_IDNUMBER = 'LOCAL_AGENTPOC_DEFAULT_COMPETENCY_FRAMEWORK';

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'configured_framework_id' => new external_value(PARAM_INT, 'Exact selected framework, zero when unset', VALUE_DEFAULT, 0),
            'provision_default' => new external_value(PARAM_BOOL, 'Allow infrastructure bootstrap', VALUE_DEFAULT, true),
        ]);
    }

    private static function result(string $status, string $reason, string $message, ?competency_framework $framework = null): array {
        $signature = null;
        if ($framework) {
            $authority = [];
            foreach (['id', 'shortname', 'idnumber', 'visible', 'scaleid', 'scaleconfiguration', 'contextid', 'taxonomies'] as $key) {
                $authority[$key] = $framework->get($key);
            }
            $scale = \grade_scale::fetch(['id' => $framework->get('scaleid')]);
            $authority['scale'] = $scale ? [$scale->id, $scale->name, $scale->scale, $scale->courseid] : null;
            $signature = hash('sha256', json_encode($authority, JSON_THROW_ON_ERROR));
        }
        return ['status' => $status, 'reason' => $reason, 'framework_id' => $framework ? (int)$framework->get('id') : null,
            'framework_signature' => $signature, 'message' => $message];
    }

    private static function validate_framework(competency_framework $framework, string $reason): array {
        if (!$framework->get('visible')) {
            return self::result('CHECK_FAILED', 'FRAMEWORK_HIDDEN', 'Ask a Moodle administrator to review the hidden Framework, then Retry.');
        }
        require_capability('moodle/competency:competencymanage', $framework->get_context());
        if (!$framework->is_valid() || !\grade_scale::fetch(['id' => $framework->get('scaleid')])) {
            return self::result('CHECK_FAILED', 'FRAMEWORK_INVALID', 'Ask a Moodle administrator to repair Framework configuration, then Retry.');
        }
        return self::result('ENABLED', $reason, 'Competencies are available for this Course.', $framework);
    }

    public static function execute(int $configured_framework_id = 0, bool $provision_default = true): array {
        $params = self::validate_parameters(self::execute_parameters(), compact('configured_framework_id', 'provision_default'));
        if ($params['configured_framework_id'] < 0) {
            throw new \invalid_parameter_exception('Framework ID must be positive or zero when unset.');
        }
        $context = context_system::instance();
        self::validate_context($context);
        require_capability('local/agentpoc:manage', $context);
        api::require_enabled();
        // Exact selections are never replaced or bootstrapped during revalidation.
        if ($params['configured_framework_id']) {
            return self::validate_framework(api::read_framework($params['configured_framework_id']), 'CONFIGURED_FRAMEWORK');
        }
        require_capability('moodle/competency:competencymanage', $context);
        $factory = \core\lock\lock_config::get_lock_factory('local_agentpoc');
        $lock = $factory->get_lock('default_competency_framework', 10);
        if (!$lock) {
            return self::result('CHECK_FAILED', 'LOCK_UNAVAILABLE', 'Framework readiness is busy. Retry.');
        }
        try {
            // Read canonical identity including hidden records, using the official persistent API.
            $canonical = competency_framework::get_records(['idnumber' => self::DEFAULT_IDNUMBER]);
            if (count($canonical) > 1) {
                return self::result('CHECK_FAILED', 'CANONICAL_IDENTITY_AMBIGUOUS', 'Ask an administrator to reconcile duplicate canonical Frameworks.');
            }
            if ($canonical) {
                $framework = reset($canonical);
                if ((int)$framework->get('contextid') !== (int)$context->id) {
                    return self::result('CHECK_FAILED', 'CANONICAL_CONTEXT_INVALID', 'The canonical Framework must belong to the system context.');
                }
                return self::validate_framework(api::read_framework($framework->get('id')), 'CANONICAL_FRAMEWORK');
            }
            $frameworks = api::list_frameworks('id', 'ASC', 0, 0, $context, 'children', false);
            // API list filters inaccessible contexts. Never mistake a partial list for site-wide absence.
            if (count($frameworks) !== competency_framework::count_records()) {
                return self::result('CHECK_FAILED', 'FRAMEWORK_SCOPE_INCOMPLETE', 'Ask an administrator to grant Framework visibility across the site, then Retry.');
            }
            foreach ($frameworks as $framework) {
                if ($framework->get('visible')) {
                    return self::result('SELECTION_REQUIRED', 'FRAMEWORK_SELECTION_REQUIRED', 'Select a Framework or skip Competencies for this Course.');
                }
            }
            if (!$params['provision_default']) {
                return self::result('CHECK_FAILED', 'FRAMEWORK_ABSENT', 'Framework readiness must be resolved again before approval.');
            }
            $scales = array_filter(\grade_scale::fetch_all_global() ?: [], static function($scale) {
                // The installed core scale is localized at creation; recognize current and English core names.
                $names = [get_string('defaultcompetencescale'), get_string_manager()->get_string('defaultcompetencescale', 'moodle', null, 'en')];
                return in_array($scale->name, $names, true) && count($scale->load_items()) === 2;
            });
            if (count($scales) !== 1) {
                return self::result('BYPASSED', 'DEFAULT_SCALE_UNAVAILABLE', 'Competencies skipped because the Moodle Default competence scale is unavailable or ambiguous.');
            }
            $scale = reset($scales);
            $configuration = json_encode([['scaleid' => (int)$scale->id],
                ['id' => 1, 'scaledefault' => true, 'proficient' => false],
                ['id' => 2, 'scaledefault' => false, 'proficient' => true]], JSON_THROW_ON_ERROR);
            $framework = api::create_framework((object)[
                'shortname' => 'Teacher AI Assistance 2 - Default Competencies', 'idnumber' => self::DEFAULT_IDNUMBER,
                'description' => '', 'descriptionformat' => FORMAT_HTML, 'contextid' => $context->id, 'visible' => 1,
                'scaleid' => (int)$scale->id, 'scaleconfiguration' => $configuration,
                'taxonomies' => (string)competency_framework::TAXONOMY_COMPETENCY,
            ]);
            return self::validate_framework($framework, 'DEFAULT_FRAMEWORK_PROVISIONED');
        } finally {
            $lock->release();
        }
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'status' => new external_value(PARAM_ALPHAEXT, 'Readiness status'),
            'reason' => new external_value(PARAM_ALPHAEXT, 'Deterministic reason'),
            'framework_id' => new external_value(PARAM_INT, 'Validated framework', VALUE_REQUIRED, null, NULL_ALLOWED),
            'framework_signature' => new external_value(PARAM_RAW, 'Framework authority signature', VALUE_REQUIRED, null, NULL_ALLOWED),
            'message' => new external_value(PARAM_TEXT, 'Actionable readiness guidance'),
        ]);
    }
}
