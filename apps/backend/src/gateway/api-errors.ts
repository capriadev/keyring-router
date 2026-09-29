import { HttpException } from '@nestjs/common';
import type { ApiErrorCode as ContractApiErrorCode } from '@keyring-router/contracts';
import { DomainError, type DomainErrorCode } from '../bll/errors.js';
import { redact } from '../bll/credentials/redaction.js';
import { RoutingError, type RoutingErrorCode } from '../bll/routing/errors.js';
import { ProviderFailure } from '../types/provider.js';

/**
 * The codes this gateway can answer with. The union is declared here because the status map below is built
 * from the domain and routing codes, and the contract declares the same list for clients.
 *
 * The two assertions under it are what keeps the declarations from drifting: a code added here and not
 * there, or the other way round, stops this file from compiling. The audit found that link missing, and
 * proved it by adding a code to this union without a single workspace noticing.
 */
export type ApiErrorCode =
  | DomainErrorCode
  | RoutingErrorCode
  | 'invalid_body'
  | 'provider_failure'
  | 'route_not_found'
  | 'request_rejected'
  | 'internal_error';

type AssertAssignable<From extends To, To> = From;
type GatewayCodesAreContractCodes = AssertAssignable<ApiErrorCode, ContractApiErrorCode>;
type ContractCodesAreGatewayCodes = AssertAssignable<ContractApiErrorCode, ApiErrorCode>;

const INTERNAL_MESSAGE = 'unexpected server error';

/** HTTP status per business failure. bll raises the code, the gateway owns the status. */
const DOMAIN_ERROR_STATUS: Record<DomainErrorCode, number> = {
  invalid_input: 400,
  namespace_taken: 409,
  auth_kind_unsupported: 422,
  unsupported_provider: 400,
  credential_not_found: 404,
  secret_not_found: 409,
  secret_undecryptable: 422,
  secret_key_unavailable: 422,
  policy_not_found: 404,
  invalid_policy_rule: 400,
};

/** HTTP status per routing failure. A model the facade cannot serve is not a client mistake. */
const ROUTING_ERROR_STATUS: Record<RoutingErrorCode, number> = {
  model_not_found: 404,
  chat_not_supported: 422,
  invalid_chat_request: 400,
};

/**
 * A provider id that does not exist is a missing resource when the path named it - `GET
 * /api/providers/:id` - and a wrong reference when it arrived inside a body, which is what creating a
 * credential with an unknown provider is. Only the lookup status differs, so the code stays the same.
 */
const LOOKUP_METHOD = 'GET';

/**
 * Route facts a status may depend on. They are read from the request, never from the failure, because
 * bll raises a code and the gateway decides what an HTTP status means for it.
 */
export interface ErrorRequestContext {
  readonly method?: string;
}

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

/**
 * Maps any thrown value to the body every non-2xx response uses. Every message leaves through the
 * redaction module, so a value that reached a message by accident still never reaches a client.
 */
export function resolveApiError(exception: unknown, context: ErrorRequestContext = {}): ResolvedApiError {
  if (exception instanceof DomainError) {
    return {
      status: domainErrorStatus(exception.code, context),
      code: exception.code,
      message: redact(exception.message),
    };
  }

  if (exception instanceof RoutingError) {
    return {
      status: ROUTING_ERROR_STATUS[exception.code],
      code: exception.code,
      message: redact(exception.message),
    };
  }

  if (exception instanceof ProviderFailure) {
    return { status: 502, code: 'provider_failure', message: redact(exception.message) };
  }

  if (exception instanceof InvalidBodyError) {
    return { status: 400, code: 'invalid_body', message: redact(exception.message) };
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

/** The status of a business failure, which is the table plus the one lookup case. */
function domainErrorStatus(code: DomainErrorCode, context: ErrorRequestContext): number {
  if (code === 'unsupported_provider' && context.method === LOOKUP_METHOD) {
    return 404;
  }

  return DOMAIN_ERROR_STATUS[code];
}
