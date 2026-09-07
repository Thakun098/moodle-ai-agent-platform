import { describe, expect, it, vi } from "vitest";
import {
  extractPdfTextWithFallback,
  type PdfTextExtraction,
  type PdfTextExtractionEngine,
} from "../src/extractors/pdf-extractor.js";

function extraction(engine: string, text: string): PdfTextExtraction {
  return {
    engine,
    rawText: text,
    pageTextMap: [{ pageNumber: 1, text }],
    pageCount: 1,
  };
}

function engine(name: string, result: PdfTextExtraction | Error): PdfTextExtractionEngine & { extract: ReturnType<typeof vi.fn> } {
  return {
    name,
    extract: vi.fn().mockImplementation(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

const readable = "สัปดาห์ที่ 1 บทนำสู่ C# และ OOP Console.WriteLine ใช้แสดงผลข้อความบนหน้าจอ";

describe("PDF extraction engine fallback", () => {
  it("uses PDFium primary and does not call fallback when primary text is usable", async () => {
    const primary = engine("pdfium", extraction("pdfium", readable));
    const fallback = engine("pdfjs", extraction("pdfjs", `${readable} fallback`));

    const result = await extractPdfTextWithFallback(Buffer.from("pdf"), [primary, fallback]);

    expect(result.engine).toBe("pdfium");
    expect(primary.extract).toHaveBeenCalledTimes(1);
    expect(fallback.extract).not.toHaveBeenCalled();
  });

  it("falls back to PDF.js when PDFium throws", async () => {
    const primary = engine("pdfium", new Error("pdfium failed"));
    const fallback = engine("pdfjs", extraction("pdfjs", readable));

    const result = await extractPdfTextWithFallback(Buffer.from("pdf"), [primary, fallback]);

    expect(result.engine).toBe("pdfjs");
    expect(fallback.extract).toHaveBeenCalledTimes(1);
  });

  it("falls back when primary text contains unsafe character mappings", async () => {
    const primary = engine("pdfium", extraction("pdfium", `${readable}\u0000broken`));
    const fallback = engine("pdfjs", extraction("pdfjs", readable));

    const result = await extractPdfTextWithFallback(Buffer.from("pdf"), [primary, fallback]);

    expect(result.engine).toBe("pdfjs");
  });

  it("returns a sanitized typed extraction failure when every engine produces unsafe text", async () => {
    const primary = engine("pdfium", extraction("pdfium", `${readable}\u0000`));
    const fallback = engine("pdfjs", extraction("pdfjs", `${readable}\uFFFD`));

    await expect(extractPdfTextWithFallback(Buffer.from("pdf"), [primary, fallback]))
      .rejects.toMatchObject({
        name: "SyllabusIngestionError",
        code: "EXTRACTION_FAILED",
        message: "The PDF text layer contains invalid character mappings and cannot be used safely for extraction.",
        details: null,
      });
  });

  it("preserves the sanitized corrupt-PDF contract when every engine fails to open the file", async () => {
    const primary = engine("pdfium", new Error("pdfium internal error"));
    const fallback = engine("pdfjs", new Error("pdfjs internal error"));

    await expect(extractPdfTextWithFallback(Buffer.from("pdf"), [primary, fallback]))
      .rejects.toMatchObject({
        name: "SyllabusIngestionError",
        code: "EXTRACTION_FAILED",
        message: "The uploaded PDF file could not be read.",
        details: null,
      });
  });

  it("returns OCR_REQUIRED with sanitized details when engines can read the PDF but machine-readable text is insufficient", async () => {
    const primary = engine("pdfium", extraction("pdfium", "สั้น"));
    const fallback = engine("pdfjs", extraction("pdfjs", "short"));

    await expect(extractPdfTextWithFallback(Buffer.from("pdf"), [primary, fallback]))
      .rejects.toMatchObject({ name: "SyllabusIngestionError", code: "OCR_REQUIRED", details: null });
  });
});
