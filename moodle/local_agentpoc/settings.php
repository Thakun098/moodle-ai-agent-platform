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
 * Settings for local_agentpoc plugin.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

if ($hassiteconfig) {
    $settings = new admin_settingpage('local_agentpoc', get_string('pluginname', 'local_agentpoc'));

    $ADMIN->add('localplugins', $settings);

    $settings->add(new admin_setting_configtext(
        'local_agentpoc/aiplatformurl',
        get_string('aiplatformurl', 'local_agentpoc'),
        get_string('aiplatformurl_desc', 'local_agentpoc'),
        'http://host.docker.internal:3000',
        PARAM_URL
    ));

    $settings->add(new admin_setting_configtext(
        'local_agentpoc/aiplatformtimeout',
        get_string('aiplatformtimeout', 'local_agentpoc'),
        get_string('aiplatformtimeout_desc', 'local_agentpoc'),
        180,
        PARAM_INT
    ));
}
