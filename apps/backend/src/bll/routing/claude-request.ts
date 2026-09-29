import type { ChatContentPart, ChatImagePart, ChatMessage, ChatRequest, ChatToolCall, ChatToolDefinition } from '../../types/chat.js';
import { InvalidChatRequestError } from './errors.js';
import { passthroughOf } from './client-request.js';

/** The fields of the Messages API body the facade models; the rest travels on through `passthrough`. */
export interface ClaudeMessagesBodyInput {
  readonly model: string;
  readonly max_tokens: number;
  readonly messages: readonly ClaudeMessageInput[];
  readonly system?: string | readonly ClaudeContentBlockInput[] | null;
  readonly stream?: boolean | null;
  readonly tools?: readonly ClaudeToolInput[] | null;
  readonly temperature?: number | null;
  readonly top_p?: number | null;
  readonly [parameter: string]: unknown;
}

export interface ClaudeMessageInput {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly ClaudeContentBlockInput[];
  readonly [field: string]: unknown;
}

export interface ClaudeContentBlockInput {
  readonly type: string;
  readonly text?: string | null;
  readonly source?: ClaudeImageSourceInput | null;
  readonly id?: string | null;
  readonly name?: string | null;
  readonly input?: unknown;
  readonly tool_use_id?: string | null;
  readonly content?: string | readonly ClaudeContentBlockInput[] | null;
  readonly [field: string]: unknown;
}

export interface ClaudeImageSourceInput {
  readonly type?: string | null;
  readonly media_type?: string | null;
  readonly data?: string | null;
  readonly url?: string | null;
  readonly [field: string]: unknown;
}

export interface ClaudeToolInput {
  readonly name?: string | null;
  readonly description?: string | null;
  readonly input_schema?: unknown;
  readonly [field: string]: unknown;
}

const CLAUDE_CONSUMED = ['model', 'max_tokens', 'messages', 'system', 'stream', 'tools', 'temperature', 'top_p'];

/**
 * The Messages API body as the frozen chat contract. A Claude system prompt is a message of its own
 * in that contract, a `tool_use` block is a tool call, and a `tool_result` block - which arrives
 * inside a user turn - becomes the tool message it stands for.
 */
export function toChatRequest(body: ClaudeMessagesBodyInput): ChatRequest {
  const system = toSystemMessage(body.system);
  const messages = [...system, ...body.messages.flatMap((message, index) => toMessages(message, index))];
  const tools = (body.tools ?? []).map((tool, index) => toToolDefinition(tool, index));
  const passthrough = passthroughOf(body, CLAUDE_CONSUMED);

  return {
    model: body.model,
    messages,
    stream: body.stream === true,
    ...(tools.length === 0 ? {} : { tools }),
    ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
    ...(typeof body.top_p === 'number' ? { topP: body.top_p } : {}),
    maxOutputTokens: body.max_tokens,
    ...(passthrough === undefined ? {} : { passthrough }),
  };
}

function toSystemMessage(
  system: string | readonly ClaudeContentBlockInput[] | null | undefined,
): readonly ChatMessage[] {
  if (system === null || system === undefined) {
    return [];
  }

  if (typeof system === 'string') {
    return system === '' ? [] : [{ role: 'system', content: [{ type: 'text', text: system }] }];
  }

  const parts = system.map((block, index) => toTextPart(block, `system.${index}`));

  return parts.length === 0 ? [] : [{ role: 'system', content: parts }];
}

/**
 * One Claude turn as one or two messages. A user turn that carries tool results becomes the tool
 * messages they mean, followed by the user message of its remaining blocks: the frozen contract keeps
 * a tool answer and a user question apart, and merging them would lose the call each result answers.
 */
function toMessages(message: ClaudeMessageInput, index: number): readonly ChatMessage[] {
  const path = `messages.${index}`;

  if (typeof message.content === 'string') {
    return [{ role: message.role, content: [{ type: 'text', text: message.content }] }];
  }

  const results = message.content.filter((block) => block.type === 'tool_result');
  const rest = message.content.filter((block) => block.type !== 'tool_result');

  if (message.role === 'assistant' && results.length > 0) {
    throw new InvalidChatRequestError(`${path}: a tool result belongs in a user turn, not in an assistant one`);
  }

  const toolMessages = results.map((block, position) => toToolMessage(block, `${path}.content.${position}`));
  const calls = rest
    .filter((block) => block.type === 'tool_use')
    .map((block, position) => toToolUse(block, `${path}.content.${position}`));
  const parts = rest
    .filter((block) => block.type !== 'tool_use')
    .map((block, position) => toTextOrImage(block, `${path}.content.${position}`));

  if (parts.length === 0) {
    return [...toolMessages, ...(calls.length === 0 ? [] : [{ role: message.role, content: [], toolCalls: calls }])];
  }

  return [
    ...toolMessages,
    {
      role: message.role,
      content: parts,
      ...(calls.length === 0 ? {} : { toolCalls: calls }),
    },
  ];
}

function toToolMessage(block: ClaudeContentBlockInput, path: string): ChatMessage {
  const toolCallId = block.tool_use_id;

  if (typeof toolCallId !== 'string' || toolCallId === '') {
    throw new InvalidChatRequestError(`${path}: a tool result must name the call it answers`);
  }

  // `is_error` has no field in the frozen contract: the text of the result is what a provider reads,
  // and inventing a flag no provider takes would be worse than carrying the content alone.
  return { role: 'tool', content: toResultContent(block.content, path), toolCallId };
}

function toResultContent(
  content: string | readonly ClaudeContentBlockInput[] | null | undefined,
  path: string,
): readonly ChatContentPart[] {
  if (content === null || content === undefined) {
    return [];
  }

  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }

  return content.map((block, index) => toTextPart(block, `${path}.content.${index}`));
}

/** A block that carries content: text, or an image. A tool call is a message of its own, not a part. */
function toTextOrImage(block: ClaudeContentBlockInput, path: string): ChatContentPart {
  if (block.type === 'text') {
    return toTextPart(block, path);
  }

  if (block.type === 'image') {
    return toImagePart(block, path);
  }

  throw new InvalidChatRequestError(`${path}: unsupported content block type ${block.type}`);
}

function toTextPart(block: ClaudeContentBlockInput, path: string): ChatContentPart {
  if (block.type !== 'text' || typeof block.text !== 'string') {
    throw new InvalidChatRequestError(`${path}: expected a text block`);
  }

  return { type: 'text', text: block.text };
}


function toImagePart(block: ClaudeContentBlockInput, path: string): ChatImagePart {
  const source = block.source;

  if (source?.type === 'base64') {
    if (typeof source.media_type !== 'string' || typeof source.data !== 'string') {
      throw new InvalidChatRequestError(`${path}: a base64 image must carry its media_type and its data`);
    }

    return { type: 'image', url: `data:${source.media_type};base64,${source.data}`, mediaType: source.media_type };
  }

  if (source?.type === 'url') {
    if (typeof source.url !== 'string' || source.url === '') {
      throw new InvalidChatRequestError(`${path}: an image source of type url must carry its url`);
    }

    return { type: 'image', url: source.url };
  }

  throw new InvalidChatRequestError(`${path}: unsupported image source type ${source?.type ?? '(none)'}`);
}

/** `input` is JSON by contract, so it travels as text; the translator parses it if the target needs it. */
function toToolUse(block: ClaudeContentBlockInput, path: string): ChatToolCall {
  const id = block.id;
  const name = block.name;

  if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') {
    throw new InvalidChatRequestError(`${path}: a tool_use block must carry its id and its name`);
  }

  return { id, name, arguments: JSON.stringify(block.input ?? {}) };
}

function toToolDefinition(tool: ClaudeToolInput, index: number): ChatToolDefinition {
  const name = tool.name;

  if (typeof name !== 'string' || name === '') {
    throw new InvalidChatRequestError(`tools.${index}: a tool must carry its name`);
  }

  if (tool.input_schema === undefined) {
    throw new InvalidChatRequestError(`tools.${index}: a tool must carry its input_schema`);
  }

  return {
    name,
    ...(typeof tool.description === 'string' ? { description: tool.description } : {}),
    parameters: tool.input_schema,
  };
}

