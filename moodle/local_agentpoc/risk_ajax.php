<?php
// This file is part of Moodle - http://moodle.org/.

/**
 * Server-side Risk BFF endpoint for Teacher-facing Risk UI.
 *
 * The browser calls Moodle only. Moodle checks Course/session capabilities,
 * enriches display identity locally, then forwards a service-authenticated
 * pseudonymous Risk request to the AI Platform.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

define('AJAX_SCRIPT', true);

require_once(__DIR__ . '/../../config.php');
require_once($CFG->dirroot . '/course/lib.php');

use local_agentpoc\api\ai_platform_client;
use local_agentpoc\risk\bff_helper;

header('Content-Type: application/json; charset=utf-8');

/**
 * Emits a consistent BFF error response without exposing service credentials.
 *
 * @param \Throwable $error Error.
 */
function local_agentpoc_risk_api_message(string $code, string $fallback): string {
    return match ($code) {
        'RISK_SNAPSHOT_NOT_FOUND' => 'ไม่พบสแนปช็อตความเสี่ยงที่ร้องขอสำหรับรายวิชานี้ กรุณารีเฟรชข้อมูลความเสี่ยงอีกครั้ง',
        'STUDENT_NOT_IN_SNAPSHOT' => 'ไม่พบนักเรียนในสแนปช็อตความเสี่ยงที่เลือก',
        'ACTIVITY_NOT_IN_SNAPSHOT' => 'ไม่พบกิจกรรมในสแนปช็อตความเสี่ยงที่เลือก',
        'COMPETENCY_NOT_IN_SNAPSHOT' => 'ไม่พบสมรรถนะในสแนปช็อตความเสี่ยงที่เลือก',
        'SNAPSHOT_ID_REQUIRED' => 'ต้องระบุสแนปช็อตความเสี่ยงเพื่อดูรายละเอียด',
        'INVALID_COURSE_ID' => 'รหัสรายวิชาไม่ถูกต้อง',
        'INVALID_RISK_DRILLDOWN_ID' => 'รหัสข้อมูลสำหรับดูรายละเอียดความเสี่ยงไม่ถูกต้อง',
        default => $fallback,
    };
}

function local_agentpoc_risk_emit_error(\Throwable $error): void {
    if ($error instanceof \local_agentpoc\api\risk_api_exception) {
        $upstreamstatus = $error->get_http_code();
        $apicode = $error->get_api_code();
        if ($upstreamstatus === 400 || $upstreamstatus === 404) {
            http_response_code($upstreamstatus);
            echo json_encode([
                'success' => false,
                'error' => [
                    'code' => $apicode,
                    'message' => local_agentpoc_risk_api_message($apicode, $error->getMessage()),
                    'retryable' => false,
                ],
            ]);
            return;
        }
        http_response_code(502);
        echo json_encode([
            'success' => false,
            'error' => [
                'code' => 'AI_PLATFORM_UNAVAILABLE',
                'message' => get_string('errorriskplatformunavailable', 'local_agentpoc'),
                'retryable' => $upstreamstatus >= 500,
            ],
        ]);
        return;
    }

    $code = $error instanceof \moodle_exception ? $error->errorcode : 'RISK_BFF_ERROR';
    $retryable = $code === 'erroraiplatform';
    http_response_code($retryable ? 502 : 400);
    echo json_encode([
        'success' => false,
        'error' => [
            'code' => $retryable ? 'AI_PLATFORM_UNAVAILABLE' : $code,
            'message' => $retryable
                ? get_string('errorriskplatformunavailable', 'local_agentpoc')
                : $error->getMessage(),
            'retryable' => $retryable,
        ],
    ]);
}

try {
    require_login();

    $action = required_param('action', PARAM_ALPHANUMEXT);
    $courseid = required_param('course_id', PARAM_INT);
    if ($courseid <= 0) {
        throw new \moodle_exception('errorcoursenotfound', 'local_agentpoc', '', $courseid);
    }

    $course = get_course($courseid);
    require_login($course);
    $context = \context_course::instance($courseid);
    require_capability('local/agentpoc:view', $context);
    require_capability('moodle/course:view', $context);

    $client = new ai_platform_client();
    $snapshotid = optional_param('snapshot_id', '', PARAM_ALPHANUMEXT);
    $response = null;

    switch ($action) {
        case 'dashboard':
            $response = $client->get_risk_dashboard(
                $courseid,
                (int)$USER->id,
                $snapshotid !== '' ? $snapshotid : null
            );
            $response = bff_helper::enrich_dashboard_identities($response, $courseid);
            break;

        case 'student':
            if ($snapshotid === '') {
                throw new \moodle_exception('errorrisksnapshotrequired', 'local_agentpoc');
            }
            $studentid = required_param('student_id', PARAM_INT);
            bff_helper::require_active_student($context, $studentid);
            $response = $client->get_student_risk($courseid, $studentid, $snapshotid, (int)$USER->id);
            $response = bff_helper::enrich_student_detail($response, $course);
            break;

        case 'activity':
            if ($snapshotid === '') {
                throw new \moodle_exception('errorrisksnapshotrequired', 'local_agentpoc');
            }
            $activityid = required_param('activity_id', PARAM_INT);
            $modinfo = get_fast_modinfo($course);
            if ($activityid <= 0 || !isset($modinfo->cms[$activityid])) {
                throw new \moodle_exception('erroractivitynotfound', 'local_agentpoc', '', $activityid);
            }
            $response = $client->get_activity_risk($courseid, $activityid, $snapshotid, (int)$USER->id);
            $response = bff_helper::enrich_activity_detail($response, $course);
            break;

        case 'competency':
            if ($snapshotid === '') {
                throw new \moodle_exception('errorrisksnapshotrequired', 'local_agentpoc');
            }
            $competencyid = required_param('competency_id', PARAM_INT);
            if ($competencyid <= 0) {
                throw new \moodle_exception('errorriskcompetencynotfound', 'local_agentpoc');
            }
            $response = $client->get_competency_risk($courseid, $competencyid, $snapshotid, (int)$USER->id);
            $response = bff_helper::enrich_competency_detail($response, $course);
            break;

        case 'course_insight':
            if ($snapshotid === '') {
                throw new \moodle_exception('errorrisksnapshotrequired', 'local_agentpoc');
            }
            $response = $client->get_course_risk_insight($courseid, $snapshotid, (int)$USER->id);
            break;

        case 'student_insight':
            if ($snapshotid === '') {
                throw new \moodle_exception('errorrisksnapshotrequired', 'local_agentpoc');
            }
            $studentid = required_param('student_id', PARAM_INT);
            bff_helper::require_active_student($context, $studentid);
            $response = $client->get_student_risk_insight($courseid, $studentid, $snapshotid, (int)$USER->id);
            break;

        case 'course_insight_regenerate':
            require_sesskey();
            require_capability('local/agentpoc:manage', $context);
            require_capability('moodle/course:manageactivities', $context);
            if (!(bool)get_config('local_agentpoc', 'riskaitesttools')) {
                throw new \moodle_exception('errorinvalidaction', 'error', '', $action);
            }
            if ($snapshotid === '') {
                throw new \moodle_exception('errorrisksnapshotrequired', 'local_agentpoc');
            }
            $response = $client->regenerate_course_risk_insight($courseid, $snapshotid, (int)$USER->id);
            break;

        case 'student_insight_regenerate':
            require_sesskey();
            require_capability('local/agentpoc:manage', $context);
            require_capability('moodle/course:manageactivities', $context);
            if (!(bool)get_config('local_agentpoc', 'riskaitesttools')) {
                throw new \moodle_exception('errorinvalidaction', 'error', '', $action);
            }
            if ($snapshotid === '') {
                throw new \moodle_exception('errorrisksnapshotrequired', 'local_agentpoc');
            }
            $studentid = required_param('student_id', PARAM_INT);
            bff_helper::require_active_student($context, $studentid);
            $response = $client->regenerate_student_risk_insight($courseid, $studentid, $snapshotid, (int)$USER->id);
            break;

        case 'refresh':
            require_sesskey();
            require_capability('local/agentpoc:manage', $context);
            require_capability('moodle/course:manageactivities', $context);
            $response = $client->refresh_risk_course($courseid, (int)$USER->id);
            break;

        default:
            throw new \moodle_exception('errorinvalidaction', 'error', '', $action);
    }

    echo json_encode([
        'success' => true,
        'data' => $response,
    ]);
} catch (\Throwable $error) {
    local_agentpoc_risk_emit_error($error);
}
