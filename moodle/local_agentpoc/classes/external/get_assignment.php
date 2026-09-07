<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

namespace local_agentpoc\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use local_agentpoc\helper;
use moodle_exception;

defined('MOODLE_INTERNAL') || die();

/**
 * External function to get assignment details by activity ID (CMID) (T0708, R6).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_assignment extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'activity_id' => new external_value(PARAM_INT, 'Canonical activity ID (course_modules.id)', VALUE_REQUIRED),
        ]);
    }

    /**
     * Get assignment details.
     *
     * @param int $activity_id Activity ID (CMID)
     * @return array Assignment details
     * @throws moodle_exception
     */
    public static function execute(int $activity_id): array {
        global $DB, $CFG;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'activity_id' => $activity_id,
        ]);

        // 2. Resolve assignment module and context.
        list($course, $cm, $context) = helper::get_course_and_cm_from_cmid($params['activity_id'], 'assign');

        // 3. Context validation & capabilities (R4).
        self::validate_context($context);

        require_capability('local/agentpoc:view', $context);
        require_capability('mod/assign:view', $context);

        // 4. Load assign instance record.
        $assign = $DB->get_record('assign', ['id' => $cm->instance], '*', MUST_EXIST);

        // Check plugin settings
        require_once($CFG->dirroot . '/mod/assign/locallib.php');
        $assignobj = new \assign($context, $cm, $course);
        $submissionplugins = $assignobj->get_submission_plugins();

        $onlinetext = 0;
        $fileenabled = 0;

        foreach ($submissionplugins as $plugin) {
            if ($plugin->is_enabled() && $plugin->is_visible()) {
                if ($plugin->get_type() === 'onlinetext') {
                    $onlinetext = 1;
                } else if ($plugin->get_type() === 'file') {
                    $fileenabled = 1;
                }
            }
        }

        return [
            'activity_id'        => (int) $cm->id,
            'assignment_id'      => (int) $assign->id,
            'course_id'          => (int) $course->id,
            'section_id'         => (int) $cm->section,
            'name'               => (string) $assign->name,
            'intro'              => (string) $assign->intro,
            'introformat'        => (int) $assign->introformat,
            'grade'              => (float) $assign->grade,
            'duedate'            => (int) $assign->duedate,
            'onlinetext_enabled' => $onlinetext,
            'file_enabled'       => $fileenabled,
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'activity_id'        => new external_value(PARAM_INT, 'Canonical activity ID (course_modules.id)'),
            'assignment_id'      => new external_value(PARAM_INT, 'Assignment table instance ID (assign.id)'),
            'course_id'          => new external_value(PARAM_INT, 'Course ID'),
            'section_id'         => new external_value(PARAM_INT, 'Section database ID (course_sections.id)'),
            'name'               => new external_value(PARAM_TEXT, 'Assignment title'),
            'intro'              => new external_value(PARAM_RAW, 'Assignment description HTML'),
            'introformat'        => new external_value(PARAM_INT, 'Intro format code'),
            'grade'              => new external_value(PARAM_FLOAT, 'Maximum grade value'),
            'duedate'            => new external_value(PARAM_INT, 'Due date timestamp (0 = none)'),
            'onlinetext_enabled' => new external_value(PARAM_INT, 'Online text submission enabled (1/0)'),
            'file_enabled'       => new external_value(PARAM_INT, 'File submission enabled (1/0)'),
        ]);
    }
}
