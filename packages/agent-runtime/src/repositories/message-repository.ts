import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  pocMessage,
  type NewPocMessageRecord,
  type PocMessageRecord,
  type PocMessageRole,
} from "../db/schema/messages.js";

export class MessageRepository {
  constructor(private readonly db: AppDatabase) {}

  async appendMessage(data: {
    id: string;
    runId: string;
    stepNumber: number;
    role: PocMessageRole;
    content: string;
    toolCalls?: unknown;
    metadata?: unknown;
  }): Promise<PocMessageRecord> {
    const insertData: NewPocMessageRecord = {
      id: data.id,
      runId: data.runId,
      stepNumber: data.stepNumber,
      role: data.role,
      content: data.content,
      toolCalls: data.toolCalls ?? null,
      metadata: data.metadata ?? null,
    };
    const [created] = await this.db.insert(pocMessage).values(insertData).returning();
    if (!created) {
      throw new Error(`Failed to append message for run ${data.runId}`);
    }
    return created;
  }

  async listRunMessages(runId: string): Promise<PocMessageRecord[]> {
    return this.db
      .select()
      .from(pocMessage)
      .where(eq(pocMessage.runId, runId))
      .orderBy(asc(pocMessage.stepNumber), asc(pocMessage.createdAt));
  }
}
