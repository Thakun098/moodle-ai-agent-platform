import { describe, expect, it } from "vitest";
import { buildQaReport, collectTechnicalMetrics, HUMAN_AI_QUALITY_RUBRIC } from "../src/index.js";

const trials = Array.from({ length: 9 }, (_, i) => ({
  trialId: `trial-${i + 1}`,
  fixtureId: ["synthetic-basic", "representative-software-engineering", "representative-project-management"][i % 3]!,
  model: "frozen-test-model",
  toolSchemaCalls: 10,
  toolSchemaValidCalls: i === 8 ? 9 : 10,
  toolCalls: 8,
  toolSuccesses: i === 7 ? 7 : 8,
  verificationAttempted: true,
  verificationPassed: i === 6 ? false : true,
  latency: { modelMs: 100 + i * 10, toolMs: 50 + i * 5, totalMs: 200 + i * 15 },
}));

describe("Phase 15 QA metrics", () => {
  it("measures schema validity, tool success, verification pass rate, and latency", () => {
    const metrics = collectTechnicalMetrics(trials);
    expect(metrics.trials).toBe(9);
    expect(metrics.toolSchemaValidityRate).toBeCloseTo(89 / 90, 4);
    expect(metrics.toolExecutionSuccessRate).toBeCloseTo(71 / 72, 4);
    expect(metrics.endToEndVerificationPassRate).toBeCloseTo(8 / 9, 4);
    expect(metrics.latencyMs.total.count).toBe(9);
    expect(metrics.latencyMs.model?.p95).toBe(180);
  });

  it("keeps technical results separate from unevaluated AI quality", () => {
    const report = buildQaReport({
      config: {
        fixtureIds: ["synthetic-basic", "representative-software-engineering", "representative-project-management"],
        model: "frozen-test-model",
        repetitions: 3,
        temperature: 0,
      },
      trials,
    });
    expect(report.technical.trials).toBe(9);
    expect(report.aiQuality.status).toBe("not_evaluated");
    expect(HUMAN_AI_QUALITY_RUBRIC.reduce((sum, x) => sum + x.weight, 0)).toBeCloseTo(1);
  });
});
