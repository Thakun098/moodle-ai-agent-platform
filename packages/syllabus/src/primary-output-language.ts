import type {
  NormalizedSyllabus,
  PrimaryOutputLanguageAuthority,
} from "@moodle-agent-poc/contracts";
import { derivePrimaryOutputLanguageAuthority } from "@moodle-agent-poc/contracts";

/**
 * Derive one run-level Primary Output Language from semantic syllabus content.
 * Codes, identifiers, URLs, code snippets, and common technical/product tokens
 * are excluded by the shared language-signal policy so they cannot outweigh
 * the surrounding natural language.
 */
export function derivePrimaryOutputLanguage(
  syllabus: NormalizedSyllabus,
  sourceOutcomeTexts: readonly string[] = [],
): PrimaryOutputLanguageAuthority {
  return derivePrimaryOutputLanguageAuthority({
    schedule_or_topics: syllabus.schedule_or_topics.flatMap((item) => [item.title, ...item.topics]),
    objectives_outcomes: [...syllabus.learning_objectives, ...sourceOutcomeTexts],
    course_title: syllabus.course_title ? [syllabus.course_title] : [],
  });
}
