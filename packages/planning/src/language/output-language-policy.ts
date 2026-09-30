import {
  combineNaturalLanguageSignals,
  primaryOutputLanguageLabel,
  type PrimaryOutputLanguageAuthority,
} from "@moodle-agent-poc/contracts";

const MIN_LANGUAGE_SIGNAL = 20;
const MIN_EXPECTED_SHARE = 0.70;

export interface OutputLanguageInspection {
  valid: boolean;
  expected_code: PrimaryOutputLanguageAuthority["code"];
  expected_label: "Thai" | "English";
  thai_signal: number;
  english_signal: number;
  expected_share: number;
}

function normalizedWhitespace(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function stripAuthorizedSourceText(text: string, authorizedSourceTexts: readonly string[]): string {
  const candidate = normalizedWhitespace(text);
  const sources = authorizedSourceTexts.map(normalizedWhitespace).filter(Boolean);
  if (sources.length === 0) return text;
  if (candidate.length >= 4 && sources.some((source) => source.includes(candidate))) return " ";
  const patterns = [
    /"([^"\n]{8,})"/gu,
    /“([^”\n]{8,})”/gu,
    /'([^'\n]{8,})'/gu,
    /‘([^’\n]{8,})’/gu,
  ];
  let result = text;
  for (const pattern of patterns) {
    result = result.replace(pattern, (full, quoted: string) => {
      const candidate = normalizedWhitespace(quoted);
      return sources.some((source) => source.includes(candidate)) ? " " : full;
    });
  }
  return result;
}

export function inspectPrimaryOutputLanguage(
  texts: readonly string[],
  authority: PrimaryOutputLanguageAuthority,
  authorizedSourceTexts: readonly string[] = [],
): OutputLanguageInspection {
  const signal = combineNaturalLanguageSignals(texts.map((text) => stripAuthorizedSourceText(text, authorizedSourceTexts)));
  const total = signal.thai + signal.english;
  const expected = authority.code === "th" ? signal.thai : signal.english;
  const expectedShare = total === 0 ? 1 : expected / total;
  return {
    valid: total < MIN_LANGUAGE_SIGNAL || expectedShare >= MIN_EXPECTED_SHARE,
    expected_code: authority.code,
    expected_label: primaryOutputLanguageLabel(authority.code),
    thai_signal: signal.thai,
    english_signal: signal.english,
    expected_share: expectedShare,
  };
}

export function primaryOutputLanguagePrompt(authority: PrimaryOutputLanguageAuthority): string {
  const label = primaryOutputLanguageLabel(authority.code);
  return [
    `Primary Output Language authority: ${label} (${authority.code}), derived deterministically from the Syllabus.`,
    `Write all newly authored teacher/student-facing educational prose in ${label}.`,
    "Technical terms, product names, code, identifiers, and verbatim source quotations may remain in their conventional/source form.",
    "Do not switch the surrounding explanatory prose to another language because technical English terms appear in the source.",
  ].join(" ");
}

export function primaryOutputLanguageCorrectionPrompt(authority: PrimaryOutputLanguageAuthority): string {
  const label = primaryOutputLanguageLabel(authority.code);
  return [
    "OUTPUT_LANGUAGE_POLICY_CORRECTION:",
    `The previous response materially violated the Primary Output Language contract. Regenerate the complete response in ${label}.`,
    "Preserve authorized facts, source quotations, technical terms, product names, code, identifiers, refs, IDs, numeric values, and JSON shape.",
    "This is the single bounded language-correction attempt.",
  ].join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function pushString(target: string[], value: unknown): void {
  if (typeof value === "string" && value.trim()) target.push(value.trim());
}

function pushStringList(target: string[], value: unknown): void {
  if (Array.isArray(value)) for (const item of value) pushString(target, item);
}

/** Teacher-visible Structure prose. Source-preserved strings are exempted later against authorized syllabus evidence. */
export function collectStructureEducationalProse(parsed: unknown): string[] {
  const root = asRecord(parsed);
  const content = asRecord(root?.content);
  const course = asRecord(content?.course);
  const result: string[] = [];
  pushString(result, root?.title);
  pushString(result, root?.summary);
  pushString(result, course?.summary);
  if (Array.isArray(content?.sections)) {
    for (const sectionValue of content.sections) {
      const section = asRecord(sectionValue);
      if (section) {
        pushString(result, section.title);
        pushString(result, section.summary);
      }
    }
  }
  return result;
}

/** Educational prose generated for Quiz/Assignment bodies; provenance/source text is excluded. */
export function collectActivityEducationalProse(parsed: unknown): string[] {
  const wrapper = asRecord(parsed);
  const activity = asRecord(wrapper?.status === "generated" ? wrapper.activity : parsed);
  if (!activity) return [];
  const result: string[] = [];
  pushString(result, activity.description);
  pushStringList(result, activity.instructions);

  if (Array.isArray(activity.questions)) {
    for (const questionValue of activity.questions) {
      const question = asRecord(questionValue);
      if (!question) continue;
      pushString(result, question.question);
      pushString(result, question.feedback);
      pushStringList(result, question.grading_guidance);
      if (Array.isArray(question.choices)) {
        for (const choiceValue of question.choices) {
          const choice = asRecord(choiceValue);
          if (choice) pushString(result, choice.text);
          else pushString(result, choiceValue);
        }
      }
    }
  }
  return result;
}
