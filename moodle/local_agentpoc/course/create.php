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
 * AI Course Builder page controller.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

require_once(__DIR__ . '/../../../config.php');
require_once($CFG->dirroot . '/course/lib.php');

use local_agentpoc\external\list_course_formats;

require_login();
require_capability('local/agentpoc:createcoursewithai', \context_system::instance());

$PAGE->set_url(new \moodle_url('/local/agentpoc/course/create.php'));
$PAGE->set_context(\context_system::instance());
$PAGE->set_pagelayout('standard');
$PAGE->add_body_class('local-agentpoc-course-builder-page');
$PAGE->set_title(get_string('createcoursewithai', 'local_agentpoc'));
$PAGE->set_heading(get_string('createcoursewithai', 'local_agentpoc'));

// Build breadcrumbs
$PAGE->navbar->add(get_string('courses'), new \moodle_url('/course/index.php'));
$PAGE->navbar->add(get_string('createcoursewithai', 'local_agentpoc'));

// Fetch categories where current user has moodle/course:create capability
$categoriesraw = \core_course_category::make_categories_list('moodle/course:create');
$categories = [];
foreach ($categoriesraw as $catid => $catname) {
    $categories[] = [
        'id' => (int)$catid,
        'name' => $catname,
    ];
}
$formats = list_course_formats::execute();

$templatecontext = [
    'has_categories' => !empty($categories),
    'has_formats' => !empty($formats),
    'categories' => $categories,
    'formats' => $formats,
    'sesskey' => sesskey(),
    'ajaxurl' => (new \moodle_url('/local/agentpoc/ajax.php'))->out(false),
    'mycoursesurl' => (new \moodle_url('/my/courses.php'))->out(false),
];

$PAGE->requires->js_call_amd('local_agentpoc/course_builder', 'init', [$templatecontext]);

echo $OUTPUT->header();
echo $OUTPUT->render_from_template('local_agentpoc/course_builder', $templatecontext);
echo $OUTPUT->footer();
