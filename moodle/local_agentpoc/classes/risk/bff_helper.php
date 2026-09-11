<?php
// This file is part of Moodle - http://moodle.org/.

/**
 * Moodle-side Risk BFF helper utilities.
 *
 * Identity enrichment and current-Moodle navigation stay on the Moodle side;
 * canonical Risk snapshots in the AI Platform remain pseudonymous.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_agentpoc\risk;

defined('MOODLE_INTERNAL') || die();

final class bff_helper {
    /**
     * Adds Moodle display identity to Student rows without changing canonical Risk data.
     *
     * @param array $data AI Platform response.
     * @param int $courseid Course id.
     * @return array Enriched response.
     */
    public static function enrich_dashboard_identities(array $data, int $courseid): array {
        if (!isset($data['students']) || !is_array($data['students'])) {
            return $data;
        }

        foreach (['all', 'attention'] as $key) {
            if (!isset($data['students'][$key]) || !is_array($data['students'][$key])) {
                continue;
            }
            foreach ($data['students'][$key] as &$row) {
                if (!is_array($row) || empty($row['student_id'])) {
                    continue;
                }
                $row['identity'] = self::student_identity((int)$row['student_id'], $courseid);
            }
            unset($row);
        }
        return $data;
    }

    /**
     * Adds Moodle display identity and resolves current-source navigation for Student detail.
     *
     * @param array $data AI Platform response.
     * @param \stdClass $course Course record.
     * @return array Enriched response.
     */
    public static function enrich_student_detail(array $data, \stdClass $course): array {
        if (isset($data['student']['student_id'])) {
            $data['student']['identity'] = self::student_identity((int)$data['student']['student_id'], (int)$course->id);
        }

        if (isset($data['evidence_journey']['evidence']) && is_array($data['evidence_journey']['evidence'])) {
            foreach ($data['evidence_journey']['evidence'] as &$item) {
                if (!is_array($item) || !isset($item['current_source_navigation']) || !is_array($item['current_source_navigation'])) {
                    continue;
                }
                $item['current_source_navigation'] = self::resolve_navigation($item['current_source_navigation'], $course);
            }
            unset($item);
        }
        return $data;
    }

    /**
     * Resolves Activity drill-down current-source navigation.
     *
     * @param array $data AI Platform response.
     * @param \stdClass $course Course record.
     * @return array
     */
    public static function enrich_activity_detail(array $data, \stdClass $course): array {
        if (isset($data['activity']['current_source_navigation']) && is_array($data['activity']['current_source_navigation'])) {
            $data['activity']['current_source_navigation'] = self::resolve_navigation(
                $data['activity']['current_source_navigation'],
                $course
            );
        }
        return $data;
    }

    /**
     * Resolves Competency drill-down current-source navigation.
     *
     * @param array $data AI Platform response.
     * @param \stdClass $course Course record.
     * @return array
     */
    public static function enrich_competency_detail(array $data, \stdClass $course): array {
        if (isset($data['competency']['current_source_navigation']) && is_array($data['competency']['current_source_navigation'])) {
            $data['competency']['current_source_navigation'] = self::resolve_navigation(
                $data['competency']['current_source_navigation'],
                $course
            );
        }
        return $data;
    }

    /**
     * Ensures a requested Student is actively enrolled in the Course.
     *
     * @param \context_course $context Course context.
     * @param int $studentid Student id.
     */
    public static function require_active_student(\context_course $context, int $studentid): void {
        if ($studentid <= 0 || !is_enrolled($context, $studentid, '', true)) {
            throw new \moodle_exception('errorriskstudentaccess', 'local_agentpoc');
        }
    }

    /**
     * Returns only Teacher-visible Moodle identity fields needed by the Risk UI.
     *
     * @param int $studentid Student id.
     * @param int $courseid Course id.
     * @return array
     */
    private static function student_identity(int $studentid, int $courseid): array {
        global $DB;

        $user = $DB->get_record('user', ['id' => $studentid, 'deleted' => 0], 'id,firstname,lastname,firstnamephonetic,lastnamephonetic,middlename,alternatename', MUST_EXIST);
        return [
            'display_name' => fullname($user),
            'profile_url' => (new \moodle_url('/user/view.php', ['id' => $studentid, 'course' => $courseid]))->out(false),
        ];
    }

    /**
     * Converts an AI Platform source-navigation hint into a current Moodle URL.
     * Historical evidence remains untouched; this URL always points to current Moodle state.
     *
     * @param array $navigation Navigation hint.
     * @param \stdClass $course Course record.
     * @return array Navigation with a URL and resolution status.
     */
    private static function resolve_navigation(array $navigation, \stdClass $course): array {
        $courseid = (int)$course->id;
        $navigation['resolution'] = 'COURSE_FALLBACK';
        $navigation['url'] = (new \moodle_url('/course/view.php', ['id' => $courseid]))->out(false);

        $activityid = isset($navigation['activity_id']) ? (int)$navigation['activity_id'] : 0;
        if ($activityid > 0) {
            try {
                $modinfo = get_fast_modinfo($course);
                if (isset($modinfo->cms[$activityid])) {
                    $cm = $modinfo->cms[$activityid];
                    if ($cm->url) {
                        $navigation['url'] = $cm->url->out(false);
                        $navigation['resolution'] = 'ACTIVITY';
                        return $navigation;
                    }
                }
            } catch (\Throwable $ignored) {
                // Keep the Course fallback; current Moodle navigation must never break snapshot display.
            }
        }

        $studentid = isset($navigation['student_id']) ? (int)$navigation['student_id'] : 0;
        if ($studentid > 0) {
            $navigation['url'] = (new \moodle_url('/user/view.php', ['id' => $studentid, 'course' => $courseid]))->out(false);
            $navigation['resolution'] = 'STUDENT';
        }
        return $navigation;
    }
}
