import type {
  ChatChunk,
  ChatContentPart,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatToolCall,
  ChatToolDefinition,
  ChatUsage,
  FrameReport,
  TranslateRequestOptions,
  TranslatedRequest,
} from '../../../types/chat.js';
import {
  joinTextParts,
  isRemoteUrl,
  parseToolArguments,
  readDataUrl,
  stringifyToolArguments,
} from '../content.js';
import { placeParameters, topLevelPlacement } from '../parameters.js';
import { asRecord, isRecord, parseFrame, readCount, readItems, readText } from '../payload.js';
import { TranslationError } from '../registry.js';
import type { ProtocolCodec } from './codec.js';

/**
 * The protocol requires `max_tokens`, so a request that names no output limit is served the documented
 * Claude default instead of an upstream rejection. A catalog default or a client value always wins over it.
 */
const DEFAULT_CLAUDE_MAX_TOKENS = 4096;

/**
 * The Anthropic Messages protocol: the conversation in `messages` with content blocks, the system prompts
 * lifted to `system`, the tool declarations in `tools` with a JSON Schema in `input_schema`, and the model in
 * the body.
 */
export const claudeCodec: ProtocolCodec = {
  format: 'claude',
  encodeRequest,
  decodeResponse,
  decodeChunk,
};

function encodeRequest(request: ChatRequest, options: TranslateRequestOptions): TranslatedRequest {
  const conversation = request.messages.filter((message) => message.role !== 'system');

  if (conversation.length === 0) {
    throw new TranslationError(
      'invalid_request',
      'the claude protocol requires at least one non-system message',
    );
  }

  const body: Record<string, unknown> = {
    model: options.model,
    messages: conversation.map(toClaudeMessage),
    stream: options.stream,
  };

  const system = systemText(request);

  if (system !== '') {
    body.system = system;
  }

  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = request.tools.map(toClaudeTool);
  }

  const warnings = placeParameters(body, topLevelPlacement, request, options);

  if (body.max_tokens === undefined) {
    body.max_tokens = DEFAULT_CLAUDE_MAX_TOKENS;
  }

  return { body, warnings };
}

/** The protocol carries the system prompts outside the conversation; consecutive ones become one block. */
function systemText(request: ChatRequest): string {
  return request.messages
    .filter((message) => message.role === 'system')
    .map((message) => joinTextParts(message.content))
    .filter((text) => text !== '')
    .join('\n\n');
}

function toClaudeMessage(message: ChatMessage): Readonly<Record<string, unknown>> {
  if (message.role === 'tool') {
    return { role: 'user', content: [toToolResultBlock(message)] };
  }

  const blocks = message.content.map(toClaudeBlock);
  const toolUses = (message.toolCalls ?? []).map((call, position) => ({
    type: 'tool_use',
    id: call.id,
    name: call.name,
    input: parseToolArguments(call.arguments, position),
  }));

  return {
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [...blocks, ...toolUses],
  };
}

function toClaudeBlock(part: ChatContentPart, position: number): Readonly<Record<string, unknown>> {
  if (part.type === 'text') {
    return { type: 'text', text: part.text };
  }

  const data = readDataUrl(part.url);

  if (data !== null) {
    const mediaType = part.mediaType ?? (data.mediaType === '' ? null : data.mediaType);

    if (mediaType === null) {
      throw new TranslationError(
        'invalid_request',
        `image part at position ${position} does not declare a media type`,
      );
    }

    return { type: 'image', source: { type: 'base64', media_type: mediaType, data: data.data } };
  }

  if (isRemoteUrl(part.url)) {
    return { type: 'image', source: { type: 'url', url: part.url } };
  }

  throw new TranslationError(
    'invalid_request',
    `image part at position ${position} is neither a base64 data URL nor an absolute http(s) URL`,
  );
}

function toToolResultBlock(message: ChatMessage): Readonly<Record<string, unknown>> {
  if (message.toolCallId === undefined) {
    throw new TranslationError('invalid_request', 'a tool message must carry the tool call id it answers to');
  }

  if (message.content.some((part) => part.type === 'image')) {
    throw new TranslationError(
      'invalid_request',
      'a tool message cannot carry an image part in the claude protocol',
    );
  }

  return {
    type: 'tool_result',
    tool_use_id: message.toolCallId,
    content: joinTextParts(message.content),
  };
}

function toClaudeTool(tool: ChatToolDefinition): Readonly<Record<string, unknown>> {
  const encoded: Record<string, unknown> = { name: tool.name, input_schema: tool.parameters };

  if (tool.description !== undefined) {
    encoded.description = tool.description;
  }

  return encoded;
}


/**
 * The normalized finish reason vocabulary, shared with the openai protocol because it is the one the contract
 * in `types/chat.ts` speaks: a caller reading `finishReason` sees `stop`, `length`, `tool_calls` or
 * `content_filter` whichever provider answered. An unknown provider reason passes through unchanged instead
 * of being folded into one of them.
 */
const CLAUDE_STOP_REASONS: Readonly<Record<string, string>> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  pause_turn: 'stop',
  max_tokens: 'length',
  model_context_window_exceeded: 'length',
  tool_use: 'tool_calls',
  refusal: 'content_filter',
};

function claudeFinishReason(value: string | null): string | null {
  if (value === null || value === '') {
    return null;
  }

  return CLAUDE_STOP_REASONS[value] ?? value;
}

/** Token counts as one payload states them; a total is computed only when both halves are in that payload. */
function claudeUsage(value: unknown): ChatUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  const promptTokens = readCount(value, 'input_tokens');
  const completionTokens = readCount(value, 'output_tokens');

  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens === null || completionTokens === null ? null : promptTokens + completionTokens,
  };
}

function decodeResponse(payload: unknown): ChatResponse {
  const record = asRecord(payload, 'the claude response');

  if (!Array.isArray(record.content)) {
    throw new TranslationError('invalid_frame', 'the claude response does not carry a content array');
  }

  const blocks = readItems(record, 'content').filter(isRecord);

  return {
    text: blocks
      .filter((block) => block.type === 'text')
      .map((block) => readText(block, 'text') ?? '')
      .join(''),
    toolCalls: blocks.filter((block) => block.type === 'tool_use').map(toToolCall),
    finishReason: claudeFinishReason(readText(record, 'stop_reason')),
    usage: claudeUsage(record.usage),
  };
}

function toToolCall(block: Readonly<Record<string, unknown>>): ChatToolCall {
  return {
    id: readText(block, 'id') ?? '',
    name: readText(block, 'name') ?? '',
    arguments: stringifyToolArguments(block.input),
  };
}

function decodeChunk(payload: unknown, report?: FrameReport): readonly ChatChunk[] {
  const frame = parseFrame(payload, report);

  if (frame === null) {
    return [];
  }

  const type = readText(frame, 'type');

  switch (type) {
    case 'message_start':
      return readMessageStart(frame);
    case 'content_block_start':
      return readBlockStart(frame);
    case 'content_block_delta':
      return readBlockDelta(frame);
    case 'message_delta':
      return readMessageDelta(frame);
    case 'content_block_stop':
    case 'message_stop':
    case 'ping':
      return [];
    case 'error':
      throw new TranslationError(
        'invalid_frame',
        `the provider ended the stream with a claude error frame of type ${readErrorType(frame)}`,
      );
    default:
      throw new TranslationError(
        'invalid_frame',
        `unsupported claude stream frame of type ${type ?? 'unknown'}`,
      );
  }
}

function readErrorType(frame: Readonly<Record<string, unknown>>): string {
  const error = isRecord(frame.error) ? frame.error : null;

  return error === null ? 'unknown' : readText(error, 'type') ?? 'unknown';
}

function readMessageStart(frame: Readonly<Record<string, unknown>>): readonly ChatChunk[] {
  const message = isRecord(frame.message) ? frame.message : null;
  const usage = message === null ? null : claudeUsage(message.usage);

  return usage === null ? [] : [{ usage }];
}

function readBlockStart(frame: Readonly<Record<string, unknown>>): readonly ChatChunk[] {
  if (!isRecord(frame.content_block)) {
    throw new TranslationError('invalid_frame', 'a claude content block frame carries no content block');
  }

  const block = frame.content_block;
  const type = readText(block, 'type');

  if (type === 'text') {
    const text = readText(block, 'text');

    return text === null || text === '' ? [] : [{ delta: text }];
  }

  if (type === 'tool_use') {
    const id = readText(block, 'id');
    const name = readText(block, 'name');

    return [
      {
        toolCallDelta: {
          index: readCount(frame, 'index') ?? 0,
          ...(id === null ? {} : { id }),
          ...(name === null ? {} : { name }),
        },
      },
    ];
  }

  if (type === 'thinking' || type === 'redacted_thinking') {
    return [];
  }

  throw new TranslationError(
    'invalid_frame',
    `unsupported claude content block of type ${type ?? 'unknown'}`,
  );
}

function readBlockDelta(frame: Readonly<Record<string, unknown>>): readonly ChatChunk[] {
  if (!isRecord(frame.delta)) {
    throw new TranslationError('invalid_frame', 'a claude content block delta frame carries no delta');
  }

  const delta = frame.delta;
  const type = readText(delta, 'type');

  if (type === 'text_delta') {
    const text = readText(delta, 'text');

    return text === null || text === '' ? [] : [{ delta: text }];
  }

  if (type === 'input_json_delta') {
    const partial = readText(delta, 'partial_json');

    return partial === null
      ? []
      : [{ toolCallDelta: { index: readCount(frame, 'index') ?? 0, arguments: partial } }];
  }

  if (type === 'thinking_delta' || type === 'signature_delta') {
    return [];
  }

  throw new TranslationError(
    'invalid_frame',
    `unsupported claude content block delta of type ${type ?? 'unknown'}`,
  );
}

function readMessageDelta(frame: Readonly<Record<string, unknown>>): readonly ChatChunk[] {
  const chunks: ChatChunk[] = [];
  const delta = isRecord(frame.delta) ? frame.delta : null;
  const stopReason = delta === null ? null : readText(delta, 'stop_reason');

  if (stopReason !== null) {
    chunks.push({ finishReason: claudeFinishReason(stopReason) });
  }

  const usage = claudeUsage(frame.usage);

  if (usage !== null) {
    chunks.push({ usage });
  }

  return chunks;
}
