import type { ChatContentPart } from '../../types/chat.js';
import { TranslationError } from './registry.js';

/**
 * The normalized content of a message, as text. Text parts of one message are joined with a newline: they are
 * the client's own segmentation of one block, and concatenating them without a separator would fuse two
 * sentences into one word.
 */
export function joinTextParts(parts: readonly ChatContentPart[]): string {
  return parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/**
 * Tool call arguments travel as JSON text, because a provider streams them in fragments. A target that needs
 * a parsed object (Claude's `input`, Gemini's `args`) parses here, and a fragment that cannot be parsed fails
 * loudly instead of being replaced with an empty object.
 */
export function parseToolArguments(argumentsText: string, position: number): unknown {
  let parsed: unknown;

  try {
    parsed = JSON.parse(argumentsText === '' ? '{}' : argumentsText);
  } catch {
    throw new TranslationError(
      'invalid_request',
      `tool call at position ${position} carries arguments that are not valid JSON`,
    );
  }

  return parsed;
}

/** The arguments of a call as JSON text, whichever way the source carries them. */
export function stringifyToolArguments(value: unknown): string {
  return JSON.stringify(value ?? {}) ?? '{}';
}

export interface DataUrl {
  readonly mediaType: string;
  readonly data: string;
}

const DATA_URL_PATTERN = /^data:([^;,]*)(;base64)?,(.*)$/s;

/**
 * Reads a data URL. Only base64 payloads are accepted: a percent encoded data URL would have to be decoded
 * before it could travel as provider bytes, and decoding it here would hide that from the caller.
 */
export function readDataUrl(url: string): DataUrl | null {
  const match = DATA_URL_PATTERN.exec(url);

  if (match === null) {
    return null;
  }

  const [, mediaType = '', base64, data = ''] = match;

  if (base64 !== ';base64') {
    throw new TranslationError('invalid_request', 'an image part uses a data URL that is not base64 encoded');
  }

  return { mediaType, data };
}

export function isRemoteUrl(url: string): boolean {
  return /^https?:\/\/\S+$/.test(url);
}
