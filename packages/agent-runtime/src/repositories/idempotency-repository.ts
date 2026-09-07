import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  pocIdempotencyKey,
  type NewPocIdempotencyKeyRecord,
  type PocIdempotencyKeyRecord,
} from "../db/schema/idempotency.js";

export type AcquireResult =
  | { state: "acquired"; key: string }
  | { state: "cached"; key: string; result: unknown }
  | { state: "in_flight"; key: string }
  | { state: "uncertain"; key: string; errorMessage: string | null };

export function buildIdempotencyKey(params: {
  runId: string;
  planId: string;
  revision: number;
  localRef: string;
  toolName: string;
}): string {
  return `${params.runId}:${params.planId}:${params.revision}:${params.localRef}:${params.toolName}`;
}

export class IdempotencyRepository {
  constructor(private readonly db: AppDatabase) {}

  async tryAcquire(params: {
    runId: string;
    planId: string;
    revision: number;
    localRef: string;
    toolName: string;
  }): Promise<AcquireResult> {
    const key = buildIdempotencyKey(params);
    const newRecord: NewPocIdempotencyKeyRecord = {
      idempotencyKey: key,
      runId: params.runId,
      planId: params.planId,
      revision: params.revision,
      localRef: params.localRef,
      toolName: params.toolName,
      status: "in_flight",
    };

    const inserted = await this.db
      .insert(pocIdempotencyKey)
      .values(newRecord)
      .onConflictDoNothing()
      .returning();

    if (inserted.length > 0) {
      return { state: "acquired", key };
    }

    const existing = await this.getIdempotencyRecord(key);
    if (!existing) {
      return { state: "in_flight", key };
    }

    if (existing.status === "completed") {
      return { state: "cached", key, result: existing.resultPayload };
    }

    if (existing.status === "uncertain") {
      return { state: "uncertain", key, errorMessage: existing.errorMessage };
    }

    if (existing.status === "failed") {
      const [reacquired] = await this.db
        .update(pocIdempotencyKey)
        .set({
          status: "in_flight",
          errorMessage: null,
          completedAt: null,
        })
        .where(
          and(
            eq(pocIdempotencyKey.idempotencyKey, key),
            eq(pocIdempotencyKey.status, "failed")
          )
        )
        .returning();

      if (reacquired) {
        return { state: "acquired", key };
      }
    }

    return { state: "in_flight", key };
  }

  async recordSuccess(
    idempotencyKey: string,
    resultPayload: unknown
  ): Promise<PocIdempotencyKeyRecord> {
    const [updated] = await this.db
      .update(pocIdempotencyKey)
      .set({
        status: "completed",
        resultPayload,
        errorMessage: null,
        completedAt: new Date().toISOString(),
      })
      .where(eq(pocIdempotencyKey.idempotencyKey, idempotencyKey))
      .returning();

    if (!updated) {
      throw new Error(`Idempotency record not found: ${idempotencyKey}`);
    }
    return updated;
  }

  async recordFailure(
    idempotencyKey: string,
    errorMessage: string
  ): Promise<PocIdempotencyKeyRecord> {
    const [updated] = await this.db
      .update(pocIdempotencyKey)
      .set({
        status: "failed",
        errorMessage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(pocIdempotencyKey.idempotencyKey, idempotencyKey))
      .returning();

    if (!updated) {
      throw new Error(`Idempotency record not found: ${idempotencyKey}`);
    }
    return updated;
  }

  async recordUncertain(
    idempotencyKey: string,
    errorMessage: string
  ): Promise<PocIdempotencyKeyRecord> {
    const [updated] = await this.db
      .update(pocIdempotencyKey)
      .set({
        status: "uncertain",
        errorMessage,
        completedAt: new Date().toISOString(),
      })
      .where(eq(pocIdempotencyKey.idempotencyKey, idempotencyKey))
      .returning();

    if (!updated) {
      throw new Error(`Idempotency record not found: ${idempotencyKey}`);
    }
    return updated;
  }

  async getIdempotencyRecord(
    idempotencyKey: string
  ): Promise<PocIdempotencyKeyRecord | null> {
    const [record] = await this.db
      .select()
      .from(pocIdempotencyKey)
      .where(eq(pocIdempotencyKey.idempotencyKey, idempotencyKey))
      .limit(1);
    return record ?? null;
  }
}
