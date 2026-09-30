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
 * AJAX endpoint for local_agentpoc AI Course Builder BFF.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/course/lib.php');

use local_agentpoc\api\ai_platform_client;

header('Content-Type: application/json; charset=utf-8');

try {
    require_login();
    require_sesskey();
    require_capability('local/agentpoc:createcoursewithai', \context_system::instance());

    $action = required_param('action', PARAM_ALPHANUMEXT);
    $client = new ai_platform_client();

    $response = ['success' => true];

    switch ($action) {
        case 'get_competency_mappings':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_competency_mappings($runid);
            break;

        case 'decide_competency_mapping':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->decide_competency_mapping($runid, [
                'activity_id' => required_param('activity_id', PARAM_ALPHANUMEXT),
                'competency_id' => required_param('competency_id', PARAM_ALPHANUMEXT),
                'kind' => required_param('kind', PARAM_ALPHA),
                'decision' => required_param('decision', PARAM_ALPHA),
                'confirmed' => (bool)required_param('confirmed', PARAM_BOOL),
                'expected_revision' => required_param('expected_revision', PARAM_INT),
                'teacher_id' => (int)$USER->id,
            ]);
            break;

        case 'upload_and_create_run':
            if (empty($_FILES['syllabus_file'])) {
                throw new \moodle_exception('errormissingfile', 'local_agentpoc');
            }

            $file = $_FILES['syllabus_file'];
            if ($file['error'] !== UPLOAD_ERR_OK) {
                throw new \moodle_exception('errorupload', 'moodle', '', 'Upload error code: ' . $file['error']);
            }

            if ($file['size'] > 10 * 1024 * 1024) {
                throw new \moodle_exception('errorupload', 'moodle', '', 'File exceeds 10 MB limit.');
            }

            $filename = clean_param($file['name'], PARAM_FILE);
            $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
            $allowedexts = ['txt', 'md', 'markdown', 'docx', 'pdf'];
            if (!in_array($ext, $allowedexts, true)) {
                throw new \moodle_exception('errorupload', 'moodle', '', 'Unsupported file format: .' . $ext);
            }

            $mimetypemap = [
                'md' => 'text/markdown',
                'markdown' => 'text/markdown',
                'txt' => 'text/plain',
                'pdf' => 'application/pdf',
                'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            ];
            $mimetype = $mimetypemap[$ext] ?? (mime_content_type($file['tmp_name']) ?: 'application/octet-stream');
            $courseformat = required_param('course_format', PARAM_ALPHANUMEXT);
            $availableformats = \local_agentpoc\external\list_course_formats::execute();
            $availablevalues = array_column($availableformats, 'value');
            if (!in_array($courseformat, $availablevalues, true)) {
                throw new \moodle_exception('invalidparameter', 'debug', '', 'The selected Moodle course format is not available.');
            }
            $run = $client->create_run($file['tmp_name'], $filename, $mimetype, $courseformat);
            $response['data'] = $run;
            break;

        case 'list_course_formats':
            $response['data'] = \local_agentpoc\external\list_course_formats::execute();
            break;

        case 'get_course_structure':
            $courseid = required_param('course_id', PARAM_INT);
            $response['data'] = \local_agentpoc\external\get_course_structure::execute($courseid);
            break;

        case 'generate_plan':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $teacherinstruction = optional_param('teacher_instruction', '', PARAM_TEXT);
            $plan = $client->generate_course_plan($runid, $teacherinstruction !== '' ? $teacherinstruction : null);
            $response['data'] = $plan;
            break;

        case 'generate_structure':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $teacherinstruction = optional_param('teacher_instruction', '', PARAM_TEXT);
            $response['data'] = $client->generate_course_structure($runid, $teacherinstruction !== '' ? $teacherinstruction : null);
            break;

        case 'get_core_context':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_core_context($runid);
            break;


        case 'get_instructional_design':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_instructional_design($runid);
            break;

        case 'get_outcome_reviews':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_outcome_reviews($runid);
            break;

        case 'save_outcome_review':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $itemtype = required_param('item_type', PARAM_ALPHA);
            $itemid = required_param('item_id', PARAM_ALPHANUMEXT);
            $status = required_param('status', PARAM_ALPHANUMEXT);
            $drafttext = optional_param('draft_text', '', PARAM_TEXT);
            $response['data'] = $client->save_outcome_review($runid, [
                'item_type' => $itemtype,
                'item_id' => $itemid,
                'status' => $status,
                'draft_text' => $drafttext,
                'teacher_id' => (int)$USER->id,
            ]);
            break;

        case 'edit_approved_learning_outcome':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sourceoutcomeid = required_param('source_outcome_id', PARAM_ALPHANUMEXT);
            $teachertext = required_param('teacher_text', PARAM_TEXT);
            $confirmed = required_param('confirmed', PARAM_BOOL);
            if (!$confirmed) {
                throw new \invalid_parameter_exception('Approved CLO edit requires explicit confirmation.');
            }
            $response['data'] = $client->edit_approved_learning_outcome($runid, [
                'source_outcome_id' => $sourceoutcomeid,
                'teacher_text' => $teachertext,
                'confirmed' => true,
                'teacher_id' => (int)$USER->id,
            ]);
            break;

        case 'approve_learning_outcome':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sourceoutcomeid = required_param('source_outcome_id', PARAM_ALPHANUMEXT);
            $teachertext = optional_param('teacher_text', '', PARAM_TEXT);
            $recommendedtext = optional_param('recommended_text', '', PARAM_TEXT);
            $usesourceasis = optional_param('use_source_as_is', 0, PARAM_BOOL);
            $response['data'] = $client->approve_learning_outcome($runid, [
                'source_outcome_id' => $sourceoutcomeid,
                'use_source_as_is' => (bool)$usesourceasis,
                'teacher_text' => $teachertext,
                'recommended_text' => $recommendedtext,
                'teacher_id' => (int)$USER->id,
            ]);
            break;

        case 'get_competency_candidates':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_competency_candidates($runid);
            break;

        case 'derive_competency_candidates':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->derive_competency_candidates($runid);
            break;

        case 'decide_competency_candidate':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $candidateid = required_param('candidate_id', PARAM_ALPHANUMEXT);
            $decisionjson = optional_param('decision', '{}', PARAM_RAW);
            $decision = json_decode($decisionjson, true);
            if (!is_array($decision)) {
                throw new \moodle_exception('invalidparameter', 'debug', '', 'Invalid Competency Candidate decision JSON');
            }
            $decision['teacher_id'] = (int)$USER->id;
            $response['data'] = $client->decide_competency_candidate($runid, $candidateid, $decision);
            break;
        case 'set_coverage_override':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $outcomeid = required_param('outcome_id', PARAM_ALPHANUMEXT);
            $reason = required_param('reason', PARAM_TEXT);
            $response['data'] = $client->set_coverage_override($runid, [
                'outcome_id' => $outcomeid,
                'acknowledged' => true,
                'reason' => $reason,
                'teacher_id' => (int)$USER->id,
            ]);
            break;

        case 'rebase_structure_alignment':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->rebase_structure_alignment($runid);
            break;

        case 'get_structure':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_course_structure($runid);
            break;

        case 'acknowledge_learner_context':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $learnercontextrevision = required_param('learner_context_revision', PARAM_INT);
            $response['data'] = $client->acknowledge_learner_context($runid, $learnercontextrevision);
            break;

        case 'set_activity_intents':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $quiz = required_param('quiz', PARAM_BOOL);
            $assignment = required_param('assignment', PARAM_BOOL);
            $quizoptionsjson = optional_param('quiz_options', '{}', PARAM_RAW);
            $assignmentoptionsjson = optional_param('assignment_options', '{}', PARAM_RAW);
            $quizoptions = json_decode($quizoptionsjson, true);
            $assignmentoptions = json_decode($assignmentoptionsjson, true);
            if (!is_array($quizoptions) || !is_array($assignmentoptions)) {
                throw new \moodle_exception('invalidparameter', 'debug', '', 'Invalid Activity options JSON');
            }
            $semantic = [];
            foreach (['quiz_purpose', 'assignment_purpose', 'quiz_selected_objective_ids', 'assignment_selected_objective_ids', 'quiz_selected_outcome_ids', 'assignment_selected_outcome_ids', 'quiz_learner_context_revision', 'assignment_learner_context_revision', 'quiz_generation_instruction', 'assignment_generation_instruction'] as $semantickey) {
                $rawvalue = optional_param($semantickey, null, PARAM_RAW);
                if ($rawvalue !== null && $rawvalue !== '') {
                    if (str_ends_with($semantickey, '_ids')) {
                        $decoded = json_decode((string)$rawvalue, true);
                        $semantic[$semantickey] = is_array($decoded) ? $decoded : [];
                    } else {
                        $semantic[$semantickey] = $rawvalue;
                    }
                }
            }
            foreach (['quiz_learner_context_acknowledged', 'assignment_learner_context_acknowledged'] as $ackkey) {
                $ackvalue = optional_param($ackkey, null, PARAM_BOOL);
                if ($ackvalue !== null) $semantic[$ackkey] = (bool)$ackvalue;
            }
            foreach (['quiz_alignment_override', 'assignment_alignment_override'] as $overridekey) {
                $rawoverride = optional_param($overridekey, '', PARAM_RAW);
                if ($rawoverride !== '') {
                    $decodedoverride = json_decode($rawoverride, true);
                    if (is_array($decodedoverride)) $semantic[$overridekey] = $decodedoverride;
                }
            }
            $response['data'] = $client->set_activity_intents($runid, $sectionref, (bool)$quiz, (bool)$assignment, $quizoptions, $assignmentoptions, $semantic);
            break;

        case 'get_activity_intents':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_activity_intents($runid, $sectionref);
            break;

        case 'set_resource_publication':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $publish = required_param('publish', PARAM_BOOL);
            $response['data'] = $client->set_resource_publication($runid, $sectionref, (bool)$publish);
            break;

        case 'get_activity_revisions':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $activityref = required_param('activity_ref', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_activity_revisions($runid, $sectionref, $activityref);
            break;

        case 'save_activity_edit':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $activityref = required_param('activity_ref', PARAM_ALPHANUMEXT);
            $activityjson = required_param('activity', PARAM_RAW);
            $activity = json_decode($activityjson, true);
            if (!is_array($activity)) {
                throw new \moodle_exception('invalidparameter', 'debug', '', 'Invalid Activity edit JSON');
            }
            $expectedrevision = optional_param('expected_activity_revision', null, PARAM_INT);
            $response['data'] = $client->save_activity_edit($runid, $sectionref, $activityref, $activity, $expectedrevision, (int)$USER->id);
            break;

        case 'get_activity_status':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $activityref = required_param('activity_ref', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_activity_status($runid, $sectionref, $activityref);
            break;

        case 'get_section_material_snapshot':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_latest_material_snapshot($runid, $sectionref);
            break;

        case 'generate_activity':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $activityref = required_param('activity_ref', PARAM_ALPHANUMEXT);
            $generationinstruction = optional_param('generation_instruction', '', PARAM_TEXT);
            $response['data'] = $client->generate_activity($runid, $sectionref, $activityref, $generationinstruction !== '' ? $generationinstruction : null);
            break;

        case 'confirm_activity_shell':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $activityref = required_param('activity_ref', PARAM_ALPHANUMEXT);
            $response['data'] = $client->confirm_activity_shell($runid, $sectionref, $activityref);
            break;

        case 'save_structure_revision':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $structurejson = required_param('structure', PARAM_RAW);
            $structure = json_decode($structurejson, true);
            if (!is_array($structure)) {
                throw new \moodle_exception('invalidparameter', 'debug', '', 'Invalid structure JSON');
            }
            $response['data'] = $client->save_structure_revision($runid, $structure);
            break;

        case 'mark_week_reviewed':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $revision = required_param('revision', PARAM_INT);
            $response['data'] = $client->mark_week_reviewed($runid, $sectionref, $revision, (int)$USER->id);
            break;

        case 'seal_structure':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $revision = required_param('revision', PARAM_INT);
            $response['data'] = $client->seal_structure($runid, $revision, (int)$USER->id);
            break;

        case 'upload_section_material':
            if (empty($_FILES['material_file'])) {
                throw new \moodle_exception('errormissingfile', 'local_agentpoc');
            }
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $structurerevision = required_param('structure_revision', PARAM_INT);
            if ($structurerevision < 1) {
                throw new \moodle_exception('invalidparameter', 'debug', '', 'A sealed structure revision is required.');
            }
            $file = $_FILES['material_file'];
            if ($file['error'] !== UPLOAD_ERR_OK) {
                throw new \moodle_exception('errorupload', 'moodle', '', 'Upload error code: ' . $file['error']);
            }
            if ($file['size'] > 30 * 1024 * 1024) {
                throw new \moodle_exception('materialfiletoolarge', 'local_agentpoc', '', $file['name']);
            }
            $filename = clean_param($file['name'], PARAM_FILE);
            $materialid = \local_agentpoc\helper::save_material_draft(
                $runid,
                $structurerevision,
                $sectionref,
                $file['tmp_name'],
                $filename,
                (int)$USER->id,
                true,
                true
            );
            $response['data'] = ['id' => $materialid, 'run_id' => $runid, 'section_ref' => $sectionref, 'revision' => 0];
            break;

        case 'list_section_materials':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $structurerevision = required_param('structure_revision', PARAM_INT);
            $response['data'] = \local_agentpoc\helper::list_material_drafts($runid, $structurerevision, $sectionref);
            break;

        case 'delete_draft_material':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $materialid = required_param('material_id', PARAM_INT);
            \local_agentpoc\helper::delete_material_draft($materialid, $runid, (int)$USER->id);
            $response['data'] = ['deleted' => true, 'material_id' => $materialid];
            break;

        case 'seal_section_material':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $structurerevision = required_param('structure_revision', PARAM_INT);
            $structure = $client->get_course_structure($runid);
            $sealed = $structure['sealed_revision'] ?? null;
            if (!is_array($sealed) || (int)($sealed['revision'] ?? 0) !== $structurerevision) {
                throw new \moodle_exception('invalidparameter', 'debug', '', 'Material must be sealed against the currently sealed Course Structure revision.');
            }
            $snapshot = \local_agentpoc\helper::snapshot_material_drafts(
                $runid,
                $structurerevision,
                $sectionref,
                (int)$USER->id
            );
            $uploads = \local_agentpoc\helper::export_snapshot_files($snapshot['files']);
            try {
                $response['data'] = $client->create_material_snapshot($runid, $sectionref, $structurerevision, $uploads);
            } finally {
                foreach ($uploads as $upload) {
                    if (!empty($upload['filepath'])) {
                        @unlink($upload['filepath']);
                    }
                }
            }
            break;

        case 'generate_section_activities':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $generationinstruction = optional_param('generation_instruction', '', PARAM_TEXT);
            $response['data'] = $client->generate_section_activities($runid, $sectionref, $generationinstruction !== '' ? $generationinstruction : null);
            break;

        case 'get_section_generation_status':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $sectionref = required_param('section_ref', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_section_generation_status($runid, $sectionref);
            break;

        case 'finalize_course_plan':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->finalize_course_plan($runid);
            break;

        case 'get_planning_progress':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $response['data'] = $client->get_progress($runid);
            break;

        case 'get_preview':
            $planid = required_param('plan_id', PARAM_ALPHANUMEXT);
            $revision = optional_param('revision', null, PARAM_INT);
            $preview = $client->get_preview($planid, $revision);
            $response['data'] = $preview;
            break;

        case 'save_revision':
            $planid = required_param('plan_id', PARAM_ALPHANUMEXT);
            $envelopejson = required_param('envelope', PARAM_RAW);
            $summary = optional_param('summary', 'Teacher direct edit', PARAM_TEXT);

            $envelope = json_decode($envelopejson, true);
            if (!is_array($envelope)) {
                throw new \moodle_exception('invalidparameter', 'debug', '', 'Invalid envelope JSON');
            }

            $revision = $client->create_revision($planid, $envelope, $summary);
            $response['data'] = $revision;
            break;

        case 'approve_plan':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $planid = required_param('plan_id', PARAM_ALPHANUMEXT);
            $revision = required_param('revision', PARAM_INT);
            $ackaireview = optional_param('acknowledge_ai_expanded_content', 0, PARAM_BOOL);

            // Actor Identity: strictly derived from authenticated server-side $USER session
            $approverid = (string)$USER->id;
            $approved = $client->approve_plan($runid, $planid, $revision, $approverid, (bool)$ackaireview);
            $response['data'] = $approved;
            break;

        case 'validate_execution':
            $planid = required_param('plan_id', PARAM_ALPHANUMEXT);
            $revision = required_param('revision', PARAM_INT);
            $categoryid = required_param('category_id', PARAM_INT);

            // Verify Moodle course creation permission on target category
            $category = \core_course_category::get($categoryid, IGNORE_MISSING);
            if (!$category || !has_capability('moodle/course:create', \context_coursecat::instance($categoryid))) {
                throw new \moodle_exception('errorcategorypermissiondenied', 'local_agentpoc');
            }

            $validation = $client->validate_execution($planid, $revision, ['category_id' => $categoryid]);
            $response['data'] = $validation;
            break;

        case 'execute_run':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $planid = required_param('plan_id', PARAM_ALPHANUMEXT);
            $revision = required_param('revision', PARAM_INT);
            $categoryid = required_param('category_id', PARAM_INT);

            // Re-check Moodle course creation capability on target category before execution
            $category = \core_course_category::get($categoryid, IGNORE_MISSING);
            if (!$category || !has_capability('moodle/course:create', \context_coursecat::instance($categoryid))) {
                throw new \moodle_exception('errorcategorypermissiondenied', 'local_agentpoc');
            }

            $execresult = $client->execute_run($runid, $planid, $revision, ['category_id' => $categoryid]);
            $response['data'] = $execresult;
            break;

        case 'verify_run':
            $runid = required_param('run_id', PARAM_ALPHANUMEXT);
            $planid = required_param('plan_id', PARAM_ALPHANUMEXT);
            $revision = required_param('revision', PARAM_INT);
            $verification = $client->verify_run($runid, $planid, $revision);
            $response['data'] = $verification;
            break;

        default:
            throw new \moodle_exception('errorinvalidaction', 'error', '', $action);
    }

    echo json_encode($response);
} catch (\Exception $e) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => [
            'message' => $e->getMessage(),
            'code' => ($e instanceof \moodle_exception) ? $e->errorcode : 'SERVER_ERROR',
        ],
    ]);
}
