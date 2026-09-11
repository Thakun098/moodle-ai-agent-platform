import type {
  ActivityPlan,
  AnyPlanEnvelope,
  AssignmentPlan,
  CoursePlanContent,
  EssayQuestionPlan,
  MultipleChoiceQuestionPlan,
  PlanOperation,
  PlanType,
  QuestionPlan,
  QuizPlan,
  QuizUpdateContent,
  SectionPlan,
  ShortAnswerQuestionPlan,
  SourceReference,
  TrueFalseQuestionPlan,
  FileResourcePlan,
} from "@moodle-agent-poc/contracts";

export interface QuestionTypeCounts {
  multichoice: number;
  truefalse: number;
  shortanswer: number;
  essay: number;
}

export interface PlanMetrics {
  sections?: number;
  assignments?: number;
  quizzes?: number;
  questions?: number;
  resources?: number;
  questions_by_type?: QuestionTypeCounts;
}

export interface CoursePreview {
  type: "course";
  course_title: string;
  course_code?: string;
  course_summary?: string;
  sections: Array<{
    ref: string;
    position: number;
    title: string;
    summary?: string;
    source_refs: SourceReference[];
    activities: Array<AssignmentPreview | QuizPreview>;
    resources: FileResourcePreview[];
  }>;
}

export interface FileResourcePreview {
  type: "resource";
  ref: string;
  title: string;
  filename: string;
  moodle_material_id: string | number;
  source_run_id: string;
  source_structure_revision: number;
  source_section_ref: string;
  source_material_revision: number;
  source_refs: SourceReference[];
}

export interface AssignmentPreview {
  type: "assignment";
  ref?: string;
  title: string;
  description: string;
  instructions: string[];
  learning_objectives: string[];
  grade: number;
  source_refs: SourceReference[];
}

export interface QuestionPreview {
  ref: string;
  type: "multichoice" | "truefalse" | "shortanswer" | "essay";
  question: string;
  default_mark: number;
  feedback?: string;
  source_refs: SourceReference[];
  choices?: Array<{ ref: string; text: string; is_correct?: boolean }>;
  correct_choice_refs?: string[];
  correct_answer?: boolean;
  accepted_answers?: string[];
  case_sensitive?: boolean;
  grading_guidance?: string[];
}

export interface QuizPreview {
  type: "quiz";
  ref?: string;
  title: string;
  description: string;
  source_refs: SourceReference[];
  questions?: QuestionPreview[];
  questions_to_add?: QuestionPreview[];
  questions_to_update?: QuestionPreview[];
}

export interface PlanPreview {
  plan_id: string;
  revision: number;
  plan_type: PlanType;
  operation: PlanOperation;
  title: string;
  summary: string;
  warnings: string[];
  assumptions: string[];
  structure: CoursePreview | AssignmentPreview | QuizPreview;
  source_refs: SourceReference[];
  metrics: PlanMetrics;
}

function cloneSourceReference(ref: SourceReference): SourceReference {
  return {
    source: ref.source,
    ...(ref.page !== undefined ? { page: ref.page } : {}),
    ...(ref.section !== undefined ? { section: ref.section } : {}),
    ...(ref.text !== undefined ? { text: ref.text } : {}),
  };
}

function cloneSourceReferences(refs: readonly SourceReference[] | undefined): SourceReference[] {
  return refs ? refs.map(cloneSourceReference) : [];
}

function deduplicateSourceRefs(sources: SourceReference[]): SourceReference[] {
  const seen = new Set<string>();
  const result: SourceReference[] = [];

  for (const src of sources) {
    const key = `${src.source}|${src.page ?? ""}|${src.section ?? ""}|${src.text ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push({
        source: src.source,
        ...(src.page !== undefined ? { page: src.page } : {}),
        ...(src.section !== undefined ? { section: src.section } : {}),
        ...(src.text !== undefined ? { text: src.text } : {}),
      });
    }
  }

  return result;
}

function formatQuestionPreview(q: QuestionPlan): QuestionPreview {
  switch (q.type) {
    case "multichoice": {
      const mc = q as MultipleChoiceQuestionPlan;
      return {
        ref: mc.ref,
        type: "multichoice",
        question: mc.question,
        default_mark: mc.default_mark,
        feedback: mc.feedback,
        source_refs: cloneSourceReferences(mc.source_refs),
        choices: mc.choices.map((c) => ({
          ref: c.ref,
          text: c.text,
          is_correct: mc.correct_choice_refs?.includes(c.ref),
        })),
        correct_choice_refs: [...mc.correct_choice_refs],
      };
    }
    case "truefalse": {
      const tf = q as TrueFalseQuestionPlan;
      return {
        ref: tf.ref,
        type: "truefalse",
        question: tf.question,
        default_mark: tf.default_mark,
        feedback: tf.feedback,
        source_refs: cloneSourceReferences(tf.source_refs),
        correct_answer: tf.correct_answer,
      };
    }
    case "shortanswer": {
      const sa = q as ShortAnswerQuestionPlan;
      return {
        ref: sa.ref,
        type: "shortanswer",
        question: sa.question,
        default_mark: sa.default_mark,
        source_refs: cloneSourceReferences(sa.source_refs),
        accepted_answers: [...sa.accepted_answers],
        case_sensitive: sa.case_sensitive,
      };
    }
    case "essay": {
      const es = q as EssayQuestionPlan;
      return {
        ref: es.ref,
        type: "essay",
        question: es.question,
        default_mark: es.default_mark,
        source_refs: cloneSourceReferences(es.source_refs),
        grading_guidance: [...es.grading_guidance],
      };
    }
    default:
      throw new Error(`Unsupported question type in preview formatting: ${(q as any).type}`);
  }
}

function formatAssignmentPreview(assignment: AssignmentPlan): AssignmentPreview {
  return {
    type: "assignment",
    ref: assignment.ref,
    title: assignment.title,
    description: assignment.description,
    instructions: [...assignment.instructions],
    learning_objectives: [...assignment.learning_objectives],
    grade: assignment.grade,
    source_refs: cloneSourceReferences(assignment.source_refs),
  };
}

function formatQuizPreview(quiz: QuizPlan): QuizPreview {
  return {
    type: "quiz",
    ref: quiz.ref,
    title: quiz.title,
    description: quiz.description,
    source_refs: cloneSourceReferences(quiz.source_refs),
    questions: quiz.questions?.map(formatQuestionPreview) ?? [],
  };
}

function formatResourcePreview(resource: FileResourcePlan): FileResourcePreview {
  return {
    type: "resource",
    ref: resource.ref,
    title: resource.title,
    filename: resource.filename,
    moodle_material_id: resource.moodle_material_id,
    source_run_id: resource.source_run_id,
    source_structure_revision: resource.source_structure_revision,
    source_section_ref: resource.source_section_ref,
    source_material_revision: resource.source_material_revision,
    source_refs: cloneSourceReferences(resource.source_refs),
  };
}

function formatQuizUpdatePreview(content: QuizUpdateContent): QuizPreview {
  return {
    type: "quiz",
    title: content.title,
    description: content.description,
    source_refs: cloneSourceReferences(content.source_refs),
    questions_to_add: content.questions_to_add?.map(formatQuestionPreview) ?? [],
    questions_to_update: content.questions_to_update?.map(formatQuestionPreview) ?? [],
  };
}

/**
 * Extracts all source references across a plan envelope without mutating it.
 */
export function extractPlanSourceReferences(envelope: AnyPlanEnvelope): SourceReference[] {
  const collected: SourceReference[] = [];

  if (envelope.plan_type === "course") {
    const content = envelope.content as unknown as CoursePlanContent;
    if (content?.sections) {
      for (const section of content.sections) {
        if (section.source_refs) {
          collected.push(...section.source_refs);
        }
        if (section.activities) {
          for (const activity of section.activities) {
            if (activity.source_refs) {
              collected.push(...activity.source_refs);
            }
            if (activity.type === "quiz" && (activity as QuizPlan).questions) {
              for (const q of (activity as QuizPlan).questions) {
                if (q.source_refs) {
                  collected.push(...q.source_refs);
                }
              }
            }
          }
        }
        if (section.resources) {
          for (const resource of section.resources) {
            collected.push(...resource.source_refs);
          }
        }
      }
    }
  } else if (envelope.plan_type === "assignment") {
    const content = envelope.content as unknown as AssignmentPlan;
    if (content?.source_refs) {
      collected.push(...content.source_refs);
    }
  } else if (envelope.plan_type === "quiz") {
    if (envelope.operation === "create") {
      const content = envelope.content as unknown as QuizPlan;
      if (content?.source_refs) {
        collected.push(...content.source_refs);
      }
      if (content?.questions) {
        for (const q of content.questions) {
          if (q.source_refs) {
            collected.push(...q.source_refs);
          }
        }
      }
    } else {
      const content = envelope.content as unknown as QuizUpdateContent;
      if (content?.source_refs) {
        collected.push(...content.source_refs);
      }
      if (content?.questions_to_add) {
        for (const q of content.questions_to_add) {
          if (q.source_refs) {
            collected.push(...q.source_refs);
          }
        }
      }
      if (content?.questions_to_update) {
        for (const q of content.questions_to_update) {
          if (q.source_refs) {
            collected.push(...q.source_refs);
          }
        }
      }
    }
  }

  return deduplicateSourceRefs(collected);
}

/**
 * Pure function: Builds a structured, read-only PlanPreview projection from a canonical PlanEnvelope.
 * Does NOT mutate the input envelope.
 */
export function buildPlanPreview(envelope: AnyPlanEnvelope): PlanPreview {
  const aggregatedSourceRefs = extractPlanSourceReferences(envelope);
  const warnings = envelope.warnings ? [...envelope.warnings] : [];
  const assumptions = envelope.assumptions ? [...envelope.assumptions] : [];

  let structure: CoursePreview | AssignmentPreview | QuizPreview;
  const metrics: PlanMetrics = {};

  if (envelope.plan_type === "course") {
    const content = envelope.content as unknown as CoursePlanContent;
    const qTypeCounts: QuestionTypeCounts = {
      multichoice: 0,
      truefalse: 0,
      shortanswer: 0,
      essay: 0,
    };

    let totalAssignments = 0;
    let totalQuizzes = 0;
    let totalQuestions = 0;
    let totalResources = 0;

    const sections = (content.sections || []).map((section: SectionPlan) => {
      const activities: Array<AssignmentPreview | QuizPreview> = (
        section.activities || []
      ).map((activity: ActivityPlan) => {
        if (activity.type === "assignment") {
          totalAssignments++;
          return formatAssignmentPreview(activity as AssignmentPlan);
        } else if (activity.type === "quiz") {
          totalQuizzes++;
          const quiz = activity as QuizPlan;
          if (quiz.questions) {
            totalQuestions += quiz.questions.length;
            for (const q of quiz.questions) {
              if (q.type in qTypeCounts) {
                qTypeCounts[q.type as keyof QuestionTypeCounts]++;
              }
            }
          }
          return formatQuizPreview(quiz);
        }
        throw new Error(`Unsupported activity type: ${(activity as any).type}`);
      });

      return {
        ref: section.ref,
        position: section.position,
        title: section.title,
        ...(section.summary ? { summary: section.summary } : {}),
        source_refs: cloneSourceReferences(section.source_refs),
        activities,
        resources: (section.resources || []).map((resource) => {
          totalResources++;
          return formatResourcePreview(resource);
        }),
      };
    });

    structure = {
      type: "course",
      course_title: content.course?.title || envelope.title,
      ...(content.course?.course_code ? { course_code: content.course.course_code } : {}),
      ...(content.course?.summary ? { course_summary: content.course.summary } : {}),
      sections,
    };

    metrics.sections = sections.length;
    metrics.assignments = totalAssignments;
    metrics.quizzes = totalQuizzes;
    metrics.questions = totalQuestions;
    metrics.resources = totalResources;
    metrics.questions_by_type = qTypeCounts;
  } else if (envelope.plan_type === "assignment") {
    const content = envelope.content as unknown as AssignmentPlan;
    structure = formatAssignmentPreview(content);
    metrics.assignments = 1;
  } else if (envelope.plan_type === "quiz") {
    const qTypeCounts: QuestionTypeCounts = {
      multichoice: 0,
      truefalse: 0,
      shortanswer: 0,
      essay: 0,
    };

    let totalQuestions = 0;

    if (envelope.operation === "create") {
      const content = envelope.content as unknown as QuizPlan;
      structure = formatQuizPreview(content);
      if (content.questions) {
        totalQuestions += content.questions.length;
        for (const q of content.questions) {
          if (q.type in qTypeCounts) {
            qTypeCounts[q.type as keyof QuestionTypeCounts]++;
          }
        }
      }
    } else {
      const content = envelope.content as unknown as QuizUpdateContent;
      structure = formatQuizUpdatePreview(content);
      const allQuestions = [
        ...(content.questions_to_add || []),
        ...(content.questions_to_update || []),
      ];
      totalQuestions += allQuestions.length;
      for (const q of allQuestions) {
        if (q.type in qTypeCounts) {
          qTypeCounts[q.type as keyof QuestionTypeCounts]++;
        }
      }
    }

    metrics.quizzes = 1;
    metrics.questions = totalQuestions;
    metrics.questions_by_type = qTypeCounts;
  } else {
    throw new Error(`Unsupported plan_type for preview: ${envelope.plan_type}`);
  }

  return {
    plan_id: envelope.plan_id,
    revision: envelope.revision,
    plan_type: envelope.plan_type,
    operation: envelope.operation,
    title: envelope.title,
    summary: envelope.summary,
    warnings,
    assumptions,
    structure,
    source_refs: aggregatedSourceRefs,
    metrics,
  };
}


