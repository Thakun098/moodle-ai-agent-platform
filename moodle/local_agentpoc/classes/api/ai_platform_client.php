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

/**
 * AI Platform Server-Side HTTP Client (BFF) for local_agentpoc.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_agentpoc\api;

defined('MOODLE_INTERNAL') || die();

require_once($CFG->libdir . '/filelib.php');

class ai_platform_client {

    /** Read the persisted semantic revision without reconstructing browser authority. */
    public function get_core_context(string $runid): array {
        return $this->request('GET', '/api/runs/' . rawurlencode($runid) . '/core-context');
    }


    /** @var string Base URL for AI platform API */
    protected string $baseurl;

    /** @var int Request timeout in seconds */
    protected int $timeout;

    /** @var string Server-side shared credential for Risk BFF calls. */
    protected string $riskservicekey;

    /**
     * Constructor.
     *
     * @param string|null $baseurl Optional override for AI platform base URL.
     * @param int|null $timeout Optional override for timeout.
     */
    public function __construct(?string $baseurl = null, ?int $timeout = null) {
        $configuredurl = get_config('local_agentpoc', 'aiplatformurl');
        $this->baseurl = rtrim($baseurl ?? ($configuredurl ?: 'http://host.docker.internal:3000'), '/');

        $configuredtimeout = get_config('local_agentpoc', 'aiplatformtimeout');
        $this->timeout = $timeout ?? ($configuredtimeout ? (int)$configuredtimeout : 180);
        $this->riskservicekey = trim((string)get_config('local_agentpoc', 'riskservicekey'));
    }

    /**
     * Executes an HTTP request to the AI platform.
     *
     * @param string $method HTTP method (GET, POST, etc.)
     * @param string $endpoint API endpoint path (e.g. /api/runs)
     * @param mixed $data Payload for request
     * @param array $headers Additional headers
     * @return array Decoded response data
     * @throws \moodle_exception On network, HTTP or contract error
     */
    protected function request(string $method, string $endpoint, $data = null, array $headers = [], bool $preserveapierror = false): array {
        $curl = new \curl(['ignoresecurity' => true]);
        $curl->setHeader($headers);

        $options = [
            'CURLOPT_TIMEOUT' => $this->timeout,
            'CURLOPT_CONNECTTIMEOUT' => 15,
            'CURLOPT_RETURNTRANSFER' => true,
        ];

        $url = $this->baseurl . $endpoint;
        $response = null;

        if (strtoupper($method) === 'GET') {
            if ($data && is_array($data)) {
                $url .= '?' . http_build_query($data);
            }
            $response = $curl->get($url, [], $options);
        } else if (strtoupper($method) === 'POST') {
            if (is_array($data) && isset($data['_is_multipart']) && $data['_is_multipart']) {
                unset($data['_is_multipart']);
                $response = $curl->post($url, $data, $options);
            } else {
                $json = json_encode($data);
                $curl->setHeader(array_merge($headers, ['Content-Type: application/json']));
                $response = $curl->post($url, $json, $options);
            }
        } else if (strtoupper($method) === 'PUT') {
            $json = json_encode($data);
            $curl->setHeader(array_merge($headers, ['Content-Type: application/json']));
            $response = $curl->put($url, $json, $options);
        } else {
            throw new \coding_exception('Unsupported HTTP method: ' . $method);
        }

        $httpcode = (int)$curl->get_info()['http_code'];

        if ($curl->get_errno()) {
            throw new \moodle_exception('erroraiplatform', 'local_agentpoc', '', 'Connection failed: ' . $curl->error);
        }

        $decoded = json_decode($response, true);

        if ($httpcode >= 400) {
            $errormsg = 'HTTP ' . $httpcode;
            $apicode = 'AI_PLATFORM_HTTP_ERROR';
            if (is_array($decoded) && isset($decoded['error']['message'])) {
                $errormsg = $decoded['error']['message'];
                if (isset($decoded['error']['code']) && is_string($decoded['error']['code'])) {
                    $apicode = $decoded['error']['code'];
                }
            } else if (is_string($response) && $response !== '') {
                $errormsg .= ': ' . substr($response, 0, 200);
            }
            if ($preserveapierror) {
                throw new risk_api_exception($httpcode, $apicode, $errormsg);
            }
            throw new \moodle_exception('erroraiplatform', 'local_agentpoc', '', $errormsg);
        }

        if (!is_array($decoded)) {
            throw new \moodle_exception('erroraiplatform', 'local_agentpoc', '', 'Invalid JSON response from AI platform.');
        }

        return $decoded;
    }

    /** Build server-side headers for authenticated Risk BFF requests. */
    protected function risk_headers(int $courseid, int $actorid): array {
        if ($this->riskservicekey === '') {
            throw new \moodle_exception('erroraiplatform', 'local_agentpoc', '', 'Risk service credential is not configured.');
        }
        return [
            'X-AgentPOC-Service-Key: ' . $this->riskservicekey,
            'X-AgentPOC-Actor-Ref: moodle-user:' . $actorid,
            'X-AgentPOC-Actor-Type: teacher',
            'X-AgentPOC-Course-Ref: course:' . $courseid,
            'X-AgentPOC-Request-Origin: MOODLE_BFF',
        ];
    }

    /** Fetches one snapshot-consistent Course Risk Dashboard projection. */
    public function get_risk_dashboard(int $courseid, int $actorid, ?string $snapshotid = null): array {
        $query = $snapshotid !== null && $snapshotid !== '' ? ['snapshot_id' => $snapshotid] : null;
        return $this->request('GET', '/api/risk/courses/' . $courseid . '/dashboard', $query, $this->risk_headers($courseid, $actorid), true);
    }

    /** Fetches one Student Risk drill-down pinned to a snapshot. */
    public function get_student_risk(int $courseid, int $studentid, string $snapshotid, int $actorid): array {
        return $this->request('GET', '/api/risk/courses/' . $courseid . '/students/' . $studentid, ['snapshot_id' => $snapshotid], $this->risk_headers($courseid, $actorid), true);
    }

    /** Fetches one Activity Risk drill-down pinned to a snapshot. */
    public function get_activity_risk(int $courseid, int $activityid, string $snapshotid, int $actorid): array {
        return $this->request('GET', '/api/risk/courses/' . $courseid . '/activities/' . $activityid, ['snapshot_id' => $snapshotid], $this->risk_headers($courseid, $actorid), true);
    }

    /** Fetches one Competency Risk drill-down pinned to a snapshot. */
    public function get_competency_risk(int $courseid, int $competencyid, string $snapshotid, int $actorid): array {
        return $this->request('GET', '/api/risk/courses/' . $courseid . '/competencies/' . $competencyid, ['snapshot_id' => $snapshotid], $this->risk_headers($courseid, $actorid), true);
    }

    /** Fetches validated Course AI Insight pinned to a Risk snapshot. */
    public function get_course_risk_insight(int $courseid, string $snapshotid, int $actorid): array {
        return $this->request('GET', '/api/risk/courses/' . $courseid . '/insight', ['snapshot_id' => $snapshotid], $this->risk_headers($courseid, $actorid), true);
    }

    /** Forces regeneration of validated Course AI Insight for test tooling, bypassing cache only. */
    public function regenerate_course_risk_insight(int $courseid, string $snapshotid, int $actorid): array {
        return $this->request('POST', '/api/risk/courses/' . $courseid . '/insight/regenerate', ['snapshot_id' => $snapshotid], $this->risk_headers($courseid, $actorid), true);
    }

    /** Fetches validated Student AI Insight pinned to a Risk snapshot. */
    public function get_student_risk_insight(int $courseid, int $studentid, string $snapshotid, int $actorid): array {
        return $this->request('GET', '/api/risk/courses/' . $courseid . '/students/' . $studentid . '/insight', ['snapshot_id' => $snapshotid], $this->risk_headers($courseid, $actorid), true);
    }

    /** Forces regeneration of validated Student AI Insight for test tooling, bypassing cache only. */
    public function regenerate_student_risk_insight(int $courseid, int $studentid, string $snapshotid, int $actorid): array {
        return $this->request('POST', '/api/risk/courses/' . $courseid . '/students/' . $studentid . '/insight/regenerate', ['snapshot_id' => $snapshotid], $this->risk_headers($courseid, $actorid), true);
    }

    /** Triggers the shared manual Risk refresh path. */
    public function refresh_risk_course(int $courseid, int $actorid): array {
        return $this->request('POST', '/api/risk/courses/' . $courseid . '/refresh', new \stdClass(), $this->risk_headers($courseid, $actorid), true);
    }

    /**
     * Uploads syllabus and creates a new run.
     *
     * @param string $filepath Path to syllabus file on disk.
     * @param string $filename Original filename.
     * @param string $mimetype File MIME type.
     * @return array Run metadata including run_id and ingestion summary.
     */
    public function create_run(string $filepath, string $filename, string $mimetype, string $courseformat = 'topics'): array {
        $cfile = curl_file_create($filepath, $mimetype, $filename);
        $data = [
            '_is_multipart' => true,
            'course_format' => $courseformat,
            'file' => $cfile,
        ];
        return $this->request('POST', '/api/runs', $data);
    }

    /**
     * Generates initial course plan.
     *
     * @param string $runid
     * @return array Plan record and preview.
     */
    public function generate_course_plan(string $runid, ?string $teacherinstruction = null): array {
        $payload = $teacherinstruction !== null && trim($teacherinstruction) !== ''
            ? ['teacher_instruction' => trim($teacherinstruction)]
            : new \stdClass();
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/plans/course', $payload);
    }

    /** Generates the syllabus-grounded Course Structure independently of activities. */
    public function generate_course_structure(string $runid, ?string $teacherinstruction = null): array {
        $payload = $teacherinstruction !== null && trim($teacherinstruction) !== ''
            ? ['teacher_instruction' => trim($teacherinstruction)]
            : new \stdClass();
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/course-structure', $payload);
    }

    /** Fetches current and immutable Course Structure revisions. */
    public function get_course_structure(string $runid): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/course-structure');
    }

    /** Explicitly acknowledges the current UNSPECIFIED Learner Context revision. */
    public function acknowledge_learner_context(string $runid, int $learnercontextrevision): array {
        return $this->request(
            'POST',
            '/api/runs/' . urlencode($runid) . '/core-context/learner-context/acknowledgment',
            ['learner_context_revision' => $learnercontextrevision]
        );
    }

    /** Selects/deselects Quiz and Assignment explicitly for one sealed section. */
    public function set_activity_intents(string $runid, string $sectionref, bool $quiz, bool $assignment, array $quizoptions = [], array $assignmentoptions = [], array $semantic = []): array {
        $payload = [
            'quiz' => $quiz,
            'assignment' => $assignment,
            'quiz_options' => $quizoptions,
            'assignment_options' => $assignmentoptions,
        ];
        foreach ($semantic as $key => $value) {
            if ($value !== null && $value !== '') {
                $payload[$key] = $value;
            }
        }
        return $this->request('PUT', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activity-intents', $payload);
    }

    /** Reads explicit Activity Intents for one section. */
    public function get_activity_intents(string $runid, string $sectionref): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activity-intents');
    }

    /** Reads immutable Activity content revision history. */
    public function get_activity_revisions(string $runid, string $sectionref, string $activityref): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activities/' . urlencode($activityref) . '/revisions');
    }

    /** Saves one deterministically revalidated Teacher Activity edit. */
    public function save_activity_edit(string $runid, string $sectionref, string $activityref, array $activity, ?int $expectedrevision, int $moodleuserid): array {
        $payload = [
            'activity' => $activity,
            'edited_by_moodle_user_id' => $moodleuserid,
        ];
        if ($expectedrevision !== null) {
            $payload['expected_activity_revision'] = $expectedrevision;
        }
        return $this->request('PUT', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activities/' . urlencode($activityref) . '/edit', $payload);
    }

    /** Generates one explicitly selected Activity. */
    public function generate_activity(string $runid, string $sectionref, string $activityref, ?string $instruction = null): array {
        $payload = $instruction !== null && trim($instruction) !== '' ? ['generation_instruction' => trim($instruction)] : new \stdClass();
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activities/' . urlencode($activityref) . '/generate', $payload);
    }

    /** Confirms an Empty Activity Shell after insufficient evidence. */
    public function confirm_activity_shell(string $runid, string $sectionref, string $activityref): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activities/' . urlencode($activityref) . '/confirm-shell', new \stdClass());
    }

    /** Creates a new immutable Course Structure revision from teacher edits. */
    public function save_structure_revision(string $runid, array $structure): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/course-structure/revisions', [
            'edited_structure' => $structure,
        ]);
    }

    /** Records explicit Teacher review for one current Week without approving a CLO. */
    public function mark_week_reviewed(string $runid, string $sectionref, int $revision, int $moodleuserid): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/course-structure/weeks/' . urlencode($sectionref) . '/review', [
            'revision' => $revision,
            'moodle_user_id' => $moodleuserid,
        ]);
    }

    /** Seals an exact Course Structure revision; this is not official Plan approval. */
    public function seal_structure(string $runid, int $revision, int $moodleuserid): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/course-structure/seal', [
            'revision' => $revision,
            'moodle_user_id' => $moodleuserid,
        ]);
    }

    /**
     * Sends sealed Moodle files to AI Platform for extraction and immutable snapshot persistence.
     *
     * @param string $runid
     * @param string $sectionref
     * @param int $structurerevision
     * @param array $uploads stored_file descriptors from helper::export_snapshot_files().
     * @return array
     */
    public function create_material_snapshot(string $runid, string $sectionref, int $structurerevision, array $uploads): array {
        $payload = [
            '_is_multipart' => true,
            'structure_revision' => (string)$structurerevision,
            'moodle_user_id' => (string)$GLOBALS['USER']->id,
        ];
        $metadata = [];
        foreach ($uploads as $index => $upload) {
            // Moodle's curl wrapper streams stored_file instances directly.
            // Use distinct scalar fields; Fastify reads all multipart parts.
            $payload['material_file_' . $index] = $upload['file'];
            $metadata[] = [
                'moodle_material_id' => $upload['moodle_material_id'],
                'use_for_grounding' => !empty($upload['use_for_grounding']),
                'publish_to_course' => !empty($upload['publish_to_course']),
            ];
        }
        $payload['material_metadata'] = json_encode($metadata);
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/material-snapshots', $payload);
    }

    /** Reads authoritative status for one Activity Intent. */
    public function get_activity_status(string $runid, string $sectionref, string $activityref): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activities/' . urlencode($activityref) . '/status');
    }

    /** Reads the latest authoritative MaterialSnapshot for one sealed section. */
    public function get_latest_material_snapshot(string $runid, string $sectionref): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/material-snapshots/latest');
    }

    /** Generates activities independently for one sealed section. */
    public function generate_section_activities(string $runid, string $sectionref, ?string $generationinstruction = null): array {
        $payload = $generationinstruction !== null && trim($generationinstruction) !== ''
            ? ['generation_instruction' => trim($generationinstruction)]
            : new \stdClass();
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/generate', $payload);
    }

    /** Reads one section's deterministic generation state. */
    public function get_section_generation_status(string $runid, string $sectionref): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/generation-status');
    }

    /** Persists whether the current MaterialSnapshot should be published as a File Resource. */
    public function set_resource_publication(string $runid, string $sectionref, bool $publish): array {
        return $this->request('PUT', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/resource-publication', ['publish' => $publish]);
    }

    /** Assembles the frozen CoursePlan after all sections pass the completion gate. */
    public function finalize_course_plan(string $runid): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/plans/course/finalize', new \stdClass());
    }

    /** Fetches internal planning progress without changing run lifecycle. */
    public function get_progress(string $runid): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/progress');
    }

    /**
     * Fetches run status and details.
     *
     * @param string $runid
     * @return array
     */
    public function get_run(string $runid): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid));
    }

    /**
     * Fetches a plan by plan_id and optional revision.
     *
     * @param string $planid
     * @param int|null $revision
     * @return array
     */
    public function get_plan(string $planid, ?int $revision = null): array {
        $query = $revision !== null ? ['revision' => $revision] : null;
        return $this->request('GET', '/api/plans/' . urlencode($planid), $query);
    }

    /**
     * Fetches plan preview.
     *
     * @param string $planid
     * @param int|null $revision
     * @return array
     */
    public function get_preview(string $planid, ?int $revision = null): array {
        $query = $revision !== null ? ['revision' => $revision] : null;
        return $this->request('GET', '/api/plans/' . urlencode($planid) . '/preview', $query);
    }

    /**
     * Creates a new immutable revision from teacher direct edits.
     *
     * @param string $planid
     * @param array $editedenvelope Complete edited plan envelope.
     * @param string|null $summary Summary of the changes.
     * @return array New plan record and preview.
     */
    public function create_revision(string $planid, array $editedenvelope, ?string $summary = null): array {
        $payload = [
            'edited_envelope' => $editedenvelope,
        ];
        if ($summary !== null) {
            $payload['summary'] = $summary;
        }
        return $this->request('POST', '/api/plans/' . urlencode($planid) . '/revisions', $payload);
    }

    /**
     * Approves an exact plan revision.
     *
     * @param string $runid
     * @param string $planid
     * @param int $revision
     * @param string $moodleuserid The authenticated Moodle user ID.
     * @return array Approval confirmation.
     */
    public function approve_plan(string $runid, string $planid, int $revision, string $moodleuserid, bool $ackaireview = false): array {
        $payload = [
            'plan_id' => $planid,
            'revision' => $revision,
            'moodle_user_id' => $moodleuserid,
            'acknowledge_ai_expanded_content' => $ackaireview,
        ];
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/approve', $payload);
    }

    /**
     * Validates execution target compatibility against plan revision.
     *
     * @param string $planid
     * @param int $revision
     * @param array $target Execution target, e.g. ['category_id' => 1]
     * @return array Validation result.
     */
    public function validate_execution(string $planid, int $revision, array $target): array {
        $payload = [
            'plan_id' => $planid,
            'revision' => $revision,
            'target' => $target,
        ];
        return $this->request('POST', '/api/executions/validate', $payload);
    }

    /**
     * Executes the approved plan in Moodle via AI Platform / MCP.
     *
     * @param string $runid
     * @param string $planid
     * @param int $revision
     * @param array $target Execution target.
     * @return array Execution results including course_id and course_url.
     */
    public function execute_run(string $runid, string $planid, int $revision, array $target): array {
        $payload = [
            'plan_id' => $planid,
            'revision' => $revision,
            'target' => $target,
        ];
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/execute', $payload);
    }

    /**
     * Triggers verification for a run.
     *
     * @param string $runid
     * @param string $planid
     * @param int $revision
     * @return array
     */
    public function verify_run(string $runid, string $planid, int $revision): array {
        $payload = [
            'plan_id' => $planid,
            'revision' => $revision,
        ];
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/verify', $payload);
    }

    /**
     * Retrieves verification result for a run.
     *
     * @param string $runid
     * @param string $planid
     * @param int $revision
     * @return array
     */
    public function get_verification(string $runid, string $planid, int $revision): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/verification', [
            'plan_id' => $planid,
            'revision' => $revision,
        ]);
    }

    /** Header for the protected Instructional Design approval/readback surface. */
    protected function instructional_design_headers(): array {
        $key = trim((string)get_config('local_agentpoc', 'instructionaldesignservicekey'));
        if ($key === '') {
            throw new \moodle_exception('erroraiplatform', 'local_agentpoc', '', 'Instructional Design service credential is not configured.');
        }
        return ['X-AgentPOC-Instructional-Design-Key: ' . $key];
    }

    /** Reads planning-only mapping/evidence decisions; never learner proficiency. */
    public function get_competency_mappings(string $runid): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/competency-mappings', null, $this->instructional_design_headers());
    }

    /** Actor identity is provided by the authenticated Moodle BFF. */
    public function decide_competency_mapping(string $runid, array $payload): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/competency-mappings/decision', $payload, $this->instructional_design_headers());
    }

    /** Fetches the persisted Core Context, structure alignment, and Outcome review state. */
    public function get_instructional_design(string $runid): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/instructional-design', null, $this->instructional_design_headers());
    }

    /** Fetches server-authoritative LO/CLO review workflow state. */
    public function get_outcome_reviews(string $runid): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/outcome-reviews', null, $this->instructional_design_headers());
    }

    /** Saves one explicit LO/CLO review decision without changing semantic Core Context authority. */
    public function save_outcome_review(string $runid, array $payload): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/outcome-reviews', $payload, $this->instructional_design_headers());
    }

    /** Persists a Teacher approval/edit of one source Outcome. */
    public function approve_learning_outcome(string $runid, array $payload): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/outcomes/approve', $payload, $this->instructional_design_headers());
    }

    /** Safely edits an already-approved CLO by withdrawing obsolete authority first. */
    public function edit_approved_learning_outcome(string $runid, array $payload): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/outcomes/edit-approved', $payload, $this->instructional_design_headers());
    }

    /** Reads persisted Competency Candidate lifecycle state. */
    public function get_competency_candidates(string $runid): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/competency-candidates', null, $this->instructional_design_headers());
    }

    /** Derives proposal-only Competency Candidates from approved Outcomes. */
    public function derive_competency_candidates(string $runid): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/competency-candidates/derive', new \stdClass(), $this->instructional_design_headers());
    }

    /** Persists a Teacher decision/edit for one Competency Candidate. */
    public function decide_competency_candidate(string $runid, string $candidateid, array $payload): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/competency-candidates/' . urlencode($candidateid) . '/decision', $payload, $this->instructional_design_headers());
    }
    /** Persists explicit external coverage for one approved Outcome. */
    public function set_coverage_override(string $runid, array $payload): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/course-structure/coverage-overrides', $payload, $this->instructional_design_headers());
    }

    /** Rebases structure alignment forward to current approved Outcome lineage. */
    public function rebase_structure_alignment(string $runid): array {
        return $this->request('POST', '/api/runs/' . urlencode($runid) . '/course-structure/rebase-alignment', [], $this->instructional_design_headers());
    }
}
