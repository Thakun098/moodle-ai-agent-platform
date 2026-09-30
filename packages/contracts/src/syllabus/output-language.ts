import type { PrimaryOutputLanguageAuthority, PrimaryOutputLanguageCode } from "./core-course-design-context.js";

const TECHNICAL_TOKENS = new Set([
  "ai", "api", "cli", "css", "crud", "csv", "docker", "git", "github", "html", "http", "https",
  "ide", "java", "javascript", "json", "llm", "mcp", "ml", "moodle", "mvc", "node", "nodejs", "oop",
  "orm", "python", "react", "rest", "sdk", "sql", "typescript", "url", "vue", "xml",
  "azure", "chatgpt", "classroom", "excel", "google", "linux", "microsoft", "openai", "postgresql", "windows",
]);

export interface NaturalLanguageSignal {
  thai: number;
  english: number;
}

function normalizeToken(token: string): string {
  return token.normalize("NFKC").replace(/^[^\p{L}\p{N}.+#_/-]+|[^\p{L}\p{N}.+#_/-]+$/gu, "");
}

function isTechnicalLatinToken(token: string): boolean {
  const normalized = normalizeToken(token);
  if (!normalized) return true;
  const lower = normalized.toLocaleLowerCase();
  if (TECHNICAL_TOKENS.has(lower.replace(/\./gu, ""))) return true;
  if (/\d/u.test(normalized)) return true;
  if (/[_./\\+#:]/u.test(normalized)) return true;
  if (/^[A-Z]{2,}$/u.test(normalized)) return true;
  if (/[a-z][A-Z]/u.test(normalized)) return true;
  return false;
}

/** Counts natural-language alphabetic signal while ignoring code/identifier/technical-token noise. */
export function measureNaturalLanguageSignal(text: string): NaturalLanguageSignal {
  const withoutCode = text
    .replace(/```[\s\S]*?```/gu, " ")
    .replace(/`[^`]*`/gu, " ")
    .replace(/https?:\/\/\S+/giu, " ");

  let thai = 0;
  let english = 0;
  for (const token of withoutCode.match(/[\u0E00-\u0E7F]+|[A-Za-z][A-Za-z0-9_.+#:/\\-]*/gu) ?? []) {
    const thaiLetters = token.match(/[\u0E01-\u0E3A\u0E40-\u0E4E]/gu);
    if (thaiLetters) {
      thai += thaiLetters.length;
      continue;
    }
    if (isTechnicalLatinToken(token)) continue;
    english += (token.match(/[A-Za-z]/gu) ?? []).length;
  }
  return { thai, english };
}

export function combineNaturalLanguageSignals(texts: readonly string[]): NaturalLanguageSignal {
  return texts.reduce<NaturalLanguageSignal>((score, text) => {
    const next = measureNaturalLanguageSignal(text);
    return { thai: score.thai + next.thai, english: score.english + next.english };
  }, { thai: 0, english: 0 });
}

export function dominantNaturalLanguage(texts: readonly string[]): PrimaryOutputLanguageCode | undefined {
  const score = combineNaturalLanguageSignals(texts);
  if (score.thai > score.english) return "th";
  if (score.english > score.thai) return "en";
  return undefined;
}

export function derivePrimaryOutputLanguageAuthority(input: {
  schedule_or_topics: readonly string[];
  objectives_outcomes: readonly string[];
  course_title: readonly string[];
}): PrimaryOutputLanguageAuthority {
  for (const [derivedFrom, texts] of [
    ["SCHEDULE_OR_TOPICS", input.schedule_or_topics],
    ["OBJECTIVES_OUTCOMES", input.objectives_outcomes],
    ["COURSE_TITLE", input.course_title],
  ] as const) {
    const code = dominantNaturalLanguage(texts);
    if (code) return { code, derived_from: derivedFrom };
  }
  return { code: "en", derived_from: "DETERMINISTIC_DEFAULT" };
}

export function primaryOutputLanguageLabel(code: PrimaryOutputLanguageCode): "Thai" | "English" {
  return code === "th" ? "Thai" : "English";
}
