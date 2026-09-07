import { createHash } from "node:crypto";
import type { MaterialIngestionResult, MaterialSnapshot } from "./types.js";

export function createMaterialSnapshot(params: {
  id: string;
  runId: string;
  structureRevision: number;
  sectionRef: string;
  revision: number;
  files: Array<{
    moodleMaterialId: string | number;
    ingestion: MaterialIngestionResult;
    useForGrounding?: boolean;
    publishToCourse?: boolean;
  }>;
  createdByMoodleUserId: number;
  createdAt?: string;
}): MaterialSnapshot {
  const normalizedText = params.files
    .filter((file) => (file.useForGrounding ?? true) && file.ingestion.normalizedText.trim())
    .map((file) => `## ${file.ingestion.metadata.filename}\n${file.ingestion.normalizedText}`)
    .join("\n\n");
  const normalizedTextHash = createHash("sha256").update(normalizedText, "utf8").digest("hex");
  return {
    id: params.id,
    runId: params.runId,
    structureRevision: params.structureRevision,
    sectionRef: params.sectionRef,
    revision: params.revision,
    files: params.files.map((file) => ({
      moodleMaterialId: file.moodleMaterialId,
      filename: file.ingestion.metadata.filename,
      mediaType: file.ingestion.metadata.mediaType,
      byteSize: file.ingestion.metadata.byteSize,
      sha256: file.ingestion.metadata.sha256,
      useForGrounding: file.useForGrounding ?? true,
      publishToCourse: file.publishToCourse ?? false,
      extractionStatus: "success",
      extractedContentHash: file.ingestion.extractedContentHash,
    })),
    extractorVersion: params.files[0]?.ingestion.extractorVersion ?? "materials-text-v1",
    normalizedText,
    normalizedTextHash,
    estimatedTokens: Math.ceil(normalizedText.length / 4),
    createdByMoodleUserId: params.createdByMoodleUserId,
    createdAt: params.createdAt ?? new Date().toISOString(),
  };
}
