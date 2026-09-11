<?php
namespace local_agentpoc\risk;

defined('MOODLE_INTERNAL') || die();

final class source_reference {
    public static function make(
        int $courseid,
        string $component,
        string $entitytype,
        int|string $entityid,
        ?int $activityid = null,
        ?int $studentid = null
    ): array {
        $ref = [
            'source' => 'moodle',
            'component' => $component,
            'entity_type' => $entitytype,
            'entity_id' => (string) $entityid,
            'course_id' => $courseid,
        ];
        if ($activityid !== null) {
            $ref['activity_id'] = $activityid;
        }
        if ($studentid !== null) {
            $ref['student_id'] = $studentid;
        }
        return $ref;
    }
}
