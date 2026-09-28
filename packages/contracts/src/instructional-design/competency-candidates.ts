import type { SourceReference } from "../planning/contracts.js";

export type CompetencyCandidateStatus = "PROPOSED" | "APPROVED" | "REJECTED" | "DEFERRED" | "UNALIGNED";

export interface CompetencyCandidateTeacherOverride {
  acknowledged: true;
  reason: string;
  teacher_id?: number;
}

export interface CompetencyCandidate {
  candidate_id: string;
  name: string;
  description: string;
  derived_from_outcome_ids: string[];
  rationale: string;
  source_refs: SourceReference[];
  status: CompetencyCandidateStatus;
  /** Monotonic current-state/CAS revision; it is not an immutable body-history identifier. */
  revision: number;
  /** Stable AI-origin Candidate identity, not a pointer to a reconstructable prior definition. */
  edited_from_candidate_id?: string;
  teacher_override?: CompetencyCandidateTeacherOverride;
}

export type CompetencyCandidateDecisionAction = "approve" | "reject" | "defer" | "edit";

export interface CompetencyCandidateDecision {
  action: CompetencyCandidateDecisionAction;
  /** Candidate revision the Teacher reviewed. Stale decisions must conflict. */
  expected_revision: number;
  /** Core Context revision whose approved Outcomes authorized this decision. */
  expected_context_revision: number;
  name?: string;
  description?: string;
  rationale?: string;
  derived_from_outcome_ids?: string[];
  teacher_override?: CompetencyCandidateTeacherOverride;
  teacher_id?: number;
}
