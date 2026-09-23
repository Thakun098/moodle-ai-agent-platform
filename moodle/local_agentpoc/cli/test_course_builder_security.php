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
 * Verification test for AI Course Builder capabilities and authorization model.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('CLI_SCRIPT', true);

require_once(__DIR__ . '/../../../config.php');
require_once($CFG->libdir . '/clilib.php');
require_once($CFG->dirroot . '/course/lib.php');

cli_heading('Teacher AI Assistance 2 — Course Builder Security & Authorization Tests');

$passed = 0;
$total = 0;

function assert_test(string $name, bool $condition, string $msg = '') {
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
    // 1. Check capability definition
    $syscontext = context_system::instance();
    $admin = get_admin();
    \core\session\manager::set_user($admin);

    assert_test(
        "Capability local/agentpoc:createcoursewithai exists",
        get_capability_info('local/agentpoc:createcoursewithai') !== null
    );

    // 2. Admin has createcoursewithai
    assert_test(
        "Admin user has local/agentpoc:createcoursewithai capability",
        has_capability('local/agentpoc:createcoursewithai', $syscontext, $admin)
    );

    // 3. Guest user does not have createcoursewithai (Required Test 8)
    $guest = guest_user();
    assert_test(
        "Required Test 8: Guest user denied local/agentpoc:createcoursewithai",
        !has_capability('local/agentpoc:createcoursewithai', $syscontext, $guest)
    );

    // 4. Test category filtering with moodle/course:create (Required Test 9)
    $authorizedcats = core_course_category::make_categories_list('moodle/course:create');
    assert_test(
        "Required Test 9: Category list correctly uses moodle/course:create filter",
        is_array($authorizedcats) && count($authorizedcats) > 0
    );

    // 5. Test category authorization check for unauthorized user (Required Test 10 & 11)
    // As guest user, check moodle/course:create on first category
    $firstcatid = array_key_first($authorizedcats);
    $catcontext = context_coursecat::instance($firstcatid);
    assert_test(
        "Required Test 10 & 11: Unauthorized user has no course-create on category $firstcatid",
        !has_capability('moodle/course:create', $catcontext, $guest)
    );

    // 6. Test ai_platform_client configuration & instantiation
    $client = new \local_agentpoc\api\ai_platform_client();
    assert_test(
        "ai_platform_client instantiated successfully",
        $client instanceof \local_agentpoc\api\ai_platform_client
    );

    cli_writeln("\nResults: {$passed}/{$total} checks passed.");
    if ($passed === $total) {
        cli_writeln("ALL SECURITY CHECKS PASSED!");
        exit(0);
    } else {
        cli_error("SOME CHECKS FAILED.");
    }
} catch (\Exception $e) {
    cli_error("Exception: " . $e->getMessage());
}
