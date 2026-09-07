export type ActivityType = "quiz" | "assignment";
export type QuestionType = "multichoice" | "truefalse" | "shortanswer" | "essay";

export interface ActivityRule {
  scope: "each_section" | "specific_sections" | "every_n_sections";
  sectionPositions?: number[];
  anchors?: string[];
  interval?: number;
  activityType: ActivityType;
  activityCount?: number;
  questionType?: QuestionType;
  questionsPerActivity?: number;
  choicesPerQuestion?: number;
  correctChoicesPerQuestion?: number;
}

export interface CoursePlanningConstraints {
  activityRules: ActivityRule[];
  originalInstruction?: string;
  warnings: string[];
}
