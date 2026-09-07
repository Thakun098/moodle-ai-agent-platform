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
use moodle_exception;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/lib.php');

/**
 * External function to create a course section with distinct section_id and section_num (T0704, R7).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class create_section extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'course_id' => new external_value(PARAM_INT, 'Course ID to add section into', VALUE_REQUIRED),
            'position'  => new external_value(PARAM_INT, 'Requested section position/number', VALUE_REQUIRED),
            'name'      => new external_value(PARAM_TEXT, 'Section title/heading', VALUE_REQUIRED),
            'summary'   => new external_value(PARAM_RAW, 'Section description/summary HTML', VALUE_DEFAULT, ''),
        ]);
    }

    /**
     * Create a course section using Moodle core APIs.
     *
     * @param int $course_id Course ID
     * @param int $position Requested section position
     * @param string $name Section name
     * @param string $summary Section summary HTML
     * @return array Created section details
     * @throws moodle_exception
     */
    public static function execute(int $course_id, int $position, string $name, string $summary = ''): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'course_id' => $course_id,
            'position'  => $position,
            'name'      => $name,
            'summary'   => $summary,
        ]);

        if ($params['position'] < 1) {
            throw new \invalid_parameter_exception('Section position must be a positive integer greater than or equal to 1.');
        }

        // 2. Validate course exists.
        $course = $DB->get_record('course', ['id' => $params['course_id']], '*', MUST_EXIST);

        // 3. Context validation & capabilities (R4).
        $context = context_course::instance($course->id);
        self::validate_context($context);

        require_capability('local/agentpoc:manage', $context);
        require_capability('moodle/course:update', $context);

        // 4. Create section via Moodle core API (T0720).
        $section = course_create_section($course->id, $params['position']);

        // 5. Update section name and summary via Moodle core API.
        course_update_section($course->id, $section, [
            'name'          => $params['name'],
            'summary'       => $params['summary'],
            'summaryformat' => FORMAT_HTML,
        ]);

        // Reload updated section record.
        $updatedsection = $DB->get_record('course_sections', ['id' => $section->id], '*', MUST_EXIST);

        return [
            'section_id'  => (int) $updatedsection->id,
            'section_num' => (int) $updatedsection->section,
            'name'        => (string) ($updatedsection->name ?? $params['name']),
            'summary'     => (string) ($updatedsection->summary ?? $params['summary']),
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'section_id'  => new external_value(PARAM_INT, 'Unique database ID of the course section (course_sections.id)'),
            'section_num' => new external_value(PARAM_INT, 'Relative course section number in the course'),
            'name'        => new external_value(PARAM_TEXT, 'Section title/heading'),
            'summary'     => new external_value(PARAM_RAW, 'Section summary HTML'),
        ]);
    }
}
