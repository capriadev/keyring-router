import type {
  ChatChunk,
  ChatFormat,
  ChatRequest,
  ChatResponse,
  TranslateRequestOptions,
  TranslatedRequest,
} from '../../../types/chat.js';

/**
 * One protocol, as a translator sees it: the body it wants and the payloads it answers with. The pair files
 * compose two of these, because a normalized `ChatRequest` already describes the conversation and a
 * normalized `ChatResponse` already describes the answer: what changes between pairs is only which protocol
 * body is built and which protocol payload is read.
 */
export interface ProtocolCodec {
  readonly format: ChatFormat;
  encodeRequest(request: ChatRequest, options: TranslateRequestOptions): TranslatedRequest;
  decodeResponse(payload: unknown): ChatResponse;
  /** A provider frame may carry several chunks, or none at all. */
  decodeChunk(payload: unknown): readonly ChatChunk[];
}
