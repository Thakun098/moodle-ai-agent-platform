import type { RawMoodleException } from './types.js';

export interface MoodleClientErrorOptions {
  errorCode?: string | undefined;
  moodleException?: string | undefined;
  status?: number | undefined;
  cause?: unknown;
}

/**
 * Base class for all Moodle client errors (R5).
 */
export class MoodleClientError extends Error {
  readonly errorCode?: string | undefined;
  readonly moodleException?: string | undefined;
  readonly status?: number | undefined;

  constructor(
    message: string,
    options?: MoodleClientErrorOptions
  ) {
    super(message);
    this.name = 'MoodleClientError';
    this.errorCode = options?.errorCode;
    this.moodleException = options?.moodleException;
    this.status = options?.status;
    if (options?.cause) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Request failed before a usable Moodle response was received:
 * network failure, DNS error, connection refused, timeout, or abort (R5, R13).
 */
export class MoodleNetworkError extends MoodleClientError {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'MoodleNetworkError';
  }
}

/**
 * Authentication failure (invalid credentials or web service token) (R5, R6).
 */
export class MoodleAuthenticationError extends MoodleClientError {
  constructor(message: string, options?: MoodleClientErrorOptions) {
    super(message, options);
    this.name = 'MoodleAuthenticationError';
  }
}

/**
 * Authorization failure (authenticated but lacking required Moodle capabilities) (R5, R6).
 */
export class MoodleAuthorizationError extends MoodleClientError {
  constructor(message: string, options?: MoodleClientErrorOptions) {
    super(message, options);
    this.name = 'MoodleAuthorizationError';
  }
}

/**
 * Moodle external function parameter validation failure (R5).
 */
export class MoodleInvalidParameterError extends MoodleClientError {
  constructor(message: string, options?: MoodleClientErrorOptions) {
    super(message, options);
    this.name = 'MoodleInvalidParameterError';
  }
}

/**
 * Referenced Moodle resource does not exist (course, category, section, activity, question) (R5).
 */
export class MoodleResourceNotFoundError extends MoodleClientError {
  constructor(message: string, options?: MoodleClientErrorOptions) {
    super(message, options);
    this.name = 'MoodleResourceNotFoundError';
  }
}

/**
 * Mutation conflicts with existing Moodle state (duplicate question in quiz, shortname collision) (R5).
 */
export class MoodleConflictError extends MoodleClientError {
  constructor(message: string, options?: MoodleClientErrorOptions) {
    super(message, options);
    this.name = 'MoodleConflictError';
  }
}

/**
 * Moodle returned a successful HTTP response whose structure does not match the expected Phase 7 shape (R4, R5).
 */
export class MoodleResponseError extends MoodleClientError {
  constructor(message: string, options?: { status?: number | undefined; cause?: unknown }) {
    super(message, options);
    this.name = 'MoodleResponseError';
  }
}

/**
 * Generic Moodle API or server error (R5).
 */
export class MoodleApiError extends MoodleClientError {
  constructor(message: string, options?: MoodleClientErrorOptions) {
    super(message, options);
    this.name = 'MoodleApiError';
  }
}

/**
 * Determines whether a parsed JSON body is a Moodle exception payload (R7).
 */
export function isRawMoodleException(value: unknown): value is RawMoodleException {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.exception === 'string' || typeof obj.errorcode === 'string';
}

/**
 * Deterministically maps Moodle error payloads and HTTP status codes to typed domain errors (R6, R19).
 */
export function normalizeMoodleError(
  payload: unknown,
  status?: number
): MoodleClientError {
  if (isRawMoodleException(payload)) {
    const errorCode = payload.errorcode ?? '';
    const moodleException = payload.exception ?? '';
    const message = payload.message || 'Moodle Web Service request failed';
    const errorOpts = { errorCode, moodleException, status };

    // 1. Authentication
    if (errorCode === 'invalidtoken' || errorCode === 'invalidlogin') {
      return new MoodleAuthenticationError(message, errorOpts);
    }

    // 2. Authorization (R6: accessexception, required_capability_exception, nopermissions)
    if (
      moodleException === 'required_capability_exception' ||
      moodleException === 'moodle_exception' && errorCode === 'nopermissions' ||
      errorCode === 'accessexception' ||
      errorCode === 'nopermissions'
    ) {
      return new MoodleAuthorizationError(message, errorOpts);
    }

    // 3. Invalid Parameter
    if (
      moodleException === 'invalid_parameter_exception' ||
      errorCode === 'invalidparameter' ||
      errorCode === 'invalidparametererror'
    ) {
      return new MoodleInvalidParameterError(message, errorOpts);
    }

    // 4. Resource Not Found
    const notFoundCodes = [
      'errorquestionnotfound',
      'errorquestionbankentrynotfound',
      'errornotanassignment',
      'errornotaquiz',
      'errorcourseidnotfound',
      'invalidcourseid',
      'invalidcategoryid',
      'invalidrecord',
      'dml_missing_record_exception',
    ];
    if (notFoundCodes.includes(errorCode) || moodleException === 'dml_missing_record_exception') {
      return new MoodleResourceNotFoundError(message, errorOpts);
    }

    // 5. Conflict
    const conflictCodes = [
      'errorquestionalreadyinquiz',
      'errorshortnameexists',
      'shortnametaken',
    ];
    if (conflictCodes.includes(errorCode)) {
      return new MoodleConflictError(message, errorOpts);
    }

    // Secondary HTTP status mapping when Moodle returns generic exception
    if (status === 401) {
      return new MoodleAuthenticationError(message, errorOpts);
    }
    if (status === 403) {
      return new MoodleAuthorizationError(message, errorOpts);
    }
    if (status === 404) {
      return new MoodleResourceNotFoundError(message, errorOpts);
    }
    if (status === 409) {
      return new MoodleConflictError(message, errorOpts);
    }

    return new MoodleApiError(message, errorOpts);
  }

  // Non-Moodle JSON payload with HTTP error status
  if (status && (status < 200 || status >= 300)) {
    if (status === 401) {
      return new MoodleAuthenticationError(`HTTP ${status} Unauthorized`, { status });
    }
    if (status === 403) {
      return new MoodleAuthorizationError(`HTTP ${status} Forbidden`, { status });
    }
    if (status === 404) {
      return new MoodleResourceNotFoundError(`HTTP ${status} Not Found`, { status });
    }
    if (status === 409) {
      return new MoodleConflictError(`HTTP ${status} Conflict`, { status });
    }
    return new MoodleApiError(`Moodle HTTP request failed with status ${status}`, { status });
  }

  if (payload instanceof Error) {
    return new MoodleApiError(payload.message, { cause: payload });
  }

  return new MoodleApiError('Unknown Moodle error occurred');
}
