import { createHash } from "node:crypto";
import { extname } from "node:path";
import type { SyllabusInput } from "@moodle-agent-poc/syllabus";
import { extractDocxSyllabus, extractPdfSyllabus, SyllabusIngestionError } from "@moodle-agent-poc/syllabus";
import JSZip from "jszip";
import { MaterialIngestionError } from "./errors/material-errors.js";
import type { MaterialIngestionResult, MaterialInput } from "./types.js";

export const DEFAULT_MAX_MATERIAL_FILE_BYTES = 30 * 1024 * 1024;
export const DEFAULT_ACTIVITY_CONTEXT_TOKEN_BUDGET = 16_000;
export const MATERIAL_EXTRACTOR_VERSION = "materials-text-v3";

const EXT_TO_MIME: Record<string, string> = {
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function assertSupportedMediaType(filename: string, mediaType?: string): string {
  const extension = extname(filename).toLowerCase();
  const detected = EXT_TO_MIME[extension];
  if (!detected) {
    throw new MaterialIngestionError(
      "MATERIAL_FORMAT_UNSUPPORTED",
      `Unsupported learning material format: "${filename}".`,
      { filename, supported_extensions: Object.keys(EXT_TO_MIME) },
    );
  }
  if (mediaType && mediaType !== "application/octet-stream" && mediaType.trim() !== detected) {
    throw new MaterialIngestionError(
      "MATERIAL_FORMAT_UNSUPPORTED",
      `Learning material MIME type does not match filename "${filename}".`,
      { filename, media_type: mediaType, expected_media_type: detected },
    );
  }
  return detected;
}

export function normalizeMaterialText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim().replace(/[ \t]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function estimateMaterialTokens(text: string): number {
  const normalizedLength = text.trim().length;
  return normalizedLength === 0 ? 0 : Math.ceil(normalizedLength / 4);
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractPptxText(content: Buffer, filename: string): Promise<string> {
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(content);
  } catch (error) {
    throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", `The PPTX file "${filename}" could not be read.`, null, { cause: error });
  }

  const slideNames = Object.keys(archive.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name) && !archive.files[name]?.dir)
    .sort((left, right) => Number(left.match(/slide(\d+)\.xml$/i)?.[1]) - Number(right.match(/slide(\d+)\.xml$/i)?.[1]));
  const slides: string[] = [];
  for (const slideName of slideNames) {
    const xml = await archive.files[slideName]!.async("text");
    const slideText = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)]
      .map((match) => decodeXmlEntities(match[1] ?? ""))
      .join("");
    if (slideText.trim()) slides.push(slideText);
  }
  return slides.join("\n\n");
}

async function extractMaterialText(input: MaterialInput, mediaType: string): Promise<string> {
  const extension = extname(input.filename).toLowerCase();
  try {
    if (extension === ".txt" || extension === ".md" || extension === ".markdown") {
      return input.content.toString("utf8");
    }
    const syllabusInput: SyllabusInput = {
      content: input.content,
      filename: input.filename,
      mediaType,
    };
    if (extension === ".docx") return (await extractDocxSyllabus(syllabusInput)).raw_text;
    if (extension === ".pdf") return (await extractPdfSyllabus(syllabusInput)).raw_text;
    if (extension === ".pptx") return await extractPptxText(input.content, input.filename);
  } catch (error) {
    if (error instanceof MaterialIngestionError) throw error;
    if (error instanceof SyllabusIngestionError || (error as { name?: string }).name === "SyllabusIngestionError") {
      const syllabusError = error as SyllabusIngestionError;
      throw new MaterialIngestionError(
        "MATERIAL_EXTRACTION_FAILED",
        `Learning material "${input.filename}" could not be extracted safely: ${syllabusError.message}`,
        {
          filename: input.filename,
          extractor_code: syllabusError.code,
          extractor_details: syllabusError.details ?? null,
        },
        { cause: error },
      );
    }
    throw new MaterialIngestionError(
      "MATERIAL_EXTRACTION_FAILED",
      `Learning material "${input.filename}" could not be extracted.`,
      { filename: input.filename },
      { cause: error },
    );
  }
  throw new MaterialIngestionError("MATERIAL_FORMAT_UNSUPPORTED", `Unsupported learning material format: "${input.filename}".`);
}

export async function ingestMaterial(input: MaterialInput): Promise<MaterialIngestionResult> {
  if (!input.content || input.content.length === 0) {
    throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", `Learning material "${input.filename}" is empty.`, { filename: input.filename });
  }
  const maxFileBytes = input.maxFileBytes ?? DEFAULT_MAX_MATERIAL_FILE_BYTES;
  if (input.content.length > maxFileBytes) {
    throw new MaterialIngestionError(
      "MATERIAL_FILE_TOO_LARGE",
      `Learning material file "${input.filename}" exceeds the configured file-size limit.`,
      { filename: input.filename, actual_bytes: input.content.length, max_bytes: maxFileBytes },
    );
  }
  const mediaType = assertSupportedMediaType(input.filename, input.mediaType);
  const rawText = await extractMaterialText(input, mediaType);
  const normalizedText = normalizeMaterialText(rawText);
  if (!normalizedText) {
    throw new MaterialIngestionError("MATERIAL_EXTRACTION_FAILED", `Learning material "${input.filename}" contains no readable text.`, { filename: input.filename });
  }
  const sha256 = createHash("sha256").update(input.content).digest("hex");
  const extractedContentHash = createHash("sha256").update(normalizedText, "utf8").digest("hex");
  return {
    metadata: { filename: input.filename, mediaType, byteSize: input.content.length, sha256 },
    normalizedText,
    extractorVersion: MATERIAL_EXTRACTOR_VERSION,
    extractedContentHash,
    estimatedTokens: estimateMaterialTokens(normalizedText),
  };
}
