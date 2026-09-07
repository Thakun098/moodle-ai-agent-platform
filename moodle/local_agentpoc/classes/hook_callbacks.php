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
 * Hook callbacks handler for local_agentpoc.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_agentpoc;

defined('MOODLE_INTERNAL') || die();

class hook_callbacks {

    /** @var bool Flag indicating whether the action has already been injected */
    public static bool $injected = false;

    /**
     * Callback for before_footer_html_generation hook.
     *
     * @param \core\hook\output\before_footer_html_generation $hook
     */
    public static function before_footer_html_generation(\core\hook\output\before_footer_html_generation $hook): void {
        $html = self::inject_mycourses_action();
        if (!empty($html)) {
            $hook->add_html($html);
        }
    }

    /**
     * Checks requirements and injects AI Course Builder action into My courses page.
     *
     * @return string Optional HTML to append to page
     */
    public static function inject_mycourses_action(): string {
        global $PAGE, $USER, $CFG;

        if (self::$injected) {
            return '';
        }

        if (!isloggedin() || isguestuser()) {
            return '';
        }

        // Scope strictly to page-mycourses (/my/courses.php)
        $urlpath = $PAGE->url ? $PAGE->url->get_path() : '';
        $ismycourses = ($PAGE->pagelayout === 'mycourses' || 
                        $PAGE->pagetype === 'my-index' || 
                        str_contains($urlpath, '/my/courses.php'));

        if (!$ismycourses) {
            return '';
        }

        // Condition 1: User must have local/agentpoc:createcoursewithai capability
        if (!has_capability('local/agentpoc:createcoursewithai', \context_system::instance())) {
            return '';
        }

        // Condition 2: User must have at least one category with moodle/course:create capability
        require_once($CFG->dirroot . '/course/lib.php');
        $categories = \core_course_category::make_categories_list('moodle/course:create');
        if (empty($categories)) {
            return '';
        }

        self::$injected = true;

        $createurl = (new \moodle_url('/local/agentpoc/course/create.php'))->out(false);
        $label = get_string('createcoursewithai', 'local_agentpoc');

        // Initialize plugin AMD module scoped to page-mycourses
        $PAGE->requires->js_call_amd('local_agentpoc/mycourses_button', 'init', [[
            'createurl' => $createurl,
            'label' => $label,
        ]]);

        return '<div id="local-agentpoc-mycourses-action" class="d-none" data-authorized="1" data-createurl="' . s($createurl) . '" data-label="' . s($label) . '"></div>';
    }
}
