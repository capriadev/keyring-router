import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotFoundException } from '@nestjs/common';
import { DomainError, InvalidInputError, NamespaceTakenError, type DomainErrorCode } from '../bll/errors.js';
import { ProviderFailure } from '../types/provider.js';
import { InvalidBodyError, resolveApiError } from './api-errors.js';

const STATUS_PER_CODE: Record<DomainErrorCode, number> = {
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
  invalid_routing_profile: 400,
  routing_profile_not_found: 404,
};

describe('resolveApiError', () => {
  it('maps every business failure to a stable code and status', () => {
    for (const [code, status] of Object.entries(STATUS_PER_CODE) as [DomainErrorCode, number][]) {
      assert.deepEqual(resolveApiError(new DomainError(code, 'boom')), { status, code, message: 'boom' });
    }
  });

  it('keeps the message of a business failure', () => {
    assert.equal(resolveApiError(new NamespaceTakenError('local')).message, 'namespace already taken: local');
    assert.equal(resolveApiError(new InvalidInputError('nope')).status, 400);
  });

  it('maps a provider failure to 502 without rewriting its normalized message', () => {
    const failure = new ProviderFailure('ollama', 'unreachable', 'Ollama did not answer GET /api/tags');

    assert.deepEqual(resolveApiError(failure), {
      status: 502,
      code: 'provider_failure',
      message: 'Ollama did not answer GET /api/tags',
    });
  });

  it('maps a rejected request to 400 invalid_body', () => {
    assert.deepEqual(resolveApiError(new InvalidBodyError('namespace: too small')), {
      status: 400,
      code: 'invalid_body',
      message: 'invalid request: namespace: too small',
    });
  });

  it('maps an unknown route to 404', () => {
    assert.deepEqual(resolveApiError(new NotFoundException('Cannot GET /api/nope')), {
      status: 404,
      code: 'route_not_found',
      message: 'unknown route',
    });
  });

  it('never leaks the message of an unexpected failure', () => {
    const leaky = new Error('failed to open file with token sk-live-1234567890');

    assert.deepEqual(resolveApiError(leaky), {
      status: 500,
      code: 'internal_error',
      message: 'unexpected server error',
    });
    assert.equal(resolveApiError('boom').status, 500);
    assert.equal(resolveApiError(undefined).code, 'internal_error');
  });
});
