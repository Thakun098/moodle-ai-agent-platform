<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

namespace local_agentpoc\external;

use context_system;
use core_external\external_api;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->dirroot . '/course/lib.php');

/**
 * Lists enabled Moodle course-format plugins available to the current user.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class list_course_formats extends external_api {

    public static function execute_parameters(): \core_external\external_function_parameters {
        return new \core_external\external_function_parameters([]);
    }

    /**
     * @return array<int, array{value: string, name: string}>
     */
    public static function execute(): array {
        self::validate_parameters(self::execute_parameters(), []);
        $context = context_system::instance();
        self::validate_context($context);
        require_capability('local/agentpoc:view', $context);

        $formats = [];
        foreach (get_sorted_course_formats(true) as $format) {
            $component = 'format_' . $format;
            $name = get_string_manager()->string_exists('pluginname', $component)
                ? get_string('pluginname', $component)
                : $format;
            $formats[] = [
                'value' => (string) $format,
                'name' => (string) $name,
            ];
        }
        return $formats;
    }

    public static function execute_returns(): external_multiple_structure {
        return new external_multiple_structure(new external_single_structure([
            'value' => new external_value(PARAM_ALPHANUMEXT, 'Moodle course-format identifier'),
            'name' => new external_value(PARAM_TEXT, 'Human-readable course-format name'),
        ]));
    }
}
