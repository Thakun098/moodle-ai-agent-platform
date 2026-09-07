export interface ActivityDefaultPolicy {
  maxAttempts: number;
  quizQuestionCount: number;
  quizChoiceCount: number;
  quizCorrectChoiceCount: number;
  quizDefaultMark: number;
  assignmentGrade: number;
  syllabusDetailThreshold: number;
}

export function activityDefaultPolicy(env: Record<string, string | undefined> = {}): ActivityDefaultPolicy {
  const positive = (name: string, fallback: number, min = 1): number => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < min) throw new Error(`Invalid ${name}: expected integer >= ${min}.`);
    return value;
  };
  return {
    maxAttempts: positive("ACTIVITY_GENERATION_MAX_ATTEMPTS", 2),
    quizQuestionCount: positive("DEFAULT_QUIZ_QUESTION_COUNT", 5),
    quizChoiceCount: positive("DEFAULT_QUIZ_CHOICE_COUNT", 4, 2),
    quizCorrectChoiceCount: 1,
    quizDefaultMark: 1,
    assignmentGrade: positive("DEFAULT_ASSIGNMENT_GRADE", 100),
    syllabusDetailThreshold: positive("SYLLABUS_ACTIVITY_DETAIL_THRESHOLD", 500),
  };
}
