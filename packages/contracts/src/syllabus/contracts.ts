export type SyllabusSourceLocation =
  | { readonly kind: "line"; readonly start_line: number; readonly end_line?: number }
  | { readonly kind: "paragraph"; readonly paragraph_index: number }
  | { readonly kind: "page"; readonly page: number };

export interface SyllabusScheduleItem {
  readonly week_or_unit?: string;
  readonly title: string;
  readonly topics: readonly string[];
  readonly source?: SyllabusSourceLocation;
}

export interface SyllabusMetadata {
  readonly filename: string;
  readonly media_type: string;
  readonly byte_size: number;
  readonly sha256: string;
}

export interface NormalizedSyllabus {
  readonly schema_version: "0.1";
  readonly course_title?: string;
  readonly course_code?: string;
  readonly course_description?: string;
  readonly learning_objectives: readonly string[];
  readonly schedule_or_topics: readonly SyllabusScheduleItem[];
  readonly assessment_text?: string;
  readonly raw_text: string;
  readonly metadata: SyllabusMetadata;
}
