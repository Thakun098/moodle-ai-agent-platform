import type {
  SyllabusScheduleItem,
  SyllabusSourceLocation,
} from "@moodle-agent-poc/contracts";
import type { ExtractedDocument } from "../types.js";

const COURSE_CODE_REGEX =
  /(?:^|\b|\()([A-Z]{2,5}\s*\d{3,4}[A-Z]?)(?:\b|\)|:)/;

const UNIT_HEADER_REGEX =
  /^(?:#+\s*)?(Week|Unit|Module|Topic|Chapter|Section)\s*(\d+)(?:[:\s-]+(.*))?$/i;
const THAI_UNIT_HEADER_REGEX =
  /^(?:#+\s*)?(สัปดาห์ที่|สัปดาห์|หน่วยที่|บทที่)\s*(\d+)(?:(?:\s*[:：-]\s*|\s+)(.*))?$/u;

function normalizeHeader(line: string): string {
  return line
    .toLowerCase()
    .replace(/^#+\s*/, "")
    .replace(/^\s*\d+(?:\.\d+)*[.)]?\s*/, "")
    .replace(/[：:]\s*$/, "")
    .replace(/\s+$/, "")
    .trim();
}

function matchesKnownHeader(header: string, aliases: readonly string[]): boolean {
  return aliases.some((alias) => {
    if (header === alias) return true;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${escaped}\\s*\\([^)]*\\)$`, "iu").test(header);
  });
}

function isScheduleTableHeader(line: string): boolean {
  const cells = line.split(/[|\t]/).map((cell) => cell.trim()).filter(Boolean);
  if (cells.length < 2) {
    return /(?:สัปดาห์|week)\s+(?:หัวข้อ|topic|เนื้อหา|สาระ)/iu.test(line);
  }
  const first = cells[0] ?? "";
  const rest = cells.slice(1).join(" ");
  return /^(?:สัปดาห์|week|ลำดับ|ครั้ง|หน่วย|บท)$/iu.test(first)
    && /(?:หัวข้อ|topic|เนื้อหา|สาระ|กิจกรรม|งาน|activity)/iu.test(rest);
}

function parseScheduleTableRow(line: string): { number: number; title: string; topics: string[] } | null {
  const rawCells = line.includes("|")
    ? line.split("|").map((cell) => cell.trim()).filter(Boolean)
    : null;
  if (rawCells && rawCells.length >= 2 && /^\d{1,2}$/.test(rawCells[0] ?? "")) {
    const number = Number(rawCells[0]);
    const title = rawCells[1]?.trim() ?? "";
    if (!title || !Number.isSafeInteger(number) || number <= 0) return null;
    return { number, title, topics: rawCells.slice(2).filter(Boolean) };
  }

  const flattened = line.match(/^(\d{1,2})\s+(.+)$/u);
  if (flattened?.[1] && flattened[2]) {
    const number = Number(flattened[1]);
    return Number.isSafeInteger(number) && number > 0
      ? { number, title: flattened[2].trim(), topics: [] }
      : null;
  }
  return null;
}

function cleanBullet(text: string): string {
  return text.replace(/^[-*•–—\d.)]+\s*/, "").trim();
}

export function normalizeItems(
  items: readonly string[],
  rawText: string,
  createLocation: (startIndex: number, endIndex?: number) => SyllabusSourceLocation
): ExtractedDocument {
  let courseTitle: string | undefined;
  let courseCode: string | undefined;
  let courseDescription: string | undefined;
  const learningObjectives: string[] = [];
  const scheduleOrTopics: SyllabusScheduleItem[] = [];
  let assessmentText: string | undefined;

  let currentSection: "none" | "description" | "objectives" | "schedule" | "assessment" = "none";
  let currentScheduleItem: {
    weekOrUnit?: string;
    title: string;
    topics: string[];
    startIndex: number;
    endIndex?: number;
  } | null = null;

  const descriptionLines: string[] = [];
  const assessmentLines: string[] = [];
  let tableScheduleMode = false;
  let pendingTableWeek: number | null = null;
  let pendingCourseTitleHeader = false;

  for (let i = 0; i < items.length; i++) {
    const itemIndex = i + 1;
    const line = items[i]!.trim();

    if (!line) {
      continue;
    }

    if (pendingCourseTitleHeader) {
      const candidateHeader = normalizeHeader(line);
      const looksLikeMetadata = /^(?:course\s+code|code|รหัสวิชา|รหัสรายวิชา|ระดับ|duration|ระยะเวลา|หน่วยกิต|credits?)\b/iu.test(candidateHeader);
      if (!looksLikeMetadata && !/^\d+(?:\.\d+)*[.)]?\s*/u.test(line)) {
        courseTitle = line;
        pendingCourseTitleHeader = false;
        continue;
      }
      pendingCourseTitleHeader = false;
    }

    // Check for Course Code pattern
    if (!courseCode) {
      const codeMatch = line.match(COURSE_CODE_REGEX);
      if (codeMatch && codeMatch[1]) {
        courseCode = codeMatch[1].replace(/\s+/, " ").trim();
      }
    }

    // Check for explicit Course Title pattern
    const explicitTitleMatch = line.match(/^(?:\s*\d+(?:\.\d+)*[.)]?\s*)?(?:Course\s+Title|Course\s+Name|Title|ชื่อรายวิชา|ชื่อวิชา)\s*(?:[:：]\s*|\s{2,})(.+)$/iu);
    if (explicitTitleMatch && explicitTitleMatch[1]) {
      courseTitle = explicitTitleMatch[1].trim();
      continue;
    }

    // Markdown H1 title check
    if (!courseTitle && line.startsWith("# ") && !line.startsWith("##")) {
      const rawTitle = line.slice(2).trim();
      const parts = rawTitle.split(/:\s+/);
      if (parts.length > 1 && COURSE_CODE_REGEX.test(parts[0]!)) {
        if (!courseCode) {
          courseCode = parts[0]!.trim();
        }
        courseTitle = parts.slice(1).join(": ").trim();
      } else {
        courseTitle = rawTitle;
      }
      continue;
    }

    // Section header detection
    const normalizedHeader = normalizeHeader(line);

    if (matchesKnownHeader(normalizedHeader, ["course title", "course name", "title", "ชื่อรายวิชา", "ชื่อวิชา"])) {
      pendingCourseTitleHeader = true;
      continue;
    }

    if (!courseTitle && matchesKnownHeader(normalizedHeader, ["ประมวลรายวิชา", "syllabus", "course syllabus"])) {
      pendingCourseTitleHeader = true;
      continue;
    }

    if (matchesKnownHeader(normalizedHeader, [
      "description", "course description", "overview", "course overview", "คำอธิบายรายวิชา"
    ])) {
      if (currentScheduleItem) {
        currentScheduleItem.endIndex = itemIndex - 1;
        scheduleOrTopics.push({
          ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
          title: currentScheduleItem.title,
          topics: Object.freeze([...currentScheduleItem.topics]),
          source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
        });
        currentScheduleItem = null;
      }
      currentSection = "description";
      continue;
    }

    if (matchesKnownHeader(normalizedHeader, [
      "objectives", "learning objectives", "course objectives", "goals", "learning outcomes",
      "วัตถุประสงค์การเรียนรู้", "ผลลัพธ์การเรียนรู้", "ผลลัพธ์การเรียนรู้ของรายวิชา"
    ])) {
      if (currentScheduleItem) {
        currentScheduleItem.endIndex = itemIndex - 1;
        scheduleOrTopics.push({
          ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
          title: currentScheduleItem.title,
          topics: Object.freeze([...currentScheduleItem.topics]),
          source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
        });
        currentScheduleItem = null;
      }
      currentSection = "objectives";
      continue;
    }

    if (matchesKnownHeader(normalizedHeader, [
      "assessment", "assessments", "grading", "grading policy", "evaluation",
      "การประเมินผล", "เกณฑ์การประเมิน"
    ])) {
      if (currentScheduleItem) {
        currentScheduleItem.endIndex = itemIndex - 1;
        scheduleOrTopics.push({
          ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
          title: currentScheduleItem.title,
          topics: Object.freeze([...currentScheduleItem.topics]),
          source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
        });
        currentScheduleItem = null;
      }
      currentSection = "assessment";
      continue;
    }

    if (matchesKnownHeader(normalizedHeader, [
      "schedule", "course schedule", "topics", "weekly schedule", "course content",
      "แผนการสอน", "แผนการสอน 15 สัปดาห์", "กำหนดการสอน", "เนื้อหารายสัปดาห์"
    ])) {
      if (currentScheduleItem) {
        currentScheduleItem.endIndex = itemIndex - 1;
        scheduleOrTopics.push({
          ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
          title: currentScheduleItem.title,
          topics: Object.freeze([...currentScheduleItem.topics]),
          source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
        });
        currentScheduleItem = null;
      }
      currentSection = "schedule";
      continue;
    }

    if (currentSection === "schedule" && isScheduleTableHeader(line)) {
      // Repeated table headers commonly appear at PDF page boundaries.
      // Preserve any pending week number/current row state across the header;
      // clearing it here drops rows whose week number was extracted at the end
      // of the previous page and whose title begins on the next page.
      tableScheduleMode = true;
      continue;
    }

    if (currentSection === "schedule" && tableScheduleMode) {
      if (/^[|\s:-]+$/u.test(line)) continue;
      // pdf-parse inserts page-boundary markers such as "-- 1 of 2 --".
      // They are layout noise, not table content, and must not consume a pending week.
      if (/^--\s*\d+\s+of\s+\d+\s*--$/iu.test(line)) continue;

      const tableRow = parseScheduleTableRow(line);
      if (tableRow) {
        if (currentScheduleItem) {
          currentScheduleItem.endIndex = itemIndex - 1;
          scheduleOrTopics.push({
            ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
            title: currentScheduleItem.title,
            topics: Object.freeze([...currentScheduleItem.topics]),
            source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
          });
        }
        currentScheduleItem = {
          weekOrUnit: `สัปดาห์ที่ ${tableRow.number}`,
          title: tableRow.title,
          topics: [...tableRow.topics],
          startIndex: itemIndex,
        };
        pendingTableWeek = null;
        continue;
      }

      const numberOnly = line.match(/^(\d{1,2})$/u);
      if (numberOnly?.[1]) {
        if (currentScheduleItem) {
          currentScheduleItem.endIndex = itemIndex - 1;
          scheduleOrTopics.push({
            ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
            title: currentScheduleItem.title,
            topics: Object.freeze([...currentScheduleItem.topics]),
            source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
          });
        }
        currentScheduleItem = null;
        pendingTableWeek = Number(numberOnly[1]);
        continue;
      }

      if (pendingTableWeek !== null) {
        currentScheduleItem = {
          weekOrUnit: `สัปดาห์ที่ ${pendingTableWeek}`,
          title: line,
          topics: [],
          startIndex: itemIndex,
        };
        pendingTableWeek = null;
        continue;
      }
    }

    // Check for unit headers: "Week 1: Introduction", "## Week 1: Introduction", etc.
    const unitMatch = line.match(UNIT_HEADER_REGEX) ?? line.match(THAI_UNIT_HEADER_REGEX);
    if (unitMatch) {
      tableScheduleMode = false;
      pendingTableWeek = null;
      if (currentScheduleItem) {
        currentScheduleItem.endIndex = itemIndex - 1;
        scheduleOrTopics.push({
          ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
          title: currentScheduleItem.title,
          topics: Object.freeze([...currentScheduleItem.topics]),
          source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
        });
      }

      const unitType = unitMatch[1]!;
      const unitNum = unitMatch[2]!;
      const unitTitle = unitMatch[3]?.trim() || `${unitType} ${unitNum}`;

      currentScheduleItem = {
        weekOrUnit: `${unitType} ${unitNum}`,
        title: unitTitle,
        topics: [],
        startIndex: itemIndex,
      };
      currentSection = "schedule";
      continue;
    }

    // Markdown H2 / H3 headers inside schedule or generic
    if (line.startsWith("## ") || line.startsWith("### ")) {
      const headingText = line.replace(/^#+\s*/, "").trim();
      if (currentScheduleItem) {
        currentScheduleItem.endIndex = itemIndex - 1;
        scheduleOrTopics.push({
          ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
          title: currentScheduleItem.title,
          topics: Object.freeze([...currentScheduleItem.topics]),
          source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
        });
      }
      currentScheduleItem = {
        title: headingText,
        topics: [],
        startIndex: itemIndex,
      };
      currentSection = "schedule";
      continue;
    }

    // Content lines based on currentSection
    if (currentSection === "description") {
      descriptionLines.push(line);
    } else if (currentSection === "objectives") {
      const cleaned = cleanBullet(line);
      if (cleaned) {
        learningObjectives.push(cleaned);
      }
    } else if (currentSection === "assessment") {
      assessmentLines.push(line);
    } else if (currentSection === "schedule" && currentScheduleItem) {
      const cleaned = cleanBullet(line);
      if (cleaned) {
        currentScheduleItem.topics.push(cleaned);
      }
    }
  }

  // Push trailing schedule item
  if (currentScheduleItem) {
    currentScheduleItem.endIndex = items.length;
    scheduleOrTopics.push({
      ...(currentScheduleItem.weekOrUnit ? { week_or_unit: currentScheduleItem.weekOrUnit } : {}),
      title: currentScheduleItem.title,
      topics: Object.freeze([...currentScheduleItem.topics]),
      source: createLocation(currentScheduleItem.startIndex, currentScheduleItem.endIndex),
    });
  }

  if (descriptionLines.length > 0) {
    courseDescription = descriptionLines.join("\n").trim();
  }

  if (assessmentLines.length > 0) {
    assessmentText = assessmentLines.join("\n").trim();
  }

  return {
    ...(courseTitle ? { course_title: courseTitle } : {}),
    ...(courseCode ? { course_code: courseCode } : {}),
    ...(courseDescription ? { course_description: courseDescription } : {}),
    learning_objectives: Object.freeze(learningObjectives),
    schedule_or_topics: Object.freeze(scheduleOrTopics),
    ...(assessmentText ? { assessment_text: assessmentText } : {}),
    raw_text: rawText,
  };
}

export function normalizeTextSections(
  rawText: string,
  createLocation: (startLine: number, endLine?: number) => SyllabusSourceLocation
): ExtractedDocument {
  const lines = rawText.split(/\r?\n/);
  return normalizeItems(lines, rawText, createLocation);
}
