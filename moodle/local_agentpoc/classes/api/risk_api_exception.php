<?php
// This file is part of Moodle - http://moodle.org/.

/**
 * Structured Risk API transport exception.
 *
 * Preserves AI Platform HTTP/status code information for the Moodle BFF so a
 * missing historical snapshot is not misreported as a platform outage.
 *
 * @package    local_agentpoc
 * @copyright  2026 Moodle Agent POC Team
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace local_agentpoc\api;

defined('MOODLE_INTERNAL') || die();

final class risk_api_exception extends \Exception {
    public function __construct(
        private readonly int $httpcode,
        private readonly string $apicode,
        string $message
    ) {
        parent::__construct($message);
    }

    public function get_http_code(): int {
        return $this->httpcode;
    }

    public function get_api_code(): string {
        return $this->apicode;
    }
}
