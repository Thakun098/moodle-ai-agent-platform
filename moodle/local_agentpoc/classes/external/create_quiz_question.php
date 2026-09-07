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
use invalid_parameter_exception;
use local_agentpoc\helper;
use moodle_exception;
use question_bank;
use stdClass;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/questionlib.php');

/**
 * External function to create a question in the Quiz activity context (T0714–T0717, R9, R10, R13).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class create_quiz_question extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'activity_id'     => new external_value(PARAM_INT, 'Quiz activity ID (course_modules.id)', VALUE_REQUIRED),
            'qtype'           => new external_value(PARAM_PLUGIN, 'Question type (multichoice, truefalse, shortanswer, essay)', VALUE_REQUIRED),
            'name'            => new external_value(PARAM_TEXT, 'Question name', VALUE_REQUIRED),
            'questiontext'    => new external_value(PARAM_RAW, 'Question text HTML', VALUE_REQUIRED),
            'defaultmark'     => new external_value(PARAM_FLOAT, 'Default mark value', VALUE_DEFAULT, 1),
            'generalfeedback' => new external_value(PARAM_RAW, 'General feedback HTML', VALUE_DEFAULT, ''),
            'qtype_options_json' => new external_value(PARAM_RAW, 'JSON encoded qtype specific options', VALUE_DEFAULT, '{}'),
        ]);
    }

    /**
     * Create question in Quiz activity context question category.
     *
     * @param int $activity_id Quiz CMID
     * @param string $qtype Question type
     * @param string $name Question name
     * @param string $questiontext Question text HTML
     * @param float $defaultmark Default mark
     * @param string $generalfeedback General feedback HTML
     * @param string $qtype_options_json JSON string of qtype options
     * @return array Created question and version details
     * @throws moodle_exception
     */
    public static function execute(
        int $activity_id,
        string $qtype,
        string $name,
        string $questiontext,
        float $defaultmark = 1,
        string $generalfeedback = '',
        string $qtype_options_json = '{}'
    ): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'activity_id'        => $activity_id,
            'qtype'              => $qtype,
            'name'               => $name,
            'questiontext'       => $questiontext,
            'defaultmark'        => $defaultmark,
            'generalfeedback'    => $generalfeedback,
            'qtype_options_json' => $qtype_options_json,
        ]);

        if ($params['defaultmark'] <= 0) {
            throw new \invalid_parameter_exception('Question defaultmark must be greater than 0.');
        }

        $allowedqtypes = ['multichoice', 'truefalse', 'shortanswer', 'essay'];
        if (!in_array($params['qtype'], $allowedqtypes, true)) {
            throw new moodle_exception('errorunsupportedqtype', 'local_agentpoc', '', $params['qtype']);
        }

        // 2. Resolve quiz module and context.
        list($course, $cm, $context) = helper::get_course_and_cm_from_cmid($params['activity_id'], 'quiz');

        // 3. Context validation & capabilities (R4).
        self::validate_context($context);

        require_capability('local/agentpoc:manage', $context);
        require_capability('moodle/question:add', $context);

        // 4. P7-D3: Resolve/create deterministic Question Bank Category in Quiz activity context.
        $category = helper::get_or_create_quiz_question_category($context);

        // 5. Decode qtype options strictly (P7-R5).
        $qtypeoptions = json_decode($params['qtype_options_json'], true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new \invalid_parameter_exception('Invalid JSON in qtype_options_json: ' . json_last_error_msg());
        }
        if (!is_array($qtypeoptions)) {
            $qtypeoptions = [];
        }

        // 6. Populate $question and $form matching Moodle 5.1 qtype requirements (R13).
        $question = new stdClass();
        $question->qtype = $params['qtype'];

        $form = new stdClass();
        $form->category        = (string) $category->id;
        $form->name            = $params['name'];
        $form->questiontext    = ['text' => $params['questiontext'], 'format' => FORMAT_HTML];
        $form->defaultmark     = $params['defaultmark'];
        $form->generalfeedback = ['text' => $params['generalfeedback'], 'format' => FORMAT_HTML];
        $form->penalty         = 0.3333333;

        if ($params['qtype'] === 'multichoice') {
            // Multichoice strict validation (P7-R7)
            $choices = $qtypeoptions['choices'] ?? [];
            if (!is_array($choices) || count($choices) < 2) {
                throw new \invalid_parameter_exception('Multiple choice questions require at least 2 choices.');
            }

            $answers = [];
            $fractions = [];
            $feedbacks = [];
            $correctcount = 0;

            foreach ($choices as $c) {
                $text = trim((string) ($c['text'] ?? ''));
                if ($text === '') {
                    throw new \invalid_parameter_exception('Choice text in multiple choice question cannot be blank.');
                }
                $fraction = (float) ($c['fraction'] ?? 0.0);
                if ($fraction === 1.0) {
                    $correctcount++;
                } else if ($fraction !== 0.0) {
                    throw new \invalid_parameter_exception('Multiple choice fractions must be exactly 1.0 (correct) or 0.0 (incorrect).');
                }

                $answers[]   = ['text' => $text, 'format' => FORMAT_HTML];
                $fractions[] = $fraction;
                $feedbacks[] = ['text' => (string) ($c['feedback'] ?? ''), 'format' => FORMAT_HTML];
            }

            if ($correctcount !== 1) {
                throw new \invalid_parameter_exception('Multiple choice questions must have exactly one correct answer (fraction = 1.0). Found: ' . $correctcount);
            }

            $form->answer                 = $answers;
            $form->fraction               = $fractions;
            $form->feedback               = $feedbacks;
            $form->single                 = !empty($qtypeoptions['single']) ? 1 : 1;
            $form->shuffleanswers         = isset($qtypeoptions['shuffleanswers']) ? (int) $qtypeoptions['shuffleanswers'] : 1;
            $form->answernumbering        = 'abc';
            $form->showstandardinstruction = 0;
            $form->correctfeedback        = ['text' => '', 'format' => FORMAT_HTML];
            $form->partiallycorrectfeedback = ['text' => '', 'format' => FORMAT_HTML];
            $form->incorrectfeedback      = ['text' => '', 'format' => FORMAT_HTML];
            $form->shownumcorrect         = 0;

        } else if ($params['qtype'] === 'truefalse') {
            if (!isset($qtypeoptions['correct_answer']) || !is_bool($qtypeoptions['correct_answer'])) {
                throw new \invalid_parameter_exception('True/False questions require a boolean correct_answer in qtype_options_json.');
            }
            $correctanswer = $qtypeoptions['correct_answer'] ? 1 : 0;
            $form->correctanswer = $correctanswer;
            $form->feedbacktrue  = ['text' => (string) ($qtypeoptions['feedback_true'] ?? ''), 'format' => FORMAT_HTML];
            $form->feedbackfalse = ['text' => (string) ($qtypeoptions['feedback_false'] ?? ''), 'format' => FORMAT_HTML];
            $form->showstandardinstruction = 0;

        } else if ($params['qtype'] === 'shortanswer') {
            // Short answer strict validation (P7-R6)
            $accepted = $qtypeoptions['accepted_answers'] ?? [];
            if (!is_array($accepted) || empty($accepted)) {
                throw new \invalid_parameter_exception('Short answer question requires a non-empty accepted_answers array.');
            }

            $answers = [];
            $fractions = [];
            $feedbacks = [];

            foreach ($accepted as $ans) {
                $trimmed = trim((string) $ans);
                if ($trimmed === '') {
                    throw new \invalid_parameter_exception('Accepted answer in short answer question cannot be blank.');
                }
                $answers[]   = $trimmed;
                $fractions[] = 1.0;
                $feedbacks[] = ['text' => (string) ($qtypeoptions['feedback'] ?? ''), 'format' => FORMAT_HTML];
            }

            $form->answer   = $answers;
            $form->fraction = $fractions;
            $form->feedback = $feedbacks;
            $form->usecase  = !empty($qtypeoptions['case_sensitive']) ? 1 : 0;

        } else if ($params['qtype'] === 'essay') {
            $form->responseformat     = $qtypeoptions['response_format'] ?? 'editor';
            $form->responserequired   = 1;
            $form->responsefieldlines = 15;
            $form->attachments        = 0;
            $form->attachmentsrequired = 0;
            $form->maxbytes           = 0;
            $form->minwordlimit       = $qtypeoptions['min_word_limit'] ?? null;
            $form->maxwordlimit       = $qtypeoptions['max_word_limit'] ?? null;
            $form->graderinfo         = [
                'text'   => (string) ($qtypeoptions['grading_guidance'] ?? ''),
                'format' => FORMAT_HTML,
            ];
            $form->responsetemplate   = [
                'text'   => '',
                'format' => FORMAT_HTML,
            ];
        }

        // 7. Save question via Moodle core question type API (T0720).
        $qtypeobj = question_bank::get_qtype($params['qtype']);
        $savedquestion = $qtypeobj->save_question($question, $form);

        // 8. Retrieve version & bank entry metadata (P7-D4).
        $versioninfo = helper::get_question_version_info($savedquestion->id);

        return [
            'question_bank_entry_id' => (int) $versioninfo->questionbankentryid,
            'question_id'            => (int) $savedquestion->id,
            'version'                => (int) $versioninfo->version,
            'name'                   => (string) $savedquestion->name,
            'qtype'                  => (string) $params['qtype'],
            'defaultmark'            => (float) $savedquestion->defaultmark,
            'category_id'            => (int) $category->id,
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'question_bank_entry_id' => new external_value(PARAM_INT, 'Stable conceptual question bank entry ID'),
            'question_id'            => new external_value(PARAM_INT, 'Concrete version question ID'),
            'version'                => new external_value(PARAM_INT, 'Question version (starts at 1)'),
            'name'                   => new external_value(PARAM_TEXT, 'Question name'),
            'qtype'                  => new external_value(PARAM_PLUGIN, 'Question type'),
            'defaultmark'            => new external_value(PARAM_FLOAT, 'Default mark value'),
            'category_id'            => new external_value(PARAM_INT, 'Category ID containing the question in Quiz context'),
        ]);
    }
}
