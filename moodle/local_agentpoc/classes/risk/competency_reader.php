<?php
namespace local_agentpoc\risk;

use context_course;
use required_capability_exception;

defined('MOODLE_INTERNAL') || die();

final class competency_reader {
    private static function review_state(?\stdClass $usercompetency): string {
        if (!$usercompetency) {
            return 'NOT_AVAILABLE';
        }
        return match ((int) $usercompetency->status) {
            0 => 'IDLE',
            1 => 'WAITING_FOR_REVIEW',
            2 => 'IN_REVIEW',
            default => 'NOT_AVAILABLE',
        };
    }

    public static function read(int $courseid, array $enrolments, array $activities): array {
        global $DB;
        $context = context_course::instance($courseid);
        if (!has_any_capability([
            'moodle/competency:coursecompetencyview',
            'moodle/competency:coursecompetencymanage',
        ], $context)) {
            throw new required_capability_exception(
                $context,
                'moodle/competency:coursecompetencyview',
                'nopermissions',
                ''
            );
        }

        $coursecomps = $DB->get_records_sql(
            'SELECT c.id, c.shortname, c.idnumber,
                      CASE WHEN c.scaleid IS NULL OR c.scaleid = 0 THEN f.scaleid ELSE c.scaleid END AS effectivescaleid,
                      cc.ruleoutcome
               FROM {competency_coursecomp} cc
               JOIN {competency} c ON c.id = cc.competencyid
               JOIN {competency_framework} f ON f.id = c.competencyframeworkid
              WHERE cc.courseid = :courseid
           ORDER BY cc.sortorder ASC, c.id ASC',
            ['courseid' => $courseid]
        );

        $competencies = [];
        foreach ($coursecomps as $comp) {
            $competencies[] = [
                'competency_id' => (int) $comp->id,
                'shortname' => (string) $comp->shortname,
                'idnumber' => (string) $comp->idnumber,
                'scale_id' => (int) $comp->effectivescaleid,
                'source_ref' => source_reference::make($courseid, 'core_competency', 'competency', (int) $comp->id),
            ];
        }

        $activityids = array_map(static fn(array $activity): int => (int) $activity['activity_id'], $activities);
        $links = [];
        if ($activityids) {
            [$insql, $params] = $DB->get_in_or_equal($activityids, SQL_PARAMS_NAMED, 'cmid');
            $linkrows = $DB->get_records_sql(
                "SELECT id, cmid, competencyid, ruleoutcome
                   FROM {competency_modulecomp}
                  WHERE cmid {$insql}
               ORDER BY cmid ASC, sortorder ASC, id ASC",
                $params
            );
            foreach ($linkrows as $link) {
                if (!isset($coursecomps[(int) $link->competencyid])) {
                    continue;
                }
                $links[] = [
                    'activity_id' => (int) $link->cmid,
                    'competency_id' => (int) $link->competencyid,
                    'rule_outcome' => $link->ruleoutcome === null ? null : (int) $link->ruleoutcome,
                    'source_ref' => source_reference::make($courseid, 'core_competency', 'competency_modulecomp', (int) $link->id, (int) $link->cmid),
                ];
            }
        }

        $activeusers = array_values(array_map(
            static fn(array $e): int => (int) $e['student_id'],
            array_filter($enrolments, static fn(array $e): bool => !empty($e['active']))
        ));
        $ratings = [];
        if (!$activeusers || !$coursecomps) {
            return [
                'course_competencies' => $competencies,
                'activity_links' => $links,
                'ratings' => $ratings,
            ];
        }

        [$usersql, $userparams] = $DB->get_in_or_equal($activeusers, SQL_PARAMS_NAMED, 'userid');
        $compids = array_map('intval', array_keys($coursecomps));
        [$compsql, $compparams] = $DB->get_in_or_equal($compids, SQL_PARAMS_NAMED, 'compid');
        $params = ['courseid' => $courseid] + $userparams + $compparams;

        $courseusercomps = $DB->get_records_sql(
            "SELECT *
               FROM {competency_usercompcourse}
              WHERE courseid = :courseid
                AND userid {$usersql}
                AND competencyid {$compsql}",
            $params
        );
        $coursemap = [];
        foreach ($courseusercomps as $row) {
            $coursemap[(int) $row->userid . ':' . (int) $row->competencyid] = $row;
        }

        $usercomps = $DB->get_records_sql(
            "SELECT *
               FROM {competency_usercomp}
              WHERE userid {$usersql}
                AND competencyid {$compsql}",
            $userparams + $compparams
        );
        $usermap = [];
        $usercompids = [];
        foreach ($usercomps as $row) {
            $usermap[(int) $row->userid . ':' . (int) $row->competencyid] = $row;
            $usercompids[] = (int) $row->id;
        }

        $evidencebyusercomp = [];
        if ($usercompids) {
            [$evidencesql, $evidenceparams] = $DB->get_in_or_equal($usercompids, SQL_PARAMS_NAMED, 'ucid');
            $evidencerows = $DB->get_records_sql(
                "SELECT id, usercompetencyid, action, timecreated
                   FROM {competency_evidence}
                  WHERE usercompetencyid {$evidencesql}
               ORDER BY timecreated ASC, id ASC",
                $evidenceparams
            );
            foreach ($evidencerows as $evidence) {
                $evidencebyusercomp[(int) $evidence->usercompetencyid][] = $evidence;
            }
        }

        foreach ($activeusers as $studentid) {
            foreach ($compids as $competencyid) {
                $key = $studentid . ':' . $competencyid;
                $courseusercomp = $coursemap[$key] ?? null;
                $usercomp = $usermap[$key] ?? null;
                $evidenceout = [];
                foreach ($usercomp ? ($evidencebyusercomp[(int) $usercomp->id] ?? []) : [] as $evidence) {
                    $evidenceout[] = [
                        'evidence_id' => (int) $evidence->id,
                        'action' => (int) $evidence->action,
                        'created_at' => (int) $evidence->timecreated,
                        'source_ref' => source_reference::make(
                            $courseid,
                            'core_competency',
                            'competency_evidence',
                            (int) $evidence->id,
                            null,
                            $studentid
                        ),
                    ];
                }
                $ratings[] = [
                    'student_id' => $studentid,
                    'competency_id' => $competencyid,
                    'grade' => $courseusercomp && $courseusercomp->grade !== null ? (int) $courseusercomp->grade : null,
                    'proficiency' => $courseusercomp && $courseusercomp->proficiency !== null ? (bool) $courseusercomp->proficiency : null,
                    'rated_at' => $courseusercomp && (int) $courseusercomp->timemodified > 0 ? (int) $courseusercomp->timemodified : null,
                    'review_state' => self::review_state($usercomp),
                    'evidence' => $evidenceout,
                    'source_ref' => source_reference::make(
                        $courseid,
                        'core_competency',
                        'competency_usercompcourse',
                        $courseusercomp ? (int) $courseusercomp->id : ($studentid . ':' . $competencyid),
                        null,
                        $studentid
                    ),
                ];
            }
        }

        return [
            'course_competencies' => $competencies,
            'activity_links' => $links,
            'ratings' => $ratings,
        ];
    }
}
