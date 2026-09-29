import type { FastifyReply } from 'fastify';
import { ClientDisconnectedError } from '../bll/routing/errors.js';
import type {
  OpenAiChatCompletionChunk,
  OpenAiChatCompletionResponse,
  OpenAiChunkDelta,
  OpenAiModelListResponse,
  OpenAiUsage,
} from '../types/api.js';
import type { ExposedModel } from '../types/catalog.js';
import type { ChatChunk, ChatResponse, ChatUsage } from '../types/chat.js';
import { resolveApiError } from './api-errors.js';
import { toOpenAiErrorBody } from './v1-errors.js';
import { closeSseStream, openSseStream, writeDataFrame, writeDoneFrame } from './v1-sse.js';

/**
 * The OpenAI projection of the exposed listing. It maps what the policy filtered listing already
 * returned: no catalog is read here, so this endpoint can never serve a set of its own.
 */
export function openAiModelList(models: readonly ExposedModel[]): OpenAiModelListResponse {
  return {
    object: 'list',
    data: models.map((model) => ({
      id: model.namespacedId,
      object: 'model',
      created: 0,
      owned_by: model.providerId,
    })),
  };
}

export interface CompletionInput {
  readonly id: string;
  readonly model: string;
  readonly created: number;
  readonly response: ChatResponse;
  readonly warnings: readonly string[];
}

export function openAiCompletion(input: CompletionInput): OpenAiChatCompletionResponse {
  const toolCalls = input.response.toolCalls.map((call) => ({
    id: call.id,
    type: 'function' as const,
    function: { name: call.name, arguments: call.arguments },
  }));

  return {
    id: input.id,
    object: 'chat.completion',
    created: input.created,
    model: input.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: input.response.text === '' ? null : input.response.text,
          ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
        },
        finish_reason: input.response.finishReason,
      },
    ],
    usage: openAiUsage(input.response.usage),
    ...warningsField(input.warnings),
  };
}

export interface StreamInput {
  readonly id: string;
  readonly model: string;
  readonly created: number;
  readonly warnings: readonly string[];
  readonly chunks: AsyncIterable<ChatChunk>;
}

/**
 * Writes one streamed completion. The opening frame announces the assistant turn and carries what the
 * translation removed; each provider frame becomes one frame per chunk; a provider failure ends the
 * stream with an error frame and the sentinel, so a client never reads a truncation as an ending.
 */
export async function sendOpenAiStream(reply: FastifyReply, input: StreamInput): Promise<void> {
  openSseStream(reply);

  const envelope = {
    id: input.id,
    object: 'chat.completion.chunk',
    created: input.created,
    model: input.model,
  } as const;

  await writeDataFrame(reply, {
    ...envelope,
    choices: [{ index: 0, delta: { role: 'assistant', content: '' }, finish_reason: null }],
    ...warningsField(input.warnings),
  });

  try {
    for await (const chunk of input.chunks) {
      await writeDataFrame(reply, chunkFrame(envelope, chunk));
    }

    await writeDoneFrame(reply);
  } catch (error) {
    // A client that is gone has nobody left to be told, and its socket is unusable already: the ending
    // frame would be the only thing written to it.
    if (!(error instanceof ClientDisconnectedError)) {
      await writeDataFrame(reply, toOpenAiErrorBody(resolveApiError(error, { method: 'POST' })));
      await writeDoneFrame(reply);
    }
  } finally {
    await closeSseStream(reply);
  }
}

function chunkFrame(envelope: Omit<OpenAiChatCompletionChunk, 'choices' | 'usage'>, chunk: ChatChunk): OpenAiChatCompletionChunk {
  const usage = chunk.usage === undefined ? undefined : openAiUsage(chunk.usage);
  const delta = chunkDelta(chunk);

  if (delta === undefined) {
    // A frame that reports usage and nothing else: the shape the OpenAI stream closes with.
    return { ...envelope, choices: [], ...(usage === undefined ? {} : { usage }) };
  }

  return {
    ...envelope,
    choices: [{ index: 0, delta, finish_reason: chunk.finishReason ?? null }],
    ...(usage === undefined ? {} : { usage }),
  };
}

function chunkDelta(chunk: ChatChunk): OpenAiChunkDelta | undefined {
  const delta: {
    content?: string;
    tool_calls?: OpenAiChunkDelta['tool_calls'];
  } = {};

  if (chunk.delta !== undefined && chunk.delta !== '') {
    delta.content = chunk.delta;
  }

  const call = chunk.toolCallDelta;

  if (call !== undefined) {
    delta.tool_calls = [
      {
        index: call.index,
        ...(call.id === undefined ? {} : { id: call.id }),
        type: 'function',
        ...(call.name === undefined && call.arguments === undefined
          ? {}
          : {
              function: {
                ...(call.name === undefined ? {} : { name: call.name }),
                ...(call.arguments === undefined ? {} : { arguments: call.arguments }),
              },
            }),
      },
    ];
  }

  if (Object.keys(delta).length === 0) {
    return chunk.finishReason === undefined ? undefined : {};
  }

  return delta;
}

export function openAiUsage(usage: ChatUsage | null): OpenAiUsage | null {
  if (usage === null) {
    return null;
  }

  return {
    prompt_tokens: usage.promptTokens,
    completion_tokens: usage.completionTokens,
    total_tokens: usage.totalTokens,
  };
}

/** Present only when the translation removed something: an untouched request looks untouched. */
function warningsField(warnings: readonly string[]): { readonly kr_warnings?: readonly string[] } {
  return warnings.length === 0 ? {} : { kr_warnings: [...warnings] };
}
