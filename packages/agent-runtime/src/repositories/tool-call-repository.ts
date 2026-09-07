import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  pocToolCall,
  type NewPocToolCallRecord,
  type PocToolCallRecord,
  type PocToolCallStatus,
} from "../db/schema/tool-calls.js";

export class ToolCallRepository {
  constructor(private readonly db: AppDatabase) {}

  async recordToolCall(data: {
    id: string;
    toolCallId: string;
    runId: string;
    stepNumber: number;
    toolName: string;
    arguments: Record<string, unknown>;
    normalizedResult?: unknown;
    status: PocToolCallStatus;
    durationMs?: number;
    error?: string;
  }): Promise<PocToolCallRecord> {
    const insertData: NewPocToolCallRecord = {
      id: data.id,
      toolCallId: data.toolCallId,
      runId: data.runId,
      stepNumber: data.stepNumber,
      toolName: data.toolName,
      arguments: data.arguments,
      normalizedResult: data.normalizedResult ?? null,
      status: data.status,
      durationMs: data.durationMs ?? null,
      error: data.error ?? null,
    };
    const [created] = await this.db.insert(pocToolCall).values(insertData).returning();
    if (!created) {
      throw new Error(`Failed to record tool call ${data.toolCallId}`);
    }
    return created;
  }

  async getToolCall(toolCallId: string): Promise<PocToolCallRecord | null> {
    const [record] = await this.db
      .select()
      .from(pocToolCall)
      .where(eq(pocToolCall.toolCallId, toolCallId))
      .limit(1);
    return record ?? null;
  }

  async listRunToolCalls(runId: string): Promise<PocToolCallRecord[]> {
    return this.db
      .select()
      .from(pocToolCall)
      .where(eq(pocToolCall.runId, runId))
      .orderBy(asc(pocToolCall.stepNumber), asc(pocToolCall.createdAt));
  }
}
