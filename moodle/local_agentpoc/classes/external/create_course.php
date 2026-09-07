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

use context_coursecat;
use core_course_category;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_single_structure;
use core_external\external_value;
use invalid_parameter_exception;
use moodle_exception;
use stdClass;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/lib.php');

/**
 * External function to create a hidden course with required shortname (T0703, R8, P7-D5).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class create_course extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'category_id' => new external_value(PARAM_INT, 'Existing category ID in Moodle', VALUE_REQUIRED),
            'fullname'    => new external_value(PARAM_TEXT, 'Full title of the course', VALUE_REQUIRED),
            'shortname'   => new external_value(PARAM_TEXT, 'Course shortname (required input, P7-D5)', VALUE_REQUIRED),
            'summary'     => new external_value(PARAM_RAW, 'Course summary HTML text', VALUE_DEFAULT, ''),
            'format'      => new external_value(PARAM_ALPHANUMEXT, 'Course format (e.g. topics)', VALUE_DEFAULT, 'topics'),
        ]);
    }

    /**
     * Create a hidden course using official create_course() API.
     *
     * @param int $category_id Category ID
     * @param string $fullname Course full name
     * @param string $shortname Course shortname
     * @param string $summary Course summary
     * @param string $format Course format
     * @return array Created course data
     * @throws moodle_exception
     */
    public static function execute(
        int $category_id,
        string $fullname,
        string $shortname,
        string $summary = '',
        string $format = 'topics'
    ): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'category_id' => $category_id,
            'fullname'    => $fullname,
            'shortname'   => $shortname,
            'summary'     => $summary,
            'format'      => $format,
        ]);

        $shortname = trim($params['shortname']);
        if ($shortname === '') {
            throw new invalid_parameter_exception(get_string('errorshortnamerequired', 'local_agentpoc'));
        }

        // 2. Validate category exists.
        $category = core_course_category::get($params['category_id'], IGNORE_MISSING);
        if (!$category) {
            throw new moodle_exception('errorinvalidcategory', 'local_agentpoc', '', $params['category_id']);
        }

        // 3. Context validation & capabilities (R4).
        $context = context_coursecat::instance($category->id);
        self::validate_context($context);

        require_capability('local/agentpoc:manage', $context);
        require_capability('moodle/course:create', $context);

        // 4. Validate shortname uniqueness in Moodle.
        if ($DB->record_exists('course', ['shortname' => $shortname])) {
            throw new moodle_exception('errorshortnameexists', 'local_agentpoc', '', $shortname);
        }

        // 5. Prepare course data.
        $coursedata = new stdClass();
        $coursedata->category      = $category->id;
        $coursedata->fullname      = $params['fullname'];
        $coursedata->shortname     = $shortname;
        $coursedata->summary       = $params['summary'];
        $coursedata->summaryformat = FORMAT_HTML;
        $coursedata->format        = $params['format'];
        $coursedata->visible       = 0; // P7-D5 / baseline: hidden by default
        $coursedata->numsections   = 0;

        // 6. Create course using Moodle core API (T0720).
        $course = create_course($coursedata);

        // Auto-enrol creator as editing teacher if manual enrolment plugin is enabled.
        global $USER;
        if (!empty($USER->id)) {
            $enrolinstances = enrol_get_instances($course->id, true);
            foreach ($enrolinstances as $instance) {
                if ($instance->enrol === 'manual') {
                    $manualplugin = enrol_get_plugin('manual');
                    if ($manualplugin) {
                        $teacherroles = get_archetype_roles('editingteacher');
                        $teacherrole = reset($teacherroles);
                        if ($teacherrole) {
                            $manualplugin->enrol_user($instance, $USER->id, $teacherrole->id);
                        }
                    }
                    break;
                }
            }
        }

        return [
            'course_id'   => (int) $course->id,
            'fullname'    => (string) $course->fullname,
            'shortname'   => (string) $course->shortname,
            'category_id' => (int) $course->category,
            'visible'     => (int) $course->visible,
            'format'      => (string) $course->format,
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'course_id'   => new external_value(PARAM_INT, 'Newly created course ID'),
            'fullname'    => new external_value(PARAM_TEXT, 'Full name of the course'),
            'shortname'   => new external_value(PARAM_TEXT, 'Short name of the course'),
            'category_id' => new external_value(PARAM_INT, 'Category ID containing the course'),
            'visible'     => new external_value(PARAM_INT, 'Course visibility (0 = hidden)'),
            'format'      => new external_value(PARAM_ALPHANUMEXT, 'Course format'),
        ]);
    }
}
