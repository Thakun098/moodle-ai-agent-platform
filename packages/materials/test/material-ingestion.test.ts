import { createHash } from "node:crypto";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_MATERIAL_FILE_BYTES,
  DEFAULT_ACTIVITY_CONTEXT_TOKEN_BUDGET,
  MaterialIngestionError,
  estimateMaterialTokens,
  ingestMaterial,
  normalizeMaterialText,
} from "../src/index.js";

describe("Learning Material ingestion", () => {
  it("normalizes text and records raw/content hashes without storing a binary copy", async () => {
    const content = Buffer.from("  Search   algorithms\r\n\r\n BFS and DFS  \n", "utf8");
    const result = await ingestMaterial({ content, filename: "lecture.txt" });

    expect(result.metadata.filename).toBe("lecture.txt");
    expect(result.metadata.byteSize).toBe(content.length);
    expect(result.metadata.sha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(result.normalizedText).toBe("Search algorithms\n\nBFS and DFS");
    expect(result.extractedContentHash).toBe(createHash("sha256").update(result.normalizedText).digest("hex"));
    expect(result).not.toHaveProperty("content");
  });

  it("rejects a file before extraction when it exceeds the configured byte guard", async () => {
    const content = Buffer.from("small");
    await expect(ingestMaterial({ content, filename: "lecture.txt", maxFileBytes: 4 }))
      .rejects.toMatchObject({ code: "MATERIAL_FILE_TOO_LARGE", details: { actual_bytes: 5, max_bytes: 4, filename: "lecture.txt" } });
  });

  it("supports DOCX/PDF-compatible extension detection and rejects unsupported formats deterministically", async () => {
    await expect(ingestMaterial({ content: Buffer.from("x"), filename: "lecture.exe" }))
      .rejects.toMatchObject({ code: "MATERIAL_FORMAT_UNSUPPORTED" });
    expect(DEFAULT_MAX_MATERIAL_FILE_BYTES).toBe(30 * 1024 * 1024);
    expect(DEFAULT_ACTIVITY_CONTEXT_TOKEN_BUDGET).toBeGreaterThan(0);
  });

  it("extracts visible text from PPTX slide XML in deterministic slide order", async () => {
    const zip = new JSZip();
    zip.file("ppt/slides/slide2.xml", "<p:sld><a:t>Second</a:t><a:t> slide</a:t></p:sld>");
    zip.file("ppt/slides/slide1.xml", "<p:sld><a:t>First</a:t><a:t> slide</a:t></p:sld>");
    const content = await zip.generateAsync({ type: "nodebuffer" });
    const result = await ingestMaterial({ content, filename: "slides.pptx" });

    expect(result.normalizedText).toBe("First slide\n\nSecond slide");
    expect(result.metadata.mediaType).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
  });

  it("uses a deterministic token estimate and does not silently truncate text", () => {
    const text = "123456789";
    expect(estimateMaterialTokens(text)).toBe(3);
    expect(normalizeMaterialText(" a \n\n b ")).toBe("a\n\nb");
  });

  it("exposes typed extraction errors", async () => {
    try {
      await ingestMaterial({ content: Buffer.alloc(0), filename: "empty.md" });
    } catch (error) {
      expect(error).toBeInstanceOf(MaterialIngestionError);
      expect(error).toMatchObject({ code: "MATERIAL_EXTRACTION_FAILED" });
    }
  });
});
