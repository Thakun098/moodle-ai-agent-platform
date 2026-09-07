import type {
  SyllabusScheduleItem,
  SyllabusSourceLocation,
} from "@moodle-agent-poc/contracts";

export interface SyllabusInput {
  readonly content: Buffer;
  readonly filename: string;
  readonly mediaType?: string;
}

export interface ExtractedUnit {
  readonly week_or_unit?: string;
  readonly title: string;
  readonly topics: readonly string[];
  readonly source?: SyllabusSourceLocation;
}

export interface ExtractedDocument {
  readonly course_title?: string;
  readonly course_code?: string;
  readonly course_description?: string;
  readonly learning_objectives: readonly string[];
  readonly schedule_or_topics: readonly SyllabusScheduleItem[];
  readonly assessment_text?: string;
  readonly raw_text: string;
}
