import { randomUUID } from "node:crypto";
import type {
  ExecutionMappingRepository,
  McpClientManager,
  RunRepository,
  VerificationRepository,
} from "@moodle-agent-poc/agent-runtime";
import type {
  CoursePlanEnvelope,
  VerificationIssue,
  VerificationResult,
} from "@moodle-agent-poc/contracts";

export interface CourseVerificationRepositories {
  mappingRepo: ExecutionMappingRepository;
  verificationRepo: VerificationRepository;
  runRepo: RunRepository;
}

export interface VerifyCourseConfig {
  runId: string;
  planEnvelope: CoursePlanEnvelope;
  mcpClientManager: McpClientManager;
  repositories: CourseVerificationRepositories;
}

interface ExpectedActivity {
  ref: string;
  type: "assignment" | "quiz";
  activityId: number;
  name: string;
  intro: string;
  grade?: number;
  questions?: Array<{
    ref: string;
    questionBankEntryId: number;
    type: string;
    questionText: string;
    defaultMark: number;
  }>;
}

interface ExpectedSection {
  ref: string;
  sectionId: number;
  position: number;
  name: string;
  activities: ExpectedActivity[];
}

export interface ExpectedCourseProjection {
  courseId: number;
  title: string;
  sections: ExpectedSection[];
}

function formatAssignmentIntro(activity: any): string {
  const instructions = activity.instructions.map((x: string, i: number) => `${i + 1}. ${x}`).join("\n");
  const objectives = activity.learning_objectives.map((x: string) => `- ${x}`).join("\n");
  return `${activity.description}\n\nInstructions:\n${instructions}\n\nLearning Objectives:\n${objectives}`;
}

export async function buildExpectedCourseProjection(
  runId: string,
  plan: CoursePlanEnvelope,
  mappingRepo: ExecutionMappingRepository
): Promise<ExpectedCourseProjection> {
  const mappings = await mappingRepo.listRunMappings(runId, plan.plan_id, plan.revision);
  const byRef = new Map(mappings.map((m) => [m.localRef, m]));
  const courseMapping = byRef.get("course");
  if (!courseMapping) throw new Error("Missing execution mapping for course");

  const sections: ExpectedSection[] = [];
  for (const section of [...plan.content.sections].sort((a, b) => a.position - b.position)) {
    const sm = byRef.get(section.ref);
    if (!sm) throw new Error(`Missing execution mapping for section ${section.ref}`);
    const activities: ExpectedActivity[] = [];
    for (const activity of section.activities) {
      const am = byRef.get(activity.ref);
      if (!am) throw new Error(`Missing execution mapping for activity ${activity.ref}`);
      if (activity.type === "assignment") {
        activities.push({
          ref: activity.ref,
          type: "assignment",
          activityId: am.moodleId,
          name: activity.title,
          intro: formatAssignmentIntro(activity),
          grade: activity.grade,
        });
      } else {
        const questions = [];
        for (const q of activity.questions) {
          const qm = byRef.get(q.ref);
          if (!qm) throw new Error(`Missing execution mapping for question ${q.ref}`);
          questions.push({
            ref: q.ref,
            questionBankEntryId: qm.moodleId,
            type: q.type,
            questionText: q.question,
            defaultMark: q.default_mark,
          });
        }
        activities.push({
          ref: activity.ref,
          type: "quiz",
          activityId: am.moodleId,
          name: activity.title,
          intro: activity.description,
          questions,
        });
      }
    }
    sections.push({ ref: section.ref, sectionId: sm.moodleId, position: section.position, name: section.title, activities });
  }
  return { courseId: courseMapping.moodleId, title: plan.content.course.title, sections };
}

async function callRead(manager: McpClientManager, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await manager.callTool(name, args);
  if (result.status === "error") throw new Error(`${name} failed: ${result.code}: ${result.message}`);
  return result.data;
}

function issue(kind: VerificationIssue["kind"], path: string, message: string, expected?: unknown, actual?: unknown): VerificationIssue {
  return { kind, path, message, ...(expected !== undefined ? { expected } : {}), ...(actual !== undefined ? { actual } : {}) };
}

export async function verifyCoursePlan(config: VerifyCourseConfig): Promise<VerificationResult> {
  const { runId, planEnvelope: plan, mcpClientManager: manager, repositories } = config;
  await manager.discoverTools();
  let expected: ExpectedCourseProjection;
  const issues: VerificationIssue[] = [];
  try {
    expected = await buildExpectedCourseProjection(runId, plan, repositories.mappingRepo);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const result: VerificationResult = { plan_id: plan.plan_id, revision: plan.revision, passed: false, issues: [issue("missing", "/mappings", message)] };
    await repositories.verificationRepo.recordVerification({ id: randomUUID(), runId, planId: plan.plan_id, revision: plan.revision, passed: false, issues: result.issues });
    await repositories.runRepo.failRun(runId, message);
    return result;
  }

  let actualCourse: any;
  try {
    actualCourse = await callRead(manager, "moodle_get_course_structure", { course_id: expected.courseId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    issues.push(issue("read_error", "/course", message));
    const result: VerificationResult = { plan_id: plan.plan_id, revision: plan.revision, passed: false, issues: issues as [VerificationIssue, ...VerificationIssue[]] };
    await repositories.verificationRepo.recordVerification({ id: randomUUID(), runId, planId: plan.plan_id, revision: plan.revision, passed: false, issues, expectedStructure: expected as unknown as Record<string, unknown> });
    await repositories.runRepo.failRun(runId, message);
    return result;
  }

  if (actualCourse?.course?.id !== expected.courseId) issues.push(issue("mismatch", "/course/id", "Course ID mismatch", expected.courseId, actualCourse?.course?.id));
  if (actualCourse?.course?.fullname !== expected.title) issues.push(issue("mismatch", "/course/fullname", "Course title mismatch", expected.title, actualCourse?.course?.fullname));

  const actualSections = Array.isArray(actualCourse?.sections) ? actualCourse.sections : [];
  for (const es of expected.sections) {
    const as = actualSections.find((s: any) => s.section_id === es.sectionId);
    if (!as) { issues.push(issue("missing", `/sections/${es.ref}`, "Expected section missing", es.sectionId)); continue; }
    if (as.section_num !== es.position) issues.push(issue("mismatch", `/sections/${es.ref}/position`, "Section position mismatch", es.position, as.section_num));
    if (as.name !== es.name) issues.push(issue("mismatch", `/sections/${es.ref}/name`, "Section name mismatch", es.name, as.name));
    const actualActivities = Array.isArray(as.activities) ? as.activities : [];
    for (const ea of es.activities) {
      const aa = actualActivities.find((a: any) => a.activity_id === ea.activityId);
      if (!aa) { issues.push(issue("missing", `/sections/${es.ref}/activities/${ea.ref}`, "Expected activity missing", ea.activityId)); continue; }
      const expectedModule = ea.type === "assignment" ? "assign" : "quiz";
      if (aa.module_name !== expectedModule) issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/module_name`, "Activity type mismatch", expectedModule, aa.module_name));
      if (aa.name !== ea.name) issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/name`, "Activity name mismatch", ea.name, aa.name));
      if (aa.intro !== ea.intro) issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/intro`, "Activity intro mismatch", ea.intro, aa.intro));
      if (ea.type === "assignment" && aa.grade !== ea.grade) issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/grade`, "Assignment grade mismatch", ea.grade, aa.grade));

      if (ea.type === "quiz") {
        try {
          const slots = await callRead(manager, "moodle_get_quiz_questions", { activity_id: ea.activityId }) as any[];
          const expectedQuestions = ea.questions ?? [];
          if (slots.length !== expectedQuestions.length) issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/questions/count`, "Quiz question count mismatch", expectedQuestions.length, slots.length));
          for (const eq of expectedQuestions) {
            const aq = slots.find((q: any) => q.question_bank_entry_id === eq.questionBankEntryId);
            if (!aq) { issues.push(issue("missing", `/sections/${es.ref}/activities/${ea.ref}/questions/${eq.ref}`, "Expected quiz question missing", eq.questionBankEntryId)); continue; }
            if (aq.qtype !== eq.type) issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/questions/${eq.ref}/type`, "Question type mismatch", eq.type, aq.qtype));
            if (aq.question_text !== eq.questionText) issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/questions/${eq.ref}/question_text`, "Question text mismatch", eq.questionText, aq.question_text));
            if (aq.default_mark !== eq.defaultMark) issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/questions/${eq.ref}/default_mark`, "Question default mark mismatch", eq.defaultMark, aq.default_mark));
          }
        } catch (err) {
          issues.push(issue("read_error", `/sections/${es.ref}/activities/${ea.ref}/questions`, err instanceof Error ? err.message : String(err)));
        }
      }
    }
  }

  const passed = issues.length === 0;
  const result: VerificationResult = passed
    ? { plan_id: plan.plan_id, revision: plan.revision, passed: true, issues: [] }
    : { plan_id: plan.plan_id, revision: plan.revision, passed: false, issues: issues as [VerificationIssue, ...VerificationIssue[]] };

  await repositories.verificationRepo.recordVerification({
    id: randomUUID(), runId, planId: plan.plan_id, revision: plan.revision, passed, issues,
    expectedStructure: expected as unknown as Record<string, unknown>,
    observedMoodleStructure: actualCourse as Record<string, unknown>,
  });
  if (passed) await repositories.runRepo.completeRun(runId, result as unknown as Record<string, unknown>);
  else await repositories.runRepo.failRun(runId, `Verification failed with ${issues.length} issue(s)`);
  return result;
}
