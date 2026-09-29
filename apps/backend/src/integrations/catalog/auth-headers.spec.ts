import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AuthHeaderError, buildAuthHeaders, withQuery } from './auth-headers.js';

const SECRET = 'kr-secret-9f8e7d6c';

describe('buildAuthHeaders', () => {
  it('sends nothing for authType none, with or without a header name', () => {
    assert.deepEqual(buildAuthHeaders({ authType: 'none' }), { headers: {}, query: {} });
    assert.deepEqual(buildAuthHeaders({ authType: 'none', authHeader: 'x-api-key' }), {
      headers: {},
      query: {},
    });
  });

  it('refuses a secret for authType none instead of sending it nowhere', () => {
    assert.throws(
      () => buildAuthHeaders({ authType: 'none', secret: SECRET }),
      (error: unknown) => error instanceof AuthHeaderError && !String(error.message).includes(SECRET),
    );
  });

  it('sends Authorization: Bearer for authType bearer', () => {
    assert.deepEqual(buildAuthHeaders({ authType: 'bearer', secret: SECRET }), {
      headers: { Authorization: `Bearer ${SECRET}` },
      query: {},
    });
  });

  it('honours the bearer header name and prefix a catalog entry declares', () => {
    assert.deepEqual(
      buildAuthHeaders({ authType: 'bearer', authHeader: 'X-Auth', authPrefix: 'Token ', secret: SECRET }),
      { headers: { 'X-Auth': `Token ${SECRET}` }, query: {} },
    );
  });

  it('sends the declared header name for authType x-api-key', () => {
    assert.deepEqual(buildAuthHeaders({ authType: 'x-api-key', secret: SECRET }).headers, {
      'x-api-key': SECRET,
    });

    assert.deepEqual(
      buildAuthHeaders({ authType: 'x-api-key', authHeader: 'x-goog-api-key', secret: SECRET }).headers,
      { 'x-goog-api-key': SECRET },
    );
  });

  it('sends a literal prefix verbatim, as a scheme such as Key requires', () => {
    assert.deepEqual(
      buildAuthHeaders({
        authType: 'x-api-key',
        authHeader: 'Authorization',
        authPrefix: 'Key ',
        secret: SECRET,
      }).headers,
      { Authorization: `Key ${SECRET}` },
    );
  });

  it('places the credential in the query for authType query, and in no header', () => {
    assert.deepEqual(buildAuthHeaders({ authType: 'query', secret: SECRET }), {
      headers: {},
      query: { key: SECRET },
    });

    assert.deepEqual(buildAuthHeaders({ authType: 'query', authHeader: 'api_key', secret: SECRET }).query, {
      api_key: SECRET,
    });
  });

  it('sends no credential while none can be stored, instead of a malformed header', () => {
    for (const authType of ['bearer', 'x-api-key', 'query'] as const) {
      assert.deepEqual(buildAuthHeaders({ authType }), { headers: {}, query: {} });
      assert.deepEqual(buildAuthHeaders({ authType, secret: '' }), { headers: {}, query: {} });
    }
  });

  it('fails loudly on an auth type it does not implement', () => {
    assert.throws(
      () => buildAuthHeaders({ authType: 'cookie' as never, secret: SECRET }),
      AuthHeaderError,
    );
  });
});

describe('withQuery', () => {
  it('adds the credential parameter and keeps an existing query intact', () => {
    assert.equal(
      withQuery('https://example.test/v1/models?alt=sse', { key: SECRET }),
      `https://example.test/v1/models?alt=sse&key=${SECRET}`,
    );
  });

  it('returns the URL untouched when the scheme places nothing in the query', () => {
    assert.equal(withQuery('https://example.test/v1/models', {}), 'https://example.test/v1/models');
  });
});
