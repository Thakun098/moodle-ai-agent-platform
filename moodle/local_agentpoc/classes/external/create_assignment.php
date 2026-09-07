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

use context_course;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use local_agentpoc\helper;
use moodle_exception;
use stdClass;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/modlib.php');

/**
 * External function to create an assignment with frozen defaults (T0706, T0707, R5, R6, R14).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class create_assignment extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'course_id'  => new external_value(PARAM_INT, 'Course ID to add assignment into', VALUE_REQUIRED),
            'section_id' => new external_value(PARAM_INT, 'Course section database ID (course_sections.id)', VALUE_REQUIRED),
            'name'       => new external_value(PARAM_TEXT, 'Assignment title', VALUE_REQUIRED),
            'intro'      => new external_value(PARAM_RAW, 'Assignment description and instructions HTML', VALUE_REQUIRED),
            'grade'      => new external_value(PARAM_FLOAT, 'Maximum grade value (defaults to 100)', VALUE_DEFAULT, 100),
        ]);
    }

    /**
     * Create an assignment using Moodle add_moduleinfo() with frozen defaults (R14).
     *
     * @param int $course_id Course ID
     * @param int $section_id Course section ID (course_sections.id)
     * @param string $name Assignment name
     * @param string $intro Assignment description HTML
     * @param float $grade Assignment maximum grade
     * @return array Created assignment details
     * @throws moodle_exception
     */
    public static function execute(int $course_id, int $section_id, string $name, string $intro, float $grade = 100): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'course_id'  => $course_id,
            'section_id' => $section_id,
            'name'       => $name,
            'intro'      => $intro,
            'grade'      => $grade,
        ]);

        if ($params['grade'] <= 0) {
            throw new \invalid_parameter_exception('Assignment grade must be greater than 0.');
        }

        // 2. Validate course exists.
        $course = $DB->get_record('course', ['id' => $params['course_id']], '*', MUST_EXIST);

        // 3. Resolve relative section number from section_id (R7).
        $sectionnum = helper::resolve_section_num_from_section_id($course->id, $params['section_id']);

        // 4. Native Moodle creation gate & context validation (P7-R2).
        [$module, $context, $sectioninfo] = can_add_moduleinfo($course, 'assign', $sectionnum);
        self::validate_context($context);

        require_capability('local/agentpoc:manage', $context);
        require_capability('mod/assign:addinstance', $context);

        // 5. Build moduleinfo object with frozen assignment defaults (R14).
        $moduleinfo = new stdClass();
        $moduleinfo->modulename                  = 'assign';
        $moduleinfo->module                      = (int) $module->id;
        $moduleinfo->name                        = $params['name'];
        $moduleinfo->introeditor                 = [
            'text'   => $params['intro'],
            'format' => FORMAT_HTML,
            'itemid' => 0,
        ];
        $moduleinfo->section                     = $sectionnum;
        $moduleinfo->visible                     = 1;
        $moduleinfo->visibleoncoursepage         = 1;
        $moduleinfo->cmidnumber                  = '';
        $moduleinfo->groupmode                   = 0; // NOGROUPS
        $moduleinfo->groupingid                  = 0;
        $moduleinfo->completion                  = 0; // COMPLETION_TRACKING_NONE

        // Grade settings
        $moduleinfo->grade                       = $params['grade'];
        $moduleinfo->gradepass                   = 0;
        $moduleinfo->gradecat                    = 0;

        // Dates frozen to 0 (no cutoff / deadlines)
        $moduleinfo->allowsubmissionsfromdate    = 0;
        $moduleinfo->duedate                     = 0;
        $moduleinfo->cutoffdate                  = 0;
        $moduleinfo->gradingduedate              = 0;

        // Submission settings
        $moduleinfo->submissiondrafts            = 0;
        $moduleinfo->requiresubmissionstatement  = 0;
        $moduleinfo->sendnotifications           = 0;
        $moduleinfo->sendlatenotifications       = 0;
        $moduleinfo->sendstudentnotifications    = 1;
        $moduleinfo->teamsubmission              = 0;
        $moduleinfo->requireallteammemberssubmit = 0;
        $moduleinfo->blindmarking                = 0;
        $moduleinfo->attemptreopenmethod         = 'none';
        $moduleinfo->maxattempts                 = -1;
        $moduleinfo->markingworkflow             = 0;
        $moduleinfo->markingallocation           = 0;

        // Plugin sub-settings (online text enabled, file submission disabled)
        $moduleinfo->assignsubmission_onlinetext_enabled = 1;
        $moduleinfo->assignsubmission_file_enabled       = 0;
        $moduleinfo->assignfeedback_comments_enabled     = 1;

        // 7. Execute creation via Moodle core API (T0720).
        $createdinfo = add_moduleinfo($moduleinfo, $course);

        return [
            'activity_id'   => (int) $createdinfo->coursemodule, // P7-D2: CMID is canonical activity_id
            'assignment_id' => (int) $createdinfo->instance,
            'name'          => (string) $createdinfo->name,
            'section_id'    => (int) $params['section_id'],
            'grade'         => (float) $params['grade'],
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'activity_id'   => new external_value(PARAM_INT, 'Canonical activity ID (course_modules.id)'),
            'assignment_id' => new external_value(PARAM_INT, 'Assignment table instance ID (assign.id)'),
            'name'          => new external_value(PARAM_TEXT, 'Assignment title'),
            'section_id'    => new external_value(PARAM_INT, 'Section database ID (course_sections.id)'),
            'grade'         => new external_value(PARAM_FLOAT, 'Maximum grade value'),
        ]);
    }
}
