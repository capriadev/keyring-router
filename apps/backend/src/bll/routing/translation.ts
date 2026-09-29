import { TranslationError } from '../translation/index.js';
import type { ChatFormat, ChatTranslator } from '../../types/chat.js';
import { ProviderFailure } from '../../types/provider.js';
import { redact } from '../credentials/redaction.js';
import { ChatNotSupportedError, InvalidChatRequestError } from './errors.js';

/**
 * The registry of protocol translators, as the facade consumes it. `bll/translation` owns the
 * implementations and hands one over through this token; the port names only what the router and the
 * facade call, so a change inside the translation module cannot reach this layer unnoticed.
 */
export const CHAT_TRANSLATORS = Symbol('CHAT_TRANSLATORS');

export interface ChatTranslationPort {
  /** A pair that is not registered fails loudly instead of passing a mangled body through. */
  get(from: ChatFormat, to: ChatFormat): ChatTranslator;
  has(from: ChatFormat, to: ChatFormat): boolean;
}

/** One direction of the matrix: the format the client speaks and the format the provider speaks. */
export interface TranslationPair {
  readonly from: ChatFormat;
  readonly to: ChatFormat;
}

/**
 * The translator of one pair, or a facade failure that says which pair the build cannot serve. A pair
 * that never became a route is a capability gap of this installation, not a client mistake.
 */
export function translatorFor(
  port: ChatTranslationPort,
  pair: TranslationPair,
  providerId: string,
): ChatTranslator {
  try {
    return port.get(pair.from, pair.to);
  } catch (error) {
    throw mapTranslationFailure(error, pair, providerId);
  }
}

/**
 * One translation failure, restated in the facade's own vocabulary: a body the client sent that
 * cannot be translated is the client's failure, a frame that arrived malformed is the provider's, and
 * an unregistered pair is this build's. Every message passes the redaction module, so nothing a
 * translator happened to quote can reach a client.
 */
export function mapTranslationFailure(error: unknown, pair: TranslationPair, providerId: string): Error {
  if (!(error instanceof TranslationError)) {
    return error instanceof Error ? error : new Error('translation failed');
  }

  const detail = redact(error.message);

  if (error.code === 'invalid_request') {
    return new InvalidChatRequestError(detail);
  }

  if (error.code === 'invalid_frame') {
    return new ProviderFailure(providerId, 'invalid_response', detail);
  }

  return new ChatNotSupportedError(providerId, `${pair.from} to ${pair.to} is not translated (${detail})`);
}
