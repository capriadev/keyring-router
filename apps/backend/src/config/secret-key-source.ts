import { argon2Sync } from 'node:crypto';
import { SALT_BYTES, type SecretKeyringConfig } from './secrets.env.js';

export const SECRET_KEY_SOURCE = Symbol('SECRET_KEY_SOURCE');

/**
 * The AES-256-GCM key of the credential secrets, derived at most once per process.
 */
export interface SecretKeySource {
  /** False when `.env` carries no usable pepper. */
  readonly hasPepper: boolean;
  /** Null when there is no pepper. Throws when the stored salt is unusable. */
  key(): Buffer | null;
}

/**
 * Argon2id over the boot pepper (`message`) and the per install salt (`nonce`). Neither the database
 * file nor `.env` alone rebuilds the key: a stolen database stays opaque, a leaked pepper stays
 * useless. Node's built in implementation is used, so there is no native package and no build step.
 */
export function createSecretKeySource(
  config: SecretKeyringConfig,
  readSalt: () => string,
): SecretKeySource {
  let cached: Buffer | null = null;

  return {
    hasPepper: config.pepper !== null,

    key(): Buffer | null {
      if (config.pepper === null) {
        return null;
      }

      if (cached === null) {
        const nonce = Buffer.from(readSalt(), 'base64');

        if (nonce.length !== SALT_BYTES) {
          throw new Error(`the stored install salt must be ${SALT_BYTES} bytes`);
        }

        cached = Buffer.from(
          argon2Sync('argon2id', {
            message: config.pepper,
            nonce,
            parallelism: config.params.parallelism,
            memory: config.params.memoryKiB,
            passes: config.params.passes,
            tagLength: config.params.tagLength,
          }),
        );
      }

      return cached;
    },
  };
}
