export type IngestionErrorCode =
  | "EMPTY_CONTENT"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "OCR_REQUIRED"
  | "EXTRACTION_FAILED"
  | "NORMALIZATION_INCOMPLETE"
  | "COURSE_PERIOD_LIMIT_EXCEEDED"
  | "INVALID_SCHEMA";

export class SyllabusIngestionError extends Error {
  public readonly code: IngestionErrorCode;
  public readonly statusCode: number;
  public readonly details: unknown;

  constructor(
    code: IngestionErrorCode,
    message: string,
    details?: unknown,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "SyllabusIngestionError";
    this.code = code;
    this.details = details ?? null;

    switch (code) {
      case "EMPTY_CONTENT":
        this.statusCode = 400;
        break;
      case "UNSUPPORTED_FILE_TYPE":
        this.statusCode = 415;
        break;
      case "FILE_TOO_LARGE":
        this.statusCode = 413;
        break;
      case "OCR_REQUIRED":
      case "EXTRACTION_FAILED":
      case "NORMALIZATION_INCOMPLETE":
      case "COURSE_PERIOD_LIMIT_EXCEEDED":
      case "INVALID_SCHEMA":
        this.statusCode = 422;
        break;
      default:
        this.statusCode = 400;
    }
  }
}
