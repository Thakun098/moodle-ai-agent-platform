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

use context_system;
use core_course_category;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

/**
 * External function to list accessible course categories (T0702, R16).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class list_course_categories extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([]);
    }

    /**
     * Execute category listing respecting user permissions and visibility.
     *
     * @return array List of category records.
     */
    public static function execute(): array {
        // 1. Parameter validation.
        self::validate_parameters(self::execute_parameters(), []);

        // 2. Context validation.
        $context = context_system::instance();
        self::validate_context($context);

        // 3. Capability checks (R4).
        require_capability('local/agentpoc:view', $context);
        require_capability('moodle/category:viewcourselist', $context);

        // 4. Retrieve visible categories (R16).
        $categories = core_course_category::get_all(['visible' => 1]);
        $result = [];

        foreach ($categories as $cat) {
            if ($cat->is_uservisible()) {
                $result[] = [
                    'id'          => (int) $cat->id,
                    'name'        => (string) $cat->get_formatted_name(),
                    'idnumber'    => (string) ($cat->idnumber ?? ''),
                    'description' => (string) ($cat->description ?? ''),
                    'parent'      => (int) $cat->parent,
                    'coursecount' => (int) $cat->coursecount,
                    'visible'     => (int) $cat->visible,
                ];
            }
        }

        return $result;
    }

    /**
     * Return structure description.
     *
     * @return external_multiple_structure
     */
    public static function execute_returns(): external_multiple_structure {
        return new external_multiple_structure(
            new external_single_structure([
                'id'          => new external_value(PARAM_INT, 'Category ID'),
                'name'        => new external_value(PARAM_TEXT, 'Category name'),
                'idnumber'    => new external_value(PARAM_RAW, 'Category ID number'),
                'description' => new external_value(PARAM_RAW, 'Category description'),
                'parent'      => new external_value(PARAM_INT, 'Parent category ID'),
                'coursecount' => new external_value(PARAM_INT, 'Number of courses in category'),
                'visible'     => new external_value(PARAM_INT, 'Category visibility flag'),
            ])
        );
    }
}
