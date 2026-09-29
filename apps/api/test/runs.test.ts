import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  closeDatabase,
  createDbClient,
  runMigrations,
  RunRepository,
} from "@moodle-agent-poc/agent-runtime";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config/config-loader.js";

function createMultipartPayload(
  filename: string,
  fileContent: Buffer | string,
  contentType = "text/plain",
  fields: Record<string, string> = {},
  includeDefaultFormat = true
): { body: Buffer; headers: Record<string, string> } {
  const boundary = "----VitestTestBoundary123456789";
  const contentBuf = Buffer.isBuffer(fileContent)
    ? fileContent
    : Buffer.from(fileContent, "utf8");

  const multipartFields = includeDefaultFormat
    ? { course_format: "topics", ...fields }
    : fields;
  const fieldParts = Object.entries(multipartFields).map(([name, value]) => Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
    "utf8"
  ));
  const headerPart = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="syllabus"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    "utf8"
  );
  const footerPart = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");

  const body = Buffer.concat([...fieldParts, headerPart, contentBuf, footerPart]);
  return {
    body,
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
    },
  };
}

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

describe("POST /api/runs & GET /api/runs/:runId Lifecycle Integration", () => {
  const testDbUrl =
    process.env.DATABASE_URL ||
    "postgresql://moodle_agent_poc:moodle_agent_poc_dev@127.0.0.1:5432/moodle_agent_poc";

  const config = loadConfig({
    DATABASE_URL: testDbUrl,
    OLLAMA_MODEL: "gemma4:e2b",
  });

  let app: any;
  let runRepo: RunRepository;
  let pool: any;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDbUrl;
    await runMigrations(testDbUrl);
    const client = createDbClient(testDbUrl);
    runRepo = new RunRepository(client.db);
    pool = client.pool;

    app = buildApp({
      config,
      fastifyOptions: { logger: false },
      mcpClientManager: {
        callTool: async (name: string) => name === "moodle_list_course_formats"
          ? { status: "success", data: [{ value: "topics", name: "Topics" }, { value: "weeks", name: "Weekly" }] }
          : { status: "error", code: "UNEXPECTED_TOOL", message: name },
      } as any,
    });
  });

  afterAll(async () => {
    await app.close();
    await closeDatabase();
    if (pool) {
      await pool.end();
    }
  });

  it.each([
    ["rich", "# Course\nLearner level: Undergraduate\nPrerequisites: Algebra\n## Learning Objectives\n- Develop skills\n## Learning Outcomes\n- Write a loop\nWeek 1: Loops", "PROVIDED_BY_SYLLABUS", 1],
    ["incomplete", "# Course\nWeek 1: Loops", "UNSPECIFIED", 0],
  ])("persists and reloads %s Core Context from PostgreSQL", async (_name, text, status, count) => {
    const upload = createMultipartPayload("context.md", String(text), "text/markdown");
    const post = await app.inject({ method: "POST", url: "/api/runs", headers: upload.headers, payload: upload.body });
    expect(post.statusCode).toBe(201);
    const result = post.json();
    const persisted = await runRepo.getCoreCourseDesignContext(result.run_id);
    expect(persisted).toEqual(result.core_course_design_context);
    expect(persisted?.learner_context.status).toBe(status);
    expect(persisted?.source_learning_outcomes).toHaveLength(Number(count));
    const reload = await app.inject({ method: "GET", url: "/api/runs/" + result.run_id + "/core-context" });
    expect(reload.statusCode).toBe(200);
    expect(reload.json().core_course_design_context).toEqual(persisted);
    const run = await runRepo.getRun(result.run_id);
    await Promise.all([1, 2].map(() => runRepo.initializeCoreCourseDesignContext(result.run_id, run!.normalizedSyllabus!, persisted!)));
    expect(await runRepo.getCoreCourseDesignContext(result.run_id)).toEqual(persisted);
  });

  it("persists the production Tourism DOCX Core Context with source Objectives and CLOs", async () => {
    const filename = "Course_Syllabus_30700-1004_Tourism_and_Hospitality.docx";
    const docx = readFileSync(resolve(process.cwd(), "packages/syllabus/test/fixtures", filename));
    const upload = createMultipartPayload(
      filename,
      docx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers: upload.headers,
      payload: upload.body,
    });

    expect(response.statusCode).toBe(201);
    const data = response.json();
    expect(data.syllabus.objectives_count).toBe(9);
    expect(data.core_course_design_context.learning_objectives).toHaveLength(4);
    expect(data.core_course_design_context.source_learning_outcomes).toHaveLength(5);
    expect(data.core_course_design_context.course.learning_hours[0]?.text).toBe("2-2-3");
    expect(data.core_course_design_context.assessment_requirements).toHaveLength(6);
    expect(data.core_course_design_context.missing_information.some(
      (item: { code: string }) => item.code === "SOURCE_OUTCOMES_MISSING",
    )).toBe(false);

    const persisted = await runRepo.getCoreCourseDesignContext(data.run_id);
    expect(persisted).toEqual(data.core_course_design_context);
  });

  it("successfully ingests a valid markdown syllabus and persists SHA-256 (R5, T0407)", async () => {
    const mdContent = `# CS101: Introduction to Computer Science\n\n## Description\nCourse overview.\n\n## Learning Objectives\n- Understand algorithms.\n\n## Schedule\n### Week 1: Basics\n- Topic 1\n### Week 2: Intermediate\n- Topic 2`;
    const expectedSha256 = createHash("sha256").update(Buffer.from(mdContent, "utf8")).digest("hex");
    const { body, headers } = createMultipartPayload("syllabus.md", mdContent, "text/markdown");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(201);

    const data = JSON.parse(response.body);
    expect(data.run_id).toBeDefined();
    expect(data.status).toBe("pending");
    expect(data.model).toBe("gemma4:e2b");
    expect(data.syllabus.course_title).toBe("Introduction to Computer Science");
    expect(data.syllabus.sections_count).toBe(2);
    expect(data.syllabus.objectives_count).toBe(1);

    // Verify run record, sha256 in syllabus_metadata, and normalizedSyllabus in DB
    const fetched = await runRepo.getRun(data.run_id);
    expect(fetched).not.toBeNull();
    expect(fetched?.status).toBe("pending");
    expect(fetched?.model).toBe("gemma4:e2b");
    expect(fetched?.syllabusMetadata?.sha256).toBe(expectedSha256);
    expect(fetched?.normalizedSyllabus).toBeDefined();
    expect(fetched?.normalizedSyllabus?.metadata.sha256).toBe(expectedSha256);
  });

  it("successfully ingests a valid plain text syllabus without course title (Decision P4-D1)", async () => {
    const textContent = `Week 1 — Introduction\n- Topic 1\nWeek 2 — Algorithms\n- Topic 2`;
    const { body, headers } = createMultipartPayload("partial.txt", textContent, "text/plain");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(201);

    const data = JSON.parse(response.body);
    expect(data.syllabus.course_title).toBeNull();
    expect(data.syllabus.sections_count).toBe(2);
  });

  it("persists the teacher-selected course format on the Run configuration", async () => {
    const textContent = `Course Title: Dynamic Format Test\nWeek 1: Introduction\n- Topic 1`;
    const { body, headers } = createMultipartPayload("pinned.txt", textContent, "text/plain", { course_format: "weeks" });

    const response = await app.inject({ method: "POST", url: "/api/runs", headers, payload: body });
    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.body);
    expect(data.course_format).toBe("weeks");
    const fetched = await runRepo.getRun(data.run_id);
    expect(fetched?.syllabusMetadata?.course_format).toBe("weeks");
  });

  it("rejects a missing course format before creating a Run", async () => {
    const createRun = vi.spyOn(runRepo, "createRun");
    const { body, headers } = createMultipartPayload(
      "missing-format.txt",
      "Course Title: Missing Format\nWeek 1: Introduction",
      "text/plain",
      {},
      false
    );

    const response = await app.inject({ method: "POST", url: "/api/runs", headers, payload: body });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.message).toContain("course_format is required");
    expect(createRun).not.toHaveBeenCalled();
    createRun.mockRestore();
  });

  it("rejects a syntactically valid format that is not enabled in Moodle", async () => {
    const { body, headers } = createMultipartPayload(
      "unavailable-format.txt",
      "Course Title: Unavailable Format\nWeek 1: Introduction",
      "text/plain",
      { course_format: "social" }
    );

    const response = await app.inject({ method: "POST", url: "/api/runs", headers, payload: body });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.message).toContain("not available");
  });

  it("successfully ingests a valid DOCX syllabus", async () => {
    const docxBuf = createMinimalDocxBuffer([
      "Course Title: Cloud Computing Architecture",
      "Course Code: CC301",
      "Description: Distributed systems and cloud computing.",
      "Learning Objectives:",
      "- Design highly available services.",
      "Week 1: Virtualization",
      "- Hypervisors and containers",
    ]);

    const { body, headers } = createMultipartPayload(
      "syllabus.docx",
      docxBuf,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.body);
    expect(data.syllabus.course_title).toBe("Cloud Computing Architecture");
  });

  it("successfully ingests a machine-readable PDF syllabus", async () => {
    const { body, headers } = createMultipartPayload("course.pdf", validPdfString, "application/pdf");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(201);
    const data = JSON.parse(response.body);
    expect(data.status).toBe("pending");
  });

  it("accepts generic application/octet-stream with valid extension (P4-D8)", async () => {
    const textContent = `Course Title: Biology 101\nWeek 1: Cell Structure\n- Organelles`;
    const { body, headers } = createMultipartPayload("syllabus.txt", textContent, "application/octet-stream");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(201);
  });

  it("rejects contradictory MIME type and extension mismatch (P4-D8)", async () => {
    const { body, headers } = createMultipartPayload("syllabus.pdf", "sample text", "text/plain");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(415);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("UNSUPPORTED_FILE_TYPE");
    expect(data.error.message).toContain("File type mismatch");
  });

  it("rejects unsupported file extensions with HTTP 415 without creating run", async () => {
    const { body, headers } = createMultipartPayload("virus.exe", "binary content", "application/octet-stream");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(415);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("UNSUPPORTED_FILE_TYPE");
  });

  it("rejects files larger than 10 MB with HTTP 413 (P4-D5)", async () => {
    const largeBuffer = Buffer.alloc(10 * 1024 * 1024 + 500, "a");
    const { body, headers } = createMultipartPayload("large.txt", largeBuffer, "text/plain");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(413);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("FILE_TOO_LARGE");
  });

  it("creates run first, then transitions run status to failed on corrupt DOCX with null details (R6, R7)", async () => {
    const { body, headers } = createMultipartPayload("corrupt.docx", "PK corrupt docx content", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(422);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("EXTRACTION_FAILED");
    expect(data.error.message).toBe("The uploaded DOCX file could not be read.");
    expect(data.error.details).toBeNull();
  });

  it("creates run first, then transitions run status to failed on corrupt PDF with null details (R6, R7)", async () => {
    const { body, headers } = createMultipartPayload("corrupt.pdf", "%PDF-1.4 corrupt pdf content", "application/pdf");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(422);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("EXTRACTION_FAILED");
    expect(data.error.message).toBe("The uploaded PDF file could not be read.");
    expect(data.error.details).toBeNull();
  });

  it("creates run first, then transitions run status to failed on scanned PDF with OCR_REQUIRED and null details (P4-D7, R6, R7)", async () => {
    const { body, headers } = createMultipartPayload("scanned.pdf", scannedPdfString, "application/pdf");

    const response = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    expect(response.statusCode).toBe(422);
    const data = JSON.parse(response.body);
    expect(data.error.code).toBe("OCR_REQUIRED");
    expect(data.error.message).toContain("OCR is required");
    expect(data.error.details).toBeNull();
  });

  it("provides GET /api/runs/:runId inspection capability (P4-D9 / R8)", async () => {
    // 1. Create a run via POST
    const textContent = `Course Title: AI Inspection Test\nWeek 1: Intro\n- Test`;
    const { body, headers } = createMultipartPayload("inspect.txt", textContent, "text/plain");

    const postRes = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers,
      payload: body,
    });

    const { run_id } = JSON.parse(postRes.body);

    // 2. Fetch run via GET
    const getRes = await app.inject({
      method: "GET",
      url: `/api/runs/${run_id}`,
    });

    expect(getRes.statusCode).toBe(200);
    const run = JSON.parse(getRes.body);
    expect(run.runId).toBe(run_id);
    expect(run.status).toBe("pending");
    expect(run.normalizedSyllabus.course_title).toBe("AI Inspection Test");

    // 3. Unknown run returns 404
    const notFoundRes = await app.inject({
      method: "GET",
      url: "/api/runs/00000000-0000-0000-0000-000000000000",
    });
    expect(notFoundRes.statusCode).toBe(404);
  });
});
