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
 * External function to create a quiz with frozen defaults (T0710, R5, R6, R15).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class create_quiz extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'course_id'  => new external_value(PARAM_INT, 'Course ID to add quiz into', VALUE_REQUIRED),
            'section_id' => new external_value(PARAM_INT, 'Course section database ID (course_sections.id)', VALUE_REQUIRED),
            'name'       => new external_value(PARAM_TEXT, 'Quiz title', VALUE_REQUIRED),
            'intro'      => new external_value(PARAM_RAW, 'Quiz description HTML', VALUE_DEFAULT, ''),
            'grade'      => new external_value(PARAM_FLOAT, 'Maximum grade value (defaults to 100)', VALUE_DEFAULT, 100),
        ]);
    }

    /**
     * Create a quiz using Moodle add_moduleinfo() with frozen defaults (R15).
     *
     * @param int $course_id Course ID
     * @param int $section_id Course section ID (course_sections.id)
     * @param string $name Quiz name
     * @param string $intro Quiz description HTML
     * @param float $grade Quiz maximum grade
     * @return array Created quiz details
     * @throws moodle_exception
     */
    public static function execute(int $course_id, int $section_id, string $name, string $intro = '', float $grade = 100): array {
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
            throw new \invalid_parameter_exception('Quiz grade must be greater than 0.');
        }

        // 2. Validate course exists.
        $course = $DB->get_record('course', ['id' => $params['course_id']], '*', MUST_EXIST);

        // 3. Resolve relative section number from section_id (R7).
        $sectionnum = helper::resolve_section_num_from_section_id($course->id, $params['section_id']);

        // 4. Native Moodle creation gate & context validation (P7-R2).
        [$module, $context, $sectioninfo] = can_add_moduleinfo($course, 'quiz', $sectionnum);
        self::validate_context($context);

        require_capability('local/agentpoc:manage', $context);
        require_capability('mod/quiz:addinstance', $context);

        // 5. Build moduleinfo object with frozen quiz defaults (R15).
        $moduleinfo = new stdClass();
        $moduleinfo->modulename          = 'quiz';
        $moduleinfo->module              = (int) $module->id;
        $moduleinfo->name                = $params['name'];
        $moduleinfo->introeditor         = [
            'text'   => $params['intro'],
            'format' => FORMAT_HTML,
            'itemid' => 0,
        ];
        $moduleinfo->section             = $sectionnum;
        $moduleinfo->visible             = 1;
        $moduleinfo->visibleoncoursepage = 1;
        $moduleinfo->cmidnumber          = '';
        $moduleinfo->groupmode           = 0; // NOGROUPS
        $moduleinfo->groupingid          = 0;
        $moduleinfo->completion          = 0; // COMPLETION_TRACKING_NONE

        // Quiz-specific frozen settings
        $moduleinfo->preferredbehaviour  = 'deferredfeedback';
        $moduleinfo->attempts            = 0; // unlimited attempts
        $moduleinfo->attemptonlast       = 0;
        $moduleinfo->grademethod         = 1; // QUIZ_GRADEHIGHEST
        $moduleinfo->decimalpoints       = 2;
        $moduleinfo->questiondecimalpoints = -1;
        $moduleinfo->shuffleanswers      = 1;
        $moduleinfo->questionsperpage    = 1;
        $moduleinfo->timeopen            = 0;
        $moduleinfo->timeclose           = 0;
        $moduleinfo->timelimit           = 0;
        $moduleinfo->overduehandling     = 'autosubmit';
        $moduleinfo->graceperiod         = 86400;
        $moduleinfo->quizpassword        = '';
        $moduleinfo->subnet              = '';
        $moduleinfo->browsersecurity     = '-';
        $moduleinfo->delay1              = 0;
        $moduleinfo->delay2              = 0;
        $moduleinfo->showuserpicture     = 0;
        $moduleinfo->showblocks          = 0;
        $moduleinfo->navmethod           = 'free';

        // Grade settings
        $moduleinfo->grade               = $params['grade'];
        $moduleinfo->gradepass           = 0;
        $moduleinfo->gradecat            = 0;
        $moduleinfo->sumgrades           = 0;

        // Review options during and after attempt
        $moduleinfo->attemptduring       = 1;
        $moduleinfo->correctnessduring   = 1;
        $moduleinfo->maxmarksduring      = 1;
        $moduleinfo->marksduring         = 1;
        $moduleinfo->specificfeedbackduring = 1;
        $moduleinfo->generalfeedbackduring = 1;
        $moduleinfo->rightanswerduring   = 1;
        $moduleinfo->overallfeedbackduring = 0;

        $moduleinfo->attemptimmediately  = 1;
        $moduleinfo->correctnessimmediately = 1;
        $moduleinfo->maxmarksimmediately = 1;
        $moduleinfo->marksimmediately    = 1;
        $moduleinfo->specificfeedbackimmediately = 1;
        $moduleinfo->generalfeedbackimmediately = 1;
        $moduleinfo->rightanswerimmediately = 1;
        $moduleinfo->overallfeedbackimmediately = 1;

        $moduleinfo->attemptopen         = 1;
        $moduleinfo->correctnessopen     = 1;
        $moduleinfo->maxmarksopen        = 1;
        $moduleinfo->marksopen           = 1;
        $moduleinfo->specificfeedbackopen = 1;
        $moduleinfo->generalfeedbackopen = 1;
        $moduleinfo->rightansweropen     = 1;
        $moduleinfo->overallfeedbackopen = 1;

        $moduleinfo->attemptclosed       = 1;
        $moduleinfo->correctnessclosed   = 1;
        $moduleinfo->maxmarksclosed      = 1;
        $moduleinfo->marksclosed         = 1;
        $moduleinfo->specificfeedbackclosed = 1;
        $moduleinfo->generalfeedbackclosed = 1;
        $moduleinfo->rightanswerclosed   = 1;
        $moduleinfo->overallfeedbackclosed = 1;

        // 7. Execute creation via Moodle core API (T0720).
        $createdinfo = add_moduleinfo($moduleinfo, $course);

        return [
            'activity_id' => (int) $createdinfo->coursemodule, // P7-D2: CMID is canonical activity_id
            'quiz_id'     => (int) $createdinfo->instance,
            'name'        => (string) $createdinfo->name,
            'section_id'  => (int) $params['section_id'],
            'grade'       => (float) $params['grade'],
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'activity_id' => new external_value(PARAM_INT, 'Canonical activity ID (course_modules.id)'),
            'quiz_id'     => new external_value(PARAM_INT, 'Quiz table instance ID (quiz.id)'),
            'name'        => new external_value(PARAM_TEXT, 'Quiz title'),
            'section_id'  => new external_value(PARAM_INT, 'Section database ID (course_sections.id)'),
            'grade'       => new external_value(PARAM_FLOAT, 'Maximum grade value'),
        ]);
    }
}
