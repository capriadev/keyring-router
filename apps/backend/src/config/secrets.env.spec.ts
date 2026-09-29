import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  DEFAULT_ARGON2_PARAMS,
  MissingPepperError,
  PEPPER_VARIABLE,
  SALT_BYTES,
  assertPepperWhenSecretsExist,
  loadSecretKeyringConfig,
} from './secrets.env.js';
import { testKeyringConfig } from '../dal/testing/secret-fixtures.js';

const PEPPER = randomBytes(SALT_BYTES).toString('base64');

describe('loadSecretKeyringConfig', () => {
  it('defaults to the documented Argon2id parameters and no pepper', () => {
    const config = loadSecretKeyringConfig({});

    assert.equal(config.pepper, null);
    assert.deepEqual(config.params, { ...DEFAULT_ARGON2_PARAMS });
  });

  it('decodes the pepper of the environment', () => {
    const config = loadSecretKeyringConfig({ [PEPPER_VARIABLE]: PEPPER });

    assert.equal(config.pepper?.length, SALT_BYTES);
    assert.deepEqual([...(config.pepper ?? [])], [...Buffer.from(PEPPER, 'base64')]);
  });

  it('accepts base64url and surrounding whitespace', () => {
    const base64url = randomBytes(SALT_BYTES).toString('base64url');

    assert.equal(loadSecretKeyringConfig({ [PEPPER_VARIABLE]: ` ${base64url} ` }).pepper?.length, SALT_BYTES);
  });

  it('treats a blank pepper as absent', () => {
    assert.equal(loadSecretKeyringConfig({ [PEPPER_VARIABLE]: '' }).pepper, null);
    assert.equal(loadSecretKeyringConfig({ [PEPPER_VARIABLE]: '   ' }).pepper, null);
  });

  it('reads explicit Argon2id parameters', () => {
    const config = loadSecretKeyringConfig({
      KR_ARGON2_MEMORY_KIB: '16384',
      KR_ARGON2_PASSES: '2',
      KR_ARGON2_PARALLELISM: '2',
      KR_ARGON2_TAG_LENGTH: '32',
    });

    assert.deepEqual(config.params, { parallelism: 2, memoryKiB: 16384, passes: 2, tagLength: 32 });
  });

  it('refuses a pepper that is not base64 or is too short, without echoing it', () => {
    for (const value of ['not base64 !!!', randomBytes(16).toString('base64'), 'corta']) {
      assert.throws(
        () => loadSecretKeyringConfig({ [PEPPER_VARIABLE]: value }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /KR_SECRET_PEPPER/);
          assert.equal(error.message.includes(value), false);
          return true;
        },
      );
    }
  });

  it('refuses Argon2id parameters outside their documented range', () => {
    assert.throws(() => loadSecretKeyringConfig({ KR_ARGON2_MEMORY_KIB: '1024' }), /KR_ARGON2_MEMORY_KIB/);
    assert.throws(() => loadSecretKeyringConfig({ KR_ARGON2_PASSES: '0' }), /KR_ARGON2_PASSES/);
    assert.throws(() => loadSecretKeyringConfig({ KR_ARGON2_PASSES: '99' }), /KR_ARGON2_PASSES/);
    assert.throws(() => loadSecretKeyringConfig({ KR_ARGON2_PARALLELISM: '0' }), /KR_ARGON2_PARALLELISM/);
    assert.throws(() => loadSecretKeyringConfig({ KR_ARGON2_TAG_LENGTH: '16' }), /KR_ARGON2_TAG_LENGTH/);
  });
});

describe('assertPepperWhenSecretsExist', () => {
  it('boots without a pepper when the database holds no secret', () => {
    assert.doesNotThrow(() => assertPepperWhenSecretsExist(testKeyringConfig(null), 0));
  });

  it('boots with a pepper and stored secrets', () => {
    assert.doesNotThrow(() => assertPepperWhenSecretsExist(testKeyringConfig(), 3));
  });

  it('refuses to boot when secrets exist and no pepper is configured', () => {
    assert.throws(
      () => assertPepperWhenSecretsExist(testKeyringConfig(null), 2),
      (error: unknown) => {
        assert.ok(error instanceof MissingPepperError);
        assert.match(error.message, /KR_SECRET_PEPPER/);
        assert.match(error.message, /2 encrypted credential secret/);
        return true;
      },
    );
  });
});
