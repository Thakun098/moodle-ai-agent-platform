import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  MoodleAuthenticationError,
  MoodleAuthorizationError,
  MoodleClientError,
  MoodleConflictError,
  MoodleInvalidParameterError,
  MoodleNetworkError,
  MoodleResourceNotFoundError,
  MoodleResponseError,
} from '@moodle-agent-poc/moodle-client';
import { z } from 'zod';
import type { McpErrorPayload, McpSuccessPayload } from './types.js';

/**
 * Redacts any sensitive token strings or patterns from message text (R14, P9-D5).
 */
export function redactSensitiveTokens(text: string, knownToken?: string): string {
  let sanitized = text;
  if (knownToken && knownToken.length >= 4) {
    sanitized = sanitized.split(knownToken).join('[REDACTED_TOKEN]');
  }
  // Also redact common token query patterns like wstoken=... or token=...
  sanitized = sanitized.replace(/(wstoken|token)=([a-zA-Z0-9_\-]+)/gi, '$1=[REDACTED_TOKEN]');
  return sanitized;
}

/**
 * Builds a standardized successful CallToolResult with dual structuredContent and text summary.
 */
export function formatMcpSuccess<T extends Record<string, unknown> | Array<unknown>>(
  data: T,
  summary: string
): CallToolResult {
  const structured: McpSuccessPayload<T> = {
    status: 'success',
    data,
  };

  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: structured as unknown as Record<string, unknown>,
    isError: false,
  };
}

/**
 * Translates domain errors or validation failures to structured MCP error results with sanitized messages.
 */
export function formatMcpError(error: unknown, tokenToRedact?: string): CallToolResult {
  let code = 'INTERNAL_ERROR';
  let message = 'An internal error occurred while processing the tool request';
  let details: unknown = undefined;

  if (error instanceof z.ZodError) {
    code = 'INVALID_ARGUMENTS';
    const issues = (error as z.ZodError).issues || [];
    message = issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    details = issues;
  } else if (error instanceof MoodleResourceNotFoundError) {
    code = 'RESOURCE_NOT_FOUND';
    message = error.message;
  } else if (error instanceof MoodleInvalidParameterError) {
    code = 'INVALID_PARAMETER';
    message = error.message;
  } else if (error instanceof MoodleConflictError) {
    code = 'CONFLICT';
    message = error.message;
  } else if (error instanceof MoodleAuthenticationError) {
    code = 'AUTH_ERROR';
    message = 'Authentication failed with Moodle Web Services';
  } else if (error instanceof MoodleAuthorizationError) {
    code = 'PERMISSION_DENIED';
    message = error.message;
  } else if (error instanceof MoodleNetworkError) {
    code = 'NETWORK_ERROR';
    message = error.message;
  } else if (error instanceof MoodleResponseError) {
    code = 'INVALID_RESPONSE';
    message = error.message;
  } else if (error instanceof MoodleClientError) {
    code = 'MOODLE_API_ERROR';
    message = error.message;
  } else {
    // Arbitrary unexpected error: keep diagnostics useful without echoing a raw
    // message or stack that may contain a token or other sensitive data.
    console.error('[moodle-mcp-server] Unexpected internal error (details withheld)');
  }

  // Redact any possible token occurrence
  message = redactSensitiveTokens(message, tokenToRedact);

  const structured: McpErrorPayload = {
    status: 'error',
    code,
    message,
    ...(details ? { details } : {}),
  };

  return {
    content: [{ type: 'text', text: `Error [${code}]: ${message}` }],
    structuredContent: structured as unknown as Record<string, unknown>,
    isError: true,
  };
}
