import type { NormalizedSyllabus } from "@moodle-agent-poc/contracts";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  pocRun,
  type NewPocRunRecord,
  type PocRunRecord,
  type PocRunStatus,
  type SyllabusMetadata,
} from "../db/schema/runs.js";

export class RunRepository {
  constructor(private readonly db: AppDatabase) {}

  async createRun(data: {
    runId: string;
    model: string;
    status?: PocRunStatus;
    syllabusMetadata?: SyllabusMetadata;
    normalizedSyllabus?: NormalizedSyllabus;
  }): Promise<PocRunRecord> {
    const insertData: NewPocRunRecord = {
      runId: data.runId,
      model: data.model,
      status: data.status ?? "pending",
      syllabusMetadata: data.syllabusMetadata,
      normalizedSyllabus: data.normalizedSyllabus,
    };
    const [created] = await this.db.insert(pocRun).values(insertData).returning();
    if (!created) {
      throw new Error(`Failed to create run with id ${data.runId}`);
    }
    return created;
  }

  async getRun(runId: string): Promise<PocRunRecord | null> {
    const [record] = await this.db
      .select()
      .from(pocRun)
      .where(eq(pocRun.runId, runId))
      .limit(1);
    return record ?? null;
  }

  async setNormalizedSyllabus(
    runId: string,
    normalizedSyllabus: NormalizedSyllabus
  ): Promise<PocRunRecord> {
    const [updated] = await this.db
      .update(pocRun)
      .set({
        normalizedSyllabus,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(pocRun.runId, runId))
      .returning();
    if (!updated) {
      throw new Error(`Run not found for syllabus update: ${runId}`);
    }
    return updated;
  }

  async setResourcePublication(runId: string, sectionRef: string, publish: boolean): Promise<PocRunRecord> {
    const current = await this.getRun(runId);
    if (!current) throw new Error(`Run not found for resource publication update: ${runId}`);
    const metadata = current.syllabusMetadata ?? {};
    const publication = { ...(metadata.resource_publication ?? {}), [sectionRef]: publish };
    const [updated] = await this.db.update(pocRun).set({
      syllabusMetadata: { ...metadata, resource_publication: publication },
      updatedAt: new Date().toISOString(),
    }).where(eq(pocRun.runId, runId)).returning();
    if (!updated) throw new Error(`Run not found for resource publication update: ${runId}`);
    return updated;
  }

  async updateStatus(
    runId: string,
    status: PocRunStatus,
    error?: string
  ): Promise<PocRunRecord> {
    const [updated] = await this.db
      .update(pocRun)
      .set({
        status,
        error: error ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(pocRun.runId, runId))
      .returning();
    if (!updated) {
      throw new Error(`Run not found for update: ${runId}`);
    }
    return updated;
  }

  async completeRun(
    runId: string,
    finalResult?: Record<string, unknown>
  ): Promise<PocRunRecord> {
    const [updated] = await this.db
      .update(pocRun)
      .set({
        status: "completed",
        finalResult: finalResult ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(pocRun.runId, runId))
      .returning();
    if (!updated) {
      throw new Error(`Run not found for completion: ${runId}`);
    }
    return updated;
  }

  async approvePlan(data: {
    runId: string;
    planId: string;
    revision: number;
    approvedByMoodleUserId?: string | undefined;
  }): Promise<PocRunRecord> {
    const [updated] = await this.db
      .update(pocRun)
      .set({
        approvedPlanId: data.planId,
        approvedRevision: data.revision,
        approvedAt: new Date().toISOString(),
        approvedByMoodleUserId: data.approvedByMoodleUserId ?? null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(pocRun.runId, data.runId))
      .returning();
    if (!updated) {
      throw new Error(`Run not found for approval: ${data.runId}`);
    }
    return updated;
  }

  async failRun(runId: string, error: string): Promise<PocRunRecord> {
    return this.updateStatus(runId, "failed", error);
  }
}
