import type { ChatFormat, ChatTranslator } from '../../types/chat.js';
import { claudeCodec } from './codecs/claude.codec.js';
import type { ProtocolCodec } from './codecs/codec.js';
import { geminiCodec } from './codecs/gemini.codec.js';
import { ollamaCodec } from './codecs/ollama.codec.js';
import { openAiCodec } from './codecs/openai.codec.js';
import { CHAT_FORMATS, ChatTranslatorRegistry, TranslationError } from './registry.js';

/** One codec per protocol the matrix serves; the list is the only place the protocol set is composed. */
const CODECS: readonly ProtocolCodec[] = [openAiCodec, claudeCodec, geminiCodec, ollamaCodec];

/**
 * The protocols a client may speak. The facade serves two client shaped endpoints, so these two are the only
 * origins: a provider protocol is never a client protocol, and a pair whose `from` is outside this set is
 * refused instead of being registered for a caller that believes it asked for something else.
 */
export const CLIENT_FORMATS: readonly ChatFormat[] = ['openai', 'claude'];

export function codecFor(format: ChatFormat): ProtocolCodec {
  const codec = CODECS.find((candidate) => candidate.format === format);

  if (codec === undefined) {
    throw new TranslationError('unsupported_format', `unsupported chat format: ${format}`);
  }

  return codec;
}

/**
 * One pair of the matrix. `from` is the client's protocol and `to` is the provider's, and what the pair
 * decides is which protocol body is built and which protocol payload is read: a normalized `ChatRequest`
 * already describes the conversation and a normalized `ChatResponse` already describes the answer, so the
 * client side needs no protocol of its own here. `claude:ollama` is therefore the composition of
 * `claude:openai` and the identity: a normalized request is protocol independent, so both client protocols
 * build the openai shaped body the ollama chat endpoint expects.
 */
export function createPairTranslator(from: ChatFormat, to: ChatFormat): ChatTranslator {
  assertClientFormat(from);

  const codec = codecFor(to);

  return {
    from,
    to: codec.format,
    translateRequest: (request, options) => codec.encodeRequest(request, options),
    translateResponse: (payload) => codec.decodeResponse(payload),
    translateChunk: (payload, report) => codec.decodeChunk(payload, report),
  };
}

function assertClientFormat(format: ChatFormat): void {
  if (!CLIENT_FORMATS.includes(format)) {
    throw new TranslationError(
      'unsupported_format',
      `no client protocol is served for ${format}: the facade speaks ${CLIENT_FORMATS.join(', ')}`,
    );
  }
}

/** Every served direction: each client protocol against each provider protocol, identity included. */
export function createChatTranslators(): readonly ChatTranslator[] {
  return CLIENT_FORMATS.flatMap((from) => CHAT_FORMATS.map((to) => createPairTranslator(from, to)));
}

/**
 * The registry the facade asks for a pair. The identity pairs are registered like any other: a client that
 * already speaks the provider's protocol still gets the catalog defaults applied and the parameters the
 * catalog declares unsupported removed.
 */
export function createTranslationRegistry(): ChatTranslatorRegistry {
  const registry = new ChatTranslatorRegistry();

  for (const translator of createChatTranslators()) {
    registry.register(translator);
  }

  return registry;
}
