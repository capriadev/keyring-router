import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import {
  createCredential,
  listCredentials,
  refreshCredential,
  rotateCredentialSecret,
  validateCredential,
} from './credentials';
import { jsonResponse, restoreFetch, sentRequests, stubFetch } from './fetch-stub';

afterEach(restoreFetch);

/** What the gateway answers with for one credential: the secret is never part of this shape. */
const CREDENTIAL = {
  id: 'credential-1',
  namespace: 'local-main',
  providerId: 'ollama',
  baseUrl: 'http://127.0.0.1:11434',
  authKind: 'api_key',
  secretHint: 'cdef',
  lastValidatedAt: null,
  lastRefreshAt: null,
  lastRefreshError: null,
  createdAt: 1,
};

describe('credential requests', () => {
  it('reads the list with a GET that carries no body', async () => {
    stubFetch(() => jsonResponse(200, { credentials: [] }));

    await listCredentials();

    assert.ok(sentRequests()[0].url.endsWith('/api/credentials'));
    assert.equal(sentRequests()[0].init?.method, 'GET');
    assert.equal(sentRequests()[0].init?.body, undefined);
  });

  it('creates with a POST that carries the namespace, the provider and the secret', async () => {
    stubFetch(() => jsonResponse(201, CREDENTIAL));

    await createCredential({
      namespace: 'local-main',
      providerId: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      authKind: 'api_key',
      secret: 'secret-value',
    });

    assert.equal(sentRequests()[0].url.endsWith('/api/credentials'), true);
    assert.equal(sentRequests()[0].init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(sentRequests()[0].init?.body)), {
      namespace: 'local-main',
      providerId: 'ollama',
      baseUrl: 'http://127.0.0.1:11434',
      authKind: 'api_key',
      secret: 'secret-value',
    });
  });

  it('validates and refreshes with a POST on the action path and no body', async () => {
    stubFetch(() => jsonResponse(200, { ok: true, detail: 'reachable' }));
    await validateCredential('credential-1');
    const validation = sentRequests()[0];

    stubFetch(() => jsonResponse(200, { credentialId: 'credential-1', discovered: 3, exposed: 1 }));
    await refreshCredential('credential-1');
    const refresh = sentRequests()[0];

    assert.ok(validation.url.endsWith('/api/credentials/credential-1/validate'));
    assert.equal(validation.init?.method, 'POST');
    assert.equal(validation.init?.body, undefined);
    assert.ok(refresh.url.endsWith('/api/credentials/credential-1/refresh'));
    assert.equal(refresh.init?.method, 'POST');
  });

  it('rotates with a PATCH that sends the new secret and nothing else', async () => {
    stubFetch(() => jsonResponse(200, CREDENTIAL));

    const rotated = await rotateCredentialSecret('credential-1', 'new-secret-value');

    assert.ok(sentRequests()[0].url.endsWith('/api/credentials/credential-1/secret'));
    assert.equal(sentRequests()[0].init?.method, 'PATCH');
    assert.deepEqual(JSON.parse(String(sentRequests()[0].init?.body)), {
      secret: 'new-secret-value',
    });
    assert.equal(rotated.secretHint, 'cdef');
    assert.equal(
      JSON.stringify(rotated).includes('new-secret-value'),
      false,
      'the secret must never come back in the answer',
    );
  });

  it('encodes the identifier it puts in the path', async () => {
    stubFetch(() => jsonResponse(200, CREDENTIAL));

    await rotateCredentialSecret('credential/with slash', 'new-secret-value');

    assert.equal(sentRequests()[0].url.endsWith('/api/credentials/credential%2Fwith%20slash/secret'), true);
  });
});
