import { readFileSync } from "node:fs";

import type { AnySchema, ErrorObject } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import type { NormalizedSyllabus } from "../syllabus/contracts.js";
import type {
  ContractValidationError,
  ContractValidationResult,
} from "./planning-contract-validator.js";

export const NORMALIZED_SYLLABUS_SCHEMA_ID =
  "https://moodle-agent-poc.local/schemas/normalized-syllabus.v0.1.schema.json";

const schema = JSON.parse(
  readFileSync(
    new URL("../../schemas/normalized-syllabus.v0.1.schema.json", import.meta.url),
    "utf8"
  )
) as AnySchema;

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictTypes: false,
});

const validate = ajv.compile(schema);

function normalizeErrors(
  errors: readonly ErrorObject[] | null | undefined
): readonly ContractValidationError[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "Contract validation failed",
    params: { ...error.params } as Readonly<Record<string, unknown>>,
  }));
}

export function validateNormalizedSyllabus(
  value: unknown
): ContractValidationResult {
  if (validate(value)) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: normalizeErrors(validate.errors),
  };
}

export function isNormalizedSyllabus(
  value: unknown
): value is NormalizedSyllabus {
  return validateNormalizedSyllabus(value).valid;
}
