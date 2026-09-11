import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AnySchema, ErrorObject, ValidateFunction } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";

import type {
  AnyPlanEnvelope,
  ExecutionRequest,
  PlanningContract,
  SourceReference,
} from "../planning/contracts.js";

export const PLAN_ENVELOPE_SCHEMA_ID =
  "urn:moodle-agent-poc:schema:planning:plan-envelope:0.1";
export const SOURCE_REFERENCE_SCHEMA_ID =
  "urn:moodle-agent-poc:schema:planning:source-reference:0.1";
export const PLANNING_CONTRACTS_SCHEMA_ID =
  "urn:moodle-agent-poc:schema:planning:planning-contracts:0.1";
export const EXECUTION_REQUEST_SCHEMA_ID =
  "urn:moodle-agent-poc:schema:planning:execution-request:0.1";

export interface ContractValidationError {
  readonly instancePath: string;
  readonly schemaPath: string;
  readonly keyword: string;
  readonly message: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export type ContractValidationResult =
  | { readonly valid: true; readonly errors: readonly [] }
  | {
      readonly valid: false;
      readonly errors: readonly ContractValidationError[];
    };

export class UnknownPlanningSchemaError extends Error {
  public constructor(public readonly schemaId: string) {
    super(`Unknown planning schema: ${schemaId}`);
    this.name = "UnknownPlanningSchemaError";
  }
}

const schemaDirectory = fileURLToPath(new URL("../../schemas/", import.meta.url));

function loadSchemas(): AnySchema[] {
  return readdirSync(schemaDirectory)
    .filter(
      (filename) =>
        filename.endsWith(".json") &&
        filename !== "verification-result.v0.1.schema.json" &&
        filename !== "normalized-syllabus.v0.1.schema.json"
    )
    .sort()
    .map((filename) => {
      const raw = readFileSync(new URL(`../../schemas/${filename}`, import.meta.url), "utf8");
      const schema: unknown = JSON.parse(raw);

      if (
        typeof schema !== "object" ||
        schema === null ||
        !("$id" in schema) ||
        typeof schema.$id !== "string"
      ) {
        throw new Error(`Planning schema ${filename} does not declare a string $id`);
      }

      return schema as AnySchema;
    })
    // The planning registry is intentionally frozen to planning-contract schemas.
    // Risk/verification/syllabus schemas have dedicated validators and must not
    // silently expand listPlanningSchemaIds().
    .filter((schema) => (schema as { $id: string }).$id.startsWith("urn:moodle-agent-poc:schema:planning:"));
}

const schemas = loadSchemas();

const ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  strictTypes: false,
});

for (const schema of schemas) {
  ajv.addSchema(schema);
}

const registeredSchemaIds = Object.freeze(
  schemas
    .map((schema) => (schema as { $id: string }).$id)
    .sort(),
);
const registeredSchemaIdSet = new Set(registeredSchemaIds);

for (const schemaId of registeredSchemaIds) {
  if (ajv.getSchema(schemaId) === undefined) {
    throw new Error(`Ajv failed to compile planning schema: ${schemaId}`);
  }
}

function normalizeErrors(
  errors: readonly ErrorObject[] | null | undefined,
): readonly ContractValidationError[] {
  return (errors ?? []).map((error) => ({
    instancePath: error.instancePath,
    schemaPath: error.schemaPath,
    keyword: error.keyword,
    message: error.message ?? "Contract validation failed",
    params: { ...error.params } as Readonly<Record<string, unknown>>,
  }));
}

function resultFromValidator(
  validator: ValidateFunction,
  value: unknown,
): ContractValidationResult {
  if (validator(value)) {
    return { valid: true, errors: [] };
  }

  return {
    valid: false,
    errors: normalizeErrors(validator.errors),
  };
}

export function listPlanningSchemaIds(): readonly string[] {
  return registeredSchemaIds;
}

export function validateAgainstPlanningSchema(
  schemaId: string,
  value: unknown,
): ContractValidationResult {
  if (!registeredSchemaIdSet.has(schemaId)) {
    throw new UnknownPlanningSchemaError(schemaId);
  }

  const validator = ajv.getSchema(schemaId);
  if (validator === undefined) {
    throw new Error(`Registered planning schema was not compiled: ${schemaId}`);
  }

  return resultFromValidator(validator, value);
}

export function validatePlanEnvelope(value: unknown): ContractValidationResult {
  return validateAgainstPlanningSchema(PLAN_ENVELOPE_SCHEMA_ID, value);
}

export function validateSourceReference(value: unknown): ContractValidationResult {
  return validateAgainstPlanningSchema(SOURCE_REFERENCE_SCHEMA_ID, value);
}

export function validatePlanningContract(value: unknown): ContractValidationResult {
  return validateAgainstPlanningSchema(PLANNING_CONTRACTS_SCHEMA_ID, value);
}

export function validateExecutionRequest(value: unknown): ContractValidationResult {
  return validateAgainstPlanningSchema(EXECUTION_REQUEST_SCHEMA_ID, value);
}

export function isPlanEnvelope(value: unknown): value is AnyPlanEnvelope {
  return validatePlanEnvelope(value).valid;
}

export function isSourceReference(value: unknown): value is SourceReference {
  return validateSourceReference(value).valid;
}

export function isPlanningContract(value: unknown): value is PlanningContract {
  return validatePlanningContract(value).valid;
}

export function isExecutionRequest(value: unknown): value is ExecutionRequest {
  return validateExecutionRequest(value).valid;
}
