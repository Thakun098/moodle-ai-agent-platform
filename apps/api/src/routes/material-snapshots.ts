import { randomUUID } from "node:crypto";
import {
  ActivityIntentRepository,
  getDatabase,
  MaterialSnapshotRepository,
  type MaterialSnapshotRecord,
  CourseStructureRevisionRepository,
  RunRepository,
} from "@moodle-agent-poc/agent-runtime";
import {
  createMaterialSnapshot,
  ingestMaterial,
  MaterialIngestionError,
  type MaterialSnapshot,
} from "@moodle-agent-poc/materials";
import type { FastifyPluginAsync } from "fastify";
import type { AppConfig } from "../config/config-loader.js";
import { beginInstructionalDesignMutation } from "../services/instructional-design-run-lifecycle-service.js";

export interface MaterialSnapshotRoutesOptions {
  config: AppConfig;
  runRepo?: RunRepository | undefined;
  snapshotRepo?: MaterialSnapshotRepository | undefined;
  structureRevisionRepo?: CourseStructureRevisionRepository | undefined;
  activityIntentRepo?: ActivityIntentRepository | undefined;
}

function serializeSnapshot(snapshot: MaterialSnapshot) {
  return {
    id: snapshot.id,
    run_id: snapshot.runId,
    structure_revision: snapshot.structureRevision,
    section_ref: snapshot.sectionRef,
    revision: snapshot.revision,
    files: snapshot.files,
    extractor_version: snapshot.extractorVersion,
    normalized_text_hash: snapshot.normalizedTextHash,
    estimated_tokens: snapshot.estimatedTokens,
    created_by_moodle_user_id: snapshot.createdByMoodleUserId,
    created_at: snapshot.createdAt,
  };
}

function toMaterialSnapshot(record: MaterialSnapshotRecord): MaterialSnapshot {
  return {
    id: record.id,
    runId: record.runId,
    structureRevision: record.structureRevision,
    sectionRef: record.sectionRef,
    revision: record.revision,
    files: Array.isArray(record.filesJson) ? record.filesJson as MaterialSnapshot["files"] : [],
    extractorVersion: record.extractorVersion,
    normalizedText: record.normalizedText,
    normalizedTextHash: record.normalizedTextHash,
    estimatedTokens: record.estimatedTokens,
    createdByMoodleUserId: record.createdByMoodleUserId,
    createdAt: record.createdAt,
  };
}

function snapshotContentSignature(snapshot: MaterialSnapshot): string {
  return JSON.stringify(snapshot.files.map((file) => ({
    sha256: file.sha256,
    useForGrounding: file.useForGrounding,
    publishToCourse: file.publishToCourse,
  })).sort((left, right) => left.sha256.localeCompare(right.sha256)));
}

function resourceTitleFromFilename(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return (lastDot > 0 ? filename.slice(0, lastDot) : filename).trim();
}

function plannedResources(snapshot: MaterialSnapshot) {
  return snapshot.files
    .filter((file) => file.publishToCourse && file.extractionStatus === "success")
    .map((file, index) => ({
      ref: `resource-${String(snapshot.sectionRef).replace(/[^a-z0-9]+/giu, "-")}-${String(index + 1).padStart(2, "0")}`,
      type: "resource" as const,
      title: resourceTitleFromFilename(file.filename),
      filename: file.filename,
      moodle_material_id: file.moodleMaterialId,
      source_run_id: snapshot.runId,
      source_structure_revision: snapshot.structureRevision,
      source_section_ref: snapshot.sectionRef,
      source_material_revision: snapshot.revision,
      source_refs: [{ source: file.filename, section: snapshot.sectionRef }],
    }));
}

export const materialSnapshotRoutes: FastifyPluginAsync<MaterialSnapshotRoutesOptions> = async (fastify, options) => {
  const getRunRepo = () => options.runRepo ?? new RunRepository(getDatabase());
  const getSnapshotRepo = () => options.snapshotRepo ?? new MaterialSnapshotRepository(getDatabase());
  const getStructureRepo = () => options.structureRevisionRepo ?? new CourseStructureRevisionRepository(getDatabase());
  const getActivityIntentRepo = () => options.activityIntentRepo ?? new ActivityIntentRepository(getDatabase());

  fastify.post<{ Params: { runId: string; sectionRef: string } }>(
    "/api/runs/:runId/sections/:sectionRef/material-snapshots",
    async (request, reply) => {
      const { runId, sectionRef } = request.params;
      const run = await getRunRepo().getRun(runId);
      if (!run) {
        reply.status(404).send({ error: { code: "NOT_FOUND", message: `Run ${runId} not found`, details: null, request_id: request.id } });
        return;
      }
      const parts = request.parts();
      const uploads: Array<{ content: Buffer; filename: string; mediaType: string }> = [];
      const fields: Record<string, string> = {};
      for await (const part of parts) {
        if (part.type === "file") {
          uploads.push({ content: await part.toBuffer(), filename: part.filename, mediaType: part.mimetype });
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
      if (uploads.length === 0) {
        throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", "At least one sealed Moodle material file is required.", { section_ref: sectionRef });
      }
      const structureRevision = Number(fields.structure_revision);
      const moodleUserId = Number(fields.moodle_user_id);
      if (!Number.isSafeInteger(structureRevision) || structureRevision < 1 || !Number.isSafeInteger(moodleUserId) || moodleUserId < 1) {
        throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", "structure_revision and moodle_user_id must be positive integers.", { section_ref: sectionRef });
      }
      const sealedStructure = await getStructureRepo().getSealedRevision(runId);
      if (!sealedStructure || sealedStructure.revision !== structureRevision) {
        throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", "MaterialSnapshot must use the currently sealed Course Structure revision.", { requested_structure_revision: structureRevision, sealed_structure_revision: sealedStructure?.revision ?? null, section_ref: sectionRef });
      }
      const structureContent = sealedStructure.contentJson;
      const sections = Array.isArray(structureContent.sections) ? structureContent.sections as Array<Record<string, unknown>> : [];
      if (!sections.some((section) => section.ref === sectionRef)) {
        throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", `Section "${sectionRef}" is not part of the sealed Course Structure.`, { section_ref: sectionRef, structure_revision: structureRevision });
      }
      let metadata: unknown = [];
      if (fields.material_metadata) {
        try {
          metadata = JSON.parse(fields.material_metadata) as unknown;
        } catch (error) {
          throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", "material_metadata must be valid JSON.", { section_ref: sectionRef }, { cause: error });
        }
      }
      const metadataList = Array.isArray(metadata) ? metadata : [];
      if (metadataList.length !== uploads.length || metadataList.some((item) => {
        if (typeof item !== "object" || item === null) return true;
        const id = (item as Record<string, unknown>).moodle_material_id;
        return !(typeof id === "string" || typeof id === "number") || String(id).trim() === "";
      })) {
        throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", "Each sealed Moodle material file must include a stable moodle_material_id.", { section_ref: sectionRef, files: uploads.length, metadata: metadataList.length });
      }
      const ingested = await Promise.all(uploads.map((upload) => ingestMaterial({ content: upload.content, filename: upload.filename, mediaType: upload.mediaType, maxFileBytes: options.config.maxMaterialFileBytes })));
      const uniqueFiles: Array<{
        moodleMaterialId: string | number;
        ingestion: Awaited<ReturnType<typeof ingestMaterial>>;
        useForGrounding: boolean;
        publishToCourse: boolean;
      }> = [];
      const seenHashes = new Set<string>();
      for (const [index, ingestion] of ingested.entries()) {
        if (seenHashes.has(ingestion.metadata.sha256)) continue;
        seenHashes.add(ingestion.metadata.sha256);
        const item = metadataList[index];
        const itemRecord = typeof item === "object" && item !== null ? item as Record<string, unknown> : {};
        uniqueFiles.push({
          moodleMaterialId: itemRecord.moodle_material_id as string | number,
          ingestion,
          useForGrounding: itemRecord.use_for_grounding !== false,
          publishToCourse: itemRecord.publish_to_course === true,
        });
      }
      const latest = await getSnapshotRepo().getLatestSnapshot(runId, structureRevision, sectionRef);
      const snapshot = createMaterialSnapshot({
        id: randomUUID(),
        runId,
        structureRevision,
        sectionRef,
        revision: (latest?.revision ?? 0) + 1,
        files: uniqueFiles,
        createdByMoodleUserId: moodleUserId,
      });
      if (latest) {
        const current = toMaterialSnapshot(latest);
        if (current.normalizedTextHash === snapshot.normalizedTextHash && snapshotContentSignature(current) === snapshotContentSignature(snapshot)) {
          reply.send({ run_id: runId, section_ref: sectionRef, snapshot: { ...serializeSnapshot(current), persisted_id: current.id, reused: true }, planned_resources: plannedResources(current) });
          return;
        }
      }
      await beginInstructionalDesignMutation(getRunRepo(), runId);
      const record = await getSnapshotRepo().saveSnapshot({
        id: snapshot.id,
        runId: snapshot.runId,
        structureRevision: snapshot.structureRevision,
        sectionRef: snapshot.sectionRef,
        revision: snapshot.revision,
        files: snapshot.files,
        extractorVersion: snapshot.extractorVersion,
        normalizedText: snapshot.normalizedText,
        normalizedTextHash: snapshot.normalizedTextHash,
        estimatedTokens: snapshot.estimatedTokens,
        createdByMoodleUserId: snapshot.createdByMoodleUserId,
        createdAt: snapshot.createdAt,
      });
      await getActivityIntentRepo().markStaleForSection(runId, structureRevision, sectionRef);
      reply.status(201).send({ run_id: runId, section_ref: sectionRef, snapshot: { ...serializeSnapshot(snapshot), persisted_id: record.id }, planned_resources: plannedResources(snapshot) });
    },
  );
};
