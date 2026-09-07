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
 * Course builder renderable class.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_agentpoc\output;

defined('MOODLE_INTERNAL') || die();

class course_builder_page implements \renderable, \templatable {

    /** @var array Categories list */
    protected array $categories;

    /** @var string Sesskey */
    protected string $sesskey;

    /** @var string AJAX URL */
    protected string $ajaxurl;

    /**
     * Constructor.
     *
     * @param array $categories
     * @param string $sesskey
     * @param string $ajaxurl
     */
    public function __construct(array $categories, string $sesskey, string $ajaxurl) {
        $this->categories = $categories;
        $this->sesskey = $sesskey;
        $this->ajaxurl = $ajaxurl;
    }

    /**
     * Export data for Mustache template.
     *
     * @param \renderer_base $output
     * @return array
     */
    public function export_for_template(\renderer_base $output): array {
        return [
            'has_categories' => !empty($this->categories),
            'categories' => $this->categories,
            'sesskey' => $this->sesskey,
            'ajaxurl' => $this->ajaxurl,
        ];
    }
}
