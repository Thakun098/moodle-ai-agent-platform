import { createHash } from "node:crypto";
import { extname } from "node:path";
import {
  validateNormalizedSyllabus,
  type NormalizedSyllabus,
} from "@moodle-agent-poc/contracts";
import { SyllabusIngestionError } from "./errors/ingestion-errors.js";
import { extractDocxSyllabus } from "./extractors/docx-extractor.js";
import { extractMarkdownSyllabus } from "./extractors/markdown-extractor.js";
import { extractPdfSyllabus } from "./extractors/pdf-extractor.js";
import { extractTextSyllabus } from "./extractors/text-extractor.js";
import type { ExtractedDocument, SyllabusInput } from "./types.js";

export const MAX_SYLLABUS_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_SYLLABUS_COURSE_PERIODS = 10;

const EXT_TO_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
};

const MIME_TO_EXTS: Record<string, string[]> = {
  "text/plain": [".txt", ".md", ".markdown"],
  "text/markdown": [".md", ".markdown"],
  "text/x-markdown": [".md", ".markdown"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/pdf": [".pdf"],
};

export function detectMediaType(filename: string, explicitMediaType?: string): string {
  const ext = extname(filename).toLowerCase();
  const rawMime = explicitMediaType?.toLowerCase().trim();

  // If explicit known MIME is provided, verify it does not conflict (P4-D8)
  if (rawMime && rawMime !== "application/octet-stream" && MIME_TO_EXTS[rawMime]) {
    const allowedExts = MIME_TO_EXTS[rawMime];
    if (allowedExts && !allowedExts.includes(ext)) {
      throw new SyllabusIngestionError(
        "UNSUPPORTED_FILE_TYPE",
        `File type mismatch: filename "${filename}" extension does not match MIME type "${explicitMediaType}".`
      );
    }
    return rawMime;
  }

  // Fall back to extension-based detection for generic/missing MIME
  return EXT_TO_MIME[ext] ?? "application/octet-stream";
}

export async function ingestSyllabus(
  input: SyllabusInput
): Promise<NormalizedSyllabus> {
  if (!input.content || input.content.length === 0) {
    throw new SyllabusIngestionError(
      "EMPTY_CONTENT",
      "Uploaded syllabus file contains 0 bytes."
    );
  }

  if (input.content.length > MAX_SYLLABUS_FILE_SIZE) {
    throw new SyllabusIngestionError(
      "FILE_TOO_LARGE",
      `Uploaded syllabus file exceeds maximum allowed size of 10 MB (size: ${input.content.length} bytes).`
    );
  }

  const ext = extname(input.filename).toLowerCase();
  if (!EXT_TO_MIME[ext]) {
    throw new SyllabusIngestionError(
      "UNSUPPORTED_FILE_TYPE",
      `Unsupported syllabus file type: "${input.filename}". Allowed formats: .txt, .md, .docx, .pdf`
    );
  }

  const mediaType = detectMediaType(input.filename, input.mediaType);
  const sha256 = createHash("sha256").update(input.content).digest("hex");

  let extracted: ExtractedDocument;

  if (ext === ".txt") {
    extracted = extractTextSyllabus(input);
  } else if (ext === ".md" || ext === ".markdown") {
    extracted = extractMarkdownSyllabus(input);
  } else if (ext === ".docx") {
    extracted = await extractDocxSyllabus(input);
  } else if (ext === ".pdf") {
    extracted = await extractPdfSyllabus(input);
  } else {
    throw new SyllabusIngestionError(
      "UNSUPPORTED_FILE_TYPE",
      `Unsupported syllabus file type: "${input.filename}". Allowed formats: .txt, .md, .docx, .pdf`
    );
  }

  const normalized: NormalizedSyllabus = {
    schema_version: "0.1",
    ...(extracted.course_title ? { course_title: extracted.course_title } : {}),
    ...(extracted.course_code ? { course_code: extracted.course_code } : {}),
    ...(extracted.course_description ? { course_description: extracted.course_description } : {}),
    learning_objectives: extracted.learning_objectives ?? [],
    schedule_or_topics: extracted.schedule_or_topics ?? [],
    ...(extracted.assessment_text ? { assessment_text: extracted.assessment_text } : {}),
    raw_text: extracted.raw_text,
    metadata: {
      filename: input.filename,
      media_type: mediaType,
      byte_size: input.content.length,
      sha256,
    },
  };

  // Deterministic guard: a substantial, machine-readable PDF must not reach
  // planning with an effectively empty normalized structure.
  if (
    ext === ".pdf" &&
    normalized.raw_text.trim().length >= 100 &&
    !normalized.course_title &&
    normalized.learning_objectives.length === 0 &&
    normalized.schedule_or_topics.length === 0
  ) {
    throw new SyllabusIngestionError(
      "NORMALIZATION_INCOMPLETE",
      "PDF text was extracted, but no recognizable course structure was found."
    );
  }

  if (normalized.schedule_or_topics.length > MAX_SYLLABUS_COURSE_PERIODS) {
    throw new SyllabusIngestionError("COURSE_PERIOD_LIMIT_EXCEEDED",
      `Syllabus contains ${normalized.schedule_or_topics.length} course periods; the maximum is ${MAX_SYLLABUS_COURSE_PERIODS}.`,
      { observed: normalized.schedule_or_topics.length, max: MAX_SYLLABUS_COURSE_PERIODS });
  }
  const validation = validateNormalizedSyllabus(normalized);
  if (!validation.valid) {
    const errorMsg = validation.errors
      .map((err) => `${err.instancePath || "/"}: ${err.message}`)
      .join("; ");
    throw new SyllabusIngestionError(
      "INVALID_SCHEMA",
      `Extracted syllabus failed contract validation: ${errorMsg}`,
      validation.errors
    );
  }

  return normalized;
}
