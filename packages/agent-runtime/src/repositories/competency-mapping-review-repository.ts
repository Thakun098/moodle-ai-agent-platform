import { and, desc, eq, isNotNull } from "drizzle-orm";
import { createHash } from "node:crypto";
import type { AppDatabase } from "../db/connection.js";
import { pocRun, activityIntent, competencyCandidate, coreCourseDesignContexts, courseStructureRevision, materialSnapshot, competencyMappingReview } from "../db/schema/index.js";
import type { ActivityIntentRecord, CompetencyCandidateRecord } from "../db/schema/index.js";
import type { CoreCourseDesignContext } from "@moodle-agent-poc/contracts";

export interface MappingReviewSources {
  activities: ActivityIntentRecord[];
  competencies: CompetencyCandidateRecord[];
  context: CoreCourseDesignContext | null;
  structureRevision: number | null;
  materialIds: Record<string, string>;
}

function canonical(value: unknown): string {
  function sort(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(sort);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sort(v)]));
    return item;
  }
  return JSON.stringify(sort(value));
}

/** Opaque 31-bit CAS token; changes whenever the persisted revision or projected authority changes. */
function reviewToken(revision: number, mappings: unknown): number {
  const digest = createHash("sha256").update(canonical({ revision, mappings })).digest("hex");
  return (Number.parseInt(digest.slice(0, 8), 16) & 0x7fffffff) || 1;
}
export class CompetencyMappingReviewRepository {
  constructor(private readonly db: AppDatabase) {}

  /** Serialize decisions per run, holding source-row locks through validation/publication. */
  async review<T extends object>(runId: string,
    project: (sources: MappingReviewSources, saved: T[], revision: number, applyDecision: boolean) => T[],
    mutation = false,
  ): Promise<{ revision: number; mappings: T[] }> {
    return this.db.transaction(async tx => {
      const [run] = await tx.select().from(pocRun).where(eq(pocRun.runId, runId)).for("update");
      if (!run) throw Object.assign(new Error("Run not found."), { code: "NOT_FOUND" });
      if (mutation && ["executing", "awaiting_verification", "completed"].includes(run.status)) throw Object.assign(new Error("Mapping decisions are only available before execution."), { code: "MAPPING_STATE_INVALID" });
      const [structure] = await tx.select().from(courseStructureRevision).where(and(eq(courseStructureRevision.runId, runId), isNotNull(courseStructureRevision.sealedAt))).for("share");
      const activities = await tx.select().from(activityIntent).where(eq(activityIntent.runId, runId)).for("share");
      const competencies = await tx.select().from(competencyCandidate).where(eq(competencyCandidate.runId, runId)).for("share");
      const [context] = await tx.select().from(coreCourseDesignContexts).where(eq(coreCourseDesignContexts.runId, runId)).orderBy(desc(coreCourseDesignContexts.revision)).limit(1).for("share");
      const materials = structure ? await tx.select().from(materialSnapshot).where(and(eq(materialSnapshot.runId, runId), eq(materialSnapshot.structureRevision, structure.revision))).orderBy(desc(materialSnapshot.revision)).for("share") : [];
      const materialIds: Record<string, string> = {};
      for (const material of materials) materialIds[material.sectionRef] ??= material.id;
      const [saved] = await tx.select().from(competencyMappingReview).where(eq(competencyMappingReview.runId, runId));
      const sources = { activities, competencies, context: context?.context ?? null, structureRevision: structure?.revision ?? null, materialIds };
      const savedMappings = (saved?.decisions ?? []) as T[];
      const savedRevision = saved?.revision ?? 0;
      const projected = project(sources, savedMappings, savedRevision, false);
      const projectedRevision = reviewToken(savedRevision, projected);
      // GET projects current authority without publishing it or clearing Course approval.
      if (!mutation) return { revision: projectedRevision, mappings: projected };
      const mappings = project(sources, savedMappings, projectedRevision, true);
      const changed = canonical(savedMappings) !== canonical(mappings);
      const storedRevision = savedRevision + (changed ? 1 : 0);
      const revision = reviewToken(storedRevision, mappings);
      if (changed) {
        await tx.insert(competencyMappingReview).values({ runId, revision: storedRevision, decisions: mappings as Record<string, unknown>[] }).onConflictDoUpdate({ target: competencyMappingReview.runId, set: { revision: storedRevision, decisions: mappings as Record<string, unknown>[], updatedAt: new Date().toISOString() } });
        // A prior approval cannot silently authorize a later mapping/evidence decision.
        await tx.update(pocRun).set({
          ...(mutation ? { status: "planning" as const, error: null } : {}),
          approvedPlanId: null,
          approvedRevision: null,
          approvedAt: null,
          approvedByMoodleUserId: null,
          updatedAt: new Date().toISOString(),
        }).where(eq(pocRun.runId, runId));
      }
      return { revision, mappings };
    });
  }
}
