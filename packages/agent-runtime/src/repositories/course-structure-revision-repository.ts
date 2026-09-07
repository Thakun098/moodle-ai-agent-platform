import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { AppDatabase } from "../db/connection.js";
import {
  courseStructureRevision,
  type CourseStructureRevisionRecord,
  type CourseStructureValidationStatus,
  type NewCourseStructureRevisionRecord,
} from "../db/schema/course-structure-revisions.js";

export interface SaveCourseStructureRevisionInput {
  id: string;
  runId: string;
  revision: number;
  title: string;
  summary: string;
  content: Record<string, unknown>;
  teacherConstraintsJson?: Record<string, unknown>;
  validationStatus: CourseStructureValidationStatus;
  validationErrors?: unknown;
  createdAt?: string;
}

export class CourseStructureRevisionRepository {
  constructor(private readonly db: AppDatabase) {}

  async saveRevision(data: SaveCourseStructureRevisionInput): Promise<CourseStructureRevisionRecord> {
    const insertData: NewCourseStructureRevisionRecord = {
      id: data.id,
      runId: data.runId,
      revision: data.revision,
      title: data.title,
      summary: data.summary,
      contentJson: data.content,
      teacherConstraintsJson: data.teacherConstraintsJson ?? { activityRules: [], warnings: [] },
      validationStatus: data.validationStatus,
      validationErrors: data.validationErrors ?? null,
      ...(data.createdAt ? { createdAt: data.createdAt } : {}),
    };
    const [created] = await this.db.insert(courseStructureRevision).values(insertData).returning();
    if (!created) {
      throw new Error(`Failed to save course structure revision ${data.runId}/${data.revision}`);
    }
    return created;
  }

  async getRevision(runId: string, revision: number): Promise<CourseStructureRevisionRecord | null> {
    const [record] = await this.db
      .select()
      .from(courseStructureRevision)
      .where(and(eq(courseStructureRevision.runId, runId), eq(courseStructureRevision.revision, revision)))
      .limit(1);
    return record ?? null;
  }

  async getLatestRevision(runId: string): Promise<CourseStructureRevisionRecord | null> {
    const [record] = await this.db
      .select()
      .from(courseStructureRevision)
      .where(eq(courseStructureRevision.runId, runId))
      .orderBy(desc(courseStructureRevision.revision))
      .limit(1);
    return record ?? null;
  }

  async getSealedRevision(runId: string): Promise<CourseStructureRevisionRecord | null> {
    const [record] = await this.db
      .select()
      .from(courseStructureRevision)
      .where(and(eq(courseStructureRevision.runId, runId), isNotNull(courseStructureRevision.sealedAt)))
      .orderBy(desc(courseStructureRevision.revision))
      .limit(1);
    return record ?? null;
  }

  async listRevisions(runId: string): Promise<CourseStructureRevisionRecord[]> {
    return this.db
      .select()
      .from(courseStructureRevision)
      .where(eq(courseStructureRevision.runId, runId))
      .orderBy(desc(courseStructureRevision.revision));
  }

  async unsealRevisions(runId: string): Promise<void> {
    await this.db
      .update(courseStructureRevision)
      .set({ sealedAt: null, sealedByMoodleUserId: null })
      .where(eq(courseStructureRevision.runId, runId));
  }

  async sealRevision(data: {
    runId: string;
    revision: number;
    moodleUserId?: number;
    sealedAt?: string;
  }): Promise<CourseStructureRevisionRecord> {
    return this.db.transaction(async (tx) => {
      const target = await tx
        .select()
        .from(courseStructureRevision)
        .where(and(eq(courseStructureRevision.runId, data.runId), eq(courseStructureRevision.revision, data.revision)))
        .limit(1);
      if (!target[0]) {
        throw new Error(`Course structure revision ${data.runId}/${data.revision} not found`);
      }
      if (target[0].validationStatus !== "valid") {
        throw new Error(`Cannot seal invalid course structure revision ${data.runId}/${data.revision}`);
      }

      await tx
        .update(courseStructureRevision)
        .set({ sealedAt: null, sealedByMoodleUserId: null })
        .where(eq(courseStructureRevision.runId, data.runId));

      const [sealed] = await tx
        .update(courseStructureRevision)
        .set({
          sealedAt: data.sealedAt ?? new Date().toISOString(),
          sealedByMoodleUserId: data.moodleUserId ?? null,
        })
        .where(and(eq(courseStructureRevision.runId, data.runId), eq(courseStructureRevision.revision, data.revision)))
        .returning();
      if (!sealed) {
        throw new Error(`Failed to seal course structure revision ${data.runId}/${data.revision}`);
      }
      return sealed;
    });
  }
}

export type { CourseStructureRevisionRecord };
