import {
  validateVerificationResult,
  type VerificationIssue,
  type VerificationResult,
} from "@moodle-agent-poc/contracts";
import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  pocVerification,
  type NewPocVerificationRecord,
  type PocVerificationRecord,
} from "../db/schema/verifications.js";

export class VerificationRepository {
  constructor(private readonly db: AppDatabase) {}

  async recordVerification(data: {
    id: string;
    runId: string;
    planId: string;
    revision: number;
    passed: boolean;
    issues: VerificationIssue[];
    expectedStructure?: Record<string, unknown>;
    observedMoodleStructure?: Record<string, unknown>;
  }): Promise<PocVerificationRecord> {
    const candidateContract = {
      plan_id: data.planId,
      revision: data.revision,
      passed: data.passed,
      issues: data.issues,
    };

    const validation = validateVerificationResult(candidateContract);
    if (!validation.valid) {
      throw new Error(
        `Invalid VerificationResult contract: ${validation.errors
          ?.map((e) => e.message)
          .join("; ")}`
      );
    }

    const insertData: NewPocVerificationRecord = {
      id: data.id,
      runId: data.runId,
      planId: data.planId,
      revision: data.revision,
      passed: data.passed,
      issues: data.issues,
      expectedStructure: data.expectedStructure ?? null,
      observedMoodleStructure: data.observedMoodleStructure ?? null,
    };

    const [created] = await this.db
      .insert(pocVerification)
      .values(insertData)
      .returning();

    if (!created) {
      throw new Error(
        `Failed to record verification for plan ${data.planId} rev ${data.revision}`
      );
    }
    return created;
  }

  async getLatestVerification(
    runId: string,
    planId: string,
    revision: number
  ): Promise<PocVerificationRecord | null> {
    const [record] = await this.db
      .select()
      .from(pocVerification)
      .where(
        and(
          eq(pocVerification.runId, runId),
          eq(pocVerification.planId, planId),
          eq(pocVerification.revision, revision)
        )
      )
      .orderBy(desc(pocVerification.createdAt))
      .limit(1);
    return record ?? null;
  }

  async listRunVerifications(runId: string): Promise<PocVerificationRecord[]> {
    return this.db
      .select()
      .from(pocVerification)
      .where(eq(pocVerification.runId, runId))
      .orderBy(desc(pocVerification.createdAt));
  }
}
