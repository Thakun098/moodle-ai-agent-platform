import type {
  AssignmentPlan,
  CoursePlanContent,
  QuestionPlan,
  QuizUpdateContent,
  SourceReference,
} from "@moodle-agent-poc/contracts";
import type { ActivityType } from "./instructions/planning-constraints.js";

export interface ActivityIntent {
  ref?: string;
  type: ActivityType;
  title: string;
  source_refs: SourceReference[];
  origin: "syllabus" | "teacher_instruction";
  options?: Record<string, unknown>;
}

export interface SectionStructureDraft {
  ref: string;
  position: number;
  title: string;
  summary: string;
  source_refs: SourceReference[];
  activityIntents: ActivityIntent[];
  grounding?: import("./grounding/section-grounding.js").SectionGrounding;
  aligned_objective_ids?: string[];
  aligned_outcome_ids?: string[];
  alignment_status?: "CURRENT" | "STALE_ALIGNMENT";
}

export interface CourseStructureDraft {
  title: string;
  summary: string;
  warnings: string[];
  assumptions: string[];
  content: {
    course: CoursePlanContent["course"];
    sections: SectionStructureDraft[];
  };
}

export interface CoursePlanningModelOutput {
  title: string;
  summary: string;
  warnings?: string[];
  assumptions?: string[];
  content: CoursePlanContent;
}

export interface ExistingAssignmentState {
  ref: string;
  title: string;
  description: string;
  instructions: readonly string[];
  learning_objectives: readonly string[];
  grade: number;
  source_refs?: readonly SourceReference[];
}

export interface AssignmentPlanningInput {
  current: ExistingAssignmentState;
  instruction: string;
  source_context?: readonly SourceReference[];
}

export interface AssignmentUpdateModelOutput {
  title: string;
  summary: string;
  warnings?: string[];
  assumptions?: string[];
  content: AssignmentPlan;
}

/** Moodle-observed existing question state. This intentionally does not pretend
 * to be a full QuestionPlan because the read API cannot reconstruct every
 * authoring option (for example essay grading guidance) losslessly. */
export interface ExistingQuizQuestionState {
  ref: string;
  slot_number: number;
  question_bank_entry_id: number;
  version: number;
  name: string;
  type: "multichoice" | "truefalse" | "shortanswer" | "essay";
  question: string;
  default_mark: number;
  answers: readonly {
    text: string;
    fraction: number;
    feedback: string;
  }[];
  source_refs?: readonly SourceReference[];
}

export interface ExistingQuizState {
  ref: string;
  title: string;
  description: string;
  source_refs?: readonly SourceReference[];
  questions: readonly ExistingQuizQuestionState[];
}

export interface QuizPlanningInput {
  current: ExistingQuizState;
  instruction: string;
  source_context?: readonly SourceReference[];
}

export interface QuizUpdateModelOutput {
  title: string;
  summary: string;
  warnings?: string[];
  assumptions?: string[];
  content: QuizUpdateContent;
}
