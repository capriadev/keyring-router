import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { StoredSecret } from '../../types/credential.js';
import { OTHER_PEPPER, randomSalt, randomSecret, testKeySource } from '../../dal/testing/secret-fixtures.js';
import { InvalidInputError, SecretKeyUnavailableError, SecretUndecryptableError } from '../errors.js';
import { nextSecretVersion, openSecret, requireSecretKey, sealSecret, secretHint } from './secrets.js';

function key(pepper?: string): Buffer {
  return requireSecretKey(testKeySource(() => randomSalt(), pepper));
}

/** Flips one bit of a base64 field, which is exactly what corruption looks like. */
function flip(value: string): string {
  const bytes = Buffer.from(value, 'base64');
  const first = bytes[0] ?? 0;

  bytes[0] = first ^ 0x01;

  return bytes.toString('base64');
}

describe('sealSecret and openSecret', () => {
  it('round trips a representative set of secrets', () => {
    const source = key();
    const secrets = [
      randomSecret(),
      'sk-proj-0123456789abcdefghijklmnopqrstuvwxyz',
      'clave con espacios y acentos: nino, arbol, corazon',
      'unicode: \u03a9\u03bb\u03bc\u03c0 \u4e2d\u6587 \ud83d\udd11',
      'x'.repeat(4096),
    ];

    for (const secret of secrets) {
      const stored = sealSecret(source, secret, 1);

      assert.equal(openSecret(source, stored), secret);
    }
  });

  it('never reuses an IV and never repeats a ciphertext', () => {
    const source = key();
    const secret = randomSecret();
    const first = sealSecret(source, secret, 1);
    const second = sealSecret(source, secret, 1);

    assert.notEqual(first.secretIv, second.secretIv);
    assert.notEqual(first.secretCiphertext, second.secretCiphertext);
    assert.equal(Buffer.from(first.secretIv, 'base64').length, 12);
    assert.equal(Buffer.from(first.secretTag, 'base64').length, 16);
    assert.equal(openSecret(source, second), secret);
  });

  it('does not carry the plaintext in the stored fields', () => {
    const source = key();
    const secret = randomSecret();
    const stored = sealSecret(source, secret, 1);

    const serialized = JSON.stringify(stored);

    assert.equal(serialized.includes(secret), false);
    assert.equal(stored.secretCiphertext.includes(secret), false);
    assert.equal(stored.secretTag.includes(secret), false);
  });

  it('fails loudly when one byte of the ciphertext, the IV, the tag or the version changes', () => {
    const source = key();
    const stored = sealSecret(source, randomSecret(), 1);

    const tampered: StoredSecret[] = [
      { ...stored, secretCiphertext: flip(stored.secretCiphertext) },
      { ...stored, secretIv: flip(stored.secretIv) },
      { ...stored, secretTag: flip(stored.secretTag) },
      { ...stored, secretVersion: stored.secretVersion + 1 },
    ];

    for (const variant of tampered) {
      assert.throws(() => openSecret(source, variant), SecretUndecryptableError);
    }
  });

  it('fails on a truncated ciphertext instead of returning partial plaintext', () => {
    const source = key();
    const secret = randomSecret(64);
    const stored = sealSecret(source, secret, 1);
    const truncated = Buffer.from(stored.secretCiphertext, 'base64').subarray(0, 16).toString('base64');

    assert.throws(() => openSecret(source, { ...stored, secretCiphertext: truncated }), SecretUndecryptableError);
  });

  it('fails on an IV of the wrong length', () => {
    const source = key();
    const stored = sealSecret(source, randomSecret(), 1);

    assert.throws(() => openSecret(source, { ...stored, secretIv: 'AAAA' }), SecretUndecryptableError);
  });

  it('fails with a wrong pepper, as a credential problem', () => {
    const secret = randomSecret();
    const stored = sealSecret(key(), secret, 1);

    assert.throws(() => openSecret(key(OTHER_PEPPER), stored), SecretUndecryptableError);
    assert.throws(
      () => openSecret(key(OTHER_PEPPER), stored),
      (error: unknown) => {
        assert.ok(error instanceof SecretUndecryptableError);
        assert.equal(error.code, 'secret_undecryptable');
        assert.equal(error.message.includes(secret), false);
        return true;
      },
    );
  });

  it('reports a missing pepper as a key problem rather than an auth failure', () => {
    assert.throws(() => requireSecretKey(testKeySource(randomSalt, null)), SecretKeyUnavailableError);
  });
});

describe('secretHint and nextSecretVersion', () => {
  it('keeps the last four characters, in code points', () => {
    assert.equal(secretHint('abcdefgh'), 'efgh');
    assert.equal(secretHint('\u03a9\u03bb\u03bc\u03c0x'), '\u03bb\u03bc\u03c0x');

    const secret = randomSecret();

    assert.equal(secretHint(secret), Array.from(secret).slice(-4).join(''));
    assert.equal(secretHint('1234').length, 4);
  });

  it('never echoes more than the last four characters', () => {
    const secret = randomSecret();

    assert.equal(secretHint(secret).length, 4);
    assert.equal(secret.startsWith(secretHint(secret)), false);
  });

  it('stamps the first secret as version 1 and every rotation as the next one', () => {
    assert.equal(nextSecretVersion(null), 1);
    assert.equal(nextSecretVersion(1), 2);
    assert.equal(nextSecretVersion(41), 42);
  });
});

describe('assertSecretValue through sealSecret', () => {
  it('refuses a blank, padded or out of range secret', () => {
    const source = key();

    for (const value of ['', '   ', ' short ', ` ${randomSecret()}`, `${randomSecret()} `, 'abc', randomSecret(5000)]) {
      assert.throws(() => sealSecret(source, value, 1), InvalidInputError);
    }
  });
});
