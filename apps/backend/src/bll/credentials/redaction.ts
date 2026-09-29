import { SECRET_MIN_LENGTH } from '../../types/credential.js';

/**
 * Redaction is a module, not a habit. Every string that could reach a log line, an error body or a
 * diagnostic dump goes through `redact`: the values this process has actually seen are scrubbed
 * exactly, and the shapes a secret usually travels in are scrubbed by pattern.
 */
export const REDACTED = '[redacted]';

/** A gateway holds a handful of credentials; the cap only stops unbounded growth. */
const MAX_REGISTERED = 128;

/** Longest first, so a value that contains another is never half replaced. */
const registered = new Set<string>();

/**
 * Remembers one secret for the rest of the process. Shorter values than the storable minimum are
 * ignored: registering a common word would redact ordinary text.
 */
export function registerSecret(secret: string): void {
  if (secret.length < SECRET_MIN_LENGTH) {
    return;
  }

  // Re-inserting moves the value to the end, so the oldest one is the one dropped.
  registered.delete(secret);
  registered.add(secret);

  if (registered.size > MAX_REGISTERED) {
    const oldest = registered.values().next().value;

    if (oldest !== undefined) {
      registered.delete(oldest);
    }
  }
}

/** Test seam: nothing in the runtime clears the registry. */
export function clearRegisteredSecrets(): void {
  registered.clear();
}

const BEARER = /(\bbearer\s+)([A-Za-z0-9\-._~+/=]{6,})/gi;

const AUTH_HEADER = /(\b(?:x-api-key|api[-_]?key|authorization|token)\b\s*[:=]\s*)("?)([A-Za-z0-9\-._~+/=]{6,})\2/gi;

const AUTH_FIELD = /("(?:secret|apikey|api_key|token|password)"\s*:\s*)"[^"]*"/gi;

/**
 * Runs of 40 or more characters of the base64 alphabets: a 32 byte key, a 32 byte salt or a long
 * provider key. Short enough runs are left alone so identifiers (a uuid is 36 characters) survive.
 */
const LONG_TOKEN = /\b[A-Za-z0-9+/=_-]{40,}\b/g;

export function redact(text: string): string {
  let output = text;

  for (const secret of [...registered].sort((left, right) => right.length - left.length)) {
    output = output.split(secret).join(REDACTED);
  }

  return output
    .replace(BEARER, (_match, label: string) => `${label}${REDACTED}`)
    .replace(AUTH_HEADER, (_match, label: string, quote: string) => `${label}${quote}${REDACTED}${quote}`)
    .replace(AUTH_FIELD, (_match, label: string) => `${label}"${REDACTED}"`)
    .replace(LONG_TOKEN, REDACTED);
}
