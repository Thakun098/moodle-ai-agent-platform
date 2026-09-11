import { z } from 'zod';
import { createSuccessEnvelopeSchema } from './output-schemas.js';

export const GetCourseRiskEvidenceInputSchema = z
  .object({
    course_id: z.number().int().positive('course_id must be a positive integer'),
  })
  .strict();

export type GetCourseRiskEvidenceInput = z.infer<typeof GetCourseRiskEvidenceInputSchema>;

const SourceRefSchema = z
  .object({
    source: z.literal('moodle'),
    component: z.string(),
    entity_type: z.string(),
    entity_id: z.string(),
    course_id: z.number().int().positive(),
    activity_id: z.number().int().positive().optional(),
    student_id: z.number().int().positive().optional(),
  })
  .strict();

const DatasetStateSchema = z
  .object({
    dataset: z.enum(['enrolments', 'timeline', 'completion', 'quizzes', 'assignments', 'competencies']),
    status: z.enum(['OK', 'PARTIAL', 'UNAVAILABLE', 'ERROR']),
    observed_at: z.number().int().nonnegative(),
    message: z.string().optional(),
  })
  .strict();

export const CourseRiskEvidenceDataSchema = z
  .object({
    schema_version: z.literal('0.1'),
    observed_at: z.number().int().nonnegative(),
    course: z
      .object({
        course_id: z.number().int().positive(),
        fullname: z.string(),
        shortname: z.string(),
        format: z.string(),
        start_at: z.number().int().nullable(),
        end_at: z.number().int().nullable(),
      })
      .strict(),
    dataset_status: z.array(DatasetStateSchema),
    enrolments: z.array(
      z.object({
        student_id: z.number().int().positive(),
        active: z.boolean(),
        enrolled_at: z.number().int().nullable(),
        source_ref: SourceRefSchema,
      }).strict()
    ),
    activities: z.array(z.record(z.string(), z.unknown())),
    completion: z.array(z.record(z.string(), z.unknown())),
    quizzes: z.array(z.record(z.string(), z.unknown())),
    assignments: z.array(z.record(z.string(), z.unknown())),
    competencies: z
      .object({
        course_competencies: z.array(z.record(z.string(), z.unknown())),
        activity_links: z.array(z.record(z.string(), z.unknown())),
        ratings: z.array(z.record(z.string(), z.unknown())),
      })
      .strict(),
  })
  .strict();

export const CourseRiskEvidenceOutputSchema = createSuccessEnvelopeSchema(CourseRiskEvidenceDataSchema);
