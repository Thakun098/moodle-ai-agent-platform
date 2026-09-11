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
 * Web service definitions for local_agentpoc plugin.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

defined('MOODLE_INTERNAL') || die();

$functions = [
    'local_agentpoc_list_course_formats' => [
        'classname'   => 'local_agentpoc\\external\\list_course_formats',
        'methodname'  => 'execute',
        'description' => 'List enabled Moodle course formats available to the caller',
        'type'        => 'read',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:view',
    ],
    'local_agentpoc_list_course_categories' => [
        'classname'   => 'local_agentpoc\\external\\list_course_categories',
        'methodname'  => 'execute',
        'description' => 'List existing course categories accessible to the caller',
        'type'        => 'read',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:view, moodle/category:viewcourselist',
    ],

    'local_agentpoc_create_course' => [
        'classname'   => 'local_agentpoc\\external\\create_course',
        'methodname'  => 'execute',
        'description' => 'Create a hidden course in a specific category with required shortname',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, moodle/course:create',
    ],

    'local_agentpoc_create_section' => [
        'classname'   => 'local_agentpoc\\external\\create_section',
        'methodname'  => 'execute',
        'description' => 'Create a course section at a specified position',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, moodle/course:update',
    ],

    'local_agentpoc_create_resource' => [
        'classname'   => 'local_agentpoc\\external\\create_resource',
        'methodname'  => 'execute',
        'description' => 'Create a Moodle File Resource from a sealed Learning Material snapshot file',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, mod/resource:addinstance',
    ],

    'local_agentpoc_get_course_structure' => [
        'classname'   => 'local_agentpoc\\external\\get_course_structure',
        'methodname'  => 'execute',
        'description' => 'Read complete course structure including sections and module activities',
        'type'        => 'read',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:view, moodle/course:view',
    ],

    'local_agentpoc_create_assignment' => [
        'classname'   => 'local_agentpoc\\external\\create_assignment',
        'methodname'  => 'execute',
        'description' => 'Create an assignment with frozen defaults in a course section',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, mod/assign:addinstance',
    ],

    'local_agentpoc_get_assignment' => [
        'classname'   => 'local_agentpoc\\external\\get_assignment',
        'methodname'  => 'execute',
        'description' => 'Get assignment details by activity ID (CMID)',
        'type'        => 'read',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:view, mod/assign:view',
    ],

    'local_agentpoc_update_assignment' => [
        'classname'   => 'local_agentpoc\\external\\update_assignment',
        'methodname'  => 'execute',
        'description' => 'Update an existing assignment by activity ID (CMID)',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, mod/assign:addinstance',
    ],

    'local_agentpoc_create_quiz' => [
        'classname'   => 'local_agentpoc\\external\\create_quiz',
        'methodname'  => 'execute',
        'description' => 'Create a quiz with frozen defaults in a course section',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, mod/quiz:addinstance',
    ],

    'local_agentpoc_get_quiz' => [
        'classname'   => 'local_agentpoc\\external\\get_quiz',
        'methodname'  => 'execute',
        'description' => 'Get quiz details by activity ID (CMID)',
        'type'        => 'read',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:view, mod/quiz:view',
    ],

    'local_agentpoc_update_quiz' => [
        'classname'   => 'local_agentpoc\\external\\update_quiz',
        'methodname'  => 'execute',
        'description' => 'Update quiz metadata by activity ID (CMID)',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, mod/quiz:manage',
    ],

    'local_agentpoc_get_quiz_questions' => [
        'classname'   => 'local_agentpoc\\external\\get_quiz_questions',
        'methodname'  => 'execute',
        'description' => 'Get all questions in a quiz with question bank entry and version details',
        'type'        => 'read',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:view, mod/quiz:manage, moodle/question:viewall',
    ],

    'local_agentpoc_create_quiz_question' => [
        'classname'   => 'local_agentpoc\\external\\create_quiz_question',
        'methodname'  => 'execute',
        'description' => 'Create a question in the Quiz activity question bank category (multichoice, truefalse, shortanswer, essay)',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, moodle/question:add',
    ],

    'local_agentpoc_update_quiz_question' => [
        'classname'   => 'local_agentpoc\\external\\update_quiz_question',
        'methodname'  => 'execute',
        'description' => 'Update a question creating a new version under the existing question bank entry',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, moodle/question:editall',
    ],

    'local_agentpoc_add_question_to_quiz' => [
        'classname'   => 'local_agentpoc\\external\\add_question_to_quiz',
        'methodname'  => 'execute',
        'description' => 'Add a question to a quiz using question bank entry identity',
        'type'        => 'write',
        'ajax'        => true,
        'capabilities'=> 'local/agentpoc:manage, mod/quiz:manage',
    ],
];

$services = [
    'Moodle Agent POC Service' => [
        'functions'       => array_keys($functions),
        'restrictedusers' => 0,
        'enabled'         => 1,
        'shortname'       => 'local_agentpoc_service',
        'downloadfiles'   => 0,
        'uploadfiles'     => 0,
    ],
];

// Ticket 07 — consolidated factual Risk evidence readback.
$functions['local_agentpoc_get_course_risk_evidence'] = [
    'classname'   => 'local_agentpoc\\external\\get_course_risk_evidence',
    'methodname'  => 'execute',
    'description' => 'Read consolidated factual Course Risk evidence without calculating Risk severity',
    'type'        => 'read',
    'ajax'        => true,
    'capabilities'=> 'local/agentpoc:view, moodle/course:view',
];
$services['Moodle Agent POC Service']['functions'][] = 'local_agentpoc_get_course_risk_evidence';
