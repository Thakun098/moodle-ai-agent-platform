import { randomUUID } from "node:crypto";
import type {
  CompetencyExecutionSnapshot,
  ExecutionMappingRepository,
  McpClientManager,
  RunRepository,
  VerificationRepository,
} from "@moodle-agent-poc/agent-runtime";
import type {
  CoursePlanEnvelope,
  QuestionPlan,
  VerificationIssue,
  VerificationResult,
} from "@moodle-agent-poc/contracts";
import { compareQuestionReadback } from "@moodle-agent-poc/contracts";

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
  courseFormat?: string | undefined;
  categoryId?: number | undefined;
  competencySnapshot?: CompetencyExecutionSnapshot | undefined;
  competencyFrameworkId?: number | undefined;
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
    plan: QuestionPlan;
  }>;
}

interface ExpectedSection {
  ref: string;
  sectionId: number;
  position: number;
  name: string;
  activities: ExpectedActivity[];
  resources: Array<{ ref: string; activityId: number; name: string; filename: string }>;
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
    const resources: Array<{ ref: string; activityId: number; name: string; filename: string }> = [];
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
            plan: q,
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
    for (const resource of section.resources ?? []) {
      const rm = byRef.get(resource.ref);
      if (!rm) throw new Error(`Missing execution mapping for resource ${resource.ref}`);
      resources.push({ ref: resource.ref, activityId: rm.moodleId, name: resource.title, filename: resource.filename });
    }
    sections.push({ ref: section.ref, sectionId: sm.moodleId, position: section.position, name: section.title, activities, resources });
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

async function finishVerificationAuthority(
  runRepo: RunRepository,
  input: { runId: string; planId: string; revision: number; passed: boolean; finalResult?: Record<string, unknown>; error?: string },
): Promise<void> {
  const extended = runRepo as RunRepository & { finishApprovedVerification?: (value: typeof input) => Promise<unknown> };
  if (typeof extended.finishApprovedVerification === "function") {
    await extended.finishApprovedVerification(input);
    return;
  }
  if (input.passed) await runRepo.completeRun(input.runId, input.finalResult);
  else await runRepo.failRun(input.runId, input.error ?? "Verification failed.");
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
    await finishVerificationAuthority(repositories.runRepo, { runId, planId: plan.plan_id, revision: plan.revision, passed: false, error: message });
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
    await finishVerificationAuthority(repositories.runRepo, { runId, planId: plan.plan_id, revision: plan.revision, passed: false, error: message });
    return result;
  }

  if (actualCourse?.course?.id !== expected.courseId) issues.push(issue("mismatch", "/course/id", "Course ID mismatch", expected.courseId, actualCourse?.course?.id));
  if (actualCourse?.course?.fullname !== expected.title) issues.push(issue("mismatch", "/course/fullname", "Course title mismatch", expected.title, actualCourse?.course?.fullname));
  if (actualCourse?.course?.visible !== 0) issues.push(issue("mismatch", "/course/visible", "Created course must remain hidden", 0, actualCourse?.course?.visible));
  if (!Number.isSafeInteger(config.categoryId) || Number(config.categoryId) <= 0) {
    issues.push(issue("missing", "/execution/category_id", "Persisted execution category is required for verification"));
  } else if (actualCourse?.course?.category_id !== config.categoryId) {
    issues.push(issue("mismatch", "/course/category_id", "Course category mismatch", config.categoryId, actualCourse?.course?.category_id));
  }
  if (config.courseFormat && actualCourse?.course?.format !== config.courseFormat) {
    issues.push(issue("mismatch", "/course/format", "Course format mismatch", config.courseFormat, actualCourse?.course?.format));
  }

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
            for (const field of compareQuestionReadback(aq, eq.plan)) {
              issues.push(issue("mismatch", `/sections/${es.ref}/activities/${ea.ref}/questions/${eq.ref}/${field}`, `Question ${field} does not match approved plan`));
            }
          }
        } catch (err) {
          issues.push(issue("read_error", `/sections/${es.ref}/activities/${ea.ref}/questions`, err instanceof Error ? err.message : String(err)));
        }
      }
    }
    for (const er of es.resources) {
      const ar = actualActivities.find((activity: any) => activity.activity_id === er.activityId);
      if (!ar) { issues.push(issue("missing", `/sections/${es.ref}/resources/${er.ref}`, "Expected File Resource missing", er.activityId)); continue; }
      if (ar.module_name !== "resource") issues.push(issue("mismatch", `/sections/${es.ref}/resources/${er.ref}/module_name`, "Resource module type mismatch", "resource", ar.module_name));
      if (ar.name !== er.name) issues.push(issue("mismatch", `/sections/${es.ref}/resources/${er.ref}/name`, "File Resource title mismatch", er.name, ar.name));
      const readBackFiles = Array.isArray(ar.files) ? ar.files : [];
      if (!readBackFiles.includes(er.filename)) issues.push(issue("mismatch", `/sections/${es.ref}/resources/${er.ref}/filename`, "File Resource filename mismatch", er.filename, readBackFiles));
    }
  }

  if (config.competencySnapshot && config.competencySnapshot.competencies.length > 0) {
    if (!Number.isSafeInteger(config.competencyFrameworkId) || Number(config.competencyFrameworkId) <= 0) {
      issues.push(issue("missing", "/competencies/framework", "Configured Competency Framework is required for native Competency verification"));
    } else {
      try {
        const readback = await callRead(manager, "moodle_get_course_competencies", { course_id: expected.courseId }) as any;
        const expectedCompetencies = [];
        for (const competency of config.competencySnapshot.competencies) {
          const nativeId = await repositories.mappingRepo.findMoodleIdByLocalRef(runId, plan.plan_id, plan.revision, `competency:${competency.candidateId}`);
          if (!nativeId) { issues.push(issue("missing", `/competencies/${competency.candidateId}/mapping`, "Native Competency execution mapping is missing")); continue; }
          expectedCompetencies.push({ competency_id: nativeId, framework_id: config.competencyFrameworkId, idnumber: competency.idnumber, shortname: competency.name });
        }
        const actualCompetencies = (Array.isArray(readback?.course_competencies) ? readback.course_competencies : []).filter((item: any) => Number(item.framework_id) === config.competencyFrameworkId).map((item: any) => ({ competency_id: Number(item.competency_id), framework_id: Number(item.framework_id), idnumber: String(item.idnumber), shortname: String(item.shortname) })).sort((a: any,b: any)=>a.competency_id-b.competency_id);
        expectedCompetencies.sort((a,b)=>a.competency_id-b.competency_id);
        if (JSON.stringify(actualCompetencies) !== JSON.stringify(expectedCompetencies)) issues.push(issue("mismatch", "/competencies/course", "Moodle Course Competencies do not exactly match the approved execution snapshot", expectedCompetencies, actualCompetencies));

        const expectedLinks = [];
        for (const mapping of config.competencySnapshot.mappings) {
          const activityId = await repositories.mappingRepo.findMoodleIdByLocalRef(runId, plan.plan_id, plan.revision, mapping.activityRef);
          const competencyId = await repositories.mappingRepo.findMoodleIdByLocalRef(runId, plan.plan_id, plan.revision, `competency:${mapping.competencyId}`);
          if (!activityId || !competencyId) { issues.push(issue("missing", `/competencies/activity-links/${mapping.activityRef}`, "Native Activity or Competency identity is missing")); continue; }
          expectedLinks.push({ activity_id: activityId, competency_id: competencyId, rule_outcome: mapping.evidence === "CONFIRMED" ? 1 : 0 });
        }
        const expectedCompetencyIds = new Set(expectedCompetencies.map((item) => item.competency_id));
        const actualLinks = (Array.isArray(readback?.activity_links) ? readback.activity_links : []).filter((item: any) => expectedCompetencyIds.has(Number(item.competency_id))).map((item: any) => ({ activity_id: Number(item.activity_id), competency_id: Number(item.competency_id), rule_outcome: Number(item.rule_outcome) })).sort((a: any,b: any)=>a.activity_id-b.activity_id || a.competency_id-b.competency_id);
        expectedLinks.sort((a,b)=>a.activity_id-b.activity_id || a.competency_id-b.competency_id);
        if (JSON.stringify(actualLinks) !== JSON.stringify(expectedLinks)) issues.push(issue("mismatch", "/competencies/activity-links", "Moodle Activity Competency links/evidence behavior do not exactly match the approved execution snapshot", expectedLinks, actualLinks));
      } catch (err) {
        issues.push(issue("read_error", "/competencies", err instanceof Error ? err.message : String(err)));
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
  await finishVerificationAuthority(repositories.runRepo, {
    runId, planId: plan.plan_id, revision: plan.revision, passed,
    ...(passed ? { finalResult: result as unknown as Record<string, unknown> } : { error: `Verification failed with ${issues.length} issue(s)` }),
  });
  return result;
}
