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
 * External function to add a question to a quiz using question bank entry identity (T0718, R6, R12).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class add_question_to_quiz extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'activity_id'            => new external_value(PARAM_INT, 'Quiz activity ID (course_modules.id)', VALUE_REQUIRED),
            'question_bank_entry_id' => new external_value(PARAM_INT, 'Stable conceptual question bank entry ID', VALUE_REQUIRED),
            'page'                   => new external_value(PARAM_INT, 'Page number to add question to (0 = next/last page)', VALUE_DEFAULT, 0),
            'maxmark'                => new external_value(PARAM_FLOAT, 'Max mark for question slot (optional, null = defaultmark)', VALUE_DEFAULT, null),
        ]);
    }

    /**
     * Add question to quiz using Moodle quiz_add_quiz_question().
     *
     * @param int $activity_id Quiz CMID
     * @param int $question_bank_entry_id Question bank entry ID
     * @param int $page Page number (0 = default next)
     * @param float|null $maxmark Optional max mark
     * @return array Added question slot details
     * @throws moodle_exception
     */
    public static function execute(int $activity_id, int $question_bank_entry_id, int $page = 0, ?float $maxmark = null): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'activity_id'            => $activity_id,
            'question_bank_entry_id' => $question_bank_entry_id,
            'page'                   => $page,
            'maxmark'                => $maxmark,
        ]);

        if ($params['maxmark'] !== null && $params['maxmark'] <= 0) {
            throw new \invalid_parameter_exception('Question maxmark must be greater than 0.');
        }

        // 2. Resolve quiz module and context.
        list($course, $cm, $context) = helper::get_course_and_cm_from_cmid($params['activity_id'], 'quiz');

        // 3. Context validation & capabilities (R4).
        self::validate_context($context);

        require_capability('local/agentpoc:manage', $context);
        require_capability('mod/quiz:manage', $context);

        // 4. Resolve latest concrete question ID from stable question bank entry ID (P7-D4, R12).
        $questionid = helper::get_latest_ready_question_id_for_bank_entry($params['question_bank_entry_id']);

        // 5. Load quiz instance record and existing slot IDs (P7-R3).
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
        $quiz->cmid = $cm->id;

        $quizobj = quiz_settings::create($quiz->id);
        $structure = structure::create_for_quiz($quizobj);
        $slotsbefore = $structure->get_slots();
        $slotidsbefore = array_keys($slotsbefore);

        // 6. Add question to quiz using Moodle core API (T0720, P7-R4).
        $result = quiz_add_quiz_question($questionid, $quiz, $params['page'], $params['maxmark']);
        if ($result === false) {
            throw new moodle_exception('errorquestionalreadyinquiz', 'local_agentpoc', '', $params['question_bank_entry_id']);
        }

        // 7. Recompute sumgrades.
        $quizobj = quiz_settings::create($quiz->id);
        $quizobj->get_grade_calculator()->recompute_quiz_sumgrades();

        // 8. Find actual newly created slot (P7-R3).
        $structure = structure::create_for_quiz($quizobj);
        $slotsafter = $structure->get_slots();

        $newslot = null;
        foreach ($slotsafter as $slot) {
            if (!in_array($slot->id, $slotidsbefore)) {
                $newslot = $slot;
                break;
            }
        }

        if (!$newslot) {
            // Fallback for first slot or match by question id
            foreach ($slotsafter as $slot) {
                if ((int) $slot->questionid === (int) $questionid) {
                    $newslot = $slot;
                    break;
                }
            }
            if (!$newslot) {
                $newslot = end($slotsafter);
            }
        }

        return [
            'slot_id'                => (int) $newslot->id,
            'activity_id'            => (int) $cm->id,
            'quiz_id'                => (int) $quiz->id,
            'question_bank_entry_id' => (int) $params['question_bank_entry_id'],
            'question_id'            => (int) $questionid,
            'slot_number'            => (int) $newslot->slot,
            'page'                   => (int) $newslot->page,
            'maxmark'                => (float) $newslot->maxmark,
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'slot_id'                => new external_value(PARAM_INT, 'Quiz slot ID'),
            'activity_id'            => new external_value(PARAM_INT, 'Canonical activity ID (course_modules.id)'),
            'quiz_id'                => new external_value(PARAM_INT, 'Quiz table instance ID (quiz.id)'),
            'question_bank_entry_id' => new external_value(PARAM_INT, 'Stable conceptual question bank entry ID'),
            'question_id'            => new external_value(PARAM_INT, 'Concrete version question ID'),
            'slot_number'            => new external_value(PARAM_INT, 'Slot order number in quiz'),
            'page'                   => new external_value(PARAM_INT, 'Page number in quiz'),
            'maxmark'                => new external_value(PARAM_FLOAT, 'Max mark for question slot'),
        ]);
    }
}
