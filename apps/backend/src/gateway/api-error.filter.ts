import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { redact } from '../bll/credentials/redaction.js';
import type { ApiErrorBody } from '../types/api.js';
import { resolveApiError, type ErrorRequestContext } from './api-errors.js';
import { errorSurfaceFor, toClaudeErrorBody, toOpenAiErrorBody } from './v1-errors.js';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<FastifyReply>();
    const error = resolveApiError(exception, readContext(host));

    if (error.code === 'internal_error') {
      // Name only, redacted: a message could carry transport or provider details.
      const detail = exception instanceof Error ? exception.name : typeof exception;

      this.logger.error(redact(`unhandled error: ${detail}`));
    }

    void response.status(error.status).send(bodyFor(host, error));
  }
}

/** The error body of the surface the failed request belongs to. */
function bodyFor(host: ArgumentsHost, error: ReturnType<typeof resolveApiError>): unknown {
  switch (errorSurfaceFor(readUrl(host))) {
    case 'openai':
      return toOpenAiErrorBody(error);
    case 'claude':
      return toClaudeErrorBody(error);
    default: {
      const body: ApiErrorBody = { error: { code: error.code, message: error.message } };

      return body;
    }
  }
}

function requestOf(host: ArgumentsHost): { method?: unknown; url?: unknown } | undefined {
  try {
    return host.switchToHttp().getRequest<{ method?: unknown; url?: unknown }>();
  } catch {
    // A host with no request carries no route facts, which is the same as unknown ones.
    return undefined;
  }
}

function readContext(host: ArgumentsHost): ErrorRequestContext {
  const request = requestOf(host);

  return typeof request?.method === 'string' ? { method: request.method } : {};
}

function readUrl(host: ArgumentsHost): string | undefined {
  const request = requestOf(host);

  return typeof request?.url === 'string' ? request.url : undefined;
}
