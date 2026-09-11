<?php
namespace local_agentpoc\risk;

defined('MOODLE_INTERNAL') || die();

final class timeline_reader {
    private static function availability_window(?string $availability): array {
        if (!$availability) {
            return [null, null];
        }
        $decoded = json_decode($availability, true);
        if (!is_array($decoded)) {
            return [null, null];
        }
        $from = null;
        $until = null;
        $walk = static function ($node) use (&$walk, &$from, &$until): void {
            if (!is_array($node)) {
                return;
            }
            if (($node['type'] ?? null) === 'date' && isset($node['d'], $node['t'])) {
                $time = (int) $node['t'];
                if (in_array($node['d'], ['>=', '>'], true)) {
                    $from = $from === null ? $time : max($from, $time);
                } else if (in_array($node['d'], ['<', '<='], true)) {
                    $until = $until === null ? $time : min($until, $time);
                }
            }
            foreach ($node as $value) {
                if (is_array($value)) {
                    $walk($value);
                }
            }
        };
        $walk($decoded);
        return [$from, $until];
    }

    public static function read(\stdClass $course): array {
        global $DB;
        $modinfo = get_fast_modinfo($course);
        $sections = $modinfo->get_section_info_all();
        $out = [];

        foreach ($sections as $section) {
            $sectionnum = (int) $section->section;
            foreach ($modinfo->sections[$sectionnum] ?? [] as $cmid) {
                $cm = $modinfo->cms[$cmid] ?? null;
                if (!$cm) {
                    continue;
                }
                $dueat = null;
                if ($cm->modname === 'assign') {
                    $dueat = (int) ($DB->get_field('assign', 'duedate', ['id' => $cm->instance]) ?: 0);
                } else if ($cm->modname === 'quiz') {
                    $dueat = (int) ($DB->get_field('quiz', 'timeclose', ['id' => $cm->instance]) ?: 0);
                }
                [$availablefrom, $availableuntil] = self::availability_window($cm->availability ?? null);
                $tracking = match ((int) $cm->completion) {
                    COMPLETION_TRACKING_MANUAL => 'MANUAL',
                    COMPLETION_TRACKING_AUTOMATIC => 'AUTOMATIC',
                    default => 'NONE',
                };
                $out[] = [
                    'activity_id' => (int) $cm->id,
                    'instance_id' => (int) $cm->instance,
                    'module_name' => (string) $cm->modname,
                    'section_id' => (int) $section->id,
                    'section_num' => $sectionnum,
                    'name' => (string) $cm->name,
                    'visible' => (bool) $cm->visible,
                    'completion_tracking' => $tracking,
                    'completion_expected_at' => (int) $cm->completionexpected > 0 ? (int) $cm->completionexpected : null,
                    'available_from' => $availablefrom,
                    'available_until' => $availableuntil,
                    'due_at' => $dueat > 0 ? $dueat : null,
                    'source_ref' => source_reference::make((int) $course->id, 'core_course', 'course_module', (int) $cm->id, (int) $cm->id),
                ];
            }
        }
        return $out;
    }
}
