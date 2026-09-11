<?php
namespace local_agentpoc\risk;

defined('MOODLE_INTERNAL') || die();

final class course_risk_evidence_assembler {
    private static function status(string $dataset, string $status, int $observedat, ?string $message = null): array {
        $out = [
            'dataset' => $dataset,
            'status' => $status,
            'observed_at' => $observedat,
        ];
        if ($message !== null && $message !== '') {
            $out['message'] = $message;
        }
        return $out;
    }

    private static function read_dataset(
        string $dataset,
        int $observedat,
        callable $reader,
        mixed $fallback,
        array &$statuses
    ): mixed {
        try {
            $value = $reader();
            $statuses[] = self::status($dataset, 'OK', $observedat);
            return $value;
        } catch (\Throwable $error) {
            $statuses[] = self::status($dataset, 'ERROR', $observedat, get_class($error) . ': ' . $error->getMessage());
            return $fallback;
        }
    }

    public static function assemble(\stdClass $course): array {
        $observedat = time();
        $statuses = [];

        $enrolments = self::read_dataset(
            'enrolments',
            $observedat,
            static fn(): array => enrollment_reader::read((int) $course->id, $observedat),
            [],
            $statuses
        );
        $activities = self::read_dataset(
            'timeline',
            $observedat,
            static fn(): array => timeline_reader::read($course),
            [],
            $statuses
        );
        $completion = self::read_dataset(
            'completion',
            $observedat,
            static fn(): array => completion_reader::read($course, $enrolments, $activities),
            [],
            $statuses
        );
        $quizzes = self::read_dataset(
            'quizzes',
            $observedat,
            static fn(): array => quiz_evidence_reader::read((int) $course->id, $enrolments, $activities),
            [],
            $statuses
        );
        $assignments = self::read_dataset(
            'assignments',
            $observedat,
            static fn(): array => assignment_evidence_reader::read((int) $course->id, $enrolments, $activities),
            [],
            $statuses
        );
        $competencies = self::read_dataset(
            'competencies',
            $observedat,
            static fn(): array => competency_reader::read((int) $course->id, $enrolments, $activities),
            [
                'course_competencies' => [],
                'activity_links' => [],
                'ratings' => [],
            ],
            $statuses
        );

        return [
            'schema_version' => '0.1',
            'observed_at' => $observedat,
            'course' => [
                'course_id' => (int) $course->id,
                'fullname' => (string) $course->fullname,
                'shortname' => (string) $course->shortname,
                'format' => (string) $course->format,
                'start_at' => (int) $course->startdate > 0 ? (int) $course->startdate : null,
                'end_at' => (int) $course->enddate > 0 ? (int) $course->enddate : null,
            ],
            'dataset_status' => $statuses,
            'enrolments' => $enrolments,
            'activities' => $activities,
            'completion' => $completion,
            'quizzes' => $quizzes,
            'assignments' => $assignments,
            'competencies' => $competencies,
        ];
    }
}
