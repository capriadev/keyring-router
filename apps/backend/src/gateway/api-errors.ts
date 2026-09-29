import { HttpException } from '@nestjs/common';
import { DomainError, type DomainErrorCode } from '../bll/errors.js';
import { ProviderFailure } from '../types/provider.js';

export type ApiErrorCode =
  | DomainErrorCode
  | 'invalid_body'
  | 'provider_failure'
  | 'route_not_found'
  | 'request_rejected'
  | 'internal_error';

const INTERNAL_MESSAGE = 'unexpected server error';

/** HTTP status per business failure. bll raises the code, the gateway owns the status. */
const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  invalid_input: 400,
  namespace_taken: 409,
  auth_kind_unsupported: 422,
  unsupported_provider: 400,
  credential_not_found: 404,
  policy_not_found: 404,
  invalid_policy_rule: 400,
};

/** Raised by the zod pipe when a body, query or param does not match its schema. */
export class InvalidBodyError extends Error {
  constructor(readonly detail: string) {
    super(`invalid request: ${detail}`);
    this.name = 'InvalidBodyError';
  }
}

export interface ResolvedApiError {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
}

/** Maps any thrown value to the body every non-2xx response uses. */
export function resolveApiError(exception: unknown): ResolvedApiError {
  if (exception instanceof DomainError) {
    return {
      status: DOMAIN_ERROR_STATUS[exception.code],
      code: exception.code,
      message: exception.message,
    };
  }

  if (exception instanceof ProviderFailure) {
    return { status: 502, code: 'provider_failure', message: exception.message };
  }

  if (exception instanceof InvalidBodyError) {
    return { status: 400, code: 'invalid_body', message: exception.message };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();

    if (status === 404) {
      return { status, code: 'route_not_found', message: 'unknown route' };
    }

    if (status >= 500) {
      return { status: 500, code: 'internal_error', message: INTERNAL_MESSAGE };
    }

    return { status, code: 'request_rejected', message: `request rejected with status ${status}` };
  }

  return { status: 500, code: 'internal_error', message: INTERNAL_MESSAGE };
}
