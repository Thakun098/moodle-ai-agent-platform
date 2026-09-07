import type { NonEmptyArray } from "../planning/contracts.js";

export type VerificationIssueKind =
  | "mismatch"
  | "missing"
  | "unexpected"
  | "read_error";

export interface VerificationIssue {
  kind: VerificationIssueKind;
  path: string;
  message: string;
  expected?: unknown;
  actual?: unknown;
}

export interface VerificationPassedResult {
  plan_id: string;
  revision: number;
  passed: true;
  issues: [];
}

export interface VerificationFailedResult {
  plan_id: string;
  revision: number;
  passed: false;
  issues: NonEmptyArray<VerificationIssue>;
}

export type VerificationResult =
  | VerificationPassedResult
  | VerificationFailedResult;
