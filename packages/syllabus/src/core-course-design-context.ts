import { createHash } from "node:crypto";
import type { CoreCourseDesignContext, DesignFact, DesignMissingInformation, NormalizedSyllabus } from "@moodle-agent-poc/contracts";

type Field = "objectives" | "outcomes" | "ambiguous" | "title" | "code" | "description" | "duration" | "learning_hours" | "delivery_mode" | "target_learners" | "education_level" | "year_level" | "prerequisites" | "prior_knowledge" | "assessment" | "grading" | "constraints" | "schedule";

const aliases: Record<Field, string[]> = {
  objectives: ["objectives", "learning objectives", "course objectives", "goals", "วัตถุประสงค์", "วัตถุประสงค์การเรียนรู้", "วัตถุประสงค์รายวิชา", "จุดประสงค์การเรียนรู้", "จุดประสงค์รายวิชา", "จุดมุ่งหมายรายวิชา"],
  outcomes: ["outcomes", "learning outcomes", "course learning outcomes", "ผลลัพธ์การเรียนรู้", "ผลลัพธ์การเรียนรู้รายวิชา", "ผลลัพธ์การเรียนรู้ของรายวิชา", "ผลลัพธ์การเรียนรู้ระดับรายวิชา"],
  ambiguous: ["objectives and outcomes", "learning objectives and outcomes", "objectives/outcomes"],
  title: ["course title", "course name", "ชื่อรายวิชา", "ชื่อวิชา"],
  code: ["course code", "รหัสวิชา", "รหัสรายวิชา"],
  description: ["description", "course description", "overview", "คำอธิบายรายวิชา"],
  duration: ["duration", "course duration", "ระยะเวลา"],
  learning_hours: ["learning hours", "contact hours", "hours", "ชั่วโมงเรียน", "จำนวนชั่วโมง", "เวลาเรียน"],
  delivery_mode: ["delivery mode", "mode of delivery", "รูปแบบการเรียน", "รูปแบบการสอน"],
  target_learners: ["target learners", "target audience", "กลุ่มผู้เรียน", "กลุ่มเป้าหมาย"],
  education_level: ["learner level", "education level", "level", "ระดับผู้เรียน", "ระดับการศึกษา", "ระดับ"],
  year_level: ["year level", "year of study", "ชั้นปี", "ชั้นปีที่"],
  prerequisites: ["prerequisites", "prerequisite", "วิชาบังคับก่อน", "วิชาที่ต้องเรียนมาก่อน", "รายวิชาที่ควรเรียนมาก่อน", "วิชาที่ควรเรียนมาก่อน", "ความรู้ที่ต้องมีก่อน"],
  prior_knowledge: ["prior knowledge", "พื้นฐานความรู้", "ความรู้พื้นฐาน"],
  assessment: ["assessment", "assessments", "assessment requirements", "evaluation", "การประเมินผล", "การวัดและประเมินผล", "การวัดผลและประเมินผล", "การวัดผล"],
  grading: ["grading", "grading policy", "เกณฑ์การประเมิน", "เกณฑ์การให้คะแนน", "เกณฑ์การตัดเกรด"],
  constraints: ["constraints", "policies", "course policies", "ข้อจำกัด", "นโยบายรายวิชา"],
  schedule: ["schedule", "course schedule", "topics", "weekly schedule", "course content", "แผนการสอน", "กำหนดการสอน", "เนื้อหารายสัปดาห์", "โครงสร้างเนื้อหารายสัปดาห์"],
};

const hash = (text: string): string => createHash("sha256").update(text).digest("hex");
const clean = (text: string): string => text.replace(/^\s*#+\s*/, "").replace(/^\s*\d+(?:\.\d+)*[.)]\s*/, "").replace(/\*\*/g, "").trim();

function classify(text: string): Field | undefined {
  const key = clean(text).replace(/[:：]$/, "").replace(/\s*\([^)]*\)$/, "").trim().toLowerCase();
  return (Object.keys(aliases) as Field[]).find((field) => aliases[field].includes(key));
}

function matchPrefixAlias(text: string): { field: Field; value: string; aliasMatched: string } | undefined {
  const cleaned = text.replace(/^\s*#+\s*/, "").replace(/\*\*/g, "").trim();
  let longestMatch: { field: Field; value: string; aliasMatched: string } | undefined;
  for (const [field, list] of Object.entries(aliases) as [Field, string[]][]) {
    for (const alias of list) {
      const pattern = new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*\\([^)]*\\))?\\s*[:：\\s]\\s*(.*)$`, "iu");
      const match = cleaned.match(pattern);
      if (match) {
        const val = (match[1] || "").trim();
        if (!longestMatch || alias.length > longestMatch.aliasMatched.length) {
          longestMatch = { field, value: val, aliasMatched: alias };
        }
      }
    }
  }
  return longestMatch;
}

function classifyMeasurability(text: string): { status: "MEASURABLE" | "WEAK_OR_AMBIGUOUS" | "UNKNOWN"; review_required: boolean } {
  const cleanText = text.replace(/^\s*(?:CLO\s*[-_]?\s*\d+|[-*•]|\d+(?:\.\d+)*[.)])\s*/iu, "").trim();
  const observableRegex = /^(?:อธิบาย|ออกแบบ|สร้าง|ประยุกต์ใช้|ใช้|พัฒนา|วิเคราะห์|เขียนโปรแกรม|แก้ปัญหา|ประเมิน|วางแผน|ทดสอบ|จัดการ|ระบุ|คำนวณ|เลือก)|^(?:explain|describe|design|create|build|implement|apply|develop|analyze|solve|evaluate|plan|test|manage|write|identify|calculate|select)\b/iu;
  const weakRegex = /^(?:เข้าใจ|เรียนรู้|รู้จัก|ตระหนัก|ทราบ)|^(?:understand|know|learn|appreciate|be\s+aware|be\s+familiar)\b/iu;

  if (observableRegex.test(cleanText)) {
    return { status: "MEASURABLE", review_required: false };
  }
  if (weakRegex.test(cleanText)) {
    return { status: "WEAK_OR_AMBIGUOUS", review_required: true };
  }
  return { status: "UNKNOWN", review_required: true };
}

/** Deterministic extraction from explicit labels only; no model-inferred learner facts. */
export function deriveCoreCourseDesignContext(syllabus: NormalizedSyllabus, runId: string, revision = 1): CoreCourseDesignContext {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("Invalid Core Context revision");
  const fields: Record<Field, DesignFact[]> = {
    objectives: [], outcomes: [], ambiguous: [], title: [], code: [], description: [],
    duration: [], learning_hours: [], delivery_mode: [], target_learners: [],
    education_level: [], year_level: [], prerequisites: [], prior_knowledge: [],
    assessment: [], grading: [], constraints: [], schedule: [],
  };

  function fact(text: string, raw: string, index: number): DesignFact {
    return {
      text,
      origin: "PROVIDED_BY_SYLLABUS",
      source_refs: [{
        source: "syllabus",
        sha256: syllabus.metadata.sha256,
        start_line: index + 1,
        end_line: index + 1,
        text: raw,
      }],
    };
  }

  function factFromParts(text: string, parts: readonly { raw: string; index: number }[]): DesignFact {
    return {
      text,
      origin: "PROVIDED_BY_SYLLABUS",
      source_refs: parts.map(({ raw, index }) => ({
        source: "syllabus" as const,
        sha256: syllabus.metadata.sha256,
        start_line: index + 1,
        end_line: index + 1,
        text: raw,
      })),
    };
  }

  const singleValueFields = new Set<Field>([
    "title", "code", "duration", "learning_hours", "delivery_mode",
    "target_learners", "education_level", "year_level",
  ]);

  let section: Field | undefined;
  let pendingAssessmentLabel: { text: string; raw: string; index: number } | undefined;
  const lines = syllabus.raw_text.split(/\r?\n/);

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line || /^--\s*\d+\s+of\s+\d+\s*--$/i.test(line)) return;

    // Filter page headers/footers
    if (/^CS\d+.*หน้า\s*\d+/iu.test(line) || /^\s*หน้า\s*\d+\s*$/iu.test(line)) return;

    // Filter table headers
    if (/^CLO\s+(?:ผลลัพธ์|learning\s*outcomes)/iu.test(line) ||
        /^ช่วงเรียน\s+หัวข้อ/iu.test(line) ||
        /^องค์ประกอบการประเมิน\s+สัดส่วน/iu.test(line) ||
        /^รวม\s+100%/iu.test(line)) {
      return;
    }

    // Top-level numbered section boundary (e.g. "4. แผนการจัดการเรียนรู้...", "5. วิธีการ...", "6. การวัดและ...")
    const colon = line.search(/[:：]/);
    const inlineField = colon >= 0 ? classify(line.slice(0, colon)) : undefined;
    const header = classify(line);

    if (header && !inlineField) {
      section = header;
      pendingAssessmentLabel = undefined;
      return;
    }

    if (inlineField) {
      section = inlineField;
      const value = line.slice(colon + 1).replace(/^\*\*/, "").trim();
      if (!value) return;
      handleInlineField(inlineField, value, raw, index);
      section = undefined;
      pendingAssessmentLabel = undefined;
      return;
    }

    // Prefix label match for lines without colon (e.g. flat table rows)
    const prefixMatch = matchPrefixAlias(line);
    if (prefixMatch && prefixMatch.value) {
      handleInlineField(prefixMatch.field, prefixMatch.value, raw, index);
      section = undefined;
      pendingAssessmentLabel = undefined;
      return;
    }

    const boundaryKey = clean(line).replace(/[:：]$/, "").replace(/\s*\([^)]*\)$/, "").trim().toLowerCase();
    if ([
      "course competencies", "competencies", "สมรรถนะรายวิชา",
      "teaching methods", "learning methods", "วิธีการจัดการเรียนรู้",
      "references", "sources", "แหล่งที่มาของข้อมูล",
    ].includes(boundaryKey)) {
      section = undefined;
      pendingAssessmentLabel = undefined;
      return;
    }

    // Top-level numbered section boundary that was NOT a recognized field.
    if (/^\s*\d+\.\s+[^\d]/u.test(line)) {
      section = undefined;
      pendingAssessmentLabel = undefined;
      return;
    }

    // Unrecognized Markdown or keyword headings
    if (/^#+\s/u.test(line) || /^(?:Week|Unit|Module|Chapter|สัปดาห์ที่|บทที่)\s*\d/iu.test(line)) {
      section = undefined;
      pendingAssessmentLabel = undefined;
      return;
    }

    // Inside an active multiline section
    if (section && section !== "schedule") {
      if (section === "outcomes") {
        if (/^(?:รายวิชานี้|OOP\s+จาก|แผนการจัดการ)/iu.test(line)) {
          section = undefined;
          return;
        }
        const value = line
          .replace(/^\s*(?:[-*•]|\d+(?:\.\d+)*[.)])\s*/u, "")
          .trim();
        if (value) fields.outcomes.push(fact(value, raw, index));
        return;
      }

      if (section === "assessment") {
        const value = line.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/u, "").trim();
        if (!value || /^(?:รายการ|สัดส่วน)$/u.test(value)) return;

        if (/\d+%/u.test(value)) {
          if (pendingAssessmentLabel) {
            if (pendingAssessmentLabel.text !== "รวม") {
              fields.assessment.push(factFromParts(
                `${pendingAssessmentLabel.text} ${value}`,
                [pendingAssessmentLabel, { raw, index }],
              ));
            }
          } else if (!/^100%$/u.test(value)) {
            fields.assessment.push(fact(value, raw, index));
          }
          pendingAssessmentLabel = undefined;
          return;
        }

        pendingAssessmentLabel = { text: value, raw, index };
        return;
      }

      const value = line.replace(/^(?:[-*•]\s+|\d+(?:\.\d+)*[.)]\s+)/u, "").trim();
      if (!value) return;
      if (singleValueFields.has(section)) {
        handleInlineField(section, value, raw, index);
        section = undefined;
        return;
      }
      fields[section].push(fact(value, raw, index));
    }
  });

  function handleInlineField(field: Field, value: string, raw: string, index: number) {
    if (field === "education_level") {
      // Check for composite education_level + year_level (e.g. "ปริญญาตรี ชั้นปีที่ 2")
      const yearMatch = value.match(/(ชั้นปีที่\s*\d+|ชั้นปี\s*\d+|ปีที่\s*\d+|year\s*\d+)/iu);
      if (yearMatch) {
        const yearText = yearMatch[1]!.trim();
        const eduText = value.replace(yearMatch[0], "").replace(/\([^)]*\)/g, "").trim();
        if (eduText) fields.education_level.push(fact(eduText, raw, index));
        fields.year_level.push(fact(yearText, raw, index));
        return;
      }
      fields.education_level.push(fact(value, raw, index));
      return;
    }

    if (field === "duration") {
      // Check for composite duration + learning_hours (e.g. "10 สัปดาห์ รวม 40 ชั่วโมง...")
      const durationMatch = value.match(/^(\d+\s*(?:สัปดาห์|weeks?|เดือน|months?|วัน|days?))/iu);
      const hoursMatch = value.match(/((?:รวม\s*)?\d+\s*ชั่วโมง.*|\b\d+\s*hours?.*)/iu);
      if (durationMatch && hoursMatch) {
        fields.duration.push(fact(durationMatch[1]!.trim(), raw, index));
        fields.learning_hours.push(fact(hoursMatch[1]!.trim(), raw, index));
        return;
      }
      fields.duration.push(fact(value, raw, index));
      return;
    }

    fields[field].push(fact(value, raw, index));
  }

  // Existing normalized identity is a source extraction, with exact raw-line evidence when available.
  for (const [key, value] of [["title", syllabus.course_title], ["code", syllabus.course_code]] as const) {
    if (value && fields[key].length === 0) {
      const index = lines.findIndex((line) => line.includes(value));
      if (index >= 0) fields[key].push(fact(value, lines[index]!, index));
    }
  }

  const missing: DesignMissingInformation[] = [];
  const hasLevel = fields.education_level.length > 0 || fields.year_level.length > 0;
  if (!hasLevel) {
    missing.push({ code: "LEARNER_LEVEL_MISSING", field: "learner_context", message: "Syllabus does not specify learner level.", severity: "WARNING", applies_to_stage: ["DESIGN_STRUCTURE"] });
    missing.push({ code: "LEARNER_LEVEL_CONFIRMATION_REQUIRED", field: "learner_context", message: "Teacher must provide learner level or explicitly acknowledge it is unspecified before Activity generation.", severity: "REQUIRES_CONFIRMATION", applies_to_stage: ["ACTIVITY_GENERATION"] });
  }
  if (!fields.prerequisites.length) {
    missing.push({ code: "PREREQUISITES_MISSING", field: "learner_context.prerequisites", message: "Prerequisites are not specified.", severity: "WARNING", applies_to_stage: ["DESIGN_STRUCTURE", "ACTIVITY_GENERATION"] });
  }
  if (!fields.outcomes.length) {
    missing.push({ code: "SOURCE_OUTCOMES_MISSING", field: "source_learning_outcomes", message: "No separately labelled source Learning Outcomes were found.", severity: "WARNING", applies_to_stage: ["DESIGN_STRUCTURE"] });
  }
  missing.push({ code: "APPROVED_OUTCOMES_REQUIRED", field: "approved_learning_outcomes", message: "Teacher-approved Outcomes are required for Outcome-based Activity generation and Competency derivation.", severity: "BLOCKING", applies_to_stage: ["ACTIVITY_GENERATION", "DERIVE_COMPETENCIES"] });
  if (fields.ambiguous.length) {
    missing.push({ code: "OBJECTIVE_OUTCOME_AMBIGUOUS", field: "learning_objectives", message: "Combined Objective/Outcome heading requires Teacher clarification; original text remains in source.", severity: "WARNING", applies_to_stage: ["DESIGN_STRUCTURE"] });
  }

  const course: CoreCourseDesignContext["course"] = {};
  for (const key of ["title", "code", "description", "duration", "learning_hours", "delivery_mode"] as const) {
    if (fields[key].length) course[key] = fields[key];
  }

  const stableId = (prefix: string, f: DesignFact) => prefix + "-" + hash(syllabus.metadata.sha256 + ":" + f.source_refs[0]!.start_line + ":" + f.text).slice(0, 20);

  return {
    schema_version: "0.1",
    policy_version: "instructional-design.v0.1",
    revision,
    run_id: runId,
    source_syllabus: {
      normalized_syllabus_version: "0.1",
      filename: syllabus.metadata.filename,
      sha256: syllabus.metadata.sha256,
      text_sha256: hash(syllabus.raw_text),
    },
    course,
    learner_context: {
      revision,
      status: hasLevel ? "PROVIDED_BY_SYLLABUS" : "UNSPECIFIED",
      target_learners: fields.target_learners,
      education_level: fields.education_level,
      year_level: fields.year_level,
      prerequisites: fields.prerequisites,
      prior_knowledge: fields.prior_knowledge,
      teacher_acknowledged_unspecified: false,
    },
    learning_objectives: fields.objectives.map((f) => ({
      objective_id: stableId("objective", f),
      source_text: f.text,
      source_refs: f.source_refs,
      status: "SOURCE",
    })),
    source_learning_outcomes: fields.outcomes.map((f) => {
      const measurability = classifyMeasurability(f.text);
      return {
        source_outcome_id: stableId("source-outcome", f),
        source_text: f.text,
        source_refs: f.source_refs,
        measurable_status: measurability.status,
        review_required: measurability.review_required,
      };
    }),
    approved_learning_outcomes: [],
    schedule_or_topics: syllabus.schedule_or_topics,
    assessment_requirements: fields.assessment,
    grading_policy: fields.grading,
    constraints: fields.constraints,
    missing_information: missing,
    provenance: {
      extractor_version: "syllabus-semantics.v0.2",
      location_basis: "NORMALIZED_RAW_TEXT_LINES",
    },
  };
}
