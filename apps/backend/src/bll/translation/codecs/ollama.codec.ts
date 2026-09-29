import type { ProtocolCodec } from './codec.js';
import { openAiCodec } from './openai.codec.js';

/**
 * Ollama as a chat provider. Its chat endpoint is OpenAI shaped (`/v1/chat/completions`) while its discovery
 * endpoint is native (`/api/tags`), so the translation towards ollama is the openai protocol under this
 * format's own name. The codec delegates instead of copying: two implementations of one wire shape would
 * drift apart, and the adapter posts the body this codec built to the openai shaped endpoint. Discovery never
 * passes through here.
 */
export const ollamaCodec: ProtocolCodec = {
  format: 'ollama',
  encodeRequest: (request, options) => openAiCodec.encodeRequest(request, options),
  decodeResponse: (payload) => openAiCodec.decodeResponse(payload),
  decodeChunk: (payload) => openAiCodec.decodeChunk(payload),
};