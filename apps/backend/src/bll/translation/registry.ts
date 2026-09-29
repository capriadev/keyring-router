import type { ChatFormat, ChatTranslator } from '../../types/chat.js';

/**
 * The formats a translated pair may name. A translator whose `from` or `to` is outside this set cannot be
 * registered: a pair that is not one of these would be reachable by a caller that believes it asked for
 * something else. `ollama` is listed as a provider format only; which origins actually exist is decided in
 * `pairs.ts`, because a provider protocol is not a client protocol.
 */
export const CHAT_FORMATS: readonly ChatFormat[] = ['openai', 'claude', 'gemini', 'ollama'];

export type TranslationErrorCode =
  | 'duplicate_pair'
  | 'unknown_pair'
  | 'unsupported_format'
  | 'invalid_request'
  | 'invalid_frame';

/**
 * A translation failure. It carries a stable `code`; the message names the pair, the format, the parameter or
 * the frame kind at most, never a request payload, never a frame body and never a credential value.
 */
export class TranslationError extends Error {
  readonly code: TranslationErrorCode;

  constructor(code: TranslationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
  }
}

export interface TranslatorPair {
  readonly from: ChatFormat;
  readonly to: ChatFormat;
}

/** The registry key of a pair. One direction, one key: `from` is the client, `to` is the provider. */
export function translatorKey(from: ChatFormat, to: ChatFormat): string {
  return `${from}:${to}`;
}

function isChatFormat(value: unknown): value is ChatFormat {
  return typeof value === 'string' && CHAT_FORMATS.includes(value as ChatFormat);
}

/**
 * The `from:to` map of translators. Registering the same pair twice is a programming error, so it throws
 * instead of replacing the first implementation: two translators for one pair would serve whichever was
 * registered last. Asking for a pair that was never registered throws too, so an unsupported direction fails
 * loudly instead of being passed through mangled.
 */
export class ChatTranslatorRegistry {
  private readonly translators = new Map<string, ChatTranslator>();

  register(translator: ChatTranslator): void {
    assertTranslator(translator);

    const key = translatorKey(translator.from, translator.to);

    if (this.translators.has(key)) {
      throw new TranslationError('duplicate_pair', `a translator is already registered for ${key}`);
    }

    this.translators.set(key, translator);
  }

  get(from: ChatFormat, to: ChatFormat): ChatTranslator {
    assertFormat(from);
    assertFormat(to);

    const key = translatorKey(from, to);
    const translator = this.translators.get(key);

    if (translator === undefined) {
      throw new TranslationError(
        'unknown_pair',
        `no translator is registered for ${key}; registered pairs: ${this.describePairs()}`,
      );
    }

    return translator;
  }

  has(from: ChatFormat, to: ChatFormat): boolean {
    return this.translators.has(translatorKey(from, to));
  }

  /** The registered pairs, in registration order, so a caller can report what is actually served. */
  pairs(): readonly TranslatorPair[] {
    return [...this.translators.values()].map(({ from, to }) => ({ from, to }));
  }

  private describePairs(): string {
    const pairs = this.translators.keys();

    return [...pairs].join(', ') || 'none';
  }
}

function assertFormat(format: unknown): asserts format is ChatFormat {
  if (!isChatFormat(format)) {
    throw new TranslationError('unsupported_format', `unsupported chat format: ${String(format)}`);
  }
}

function assertTranslator(translator: ChatTranslator): void {
  if (translator === null || typeof translator !== 'object') {
    throw new TranslationError('unsupported_format', 'a translator must be an object');
  }

  assertFormat(translator.from);
  assertFormat(translator.to);

  for (const method of ['translateRequest', 'translateResponse', 'translateChunk'] as const) {
    if (typeof translator[method] !== 'function') {
      throw new TranslationError(
        'unsupported_format',
        `the translator for ${translatorKey(translator.from, translator.to)} does not implement ${method}`,
      );
    }
  }
}
