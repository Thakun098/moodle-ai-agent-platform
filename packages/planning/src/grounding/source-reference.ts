import type { NormalizedSyllabus, SourceReference, SyllabusScheduleItem } from "@moodle-agent-poc/contracts";

function sourceSection(item: SyllabusScheduleItem): string {
  return item.week_or_unit?.trim() || item.title.trim();
}

/**
 * Convert source-location aliases into the one representation used by
 * grounding, prompts, schemas, and validators.
 */
export function canonicalSourceSection(section: string): string {
  const value = section.trim();
  const line = value.match(/^lines?\s+(\d+)(?:\s*-\s*(\d+))?$/iu);
  if (line) return `lines ${line[1]}-${line[2] ?? line[1]}`;

  const page = value.match(/^(?:page|p\.?)\s+(\d+)$/iu);
  if (page) return `page ${page[1]}`;

  const paragraph = value.match(/^(?:paragraph|para\.?|p\.?)\s+(\d+)$/iu);
  if (paragraph) return `paragraph ${paragraph[1]}`;

  return value;
}

export function sourceReferenceFromSyllabusItem(
  syllabus: Pick<NormalizedSyllabus, "metadata">,
  item: SyllabusScheduleItem,
): SourceReference {
  const reference: SourceReference = {
    source: syllabus.metadata.filename,
    section: sourceSection(item),
    ...(item.topics.length > 0 ? { text: item.topics.join("; ") } : { text: item.title }),
  };

  if (item.source?.kind === "line") {
    const end = item.source.end_line ?? item.source.start_line;
    return { ...reference, section: `lines ${item.source.start_line}-${end}` };
  }
  if (item.source?.kind === "page") {
    return { ...reference, page: item.source.page, section: `page ${item.source.page}` };
  }
  if (item.source?.kind === "paragraph") {
    return { ...reference, section: `paragraph ${item.source.paragraph_index}` };
  }
  return reference;
}

export function normalizeSourceReference(reference: SourceReference): SourceReference {
  const normalizedSection = reference.section === undefined
    ? undefined
    : canonicalSourceSection(reference.section);
  // A page location is authoritative. This prevents a semantic section label
  // from disagreeing with the page location exposed to the model.
  return {
    ...reference,
    ...(reference.page !== undefined ? { section: `page ${reference.page}` } : normalizedSection !== undefined ? { section: normalizedSection } : {}),
  };
}

export function formatSourceReferenceLocation(reference: SourceReference): string {
  const normalized = normalizeSourceReference(reference);
  if (normalized.section) return normalized.section;
  if (normalized.page !== undefined) return `page ${normalized.page}`;
  return "source file";
}

export function sourceReferenceKeys(reference: SourceReference): string[] {
  const normalized = normalizeSourceReference(reference);
  const keys = [normalized.source];
  if (normalized.page !== undefined) {
    keys.push(`${normalized.source}::page::${normalized.page}`);
    for (const alias of [`page ${normalized.page}`, `p. ${normalized.page}`, `p ${normalized.page}`]) {
      keys.push(`${normalized.source}::section::${alias}`);
    }
  }
  if (normalized.section !== undefined) {
    keys.push(`${normalized.source}::section::${normalized.section}`);
    const line = normalized.section.match(/^lines (\d+)-(\d+)$/u);
    if (line) {
      const [, start, end] = line;
      for (const alias of [`line ${start}-${end}`, `${start}-${end}`, `lines ${start}`, `line ${start}`, start]) {
        keys.push(`${normalized.source}::section::${alias}`);
      }
    }
    const paragraph = normalized.section.match(/^paragraph (\d+)$/u);
    if (paragraph) {
      const number = paragraph[1];
      for (const alias of [`p. ${number}`, `p ${number}`, number]) {
        keys.push(`${normalized.source}::section::${alias}`);
      }
    }
  }
  return keys;
}
