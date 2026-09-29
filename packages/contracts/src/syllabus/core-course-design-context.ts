import type { SyllabusScheduleItem } from "./contracts.js";

/** Location in the immutable normalized raw_text, never an invented PDF page. */
export interface DesignSourceRef {
  source: "syllabus";
  sha256: string;
  start_line: number;
  end_line: number;
  text: string;
}
export interface DesignFact {
  text: string;
  origin: "PROVIDED_BY_SYLLABUS" | "PROVIDED_BY_TEACHER";
  source_refs: DesignSourceRef[];
}
export type DesignStage = "DESIGN_STRUCTURE" | "ACTIVITY_GENERATION" | "DERIVE_COMPETENCIES";
export interface DesignMissingInformation {
  code: string;
  field: string;
  message: string;
  severity: "INFO" | "WARNING" | "REQUIRES_CONFIRMATION" | "BLOCKING";
  applies_to_stage: DesignStage[];
}
export type PrimaryOutputLanguageCode = "th" | "en";
export type PrimaryOutputLanguageBasis =
  | "SCHEDULE_OR_TOPICS"
  | "OBJECTIVES_OUTCOMES"
  | "COURSE_TITLE"
  | "DETERMINISTIC_DEFAULT";

export interface PrimaryOutputLanguageAuthority {
  code: PrimaryOutputLanguageCode;
  derived_from: PrimaryOutputLanguageBasis;
}

export interface CoreCourseDesignContext {
  schema_version: "0.1";
  policy_version: "instructional-design.v0.1";
  revision: number;
  run_id: string;
  source_syllabus: { normalized_syllabus_version: "0.1"; filename: string; sha256: string; text_sha256: string };
  primary_output_language: PrimaryOutputLanguageAuthority;
  course: Partial<Record<"title" | "code" | "description" | "duration" | "learning_hours" | "delivery_mode", DesignFact[]>>;
  learner_context: {
    revision: number;
    status: "PROVIDED_BY_SYLLABUS" | "PROVIDED_BY_TEACHER" | "UNSPECIFIED";
    target_learners: DesignFact[];
    education_level: DesignFact[];
    year_level: DesignFact[];
    prerequisites: DesignFact[];
    prior_knowledge: DesignFact[];
    teacher_acknowledged_unspecified: boolean;
  };
  learning_objectives: Array<{ objective_id: string; source_text: string; source_refs: DesignSourceRef[]; status: "SOURCE" }>;
  source_learning_outcomes: Array<{ source_outcome_id: string; source_text: string; source_refs: DesignSourceRef[]; measurable_status: "MEASURABLE" | "WEAK_OR_AMBIGUOUS" | "UNKNOWN"; review_required: boolean }>;
  approved_learning_outcomes: Array<{ outcome_id: string; text: string; source_outcome_ids: string[]; source_refs: DesignSourceRef[]; approval_origin: "SOURCE_AS_IS" | "TEACHER_APPROVED_AI_PROPOSAL" | "TEACHER_EDITED"; approved_by_teacher: true; revision: number }>;
  schedule_or_topics: readonly SyllabusScheduleItem[];
  assessment_requirements: DesignFact[];
  grading_policy: DesignFact[];
  constraints: DesignFact[];
  missing_information: DesignMissingInformation[];
  provenance: { extractor_version: "syllabus-semantics.v0.1" | "syllabus-semantics.v0.2"; location_basis: "NORMALIZED_RAW_TEXT_LINES" };
}

export type OutcomeApprovalOrigin =
  | "SOURCE_AS_IS"
  | "TEACHER_APPROVED_AI_PROPOSAL"
  | "TEACHER_EDITED";

export interface LearningOutcomeProposal {
  proposal_id: string;
  source_outcome_id: string;
  recommended_text: string;
  rationale: string;
  source_refs: DesignSourceRef[];
}

export type OutcomeCoverageState =
  | "COVERED_BY_SECTION"
  | "EXTERNAL_TEACHER_CONFIRMED"
  | "UNCOVERED"
  | "STALE_ALIGNMENT";

export interface OutcomeCoverage {
  outcome_id: string;
  source_outcome_ids: string[];
  state: OutcomeCoverageState;
  section_refs: string[];
  override_reason?: string;
}

