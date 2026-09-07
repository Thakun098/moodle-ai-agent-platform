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
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use local_agentpoc\helper;
use mod_quiz\quiz_settings;
use mod_quiz\structure;
use moodle_exception;
use question_bank;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/mod/quiz/locallib.php');
require_once($CFG->libdir . '/questionlib.php');

/**
 * External function to get all questions in a quiz with version metadata (T0713, R6, R10).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_quiz_questions extends external_api {

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
     * Get quiz questions with question bank entry and version details.
     *
     * @param int $activity_id Activity ID (CMID)
     * @return array List of questions in quiz
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

        // 3. Context validation & capabilities (R4, P7-R1).
        self::validate_context($context);

        require_capability('local/agentpoc:view', $context);
        require_capability('mod/quiz:manage', $context);
        require_capability('moodle/question:viewall', $context);

        // 4. Load quiz structure.
        $quiz = $DB->get_record('quiz', ['id' => $cm->instance], '*', MUST_EXIST);
        $quizobj = quiz_settings::create($quiz->id);
        $structure = structure::create_for_quiz($quizobj);
        $slots = $structure->get_slots();

        $result = [];

        foreach ($slots as $slot) {
            $questionid = (int) $slot->questionid;
            $questiondata = question_bank::load_question_data($questionid);

            // Get question version info (P7-D4)
            $versioninfo = helper::get_question_version_info($questionid);

            $answersout = [];
            if (!empty($questiondata->options->answers)) {
                foreach ($questiondata->options->answers as $ans) {
                    $answersout[] = [
                        'id'       => (int) $ans->id,
                        'text'     => (string) $ans->answer,
                        'fraction' => (float) $ans->fraction,
                        'feedback' => (string) ($ans->feedback ?? ''),
                    ];
                }
            }

            $result[] = [
                'slot_id'                 => (int) $slot->id,
                'slot_number'             => (int) $slot->slot,
                'page'                    => (int) $slot->page,
                'maxmark'                 => (float) $slot->maxmark,
                'question_bank_entry_id'  => (int) $versioninfo->questionbankentryid,
                'question_id'             => $questionid,
                'version'                 => (int) $versioninfo->version,
                'name'                    => (string) $questiondata->name,
                'qtype'                   => (string) $questiondata->qtype,
                'questiontext'            => (string) $questiondata->questiontext,
                'defaultmark'             => (float) $questiondata->defaultmark,
                'answers'                 => $answersout,
            ];
        }

        return $result;
    }

    /**
     * Return structure description.
     *
     * @return external_multiple_structure
     */
    public static function execute_returns(): external_multiple_structure {
        return new external_multiple_structure(
            new external_single_structure([
                'slot_id'                => new external_value(PARAM_INT, 'Quiz slot ID'),
                'slot_number'            => new external_value(PARAM_INT, 'Slot order number'),
                'page'                   => new external_value(PARAM_INT, 'Page number in quiz'),
                'maxmark'                => new external_value(PARAM_FLOAT, 'Max mark for slot'),
                'question_bank_entry_id' => new external_value(PARAM_INT, 'Stable question bank entry ID'),
                'question_id'            => new external_value(PARAM_INT, 'Concrete version question ID'),
                'version'                => new external_value(PARAM_INT, 'Question version number'),
                'name'                   => new external_value(PARAM_TEXT, 'Question name'),
                'qtype'                  => new external_value(PARAM_PLUGIN, 'Question type (multichoice, truefalse, shortanswer, essay)'),
                'questiontext'           => new external_value(PARAM_RAW, 'Question text HTML'),
                'defaultmark'            => new external_value(PARAM_FLOAT, 'Default mark of question'),
                'answers'                => new external_multiple_structure(
                    new external_single_structure([
                        'id'       => new external_value(PARAM_INT, 'Answer ID'),
                        'text'     => new external_value(PARAM_RAW, 'Answer/choice text'),
                        'fraction' => new external_value(PARAM_FLOAT, 'Grade fraction (1.0 = 100%, 0.0 = 0%)'),
                        'feedback' => new external_value(PARAM_RAW, 'Feedback text'),
                    ])
                ),
            ])
        );
    }
}
