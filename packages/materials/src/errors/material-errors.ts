export type MaterialIngestionErrorCode =
  | "MATERIAL_FILE_TOO_LARGE"
  | "MATERIAL_FORMAT_UNSUPPORTED"
  | "MATERIAL_EXTRACTION_FAILED"
  | "MATERIAL_CONTEXT_TOO_LARGE"
  | "MATERIAL_SNAPSHOT_NOT_FOUND";

export class MaterialIngestionError extends Error {
  public readonly code: MaterialIngestionErrorCode;
  public readonly details: unknown;

  constructor(code: MaterialIngestionErrorCode, message: string, details?: unknown, options?: ErrorOptions) {
    super(message, options);
    this.name = "MaterialIngestionError";
    this.code = code;
    this.details = details ?? null;
  }
}
