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

    /** @var string Base URL for AI platform API */
    protected string $baseurl;

    /** @var int Request timeout in seconds */
    protected int $timeout;

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
    protected function request(string $method, string $endpoint, $data = null, array $headers = []): array {
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
                $curl->setHeader(['Content-Type: application/json']);
                $response = $curl->post($url, $json, $options);
            }
        } else if (strtoupper($method) === 'PUT') {
            $json = json_encode($data);
            $curl->setHeader(['Content-Type: application/json']);
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
            if (is_array($decoded) && isset($decoded['error']['message'])) {
                $errormsg = $decoded['error']['message'];
            } else if (is_string($response) && $response !== '') {
                $errormsg .= ': ' . substr($response, 0, 200);
            }
            throw new \moodle_exception('erroraiplatform', 'local_agentpoc', '', $errormsg);
        }

        if (!is_array($decoded)) {
            throw new \moodle_exception('erroraiplatform', 'local_agentpoc', '', 'Invalid JSON response from AI platform.');
        }

        return $decoded;
    }

    /**
     * Uploads syllabus and creates a new run.
     *
     * @param string $filepath Path to syllabus file on disk.
     * @param string $filename Original filename.
     * @param string $mimetype File MIME type.
     * @return array Run metadata including run_id and ingestion summary.
     */
    public function create_run(string $filepath, string $filename, string $mimetype): array {
        $cfile = curl_file_create($filepath, $mimetype, $filename);
        $data = [
            '_is_multipart' => true,
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

    /** Selects/deselects Quiz and Assignment explicitly for one sealed section. */
    public function set_activity_intents(string $runid, string $sectionref, bool $quiz, bool $assignment, array $quizoptions = [], array $assignmentoptions = []): array {
        return $this->request('PUT', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activity-intents', [
            'quiz' => $quiz,
            'assignment' => $assignment,
            'quiz_options' => $quizoptions,
            'assignment_options' => $assignmentoptions,
        ]);
    }

    /** Reads explicit Activity Intents for one section. */
    public function get_activity_intents(string $runid, string $sectionref): array {
        return $this->request('GET', '/api/runs/' . urlencode($runid) . '/sections/' . urlencode($sectionref) . '/activity-intents');
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
}
