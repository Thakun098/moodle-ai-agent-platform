export interface CompetencyExecutionDefinition {
  candidateId: string;
  competencyRevision: number;
  name: string;
  description: string;
  outcomeIds: string[];
  idnumber: string;
}

export interface CompetencyExecutionMapping {
  activityIntentId: string;
  activityRef: string;
  competencyId: string;
  intentRevision: number;
  activityRevision: number;
  competencyRevision: number;
  evidence: "CONFIRMED" | "DECLINED" | "UNDECIDED";
}

/** Immutable Teacher-authorized competency authority captured for one approved Course revision. */
export interface CompetencyExecutionSnapshot {
  /** Legacy snapshots omit this; new Course approvals always pin participation. */
  participation?: import("./competency-participation.js").CompetencyParticipation;
  runId: string;
  planId: string;
  revision: number;
  mappingReviewRevision: number;
  frameworkId: number | null;
  capturedAt: string;
  competencies: CompetencyExecutionDefinition[];
  mappings: CompetencyExecutionMapping[];
}
