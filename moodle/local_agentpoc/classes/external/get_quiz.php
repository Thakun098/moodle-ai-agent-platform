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
use mod_quiz\quiz_settings;
use mod_quiz\structure;
use moodle_exception;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/quiz/locallib.php');

/**
 * External function to get quiz details by activity ID (CMID) (T0711, R6).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_quiz extends external_api {

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
     * Get quiz details.
     *
     * @param int $activity_id Activity ID (CMID)
     * @return array Quiz details
     * @throws moodle_exception
     */
    public static function execute(int $activity_id): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'activity_id' => $activity_id,
        ]);

        // 2. Resolve quiz module and context.
        list($course, $cm, $context) = helper::get_course_and_cm_from_cmid($params['activity_id'], 'quiz');

        // 3. Context validation & capabilities (R4).
        self::validate_context($context);

        require_capability('local/agentpoc:view', $context);
        require_capability('mod/quiz:view', $context);

        // 4. Load quiz instance record.
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);

        // 5. Get quiz structure questions count.
        $quizobj = quiz_settings::create($quiz->id);
        $structure = structure::create_for_quiz($quizobj);
        $slots = $structure->get_slots();

        return [
            'activity_id'     => (int) $cm->id,
            'quiz_id'         => (int) $quiz->id,
            'course_id'       => (int) $course->id,
            'section_id'      => (int) $cm->section,
            'name'            => (string) $quiz->name,
            'intro'           => (string) $quiz->intro,
            'grade'           => (float) $quiz->grade,
            'questions_count' => count($slots),
            'sumgrades'       => (float) $quiz->sumgrades,
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'activity_id'     => new external_value(PARAM_INT, 'Canonical activity ID (course_modules.id)'),
            'quiz_id'         => new external_value(PARAM_INT, 'Quiz table instance ID (quiz.id)'),
            'course_id'       => new external_value(PARAM_INT, 'Course ID'),
            'section_id'      => new external_value(PARAM_INT, 'Section database ID (course_sections.id)'),
            'name'            => new external_value(PARAM_TEXT, 'Quiz title'),
            'intro'           => new external_value(PARAM_RAW, 'Quiz description HTML'),
            'grade'           => new external_value(PARAM_FLOAT, 'Maximum grade value'),
            'questions_count' => new external_value(PARAM_INT, 'Number of questions in quiz'),
            'sumgrades'       => new external_value(PARAM_FLOAT, 'Sum of question grades'),
        ]);
    }
}
