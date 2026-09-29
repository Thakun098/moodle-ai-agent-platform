import type { SyllabusScheduleItem, SyllabusSourceLocation } from "@moodle-agent-poc/contracts";
import mammoth from "mammoth";
import { SyllabusIngestionError } from "../errors/ingestion-errors.js";
import { normalizeItems } from "../normalizer/deterministic-normalizer.js";
import type { ExtractedDocument, SyllabusInput } from "../types.js";

type HtmlTableRow = readonly string[];

function decodeHtmlText(value: string): string {
  return value
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/\s+/gu, " ")
    .trim();
}

function extractHtmlTables(html: string): HtmlTableRow[][] {
  const tables: HtmlTableRow[][] = [];
  for (const tableMatch of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/giu)) {
    const tableHtml = tableMatch[1] ?? "";
    const rows: string[][] = [];
    for (const rowMatch of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)) {
      const rowHtml = rowMatch[1] ?? "";
      const cells = Array.from(
        rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/giu),
        (cellMatch) => decodeHtmlText(cellMatch[1] ?? "")
      );
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
}

function normalizeTableHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/[：:]/gu, "")
    .replace(/\s+/gu, "")
    .trim();
}

function findScheduleColumns(header: HtmlTableRow): {
  periodColumn: number;
  titleColumn: number;
  topicColumns: readonly number[];
  periodHeader: string;
} | null {
  const normalized = header.map(normalizeTableHeader);
  const periodColumn = normalized.findIndex((cell) =>
    /^(?:สัปดาห์(?:ที่)?|week|ครั้ง(?:ที่)?|หน่วย(?:ที่)?|unit|บท(?:ที่)?|chapter)$/iu.test(cell)
  );
  const titleColumn = normalized.findIndex((cell) =>
    /(?:หัวข้อ(?:การเรียนรู้)?|topic|เนื้อหา|สาระ|content)/iu.test(cell)
  );
  if (periodColumn < 0 || titleColumn < 0 || periodColumn === titleColumn) return null;

  const topicColumns = normalized
    .map((cell, index) => ({cell, index}))
    .filter(({cell, index}) =>
      index !== periodColumn
      && index !== titleColumn
      && /(?:กิจกรรม|การเรียนรู้|activity|learningactivity|งาน|วิธีจัดการเรียนรู้|method)/iu.test(cell)
    )
    .map(({index}) => index);

  return {
    periodColumn,
    titleColumn,
    topicColumns,
    periodHeader: header[periodColumn] ?? "",
  };
}

function formatPeriodLabel(header: string, number: number): string {
  const normalized = normalizeTableHeader(header);
  if (/^สัปดาห์(?:ที่)?$/u.test(normalized)) return `สัปดาห์ที่ ${number}`;
  if (/^ครั้ง(?:ที่)?$/u.test(normalized)) return `ครั้งที่ ${number}`;
  if (/^หน่วย(?:ที่)?$/u.test(normalized)) return `หน่วยที่ ${number}`;
  if (/^บท(?:ที่)?$/u.test(normalized)) return `บทที่ ${number}`;
  if (normalized === "unit") return `Unit ${number}`;
  if (normalized === "chapter") return `Chapter ${number}`;
  return `Week ${number}`;
}

function findParagraphIndexForCellText(
  text: string,
  paragraphs: readonly string[],
  startIndex: number
): number | undefined {
  const target = text.replace(/\s+/gu, " ").trim();

  for (let index = startIndex; index < paragraphs.length; index++) {
    let combined = "";
    for (let offset = 0; offset < 8 && index + offset < paragraphs.length; offset++) {
      combined = `${combined} ${paragraphs[index + offset] ?? ""}`.replace(/\s+/gu, " ").trim();
      if (combined === target) return index + 1;
      if (!target.startsWith(combined) || combined.length >= target.length) break;
    }
  }

  return undefined;
}

function extractScheduleFromHtmlTables(
  html: string,
  nonEmptyParagraphs: readonly string[]
): readonly SyllabusScheduleItem[] {
  const schedule: SyllabusScheduleItem[] = [];
  let paragraphCursor = 0;

  for (const table of extractHtmlTables(html)) {
    const headerIndex = table.findIndex((row) => findScheduleColumns(row) !== null);
    if (headerIndex < 0) continue;

    const columns = findScheduleColumns(table[headerIndex]!);
    if (!columns) continue;

    for (const row of table.slice(headerIndex + 1)) {
      const rawPeriod = row[columns.periodColumn]?.trim() ?? "";
      const periodMatch = rawPeriod.match(/(\d{1,2})/u);
      const title = row[columns.titleColumn]?.trim() ?? "";
      if (!periodMatch?.[1] || !title) continue;

      const number = Number(periodMatch[1]);
      if (!Number.isSafeInteger(number) || number <= 0) continue;

      const topics = columns.topicColumns
        .map((index) => row[index]?.trim() ?? "")
        .filter(Boolean);

      const paragraphIndex = findParagraphIndexForCellText(
        title,
        nonEmptyParagraphs,
        paragraphCursor
      );
      if (paragraphIndex !== undefined) paragraphCursor = paragraphIndex;

      schedule.push({
        week_or_unit: formatPeriodLabel(columns.periodHeader, number),
        title,
        topics: Object.freeze(topics),
        ...(paragraphIndex !== undefined
          ? { source: { kind: "paragraph", paragraph_index: paragraphIndex } as const }
          : {}),
      });
    }
  }

  return Object.freeze(schedule);
}

export async function extractDocxSyllabus(
  input: SyllabusInput
): Promise<ExtractedDocument> {
  let rawText = "";
  let html = "";

  try {
    const [rawResult, htmlResult] = await Promise.all([
      mammoth.extractRawText({ buffer: input.content }),
      mammoth.convertToHtml({ buffer: input.content }),
    ]);
    rawText = rawResult.value ?? "";
    html = htmlResult.value ?? "";
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

  const normalized = normalizeItems(nonEmptyParagraphs, rawText, createLocation);
  const tableSchedule = extractScheduleFromHtmlTables(html, nonEmptyParagraphs);

  if (tableSchedule.length === 0) return normalized;

  return {
    ...normalized,
    schedule_or_topics: tableSchedule,
  };
}
