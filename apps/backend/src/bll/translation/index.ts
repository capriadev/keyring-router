/**
 * Protocol translation for the OpenAI compatible facade. A caller asks the registry for a `from:to` pair and
 * gets a `ChatTranslator`: the request goes out in the provider's shape, the payloads come back normalized,
 * and a pair that is not served fails loudly instead of being passed through mangled.
 */
export { CHAT_FORMATS, ChatTranslatorRegistry, TranslationError, translatorKey } from './registry.js';
export type { TranslationErrorCode, TranslatorPair } from './registry.js';
export {
  CLIENT_FORMATS,
  codecFor,
  createChatTranslators,
  createPairTranslator,
  createTranslationRegistry,
} from './pairs.js';
export type { ProtocolCodec } from './codecs/codec.js';
