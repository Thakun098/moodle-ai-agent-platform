import type { SourceReference } from "@moodle-agent-poc/contracts";

export interface MaterialInput {
  content: Buffer;
  filename: string;
  mediaType?: string;
  maxFileBytes?: number;
}

export interface MaterialFileMetadata {
  filename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
}

export interface MaterialIngestionResult {
  metadata: MaterialFileMetadata;
  normalizedText: string;
  extractorVersion: string;
  extractedContentHash: string;
  estimatedTokens: number;
}

export interface MaterialSnapshotFile {
  moodleMaterialId: string | number;
  filename: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  useForGrounding: boolean;
  publishToCourse: boolean;
  extractionStatus: "success" | "failed";
  extractedContentHash?: string;
}

export interface MaterialSnapshot {
  id: string;
  runId: string;
  structureRevision: number;
  sectionRef: string;
  revision: number;
  files: MaterialSnapshotFile[];
  extractorVersion: string;
  normalizedText: string;
  normalizedTextHash: string;
  estimatedTokens: number;
  createdByMoodleUserId: number;
  createdAt: string;
}

export interface MaterialContext {
  snapshotId: string;
  sectionRef: string;
  text: string;
  sourceRefs: SourceReference[];
  estimatedTokens: number;
}

export interface MaterialSnapshotReader {
  getSnapshot(snapshotId: string): Promise<MaterialSnapshot | null>;
}
