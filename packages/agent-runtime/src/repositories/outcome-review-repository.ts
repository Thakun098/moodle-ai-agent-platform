import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  outcomeReviewStates,
  type OutcomeReviewItemType,
  type OutcomeReviewStateRecord,
  type OutcomeReviewStatus,
} from "../db/schema/outcome-review-states.js";

export class OutcomeReviewRepository {
  constructor(private readonly db: AppDatabase) {}

  async list(runId: string): Promise<OutcomeReviewStateRecord[]> {
    return this.db.select().from(outcomeReviewStates).where(eq(outcomeReviewStates.runId, runId));
  }

  async get(runId: string, itemType: OutcomeReviewItemType, itemId: string): Promise<OutcomeReviewStateRecord | null> {
    const [record] = await this.db.select().from(outcomeReviewStates).where(and(
      eq(outcomeReviewStates.runId, runId),
      eq(outcomeReviewStates.itemType, itemType),
      eq(outcomeReviewStates.itemId, itemId),
    )).limit(1);
    return record ?? null;
  }

  async upsert(value: {
    runId: string;
    itemType: OutcomeReviewItemType;
    itemId: string;
    status: OutcomeReviewStatus;
    draftText: string | null;
    updatedByMoodleUserId: string | null;
  }): Promise<OutcomeReviewStateRecord> {
    const [record] = await this.db.insert(outcomeReviewStates).values({
      ...value,
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: [outcomeReviewStates.runId, outcomeReviewStates.itemType, outcomeReviewStates.itemId],
      set: {
        status: value.status,
        draftText: value.draftText,
        updatedByMoodleUserId: value.updatedByMoodleUserId,
        updatedAt: new Date().toISOString(),
      },
    }).returning();
    if (!record) throw new Error(`Failed to persist Outcome review for ${value.itemType}:${value.itemId}`);
    return record;
  }
}
