import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ChatCompletion, ChatService, ChatStream } from '../bll/routing/chat.service.js';
import { toChatRequest as claudeChatRequest } from '../bll/routing/claude-request.js';
import { toChatRequest } from '../bll/routing/client-request.js';
import { ClientDisconnectedError } from '../bll/routing/errors.js';
import type { ChatFormat, ChatRequest } from '../types/chat.js';
import { claudeMessage, sendClaudeStream } from './v1-claude.js';
import { openAiCompletion, sendOpenAiStream } from './v1-openai.js';
import type { ClaudeMessagesBody, OpenAiChatBody } from './v1-schemas.js';
import { watchClient } from './v1-sse.js';

/**
 * The HTTP side of the two chat endpoints: normalize what the client sent into the frozen chat contract,
 * call the facade, and write the answer in the client's own protocol. Routing, translation and transport
 * live in `bll/`; this module only knows HTTP, and it holds no rule of its own.
 */

/** One answer in the client's protocol: how its identifier is built and how it is written. */
interface ChatProjection {
  readonly id: (requestId: string) => string;
  readonly message: (input: ProjectedMessage) => unknown;
  readonly startStream: (input: ProjectedStream) => Promise<void>;
}

interface ProjectedMessage {
  readonly id: string;
  readonly model: string;
  readonly created: number;
  readonly completion: ChatCompletion;
}

interface ProjectedStream {
  readonly id: string;
  readonly model: string;
  readonly created: number;
  readonly stream: ChatStream;
}

interface ChatSurface {
  readonly chat: ChatService;
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
  /** The format the client speaks, decided by the endpoint that served the request. */
  readonly clientFormat: ChatFormat;
  readonly conversation: ChatRequest;
  readonly projection: ChatProjection;
}

export interface OpenAiChatSurface {
  readonly chat: ChatService;
  readonly body: OpenAiChatBody;
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
}

export async function serveOpenAiChat(input: OpenAiChatSurface): Promise<void> {
  await serveChat({
    chat: input.chat,
    request: input.request,
    reply: input.reply,
    clientFormat: 'openai',
    conversation: toChatRequest(input.body),
    projection: openAiProjection(input.reply),
  });
}

export interface ClaudeMessagesSurface {
  readonly chat: ChatService;
  readonly body: ClaudeMessagesBody;
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
}

export async function serveClaudeMessages(input: ClaudeMessagesSurface): Promise<void> {
  await serveChat({
    chat: input.chat,
    request: input.request,
    reply: input.reply,
    clientFormat: 'claude',
    conversation: claudeChatRequest(input.body),
    projection: claudeProjection(input.reply),
  });
}

/**
 * One request from the socket to the answer. The client connection is watched for the whole call, so a
 * client that walks away aborts the upstream request instead of leaving it running for nobody.
 */
async function serveChat(surface: ChatSurface): Promise<void> {
  const client = watchClient(surface.request, surface.reply);
  const created = Date.now();

  try {
    const call = {
      model: surface.conversation.model,
      clientFormat: surface.clientFormat,
      stream: surface.conversation.stream,
      request: surface.conversation,
      signal: client.signal,
    };

    if (surface.conversation.stream) {
      const stream = surface.chat.stream(call);

      // Taken over before the first frame is written: Fastify must not answer a response that this
      // module is already writing by hand.
      surface.reply.hijack();

      await surface.projection.startStream({
        id: surface.projection.id(stream.route.requestId),
        model: surface.conversation.model,
        created,
        stream,
      });

      return;
    }

    const completion = await surface.chat.complete(call);

    await surface.reply.status(200).send(
      surface.projection.message({
        id: surface.projection.id(completion.route.requestId),
        model: surface.conversation.model,
        created,
        completion,
      }),
    );
  } catch (error) {
    // The client disconnected: nobody is left to answer, and a closed socket is not a server failure.
    if (error instanceof ClientDisconnectedError) {
      return;
    }

    throw error;
  } finally {
    client.dispose();
  }
}

/**
 * The OpenAI projection. Its identifier is prefixed the way that API prefixes one, and the routing
 * decision's own id is what makes each answer traceable to the one log line that decided it.
 */
function openAiProjection(reply: FastifyReply): ChatProjection {
  return {
    id: (requestId) => `chatcmpl-${requestId}`,
    message: ({ id, model, created, completion }) =>
      openAiCompletion({
        id,
        model,
        created,
        response: completion.response,
        warnings: completion.warnings,
      }),
    startStream: ({ id, model, created, stream }) =>
      sendOpenAiStream(reply, {
        id,
        model,
        created,
        warnings: stream.warnings,
        chunks: stream.chunks,
      }),
  };
}

/** The Messages API projection, with that API's own identifier prefix. */
function claudeProjection(reply: FastifyReply): ChatProjection {
  return {
    id: (requestId) => `msg_${requestId}`,
    message: ({ id, model, completion }) =>
      claudeMessage({
        id,
        model,
        response: completion.response,
        warnings: completion.warnings,
        providerId: completion.route.providerId,
      }),
    startStream: ({ id, model, stream }) =>
      sendClaudeStream(reply, {
        id,
        model,
        warnings: stream.warnings,
        chunks: stream.chunks,
      }),
  };
}

