import type { SyllabusSourceLocation } from "@moodle-agent-poc/contracts";
import mammoth from "mammoth";
import { SyllabusIngestionError } from "../errors/ingestion-errors.js";
import { normalizeItems } from "../normalizer/deterministic-normalizer.js";
import type { ExtractedDocument, SyllabusInput } from "../types.js";

export async function extractDocxSyllabus(
  input: SyllabusInput
): Promise<ExtractedDocument> {
  let rawText = "";

  try {
    const result = await mammoth.extractRawText({ buffer: input.content });
    rawText = result.value ?? "";
  } catch (err: unknown) {
    // R6: Client-safe sanitized error message; details is null; raw error stored in cause for server-side logging
    throw new SyllabusIngestionError(
      "EXTRACTION_FAILED",
      "The uploaded DOCX file could not be read.",
      null,
      { cause: err }
    );
  }

  if (!rawText || rawText.trim().length === 0) {
    throw new SyllabusIngestionError(
      "EMPTY_CONTENT",
      "DOCX file contains no readable text content."
    );
  }

  // R3: Build an explicit sequence of non-empty paragraphs
  const nonEmptyParagraphs = rawText
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (nonEmptyParagraphs.length === 0) {
    throw new SyllabusIngestionError(
      "EMPTY_CONTENT",
      "DOCX file contains no readable text content."
    );
  }

  // R3: 1-based index in the sequence of extracted non-empty paragraphs
  const createLocation = (paragraphIndex: number): SyllabusSourceLocation => ({
    kind: "paragraph",
    paragraph_index: paragraphIndex,
  });

  return normalizeItems(nonEmptyParagraphs, rawText, createLocation);
}
