import { readFileSync } from "node:fs";
import type { AnySchema, ErrorObject } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ContractValidationError, ContractValidationResult } from "./planning-contract-validator.js";

export const STUDENT_RISK_RESULT_SCHEMA_ID = "https://moodle-agent-poc.local/schemas/student-risk-result.v0.1.schema.json";
const schema = JSON.parse(readFileSync(new URL("../../schemas/student-risk-result.v0.1.schema.json", import.meta.url), "utf8")) as AnySchema;
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
const validate = ajv.compile(schema);
function normalizeErrors(errors: readonly ErrorObject[] | null | undefined): readonly ContractValidationError[] {
  return (errors ?? []).map((error) => ({ instancePath: error.instancePath, schemaPath: error.schemaPath, keyword: error.keyword, message: error.message ?? "StudentRiskResult validation failed", params: { ...error.params } as Readonly<Record<string, unknown>> }));
}
export function validateStudentRiskResult(value: unknown): ContractValidationResult {
  return validate(value) ? { valid: true, errors: [] } : { valid: false, errors: normalizeErrors(validate.errors) };
}
export function isStudentRiskResultV01(value: unknown): boolean { return validateStudentRiskResult(value).valid; }
