import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(JSON.parse(readFileSync(new URL("../../schemas/core-course-design-context.v0.1.schema.json", import.meta.url), "utf8")));
/** Initial source extraction must not grant approval authority. */
export function assertInitialCoreCourseDesignContext(value: unknown): void {
  if (!validate(value)) throw new Error("Invalid initial Core Context: " + JSON.stringify(validate.errors));
}
