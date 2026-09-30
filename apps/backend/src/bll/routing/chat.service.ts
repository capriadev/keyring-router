import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  FrameReport,
  TranslatedRequest,
} from '../../types/chat.js';
import type { ProviderChatCall } from '../../types/chat-transport.js';
import { countFrameDrops } from '../translation/frame-report.js';
import { ClientDisconnectedError } from './errors.js';
import { RequestRouter, type ResolvedRoute, type RouteInput } from './request-router.js';
import { mapTranslationFailure } from './translation.js';

export interface ChatCallInput extends RouteInput {
  /** The client request after normalization, in the shape every translator reads. */
  readonly request: ChatRequest;
  /** Set by the HTTP surface: aborted, the upstream work stops and nothing is answered. */
  readonly signal?: AbortSignal;
}

export interface ChatCompletion {
  readonly route: ResolvedRoute;
  readonly response: ChatResponse;
  /** Parameters the catalog declares unsupported for the model and the translation removed. */
  readonly warnings: readonly string[];
}

export interface ChatStream {
  readonly route: ResolvedRoute;
  readonly warnings: readonly string[];
  readonly chunks: AsyncIterable<ChatChunk>;
}

/**
 * The chat facade over one resolved route: translate the request into the provider's shape, carry it,
 * and translate the answer back into the shape the client asked for. It knows neither HTTP nor any
 * provider: the router decided where the call goes and the adapter carries the bytes.
 *
 * Streaming stays lazy end to end: nothing reaches the provider until the HTTP surface starts
 * consuming, and stopping the consumption - a client that disconnected, an error frame, a caller that
 * walked away - closes the provider stream through the iterator.
 */
@Injectable()
export class ChatService {
  private readonly logger = new Logger('ChatService');

  constructor(@Inject(RequestRouter) private readonly router: RequestRouter) {}

  async complete(input: ChatCallInput): Promise<ChatCompletion> {
    const route = this.router.resolve({ ...input, stream: false });
    const translated = this.translatedRequest(route, input.request);
    const payload = await this.carry(route, providerCall(route, translated.body, false, input.signal));

    return {
      route,
      response: this.translatedResponse(route, payload),
      warnings: translated.warnings,
    };
  }

  stream(input: ChatCallInput): ChatStream {
    const route = this.router.resolve({ ...input, stream: true });
    const translated = this.translatedRequest(route, input.request);
    const frames = route.adapter.chatStream(route.target, providerCall(route, translated.body, true, input.signal));

    return {
      route,
      warnings: translated.warnings,
      chunks: this.translatedChunks(route, frames, input.signal),
    };
  }

  /** One non streaming call, abandoned as soon as the client is gone. */
  private async carry(route: ResolvedRoute, call: ProviderChatCall): Promise<unknown> {
    return await withAbort(route.adapter.chat(route.target, call), call.signal);
  }

  /**
   * Each provider frame, translated to the client's format and yielded at once. A frame that carries
   * nothing for the client yields nothing; a frame the translator refuses fails loudly, so a broken
   * stream is reported instead of being trimmed in silence.
   *
   * A frame the translator had to drop is counted and reported once, when the request is over: the
   * response has already started, so the log is the only place left to say it. Spec 014.
   */
  private async *translatedChunks(
    route: ResolvedRoute,
    frames: AsyncIterable<unknown>,
    signal?: AbortSignal,
  ): AsyncGenerator<ChatChunk> {
    const drops = countFrameDrops();
    const iterator = frames[Symbol.asyncIterator]();

    try {
      for (;;) {
        if (signal?.aborted === true) {
          throw new ClientDisconnectedError();
        }

        const frame = await withAbort(iterator.next(), signal);

        if (frame.done === true) {
          return;
        }

        for (const chunk of this.translatedChunk(route, frame.value, drops.report)) {
          yield chunk;
        }
      }
    } finally {
      // Closing the iterator is what stops the provider stream: a consumer that walked away must not
      // leave a request paying for frames nobody will read.
      await iterator.return?.(undefined);

      const dropped = drops.line(route.requestId);

      if (dropped !== null) {
        this.logger.warn(dropped);
      }
    }
  }

  private translatedRequest(route: ResolvedRoute, request: ChatRequest): TranslatedRequest {
    try {
      return route.translator.translateRequest(request, route.translateOptions);
    } catch (error) {
      throw mapTranslationFailure(error, route.pair, route.providerId);
    }
  }

  private translatedResponse(route: ResolvedRoute, payload: unknown): ChatResponse {
    try {
      return route.translator.translateResponse(payload);
    } catch (error) {
      throw mapTranslationFailure(error, route.pair, route.providerId);
    }
  }

  private translatedChunk(route: ResolvedRoute, payload: unknown, report?: FrameReport): readonly ChatChunk[] {
    try {
      return route.translator.translateChunk(payload, report);
    } catch (error) {
      throw mapTranslationFailure(error, route.pair, route.providerId);
    }
  }
}

/**
 * One call as the transport contract expects it: the body in the provider's shape, whether it is
 * streamed, and the client's signal. The signal travels to the adapter because only the transport can
 * stop an upstream request that is already in flight; the facade can only stop waiting for it.
 */
function providerCall(
  route: ResolvedRoute,
  body: Readonly<Record<string, unknown>>,
  stream: boolean,
  signal: AbortSignal | undefined,
): ProviderChatCall {
  return {
    model: route.providerModelId,
    body,
    stream,
    ...(signal === undefined ? {} : { signal }),
  };
}

/**
 * Settles with the work, or fails the moment the client is gone. The upstream call is raced rather
 * than cancelled: a transport that carries no signal keeps running, and its answer is dropped when it
 * arrives. The listener is removed either way, so a long lived connection does not accumulate them.
 */
async function withAbort<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) {
    return work;
  }

  if (signal.aborted) {
    throw new ClientDisconnectedError();
  }

  let listener: (() => void) | undefined;

  const disconnected = new Promise<never>((_resolve, reject) => {
    listener = () => reject(new ClientDisconnectedError());
    signal.addEventListener('abort', listener, { once: true });
  });

  try {
    return await Promise.race([work, disconnected]);
  } finally {
    if (listener !== undefined) {
      signal.removeEventListener('abort', listener);
    }
  }
}
