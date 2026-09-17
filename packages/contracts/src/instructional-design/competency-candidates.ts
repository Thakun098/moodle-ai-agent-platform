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
  revision: number;
  edited_from_candidate_id?: string;
  teacher_override?: CompetencyCandidateTeacherOverride;
}

export type CompetencyCandidateDecisionAction = "approve" | "reject" | "defer" | "edit";

export interface CompetencyCandidateDecision {
  action: CompetencyCandidateDecisionAction;
  name?: string;
  description?: string;
  rationale?: string;
  derived_from_outcome_ids?: string[];
  teacher_override?: CompetencyCandidateTeacherOverride;
  teacher_id?: number;
}