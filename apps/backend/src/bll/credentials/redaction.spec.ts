import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { randomSecret } from '../../dal/testing/secret-fixtures.js';
import { BACKEND_ROOT } from '../../config/paths.js';
import { REDACTED, clearRegisteredSecrets, redact, registerSecret } from './redaction.js';

describe('redact', () => {
  afterEach(() => {
    clearRegisteredSecrets();
  });

  it('removes a registered secret from any text it could travel in', () => {
    const secret = randomSecret();
    registerSecret(secret);

    const texts = [
      `header value ${secret}`,
      `{"secret":"${secret}"}`,
      `token=${secret}`,
      JSON.stringify({ nested: { deep: [secret] } }),
      `error: could not authenticate with ${secret} against the provider`,
    ];

    for (const text of texts) {
      const redacted = redact(text);

      assert.equal(redacted.includes(secret), false);
      assert.match(redacted, /\[redacted\]/);
    }
  });

  it('removes the longest registered value first, so no fragment survives', () => {
    const secret = randomSecret();
    registerSecret(secret);
    registerSecret(secret.slice(0, 10));

    assert.equal(redact(`value ${secret}`).includes(secret.slice(0, 10)), false);
  });

  it('redacts an authorization header even when the value was never registered', () => {
    const token = randomSecret();

    assert.equal(redact(`Authorization: Bearer ${token}`).includes(token), false);
    assert.equal(redact(`x-api-key: ${token}`).includes(token), false);
    assert.equal(redact(`authorization=${token}`).includes(token), false);
  });

  it('redacts a secret shaped json field', () => {
    const token = randomSecret();
    const redacted = redact(`{"apiKey":"${token}","provider":"openai"}`);

    assert.equal(redacted.includes(token), false);
    assert.equal(redacted.includes('openai'), true);
  });

  it('redacts long key shaped runs that were never registered', () => {
    const long = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0';

    assert.equal(redact(`value ${long}`).includes(long), false);
  });

  it('leaves ordinary diagnostics alone', () => {
    const text =
      'namespace already taken: local | unknown credential: 4f0b1f5e-0f0e-4a6b-9c2c-2b9b6a1d0c33 | model local/qwen2.5:7b';

    assert.equal(redact(text), text);
  });

  it('keeps the registry bounded', () => {
    const secrets = Array.from({ length: 130 }, () => randomSecret());
    const oldest = secrets[0] ?? '';
    const newest = secrets[129] ?? '';

    for (const secret of secrets) {
      registerSecret(secret);
    }

    // The oldest value was evicted and survives in the text; the newest one is still covered.
    assert.equal(redact(oldest), oldest);
    assert.equal(redact(newest), REDACTED);
  });

  it('ignores values shorter than a storable secret, which would redact ordinary words', () => {
    registerSecret('local');

    assert.equal(redact('unknown credential in namespace local'), 'unknown credential in namespace local');
  });

  it('never writes a secret to a fixture or to any file of the source tree', () => {
    const secret = randomSecret(32);
    const roots = [join(BACKEND_ROOT, 'src'), join(BACKEND_ROOT, 'drizzle')];
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of readdirSync(root, { recursive: true, withFileTypes: true })) {
        if (!file.isFile()) {
          continue;
        }

        const path = join(file.parentPath, file.name);

        if (readFileSync(path, 'utf8').includes(secret)) {
          offenders.push(path);
        }
      }
    }

    assert.deepEqual(offenders, []);
  });
});
