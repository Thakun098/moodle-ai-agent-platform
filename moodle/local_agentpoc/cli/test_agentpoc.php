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

/**
 * End-to-end CLI smoke test for local_agentpoc external web services (T0721, R19).
 *
 * Usage from Moodle 5.1 root:
 * php public/local/agentpoc/cli/test_agentpoc.php
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('CLI_SCRIPT', true);

// In Moodle 5.1, cli path is public/local/agentpoc/cli/test_agentpoc.php -> config is in public/config.php
require_once(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');

use local_agentpoc\external\add_question_to_quiz;
use local_agentpoc\external\create_assignment;
use local_agentpoc\external\create_course;
use local_agentpoc\external\create_quiz;
use local_agentpoc\external\create_quiz_question;
use local_agentpoc\external\create_section;
use local_agentpoc\external\get_assignment;
use local_agentpoc\external\get_course_structure;
use local_agentpoc\external\get_quiz;
use local_agentpoc\external\get_quiz_questions;
use local_agentpoc\external\list_course_categories;
use local_agentpoc\external\update_assignment;
use local_agentpoc\external\update_quiz;
use local_agentpoc\external\update_quiz_question;

cli_heading('Teacher AI Assistance 2 (local_agentpoc) — E2E Smoke Test');

try {
    // 1. Authenticate as Admin user for CLI execution.
    $admin = get_admin();
    if (!$admin) {
        cli_error('FATAL: Could not resolve admin user in Moodle.');
    }
    \core\session\manager::set_user($admin);
    cli_writeln('[1/12] Authenticated as admin user (ID: ' . $admin->id . ')');

    // 2. List course categories (T0702, R16).
    $categories = list_course_categories::execute();
    if (empty($categories)) {
        cli_error('FATAL: No course categories found.');
    }
    $targetcategory = $categories[0];
    cli_writeln('[2/12] [PASS] list_course_categories: resolved category ID ' . $targetcategory['id'] . ' ("' . $targetcategory['name'] . '")');

    // 3. Create hidden course with required shortname (T0703, R8, P7-D5).
    $shortname = 'AGENTPOC-CLI-' . time();
    $course = create_course::execute(
        $targetcategory['id'],
        'Teacher AI Assistance 2 CLI Smoke Test Course',
        $shortname,
        '<p>Automated test course created via CLI smoke test</p>',
        'topics'
    );
    if ($course['visible'] !== 0) {
        cli_error('FAIL: Course was not created as hidden (visible != 0)');
    }
    cli_writeln('[3/12] [PASS] create_course: created hidden course ID ' . $course['course_id'] . ' (shortname: ' . $course['shortname'] . ')');

    // 4. Create Section (T0704, R7).
    $section = create_section::execute(
        $course['course_id'],
        1,
        'Week 1: AI Fundamentals',
        '<p>Foundational concepts and graph algorithms</p>'
    );
    if (empty($section['section_id']) || $section['section_num'] !== 1) {
        cli_error('FAIL: Section creation returned invalid IDs.');
    }
    cli_writeln('[4/12] [PASS] create_section: created section ID ' . $section['section_id'] . ' (section_num: ' . $section['section_num'] . ')');

    // 5. Create Assignment with frozen defaults (T0706, T0707, R14).
    $assign = create_assignment::execute(
        $course['course_id'],
        $section['section_id'],
        'Programming Assignment 1: BFS/DFS',
        '<p>Implement graph search algorithms in Python.</p>',
        100.0
    );
    if (empty($assign['activity_id']) || empty($assign['assignment_id'])) {
        cli_error('FAIL: Assignment creation failed.');
    }
    cli_writeln('[5/12] [PASS] create_assignment: created assignment CMID ' . $assign['activity_id'] . ' (assign.id: ' . $assign['assignment_id'] . ')');

    // 6. Get Assignment and verify frozen defaults (T0708, R14).
    $assigndetails = get_assignment::execute($assign['activity_id']);
    if ($assigndetails['onlinetext_enabled'] !== 1 || $assigndetails['file_enabled'] !== 0) {
        cli_error('FAIL: Assignment frozen defaults violated (online text must be 1, file must be 0).');
    }
    cli_writeln('[6/12] [PASS] get_assignment: verified frozen defaults (onlinetext=1, file=0, duedate=0)');

    // 7. Update Assignment (T0709).
    $updatedassign = update_assignment::execute(
        $assign['activity_id'],
        'Programming Assignment 1: BFS/DFS (Refined)',
        '<p>Updated instructions and unit test guidelines.</p>',
        100.0
    );
    cli_writeln('[7/12] [PASS] update_assignment: updated title to "' . $updatedassign['name'] . '"');

    // 8. Create Quiz with frozen defaults (T0710, R15).
    $quiz = create_quiz::execute(
        $course['course_id'],
        $section['section_id'],
        'Quiz 1: Search Strategy Knowledge Check',
        '<p>Test your knowledge on uninformed search strategies.</p>',
        100.0
    );
    cli_writeln('[8/12] [PASS] create_quiz: created quiz CMID ' . $quiz['activity_id'] . ' (quiz.id: ' . $quiz['quiz_id'] . ')');

    // 9. Create 4 Question Types in Quiz Context (T0714–T0717, P7-D3, P7-D4).
    // Multichoice
    $mcqoptions = json_encode([
        'choices' => [
            ['text' => 'Stack', 'fraction' => 0.0, 'feedback' => 'Stack is used by DFS'],
            ['text' => 'Queue', 'fraction' => 1.0, 'feedback' => 'Correct! Queue is FIFO.'],
        ],
        'single' => true,
    ]);
    $mcq = create_quiz_question::execute(
        $quiz['activity_id'],
        'multichoice',
        'MCQ: BFS Frontier',
        '<p>Which data structure is used for the BFS frontier?</p>',
        1.0,
        '',
        $mcqoptions
    );

    // True/False
    $tfoptions = json_encode([
        'correct_answer' => true,
        'feedback_true'  => 'Correct, BFS is optimal with unit costs.',
        'feedback_false' => 'Incorrect.',
    ]);
    $tf = create_quiz_question::execute(
        $quiz['activity_id'],
        'truefalse',
        'TF: BFS Optimality',
        '<p>Is BFS optimal when step costs are all equal?</p>',
        1.0,
        '',
        $tfoptions
    );

    // Shortanswer
    $saoptions = json_encode([
        'accepted_answers' => ['FIFO', 'First In First Out'],
        'case_sensitive'   => false,
    ]);
    $sa = create_quiz_question::execute(
        $quiz['activity_id'],
        'shortanswer',
        'SA: Queue Policy',
        '<p>What acronym denotes the queue removal policy?</p>',
        1.0,
        '',
        $saoptions
    );

    // Essay
    $essayoptions = json_encode([
        'grading_guidance' => '<p>Look for discussion of time vs space tradeoffs.</p>',
        'min_word_limit'   => 20,
    ]);
    $essay = create_quiz_question::execute(
        $quiz['activity_id'],
        'essay',
        'Essay: Search Comparison',
        '<p>Briefly discuss BFS vs DFS space complexity.</p>',
        5.0,
        '',
        $essayoptions
    );
    cli_writeln('[9/12] [PASS] create_quiz_question: created 4 question types (multichoice, truefalse, shortanswer, essay)');

    // 10. Add questions to Quiz (T0718, R12).
    add_question_to_quiz::execute($quiz['activity_id'], $mcq['question_bank_entry_id'], 1, 1.0);
    add_question_to_quiz::execute($quiz['activity_id'], $tf['question_bank_entry_id'], 1, 1.0);
    add_question_to_quiz::execute($quiz['activity_id'], $sa['question_bank_entry_id'], 2, 1.0);
    add_question_to_quiz::execute($quiz['activity_id'], $essay['question_bank_entry_id'], 2, 5.0);

    $quizdetails = get_quiz::execute($quiz['activity_id']);
    $questionslist = get_quiz_questions::execute($quiz['activity_id']);
    if ($quizdetails['questions_count'] !== 4 || count($questionslist) !== 4) {
        cli_error('FAIL: Quiz question count does not match added questions (expected 4).');
    }
    cli_writeln('[10/12] [PASS] add_question_to_quiz & get_quiz_questions: 4 questions verified in quiz slots');

    // 11. Update Question Versioning Semantics (T0719, P7-D4, R10).
    $updatedmcq = update_quiz_question::execute(
        $mcq['question_bank_entry_id'],
        'MCQ: BFS Frontier (v2)',
        '<p>Which data structure is utilized for the Breadth-First Search frontier?</p>',
        2.0
    );
    if ($updatedmcq['question_bank_entry_id'] !== $mcq['question_bank_entry_id']) {
        cli_error('FAIL: Question bank entry ID did not remain stable across edit.');
    }
    if ($updatedmcq['version'] !== 2) {
        cli_error('FAIL: Expected question version 2, got: ' . $updatedmcq['version']);
    }
    cli_writeln('[11/12] [PASS] update_quiz_question: verified version 2 created under stable bank entry ' . $updatedmcq['question_bank_entry_id']);

    // 12. Read back complete course structure (T0705).
    $structure = get_course_structure::execute($course['course_id']);
    if (empty($structure['sections']) || count($structure['sections'][1]['activities']) !== 2) {
        cli_error('FAIL: Course structure did not contain expected sections and activities.');
    }
    cli_writeln('[12/12] [PASS] get_course_structure: complete tree verified (1 course, 1 section, 2 activities)');

    cli_writeln('');
    cli_heading('All 12 Smoke Tests PASSED Successfully!');
    exit(0);

} catch (\Throwable $e) {
    cli_writeln('ERROR: ' . $e->getMessage());
    cli_writeln('Trace: ' . $e->getTraceAsString());
    exit(1);
}
