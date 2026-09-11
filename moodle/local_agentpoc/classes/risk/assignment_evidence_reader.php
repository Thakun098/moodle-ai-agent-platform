<?php
namespace local_agentpoc\risk;

defined('MOODLE_INTERNAL') || die();

final class assignment_evidence_reader {
    private static function grade_item(int $courseid, int $assignmentid): ?\stdClass {
        global $DB;
        return $DB->get_record('grade_items', [
            'courseid' => $courseid,
            'itemtype' => 'mod',
            'itemmodule' => 'assign',
            'iteminstance' => $assignmentid,
            'itemnumber' => 0,
        ]) ?: null;
    }

    public static function read(int $courseid, array $enrolments, array $activities): array {
        global $DB;
        $students = array_values(array_filter($enrolments, static fn(array $e): bool => !empty($e['active'])));
        $out = [];

        foreach ($activities as $activity) {
            if (($activity['module_name'] ?? '') !== 'assign') {
                continue;
            }
            $activityid = (int) $activity['activity_id'];
            $assignmentid = (int) $activity['instance_id'];
            $assignment = $DB->get_record('assign', ['id' => $assignmentid], '*', MUST_EXIST);
            $gradeitem = self::grade_item($courseid, $assignmentid);

            $submissions = $DB->get_records('assign_submission', ['assignment' => $assignmentid, 'latest' => 1]);
            $submissionsbyuser = [];
            foreach ($submissions as $submission) {
                if ((int) $submission->userid > 0 && (int) $submission->groupid === 0) {
                    $submissionsbyuser[(int) $submission->userid] = $submission;
                }
            }

            $graderows = $DB->get_records('assign_grades', ['assignment' => $assignmentid], 'userid ASC, attemptnumber DESC, timemodified DESC');
            $gradesbyuser = [];
            foreach ($graderows as $grade) {
                $userid = (int) $grade->userid;
                if (!isset($gradesbyuser[$userid])) {
                    $gradesbyuser[$userid] = $grade;
                }
            }

            $studentout = [];
            foreach ($students as $student) {
                $studentid = (int) $student['student_id'];
                $submission = $submissionsbyuser[$studentid] ?? null;
                $grade = $gradesbyuser[$studentid] ?? null;
                if (!$submission) {
                    $submissionstate = 'NOT_ATTEMPTED';
                } else if ((string) $submission->status === ASSIGN_SUBMISSION_STATUS_SUBMITTED) {
                    $submissionstate = 'SUBMITTED';
                } else if ((string) $submission->status === ASSIGN_SUBMISSION_STATUS_DRAFT) {
                    $submissionstate = 'DRAFT';
                } else {
                    $submissionstate = 'UNKNOWN';
                }

                if ($grade && $grade->grade !== null && (float) $grade->grade >= 0) {
                    $gradestate = 'AVAILABLE';
                    $gradevalue = (float) $grade->grade;
                } else if ($submissionstate === 'SUBMITTED' || $submissionstate === 'DRAFT') {
                    $gradestate = 'PENDING';
                    $gradevalue = null;
                } else {
                    $gradestate = 'NOT_ATTEMPTED';
                    $gradevalue = null;
                }

                $studentout[] = [
                    'student_id' => $studentid,
                    'submission_state' => $submissionstate,
                    'submitted_at' => $submissionstate === 'SUBMITTED' && (int) $submission->timemodified > 0 ? (int) $submission->timemodified : null,
                    'modified_at' => $submission && (int) $submission->timemodified > 0 ? (int) $submission->timemodified : null,
                    'attempt_no' => $submission ? (int) $submission->attemptnumber : null,
                    'grade_state' => $gradestate,
                    'grade' => $gradevalue,
                    'graded_at' => $grade && (int) $grade->timemodified > 0 ? (int) $grade->timemodified : null,
                    'source_ref' => source_reference::make($courseid, 'mod_assign', 'assignment_submission', $assignmentid . ':' . $studentid, $activityid, $studentid),
                ];
            }

            $gradepass = $gradeitem && (float) $gradeitem->gradepass > 0 ? (float) $gradeitem->gradepass : null;
            $out[] = [
                'activity_id' => $activityid,
                'assignment_id' => $assignmentid,
                'due_at' => (int) $assignment->duedate > 0 ? (int) $assignment->duedate : null,
                'cutoff_at' => (int) $assignment->cutoffdate > 0 ? (int) $assignment->cutoffdate : null,
                'grade_max' => $assignment->grade === null ? null : (float) $assignment->grade,
                'grade_to_pass' => [
                    'configured' => $gradepass !== null,
                    'value' => $gradepass,
                    'source_ref' => $gradeitem ? source_reference::make($courseid, 'core_grades', 'grade_item', (int) $gradeitem->id, $activityid) : null,
                ],
                'students' => $studentout,
                'source_ref' => source_reference::make($courseid, 'mod_assign', 'assign', $assignmentid, $activityid),
            ];
        }
        return $out;
    }
}
