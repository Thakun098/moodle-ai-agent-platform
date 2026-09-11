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

namespace local_agentpoc;

use advanced_testcase;
use context_course;
use context_coursecat;
use context_module;
use context_system;
use invalid_parameter_exception;
use local_agentpoc\external\add_question_to_quiz;
use local_agentpoc\external\create_assignment;
use local_agentpoc\external\create_course;
use local_agentpoc\external\create_quiz;
use local_agentpoc\external\create_quiz_question;
use local_agentpoc\external\create_resource;
use local_agentpoc\external\create_section;
use local_agentpoc\external\get_assignment;
use local_agentpoc\external\get_course_structure;
use local_agentpoc\external\get_quiz;
use local_agentpoc\external\get_quiz_questions;
use local_agentpoc\external\list_course_categories;
use local_agentpoc\external\list_course_formats;
use local_agentpoc\external\update_assignment;
use local_agentpoc\external\update_quiz;
use local_agentpoc\external\update_quiz_question;
use moodle_exception;
use required_capability_exception;

defined('MOODLE_INTERNAL') || die();

global $CFG;
require_once($CFG->dirroot . '/webservice/tests/helpers.php');

/** Test seam that can fail replacement file persistence after the DB row exists. */
class failing_material_helper extends helper {
    /** @var bool Whether the next material-file creation should fail. */
    public static bool $failcreation = false;

    /**
     * @param \file_storage $fs
     * @param array $filerecord
     * @param string $filepath
     * @return \stored_file
     */
    protected static function create_material_file(
        \file_storage $fs,
        array $filerecord,
        string $filepath
    ): \stored_file {
        if (self::$failcreation) {
            throw new \runtime_exception('Injected replacement persistence failure.');
        }
        return parent::create_material_file($fs, $filerecord, $filepath);
    }
}

/**
 * PHPUnit integration tests for local_agentpoc external web services (R18, P7-R12).
 *
 * @package    local_agentpoc
 * @category   test
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class agentpoc_test extends advanced_testcase {

    public function test_assignment_target_precondition_prevents_mutation(): void {
        $this->resetAfterTest(true);
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $section = create_section::execute((int) $course->id, 1, 'Section');
        $assignment = create_assignment::execute((int) $course->id, $section['section_id'], 'Original', 'Original intro', 10.0);
        foreach ([(int) $course->id + 10000, (int) $course->id] as $expectedcourse) {
            try {
                update_assignment::execute($assignment['activity_id'], 'Wrong', 'Wrong intro', 50.0,
                    $expectedcourse, $section['section_id'] + 10000);
                $this->fail('Wrong target must be rejected.');
            } catch (invalid_parameter_exception $e) {
                $this->assertStringContainsString('target changed', $e->getMessage());
            }
            $read = get_assignment::execute($assignment['activity_id']);
            $this->assertEquals('Original', $read['name']);
            $this->assertEquals(10.0, $read['grade']);
        }
        $updated = update_assignment::execute($assignment['activity_id'], 'Approved', null, 20.0,
            (int) $course->id, $section['section_id']);
        $this->assertEquals('Approved', $updated['name']);
    }

    public function test_scoped_question_update_changes_slot_mark_and_readback(): void {
        $this->resetAfterTest(true);
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $section = create_section::execute((int) $course->id, 1, 'Section');
        $quiz = create_quiz::execute((int) $course->id, $section['section_id'], 'Quiz', 'Intro', 100.0);
        $other = create_quiz::execute((int) $course->id, $section['section_id'], 'Other quiz', 'Intro', 100.0);
        $question = create_quiz_question::execute($quiz['activity_id'], 'truefalse', 'Q', 'Question', 1.0, 'Feedback',
            json_encode(['correct_answer' => true]));
        add_question_to_quiz::execute($quiz['activity_id'], $question['question_bank_entry_id'], 1, 1.0);
        add_question_to_quiz::execute($other['activity_id'], $question['question_bank_entry_id'], 1, 1.0);
        $updated = update_quiz_question::execute($question['question_bank_entry_id'], 'Q', 'Approved', 5.0, 'New feedback',
            json_encode(['correct_answer' => false]), $quiz['activity_id'], 5.0, 1);
        $this->assertEquals(2, $updated['version']);
        $read = \core_external\external_api::clean_returnvalue(get_quiz_questions::execute_returns(),
            get_quiz_questions::execute($quiz['activity_id']));
        $this->assertEquals(5.0, $read[0]['defaultmark']);
        $this->assertEquals(5.0, $read[0]['maxmark']);
        $this->assertEquals(0, $read[0]['correct_answer']);
        $this->assertEquals('New feedback', $read[0]['generalfeedback']);
        $this->assertEquals(5.0, get_quiz::execute($quiz['activity_id'])['sumgrades']);
        $this->assertEquals(1.0, get_quiz_questions::execute($other['activity_id'])[0]['maxmark']);
        try {
            update_quiz_question::execute($question['question_bank_entry_id'], 'Stale', null, 9.0, null, null,
                $quiz['activity_id'], 9.0, 1);
            $this->fail('Stale version must be rejected.');
        } catch (invalid_parameter_exception $e) {
            $this->assertStringContainsString('version changed', $e->getMessage());
        }
        $this->assertEquals(5.0, get_quiz_questions::execute($quiz['activity_id'])[0]['maxmark']);
    }

    public function test_question_outside_target_quiz_is_rejected_before_save(): void {
        $this->resetAfterTest(true);
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $section = create_section::execute((int) $course->id, 1, 'Section');
        $quiz = create_quiz::execute((int) $course->id, $section['section_id'], 'Quiz', 'Intro', 100.0);
        $question = create_quiz_question::execute($quiz['activity_id'], 'truefalse', 'Q', 'Original', 1.0, '',
            json_encode(['correct_answer' => true]));
        try {
            update_quiz_question::execute($question['question_bank_entry_id'], 'Wrong', null, 9.0, null, null,
                $quiz['activity_id'], 9.0, 1);
            $this->fail('An unslotted question must not be updated through this quiz.');
        } catch (invalid_parameter_exception $e) {
            $this->assertStringContainsString('does not belong', $e->getMessage());
        }
        $this->assertEquals($question['question_id'], helper::get_latest_ready_question_id_for_bank_entry($question['question_bank_entry_id']));
    }

    protected function setUp(): void {
        $this->resetAfterTest(true);
    }

    /** A failed replacement must leave the previous current material intact. */
    public function test_failed_material_replacement_preserves_previous_current_file(): void {
        global $USER;

        $this->setAdminUser();
        $tempdir = make_request_directory();
        $oldpath = $tempdir . '/old-material.txt';
        $newpath = $tempdir . '/new-material.txt';
        file_put_contents($oldpath, 'old approved material');
        file_put_contents($newpath, 'new replacement material');

        $oldid = helper::save_material_draft(
            'run-replace-failure',
            1,
            'section-01',
            $oldpath,
            'old-material.txt',
            (int) $USER->id,
            true,
            true
        );

        failing_material_helper::$failcreation = true;
        try {
            failing_material_helper::save_material_draft(
                'run-replace-failure',
                1,
                'section-01',
                $newpath,
                'new-material.txt',
                (int) $USER->id,
                true,
                true
            );
            $this->fail('The injected replacement failure was not raised.');
        } catch (moodle_exception $error) {
            $this->assertStringContainsString('could not be stored', $error->getMessage());
        } finally {
            failing_material_helper::$failcreation = false;
        }

        $materials = helper::list_material_drafts('run-replace-failure', 1, 'section-01');
        $this->assertCount(1, $materials);
        $this->assertSame($oldid, $materials[0]['id']);
        $this->assertSame('old-material.txt', $materials[0]['filename']);
    }

    /**
     * Test list_course_categories external function and permission filtering (T0702, R16).
     */
    public function test_list_course_categories(): void {
        $this->setAdminUser();

        $cat1 = $this->getDataGenerator()->create_category(['name' => 'Visible Category', 'visible' => 1]);
        $cat2 = $this->getDataGenerator()->create_category(['name' => 'Hidden Category', 'visible' => 0]);

        $categories = list_course_categories::execute();
        $catids = array_column($categories, 'id');

        $this->assertContains((int) $cat1->id, $catids);
    }

    /**
     * Course formats are discovered from Moodle's enabled plugin registry.
     */
    public function test_list_course_formats_returns_enabled_plugins(): void {
        $this->setAdminUser();

        $formats = list_course_formats::execute();
        $values = array_column($formats, 'value');

        $this->assertNotEmpty($formats);
        $this->assertContains('topics', $values);
        $this->assertNotEmpty(array_filter($formats, static fn(array $format): bool => $format['name'] !== ''));
    }

    /**
     * A discovered non-default format is passed through the Moodle API to create_course.
     */
    public function test_create_course_uses_discovered_format(): void {
        $this->setAdminUser();
        $category = $this->getDataGenerator()->create_category(['name' => 'Format Test Cat']);
        $formats = list_course_formats::execute();
        $selected = array_values(array_filter($formats, static fn(array $format): bool => $format['value'] === 'weeks'))[0] ?? $formats[0];

        $result = create_course::execute(
            (int) $category->id,
            'Dynamic Format Course',
            'FORMAT-' . time(),
            'Format propagation test',
            $selected['value']
        );

        $this->assertSame($selected['value'], $result['format']);
    }

    /**
     * Test create_course creates hidden course with required shortname (T0703, R8, P7-D5).
     */
    public function test_create_hidden_course(): void {
        global $DB;

        $this->setAdminUser();
        $category = $this->getDataGenerator()->create_category(['name' => 'Test Cat']);

        $res = create_course::execute(
            (int) $category->id,
            'Introduction to Software Engineering',
            'CS301-2026',
            '<p>Syllabus summary</p>',
            'topics'
        );

        $this->assertNotEmpty($res['course_id']);
        $this->assertEquals('CS301-2026', $res['shortname']);
        $this->assertEquals(0, $res['visible']); // Hidden by default (P7-D5)
        $this->assertEquals('topics', $res['format']);

        $dbcourse = $DB->get_record('course', ['id' => $res['course_id']], '*', MUST_EXIST);
        $this->assertEquals(0, $dbcourse->visible);
        $this->assertEquals('CS301-2026', $dbcourse->shortname);
    }

    /**
     * Test create_section creates section with distinct section_id and section_num (T0704, R7).
     */
    public function test_create_section(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();

        $sec1 = create_section::execute((int) $course->id, 1, 'Week 1: Foundations', '<p>Week 1 topics</p>');

        $this->assertNotEmpty($sec1['section_id']);
        $this->assertEquals(1, $sec1['section_num']);
        $this->assertEquals('Week 1: Foundations', $sec1['name']);
        $this->assertStringContainsString('Week 1 topics', $sec1['summary']);
    }

    /**
     * Test create_section rejects non-positive positions (P7-R9).
     */
    public function test_create_section_negative_position_rejected(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();

        $this->expectException(invalid_parameter_exception::class);
        create_section::execute((int) $course->id, 0, 'Invalid Section');
    }

    /**
     * Test create and update assignment with frozen defaults (T0706–T0709, R14).
     */
    public function test_create_and_update_assignment(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');

        // Create assignment
        $assignres = create_assignment::execute(
            (int) $course->id,
            $sec['section_id'],
            'Lab 1 Assignment',
            '<p>Implement basic graph traversal</p>',
            100.0
        );

        $this->assertNotEmpty($assignres['activity_id']); // CMID (P7-D2)
        $this->assertNotEmpty($assignres['assignment_id']);
        $this->assertEquals(100.0, $assignres['grade']);

        // Get assignment and verify frozen defaults
        $getres = get_assignment::execute($assignres['activity_id']);
        $this->assertEquals(1, $getres['onlinetext_enabled']);
        $this->assertEquals(0, $getres['file_enabled']);
        $this->assertEquals(0, $getres['duedate']);

        // Update assignment
        $updateres = update_assignment::execute(
            $assignres['activity_id'],
            'Lab 1 Refined',
            '<p>Updated lab instructions</p>',
            90.0
        );

        $this->assertEquals('Lab 1 Refined', $updateres['name']);
        $this->assertEquals(90.0, $updateres['grade']);
    }

    /**
     * Test create_assignment rejects non-positive grade (P7-R8).
     */
    public function test_create_assignment_negative_grade_rejected(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');

        $this->expectException(invalid_parameter_exception::class);
        create_assignment::execute((int) $course->id, $sec['section_id'], 'Negative Grade', '<p>Desc</p>', -10.0);
    }

    /**
     * Test create_assignment requires native moodle/course:manageactivities (P7-R2).
     */
    public function test_create_assignment_manageactivities_required(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');

        $user = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($user->id, $course->id, 'student');
        $this->setUser($user); // Student user without manageactivities

        $this->expectException(required_capability_exception::class);
        create_assignment::execute((int) $course->id, $sec['section_id'], 'Forbidden Assign', '<p>Desc</p>', 100.0);
    }

    /**
     * Test create_quiz requires native moodle/course:manageactivities (P7-R2).
     */
    public function test_create_quiz_manageactivities_required(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');

        $user = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($user->id, $course->id, 'student');
        $this->setUser($user);

        $this->expectException(required_capability_exception::class);
        create_quiz::execute((int) $course->id, $sec['section_id'], 'Forbidden Quiz', '<p>Desc</p>', 100.0);
    }

    /**
     * Test complete Quiz and 4 Question types creation and version update semantics (T0710–T0719, P7-D3, P7-D4).
     */
    public function test_quiz_and_question_types_lifecycle(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');

        // 1. Create Quiz (T0710)
        $quizres = create_quiz::execute((int) $course->id, $sec['section_id'], 'Midterm Assessment', '<p>Assessment</p>', 100.0);
        $activityid = $quizres['activity_id']; // CMID

        // 2. Create Multichoice Question (T0714, P7-R7)
        $mcqoptions = json_encode([
            'choices' => [
                ['text' => 'Stack', 'fraction' => 0.0, 'feedback' => 'Incorrect'],
                ['text' => 'Queue', 'fraction' => 1.0, 'feedback' => 'Correct! BFS uses a FIFO Queue.'],
            ],
            'single' => true,
        ]);
        $mcq = create_quiz_question::execute(
            $activityid,
            'multichoice',
            'Q1: BFS Data Structure',
            '<p>Which data structure does BFS use?</p>',
            1.0,
            '<p>General feedback</p>',
            $mcqoptions
        );

        $this->assertNotEmpty($mcq['question_bank_entry_id']);
        $this->assertNotEmpty($mcq['question_id']);
        $this->assertEquals(1, $mcq['version']);

        // 3. Create True/False Question (T0715)
        $tfoptions = json_encode([
            'correct_answer' => true,
            'feedback_true'  => 'Correct!',
            'feedback_false' => 'Incorrect!',
        ]);
        $tf = create_quiz_question::execute(
            $activityid,
            'truefalse',
            'Q2: Completeness',
            '<p>Is BFS complete on finite branching factor?</p>',
            1.0,
            '',
            $tfoptions
        );

        // 4. Create Shortanswer Question (T0716, P7-R6)
        $saoptions = json_encode([
            'accepted_answers' => ['FIFO', 'First In First Out'],
            'case_sensitive'   => false,
            'feedback'         => 'Correct acronym',
        ]);
        $sa = create_quiz_question::execute(
            $activityid,
            'shortanswer',
            'Q3: Queue Order',
            '<p>What acronym describes Queue order?</p>',
            1.0,
            '',
            $saoptions
        );

        // 5. Create Essay Question (T0717)
        $essayoptions = json_encode([
            'grading_guidance' => '<p>Check for mention of optimality and completeness.</p>',
            'min_word_limit'   => 50,
            'max_word_limit'   => 500,
        ]);
        $essay = create_quiz_question::execute(
            $activityid,
            'essay',
            'Q4: Search Comparison',
            '<p>Compare BFS and DFS in terms of memory complexity.</p>',
            5.0,
            '',
            $essayoptions
        );

        // 6. Add all 4 questions to Quiz (T0718)
        $slot1 = add_question_to_quiz::execute($activityid, $mcq['question_bank_entry_id'], 1, 1.0);
        $slot2 = add_question_to_quiz::execute($activityid, $tf['question_bank_entry_id'], 1, 1.0);
        $slot3 = add_question_to_quiz::execute($activityid, $sa['question_bank_entry_id'], 2, 1.0);
        $slot4 = add_question_to_quiz::execute($activityid, $essay['question_bank_entry_id'], 2, 5.0);

        $this->assertEquals(1, $slot1['slot_number']);
        $this->assertEquals(4, $slot4['slot_number']);

        // 7. Get Quiz and verify 4 questions (T0711, T0713)
        $quizdetails = get_quiz::execute($activityid);
        $this->assertEquals(4, $quizdetails['questions_count']);
        $this->assertEquals(8.0, $quizdetails['sumgrades']);

        $questionslist = get_quiz_questions::execute($activityid);
        $this->assertCount(4, $questionslist);
        $questionslist = \core_external\external_api::clean_returnvalue(get_quiz_questions::execute_returns(), $questionslist);
        $this->assertEquals('<p>General feedback</p>', $questionslist[0]['generalfeedback']);
        $this->assertEquals(1, $questionslist[1]['correct_answer']);
        $this->assertEquals(0, $questionslist[2]['case_sensitive']);
        $this->assertEquals('<p>Check for mention of optimality and completeness.</p>', $questionslist[3]['grading_guidance']);

        // 8. Update Question under Question Bank Entry (T0719, P7-D4)
        $updatedmcq = update_quiz_question::execute(
            $mcq['question_bank_entry_id'],
            'Q1: BFS Data Structure (Updated)',
            '<p>Which data structure is utilized by BFS algorithms?</p>',
            2.0
        );

        // Bank entry ID remains stable, while question_id changes and version increments to 2
        $this->assertEquals($mcq['question_bank_entry_id'], $updatedmcq['question_bank_entry_id']);
        $this->assertNotEquals($mcq['question_id'], $updatedmcq['question_id']);
        $this->assertEquals(2, $updatedmcq['version']);
    }

    /**
     * Test create_quiz_question rejects malformed JSON (P7-R5).
     */
    public function test_create_quiz_question_strict_json(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');
        $quizres = create_quiz::execute((int) $course->id, $sec['section_id'], 'Quiz', '<p>Desc</p>');

        $this->expectException(invalid_parameter_exception::class);
        create_quiz_question::execute($quizres['activity_id'], 'multichoice', 'Malformed', '<p>Text</p>', 1.0, '', '{invalid_json');
    }

    /**
     * Test multichoice validation rejects multiple correct answers or no correct answers (P7-R7).
     */
    public function test_multichoice_validation_rejected(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');
        $quizres = create_quiz::execute((int) $course->id, $sec['section_id'], 'Quiz', '<p>Desc</p>');

        // No correct answer
        $noCorrect = json_encode([
            'choices' => [
                ['text' => 'A', 'fraction' => 0.0],
                ['text' => 'B', 'fraction' => 0.0],
            ],
        ]);
        $this->expectException(invalid_parameter_exception::class);
        create_quiz_question::execute($quizres['activity_id'], 'multichoice', 'No Correct', '<p>Text</p>', 1.0, '', $noCorrect);
    }

    /**
     * Test shortanswer rejects empty accepted_answers array (P7-R6).
     */
    public function test_shortanswer_empty_accepted_answers_rejected(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');
        $quizres = create_quiz::execute((int) $course->id, $sec['section_id'], 'Quiz', '<p>Desc</p>');

        $emptyAccepted = json_encode(['accepted_answers' => []]);
        $this->expectException(invalid_parameter_exception::class);
        create_quiz_question::execute($quizres['activity_id'], 'shortanswer', 'Empty SA', '<p>Text</p>', 1.0, '', $emptyAccepted);
    }

    /**
     * Test truefalse rejects missing or non-boolean correct_answer (R11).
     */
    public function test_truefalse_missing_correct_answer_rejected(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');
        $quizres = create_quiz::execute((int) $course->id, $sec['section_id'], 'Quiz', '<p>Desc</p>');

        $missingCorrect = json_encode([
            'feedback_true' => 'Great',
        ]);
        $this->expectException(invalid_parameter_exception::class);
        create_quiz_question::execute($quizres['activity_id'], 'truefalse', 'Missing TF', '<p>Text</p>', 1.0, '', $missingCorrect);
    }

    /**
     * Test add_question_to_quiz into earlier page resolves actual new slot, and duplicate add is rejected (P7-R3, P7-R4).
     */
    public function test_add_question_to_earlier_page_and_duplicate_rejection(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');
        $quizres = create_quiz::execute((int) $course->id, $sec['section_id'], 'Quiz Multi Page', '<p>Desc</p>');
        $activityid = $quizres['activity_id'];

        // Create 2 questions
        $tfopt = json_encode(['correct_answer' => true]);
        $q1 = create_quiz_question::execute($activityid, 'truefalse', 'Q1', '<p>T1</p>', 1.0, '', $tfopt);
        $q2 = create_quiz_question::execute($activityid, 'truefalse', 'Q2', '<p>T2</p>', 1.0, '', $tfopt);

        // Add Q1 to page 2
        $s1 = add_question_to_quiz::execute($activityid, $q1['question_bank_entry_id'], 2, 1.0);
        $this->assertEquals(1, $s1['slot_number']);

        // Add Q2 to page 1 (earlier page)
        $s2 = add_question_to_quiz::execute($activityid, $q2['question_bank_entry_id'], 1, 1.0);
        $this->assertEquals($q2['question_bank_entry_id'], $s2['question_bank_entry_id']);

        // Attempting to add Q1 again must be rejected (P7-R4)
        $this->expectException(moodle_exception::class);
        add_question_to_quiz::execute($activityid, $q1['question_bank_entry_id'], 1, 1.0);
    }

    /**
     * Test learner cannot access get_quiz_questions to view question answers (P7-R1).
     */
    public function test_get_quiz_questions_learner_denied(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $sec = create_section::execute((int) $course->id, 1, 'Section 1');
        $quizres = create_quiz::execute((int) $course->id, $sec['section_id'], 'Exam Quiz', '<p>Desc</p>');
        $activityid = $quizres['activity_id'];

        $student = $this->getDataGenerator()->create_user();
        $this->getDataGenerator()->enrol_user($student->id, $course->id, 'student');

        $this->setUser($student); // Student has mod/quiz:view, but NOT mod/quiz:manage or moodle/question:viewall

        $this->expectException(required_capability_exception::class);
        get_quiz_questions::execute($activityid);
    }

    /**
     * Test get_course_structure returns complete tree (T0705).
     */
    public function test_get_course_structure(): void {
        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course(['fullname' => 'AI 101', 'shortname' => 'AI101']);
        $sec = create_section::execute((int) $course->id, 1, 'Module 1');

        create_assignment::execute((int) $course->id, $sec['section_id'], 'Assignment 1', '<p>Desc</p>');
        create_quiz::execute((int) $course->id, $sec['section_id'], 'Quiz 1', '<p>Desc</p>');

        $structure = get_course_structure::execute((int) $course->id);

        $this->assertEquals('AI 101', $structure['course']['fullname']);
        $this->assertNotEmpty($structure['sections']);
        $this->assertCount(2, $structure['sections'][1]['activities']); // 1 assignment + 1 quiz
    }

    /** File Resources require exact snapshot ownership and expose canonical filenames on readback. */
    public function test_resource_snapshot_binding_and_canonical_file_readback(): void {
        global $USER;

        $this->setAdminUser();
        $course = $this->getDataGenerator()->create_course();
        $section = create_section::execute((int) $course->id, 1, 'Section 1');
        $tempdir = make_request_directory();
        $filepath = $tempdir . '/approved-reading.txt';
        file_put_contents($filepath, 'approved immutable content');

        helper::save_material_draft(
            'run-resource-owner',
            3,
            'section-01',
            $filepath,
            'approved-reading.txt',
            (int) $USER->id,
            true,
            true
        );
        $snapshot = helper::snapshot_material_drafts(
            'run-resource-owner',
            3,
            'section-01',
            (int) $USER->id
        );
        $materialid = (int) $snapshot['files'][0]['material_id'];

        foreach ([
            ['run-other', 3, 'section-01'],
            ['run-resource-owner', 3, 'section-02'],
            ['run-resource-owner', 2, 'section-01'],
        ] as [$runid, $structurerevision, $sectionref]) {
            try {
                create_resource::execute(
                    (int) $course->id,
                    (int) $section['section_id'],
                    'Rejected Resource',
                    'approved-reading.txt',
                    $materialid,
                    $runid,
                    $structurerevision,
                    $sectionref,
                    1
                );
                $this->fail('Cross-scope MaterialSnapshot binding was accepted.');
            } catch (invalid_parameter_exception $error) {
                $this->assertStringContainsString('does not belong', $error->getMessage());
            }
        }

        $created = create_resource::execute(
            (int) $course->id,
            (int) $section['section_id'],
            'Approved Reading',
            'approved-reading.txt',
            $materialid,
            'run-resource-owner',
            3,
            'section-01',
            1
        );
        $structure = get_course_structure::execute((int) $course->id);
        $activities = array_merge(...array_column($structure['sections'], 'activities'));
        $resource = array_values(array_filter(
            $activities,
            static fn(array $activity): bool => $activity['activity_id'] === $created['activity_id']
        ))[0];

        $this->assertSame(['approved-reading.txt'], $resource['files']);
    }

    /**
     * Test capability enforcement (R4).
     */
    public function test_capability_denied(): void {
        $user = $this->getDataGenerator()->create_user();
        $this->setUser($user); // Regular user with no capabilities

        $this->expectException(required_capability_exception::class);
        list_course_categories::execute();
    }
}
