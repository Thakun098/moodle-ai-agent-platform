import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  pocExecutionMapping,
  type NewPocExecutionMappingRecord,
  type PocExecutionMappingRecord,
  type PocExecutionTargetType,
} from "../db/schema/execution-mappings.js";

export class ExecutionMappingRepository {
  constructor(private readonly db: AppDatabase) {}

  async setMapping(data: {
    id: string;
    runId: string;
    planId: string;
    revision: number;
    localRef: string;
    targetType: PocExecutionTargetType;
    moodleId: number;
    moodleMetadata?: Record<string, unknown>;
  }): Promise<PocExecutionMappingRecord> {
    const existing = await this.getMapping(
      data.runId,
      data.planId,
      data.revision,
      data.localRef
    );

    if (existing) {
      if (existing.moodleId !== data.moodleId) {
        throw new Error(
          `Mapping conflict for localRef "${data.localRef}" in run "${data.runId}" (plan "${data.planId}" rev ${data.revision}): existing moodle_id is ${existing.moodleId}, cannot overwrite with ${data.moodleId}.`
        );
      }

      if (data.moodleMetadata !== undefined) {
        const [updated] = await this.db
          .update(pocExecutionMapping)
          .set({
            moodleMetadata: data.moodleMetadata,
          })
          .where(eq(pocExecutionMapping.id, existing.id))
          .returning();
        return updated ?? existing;
      }

      return existing;
    }

    const insertData: NewPocExecutionMappingRecord = {
      id: data.id,
      runId: data.runId,
      planId: data.planId,
      revision: data.revision,
      localRef: data.localRef,
      targetType: data.targetType,
      moodleId: data.moodleId,
      moodleMetadata: data.moodleMetadata ?? null,
    };

    const [created] = await this.db
      .insert(pocExecutionMapping)
      .values(insertData)
      .returning();

    if (!created) {
      throw new Error(
        `Failed to set execution mapping for ${data.localRef} in run ${data.runId}`
      );
    }
    return created;
  }

  async getMapping(
    runId: string,
    planId: string,
    revision: number,
    localRef: string
  ): Promise<PocExecutionMappingRecord | null> {
    const [record] = await this.db
      .select()
      .from(pocExecutionMapping)
      .where(
        and(
          eq(pocExecutionMapping.runId, runId),
          eq(pocExecutionMapping.planId, planId),
          eq(pocExecutionMapping.revision, revision),
          eq(pocExecutionMapping.localRef, localRef)
        )
      )
      .limit(1);
    return record ?? null;
  }

  async findMoodleIdByLocalRef(
    runId: string,
    planId: string,
    revision: number,
    localRef: string
  ): Promise<number | null> {
    const mapping = await this.getMapping(runId, planId, revision, localRef);
    return mapping ? mapping.moodleId : null;
  }

  async listRunMappings(
    runId: string,
    planId?: string,
    revision?: number
  ): Promise<PocExecutionMappingRecord[]> {
    if (planId !== undefined && revision !== undefined) {
      return this.db
        .select()
        .from(pocExecutionMapping)
        .where(
          and(
            eq(pocExecutionMapping.runId, runId),
            eq(pocExecutionMapping.planId, planId),
            eq(pocExecutionMapping.revision, revision)
          )
        );
    }
    return this.db
      .select()
      .from(pocExecutionMapping)
      .where(eq(pocExecutionMapping.runId, runId));
  }
}
