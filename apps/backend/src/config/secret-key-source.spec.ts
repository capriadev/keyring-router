import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SALT_BYTES } from './secrets.env.js';
import { createSecretKeySource } from './secret-key-source.js';
import { OTHER_PEPPER, TEST_PEPPER, randomSalt, testKeyringConfig } from '../dal/testing/secret-fixtures.js';

/** The derived key is the AES-256 key length. */
const KEY_BYTES = 32;

describe('createSecretKeySource', () => {
  it('reports whether the installation has a pepper', () => {
    assert.equal(createSecretKeySource(testKeyringConfig(), randomSalt).hasPepper, true);
    assert.equal(createSecretKeySource(testKeyringConfig(null), randomSalt).hasPepper, false);
  });

  it('derives no key without a pepper, instead of failing at boot', () => {
    assert.equal(createSecretKeySource(testKeyringConfig(null), randomSalt).key(), null);
  });

  it('derives a 32 byte key from the pepper and the stored salt', () => {
    const source = createSecretKeySource(testKeyringConfig(), randomSalt);

    assert.equal(source.key()?.length, KEY_BYTES);
  });

  it('is deterministic for the same pepper and salt and derives once per process', () => {
    let reads = 0;
    const salt = randomSalt();
    const source = createSecretKeySource(testKeyringConfig(), () => {
      reads += 1;
      return salt;
    });

    const first = source.key();
    const second = source.key();

    assert.equal(reads, 1);
    assert.deepEqual([...(first ?? [])], [...(second ?? [])]);
    assert.deepEqual(
      [...(first ?? [])],
      [...(createSecretKeySource(testKeyringConfig(), () => salt).key() ?? [])],
    );
  });

  it('derives a different key for a different pepper, which is what makes a wrong pepper fail', () => {
    const salt = randomSalt();

    assert.notDeepEqual(
      [...(createSecretKeySource(testKeyringConfig(), () => salt).key() ?? [])],
      [...(createSecretKeySource(testKeyringConfig(OTHER_PEPPER), () => salt).key() ?? [])],
    );
  });

  it('refuses a stored salt that is not the expected length', () => {
    assert.equal(Buffer.from('short', 'base64').length === SALT_BYTES, false);
    assert.throws(() => createSecretKeySource(testKeyringConfig(TEST_PEPPER), () => 'short').key(), /install salt/);
  });
});
