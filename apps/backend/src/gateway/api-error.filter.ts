import { Catch, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ApiErrorBody } from '../types/api.js';
import { resolveApiError } from './api-errors.js';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<FastifyReply>();
    const error = resolveApiError(exception);

    if (error.code === 'internal_error') {
      // Name only: a message could carry transport or provider details.
      this.logger.error(`unhandled error: ${exception instanceof Error ? exception.name : typeof exception}`);
    }

    const body: ApiErrorBody = { error: { code: error.code, message: error.message } };

    void response.status(error.status).send(body);
  }
}
