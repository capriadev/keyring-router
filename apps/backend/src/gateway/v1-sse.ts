import type { ServerResponse } from 'node:http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ClientDisconnectedError } from '../bll/routing/errors.js';

/**
 * The client of one request: whether it is still there, and how to stop waiting for it. A client that
 * walked away aborts the signal, which is what the facade hands to the upstream call.
 */
export interface ClientConnection {
  readonly signal: AbortSignal;
  /** False once the client is gone: a frame written after that reaches nobody. */
  writable(): boolean;
  /** Stops watching the socket, so a finished response leaves no listener behind. */
  dispose(): void;
}

/**
 * Watches the response socket. A close before the response was finished is a client that
 * disconnected; a close after it is the normal end of a request, and aborting then would be noise.
 */
export function watchClient(_request: FastifyRequest, reply: FastifyReply): ClientConnection {
  const controller = new AbortController();
  const socket = reply.raw;

  const onClose = (): void => {
    if (!socket.writableEnded) {
      controller.abort(new ClientDisconnectedError());
    }
  };

  socket.on('close', onClose);

  return {
    signal: controller.signal,
    writable: () => !socket.writableEnded && !socket.destroyed,
    dispose: () => {
      socket.off('close', onClose);
    },
  };
}

const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  // A proxy in front of the gateway must not buffer: a streamed answer has to arrive as it is written.
  'x-accel-buffering': 'no',
} as const;

export function openSseStream(reply: FastifyReply): void {
  reply.raw.writeHead(200, SSE_HEADERS);
}

/** One `data:` frame. */
export async function writeDataFrame(reply: FastifyReply, payload: unknown): Promise<void> {
  await write(reply, `data: ${JSON.stringify(payload)}\n\n`);
}

/** One named event, as the Messages API streams them. */
export async function writeEventFrame(reply: FastifyReply, event: string, payload: unknown): Promise<void> {
  await write(reply, `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

/** The centinela the OpenAI stream ends with. */
export async function writeDoneFrame(reply: FastifyReply): Promise<void> {
  await write(reply, 'data: [DONE]\n\n');
}

export async function closeSseStream(reply: FastifyReply): Promise<void> {
  if (!reply.raw.writableEnded) {
    reply.raw.end();
  }
}

/** Writes one frame, and waits for the socket when it is full instead of buffering without limit. */
async function write(reply: FastifyReply, frame: string): Promise<void> {
  const socket = reply.raw;

  if (socket.writableEnded || socket.destroyed) {
    return;
  }

  if (!socket.write(frame)) {
    await drainOrClose(socket);
  }
}

function drainOrClose(socket: ServerResponse): Promise<void> {
  return new Promise((resolve) => {
    const settle = (): void => {
      socket.off('drain', settle);
      socket.off('close', settle);
      resolve();
    };

    socket.once('drain', settle);
    socket.once('close', settle);
  });
}
