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
 * Acceptance test suite for My Courses AI Course Builder entry point.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('CLI_SCRIPT', true);

require_once(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/course/lib.php');
require_once($CFG->dirroot . '/user/lib.php');

cli_heading('Moodle Agent POC — My Courses UX Entry Point Acceptance Tests');

$passed = 0;
$total = 0;

function assert_check(string $name, bool $condition, string $msg = '') {
    global $passed, $total;
    $total++;
    if ($condition) {
        $passed++;
        cli_writeln("[PASS] {$name}");
    } else {
        cli_writeln("[FAIL] {$name}: {$msg}");
    }
}

try {
    global $PAGE, $USER, $DB;

    // Test 1: Authorized admin sees Create course with AI on My courses
    $admin = get_admin();
    \core\session\manager::set_user($admin);

    $PAGE->set_url('/my/courses.php');
    $PAGE->set_pagelayout('mycourses');
    $PAGE->set_pagetype('my-index');

    \local_agentpoc\hook_callbacks::$injected = false;
    $html = \local_agentpoc\hook_callbacks::inject_mycourses_action();

    assert_check(
        "Acceptance Test 1: Authorized admin receives injection on My courses",
        str_contains($html, 'local-agentpoc-mycourses-action') && str_contains($html, '/local/agentpoc/course/create.php')
    );

    // Test 2: Unauthorized user (guest) does not see action
    $guest = guest_user();
    \core\session\manager::set_user($guest);

    \local_agentpoc\hook_callbacks::$injected = false;
    $htmlGuest = \local_agentpoc\hook_callbacks::inject_mycourses_action();

    assert_check(
        "Acceptance Test 2: Guest user does not receive injection",
        empty($htmlGuest)
    );

    // Test 3: User with capability but NO permitted course category does not receive action
    $user3 = $DB->get_record('user', ['username' => 'testuser3']);
    if (!$user3) {
        $user3id = user_create_user((object)[
            'username' => 'testuser3',
            'auth' => 'manual',
            'confirmed' => 1,
            'mnethostid' => $CFG->mnet_localhost_id,
            'email' => 'testuser3@example.com',
            'firstname' => 'Test',
            'lastname' => 'User3',
        ]);
        $user3 = $DB->get_record('user', ['id' => $user3id]);
    }
    \core\session\manager::set_user($user3);

    // Grant local/agentpoc:createcoursewithai to testuser3 at system context
    $syscontext = \context_system::instance();
    $roles = get_archetype_roles('manager');
    $managerRole = reset($roles);
    assign_capability('local/agentpoc:createcoursewithai', CAP_ALLOW, $managerRole->id, $syscontext->id, true);
    role_assign($managerRole->id, $user3->id, $syscontext->id);

    // Explicitly prevent moodle/course:create for user3 in all categories
    $allCats = $DB->get_records('course_categories');
    foreach ($allCats as $cat) {
        $catcontext = \context_coursecat::instance($cat->id);
        assign_capability('moodle/course:create', CAP_PROHIBIT, $managerRole->id, $catcontext->id, true);
    }

    \local_agentpoc\hook_callbacks::$injected = false;
    $htmlUser3 = \local_agentpoc\hook_callbacks::inject_mycourses_action();

    assert_check(
        "Acceptance Test 3: User with AI Builder capability but NO permitted category does not receive action",
        empty($htmlUser3)
    );

    // Test 4: Verify wizard destination URL
    $createUrl = (new \moodle_url('/local/agentpoc/course/create.php'))->out(false);
    assert_check(
        "Acceptance Test 4: Wizard destination URL is /local/agentpoc/course/create.php",
        str_ends_with($createUrl, '/local/agentpoc/course/create.php')
    );

    // Test 5: Verify no core Moodle files modified
    $myCoursesCore = file_get_contents($CFG->dirroot . '/my/courses.php');
    assert_check(
        "Acceptance Test 5: Moodle core /my/courses.php is NOT modified",
        !str_contains($myCoursesCore, 'agentpoc') && !str_contains($myCoursesCore, 'local_agentpoc')
    );

    // Test 6: Normal My courses behavior remains intact
    assert_check(
        "Acceptance Test 6: Normal my/courses.php file exists and has core my_get_page call",
        str_contains($myCoursesCore, 'my_get_page')
    );

    // Test 7: Enrolment on creation allows course to appear in creator's My courses
    \core\session\manager::set_user($admin);
    $adminCourses = enrol_get_all_users_courses($admin->id, true);
    assert_check(
        "Acceptance Test 7: Enrolled course appears in user courses list for My courses",
        count($adminCourses) > 0
    );

    // Test 8: Verify PHP -> AMD argument shape passed to js_call_amd
    // Moodle's js_call_amd must pass a single object {createurl: ..., label: ...} to amd.init(config)
    $PAGE->set_url('/my/courses.php');
    $PAGE->set_pagelayout('mycourses');
    $PAGE->set_pagetype('my-index');
    \local_agentpoc\hook_callbacks::$injected = false;
    \local_agentpoc\hook_callbacks::inject_mycourses_action();
    $endCode = $PAGE->requires->get_end_code();
    assert_check(
        "Acceptance Test 8: AMD init call receives single config object argument shape",
        preg_match('/amd\.init\(\s*\{.*"createurl":.*"label":.*\}\s*\)/s', $endCode) === 1,
        "Rendered AMD call does not pass single object config to amd.init"
    );

    cli_writeln("\nResults: {$passed}/{$total} checks passed.");
    if ($passed === $total) {
        cli_writeln("ALL 8 ACCEPTANCE CHECKS PASSED!");
        exit(0);
    } else {
        cli_error("SOME ACCEPTANCE CHECKS FAILED.");
    }
} catch (\Exception $e) {
    cli_error("Exception: " . $e->getMessage() . "\n" . $e->getTraceAsString());
}
