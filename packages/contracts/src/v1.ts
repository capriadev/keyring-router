/**
 * The wire shapes of the `/v1` surface, the endpoint a client points its tools at. They follow the two
 * protocols a client can speak: the OpenAI chat completions shape and the Anthropic Messages shape. The
 * `kr_warnings` field is the one addition, and it is there so a removed parameter is visible instead of
 * silently dropped.
 */

export interface OpenAiUsage {
  readonly prompt_tokens: number | null;
  readonly completion_tokens: number | null;
  readonly total_tokens: number | null;
}

export interface OpenAiModelEntry {
  readonly id: string;
  readonly object: 'model';
  /** Unix seconds. The exposed listing carries no timestamp, so an unknown value stays 0. */
  readonly created: number;
  readonly owned_by: string;
}

/** `GET /v1/models` */
export interface OpenAiModelListResponse {
  readonly object: 'list';
  readonly data: readonly OpenAiModelEntry[];
}

export interface OpenAiToolCall {
  readonly id: string;
  readonly type: 'function';
  readonly function: {
    readonly name: string;
    /** JSON text, exactly as the provider streamed it. */
    readonly arguments: string;
  };
}

export interface OpenAiAssistantMessage {
  readonly role: 'assistant';
  readonly content: string | null;
  readonly tool_calls?: readonly OpenAiToolCall[];
}

/** `POST /v1/chat/completions`, non streaming. */
export interface OpenAiChatCompletionResponse {
  readonly id: string;
  readonly object: 'chat.completion';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly {
    readonly index: number;
    readonly message: OpenAiAssistantMessage;
    readonly finish_reason: string | null;
  }[];
  readonly usage: OpenAiUsage | null;
  readonly kr_warnings?: readonly string[];
}

export interface OpenAiChunkDelta {
  readonly role?: 'assistant';
  readonly content?: string;
  readonly tool_calls?: readonly {
    readonly index: number;
    readonly id?: string;
    readonly type?: 'function';
    readonly function?: { readonly name?: string; readonly arguments?: string };
  }[];
}

/** One `data:` frame of a streamed `/v1/chat/completions`. */
export interface OpenAiChatCompletionChunk {
  readonly id: string;
  readonly object: 'chat.completion.chunk';
  readonly created: number;
  readonly model: string;
  readonly choices: readonly {
    readonly index: number;
    readonly delta: OpenAiChunkDelta;
    readonly finish_reason: string | null;
  }[];
  readonly usage?: OpenAiUsage | null;
  readonly kr_warnings?: readonly string[];
}

/** The Messages API has no nullable count, so an unreported one is 0 here and null on the OpenAI side. */
export interface ClaudeUsage {
  readonly input_tokens: number;
  readonly output_tokens: number;
}

/** `POST /v1/messages`, non streaming: the Messages API answer. */
export interface ClaudeMessageResponse {
  readonly id: string;
  readonly type: 'message';
  readonly role: 'assistant';
  readonly model: string;
  readonly content: readonly (
    | { readonly type: 'text'; readonly text: string }
    | { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: unknown }
  )[];
  readonly stop_reason: string | null;
  readonly stop_sequence: null;
  readonly usage: ClaudeUsage;
  readonly kr_warnings?: readonly string[];
}

/** The opening frame of a streamed answer: the same message, with its content still empty. */
export interface ClaudeMessageStartEvent {
  readonly type: 'message_start';
  readonly message: {
    readonly id: string;
    readonly type: 'message';
    readonly role: 'assistant';
    readonly model: string;
    readonly content: readonly [];
    readonly stop_reason: null;
    readonly stop_sequence: null;
    readonly usage: ClaudeUsage;
    readonly kr_warnings?: readonly string[];
  };
}

/** One content block opening: text, or the tool call whose fragments follow. */
export interface ClaudeContentBlockStartEvent {
  readonly type: 'content_block_start';
  readonly index: number;
  readonly content_block:
    | { readonly type: 'text'; readonly text: '' }
    | {
        readonly type: 'tool_use';
        readonly id: string;
        readonly name: string;
        readonly input: Record<string, never>;
      };
}

/** One increment: text, or the next fragment of a tool call's JSON arguments. */
export interface ClaudeContentBlockDeltaEvent {
  readonly type: 'content_block_delta';
  readonly index: number;
  readonly delta:
    | { readonly type: 'text_delta'; readonly text: string }
    | { readonly type: 'input_json_delta'; readonly partial_json: string };
}

export interface ClaudeContentBlockStopEvent {
  readonly type: 'content_block_stop';
  readonly index: number;
}

export interface ClaudeMessageDeltaEvent {
  readonly type: 'message_delta';
  readonly delta: { readonly stop_reason: string | null; readonly stop_sequence: null };
  /** The output count is what this event carries; the input count travels beside it when it was known. */
  readonly usage: { readonly output_tokens: number; readonly input_tokens?: number };
}

export interface ClaudeMessageStopEvent {
  readonly type: 'message_stop';
}

/** Every frame a streamed `/v1/messages` writes after its opening one. */
export type ClaudeStreamEvent =
  | ClaudeContentBlockStartEvent
  | ClaudeContentBlockDeltaEvent
  | ClaudeContentBlockStopEvent
  | ClaudeMessageDeltaEvent
  | ClaudeMessageStopEvent;

/** Error body of the OpenAI shaped surface. `code` is stable, the message never carries a secret. */
export interface OpenAiErrorBody {
  readonly error: {
    readonly message: string;
    readonly type: string;
    readonly param: string | null;
    readonly code: string;
  };
}

/** Error body of the Messages API surface. */
export interface ClaudeErrorBody {
  readonly type: 'error';
  readonly error: {
    readonly type: string;
    readonly message: string;
  };
}

