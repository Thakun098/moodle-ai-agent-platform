import type {
  VerificationFailedResult,
  VerificationPassedResult,
  VerificationResult,
} from "../src/index.js";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2)
    ? true
    : false;
type Assert<T extends true> = T;

type _PassedIssuesEmpty = Assert<Equal<VerificationPassedResult["issues"], []>>;
type _FailedPassedLiteral = Assert<Equal<VerificationFailedResult["passed"], false>>;

const passed = {
  plan_id: "33333333-3333-4333-8333-333333333333",
  revision: 1,
  passed: true,
  issues: [],
} satisfies VerificationPassedResult;

const failed = {
  plan_id: "55555555-5555-4555-8555-555555555555",
  revision: 2,
  passed: false,
  issues: [
    {
      kind: "mismatch",
      path: "quiz.title",
      message: "Title mismatch",
      expected: "AI Fundamentals Quiz",
      actual: "AI Basics Quiz",
    },
  ],
} satisfies VerificationFailedResult;

function assertNarrowing(result: VerificationResult): void {
  if (result.passed) {
    const noIssues: [] = result.issues;
    void noIssues;
    return;
  }

  result.issues[0].kind;
  result.issues[0].message;
}

assertNarrowing(passed);
assertNarrowing(failed);
