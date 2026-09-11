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

use context;
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
require_once($CFG->dirroot . '/mod/quiz/locallib.php');

/**
 * External function to update a question creating a new version under the existing question bank entry (T0719, R10, R11, R13).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class update_quiz_question extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'question_bank_entry_id' => new external_value(PARAM_INT, 'Stable conceptual question bank entry ID', VALUE_REQUIRED),
            'name'                   => new external_value(PARAM_TEXT, 'New question name (optional)', VALUE_DEFAULT, null),
            'questiontext'           => new external_value(PARAM_RAW, 'New question text HTML (optional)', VALUE_DEFAULT, null),
            'defaultmark'            => new external_value(PARAM_FLOAT, 'New default mark value (optional)', VALUE_DEFAULT, null),
            'generalfeedback'        => new external_value(PARAM_RAW, 'New general feedback HTML (optional)', VALUE_DEFAULT, null),
            'qtype_options_json'     => new external_value(PARAM_RAW, 'JSON encoded qtype specific options (optional)', VALUE_DEFAULT, null),
            'activity_id'           => new external_value(PARAM_INT, 'Quiz activity containing the question', VALUE_DEFAULT, null),
            'maxmark'               => new external_value(PARAM_FLOAT, 'Desired mark for the target quiz slot', VALUE_DEFAULT, null),
            'expected_version'      => new external_value(PARAM_INT, 'Expected question version before mutation', VALUE_DEFAULT, null),
        ]);
    }

    /**
     * Update question producing a new version under the stable question bank entry.
     *
     * @param int $question_bank_entry_id Question bank entry ID
     * @param string|null $name Updated name
     * @param string|null $questiontext Updated question text HTML
     * @param float|null $defaultmark Updated default mark
     * @param string|null $generalfeedback Updated general feedback HTML
     * @param string|null $qtype_options_json JSON string of qtype options
     * @return array Updated question version details
     * @throws moodle_exception
     */
    public static function execute(
        int $question_bank_entry_id,
        ?string $name = null,
        ?string $questiontext = null,
        ?float $defaultmark = null,
        ?string $generalfeedback = null,
        ?string $qtype_options_json = null,
        ?int $activity_id = null,
        ?float $maxmark = null,
        ?int $expected_version = null
    ): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'question_bank_entry_id' => $question_bank_entry_id,
            'name'                   => $name,
            'questiontext'           => $questiontext,
            'defaultmark'            => $defaultmark,
            'generalfeedback'        => $generalfeedback,
            'qtype_options_json'     => $qtype_options_json,
            'activity_id'           => $activity_id,
            'maxmark'               => $maxmark,
            'expected_version'      => $expected_version,
        ]);

        if ($params['defaultmark'] !== null && $params['defaultmark'] <= 0) {
            throw new \invalid_parameter_exception('Question defaultmark must be greater than 0.');
        }

        // 2. Resolve current concrete question ID and bank entry (P7-D4).
        $currentquestionid = helper::get_latest_ready_question_id_for_bank_entry($params['question_bank_entry_id']);
        $currentquestiondata = question_bank::load_question_data($currentquestionid);
        $currentversion = helper::get_question_version_info($currentquestionid);
        if ($params['expected_version'] !== null && (int) $currentversion->version !== $params['expected_version']) {
            throw new invalid_parameter_exception('Question version changed since planning.');
        }
        if (($params['activity_id'] === null) !== ($params['maxmark'] === null) ||
                ($params['maxmark'] !== null && $params['maxmark'] <= 0)) {
            throw new invalid_parameter_exception('A quiz activity and positive slot mark must be supplied together.');
        }
        $quizobj = null;
        $quizstructure = null;
        $targetslot = null;
        if ($params['activity_id'] !== null) {
            list($quizcourse, $quizcm, $quizcontext) = helper::get_course_and_cm_from_cmid($params['activity_id'], 'quiz');
            self::validate_context($quizcontext);
            require_capability('local/agentpoc:manage', $quizcontext);
            require_capability('mod/quiz:manage', $quizcontext);
            $quizobj = \mod_quiz\quiz_settings::create($quizcm->instance);
            $quizstructure = \mod_quiz\structure::create_for_quiz($quizobj);
            foreach ($quizstructure->get_slots() as $slot) {
                $slotversion = helper::get_question_version_info((int) $slot->questionid);
                if ((int) $slotversion->questionbankentryid === $params['question_bank_entry_id']) {
                    $targetslot = $slot;
                    break;
                }
            }
            if (!$targetslot) throw new invalid_parameter_exception('Question does not belong to the target quiz.');
        }

        // 3. Resolve context from category and validate capabilities (R4).
        $category = $DB->get_record('question_categories', ['id' => $currentquestiondata->category], '*', MUST_EXIST);
        $context = context::instance_by_id($category->contextid);
        self::validate_context($context);

        require_capability('local/agentpoc:manage', $context);
        require_capability('moodle/question:editall', $context);

        // 4. Decode qtype options strictly if provided (P7-R5).
        $qtypeoptions = null;
        if ($params['qtype_options_json'] !== null) {
            $qtypeoptions = json_decode($params['qtype_options_json'], true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new \invalid_parameter_exception('Invalid JSON in qtype_options_json: ' . json_last_error_msg());
            }
        }

        // 5. Build $question object (must have existing ->id set to trigger version increment in Moodle 5.1).
        $question = new stdClass();
        $question->id    = $currentquestionid;
        $question->qtype = $currentquestiondata->qtype;

        // 6. Build $form object combining updated fields with existing values.
        $form = new stdClass();
        $form->category        = (string) $category->id;
        $form->name            = $params['name'] !== null ? $params['name'] : $currentquestiondata->name;
        $form->questiontext    = [
            'text'   => $params['questiontext'] !== null ? $params['questiontext'] : $currentquestiondata->questiontext,
            'format' => FORMAT_HTML,
        ];
        $form->defaultmark     = $params['defaultmark'] !== null ? $params['defaultmark'] : $currentquestiondata->defaultmark;
        $form->generalfeedback = [
            'text'   => $params['generalfeedback'] !== null ? $params['generalfeedback'] : $currentquestiondata->generalfeedback,
            'format' => FORMAT_HTML,
        ];
        $form->penalty         = $currentquestiondata->penalty;

        $qtype = $currentquestiondata->qtype;

        if ($qtype === 'multichoice') {
            if ($qtypeoptions !== null && isset($qtypeoptions['choices'])) {
                // Strict multichoice validation (P7-R7)
                $choices = $qtypeoptions['choices'];
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
            } else {
                // Reuse existing answers
                $answers = [];
                $fractions = [];
                $feedbacks = [];
                foreach ($currentquestiondata->options->answers as $ans) {
                    $answers[]   = ['text' => (string) $ans->answer, 'format' => FORMAT_HTML];
                    $fractions[] = (float) $ans->fraction;
                    $feedbacks[] = ['text' => (string) ($ans->feedback ?? ''), 'format' => FORMAT_HTML];
                }
                $form->answer                 = $answers;
                $form->fraction               = $fractions;
                $form->feedback               = $feedbacks;
                $form->single                 = $currentquestiondata->options->single ?? 1;
                $form->shuffleanswers         = $currentquestiondata->options->shuffleanswers ?? 1;
                $form->answernumbering        = $currentquestiondata->options->answernumbering ?? 'abc';
                $form->showstandardinstruction = 0;
                $form->correctfeedback        = [
                    'text'   => (string) ($currentquestiondata->options->correctfeedback ?? ''),
                    'format' => FORMAT_HTML,
                ];
                $form->partiallycorrectfeedback = [
                    'text'   => (string) ($currentquestiondata->options->partiallycorrectfeedback ?? ''),
                    'format' => FORMAT_HTML,
                ];
                $form->incorrectfeedback      = [
                    'text'   => (string) ($currentquestiondata->options->incorrectfeedback ?? ''),
                    'format' => FORMAT_HTML,
                ];
                $form->shownumcorrect         = (int) ($currentquestiondata->options->shownumcorrect ?? 0);
            }

        } else if ($qtype === 'truefalse') {
            if ($qtypeoptions !== null && isset($qtypeoptions['correct_answer'])) {
                if (!is_bool($qtypeoptions['correct_answer'])) {
                    throw new \invalid_parameter_exception('True/False questions require a boolean correct_answer in qtype_options_json.');
                }
                $form->correctanswer = $qtypeoptions['correct_answer'] ? 1 : 0;
                $form->feedbacktrue  = ['text' => (string) ($qtypeoptions['feedback_true'] ?? ''), 'format' => FORMAT_HTML];
                $form->feedbackfalse = ['text' => (string) ($qtypeoptions['feedback_false'] ?? ''), 'format' => FORMAT_HTML];
            } else {
                // Find true answer fraction
                $trueans = 0;
                foreach ($currentquestiondata->options->answers as $ans) {
                    if (strcasecmp($ans->answer, 'True') === 0 && (float) $ans->fraction > 0.5) {
                        $trueans = 1;
                    }
                }
                $form->correctanswer = $trueans;
                $form->feedbacktrue  = ['text' => '', 'format' => FORMAT_HTML];
                $form->feedbackfalse = ['text' => '', 'format' => FORMAT_HTML];
            }
            $form->showstandardinstruction = 0;

        } else if ($qtype === 'shortanswer') {
            if ($qtypeoptions !== null && isset($qtypeoptions['accepted_answers'])) {
                $accepted = $qtypeoptions['accepted_answers'];
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
            } else {
                $answers = [];
                $fractions = [];
                $feedbacks = [];
                foreach ($currentquestiondata->options->answers as $ans) {
                    $answers[]   = (string) $ans->answer;
                    $fractions[] = (float) $ans->fraction;
                    $feedbacks[] = ['text' => (string) ($ans->feedback ?? ''), 'format' => FORMAT_HTML];
                }
                $form->answer   = $answers;
                $form->fraction = $fractions;
                $form->feedback = $feedbacks;
                $form->usecase  = $currentquestiondata->options->usecase ?? 0;
            }

        } else if ($qtype === 'essay') {
            $form->responseformat     = $qtypeoptions['response_format'] ?? ($currentquestiondata->options->responseformat ?? 'editor');
            $form->responserequired   = 1;
            $form->responsefieldlines = 15;
            $form->attachments        = 0;
            $form->attachmentsrequired = 0;
            $form->maxbytes           = 0;
            $form->minwordlimit       = $qtypeoptions['min_word_limit'] ?? ($currentquestiondata->options->minwordlimit ?? null);
            $form->maxwordlimit       = $qtypeoptions['max_word_limit'] ?? ($currentquestiondata->options->maxwordlimit ?? null);
            $form->graderinfo         = [
                'text'   => (string) ($qtypeoptions['grading_guidance'] ?? ($currentquestiondata->options->graderinfo ?? '')),
                'format' => FORMAT_HTML,
            ];
            $form->responsetemplate   = [
                'text'   => (string) ($currentquestiondata->options->responsetemplate ?? ''),
                'format' => FORMAT_HTML,
            ];
        }

        // 7. Save question (creates new concrete question ID and version under the same bank entry).
        // Keep version and slot-grade changes atomic if either supported API fails.
        $transaction = $DB->start_delegated_transaction();
        $qtypeobj = question_bank::get_qtype($qtype);
        $savedquestion = $qtypeobj->save_question($question, $form);

        // 8. Retrieve updated version metadata (P7-D4).
        $versioninfo = helper::get_question_version_info($savedquestion->id);
        if ($targetslot !== null) {
            $quizstructure->update_slot_version((int) $targetslot->id, (int) $versioninfo->version);
            $quizstructure->update_slot_maxmark($targetslot, $params['maxmark']);
            $calculator = $quizobj->get_grade_calculator();
            $calculator->recompute_quiz_sumgrades();
            $calculator->recompute_all_attempt_sumgrades();
            $calculator->recompute_all_final_grades();
            quiz_update_grades($quizobj->get_quiz());
        }
        $transaction->allow_commit();

        return [
            'question_bank_entry_id' => (int) $versioninfo->questionbankentryid,
            'previous_question_id'   => (int) $currentquestionid,
            'question_id'            => (int) $savedquestion->id,
            'version'                => (int) $versioninfo->version,
            'name'                   => (string) $savedquestion->name,
            'qtype'                  => (string) $qtype,
            'defaultmark'            => (float) $savedquestion->defaultmark,
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
            'previous_question_id'   => new external_value(PARAM_INT, 'Previous version concrete question ID'),
            'question_id'            => new external_value(PARAM_INT, 'Newly created version concrete question ID'),
            'version'                => new external_value(PARAM_INT, 'New question version number'),
            'name'                   => new external_value(PARAM_TEXT, 'Updated question name'),
            'qtype'                  => new external_value(PARAM_PLUGIN, 'Question type'),
            'defaultmark'            => new external_value(PARAM_FLOAT, 'Default mark value'),
        ]);
    }
}
