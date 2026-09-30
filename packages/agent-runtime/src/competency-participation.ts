/** Deterministic Moodle readiness and explicit Course participation authority. */
export interface CompetencyParticipation {
  revision: number;
  status: "UNRESOLVED" | "ENABLED" | "SELECTION_REQUIRED" | "BYPASSED" | "CHECK_FAILED";
  reason: string;
  framework_id: number | null;
  framework_signature: string | null;
  message: string;
  checked_at: string | null;
}

export function unresolvedCompetencyParticipation(): CompetencyParticipation {
  return { revision: 0, status: "UNRESOLVED", reason: "PREFLIGHT_REQUIRED", framework_id: null, framework_signature: null, message: "Check Competency Framework readiness before deriving Competencies.", checked_at: null };
}
