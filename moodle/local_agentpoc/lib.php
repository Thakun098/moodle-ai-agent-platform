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
 * Library functions for local_agentpoc plugin.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

/**
 * Extends the global navigation with AI Course Builder link.
 *
 * @param global_navigation $navigation The global navigation object.
 */
function local_agentpoc_extend_navigation(global_navigation $navigation) {
    if (isloggedin() && !isguestuser() && has_capability('local/agentpoc:createcoursewithai', context_system::instance())) {
        $node = navigation_node::create(
            get_string('createcoursewithai', 'local_agentpoc'),
            new moodle_url('/local/agentpoc/course/create.php'),
            navigation_node::TYPE_CUSTOM,
            null,
            'local_agentpoc_createcourse',
            new pix_icon('i/course', '')
        );
        $navigation->add_node($node);
    }
}

/**
 * Legacy callback executed before footer HTML is finalized.
 */
function local_agentpoc_before_footer() {
    \local_agentpoc\hook_callbacks::inject_mycourses_action();
}
