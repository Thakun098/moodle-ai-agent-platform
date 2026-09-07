import { describe, expect, it } from "vitest";
import { inspectPdfTextQuality } from "../src/extractors/pdf-extractor.js";

describe("PDF text-layer quality guard", () => {
  it("accepts normal Thai, Latin, digits, punctuation, and whitespace", () => {
    const report = inspectPdfTextQuality("สัปดาห์ที่ 1: C# และ OOP\nConsole.WriteLine(\"Hello World\");\n");
    expect(report).toEqual({
      usable: true,
      nulCharacters: 0,
      invalidControlCharacters: 0,
      replacementCharacters: 0,
    });
  });

  it("rejects NUL characters produced by broken PDF font mappings", () => {
    const report = inspectPdfTextQuality("สัปดาห์ที่ 1 \u0000\u0000 C#");
    expect(report.usable).toBe(false);
    expect(report.nulCharacters).toBe(2);
  });

  it("rejects replacement and invalid C0 control characters instead of persisting degraded text", () => {
    const report = inspectPdfTextQuality("หัวข้อ \uFFFD bad\u0007text");
    expect(report.usable).toBe(false);
    expect(report.replacementCharacters).toBe(1);
    expect(report.invalidControlCharacters).toBe(1);
  });
});
