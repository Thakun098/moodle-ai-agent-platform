import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractPdfSyllabus } from "../src/extractors/pdf-extractor.js";
import { describe, expect, it } from "vitest";
import {
  ingestSyllabus,
  MAX_SYLLABUS_FILE_SIZE,
  normalizeTextSections,
  SyllabusIngestionError,
} from "../src/index.js";

// Minimal valid DOCX zip creator helper
function createMinimalDocxBuffer(paragraphs: string[]): Buffer {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("\n    ")}
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const zipEntries: { name: string; content: Buffer }[] = [
    { name: "[Content_Types].xml", content: Buffer.from(contentTypesXml, "utf8") },
    { name: "word/document.xml", content: Buffer.from(docXml, "utf8") },
  ];

  const localHeaders: Buffer[] = [];
  const centralDirs: Buffer[] = [];
  let offset = 0;

  for (const entry of zipEntries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(entry.content.length, 18);
    header.writeUInt32LE(entry.content.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);

    const localPart = Buffer.concat([header, nameBuf, entry.content]);
    localHeaders.push(localPart);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(0, 16);
    cd.writeUInt32LE(entry.content.length, 20);
    cd.writeUInt32LE(entry.content.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30);
    cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34);
    cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);

    centralDirs.push(Buffer.concat([cd, nameBuf]));
    offset += localPart.length;
  }

  const cdBuffer = Buffer.concat(centralDirs);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(zipEntries.length, 8);
  eocd.writeUInt16LE(zipEntries.length, 10);
  eocd.writeUInt32LE(cdBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, cdBuffer, eocd]);
}

const validPdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 120 >>
stream
BT
/F1 12 Tf
100 700 Td
(CS101 Introduction to Artificial Intelligence and Machine Learning Fundamentals.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000395 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
468
%%EOF`;

const scannedPdfString = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>
endobj
4 0 obj
<< /Length 10 >>
stream
q
Q
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000204 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
265
%%EOF`;

function createSimplePdf(text: string): Buffer {
  const stream = `BT\n/F1 12 Tf\n72 720 Td\n(${text.replace(/[()\\]/g, "\\$&")}) Tj\nET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`, "latin1"));
  }
  const xrefOffset = Buffer.concat(chunks).length;
  const xref = ["xref\n0 6\n0000000000 65535 f \n"];
  for (let i = 1; i <= 5; i++) xref.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  chunks.push(Buffer.from(xref.join(""), "latin1"));
  return Buffer.concat(chunks);
}

function createTwoPagePdf(page1Lines: string[], page2Lines: string[]): Buffer {
  const contentStream = (lines: string[]) => lines.map((line, index) =>
    `BT\n/F1 10 Tf\n50 ${740 - index * 18} Td\n(${line.replace(/[()\\]/g, "\\$&")}) Tj\nET\n`
  ).join("");
  const stream1 = contentStream(page1Lines);
  const stream2 = contentStream(page2Lines);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream1, "latin1")} >>\nstream\n${stream1}endstream`,
    `<< /Length ${Buffer.byteLength(stream2, "latin1")} >>\nstream\n${stream2}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const chunks = [Buffer.from("%PDF-1.4\n", "latin1")];
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(Buffer.from(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`, "latin1"));
  }
  const xrefOffset = Buffer.concat(chunks).length;
  const xref = ["xref\n0 8\n0000000000 65535 f \n"];
  for (let i = 1; i <= 7; i++) xref.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  xref.push(`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  chunks.push(Buffer.from(xref.join(""), "latin1"));
  return Buffer.concat(chunks);
}

describe("Syllabus Ingestion Service (packages/syllabus)", () => {
  const fixturesDir = resolve(__dirname, "fixtures");

  describe("T0403 — Markdown Ingestion & T0408 Provenance", () => {
    it("ingests structured markdown syllabus preserving sections, objectives, and line provenance", async () => {
      const content = readFileSync(resolve(fixturesDir, "valid-syllabus.md"));
      const expectedSha256 = createHash("sha256").update(content).digest("hex");

      const result = await ingestSyllabus({
        content,
        filename: "valid-syllabus.md",
      });

      expect(result.schema_version).toBe("0.1");
      expect(result.course_code).toBe("CS101");
      expect(result.course_title).toBe("Introduction to Computer Science");
      expect(result.learning_objectives.length).toBeGreaterThan(0);
      expect(result.schedule_or_topics.length).toBe(3);

      expect(result.schedule_or_topics[0]?.week_or_unit).toBe("Week 1");
      expect(result.schedule_or_topics[0]?.source?.kind).toBe("line");
      expect(result.schedule_or_topics[0]?.source && "start_line" in result.schedule_or_topics[0].source).toBe(true);

      expect(result.metadata.filename).toBe("valid-syllabus.md");
      expect(result.metadata.media_type).toBe("text/markdown");
      expect(result.metadata.byte_size).toBe(content.length);
      expect(result.metadata.sha256).toBe(expectedSha256);
    });
  });

  describe("T0402 — Plain Text Ingestion & Decision P4-D1", () => {
    it("ingests full plain text syllabus with code, title, objectives, and schedule", async () => {
      const content = readFileSync(resolve(fixturesDir, "valid-syllabus.txt"));

      const result = await ingestSyllabus({
        content,
        filename: "valid-syllabus.txt",
      });

      expect(result.schema_version).toBe("0.1");
      expect(result.course_title).toBe("Principles of Software Engineering");
      expect(result.course_code).toBe("SE201");
      expect(result.learning_objectives).toContain("Master version control and Git workflows.");
      expect(result.schedule_or_topics.length).toBe(2);
      expect(result.schedule_or_topics[0]?.source?.kind).toBe("line");
    });

    it("ingests partial plain text without course title (Decision P4-D1)", async () => {
      const content = readFileSync(resolve(fixturesDir, "partial-syllabus.txt"));

      const result = await ingestSyllabus({
        content,
        filename: "partial-syllabus.txt",
      });

      expect(result.schema_version).toBe("0.1");
      expect(result.course_title).toBeUndefined();
      expect(result.schedule_or_topics.length).toBe(3);
      expect(result.schedule_or_topics[0]?.title).toContain("Algorithms Overview");
    });
  });

  describe("Multilingual deterministic normalization", () => {
    it("recognizes Thai headings, preserves Thai week anchors, and captures assessment text", () => {
      const rawText = [
        "ชื่อรายวิชา: การเขียนโปรแกรมภาษา C#",
        "รหัสวิชา: CS231",
        "คำอธิบายรายวิชา:",
        "เรียนรู้พื้นฐานภาษา C# และการพัฒนาโปรแกรมด้วย .NET",
        "ผลลัพธ์การเรียนรู้ของรายวิชา:",
        "1. อธิบายคลาสและอ็อบเจกต์ได้",
        "2. เขียนโปรแกรมด้วย if / else ได้",
        "แผนการสอน 15 สัปดาห์:",
        "สัปดาห์ที่ 1: พื้นฐาน C#",
        "- ตัวแปรและชนิดข้อมูล",
        "สัปดาห์ที่ 2: คลาสและอ็อบเจกต์",
        "- Constructor และเมธอด",
        "การประเมินผล:",
        "งานเขียนโปรแกรม 40%",
      ].join("\n");

      const result = normalizeTextSections(rawText, (startLine, endLine) => ({
        kind: "line",
        start_line: startLine,
        ...(endLine !== undefined ? { end_line: endLine } : {}),
      }));

      expect(result.course_title).toBe("การเขียนโปรแกรมภาษา C#");
      expect(result.course_code).toBe("CS231");
      expect(result.course_description).toContain(".NET");
      expect(result.learning_objectives).toEqual(["อธิบายคลาสและอ็อบเจกต์ได้", "เขียนโปรแกรมด้วย if / else ได้"]);
      expect(result.schedule_or_topics).toHaveLength(2);
      expect(result.schedule_or_topics.map((item) => item.week_or_unit)).toEqual(["สัปดาห์ที่ 1", "สัปดาห์ที่ 2"]);
      expect(result.schedule_or_topics[1]?.topics).toContain("Constructor และเมธอด");
      expect(result.assessment_text).toContain("งานเขียนโปรแกรม 40%");
    });

    it("normalizes numbered Thai schedule tables into page-provenanced week items", () => {
      const rows = Array.from({length: 15}, (_, index) => `${index + 1} | หัวข้อสัปดาห์ที่ ${index + 1} | สาระสำคัญ ${index + 1} | Lab ${index + 1}`);
      const rawText = [
        "ชื่อวิชา: การเขียนโปรแกรมภาษา C#",
        "รหัสวิชา: CS231",
        "แผนการสอน 15 สัปดาห์",
        "สัปดาห์ | หัวข้อ | สาระสำคัญ | กิจกรรม/งาน",
        "--- | --- | --- | ---",
        ...rows,
      ].join("\n");

      const result = normalizeTextSections(rawText, () => ({kind: "page", page: 3}));

      expect(result.course_title).toBe("การเขียนโปรแกรมภาษา C#");
      expect(result.course_code).toBe("CS231");
      expect(result.schedule_or_topics).toHaveLength(15);
      expect(result.schedule_or_topics[0]?.week_or_unit).toBe("สัปดาห์ที่ 1");
      expect(result.schedule_or_topics[14]?.week_or_unit).toBe("สัปดาห์ที่ 15");
      expect(result.schedule_or_topics[0]?.source).toEqual({kind: "page", page: 3});
      expect(result.schedule_or_topics[14]?.topics).toEqual(["สาระสำคัญ 15", "Lab 15"]);
    });

    it("preserves a pending week across a repeated multi-page PDF table header", () => {
      const rawText = [
        "ชื่อวิชา: การเขียนโปรแกรมภาษา C#",
        "รหัสวิชา: CS231",
        "แผนการสอน 15 สัปดาห์",
        "สัปดาห์ หัวข้อ สาระสำคัญ กิจกรรม/งาน",
        "1",
        "พื้นฐาน C#",
        "2",
        "ตัวแปรและชนิดข้อมูล",
        "3",
        "เงื่อนไขและการวนซ้ำ",
        "4",
        "สัปดาห์ หัวข้อ สาระสำคัญ กิจกรรม/งาน",
        "คลาสและอ็อบเจกต์",
        "5",
        "Inheritance",
      ].join("\n");

      const result = normalizeTextSections(rawText, (startLine) => ({
        kind: "page",
        page: startLine <= 11 ? 1 : 2,
      }));

      expect(result.schedule_or_topics.map((item) => item.week_or_unit)).toEqual([
        "สัปดาห์ที่ 1",
        "สัปดาห์ที่ 2",
        "สัปดาห์ที่ 3",
        "สัปดาห์ที่ 4",
        "สัปดาห์ที่ 5",
      ]);
      expect(result.schedule_or_topics[3]?.title).toBe("คลาสและอ็อบเจกต์");
      expect(result.schedule_or_topics[3]?.source).toEqual({kind: "page", page: 2});
    });

    it("normalizes the actual numbered/bilingual Thai PDF extraction shape before planning", () => {
      const rows = Array.from({length: 15}, (_, index) =>
        `${index + 1} ${index === 0 ? "แนะนำรายวิชาและพื้นฐานภาษา C#" : `หัวข้อสัปดาห์ที่ ${index + 1}`} สาระสำคัญ ${index + 1} กิจกรรม/งาน ${index + 1}`
      );
      const rawText = [
        "ประมวลรายวิชา (Syllabus)",
        "การเขียนโปรแกรมเชิงวัตถุด้วยภาษา C# ระดับปริญญาตรี",
        "รหัสวิชา CS231",
        "1. คำอธิบายรายวิชา",
        "เรียนรู้การเขียนโปรแกรมเชิงวัตถุด้วยภาษา C# และ .NET",
        "2. ผลลัพธ์การเรียนรู้ของรายวิชา (Course Learning Outcomes: CLOs)",
        "1. อธิบายแนวคิดเชิงวัตถุได้",
        "2. สร้างคลาสและอ็อบเจกต์ได้",
        "3. ใช้การสืบทอดได้",
        "4. ใช้โพลีมอร์ฟิซึมได้",
        "5. พัฒนาโปรแกรมขนาดเล็กได้",
        "4. การประเมินผล",
        "งานและแบบฝึกหัด 40% สอบปลายภาค 60%",
        "5. แผนการสอน 15 สัปดาห์",
        "สัปดาห์ หัวข้อ สาระสำคัญ กิจกรรม/งาน",
        ...rows,
      ].join("\n");

      const result = normalizeTextSections(rawText, (startLine) => ({
        kind: "page",
        page: Math.ceil(startLine / 10),
      }));

      expect(result.course_title).toBe("การเขียนโปรแกรมเชิงวัตถุด้วยภาษา C# ระดับปริญญาตรี");
      expect(result.course_code).toBe("CS231");
      expect(result.course_description).toContain(".NET");
      expect(result.learning_objectives).toHaveLength(5);
      expect(result.schedule_or_topics).toHaveLength(15);
      expect(result.schedule_or_topics.map((item) => item.week_or_unit)).toEqual(
        Array.from({length: 15}, (_, index) => `สัปดาห์ที่ ${index + 1}`)
      );
      expect(result.assessment_text).toContain("40%");
      expect(result.schedule_or_topics[0]?.source?.kind).toBe("page");
    });
  });

  describe("T0404 — DOCX Extraction & R3 Paragraph Provenance", () => {
    it("extracts text from valid DOCX with strict 1-based non-empty paragraph sequence provenance", async () => {
      const docxBuffer = createMinimalDocxBuffer([
        "Course Title: Introduction to Data Science",
        "Course Code: DS101",
        "",
        "Description: Practical machine learning and statistics.",
        "",
        "Learning Objectives:",
        "- Understand exploratory data analysis.",
        "",
        "Week 1: Foundations of Data Science",
        "- Python for data analysis",
        "",
        "Week 2: Statistical Modeling",
        "- Linear regression",
        "",
        "Assessment:",
        "- 100% Coursework",
      ]);

      const result = await ingestSyllabus({
        content: docxBuffer,
        filename: "syllabus.docx",
      });

      expect(result.schema_version).toBe("0.1");
      expect(result.course_title).toBe("Introduction to Data Science");
      expect(result.course_code).toBe("DS101");
      expect(result.schedule_or_topics.length).toBe(2);

      const week1 = result.schedule_or_topics[0];
      const week2 = result.schedule_or_topics[1];

      expect(week1?.source?.kind).toBe("paragraph");
      expect(week2?.source?.kind).toBe("paragraph");

      if (week1?.source?.kind === "paragraph" && week2?.source?.kind === "paragraph") {
        expect(week1.source.paragraph_index).toBe(6);
        expect(week2.source.paragraph_index).toBe(8);
      }
    });

    it("rejects corrupt DOCX file with sanitized message and null details (R6)", async () => {
      const corruptBuffer = Buffer.from("PK corrupt not a real docx archive");

      try {
        await ingestSyllabus({
          content: corruptBuffer,
          filename: "corrupt.docx",
        });
        expect.unreachable("Should have thrown EXTRACTION_FAILED");
      } catch (err: any) {
        expect(err).toBeInstanceOf(SyllabusIngestionError);
        expect(err.code).toBe("EXTRACTION_FAILED");
        expect(err.statusCode).toBe(422);
        expect(err.message).toBe("The uploaded DOCX file could not be read.");
        expect(err.details).toBeNull();
      }
    });
  });

  describe("T0405, T0406 — PDF Extraction & Scanned OCR Check", () => {
    it("preserves all 15 weeks during PDF extraction but rejects ingestion over the course-period cap", async () => {
      const page1 = [
        "Course Title: Data Structures",
        "Course Code: CS240",
        "Weekly Schedule",
        "Week Topic Activity",
        "1 Arrays and Lists",
        "2 Stacks",
        "3 Queues",
        "4",
      ];
      const page2 = [
        "Week Topic Activity",
        "Trees",
        ...Array.from({length: 11}, (_, index) => `${index + 5} Topic week ${index + 5}`),
      ];
      const pdfBuffer = createTwoPagePdf(page1, page2);
      const input = {content: pdfBuffer, filename: "repeated-header-15-week.pdf"};
      const result = await extractPdfSyllabus(input);
      await expect(ingestSyllabus(input)).rejects.toMatchObject({ code: "COURSE_PERIOD_LIMIT_EXCEEDED", details: { observed: 15, max: 10 } });

      expect(result.schedule_or_topics).toHaveLength(15);
      expect(result.schedule_or_topics.map((item) => item.week_or_unit)).toEqual(
        Array.from({length: 15}, (_, index) => `สัปดาห์ที่ ${index + 1}`)
      );
      expect(result.schedule_or_topics[3]?.title).toBe("Trees");
      expect(result.schedule_or_topics[3]?.source).toEqual({kind: "page", page: 2});
    });

    it("extracts text from machine-readable PDF with page provenance (T0405)", async () => {
      const pdfBuffer = Buffer.from(validPdfString, "utf8");

      const result = await ingestSyllabus({
        content: pdfBuffer,
        filename: "syllabus.pdf",
      });

      expect(result.schema_version).toBe("0.1");
      expect(result.raw_text).toContain("CS101 Introduction to Artificial Intelligence");
      expect(result.metadata.media_type).toBe("application/pdf");
    });

    it("flags scanned PDF with OCR_REQUIRED, sanitized message, and null details (T0406, Decision P4-D7)", async () => {
      const scannedBuffer = Buffer.from(scannedPdfString, "utf8");

      try {
        await ingestSyllabus({
          content: scannedBuffer,
          filename: "scanned.pdf",
        });
        expect.unreachable("Should have thrown OCR_REQUIRED");
      } catch (err: any) {
        expect(err).toBeInstanceOf(SyllabusIngestionError);
        expect(err.code).toBe("OCR_REQUIRED");
        expect(err.statusCode).toBe(422);
        expect(err.message).toContain("OCR is required");
        expect(err.details).toBeNull();
      }
    });

    it("rejects corrupt PDF with sanitized message and null details (R6)", async () => {
      const corruptBuffer = Buffer.from("%PDF-1.4 corrupt broken structure");

      try {
        await ingestSyllabus({
          content: corruptBuffer,
          filename: "corrupt.pdf",
        });
        expect.unreachable("Should have thrown EXTRACTION_FAILED");
      } catch (err: any) {
        expect(err).toBeInstanceOf(SyllabusIngestionError);
        expect(err.code).toBe("EXTRACTION_FAILED");
        expect(err.statusCode).toBe(422);
        expect(err.message).toBe("The uploaded PDF file could not be read.");
        expect(err.details).toBeNull();
      }
    });

    it("rejects a substantial PDF when extraction succeeds but normalization is empty", async () => {
      const pdfBuffer = createSimplePdf(`CS231 ${"unstructured content ".repeat(30)}`);

      await expect(
        ingestSyllabus({content: pdfBuffer, filename: "unstructured.pdf"})
      ).rejects.toMatchObject({
        code: "NORMALIZATION_INCOMPLETE",
        statusCode: 422,
      });
    });
  });

  describe("P4-D8 — MIME Type & Extension Consistency Policy", () => {
    it("accepts generic application/octet-stream with valid extension", async () => {
      const content = Buffer.from("# CS101: Test\n\n## Description\nDesc\n\n## Objectives\n- Obj 1");

      const result = await ingestSyllabus({
        content,
        filename: "course.md",
        mediaType: "application/octet-stream",
      });

      expect(result.schema_version).toBe("0.1");
      expect(result.metadata.media_type).toBe("text/markdown");
    });

    it("rejects contradictory MIME type and extension mismatch (P4-D8)", async () => {
      const content = Buffer.from("Some content");

      try {
        await ingestSyllabus({
          content,
          filename: "syllabus.pdf",
          mediaType: "text/plain",
        });
        expect.unreachable("Should have thrown UNSUPPORTED_FILE_TYPE due to mismatch");
      } catch (err: any) {
        expect(err.code).toBe("UNSUPPORTED_FILE_TYPE");
        expect(err.statusCode).toBe(415);
        expect(err.message).toContain("File type mismatch");
      }
    });
  });

  describe("Ingestion Error Handling & Bounds", () => {
    it("rejects empty file with EMPTY_CONTENT (400)", async () => {
      try {
        await ingestSyllabus({
          content: Buffer.alloc(0),
          filename: "empty.txt",
        });
        expect.unreachable("Should have thrown EMPTY_CONTENT");
      } catch (err: any) {
        expect(err.code).toBe("EMPTY_CONTENT");
        expect(err.statusCode).toBe(400);
      }
    });

    it("rejects unsupported file extension with UNSUPPORTED_FILE_TYPE (415)", async () => {
      try {
        await ingestSyllabus({
          content: Buffer.from("image content"),
          filename: "syllabus.png",
        });
        expect.unreachable("Should have thrown UNSUPPORTED_FILE_TYPE");
      } catch (err: any) {
        expect(err.code).toBe("UNSUPPORTED_FILE_TYPE");
        expect(err.statusCode).toBe(415);
      }
    });

    it("rejects file larger than 10 MB with FILE_TOO_LARGE (413)", async () => {
      const oversizedBuffer = Buffer.alloc(MAX_SYLLABUS_FILE_SIZE + 100, "a");

      try {
        await ingestSyllabus({
          content: oversizedBuffer,
          filename: "large.txt",
        });
        expect.unreachable("Should have thrown FILE_TOO_LARGE");
      } catch (err: any) {
        expect(err.code).toBe("FILE_TOO_LARGE");
        expect(err.statusCode).toBe(413);
      }
    });
  });
});
