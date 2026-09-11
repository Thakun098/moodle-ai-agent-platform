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
use context_module;
use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use moodle_exception;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/lib.php');

/**
 * External function to read back complete hierarchical course structure (T0705, R6).
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class get_course_structure extends external_api {

    /**
     * Parameter definition.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'course_id' => new external_value(PARAM_INT, 'Course ID to inspect', VALUE_REQUIRED),
        ]);
    }

    /**
     * Read complete course structure.
     *
     * @param int $course_id Course ID
     * @return array Hierarchical course tree
     * @throws moodle_exception
     */
    public static function execute(int $course_id): array {
        global $DB;

        // 1. Parameter validation.
        $params = self::validate_parameters(self::execute_parameters(), [
            'course_id' => $course_id,
        ]);

        // 2. Validate course exists.
        $course = $DB->get_record('course', ['id' => $params['course_id']], '*', MUST_EXIST);

        // 3. Context validation & capabilities (R4).
        $context = context_course::instance($course->id);
        self::validate_context($context);

        require_capability('local/agentpoc:view', $context);
        require_capability('moodle/course:view', $context);

        // 4. Retrieve modinfo tree.
        $modinfo = get_fast_modinfo($course);
        $sectioninfos = $modinfo->get_section_info_all();

        $sectionsout = [];

        foreach ($sectioninfos as $sectioninfo) {
            $sectionid = (int) $sectioninfo->id;
            $sectionnum = (int) $sectioninfo->section;
            $sectionname = (string) ($sectioninfo->name ?: get_section_name($course, $sectioninfo));
            $sectionsummary = (string) ($sectioninfo->summary ?? '');

            $activitiesout = [];

            if (!empty($modinfo->sections[$sectionnum])) {
                foreach ($modinfo->sections[$sectionnum] as $cmid) {
                    $cm = $modinfo->cms[$cmid];
                    if (!$cm || !$cm->uservisible) {
                        continue;
                    }

                    $modname = (string) $cm->modname;
                    $instancerecord = $DB->get_record($modname, ['id' => $cm->instance], '*', IGNORE_MISSING);

                    $intro = '';
                    $grade = 0.0;
                    $filesout = [];

                    if ($instancerecord) {
                        $intro = (string) ($instancerecord->intro ?? '');
                        $grade = isset($instancerecord->grade) ? (float) $instancerecord->grade : 0.0;
                    }
                    if ($modname === 'resource') {
                        $resourcefiles = get_file_storage()->get_area_files(
                            context_module::instance($cm->id)->id,
                            'mod_resource',
                            'content',
                            0,
                            'sortorder, id',
                            false
                        );
                        foreach ($resourcefiles as $resourcefile) {
                            if (!$resourcefile->is_directory()) {
                                $filesout[] = (string) $resourcefile->get_filename();
                            }
                        }
                    }

                    $activitydata = [
                        'activity_id' => (int) $cm->id, // P7-D2: CMID is canonical activity_id
                        'instance_id' => (int) $cm->instance,
                        'modulename'  => $modname,
                        'name'        => (string) $cm->name,
                        'intro'       => $intro,
                        'grade'       => $grade,
                    ];
                    if ($filesout) {
                        $activitydata['files'] = $filesout;
                    }
                    $activitiesout[] = $activitydata;
                }
            }

            $sectionsout[] = [
                'section_id'  => $sectionid,
                'section_num' => $sectionnum,
                'name'        => $sectionname,
                'summary'     => $sectionsummary,
                'activities'  => $activitiesout,
            ];
        }

        return [
            'course'   => [
                'id'          => (int) $course->id,
                'fullname'    => (string) $course->fullname,
                'shortname'   => (string) $course->shortname,
                'category_id' => (int) $course->category,
                'visible'     => (int) $course->visible,
                'format'      => (string) $course->format,
            ],
            'sections' => $sectionsout,
        ];
    }

    /**
     * Return structure description.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        return new external_single_structure([
            'course' => new external_single_structure([
                'id'          => new external_value(PARAM_INT, 'Course database ID'),
                'fullname'    => new external_value(PARAM_TEXT, 'Full course name'),
                'shortname'   => new external_value(PARAM_TEXT, 'Course short name'),
                'category_id' => new external_value(PARAM_INT, 'Category ID containing the course'),
                'visible'     => new external_value(PARAM_INT, 'Course visibility (0 = hidden)'),
                'format'      => new external_value(PARAM_ALPHANUMEXT, 'Course format identifier'),
            ]),
            'sections' => new external_multiple_structure(
                new external_single_structure([
                    'section_id'  => new external_value(PARAM_INT, 'Database ID of the section (course_sections.id)'),
                    'section_num' => new external_value(PARAM_INT, 'Relative course section number'),
                    'name'        => new external_value(PARAM_TEXT, 'Section title/heading'),
                    'summary'     => new external_value(PARAM_RAW, 'Section summary HTML'),
                    'activities'  => new external_multiple_structure(
                        new external_single_structure([
                            'activity_id' => new external_value(PARAM_INT, 'Canonical activity ID (course_modules.id)'),
                            'instance_id' => new external_value(PARAM_INT, 'Module table instance ID (assign.id or quiz.id)'),
                            'modulename'  => new external_value(PARAM_PLUGIN, 'Module type name (e.g. assign, quiz)'),
                            'name'        => new external_value(PARAM_TEXT, 'Activity title/name'),
                            'intro'       => new external_value(PARAM_RAW, 'Activity intro/description HTML'),
                            'grade'       => new external_value(PARAM_FLOAT, 'Maximum grade value for activity'),
                            'files'       => new external_multiple_structure(
                                new external_value(PARAM_FILE, 'Resource filename'),
                                'Files attached to a Resource activity',
                                VALUE_OPTIONAL
                            ),
                        ])
                    ),
                ])
            ),
        ]);
    }
}
