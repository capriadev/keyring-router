import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { SecretKeySource } from '../../config/secret-key-source.js';
import { SECRET_MAX_LENGTH, SECRET_MIN_LENGTH, type StoredSecret } from '../../types/credential.js';
import { InvalidInputError, SecretKeyUnavailableError, SecretUndecryptableError } from '../errors.js';
import { registerSecret } from './redaction.js';

/**
 * The secrets module: encrypt, decrypt, hint and version. It has no HTTP knowledge and no database
 * knowledge, so it can be exercised on its own.
 *
 * AES-256-GCM with a fresh random 12 byte IV per secret and the authentication tag stored beside the
 * ciphertext. The version is authenticated as additional data, which binds the stored stamp to the
 * tag: a tampered version can never produce plaintext.
 */
const CIPHER = 'aes-256-gcm';
const IV_BYTES = 12;
const AAD_PREFIX = 'keyring-router/credential-secret/v';

function additionalData(version: number): Buffer {
  return Buffer.from(`${AAD_PREFIX}${version}`, 'utf8');
}

/** Last four characters, counted in code points so a unicode secret keeps whole characters. */
export function secretHint(secret: string): string {
  return Array.from(secret).slice(-4).join('');
}

/** Rotation stamps a new version, so a stale ciphertext is never accepted as the current one. */
export function nextSecretVersion(previous: number | null): number {
  return (previous ?? 0) + 1;
}

export function assertSecretValue(secret: string): void {
  if (secret.trim() === '') {
    throw new InvalidInputError('secret must not be blank');
  }

  if (secret.trim() !== secret) {
    throw new InvalidInputError('secret must not start or end with whitespace');
  }

  const length = Array.from(secret).length;

  if (length < SECRET_MIN_LENGTH || length > SECRET_MAX_LENGTH) {
    throw new InvalidInputError(
      `secret must be between ${SECRET_MIN_LENGTH} and ${SECRET_MAX_LENGTH} characters`,
    );
  }
}

/** The key, or a credential problem when the installation has no pepper. Never a crash. */
export function requireSecretKey(keySource: SecretKeySource): Buffer {
  const key = keySource.key();

  if (key === null) {
    throw new SecretKeyUnavailableError();
  }

  return key;
}

export function sealSecret(key: Buffer, secret: string, version: number): StoredSecret {
  assertSecretValue(secret);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv);
  cipher.setAAD(additionalData(version));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);

  // Anything this process encrypts is redacted from every message it prints from now on.
  registerSecret(secret);

  return {
    secretCiphertext: ciphertext.toString('base64'),
    secretIv: iv.toString('base64'),
    secretTag: cipher.getAuthTag().toString('base64'),
    secretVersion: version,
    secretHint: secretHint(secret),
  };
}

/**
 * Decrypts one stored secret. A single flipped byte in the ciphertext, the IV, the tag or the
 * version fails the authentication and throws: no partial plaintext ever comes out of here.
 */
export function openSecret(key: Buffer, stored: StoredSecret): string {
  try {
    const decipher = createDecipheriv(CIPHER, key, Buffer.from(stored.secretIv, 'base64'));
    decipher.setAAD(additionalData(stored.secretVersion));
    decipher.setAuthTag(Buffer.from(stored.secretTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(stored.secretCiphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');

    registerSecret(plaintext);

    return plaintext;
  } catch {
    throw new SecretUndecryptableError();
  }
}
