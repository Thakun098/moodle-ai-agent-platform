<?php
namespace local_agentpoc\risk;

defined('MOODLE_INTERNAL') || die();

final class quiz_evidence_reader {
    private static function grade_item(int $courseid, int $quizid): ?\stdClass {
        global $DB;
        return $DB->get_record('grade_items', [
            'courseid' => $courseid,
            'itemtype' => 'mod',
            'itemmodule' => 'quiz',
            'iteminstance' => $quizid,
            'itemnumber' => 0,
        ]) ?: null;
    }

    public static function read(int $courseid, array $enrolments, array $activities): array {
        global $DB;
        $students = array_values(array_filter($enrolments, static fn(array $e): bool => !empty($e['active'])));
        $out = [];

        foreach ($activities as $activity) {
            if (($activity['module_name'] ?? '') !== 'quiz') {
                continue;
            }
            $activityid = (int) $activity['activity_id'];
            $quizid = (int) $activity['instance_id'];
            $quiz = $DB->get_record('quiz', ['id' => $quizid], '*', MUST_EXIST);
            $gradeitem = self::grade_item($courseid, $quizid);

            $attemptrows = $DB->get_records('quiz_attempts', ['quiz' => $quizid, 'preview' => 0], 'userid ASC, attempt ASC');
            $graderows = $DB->get_records('quiz_grades', ['quiz' => $quizid]);
            $attemptsbyuser = [];
            foreach ($attemptrows as $row) {
                $attemptsbyuser[(int) $row->userid][] = $row;
            }
            $gradesbyuser = [];
            foreach ($graderows as $row) {
                $gradesbyuser[(int) $row->userid] = $row;
            }

            $studentout = [];
            foreach ($students as $student) {
                $studentid = (int) $student['student_id'];
                $attempts = [];
                foreach ($attemptsbyuser[$studentid] ?? [] as $attempt) {
                    $attemptid = (int) $attempt->id;
                    $attempts[] = [
                        'attempt_id' => $attemptid,
                        'attempt_no' => (int) $attempt->attempt,
                        'state' => (string) $attempt->state,
                        'started_at' => (int) $attempt->timestart > 0 ? (int) $attempt->timestart : null,
                        'finished_at' => (int) $attempt->timefinish > 0 ? (int) $attempt->timefinish : null,
                        'raw_score' => $attempt->sumgrades === null ? null : (float) $attempt->sumgrades,
                        'source_ref' => source_reference::make($courseid, 'mod_quiz', 'quiz_attempt', $attemptid, $activityid, $studentid),
                    ];
                }
                $grade = $gradesbyuser[$studentid] ?? null;
                if ($grade && $grade->grade !== null) {
                    $gradestate = 'AVAILABLE';
                    $finalgrade = (float) $grade->grade;
                } else if ($attempts) {
                    $gradestate = 'PENDING';
                    $finalgrade = null;
                } else {
                    $gradestate = 'NOT_ATTEMPTED';
                    $finalgrade = null;
                }
                $studentout[] = [
                    'student_id' => $studentid,
                    'final_grade_state' => $gradestate,
                    'final_grade' => $finalgrade,
                    'attempts' => $attempts,
                    'source_ref' => source_reference::make($courseid, 'mod_quiz', 'quiz_grade', $quizid . ':' . $studentid, $activityid, $studentid),
                ];
            }

            $gradepass = $gradeitem && (float) $gradeitem->gradepass > 0 ? (float) $gradeitem->gradepass : null;
            $out[] = [
                'activity_id' => $activityid,
                'quiz_id' => $quizid,
                'time_open' => (int) $quiz->timeopen > 0 ? (int) $quiz->timeopen : null,
                'time_close' => (int) $quiz->timeclose > 0 ? (int) $quiz->timeclose : null,
                'attempts_allowed' => (int) $quiz->attempts > 0 ? (int) $quiz->attempts : null,
                'raw_score_max' => $quiz->sumgrades === null ? null : (float) $quiz->sumgrades,
                'grade_max' => $quiz->grade === null ? null : (float) $quiz->grade,
                'grade_to_pass' => [
                    'configured' => $gradepass !== null,
                    'value' => $gradepass,
                    'source_ref' => $gradeitem ? source_reference::make($courseid, 'core_grades', 'grade_item', (int) $gradeitem->id, $activityid) : null,
                ],
                'students' => $studentout,
                'source_ref' => source_reference::make($courseid, 'mod_quiz', 'quiz', $quizid, $activityid),
            ];
        }
        return $out;
    }
}
