import type { ClaudeErrorBody, OpenAiErrorBody } from '../types/api.js';
import type { ResolvedApiError } from './api-errors.js';

/**
 * Which wire shape an error takes. The `/v1` surface answers a Claude shaped client in the Messages
 * API shape and everything else in the OpenAI shape; `/api` keeps the gateway's own body. The path is
 * the only thing that decides, because one global filter serves all three surfaces.
 */
export type ErrorSurface = 'api' | 'openai' | 'claude';

export function errorSurfaceFor(url: string | undefined): ErrorSurface {
  if (url === undefined) {
    return 'api';
  }

  const path = url.split('?')[0] ?? '';

  if (path === '/v1/messages') {
    return 'claude';
  }

  return path.startsWith('/v1/') ? 'openai' : 'api';
}

/**
 * The OpenAI error shape. `param` is null because a failure is never attributed to a single client
 * field here: the stable `code` carries what a caller has to branch on, and the message names the
 * field a provider refused when there is one.
 */
export function toOpenAiErrorBody(error: ResolvedApiError): OpenAiErrorBody {
  return {
    error: {
      message: error.message,
      type: openAiErrorType(error),
      param: null,
      code: error.code,
    },
  };
}

/** The Messages API error shape. */
export function toClaudeErrorBody(error: ResolvedApiError): ClaudeErrorBody {
  return {
    type: 'error',
    error: {
      type: claudeErrorType(error),
      message: error.message,
    },
  };
}

function openAiErrorType(error: ResolvedApiError): string {
  if (error.status === 401) {
    return 'authentication_error';
  }

  if (error.status === 429) {
    return 'rate_limit_error';
  }

  return error.status >= 500 ? 'server_error' : 'invalid_request_error';
}

function claudeErrorType(error: ResolvedApiError): string {
  switch (error.status) {
    case 401:
      return 'authentication_error';
    case 403:
      return 'permission_error';
    case 404:
      return 'not_found_error';
    case 429:
      return 'rate_limit_error';
    default:
      return error.status >= 500 ? 'api_error' : 'invalid_request_error';
  }
}