import type {
  ChatChunk,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatToolCall,
  ChatToolDefinition,
  ChatUsage,
  TranslateRequestOptions,
  TranslatedRequest,
} from '../../../types/chat.js';
import { joinTextParts } from '../content.js';
import { placeParameters, topLevelPlacement } from '../parameters.js';
import { asRecord, isRecord, parseFrame, readCount, readFirst, readItems, readText } from '../payload.js';
import { TranslationError } from '../registry.js';
import type { ProtocolCodec } from './codec.js';

/**
 * The OpenAI chat completions protocol, as every openai-compatible provider serves it: the conversation in
 * `messages`, the tool declarations in `tools`, the generation parameters at the top level and the model in
 * the body.
 */
export const openAiCodec: ProtocolCodec = {
  format: 'openai',
  encodeRequest,
  decodeResponse,
  decodeChunk,
};

function encodeRequest(request: ChatRequest, options: TranslateRequestOptions): TranslatedRequest {
  const body: Record<string, unknown> = {
    model: options.model,
    messages: request.messages.map(toOpenAiMessage),
    stream: options.stream,
  };

  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = request.tools.map(toOpenAiTool);
  }

  const warnings = placeParameters(body, topLevelPlacement, request, options);

  return { body, warnings };
}

function toOpenAiMessage(message: ChatMessage): Readonly<Record<string, unknown>> {
  const encoded: Record<string, unknown> = {
    role: message.role,
    content: toOpenAiContent(message),
  };

  if (message.toolCalls !== undefined && message.toolCalls.length > 0) {
    encoded.tool_calls = message.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }));
  }

  if (message.toolCallId !== undefined) {
    encoded.tool_call_id = message.toolCallId;
  }

  if (message.name !== undefined) {
    encoded.name = message.name;
  }

  return encoded;
}

/**
 * Text only content travels as a string, because the providers that accept an array also accept a string and
 * several of them reject an array of one text block. A message with an image travels as parts, which is the
 * only shape that can carry it.
 */
function toOpenAiContent(message: ChatMessage): string | readonly Readonly<Record<string, unknown>>[] {
  if (!message.content.some((part) => part.type === 'image')) {
    return joinTextParts(message.content);
  }

  if (message.role === 'tool') {
    throw new TranslationError(
      'invalid_request',
      'a tool message cannot carry an image part in the openai protocol',
    );
  }

  return message.content.map((part) =>
    part.type === 'text'
      ? { type: 'text', text: part.text }
      : { type: 'image_url', image_url: { url: part.url } },
  );
}

function toOpenAiTool(tool: ChatToolDefinition): Readonly<Record<string, unknown>> {
  const fn: Record<string, unknown> = { name: tool.name, parameters: tool.parameters };

  if (tool.description !== undefined) {
    fn.description = tool.description;
  }

  return { type: 'function', function: fn };
}

function decodeResponse(payload: unknown): ChatResponse {
  const record = asRecord(payload, 'the openai response');

  if (!Array.isArray(record.choices)) {
    throw new TranslationError('invalid_frame', 'the openai response does not carry a choices array');
  }

  const choice = readFirst(record, 'choices');
  const message = choice !== null && isRecord(choice.message) ? choice.message : null;

  return {
    text: readContentText(message === null ? null : message.content),
    toolCalls: message === null ? [] : readToolCalls(message.tool_calls),
    finishReason: choice === null ? null : readText(choice, 'finish_reason'),
    usage: readUsage(record.usage),
  };
}

function decodeChunk(payload: unknown): readonly ChatChunk[] {
  const frame = parseFrame(payload);

  if (frame === null) {
    return [];
  }

  const chunks: ChatChunk[] = [];
  const choice = readFirst(frame, 'choices');
  const delta = choice !== null && isRecord(choice.delta) ? choice.delta : null;

  if (delta !== null) {
    const text = readText(delta, 'content');

    if (text !== null && text !== '') {
      chunks.push({ delta: text });
    }

    chunks.push(...readToolCallDeltas(delta.tool_calls));
  }

  const finishReason = choice === null ? null : readText(choice, 'finish_reason');

  if (finishReason !== null) {
    chunks.push({ finishReason });
  }

  const usage = readUsage(frame.usage);

  if (usage !== null) {
    chunks.push({ usage });
  }

  return chunks;
}

function readContentText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter(isRecord)
    .filter((part) => part.type === 'text')
    .map((part) => readText(part, 'text') ?? '')
    .join('');
}

function readToolCalls(value: unknown): readonly ChatToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((call) => {
    const fn = isRecord(call.function) ? call.function : {};

    return {
      id: readText(call, 'id') ?? '',
      name: readText(fn, 'name') ?? '',
      arguments: readText(fn, 'arguments') ?? '',
    };
  });
}

/**
 * The argument fragments travel as they arrived: a provider splits one JSON text across frames, so joining or
 * parsing them here would break the call. `index` is the provider's own position of the fragment group.
 */
function readToolCallDeltas(value: unknown): readonly ChatChunk[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const chunks: ChatChunk[] = [];

  value.forEach((item, position) => {
    if (!isRecord(item)) {
      return;
    }

    const fn = isRecord(item.function) ? item.function : {};
    const id = readText(item, 'id');
    const name = readText(fn, 'name');
    const args = readText(fn, 'arguments');

    if (id === null && name === null && args === null) {
      return;
    }

    chunks.push({
      toolCallDelta: {
        index: readCount(item, 'index') ?? position,
        ...(id === null ? {} : { id }),
        ...(name === null ? {} : { name }),
        ...(args === null ? {} : { arguments: args }),
      },
    });
  });

  return chunks;
}

function readUsage(value: unknown): ChatUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    promptTokens: readCount(value, 'prompt_tokens'),
    completionTokens: readCount(value, 'completion_tokens'),
    totalTokens: readCount(value, 'total_tokens'),
  };
}
