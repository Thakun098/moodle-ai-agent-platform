import {
  MoodleApiError,
  MoodleNetworkError,
  MoodleResponseError,
  isRawMoodleException,
  normalizeMoodleError,
} from './errors.js';
import type { MoodleClientConfig } from './types.js';

export class MoodleHttpClient {
  private readonly endpointUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: MoodleClientConfig) {
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      throw new Error('MoodleClientConfig.baseUrl is required and cannot be empty.');
    }
    if (!config.token || config.token.trim() === '') {
      throw new Error('MoodleClientConfig.token is required and cannot be empty.');
    }

    // P8-D1, R9: Normalize root URL by removing trailing slash and appending /webservice/rest/server.php
    const normalizedBaseUrl = config.baseUrl.replace(/\/+$/, '');
    this.endpointUrl = `${normalizedBaseUrl}/webservice/rest/server.php`;

    this.token = config.token;
    if (config.timeoutMs !== undefined) {
      if (typeof config.timeoutMs !== 'number' || !Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0) {
        throw new Error(
          `MoodleClientConfig.timeoutMs must be a positive finite number, received: ${String(config.timeoutMs)}`
        );
      }
      this.timeoutMs = config.timeoutMs;
    } else {
      this.timeoutMs = 30_000;
    }
    this.fetchImpl = config.fetch || globalThis.fetch;
  }

  /**
   * Executes an HTTP POST request to Moodle's REST Web Service endpoint (R7, R8, R13).
   *
   * @param wsfunction Moodle external web service function name
   * @param formParams Serialized external function arguments
   * @returns Parsed JSON response body on success
   * @throws MoodleClientError subclass on failure
   */
  async post(wsfunction: string, formParams?: URLSearchParams): Promise<unknown> {
    const body = new URLSearchParams();
    body.append('wstoken', this.token);
    body.append('wsfunction', wsfunction);
    body.append('moodlewsrestformat', 'json');

    if (formParams) {
      for (const [key, value] of formParams.entries()) {
        body.append(key, value);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        throw new MoodleNetworkError(
          `Moodle request to '${wsfunction}' timed out after ${this.timeoutMs}ms`,
          err
        );
      }
      throw new MoodleNetworkError(
        `Failed to connect to Moodle Web Service for '${wsfunction}': ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    } finally {
      clearTimeout(timer);
    }

    let rawText: string;
    try {
      rawText = await response.text();
    } catch (err: unknown) {
      throw new MoodleNetworkError(
        `Failed to read response body from Moodle for '${wsfunction}'`,
        err
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      if (!response.ok) {
        throw new MoodleApiError(
          `Moodle HTTP ${response.status} error for '${wsfunction}' with non-JSON body`,
          { status: response.status }
        );
      }
      throw new MoodleResponseError(
        `Moodle returned non-JSON response (HTTP ${response.status}) for '${wsfunction}'`,
        { status: response.status }
      );
    }

    // R7: Moodle exception payloads can be returned on HTTP 200 or HTTP error status
    if (isRawMoodleException(parsed)) {
      throw normalizeMoodleError(parsed, response.status);
    }

    if (!response.ok) {
      throw normalizeMoodleError(parsed, response.status);
    }

    return parsed;
  }
}
