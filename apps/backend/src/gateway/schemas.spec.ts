import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ArgumentMetadata } from '@nestjs/common';
import { InvalidBodyError } from './api-errors.js';
import { catalogQuerySchema, createCredentialBodySchema, createPolicyBodySchema, idParamsSchema } from './schemas.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const body: ArgumentMetadata = { type: 'body' };

const validCredential = {
  namespace: 'local',
  providerId: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  authKind: 'none',
};

describe('createCredentialBodySchema', () => {
  it('accepts the body of the first slice', () => {
    assert.deepEqual(createCredentialBodySchema.parse(validCredential), validCredential);
  });

  it('refuses a secret instead of dropping it', () => {
    assert.equal(createCredentialBodySchema.safeParse({ ...validCredential, secret: 'plain-text-value' }).success, false);
  });

  it('refuses an unknown provider or auth kind', () => {
    assert.equal(createCredentialBodySchema.safeParse({ ...validCredential, providerId: 'gemini' }).success, false);
    assert.equal(createCredentialBodySchema.safeParse({ ...validCredential, authKind: 'oauth' }).success, false);
  });
});

describe('createPolicyBodySchema', () => {
  it('accepts a global rule and a credential scoped rule', () => {
    assert.deepEqual(createPolicyBodySchema.parse({ pattern: 'local/*', effect: 'allow' }), { pattern: 'local/*', effect: 'allow' });
    assert.deepEqual(createPolicyBodySchema.parse({ credentialId: 'cred', pattern: '*', effect: 'deny' }), {
      credentialId: 'cred',
      pattern: '*',
      effect: 'deny',
    });
    assert.deepEqual(createPolicyBodySchema.parse({ credentialId: null, pattern: '*', effect: 'deny' }), {
      credentialId: null,
      pattern: '*',
      effect: 'deny',
    });
  });

  it('refuses an empty pattern and an unknown effect', () => {
    assert.equal(createPolicyBodySchema.safeParse({ pattern: '', effect: 'allow' }).success, false);
    assert.equal(createPolicyBodySchema.safeParse({ pattern: 'local/*', effect: 'maybe' }).success, false);
  });
});

describe('idParamsSchema and catalogQuerySchema', () => {
  it('refuses an empty id', () => {
    assert.equal(idParamsSchema.safeParse({ id: '' }).success, false);
    assert.equal(idParamsSchema.safeParse({}).success, false);
  });

  it('accepts an empty query and a credential filter', () => {
    assert.deepEqual(catalogQuerySchema.parse({}), {});
    assert.deepEqual(catalogQuerySchema.parse({ credentialId: 'cred' }), { credentialId: 'cred' });
    assert.equal(catalogQuerySchema.safeParse({ credentialId: '' }).success, false);
  });
});

describe('ZodValidationPipe', () => {
  it('returns the parsed value', () => {
    assert.deepEqual(new ZodValidationPipe(idParamsSchema).transform({ id: 'abc' }, { type: 'param' }), { id: 'abc' });
  });

  it('reports the offending field without echoing its value', () => {
    const pipe = new ZodValidationPipe(createCredentialBodySchema);

    assert.throws(
      () => pipe.transform({ ...validCredential, secret: 'plain-text-value' }, body),
      (error: unknown) => {
        assert.ok(error instanceof InvalidBodyError);
        assert.match(error.message, /secret/);
        assert.equal(error.message.includes('plain-text-value'), false);
        return true;
      },
    );
  });

  it('refuses a missing body', () => {
    assert.throws(() => new ZodValidationPipe(createCredentialBodySchema).transform(undefined, body), InvalidBodyError);
  });
});
