import { randomBytes } from 'node:crypto';
import { SALT_BYTES, type SecretKeyringConfig } from '../../config/secrets.env.js';
import { createSecretKeySource, type SecretKeySource } from '../../config/secret-key-source.js';

/**
 * Secret material for tests. Everything is generated at run time, so no fixture file on disk holds a
 * value that could be mistaken for a real secret, and no test needs a real provider key.
 */
export const TEST_PEPPER = randomBytes(SALT_BYTES).toString('base64');

export const OTHER_PEPPER = randomBytes(SALT_BYTES).toString('base64');

/** Cheap parameters: the suite must not pay the production derivation cost in every case. */
export const TEST_ARGON2_PARAMS = {
  parallelism: 1,
  memoryKiB: 8192,
  passes: 1,
  tagLength: 32,
} as const;

export function randomSalt(): string {
  return randomBytes(SALT_BYTES).toString('base64');
}

export function randomSecret(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function testKeyringConfig(pepper: string | null = TEST_PEPPER): SecretKeyringConfig {
  return {
    pepper: pepper === null ? null : Buffer.from(pepper, 'base64'),
    params: TEST_ARGON2_PARAMS,
  };
}

export function testKeySource(
  readSalt: () => string = randomSalt,
  pepper: string | null = TEST_PEPPER,
): SecretKeySource {
  return createSecretKeySource(testKeyringConfig(pepper), readSalt);
}
