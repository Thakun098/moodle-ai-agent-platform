import type { SyllabusSourceLocation } from "@moodle-agent-poc/contracts";
import { SyllabusIngestionError } from "../errors/ingestion-errors.js";
import { normalizeTextSections } from "../normalizer/deterministic-normalizer.js";
import type { ExtractedDocument, SyllabusInput } from "../types.js";

export function extractMarkdownSyllabus(input: SyllabusInput): ExtractedDocument {
  const rawText = input.content.toString("utf8");

  if (!rawText || rawText.trim().length === 0) {
    throw new SyllabusIngestionError(
      "EMPTY_CONTENT",
      "Uploaded markdown syllabus is empty or contains only whitespace."
    );
  }

  const createLocation = (startLine: number, endLine?: number): SyllabusSourceLocation => ({
    kind: "line",
    start_line: startLine,
    ...(endLine && endLine !== startLine ? { end_line: endLine } : {}),
  });

  return normalizeTextSections(rawText, createLocation);
}
