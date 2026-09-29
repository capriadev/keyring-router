import { z } from 'zod';

export const PEPPER_VARIABLE = 'KR_SECRET_PEPPER';

/** Salt stored in the database, in bytes. Argon2 requires at least 8; the spec asks for 32. */
export const SALT_BYTES = 32;

/**
 * Argon2id cost and key length. Defaults chosen for a local gateway: 64 MiB, three passes and four
 * lanes derive the key in about 130 ms on the development machine, which is cheap once per process
 * and expensive for anyone brute forcing a stolen database file.
 */
export const DEFAULT_ARGON2_PARAMS = {
  parallelism: 4,
  memoryKiB: 65536,
  passes: 3,
  tagLength: 32,
} as const;

export const SECRET_KEYRING_CONFIG = Symbol('SECRET_KEYRING_CONFIG');

export interface Argon2Params {
  readonly parallelism: number;
  readonly memoryKiB: number;
  readonly passes: number;
  readonly tagLength: number;
}

/**
 * Boot configuration of the credential secret key. The pepper is the half that lives in `.env`: it
 * is kept as bytes, never logged, and never echoed by a validation error.
 */
export interface SecretKeyringConfig {
  /** Decoded pepper. Null when the variable is absent or blank. */
  readonly pepper: Buffer | null;
  readonly params: Argon2Params;
}

/** Base64 and base64url, so a paste from any of the usual generators works. */
const PEPPER_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

const paramsSchema = z.object({
  KR_ARGON2_MEMORY_KIB: z.coerce.number().int().min(8192).max(1048576).default(DEFAULT_ARGON2_PARAMS.memoryKiB),
  KR_ARGON2_PASSES: z.coerce.number().int().min(1).max(10).default(DEFAULT_ARGON2_PARAMS.passes),
  KR_ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(16).default(DEFAULT_ARGON2_PARAMS.parallelism),
  KR_ARGON2_TAG_LENGTH: z.coerce
    .number()
    .int()
    .refine((value) => value === DEFAULT_ARGON2_PARAMS.tagLength, {
      error: 'must be 32, the AES-256-GCM key length',
    })
    .default(DEFAULT_ARGON2_PARAMS.tagLength),
});

/** Decodes the pepper, or explains why it is unusable. The value itself is never part of the error. */
function decodePepper(raw: string): Buffer {
  const trimmed = raw.trim();

  if (!PEPPER_PATTERN.test(trimmed)) {
    throw new Error(`${PEPPER_VARIABLE} must be base64 or base64url`);
  }

  const decoded = Buffer.from(trimmed, 'base64');

  if (decoded.length < SALT_BYTES) {
    throw new Error(`${PEPPER_VARIABLE} must decode to at least ${SALT_BYTES} bytes`);
  }

  return decoded;
}

/**
 * Reads the boot pepper and the Argon2id parameters. A blank `KR_SECRET_PEPPER` counts as absent: the
 * gateway still boots without it, and the boot guard decides whether that is fatal.
 */
export function loadSecretKeyringConfig(source: Record<string, string | undefined> = process.env): SecretKeyringConfig {
  const parsed = paramsSchema.safeParse(source);

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new Error(`invalid secret keyring configuration (${detail})`);
  }

  const raw = source[PEPPER_VARIABLE];

  return {
    pepper: raw === undefined || raw.trim() === '' ? null : decodePepper(raw),
    params: {
      parallelism: parsed.data.KR_ARGON2_PARALLELISM,
      memoryKiB: parsed.data.KR_ARGON2_MEMORY_KIB,
      passes: parsed.data.KR_ARGON2_PASSES,
      tagLength: parsed.data.KR_ARGON2_TAG_LENGTH,
    },
  };
}

/**
 * Refusal to boot. Secrets exist, the pepper that opens them does not, and starting anyway would
 * turn every stored secret into a decryption failure at request time.
 */
export class MissingPepperError extends Error {
  constructor(storedSecrets: number) {
    super(
      `${PEPPER_VARIABLE} is missing from the environment and the database holds ${storedSecrets} encrypted credential secret(s); add it to .env before starting Keyring Router`,
    );
    this.name = 'MissingPepperError';
  }
}

export function assertPepperWhenSecretsExist(config: SecretKeyringConfig, storedSecrets: number): void {
  if (config.pepper === null && storedSecrets > 0) {
    throw new MissingPepperError(storedSecrets);
  }
}
