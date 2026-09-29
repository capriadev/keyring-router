import type {
  ChatContentPart,
  ChatImagePart,
  ChatMessage,
  ChatRequest,
  ChatToolCall,
  ChatToolDefinition,
} from '../../types/chat.js';
import { InvalidChatRequestError } from './errors.js';

/**
 * The fields of the OpenAI chat body the facade models. Everything else a client sends travels on
 * through `passthrough`, so a parameter this contract does not know is never silently dropped.
 */
export interface OpenAiChatBodyInput {
  readonly model: string;
  readonly messages: readonly OpenAiMessageInput[];
  readonly stream?: boolean | null;
  readonly tools?: readonly OpenAiToolInput[] | null;
  readonly temperature?: number | null;
  readonly top_p?: number | null;
  readonly max_tokens?: number | null;
  readonly max_completion_tokens?: number | null;
  readonly [parameter: string]: unknown;
}

export interface OpenAiMessageInput {
  readonly role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  readonly content?: string | readonly OpenAiContentPartInput[] | null;
  readonly tool_calls?: readonly OpenAiToolCallInput[] | null;
  readonly tool_call_id?: string | null;
  readonly name?: string | null;
  readonly [field: string]: unknown;
}

export interface OpenAiContentPartInput {
  readonly type: string;
  readonly text?: string | null;
  readonly image_url?: { readonly url?: string | null } | null;
  readonly [field: string]: unknown;
}

export interface OpenAiToolCallInput {
  readonly id?: string | null;
  readonly function?: { readonly name?: string | null; readonly arguments?: string | null } | null;
  readonly [field: string]: unknown;
}

export interface OpenAiToolInput {
  readonly type?: string | null;
  readonly function?:
    | { readonly name?: string | null; readonly description?: string | null; readonly parameters?: unknown }
    | null;
  readonly [field: string]: unknown;
}

const OPENAI_CONSUMED = [
  'model',
  'messages',
  'stream',
  'tools',
  'temperature',
  'top_p',
  'max_tokens',
  'max_completion_tokens',
] as const;

/**
 * The OpenAI body as the frozen chat contract. Anything the contract does not model - frequency
 * penalties, stop sequences, response format, a provider extension - is carried through untouched so
 * the translator can decide, instead of the boundary dropping it without a word.
 */
export function toChatRequest(body: OpenAiChatBodyInput): ChatRequest {
  const messages = body.messages.map((message, index) => toChatMessage(message, index));
  const tools = (body.tools ?? []).map((tool, index) => toToolDefinition(tool, index));
  const passthrough = passthroughOf(body, OPENAI_CONSUMED);

  return {
    model: body.model,
    messages,
    stream: body.stream === true,
    ...(tools.length === 0 ? {} : { tools }),
    ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
    ...(typeof body.top_p === 'number' ? { topP: body.top_p } : {}),
    ...outputTokens(body),
    ...(passthrough === undefined ? {} : { passthrough }),
  };
}

function toChatMessage(message: OpenAiMessageInput, index: number): ChatMessage {
  const role = message.role === 'developer' ? 'system' : message.role;
  const toolCalls = (message.tool_calls ?? []).map((call, position) => toToolCall(call, index, position));
  const toolCallId = typeof message.tool_call_id === 'string' ? message.tool_call_id : undefined;

  if (role === 'tool' && toolCallId === undefined) {
    throw new InvalidChatRequestError(`messages.${index}: a tool message must name the call it answers`);
  }

  return {
    role,
    content: toContent(message.content, `messages.${index}`),
    ...(toolCalls.length === 0 ? {} : { toolCalls }),
    ...(toolCallId === undefined ? {} : { toolCallId }),
    ...(typeof message.name === 'string' ? { name: message.name } : {}),
  };
}

function toContent(
  content: string | readonly OpenAiContentPartInput[] | null | undefined,
  path: string,
): readonly ChatContentPart[] {
  if (content === null || content === undefined) {
    return [];
  }

  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  return content.map((part, index) => toContentPart(part, `${path}.content.${index}`));
}

function toContentPart(part: OpenAiContentPartInput, path: string): ChatContentPart {
  if (part.type === 'text') {
    if (typeof part.text !== 'string') {
      throw new InvalidChatRequestError(`${path}: a text part must carry its text`);
    }

    return { type: 'text', text: part.text };
  }

  if (part.type === 'image_url') {
    const url = part.image_url?.url;

    if (typeof url !== 'string' || url === '') {
      throw new InvalidChatRequestError(`${path}: an image_url part must carry its url`);
    }

    const image: ChatImagePart = { type: 'image', url };

    return image;
  }

  throw new InvalidChatRequestError(`${path}: unsupported content part type ${part.type}`);
}

function toToolCall(call: OpenAiToolCallInput, index: number, position: number): ChatToolCall {
  const path = `messages.${index}.tool_calls.${position}`;
  const id = call.id;
  const name = call.function?.name;
  const args = call.function?.arguments;

  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') {
    throw new InvalidChatRequestError(`${path}: a tool call must carry its id and its function name`);
  }

  if (typeof args !== 'string') {
    throw new InvalidChatRequestError(`${path}: function.arguments must be JSON text`);
  }

  return { id, name, arguments: args };
}

function toToolDefinition(tool: OpenAiToolInput, index: number): ChatToolDefinition {
  const name = tool.function?.name;

  if (typeof name !== 'string' || name === '') {
    throw new InvalidChatRequestError(`tools.${index}: a tool must carry function.name`);
  }

  return {
    name,
    ...(typeof tool.function?.description === 'string' ? { description: tool.function.description } : {}),
    parameters: tool.function?.parameters ?? {},
  };
}

/** Every field the contract does not model, kept as it arrived. */
export function passthroughOf(
  body: Readonly<Record<string, unknown>>,
  consumed: readonly string[],
): Readonly<Record<string, unknown>> | undefined {
  const entries = Object.entries(body).filter(([key]) => !consumed.includes(key));

  return entries.length === 0 ? undefined : Object.fromEntries(entries);
}

/** `max_completion_tokens` is the current name of the same field; the older one still arrives. */
function outputTokens(body: OpenAiChatBodyInput): { readonly maxOutputTokens?: number } {
  const limit = body.max_completion_tokens ?? body.max_tokens;

  return typeof limit === 'number' ? { maxOutputTokens: limit } : {};
}
