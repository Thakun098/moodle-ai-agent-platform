<?php
namespace local_agentpoc\risk;

use context_course;

defined('MOODLE_INTERNAL') || die();

final class enrollment_reader {
    public static function read(int $courseid, int $observedat): array {
        global $DB;
        $context = context_course::instance($courseid);
        $users = get_enrolled_users(
            $context,
            'moodle/course:isincompletionreports',
            0,
            'u.id',
            null,
            0,
            0,
            true
        );
        if (!$users) {
            return [];
        }

        $userids = array_map(static fn($user): int => (int) $user->id, $users);
        [$insql, $inparams] = $DB->get_in_or_equal($userids, SQL_PARAMS_NAMED, 'uid');
        $params = [
            'courseid' => $courseid,
            'nowstart' => $observedat,
            'nowend' => $observedat,
        ] + $inparams;
        $sql = "SELECT ue.userid,
                       MIN(CASE WHEN ue.timestart > 0 THEN ue.timestart ELSE ue.timecreated END) AS enrolledat,
                       MAX(CASE WHEN ue.status = 0 AND e.status = 0
                                    AND (ue.timestart = 0 OR ue.timestart <= :nowstart)
                                    AND (ue.timeend = 0 OR ue.timeend > :nowend)
                                THEN 1 ELSE 0 END) AS active
                  FROM {enrol} e
                  JOIN {user_enrolments} ue ON ue.enrolid = e.id
                 WHERE e.courseid = :courseid
                   AND ue.userid {$insql}
              GROUP BY ue.userid";
        $rows = $DB->get_records_sql($sql, $params);

        $out = [];
        foreach ($userids as $userid) {
            $row = $rows[$userid] ?? null;
            $out[] = [
                'student_id' => $userid,
                'active' => $row ? ((int) $row->active === 1) : false,
                'enrolled_at' => $row && (int) $row->enrolledat > 0 ? (int) $row->enrolledat : null,
                'source_ref' => source_reference::make($courseid, 'core_enrol', 'user_enrolment', $userid, null, $userid),
            ];
        }
        return $out;
    }
}
