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
import { joinTextParts, isRemoteUrl, parseToolArguments, readDataUrl, stringifyToolArguments } from '../content.js';
import { geminiPlacement, placeParameters } from '../parameters.js';
import { asRecord, firstRecord, isRecord, parseFrame, readCount, readFirst, readItems, readRecord, readRecordArray, readText } from '../payload.js';
import { TranslationError } from '../registry.js';
import type { ProtocolCodec } from './codec.js';

/**
 * The Gemini generateContent protocol: the conversation in `contents`, the system prompts lifted to
 * `systemInstruction`, the tool declarations in `tools[].functionDeclarations`, the generation parameters
 * nested in `generationConfig`. The model does not travel in the body: it is part of the URL the adapter
 * builds, so a caller that needs it uses `options.model`.
 */
export const geminiCodec: ProtocolCodec = {
  format: 'gemini',
  encodeRequest,
  decodeResponse,
  decodeChunk,
};

function encodeRequest(request: ChatRequest, options: TranslateRequestOptions): TranslatedRequest {
  const conversation = request.messages.filter((message) => message.role !== 'system');

  if (conversation.length === 0) {
    throw new TranslationError(
      'invalid_request',
      'the gemini protocol requires at least one non-system message',
    );
  }

  const declared = declaredFunctionNames(request);
  const body: Record<string, unknown> = {
    contents: conversation.map((message, position) => toGeminiContent(message, position, declared)),
  };

  const system = systemText(request);

  if (system !== '') {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  if (request.tools !== undefined && request.tools.length > 0) {
    body.tools = [{ functionDeclarations: request.tools.map(toGeminiTool) }];
  }

  const warnings = placeParameters(body, geminiPlacement, request, options);

  return { body, warnings };
}

function systemText(request: ChatRequest): string {
  return request.messages
    .filter((message) => message.role === 'system')
    .map((message) => joinTextParts(message.content))
    .filter((text) => text !== '')
    .join('\n\n');
}

/**
 * A tool result answers a function by name, and a message that answers one may carry only the call id. The
 * name is then read from the tool call the request already declared, so the answer is never sent under a
 * guessed name.
 */
function declaredFunctionNames(request: ChatRequest): ReadonlyMap<string, string> {
  const names = new Map<string, string>();

  for (const message of request.messages) {
    for (const call of message.toolCalls ?? []) {
      names.set(call.id, call.name);
    }
  }

  return names;
}

function toGeminiContent(
  message: ChatMessage,
  position: number,
  declared: ReadonlyMap<string, string>,
): Readonly<Record<string, unknown>> {
  if (message.role === 'tool') {
    return { role: 'user', parts: [toFunctionResponse(message, position, declared)] };
  }

  const parts: Readonly<Record<string, unknown>>[] = message.content.map(toGeminiPart);

  for (const [index, call] of (message.toolCalls ?? []).entries()) {
    parts.push({
      functionCall: { name: call.name, args: parseToolArguments(call.arguments, index) },
    });
  }

  if (parts.length === 0) {
    throw new TranslationError('invalid_request', `message at position ${position} carries no content`);
  }

  return { role: message.role === 'assistant' ? 'model' : 'user', parts };
}

function toGeminiPart(part: ChatContentPart): Readonly<Record<string, unknown>> {
  if (part.type === 'text') {
    return { text: part.text };
  }

  const data = readDataUrl(part.url);

  if (data === null) {
    throw new TranslationError(
      'invalid_request',
      isRemoteUrl(part.url)
        ? 'an image part with a remote url cannot be translated to the gemini protocol: the bytes must be inlined as a data URL'
        : 'an image part is neither a base64 data URL nor an absolute http(s) URL',
    );
  }

  if (data.mediaType === '') {
    throw new TranslationError(
      'invalid_request',
      'an image part does not declare a media type in its data URL',
    );
  }

  return { inlineData: { mimeType: data.mediaType, data: data.data } };
}

function toFunctionResponse(
  message: ChatMessage,
  position: number,
  declared: ReadonlyMap<string, string>,
): Readonly<Record<string, unknown>> {
  if (message.content.some((part) => part.type === 'image')) {
    throw new TranslationError(
      'invalid_request',
      'a tool message cannot carry an image part in the gemini protocol',
    );
  }

  const name =
    message.name ?? (message.toolCallId === undefined ? undefined : declared.get(message.toolCallId));

  if (name === undefined) {
    throw new TranslationError(
      'invalid_request',
      `tool message at position ${position} does not name the function it answers`,
    );
  }

  return { functionResponse: { name, response: { result: joinTextParts(message.content) } } };
}

function toGeminiTool(tool: ChatToolDefinition): Readonly<Record<string, unknown>> {
  const encoded: Record<string, unknown> = { name: tool.name, parameters: tool.parameters };

  if (tool.description !== undefined) {
    encoded.description = tool.description;
  }

  return encoded;
}


/**
 * The normalized finish reason vocabulary, the same one `types/chat.ts` speaks. An unknown provider reason is
 * lowercased and passed through rather than folded into a reason it does not mean.
 */
const GEMINI_FINISH_REASONS: Readonly<Record<string, string>> = {
  STOP: 'stop',
  MAX_TOKENS: 'length',
  MALFORMED_FUNCTION_CALL: 'tool_calls',
  SAFETY: 'content_filter',
  RECITATION: 'content_filter',
  LANGUAGE: 'content_filter',
  BLOCKLIST: 'content_filter',
  PROHIBITED_CONTENT: 'content_filter',
  SPII: 'content_filter',
  IMAGE_SAFETY: 'content_filter',
};

function geminiFinishReason(value: string | null): string | null {
  if (value === null || value === '' || value === 'FINISH_REASON_UNSPECIFIED') {
    return null;
  }

  return GEMINI_FINISH_REASONS[value] ?? value.toLowerCase();
}

function geminiUsage(value: unknown): ChatUsage | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    promptTokens: readCount(value, 'promptTokenCount'),
    completionTokens: readCount(value, 'candidatesTokenCount'),
    totalTokens: readCount(value, 'totalTokenCount'),
  };
}

/**
 * Gemini declares no tool call id, so one is derived from the position of the call: a part of the frame for a
 * stream, a part of the answer otherwise. The arguments travel as JSON text, exactly as the contract carries
 * them.
 */
function geminiCallId(index: number): string {
  return `gemini_call_${index}`;
}

function readParts(
  candidate: Readonly<Record<string, unknown>> | null,
  report?: FrameReport,
): readonly Readonly<Record<string, unknown>>[] {
  if (candidate === null) {
    return [];
  }

  const content = readRecord(candidate, 'content', report);

  return content === null ? [] : readRecordArray(content, 'parts', report);
}

/** A reasoning part carries no answer text; the normalized contract has no channel for it. */
function partText(part: Readonly<Record<string, unknown>>): string | null {
  return part.thought === true ? null : readText(part, 'text');
}

function partFunctionCall(part: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> | null {
  return isRecord(part.functionCall) ? part.functionCall : null;
}

function toToolCall(call: Readonly<Record<string, unknown>>, index: number): ChatToolCall {
  return {
    id: geminiCallId(index),
    name: readText(call, 'name') ?? '',
    arguments: stringifyToolArguments(call.args),
  };
}

/**
 * The calls of one payload, in order. Gemini splits nothing: a call arrives whole, so the arguments are the
 * JSON text the provider stated and the position of the call is what names it. A joiner therefore starts a new
 * call on every delta that carries a name, because an id can repeat across frames of one stream.
 */
function readToolCalls(parts: readonly Readonly<Record<string, unknown>>[]): readonly ChatToolCall[] {
  const calls: ChatToolCall[] = [];

  for (const part of parts) {
    const call = partFunctionCall(part);

    if (call !== null) {
      calls.push(toToolCall(call, calls.length));
    }
  }

  return calls;
}

function decodeResponse(payload: unknown): ChatResponse {
  const record = asRecord(payload, 'the gemini response');
  const candidates = record.candidates;

  if (candidates !== undefined && !Array.isArray(candidates)) {
    throw new TranslationError(
      'invalid_frame',
      'the gemini response carries a candidates field that is not an array',
    );
  }

  const candidate = candidates === undefined ? null : firstRecord(candidates, 'candidates');
  const parts = readParts(candidate);

  return {
    text: parts
      .map(partText)
      .filter((text): text is string => text !== null)
      .join(''),
    toolCalls: readToolCalls(parts),
    finishReason: geminiFinishReason(candidate === null ? null : readText(candidate, 'finishReason')),
    usage: geminiUsage(record.usageMetadata),
  };
}

function decodeChunk(payload: unknown, report?: FrameReport): readonly ChatChunk[] {
  const frame = parseFrame(payload, report);

  if (frame === null) {
    return [];
  }

  const chunks: ChatChunk[] = [];
  const candidate = readFirst(frame, 'candidates', report);
  let calls = 0;

  readParts(candidate, report).forEach((part) => {
    const call = partFunctionCall(part);

    if (call !== null) {
      chunks.push({
        toolCallDelta: {
          index: calls,
          id: geminiCallId(calls),
          name: readText(call, 'name') ?? '',
          arguments: stringifyToolArguments(call.args),
        },
      });

      calls += 1;

      return;
    }

    const text = partText(part);

    if (text !== null && text !== '') {
      chunks.push({ delta: text });
    }
  });

  const finishReason = candidate === null ? null : geminiFinishReason(readText(candidate, 'finishReason'));

  if (finishReason !== null) {
    chunks.push({ finishReason });
  }

  const usage = geminiUsage(frame.usageMetadata);

  if (usage !== null) {
    chunks.push({ usage });
  }

  return chunks;
}
