<?php
// This file is part of Moodle - http://moodle.org/

namespace local_agentpoc\external;

use context_course;
use context_user;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use local_agentpoc\helper;
use moodle_exception;
use stdClass;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/modlib.php');
require_once($CFG->dirroot . '/mod/resource/lib.php');
require_once($CFG->dirroot . '/mod/resource/locallib.php');
require_once($CFG->libdir . '/filelib.php');

/**
 * Creates one Moodle File Resource from an immutable MaterialSnapshot file.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class create_resource extends external_api {

    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'course_id' => new external_value(PARAM_INT, 'Course ID', VALUE_REQUIRED),
            'section_id' => new external_value(PARAM_INT, 'Course section database ID', VALUE_REQUIRED),
            'name' => new external_value(PARAM_TEXT, 'File Resource title', VALUE_REQUIRED),
            'filename' => new external_value(PARAM_FILE, 'Source filename', VALUE_REQUIRED),
            'moodle_material_id' => new external_value(PARAM_INT, 'Immutable MaterialSnapshot file item ID', VALUE_REQUIRED),
            'source_run_id' => new external_value(PARAM_ALPHANUMEXT, 'Run owning the MaterialSnapshot', VALUE_REQUIRED),
            'source_structure_revision' => new external_value(PARAM_INT, 'Sealed Course Structure revision', VALUE_REQUIRED),
            'source_section_ref' => new external_value(PARAM_ALPHANUMEXT, 'Section owning the MaterialSnapshot', VALUE_REQUIRED),
            'source_material_revision' => new external_value(PARAM_INT, 'Material snapshot revision', VALUE_REQUIRED),
        ]);
    }

    public static function execute(
        int $course_id,
        int $section_id,
        string $name,
        string $filename,
        int $moodle_material_id,
        string $source_run_id,
        int $source_structure_revision,
        string $source_section_ref,
        int $source_material_revision
    ): array {
        global $DB, $USER;
        $params = self::validate_parameters(self::execute_parameters(), compact(
            'course_id',
            'section_id',
            'name',
            'filename',
            'moodle_material_id',
            'source_run_id',
            'source_structure_revision',
            'source_section_ref',
            'source_material_revision'
        ));
        if (
            $params['moodle_material_id'] <= 0 ||
            $params['source_structure_revision'] <= 0 ||
            $params['source_material_revision'] <= 0 ||
            trim($params['name']) === ''
        ) {
            throw new \invalid_parameter_exception('Resource source and title are required.');
        }

        $course = $DB->get_record('course', ['id' => $params['course_id']], '*', MUST_EXIST);
        $sectionnum = helper::resolve_section_num_from_section_id($course->id, $params['section_id']);
        [$module, $context] = can_add_moduleinfo($course, 'resource', $sectionnum);
        self::validate_context($context);
        require_capability('local/agentpoc:manage', $context);
        require_capability('mod/resource:addinstance', $context);

        $materialrecord = $DB->get_record('local_agentpoc_material', [
            'id' => $params['moodle_material_id'],
            'runid' => $params['source_run_id'],
            'structure_revision' => $params['source_structure_revision'],
            'sectionref' => $params['source_section_ref'],
            'revision' => $params['source_material_revision'],
            'publishcourse' => 1,
        ], '*', IGNORE_MISSING);
        if (!$materialrecord) {
            throw new \invalid_parameter_exception('Resource source does not belong to the approved Run, Structure revision, and Section.');
        }

        $fs = get_file_storage();
        $snapshotfiles = $fs->get_area_files(
            \context_system::instance()->id,
            'local_agentpoc',
            'planning_material_snapshot',
            $params['moodle_material_id'],
            'sortorder, id',
            false
        );
        $sourcefile = null;
        foreach ($snapshotfiles as $candidate) {
            if (!$candidate->is_directory()) {
                $sourcefile = $candidate;
                break;
            }
        }
        if (!$sourcefile) {
            throw new moodle_exception('materialdraftnotfound', 'local_agentpoc', '', $params['moodle_material_id']);
        }
        if ($sourcefile->get_filename() !== $params['filename']) {
            throw new \invalid_parameter_exception('Resource source filename does not match the approved File Resource plan.');
        }

        $draftitemid = file_get_unused_draft_itemid();
        $fs->create_file_from_storedfile([
            'contextid' => context_user::instance($USER->id)->id,
            'component' => 'user',
            'filearea' => 'draft',
            'itemid' => $draftitemid,
            'filepath' => '/',
            'filename' => $sourcefile->get_filename(),
            'mimetype' => $sourcefile->get_mimetype(),
            'userid' => $USER->id,
        ], $sourcefile);

        $moduleinfo = new stdClass();
        $moduleinfo->modulename = 'resource';
        $moduleinfo->module = (int) $module->id;
        $moduleinfo->name = trim($params['name']);
        $moduleinfo->introeditor = ['text' => '', 'format' => FORMAT_HTML, 'itemid' => 0];
        $moduleinfo->section = $sectionnum;
        $moduleinfo->visible = 1;
        $moduleinfo->visibleoncoursepage = 1;
        $moduleinfo->cmidnumber = '';
        $moduleinfo->groupmode = 0;
        $moduleinfo->groupingid = 0;
        $moduleinfo->completion = 0;
        $moduleinfo->files = $draftitemid;
        $moduleinfo->display = RESOURCELIB_DISPLAY_AUTO;
        $moduleinfo->displayoptions = serialize(['printintro' => 0]);
        $moduleinfo->filterfiles = 0;
        $moduleinfo->legacyfiles = RESOURCELIB_LEGACYFILES_NO;
        $moduleinfo->legacyfileslast = 0;

        $createdinfo = add_moduleinfo($moduleinfo, $course);
        return [
            'activity_id' => (int) $createdinfo->coursemodule,
            'resource_id' => (int) $createdinfo->instance,
            'section_id' => (int) $params['section_id'],
            'name' => (string) $createdinfo->name,
            'filename' => (string) $sourcefile->get_filename(),
            'moodle_material_id' => (int) $params['moodle_material_id'],
        ];
    }

    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'activity_id' => new external_value(PARAM_INT, 'Canonical activity ID'),
            'resource_id' => new external_value(PARAM_INT, 'Resource table instance ID'),
            'section_id' => new external_value(PARAM_INT, 'Section database ID'),
            'name' => new external_value(PARAM_TEXT, 'File Resource title'),
            'filename' => new external_value(PARAM_FILE, 'Created source filename'),
            'moodle_material_id' => new external_value(PARAM_INT, 'Source MaterialSnapshot file item ID'),
        ]);
    }
}
