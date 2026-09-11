<?php
namespace local_agentpoc\risk;

use completion_info;

defined('MOODLE_INTERNAL') || die();

final class completion_reader {
    private static function map_state(int $state): string {
        return match ($state) {
            COMPLETION_INCOMPLETE => 'INCOMPLETE',
            COMPLETION_COMPLETE => 'COMPLETE',
            COMPLETION_COMPLETE_PASS => 'COMPLETE_PASS',
            COMPLETION_COMPLETE_FAIL => 'COMPLETE_FAIL',
            default => 'UNKNOWN',
        };
    }

    public static function read(\stdClass $course, array $enrolments, array $activities): array {
        $completioninfo = new completion_info($course);
        $modinfo = get_fast_modinfo($course);
        $out = [];

        foreach ($enrolments as $enrolment) {
            if (empty($enrolment['active'])) {
                continue;
            }
            $studentid = (int) $enrolment['student_id'];
            foreach ($activities as $activity) {
                if (($activity['completion_tracking'] ?? 'NONE') === 'NONE') {
                    continue;
                }
                $activityid = (int) $activity['activity_id'];
                if (!isset($modinfo->cms[$activityid])) {
                    continue;
                }
                $data = $completioninfo->get_data($modinfo->cms[$activityid], false, $studentid);
                $state = (int) ($data->completionstate ?? COMPLETION_INCOMPLETE);
                $completedat = (int) ($data->timemodified ?? 0);
                $out[] = [
                    'student_id' => $studentid,
                    'activity_id' => $activityid,
                    'state' => self::map_state($state),
                    'completed_at' => $state === COMPLETION_INCOMPLETE || $completedat <= 0 ? null : $completedat,
                    'source_ref' => source_reference::make(
                        (int) $course->id,
                        'core_completion',
                        'course_modules_completion',
                        $activityid . ':' . $studentid,
                        $activityid,
                        $studentid
                    ),
                ];
            }
        }
        return $out;
    }
}
