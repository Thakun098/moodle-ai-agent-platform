import type { SyllabusSourceLocation } from "@moodle-agent-poc/contracts";
import { openPdf } from "clawpdf";
import { PDFParse } from "pdf-parse";
import { SyllabusIngestionError } from "../errors/ingestion-errors.js";
import { normalizeTextSections } from "../normalizer/deterministic-normalizer.js";
import type { ExtractedDocument, SyllabusInput } from "../types.js";

const MIN_MACHINE_READABLE_TEXT_LENGTH = 50;

export interface PdfTextQualityReport {
  readonly usable: boolean;
  readonly nulCharacters: number;
  readonly invalidControlCharacters: number;
  readonly replacementCharacters: number;
}

export interface PdfPageText {
  readonly pageNumber: number;
  readonly text: string;
}

export interface PdfTextExtraction {
  readonly engine: string;
  readonly rawText: string;
  readonly pageTextMap: readonly PdfPageText[];
  readonly pageCount: number;
}

export interface PdfTextExtractionEngine {
  readonly name: string;
  extract(content: Buffer): Promise<PdfTextExtraction>;
}

type PdfExtractionOutcome = "error" | "invalid_text" | "insufficient_text";

interface PdfExtractionAttempt {
  readonly engine: string;
  readonly outcome: PdfExtractionOutcome;
}

export function inspectPdfTextQuality(value: string): PdfTextQualityReport {
  let nulCharacters = 0;
  let invalidControlCharacters = 0;
  let replacementCharacters = 0;

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (character === "\u0000") {
      nulCharacters += 1;
      continue;
    }
    if (character === "\uFFFD") {
      replacementCharacters += 1;
      continue;
    }
    if ((code >= 0x01 && code <= 0x08) || code === 0x0b || code === 0x0c || (code >= 0x0e && code <= 0x1f)) {
      invalidControlCharacters += 1;
    }
  }

  return {
    usable: nulCharacters === 0 && invalidControlCharacters === 0 && replacementCharacters === 0,
    nulCharacters,
    invalidControlCharacters,
    replacementCharacters,
  };
}

export const pdfiumTextEngine: PdfTextExtractionEngine = {
  name: "pdfium-clawpdf",
  async extract(content: Buffer): Promise<PdfTextExtraction> {
    const document = await openPdf(content);
    try {
      const pageCount = document.pageCount;
      const pageTextMap: PdfPageText[] = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        pageTextMap.push({ pageNumber, text: document.page(pageNumber).text() ?? "" });
      }
      return {
        engine: this.name,
        rawText: pageTextMap.map((page) => page.text).join("\n\n"),
        pageTextMap,
        pageCount,
      };
    } finally {
      document.destroy();
    }
  },
};

export const pdfJsTextEngine: PdfTextExtractionEngine = {
  name: "pdfjs-pdf-parse",
  async extract(content: Buffer): Promise<PdfTextExtraction> {
    let parser: PDFParse | null = null;
    try {
      parser = new PDFParse({ data: content });
      const textResult = await parser.getText();
      const pageTextMap: PdfPageText[] = Array.isArray(textResult.pages)
        ? textResult.pages.map((page) => ({ pageNumber: page.num, text: page.text ?? "" }))
        : [];
      return {
        engine: this.name,
        rawText: textResult.text ?? "",
        pageTextMap,
        pageCount: pageTextMap.length,
      };
    } finally {
      if (parser) await parser.destroy().catch(() => {});
    }
  },
};

export async function extractPdfTextWithFallback(
  content: Buffer,
  engines: readonly PdfTextExtractionEngine[] = [pdfiumTextEngine, pdfJsTextEngine],
): Promise<PdfTextExtraction> {
  const attempts: PdfExtractionAttempt[] = [];
  let sawReadableButInsufficientText = false;

  for (const engine of engines) {
    let extraction: PdfTextExtraction;
    try {
      extraction = await engine.extract(content);
    } catch {
      attempts.push({ engine: engine.name, outcome: "error" });
      continue;
    }

    const quality = inspectPdfTextQuality(extraction.rawText);
    if (!quality.usable) {
      attempts.push({ engine: engine.name, outcome: "invalid_text" });
      continue;
    }

    const trimmedLength = extraction.rawText.trim().length;
    if (trimmedLength < MIN_MACHINE_READABLE_TEXT_LENGTH) {
      sawReadableButInsufficientText = true;
      attempts.push({ engine: engine.name, outcome: "insufficient_text" });
      continue;
    }

    return extraction;
  }

  if (sawReadableButInsufficientText) {
    throw new SyllabusIngestionError(
      "OCR_REQUIRED",
      "PDF contains insufficient machine-readable text and appears to be a scanned image. OCR is required.",
      null,
    );
  }

  if (attempts.length > 0 && attempts.every((attempt) => attempt.outcome === "error")) {
    throw new SyllabusIngestionError(
      "EXTRACTION_FAILED",
      "The uploaded PDF file could not be read.",
      null,
    );
  }

  throw new SyllabusIngestionError(
    "EXTRACTION_FAILED",
    "The PDF text layer contains invalid character mappings and cannot be used safely for extraction.",
    null,
  );
}

export async function extractPdfSyllabus(
  input: SyllabusInput,
): Promise<ExtractedDocument> {
  let extraction: PdfTextExtraction;
  try {
    extraction = await extractPdfTextWithFallback(input.content);
  } catch (error) {
    if (error instanceof SyllabusIngestionError) throw error;
    throw new SyllabusIngestionError(
      "EXTRACTION_FAILED",
      "The uploaded PDF file could not be read.",
      null,
      { cause: error },
    );
  }

  const findPageForLine = (lineNumber: number): number => {
    let accumulatedLines = 0;
    for (const page of extraction.pageTextMap) {
      accumulatedLines += page.text.split(/\r?\n/).length;
      if (lineNumber <= accumulatedLines) return page.pageNumber;
    }
    return extraction.pageCount || 1;
  };

  const createLocation = (startLine: number): SyllabusSourceLocation => ({
    kind: "page",
    page: findPageForLine(startLine),
  });

  return normalizeTextSections(extraction.rawText, createLocation);
}
