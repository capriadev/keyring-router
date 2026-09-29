import { TranslationError } from './registry.js';

export type JsonRecord = Readonly<Record<string, unknown>>;

/** The end of a streamed answer. Every protocol here ends with it or with an empty frame. */
export const STREAM_DONE = '[DONE]';

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads a payload that must be an object. The message names what was expected, never what arrived. */
export function asRecord(value: unknown, what: string): JsonRecord {
  if (!isRecord(value)) {
    throw new TranslationError('invalid_frame', `${what} is not a JSON object`);
  }

  return value;
}

export function readText(source: JsonRecord, key: string): string | null {
  const value = source[key];

  return typeof value === 'string' ? value : null;
}

export function readCount(source: JsonRecord, key: string): number | null {
  const value = source[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readItems(source: JsonRecord, key: string): readonly unknown[] {
  const value = source[key];

  return Array.isArray(value) ? value : [];
}

/**
 * One streamed frame, turned into the object the protocol describes. A frame the transport already parsed
 * arrives as an object; a raw `data:` line arrives as text, because the translator must not depend on who
 * parsed the SSE. An empty frame and the `[DONE]` sentinel carry nothing and answer `null`.
 */
export function parseFrame(payload: unknown): JsonRecord | null {
  if (payload === null || payload === undefined) {
    return null;
  }

  if (typeof payload === 'string') {
    const text = payload.trim();

    if (text === '' || text === STREAM_DONE) {
      return null;
    }

    return parseFrameText(text);
  }

  return isRecord(payload) ? payload : null;
}

function parseFrameText(text: string): JsonRecord | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TranslationError('invalid_frame', 'a stream frame is not valid JSON');
  }

  return isRecord(parsed) ? parsed : null;
}

/** Reads the first element of an array field, or `null` when it carries none. */
export function readFirst(source: JsonRecord, key: string): JsonRecord | null {
  const [first] = readItems(source, key);

  return isRecord(first) ? first : null;
}
