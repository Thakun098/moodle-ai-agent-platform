<?php
// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

namespace local_agentpoc;

use context;
use context_course;
use context_module;
use core_question\local\bank\question_version_status;
use moodle_exception;
use stdClass;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/questionlib.php');

/**
 * Shared helper utilities for local_agentpoc plugin.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class helper {

    /**
     * Resolves or creates a deterministic question category inside the Quiz activity context (P7-D3).
     *
     * @param context_module $quizcontext The Quiz module context.
     * @return stdClass The question category record.
     */
    public static function get_or_create_quiz_question_category(context_module $quizcontext): stdClass {
        global $DB;

        // Ensure top category exists for this module context.
        $topcategory = question_get_top_category($quizcontext->id, true);

        // Check for an existing subcategory under top category.
        $category = $DB->get_record('question_categories', [
            'contextid' => $quizcontext->id,
            'parent'    => $topcategory->id,
        ]);

        if (!$category) {
            $category = new stdClass();
            $category->name       = 'Default for ' . $quizcontext->get_context_name(false);
            $category->info       = 'Questions created for this quiz via Teacher AI Assistance 2';
            $category->infoformat = FORMAT_HTML;
            $category->contextid  = $quizcontext->id;
            $category->parent     = $topcategory->id;
            $category->sortorder  = 999;
            $category->stamp      = make_unique_id_code();
            $category->idnumber   = null;
            $category->id         = $DB->insert_record('question_categories', $category);
        }

        return $category;
    }

    /**
     * Resolves the latest concrete question ID for a question bank entry (P7-D4).
     *
     * @param int $questionbankentryid The stable conceptual question bank entry ID.
     * @return int The latest version's concrete question ID.
     * @throws moodle_exception If entry does not exist or has no question versions.
     */
    public static function get_latest_ready_question_id_for_bank_entry(int $questionbankentryid): int {
        global $DB;

        $sql = "SELECT qv.questionid
                  FROM {question_versions} qv
                 WHERE qv.questionbankentryid = :entryid
                   AND qv.status = :status
              ORDER BY qv.version DESC";

        $questionid = $DB->get_field_sql($sql, [
            'entryid' => $questionbankentryid,
            'status'  => question_version_status::QUESTION_STATUS_READY,
        ], IGNORE_MULTIPLE);

        if (!$questionid) {
            // Fallback to latest version regardless of status.
            $fallbacksql = "SELECT qv.questionid
                              FROM {question_versions} qv
                             WHERE qv.questionbankentryid = :entryid
                          ORDER BY qv.version DESC";
            $questionid = $DB->get_field_sql($fallbacksql, ['entryid' => $questionbankentryid], IGNORE_MULTIPLE);
        }

        if (!$questionid) {
            throw new moodle_exception('errorquestionbankentrynotfound', 'local_agentpoc', '', $questionbankentryid);
        }

        return (int) $questionid;
    }

    /**
     * Retrieves question bank entry and version metadata for a concrete question ID (P7-D4).
     *
     * @param int $questionid Concrete question ID.
     * @return stdClass Object with questionbankentryid, version, status, categoryid.
     * @throws moodle_exception If question does not exist.
     */
    public static function get_question_version_info(int $questionid): stdClass {
        global $DB;

        $sql = "SELECT qv.questionbankentryid, qv.version, qv.status, qbe.questioncategoryid as categoryid
                  FROM {question_versions} qv
                  JOIN {question_bank_entries} qbe ON qbe.id = qv.questionbankentryid
                 WHERE qv.questionid = :questionid";

        $info = $DB->get_record_sql($sql, ['questionid' => $questionid]);
        if (!$info) {
            throw new moodle_exception('errorquestionnotfound', 'local_agentpoc', '', $questionid);
        }

        return $info;
    }

    /**
     * Resolves course module ($cm) and course record from activity ID (CMID) and asserts module type.
     *
     * @param int $cmid The course module ID (activity_id).
     * @param string $expectedmodule Expected module name ('assign' or 'quiz').
     * @return array [$course, $cm, $context]
     * @throws moodle_exception If not found or wrong module type.
     */
    public static function get_course_and_cm_from_cmid(int $cmid, string $expectedmodule): array {
        global $DB;

        $cm = get_coursemodule_from_id($expectedmodule, $cmid, 0, false, MUST_EXIST);
        if (!$cm) {
            throw new moodle_exception('erroractivitynotfound', 'local_agentpoc', '', $cmid);
        }

        $course = $DB->get_record('course', ['id' => $cm->course], '*', MUST_EXIST);
        $context = context_module::instance($cm->id);

        return [$course, $cm, $context];
    }

    /**
     * Resolves the relative section number from a course_sections.id (R7).
     *
     * @param int $courseid The course ID.
     * @param int $sectionid The course_sections database record ID.
     * @return int The relative section number (e.g. 1, 2, 3...).
     * @throws moodle_exception If section does not exist in the course.
     */
    public static function resolve_section_num_from_section_id(int $courseid, int $sectionid): int {
        global $DB;

        $section = $DB->get_record('course_sections', [
            'id'     => $sectionid,
            'course' => $courseid,
        ], 'id, section', MUST_EXIST);

        return (int) $section->section;
    }

    /**
     * Returns the MIME type for a supported teacher learning-material extension.
     *
     * @param string $filename
     * @return string
     * @throws moodle_exception
     */
    public static function material_mimetype(string $filename): string {
        $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
        $mimetypes = [
            'txt' => 'text/plain',
            'md' => 'text/markdown',
            'markdown' => 'text/markdown',
            'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'pdf' => 'application/pdf',
            'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ];
        if (!isset($mimetypes[$extension])) {
            throw new moodle_exception('materialformatunsupported', 'local_agentpoc', '', $filename);
        }
        return $mimetypes[$extension];
    }

    /**
     * Persists one material file. Kept as a narrow seam so the transactional
     * replacement failure path can be exercised without mocking Moodle DB APIs.
     *
     * @param \file_storage $fs
     * @param array $filerecord
     * @param string $filepath
     * @return \stored_file
     */
    protected static function create_material_file(
        \file_storage $fs,
        array $filerecord,
        string $filepath
    ): \stored_file {
        return $fs->create_file_from_pathname($filerecord, $filepath);
    }

    /**
     * Stores one mutable teacher material file in Moodle's draft file area.
     *
     * The database row is the itemid anchor; Moodle remains the binary authority.
     *
     * @param string $runid
     * @param int $structurerevision
     * @param string $sectionref
     * @param string $filepath
     * @param string $filename
     * @param int $userid
     * @param bool $usegrounding
     * @param bool $publishcourse
     * @return int
     * @throws moodle_exception
     */
    public static function save_material_draft(
        string $runid,
        int $structurerevision,
        string $sectionref,
        string $filepath,
        string $filename,
        int $userid,
        bool $usegrounding = true,
        bool $publishcourse = false
    ): int {
        global $DB;

        $filename = clean_param($filename, PARAM_FILE);
        $mimetype = self::material_mimetype($filename);
        $incominghash = hash_file('sha256', $filepath);
        if ($incominghash === false) {
            throw new moodle_exception('errorupload', 'moodle', '', 'Learning material could not be hashed.');
        }
        $fs = get_file_storage();
        $existingdrafts = $DB->get_records('local_agentpoc_material', [
            'runid' => $runid,
            'structure_revision' => $structurerevision,
            'sectionref' => clean_param($sectionref, PARAM_ALPHANUMEXT),
            'revision' => 0,
            'userid' => $userid,
        ], 'id ASC');
        foreach ($existingdrafts as $existingdraft) {
            $existingfiles = $fs->get_area_files(\context_system::instance()->id, 'local_agentpoc', 'planning_material_draft', $existingdraft->id, 'id ASC', false);
            foreach ($existingfiles as $existingfile) {
                if (hash('sha256', $existingfile->get_content()) === $incominghash) {
                    return (int) $existingdraft->id;
                }
            }
        }
        $now = time();
        $record = (object) [
            'runid' => $runid,
            'structure_revision' => $structurerevision,
            'sectionref' => clean_param($sectionref, PARAM_ALPHANUMEXT),
            'revision' => 0,
            'usegrounding' => $usegrounding ? 1 : 0,
            'publishcourse' => $publishcourse ? 1 : 0,
            'userid' => $userid,
            'timecreated' => $now,
            'timemodified' => $now,
        ];
        $transaction = $DB->start_delegated_transaction();
        try {
            // Persist the replacement completely before retiring the prior
            // current draft. Moodle file metadata participates in this DB
            // transaction, so a failure restores the previous current file.
            $materialid = $DB->insert_record('local_agentpoc_material', $record);
            static::create_material_file($fs, [
                'contextid' => \context_system::instance()->id,
                'component' => 'local_agentpoc',
                'filearea' => 'planning_material_draft',
                'itemid' => $materialid,
                'filepath' => '/',
                'filename' => $filename,
                'mimetype' => $mimetype,
                'userid' => $userid,
            ], $filepath);

            foreach ($existingdrafts as $existingdraft) {
                $existingfiles = $fs->get_area_files(
                    \context_system::instance()->id,
                    'local_agentpoc',
                    'planning_material_draft',
                    $existingdraft->id,
                    'id ASC',
                    false
                );
                foreach ($existingfiles as $existingfile) {
                    if (!$existingfile->delete()) {
                        throw new \runtime_exception('Previous Learning Material file could not be retired.');
                    }
                }
                $DB->delete_records('local_agentpoc_material', ['id' => $existingdraft->id]);
            }
            $transaction->allow_commit();
        } catch (\Throwable $error) {
            try {
                $transaction->rollback($error);
            } catch (\Throwable $rollbackerror) {
                // Convert storage/DB internals to the existing safe upload error.
            }
            throw new moodle_exception('errorupload', 'moodle', '', 'Learning material could not be stored.');
        }

        return (int) $materialid;
    }

    /**
     * Lists draft material metadata for one run and section, excluding binaries.
     *
     * @param string $runid
     * @param string $sectionref
     * @return array
     */
    public static function list_material_drafts(string $runid, int $structurerevision, string $sectionref): array {
        global $DB;

        $records = $DB->get_records('local_agentpoc_material', [
            'runid' => $runid,
            'structure_revision' => $structurerevision,
            'sectionref' => clean_param($sectionref, PARAM_ALPHANUMEXT),
            'revision' => 0,
        ], 'id ASC');
        $fs = get_file_storage();
        $result = [];
        foreach ($records as $record) {
            $files = $fs->get_area_files(\context_system::instance()->id, 'local_agentpoc', 'planning_material_draft', $record->id, 'id ASC', false);
            foreach ($files as $file) {
                $result[] = [
                    'id' => (int) $record->id,
                    'filename' => $file->get_filename(),
                    'mimetype' => $file->get_mimetype(),
                    'filesize' => $file->get_filesize(),
                    'use_for_grounding' => (bool) $record->usegrounding,
                    'publish_to_course' => (bool) $record->publishcourse,
                    'revision' => 0,
                ];
            }
        }
        return $result;
    }

    /**
     * Deletes one mutable draft and its Moodle files. Snapshot rows are immutable.
     *
     * @param int $materialid
     * @param string $runid
     * @param int $userid
     * @return void
     * @throws moodle_exception
     */
    public static function delete_material_draft(int $materialid, string $runid, int $userid): void {
        global $DB;

        $record = $DB->get_record('local_agentpoc_material', ['id' => $materialid, 'runid' => $runid], '*', IGNORE_MISSING);
        if (!$record || (int) $record->revision !== 0 || (int) $record->userid !== $userid) {
            throw new moodle_exception('materialdraftnotfound', 'local_agentpoc', '', $materialid);
        }
        $fs = get_file_storage();
        $files = $fs->get_area_files(\context_system::instance()->id, 'local_agentpoc', 'planning_material_draft', $materialid, 'id ASC', false);
        foreach ($files as $file) {
            $file->delete();
        }
        $DB->delete_records('local_agentpoc_material', ['id' => $materialid]);
    }

    /**
     * Copies all current draft files into a new immutable snapshot revision.
     *
     * @param string $runid
     * @param int $structurerevision
     * @param string $sectionref
     * @param int $userid
     * @return array
     * @throws moodle_exception
     */
    public static function snapshot_material_drafts(string $runid, int $structurerevision, string $sectionref, int $userid): array {
        global $DB;

        $sectionref = clean_param($sectionref, PARAM_ALPHANUMEXT);
        $drafts = $DB->get_records('local_agentpoc_material', [
            'runid' => $runid,
            'structure_revision' => $structurerevision,
            'sectionref' => $sectionref,
            'revision' => 0,
        ], 'id ASC');
        if (!$drafts) {
            throw new moodle_exception('materialrequired', 'local_agentpoc', '', $sectionref);
        }
        $maxrevision = $DB->get_field_sql(
            'SELECT COALESCE(MAX(revision), 0) FROM {local_agentpoc_material} WHERE runid = :runid AND structure_revision = :structure_revision AND sectionref = :sectionref',
            ['runid' => $runid, 'structure_revision' => $structurerevision, 'sectionref' => $sectionref]
        );
        $snapshotrevision = ((int) $maxrevision) + 1;
        $fs = get_file_storage();
        $snapshotfiles = [];
        $seenhashes = [];

        foreach ($drafts as $draft) {
            $snapshot = clone $draft;
            unset($snapshot->id);
            $snapshot->structure_revision = $structurerevision;
            $snapshot->revision = $snapshotrevision;
            $snapshot->userid = $userid;
            $snapshot->timecreated = time();
            $snapshot->timemodified = $snapshot->timecreated;
            $snapshotid = $DB->insert_record('local_agentpoc_material', $snapshot);

            $files = $fs->get_area_files(\context_system::instance()->id, 'local_agentpoc', 'planning_material_draft', $draft->id, 'id ASC', false);
            foreach ($files as $file) {
                $sha256 = hash('sha256', $file->get_content());
                if (isset($seenhashes[$sha256])) {
                    continue;
                }
                $seenhashes[$sha256] = true;
                $fs->create_file_from_storedfile([
                    'contextid' => \context_system::instance()->id,
                    'component' => 'local_agentpoc',
                    'filearea' => 'planning_material_snapshot',
                    'itemid' => $snapshotid,
                    'filepath' => $file->get_filepath(),
                    'filename' => $file->get_filename(),
                    'mimetype' => $file->get_mimetype(),
                    'userid' => $userid,
                ], $file);
                $snapshotfiles[] = [
                    'material_id' => (int) $snapshotid,
                    'source_draft_id' => (int) $draft->id,
                    'filename' => $file->get_filename(),
                    'mimetype' => $file->get_mimetype(),
                    'filesize' => $file->get_filesize(),
                    'revision' => $snapshotrevision,
                    'use_for_grounding' => (bool) $snapshot->usegrounding,
                    'publish_to_course' => (bool) $snapshot->publishcourse,
                ];
            }
        }
        return [
            'section_ref' => $sectionref,
            'revision' => $snapshotrevision,
            'files' => $snapshotfiles,
        ];
    }

    /**
     * Exports sealed Moodle files as Moodle stored_file objects for the BFF call.
     *
     * @param array $snapshotfiles Metadata returned by snapshot_material_drafts().
     * @return array
     * @throws moodle_exception
     */
    public static function export_snapshot_files(array $snapshotfiles): array {
        $fs = get_file_storage();
        $uploads = [];
        foreach ($snapshotfiles as $snapshotfile) {
            $materialid = (int)($snapshotfile['material_id'] ?? 0);
            $files = $fs->get_area_files(\context_system::instance()->id, 'local_agentpoc', 'planning_material_snapshot', $materialid, 'id ASC', false);
            if (!$files) {
                throw new moodle_exception('materialdraftnotfound', 'local_agentpoc', '', $materialid);
            }
            foreach ($files as $file) {
                $uploads[] = [
                    'file' => $file,
                    'filename' => $file->get_filename(),
                    'mimetype' => $file->get_mimetype(),
                    'moodle_material_id' => $materialid,
                    'use_for_grounding' => !empty($snapshotfile['use_for_grounding']),
                    'publish_to_course' => !empty($snapshotfile['publish_to_course']),
                ];
            }
        }
        return $uploads;
    }
}
