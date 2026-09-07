import type { ActivityRule, ActivityType, CoursePlanningConstraints, QuestionType } from "./planning-constraints.js";

function firstNumber(text: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return undefined;
}

function splitInstructionClauses(text: string): string[] {
  return text.split(/\s+(?:และ\s*|and\s+)(?=(?:ขอให้\s*)?(?:ใน\s*)?(?:ทุก|แต่ละ|each|every|(?:week|สัปดาห์)\s*(?:ที่\s*)?\d))/giu)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function activityTypesIn(text: string): ActivityType[] {
  const types: ActivityType[] = [];
  if (/\bquiz\b|แบบทดสอบ|ควิซ/iu.test(text)) types.push("quiz");
  if (/\bassignment\b|งานมอบหมาย|การบ้าน/iu.test(text)) types.push("assignment");
  return types;
}

function specificWeekTargets(text: string): { positions: number[]; anchors: string[] } {
  const positions: number[] = [];
  const anchors: string[] = [];
  const add = (position: number, anchor: string) => {
    if (!Number.isSafeInteger(position) || position < 1 || positions.includes(position)) return;
    positions.push(position);
    anchors.push(anchor.trim());
  };
  const matches = [...text.matchAll(/((สัปดาห์|week)\s*(?:ที่\s*)?(\d+))/giu)];
  for (const match of matches) {
    add(Number(match[3]), match[1]!);
    const tail = text.slice((match.index ?? 0) + match[0].length);
    const continuation = tail.match(/^\s*((?:(?:,|และ|and)\s*\d+\s*)+)/iu)?.[1] ?? "";
    for (const number of continuation.match(/\d+/gu) ?? []) add(Number(number), `${match[2]} ${number}`);
  }
  return { positions, anchors };
}

function compileRule(clause: string, activityType: ActivityType): ActivityRule | null {
  const targets = specificWeekTargets(clause);
  const everyNMatch = clause.match(/(?:ทุก(?:ๆ)?|every)\s*(\d+)\s*(?:สัปดาห์|weeks?|sections?)/iu);
  const eachSection = /ทุก(?:ๆ)?\s*(?:สัปดาห์|weeks?|week|sections?|section|หน่วย|บท)|แต่ละ\s*(?:สัปดาห์|week|section|หน่วย|บท)|each\s+(?:week|section)|every\s+(?:week|section)/iu.test(clause);
  const scope: ActivityRule["scope"] | undefined = targets.positions.length > 0
    ? "specific_sections"
    : everyNMatch
      ? "every_n_sections"
      : eachSection
        ? "each_section"
        : undefined;
  if (!scope) return null;

  const activityName = activityType === "quiz" ? "(?:quiz|แบบทดสอบ|ควิซ)" : "(?:assignment|งานมอบหมาย|การบ้าน)";
  const activityCount = firstNumber(clause, [
    new RegExp(`${activityName}\\s*(\\d+)\\s*(?:ชุด|sets?|ฉบับ|ชิ้น|เรื่อง)`, "iu"),
    new RegExp(`(\\d+)\\s*(?:ชุด|sets?|ฉบับ|ชิ้น|เรื่อง)\\s*(?:ต่อ|ในแต่ละ|per|of)?\\s*${activityName}`, "iu"),
  ]) ?? 1;

  let questionType: QuestionType | undefined;
  let questionsPerActivity: number | undefined;
  let choicesPerQuestion: number | undefined;
  let correctChoicesPerQuestion: number | undefined;
  if (activityType === "quiz") {
    questionType = /multiple[\s_-]*choice|multichoice|mcq|ปรนัย|ตัวเลือก/iu.test(clause) ? "multichoice" : undefined;
    questionsPerActivity = firstNumber(clause, [
      /(?:quiz|แบบทดสอบ|ควิซ)[^\d]{0,40}(\d+)\s*(?:ข้อ|questions?)/iu,
      /(\d+)\s*(?:ข้อ|questions?)[^\d]{0,40}(?:quiz|แบบทดสอบ|ควิซ)/iu,
    ]);
    choicesPerQuestion = firstNumber(clause, [/(\d+)\s*(?:ตัวเลือก|choices?|options?)/iu]);
    correctChoicesPerQuestion = firstNumber(clause, [/(?:ถูกต้อง|correct)[^\d]{0,20}(\d+)/iu]);
  }

  return {
    scope,
    ...(scope === "specific_sections" ? { sectionPositions: targets.positions, anchors: targets.anchors } : {}),
    ...(scope === "every_n_sections" && everyNMatch ? { interval: Number(everyNMatch[1]) } : {}),
    activityType,
    activityCount,
    ...(questionType ? { questionType } : {}),
    ...(questionsPerActivity !== undefined ? { questionsPerActivity } : {}),
    ...(choicesPerQuestion !== undefined ? { choicesPerQuestion } : {}),
    ...(correctChoicesPerQuestion !== undefined ? { correctChoicesPerQuestion } : {}),
  };
}

export function interpretTeacherInstruction(instruction?: string): CoursePlanningConstraints {
  const original = instruction?.trim() ?? "";
  if (!original) return { activityRules: [], warnings: [] };

  const warnings: string[] = [];
  const activityRules: ActivityRule[] = [];
  let matchedActivity = false;
  for (const clause of splitInstructionClauses(original)) {
    const activityTypes = activityTypesIn(clause);
    matchedActivity ||= activityTypes.length > 0;
    for (const activityType of activityTypes) {
      const rule = compileRule(clause, activityType);
      if (rule) activityRules.push(rule);
      else warnings.push(`Teacher instruction clause for ${activityType} matched an activity type but did not specify a supported scope; it was not applied.`);
    }
  }

  if (!matchedActivity) {
    warnings.push("Teacher instruction did not match a supported deterministic activity rule; no teacher activity rule was applied.");
  }
  if (activityRules.length === 0 && matchedActivity && warnings.length === 0) {
    warnings.push("No deterministic teacher constraints were compiled.");
  }
  return { activityRules, originalInstruction: original, warnings };
}
