import type { FastifyReply } from 'fastify';
import { ClientDisconnectedError } from '../bll/routing/errors.js';
import type {
  ClaudeErrorBody,
  ClaudeMessageDeltaEvent,
  ClaudeMessageResponse,
  ClaudeMessageStartEvent,
  ClaudeUsage,
} from '../types/api.js';
import type { ChatChunk, ChatResponse, ChatToolCall, ChatToolCallDelta, ChatUsage } from '../types/chat.js';
import { ProviderFailure } from '../types/provider.js';
import { resolveApiError } from './api-errors.js';
import { toClaudeErrorBody } from './v1-errors.js';
import { closeSseStream, openSseStream, writeEventFrame } from './v1-sse.js';

/**
 * The Messages API projection. It maps what the translation already normalized: a client that asked in
 * Claude shape is answered in Claude shape, and no provider detail appears on either side.
 */

export interface ClaudeMessageInput {
  readonly id: string;
  readonly model: string;
  readonly response: ChatResponse;
  readonly warnings: readonly string[];
  /** Named only when a tool call cannot become a `tool_use` block, so the failure says who is at fault. */
  readonly providerId: string;
}

export function claudeMessage(input: ClaudeMessageInput): ClaudeMessageResponse {
  const toolCalls = input.response.toolCalls;
  const content = [
    ...textBlocks(input.response.text, toolCalls.length > 0),
    ...toolCalls.map((call) => toolUseBlock(call, input.providerId)),
  ];

  return {
    id: input.id,
    type: 'message',
    role: 'assistant',
    model: input.model,
    content,
    stop_reason: claudeStopReason(input.response.finishReason),
    stop_sequence: null,
    usage: claudeUsage(input.response.usage),
    ...(input.warnings.length === 0 ? {} : { kr_warnings: [...input.warnings] }),
  };
}

export interface ClaudeStreamInput {
  readonly id: string;
  readonly model: string;
  readonly warnings: readonly string[];
  readonly chunks: AsyncIterable<ChatChunk>;
}

/**
 * Writes one streamed answer in the Messages API event protocol: `message_start`, the content blocks as
 * they arrive, `message_delta` with the stop reason and the usage, and `message_stop`. A mid stream
 * provider failure becomes an `error` event, which is how that protocol reports a broken answer: the
 * stream is never left open and never ends as if it had completed.
 */
export async function sendClaudeStream(reply: FastifyReply, input: ClaudeStreamInput): Promise<void> {
  openSseStream(reply);

  const writer = new ClaudeStreamWriter(reply, input);

  try {
    await writer.start();

    for await (const chunk of input.chunks) {
      await writer.write(chunk);
    }

    await writer.finish();
  } catch (error) {
    // A client that is gone has nobody left to be told, and its socket is unusable already.
    if (!(error instanceof ClientDisconnectedError)) {
      await writer.fail(error);
    }
  } finally {
    await closeSseStream(reply);
  }
}

/**
 * One stream in flight. Blocks stay open until the answer ends, because a provider sends the fragments
 * of one call across several frames and closing early would turn one block into several.
 */
class ClaudeStreamWriter {
  private textIndex: number | null = null;

  /** Provider call position to the content block index it is served as. */
  private readonly toolIndexes = new Map<number, number>();

  private nextIndex = 0;

  private stopReason: string | null = null;

  private usage: ChatUsage | null = null;

  constructor(
    private readonly reply: FastifyReply,
    private readonly input: ClaudeStreamInput,
  ) {}

  async start(): Promise<void> {
    const event: ClaudeMessageStartEvent = {
      type: 'message_start',
      message: {
        id: this.input.id,
        type: 'message',
        role: 'assistant',
        model: this.input.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
        ...(this.input.warnings.length === 0 ? {} : { kr_warnings: [...this.input.warnings] }),
      },
    };

    await writeEventFrame(this.reply, event.type, event);
  }

  async write(chunk: ChatChunk): Promise<void> {
    if (chunk.delta !== undefined && chunk.delta !== '') {
      await this.writeText(chunk.delta);
    }

    if (chunk.toolCallDelta !== undefined) {
      await this.writeToolCall(chunk.toolCallDelta);
    }

    if (chunk.finishReason !== undefined) {
      this.stopReason = chunk.finishReason;
    }

    if (chunk.usage !== undefined && chunk.usage !== null) {
      this.usage = chunk.usage;
    }
  }

  async finish(): Promise<void> {
    await this.closeBlocks();
    await writeEventFrame(this.reply, 'message_delta', this.messageDelta());
    await writeEventFrame(this.reply, 'message_stop', { type: 'message_stop' });
  }

  async fail(error: unknown): Promise<void> {
    const body: ClaudeErrorBody = toClaudeErrorBody(resolveApiError(error, { method: 'POST' }));

    await writeEventFrame(this.reply, 'error', body);
  }

  private async writeText(text: string): Promise<void> {
    const index = await this.openText();

    await writeEventFrame(this.reply, 'content_block_delta', {
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text },
    });
  }

  private async openText(): Promise<number> {
    if (this.textIndex === null) {
      this.textIndex = this.nextIndex++;

      await writeEventFrame(this.reply, 'content_block_start', {
        type: 'content_block_start',
        index: this.textIndex,
        content_block: { type: 'text', text: '' },
      });
    }

    return this.textIndex;
  }

  /**
   * One tool call fragment. The block opens with the fragment that carries the identifier and the name;
   * a fragment that carries arguments alone continues the block the provider announced, and no
   * identifier is invented for it.
   */
  private async writeToolCall(delta: ChatToolCallDelta): Promise<void> {
    const index = await this.toolIndex(delta);

    if (delta.arguments !== undefined && delta.arguments !== '') {
      await writeEventFrame(this.reply, 'content_block_delta', {
        type: 'content_block_delta',
        index,
        delta: { type: 'input_json_delta', partial_json: delta.arguments },
      });
    }
  }

  private async toolIndex(delta: ChatToolCallDelta): Promise<number> {
    const open = this.toolIndexes.get(delta.index);

    if (open !== undefined) {
      return open;
    }

    const index = this.nextIndex++;
    this.toolIndexes.set(delta.index, index);

    if (delta.id !== undefined || delta.name !== undefined) {
      await writeEventFrame(this.reply, 'content_block_start', {
        type: 'content_block_start',
        index,
        content_block: { type: 'tool_use', id: delta.id ?? '', name: delta.name ?? '', input: {} },
      });
    }

    return index;
  }

  private async closeBlocks(): Promise<void> {
    const indexes = [
      ...(this.textIndex === null ? [] : [this.textIndex]),
      ...this.toolIndexes.values(),
    ].sort((left, right) => left - right);

    for (const index of indexes) {
      await writeEventFrame(this.reply, 'content_block_stop', { type: 'content_block_stop', index });
    }
  }

  /**
   * The usage of a stream is known only when it ends, and the Messages API counts the output there. The
   * input count travels with it when the provider reported one, because `message_start` was already
   * written and a count the provider did send must not be dropped on the floor.
   */
  private messageDelta(): ClaudeMessageDeltaEvent {
    const promptTokens = this.usage?.promptTokens;

    return {
      type: 'message_delta',
      delta: { stop_reason: claudeStopReason(this.stopReason), stop_sequence: null },
      usage: {
        output_tokens: this.usage?.completionTokens ?? 0,
        ...(typeof promptTokens === 'number' ? { input_tokens: promptTokens } : {}),
      },
    };
  }
}

/**
 * A text block, unless the answer carried none: an empty text next to tool calls would claim the model
 * said something. An answer with nothing at all keeps one empty block, because the Messages API does
 * not accept a message with an empty content array.
 */
function textBlocks(
  text: string,
  hasToolCalls: boolean,
): readonly { readonly type: 'text'; readonly text: string }[] {
  if (text === '') {
    return hasToolCalls ? [] : [{ type: 'text', text: '' }];
  }

  return [{ type: 'text', text }];
}

/** Arguments arrive as JSON text because a provider streams them in fragments; this block needs them parsed. */
function toolUseBlock(
  call: ChatToolCall,
  providerId: string,
): { readonly type: 'tool_use'; readonly id: string; readonly name: string; readonly input: unknown } {
  return { type: 'tool_use', id: call.id, name: call.name, input: parseArguments(call, providerId) };
}

function parseArguments(call: ChatToolCall, providerId: string): unknown {
  if (call.arguments === '') {
    return {};
  }

  try {
    return JSON.parse(call.arguments);
  } catch {
    // The identifier names which call is broken; the arguments themselves are never quoted into an error.
    throw new ProviderFailure(
      providerId,
      'invalid_response',
      `tool call ${call.id} carried arguments that are not JSON`,
    );
  }
}

/**
 * The stop reason in the Messages API vocabulary. A normalized value with no equivalent travels
 * unchanged, so an unknown reason stays visible instead of being flattened into a wrong one.
 */
const CLAUDE_STOP_REASONS: Readonly<Record<string, string>> = {
  stop: 'end_turn',
  length: 'max_tokens',
  tool_calls: 'tool_use',
};

function claudeStopReason(reason: string | null): string | null {
  return reason === null ? null : (CLAUDE_STOP_REASONS[reason] ?? reason);
}

/** An unreported count is 0 here: the Messages API has no way to say "not reported". */
export function claudeUsage(usage: ChatUsage | null): ClaudeUsage {
  return {
    input_tokens: usage?.promptTokens ?? 0,
    output_tokens: usage?.completionTokens ?? 0,
  };
}


