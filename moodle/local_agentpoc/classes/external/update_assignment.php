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

require_once($CFG->dirroot . '/course/modlib.php');

/**
 * External function to update an assignment by activity ID (CMID) (T0709, R5, R6).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class update_assignment extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'activity_id' => new external_value(PARAM_INT, 'Canonical activity ID (course_modules.id)', VALUE_REQUIRED),
            'name'        => new external_value(PARAM_TEXT, 'New assignment title (optional)', VALUE_DEFAULT, null),
            'intro'       => new external_value(PARAM_RAW, 'New assignment description HTML (optional)', VALUE_DEFAULT, null),
            'grade'       => new external_value(PARAM_FLOAT, 'New maximum grade value (optional)', VALUE_DEFAULT, null),
        ]);
    }

    /**
     * Update an assignment using Moodle update_moduleinfo().
     *
     * @param int $activity_id Activity ID (CMID)
     * @param string|null $name Updated title
     * @param string|null $intro Updated intro HTML
     * @param float|null $grade Updated grade
     * @return array Updated assignment record
     * @throws moodle_exception
     */
    public static function execute(int $activity_id, ?string $name = null, ?string $intro = null, ?float $grade = null): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'activity_id' => $activity_id,
            'name'        => $name,
            'intro'       => $intro,
            'grade'       => $grade,
        ]);

        if ($params['grade'] !== null && $params['grade'] <= 0) {
            throw new \invalid_parameter_exception('Assignment grade must be greater than 0.');
        }

        // 2. Resolve assignment module and context.
        list($course, $cm, $context) = helper::get_course_and_cm_from_cmid($params['activity_id'], 'assign');

        // 3. Context validation & capabilities (R4).
        self::validate_context($context);

        require_capability('local/agentpoc:manage', $context);
        require_capability('mod/assign:addinstance', $context);

        // 4. Retrieve existing moduleinfo data via Moodle API.
        list($cm, $context, $module, $moduleinfo, $cw) = get_moduleinfo_data($cm, $course);

        if ($params['name'] !== null) {
            $moduleinfo->name = $params['name'];
        }

        if ($params['intro'] !== null) {
            $moduleinfo->introeditor = [
                'text'   => $params['intro'],
                'format' => FORMAT_HTML,
                'itemid' => 0,
            ];
        }

        if ($params['grade'] !== null) {
            $moduleinfo->grade = $params['grade'];
        }

        // 5. Execute update via Moodle core API (T0720).
        list($updatedcm, $updatedinfo) = update_moduleinfo($cm, $moduleinfo, $course);

        $assign = $DB->get_record('assign', ['id' => $cm->instance], '*', MUST_EXIST);

        return [
            'activity_id'   => (int) $cm->id,
            'assignment_id' => (int) $assign->id,
            'name'          => (string) $assign->name,
            'intro'         => (string) $assign->intro,
            'grade'         => (float) $assign->grade,
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
            'name'          => new external_value(PARAM_TEXT, 'Updated assignment title'),
            'intro'         => new external_value(PARAM_RAW, 'Updated assignment description HTML'),
            'grade'         => new external_value(PARAM_FLOAT, 'Updated maximum grade value'),
        ]);
    }
}
