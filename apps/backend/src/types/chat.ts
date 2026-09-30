/**
 * The chat contract: what a client sends, what a client receives, and what a protocol translator must be
 * able to do. The router translates a client request into the provider's shape, the adapter carries the
 * bytes, and the translator turns the provider's frames back into the client's shape. Nothing here knows
 * about HTTP, and nothing here knows a provider id.
 */

/**
 * The formats a chat request can be translated between. `ollama` is a provider format of its own for
 * discovery, while its chat endpoint is OpenAI shaped (`/v1/chat/completions`), so a translation towards
 * `ollama` is the identity translation and the adapter posts it to that endpoint.
 */
export type ChatFormat = 'openai' | 'claude' | 'gemini' | 'ollama';

export interface ChatTextPart {
  readonly type: 'text';
  readonly text: string;
}

export interface ChatImagePart {
  readonly type: 'image';
  /** Either an absolute http(s) URL or a data URL; the translator decides how the provider wants it. */
  readonly url: string;
  readonly mediaType?: string;
}

export type ChatContentPart = ChatTextPart | ChatImagePart;

export interface ChatToolCall {
  readonly id: string;
  readonly name: string;
  /** JSON as text: a provider streams a tool call in fragments, so parsing it early would break it. */
  readonly arguments: string;
}

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: readonly ChatContentPart[];
  readonly toolCalls?: readonly ChatToolCall[];
  /** Set on a `tool` message: which call it answers. */
  readonly toolCallId?: string;
  readonly name?: string;
}

export interface ChatToolDefinition {
  readonly name: string;
  readonly description?: string;
  /** JSON Schema of the arguments, as the client declared it. */
  readonly parameters: unknown;
}

/** A client request after normalization: the shape every translator translates from. */
export interface ChatRequest {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly stream: boolean;
  readonly tools?: readonly ChatToolDefinition[];
  readonly temperature?: number;
  readonly topP?: number;
  readonly maxOutputTokens?: number;
  /** Parameters this contract does not model, carried through so a client is never silently served less. */
  readonly passthrough?: Readonly<Record<string, unknown>>;
}

export interface ChatUsage {
  readonly promptTokens: number | null;
  readonly completionTokens: number | null;
  readonly totalTokens: number | null;
}

export interface ChatResponse {
  readonly text: string;
  readonly toolCalls: readonly ChatToolCall[];
  readonly finishReason: string | null;
  readonly usage: ChatUsage | null;
}

export interface ChatToolCallDelta {
  /** Position of the call inside the response, so fragments of one call are joined in order. */
  readonly index: number;
  readonly id?: string;
  readonly name?: string;
  readonly arguments?: string;
}

/** One increment of a streamed answer, already normalized. */
export interface ChatChunk {
  readonly delta?: string;
  readonly toolCallDelta?: ChatToolCallDelta;
  readonly finishReason?: string | null;
  readonly usage?: ChatUsage | null;
}

export interface TranslateRequestOptions {
  readonly model: string;
  readonly stream: boolean;
  /**
   * Parameters the catalog declares unsupported for this model. The translator removes them because the
   * provider would reject the request, and reports each one as a warning: never a silent flattening.
   */
  readonly unsupportedParams: readonly string[];
  /** Applied to the provider body, from the catalog entry. */
  readonly requestDefaults?: Readonly<Record<string, unknown>>;
}

export interface TranslatedRequest {
  readonly body: Readonly<Record<string, unknown>>;
  readonly warnings: readonly string[];
}

/**
 * Stable code of a frame a translator refused to read. A provider that sends one ends the stream with
 * no frame and no failure, so the drop has to be reported instead of disappearing: spec 014.
 */
export type FrameDropCode = 'frame_dropped';

/**
 * Where a translator reports a frame it dropped, and why, in its own words: the detail names the shape
 * of what arrived and never its content, because a frame is provider data and may carry anything.
 */
export type FrameReport = (code: FrameDropCode, detail: string) => void;

/** One implementation per pair of formats. A pair that is not registered fails loudly. */
export interface ChatTranslator {
  readonly from: ChatFormat;
  readonly to: ChatFormat;
  translateRequest(request: ChatRequest, options: TranslateRequestOptions): TranslatedRequest;
  /** A non streaming answer. */
  translateResponse(payload: unknown): ChatResponse;
  /**
   * One streamed frame. A provider frame may carry several chunks, or none. `report` is the caller's
   * way of hearing about a frame the translator had to drop; a translator with no report stays silent.
   */
  translateChunk(payload: unknown, report?: FrameReport): readonly ChatChunk[];
}
