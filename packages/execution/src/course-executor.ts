import crypto from "node:crypto";
import {
  executeRuntimeToolCall,
  type SafeToolExecutionContext,
} from "@moodle-agent-poc/agent-runtime";
import type {
  AssignmentPlan,
  CoursePlanContent,
  QuizPlan,
  SectionPlan,
} from "@moodle-agent-poc/contracts";
import {
  formatAssignmentIntro,
  formatCourseUrl,
  generateCourseShortname,
  serializeQuestionToMcpArgs,
} from "./serializers.js";
import {
  CourseExecutionError,
  type CourseExecutionConfig,
  type CourseExecutionResult,
  type CreatedEntitiesCount,
  type ExecutionMappingItem,
} from "./types.js";

function validateAndSortSections(sections: SectionPlan[]): SectionPlan[] {
  if (!sections || sections.length === 0) {
    throw new CourseExecutionError("EMPTY_SECTIONS", "CoursePlan must contain at least one section.");
  }

  const seenPositions = new Set<number>();
  for (const section of sections) {
    if (!Number.isInteger(section.position) || section.position < 1) {
      throw new CourseExecutionError(
        "INVALID_SECTION_POSITION",
        `Section '${section.ref}' has invalid position '${section.position}'. Position must be a positive integer.`
      );
    }
    if (seenPositions.has(section.position)) {
      throw new CourseExecutionError(
        "DUPLICATE_SECTION_POSITION",
        `Duplicate section position '${section.position}' found in section '${section.ref}'.`
      );
    }
    seenPositions.add(section.position);
  }

  return [...sections].sort((a, b) => a.position - b.position);
}

export class CourseExecutor {
  constructor(private readonly config: CourseExecutionConfig) {}

  async execute(): Promise<CourseExecutionResult> {
    const { runId, planEnvelope, target, mcpClientManager, repositories, options = {} } = this.config;
    const planId = planEnvelope.plan_id;
    const revision = planEnvelope.revision;
    const moodleBaseUrl = options.moodleBaseUrl || "http://localhost:8000";

    if (planEnvelope.plan_type !== "course") {
      throw new CourseExecutionError("INCOMPATIBLE_PLAN_TYPE", `CourseExecutor only supports 'course' plans, received '${planEnvelope.plan_type}'.`);
    }
    if (planEnvelope.operation !== "create") {
      throw new CourseExecutionError("INCOMPATIBLE_OPERATION", `CourseExecutor only supports 'create' operation, received '${planEnvelope.operation}'.`);
    }
    if (!Number.isInteger(target.category_id) || target.category_id <= 0) {
      throw new CourseExecutionError("INVALID_CATEGORY_ID", `Target category_id must be a positive integer, received '${target.category_id}'.`);
    }

    const content = planEnvelope.content as CoursePlanContent;
    if (!content.course?.title) {
      throw new CourseExecutionError("INVALID_COURSE_PLAN", "CoursePlan content is missing course definition or title.");
    }

    const sortedSections = validateAndSortSections(content.sections);
    await mcpClientManager.discoverTools();

    if (repositories.runRepo) await repositories.runRepo.updateStatus(runId, "executing");

    const createdEntities: CreatedEntitiesCount = {
      courses: 0,
      sections: 0,
      assignments: 0,
      quizzes: 0,
      questions: 0,
      slots: 0,
    };

    const runTimeoutMs = options.runTimeoutMs ?? 300_000;
    const runDeadline = Date.now() + runTimeoutMs;
    let stepNumber = 1;
    const safeContext: SafeToolExecutionContext = {
      runId,
      planId,
      revision,
      stepNumber,
      mcpClientManager,
      repositories,
      options,
      runDeadline,
      recentSignatures: [],
    };

    let courseId: number | undefined;
    let courseShortname: string | undefined;

    try {
      courseShortname = generateCourseShortname(planId, revision, content.course.course_code, content.course.title);
      safeContext.stepNumber = stepNumber++;
      const courseCallResult = await executeRuntimeToolCall(safeContext, {
        toolCallId: crypto.randomUUID(),
        toolName: "moodle_create_course",
        arguments: {
          category_id: target.category_id,
          fullname: content.course.title,
          shortname: courseShortname,
          ...(content.course.summary ? { summary: content.course.summary } : {}),
        },
        context: { targetType: "course", localRef: "course" },
      });
      if (courseCallResult.status === "error") {
        throw new CourseExecutionError(courseCallResult.code || "COURSE_CREATION_FAILED", `Failed to create course in Moodle: ${courseCallResult.message}`);
      }
      courseId = Number((courseCallResult.data as { course_id: number }).course_id);
      createdEntities.courses++;

      for (const section of sortedSections) {
        safeContext.stepNumber = stepNumber++;
        const sectionCallResult = await executeRuntimeToolCall(safeContext, {
          toolCallId: crypto.randomUUID(),
          toolName: "moodle_create_section",
          arguments: {
            course_id: courseId,
            position: section.position,
            name: section.title,
            ...(section.summary ? { summary: section.summary } : {}),
          },
          context: { targetType: "section", localRef: section.ref },
        });
        if (sectionCallResult.status === "error") {
          throw new CourseExecutionError(sectionCallResult.code || "SECTION_CREATION_FAILED", `Failed to create section '${section.ref}' (${section.title}): ${sectionCallResult.message}`);
        }
        const sectionId = Number((sectionCallResult.data as { section_id: number }).section_id);
        createdEntities.sections++;

        for (const activity of section.activities) {
          if (activity.type === "assignment") {
            const assignment = activity as AssignmentPlan;
            safeContext.stepNumber = stepNumber++;
            const assignCallResult = await executeRuntimeToolCall(safeContext, {
              toolCallId: crypto.randomUUID(),
              toolName: "moodle_create_assignment",
              arguments: {
                course_id: courseId,
                section_id: sectionId,
                name: assignment.title,
                intro: formatAssignmentIntro(assignment),
                grade: assignment.grade,
              },
              context: { targetType: "assignment", localRef: assignment.ref },
            });
            if (assignCallResult.status === "error") {
              throw new CourseExecutionError(assignCallResult.code || "ASSIGNMENT_CREATION_FAILED", `Failed to create assignment '${assignment.ref}' (${assignment.title}): ${assignCallResult.message}`);
            }
            createdEntities.assignments++;
          } else if (activity.type === "quiz") {
            const quiz = activity as QuizPlan;
            safeContext.stepNumber = stepNumber++;
            const quizCallResult = await executeRuntimeToolCall(safeContext, {
              toolCallId: crypto.randomUUID(),
              toolName: "moodle_create_quiz",
              arguments: {
                course_id: courseId,
                section_id: sectionId,
                name: quiz.title,
                ...(quiz.description ? { intro: quiz.description } : {}),
              },
              context: { targetType: "quiz", localRef: quiz.ref },
            });
            if (quizCallResult.status === "error") {
              throw new CourseExecutionError(quizCallResult.code || "QUIZ_CREATION_FAILED", `Failed to create quiz '${quiz.ref}' (${quiz.title}): ${quizCallResult.message}`);
            }
            const quizActivityId = Number((quizCallResult.data as { activity_id: number }).activity_id);
            createdEntities.quizzes++;

            let qOrdinal = 1;
            for (const question of quiz.questions) {
              const questionArgs = serializeQuestionToMcpArgs(quizActivityId, question, qOrdinal++);
              safeContext.stepNumber = stepNumber++;
              const questionCallResult = await executeRuntimeToolCall(safeContext, {
                toolCallId: crypto.randomUUID(),
                toolName: "moodle_create_quiz_question",
                arguments: questionArgs,
                context: { targetType: "question", localRef: question.ref },
              });
              if (questionCallResult.status === "error") {
                throw new CourseExecutionError(questionCallResult.code || "QUESTION_CREATION_FAILED", `Failed to create question '${question.ref}' for quiz '${quiz.ref}': ${questionCallResult.message}`);
              }
              const questionBankEntryId = Number((questionCallResult.data as { question_bank_entry_id: number }).question_bank_entry_id);
              createdEntities.questions++;

              safeContext.stepNumber = stepNumber++;
              const slotCallResult = await executeRuntimeToolCall(safeContext, {
                toolCallId: crypto.randomUUID(),
                toolName: "moodle_add_question_to_quiz",
                arguments: {
                  activity_id: quizActivityId,
                  question_bank_entry_id: questionBankEntryId,
                  max_mark: question.default_mark,
                },
                context: { localRef: question.ref },
              });
              if (slotCallResult.status === "error") {
                throw new CourseExecutionError(slotCallResult.code || "ADD_QUESTION_TO_QUIZ_FAILED", `Failed to add question '${question.ref}' to quiz '${quiz.ref}': ${slotCallResult.message}`);
              }
              createdEntities.slots++;
            }
          }
        }
      }

      const courseUrl = formatCourseUrl(moodleBaseUrl, courseId);
      const mappings: ExecutionMappingItem[] = [];
      if (repositories.mappingRepo) {
        const recorded = await repositories.mappingRepo.listRunMappings(runId, planId, revision);
        for (const m of recorded) mappings.push({ localRef: m.localRef, targetType: m.targetType, moodleId: m.moodleId });
      }

      if (repositories.runRepo) await repositories.runRepo.updateStatus(runId, "awaiting_verification");
      return {
        runId,
        planId,
        revision,
        status: "awaiting_verification",
        courseId,
        courseShortname,
        courseUrl,
        createdEntities,
        mappings,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (repositories.runRepo) await repositories.runRepo.failRun(runId, errorMsg);

      const mappings: ExecutionMappingItem[] = [];
      if (repositories.mappingRepo) {
        try {
          const recorded = await repositories.mappingRepo.listRunMappings(runId, planId, revision);
          for (const m of recorded) mappings.push({ localRef: m.localRef, targetType: m.targetType, moodleId: m.moodleId });
        } catch {
          // Preserve original execution failure.
        }
      }

      if (err instanceof CourseExecutionError) throw err;
      throw new CourseExecutionError("EXECUTION_FAILED", errorMsg, {
        runId,
        planId,
        revision,
        courseId,
        createdEntities,
        mappings,
      });
    }
  }
}

export async function executeCoursePlan(config: CourseExecutionConfig): Promise<CourseExecutionResult> {
  return new CourseExecutor(config).execute();
}
