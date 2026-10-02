import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env.js';
import type {
  ChatChunk,
  ChatRequest,
  ChatResponse,
  FrameReport,
  TranslatedRequest,
} from '../../types/chat.js';
import type { ProviderChatCall } from '../../types/chat-transport.js';
import { ProviderFailure } from '../../types/provider.js';
import type { RoutingAttempt } from '../../types/routing.js';
import { countFrameDrops } from '../translation/frame-report.js';
import { AllAttemptsFailedError, ClientDisconnectedError } from './errors.js';
import { RequestRouter, type ResolvedRoute, type RouteInput, type RoutePlan } from './request-router.js';
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

  constructor(
    @Inject(RequestRouter) private readonly router: RequestRouter,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async complete(input: ChatCallInput): Promise<ChatCompletion> {
    const plan = this.plan(input, false);
    const failures: RoutingAttempt[] = [];

    for (const attempt of plan.attempts) {
      const route = this.router.resolveAttempt(plan.requestId, attempt, { ...input, stream: false });
      const translated = this.translatedRequest(route, input.request);

      try {
        const payload = await this.carry(route, providerCall(route, translated.body, false, input.signal));

        return { route, response: this.translatedResponse(route, payload), warnings: translated.warnings };
      } catch (error) {
        // Only a provider failure earns the next candidate: a body the client sent badly would fail the
        // same way everywhere, and a client that walked away has nobody left to answer.
        if (!isRetryable(error)) {
          throw error;
        }

        failures.push(attempt);
      }
    }

    throw new AllAttemptsFailedError(failures.length > 0 ? failures : plan.skipped.map((skipped) => skipped.attempt));
  }

  stream(input: ChatCallInput): ChatStream {
    const plan = this.plan(input, true);
    const first = plan.attempts[0];

    if (first === undefined) {
      throw new AllAttemptsFailedError(plan.skipped.map((skipped) => skipped.attempt));
    }

    // The envelope is built from the first attempt. The requestId it carries is the plan's, shared by
    // every attempt, so the id a client sees stays stable even when a later attempt serves the request.
    const route = this.router.resolveAttempt(plan.requestId, first, { ...input, stream: true });
    const translated = this.translatedRequest(route, input.request);

    return {
      route,
      warnings: translated.warnings,
      chunks: this.streamAttempts(plan, input, route),
    };
  }

  /** The plan of one call: the mode and the cascade are the installation's, not the client's. */
  private plan(input: ChatCallInput, stream: boolean): RoutePlan {
    return this.router.plan({
      model: input.model,
      clientFormat: input.clientFormat,
      stream,
      mode: this.env.routingMode,
      cascade: this.env.routingCascade,
    });
  }

  /** One non streaming call, abandoned as soon as the client is gone. */
  private async carry(route: ResolvedRoute, call: ProviderChatCall): Promise<unknown> {
    return await withAbort(route.adapter.chat(route.target, call), call.signal);
  }

  /**
   * The frames of one request, across the attempts it may take. Each provider frame is translated to
   * the client's format and yielded at once; a frame that carries nothing yields nothing, and a frame
   * the translator refuses fails loudly, so a broken stream is reported instead of trimmed in silence.
   *
   * The loop only advances to the next candidate before the first frame of the current one arrives:
   * once a provider has started streaming, a failure propagates, because a client may already hold
   * bytes of that attempt and a second one would contradict them. A frame the translator had to drop is
   * counted and reported once per attempt, when the request is over: the response has already started,
   * so the log is the only place left to say it. Spec 014.
   */
  private async *streamAttempts(
    plan: RoutePlan,
    input: ChatCallInput,
    firstRoute: ResolvedRoute,
  ): AsyncGenerator<ChatChunk> {
    const failures: RoutingAttempt[] = [];

    for (const [index, attempt] of plan.attempts.entries()) {
      const route =
        index === 0 ? firstRoute : this.router.resolveAttempt(plan.requestId, attempt, { ...input, stream: true });
      const translated = this.translatedRequest(route, input.request);
      const frames = route.adapter.chatStream(route.target, providerCall(route, translated.body, true, input.signal));
      const iterator = frames[Symbol.asyncIterator]();
      const drops = countFrameDrops();
      let committed = false;

      try {
        for (;;) {
          if (input.signal?.aborted === true) {
            throw new ClientDisconnectedError();
          }

          const frame = await withAbort(iterator.next(), input.signal);

          if (frame.done === true) {
            return;
          }

          committed = true;

          for (const chunk of this.translatedChunk(route, frame.value, drops.report)) {
            yield chunk;
          }
        }
      } catch (error) {
        if (committed || !isRetryable(error)) {
          throw error;
        }

        failures.push(attempt);
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

    throw new AllAttemptsFailedError(failures);
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

/**
 * Whether a failure earns another candidate. Only a provider failure does: the request body is the
 * client's, so one it sent badly would fail the same way everywhere, and a client that walked away has
 * nobody left to answer. A translated frame that arrived malformed is a provider failure too, and it is
 * retried only before the first frame, because past it the request is already committed.
 */
function isRetryable(error: unknown): boolean {
  return error instanceof ProviderFailure;
}
