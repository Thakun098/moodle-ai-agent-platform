import type { AiQualityResult, HumanQualityScore, QualityRubricDimension } from "./types.js";

const anchors = (poor: string, weak: string, adequate: string, strong: string, excellent: string) => ({
  1: poor, 2: weak, 3: adequate, 4: strong, 5: excellent,
} as const);

export const PLANNING_QUALITY_RUBRIC: readonly QualityRubricDimension[] = [
  {
    id: "grounding",
    label: "Grounding and source fidelity",
    description: "Plan content remains traceable to syllabus/source context and does not invent unsupported requirements.",
    weight: 0.25,
    anchors: anchors("Mostly unsupported", "Frequent unsupported content", "Generally grounded with minor gaps", "Strongly grounded", "Fully grounded and traceable"),
  },
  {
    id: "coverage",
    label: "Requirement coverage",
    description: "Important syllabus topics, objectives, assessments, and constraints are represented appropriately.",
    weight: 0.25,
    anchors: anchors("Major omissions", "Several important omissions", "Core requirements covered", "Nearly complete coverage", "Comprehensive without unnecessary additions"),
  },
  {
    id: "instructional_design",
    label: "Instructional design quality",
    description: "Sections, activities, questions, and objectives form a coherent and teachable learning design.",
    weight: 0.2,
    anchors: anchors("Incoherent", "Weak sequencing/alignment", "Usable", "Well aligned", "Excellent sequencing and pedagogical alignment"),
  },
  {
    id: "specificity",
    label: "Specificity and actionability",
    description: "Generated plans are concrete enough to preview, approve, and materialize without hidden interpretation.",
    weight: 0.15,
    anchors: anchors("Vague", "Often ambiguous", "Adequately actionable", "Specific", "Precise and directly executable"),
  },
  {
    id: "appropriateness",
    label: "Assessment appropriateness",
    description: "Assignments and quiz questions are suitable for stated objectives and level.",
    weight: 0.15,
    anchors: anchors("Poor fit", "Weak fit", "Acceptable fit", "Strong fit", "Excellent fit and balance"),
  },
] as const;

export const HUMAN_AI_QUALITY_RUBRIC = PLANNING_QUALITY_RUBRIC;

export function aggregateHumanQuality(scores: readonly HumanQualityScore[]): AiQualityResult {
  if (scores.length === 0) {
    return { status: "not_evaluated", reason: "No human quality evaluations were supplied." };
  }
  const dimensionMeans: Record<string, number> = {};
  for (const dimension of HUMAN_AI_QUALITY_RUBRIC) {
    const values = scores.map((score) => score.scores[dimension.id]).filter((v): v is number => typeof v === "number");
    if (values.length !== scores.length) throw new Error(`Missing human score for rubric dimension ${dimension.id}.`);
    if (values.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) throw new Error(`Scores for ${dimension.id} must be integers 1..5.`);
    dimensionMeans[dimension.id] = values.reduce((a, b) => a + b, 0) / values.length;
  }
  const weightedMeanScore = HUMAN_AI_QUALITY_RUBRIC.reduce(
    (sum, dimension) => sum + dimensionMeans[dimension.id]! * dimension.weight,
    0
  );
  return {
    status: "evaluated",
    evaluations: scores.length,
    weightedMeanScore: Math.round(weightedMeanScore * 1000) / 1000,
    dimensionMeans: Object.fromEntries(Object.entries(dimensionMeans).map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
  };
}
