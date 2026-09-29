import 'reflect-metadata';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/**
 * Shared plumbing for the end to end runs: a stub provider, a gateway on a real loopback socket and
 * a temporary database. Nothing here reaches the network, and nothing here is part of the build.
 */

export interface RequestLog {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string | string[] | undefined>;
  readonly body: string;
}

export interface StubProvider {
  readonly url: string;
  readonly requests: RequestLog[];
  /** Every later request fails with 503, to exercise the provider failure path. */
  fail(): void;
  heal(): void;
  close(): Promise<void>;
}

export interface StubOptions {
  /** Answers 401 unless an authorization header arrives, to prove the secret wiring. */
  readonly requireAuthorization?: boolean;
  readonly models?: readonly string[];
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk as Buffer));
  }

  return Buffer.concat(chunks).toString('utf8');
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(payload));
}

/** One OpenAI shaped streamed increment, as a provider writes it. */
function chunkFrame(delta: string): Record<string, unknown> {
  return {
    id: 'chatcmpl-stub',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'stub',
    choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
  };
}

/** The last frame before the sentinel: the stop reason and the usage the provider reports. */
function finishFrame(): Record<string, unknown> {
  return {
    id: 'chatcmpl-stub',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'stub',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
  };
}

export async function startStubProvider(options: StubOptions = {}): Promise<StubProvider> {
  const requests: RequestLog[] = [];
  const models = options.models ?? ['qwen2.5:7b', 'llama3.2:3b'];
  let broken = false;

  const server = createServer((request, response) => {
    void (async () => {
      const body = await readBody(request);
      requests.push({
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        headers: request.headers,
        body,
      });

      if (broken) {
        send(response, 503, { error: 'stub is broken on purpose' });
        return;
      }

      if (options.requireAuthorization === true && request.headers.authorization === undefined) {
        send(response, 401, { error: 'authorization required' });
        return;
      }

      if (request.url === '/api/version') {
        send(response, 200, { version: '0.20.0' });
        return;
      }

      if (request.url === '/api/tags') {
        send(response, 200, {
          models: models.map((name) => ({
            name,
            model: name,
            modified_at: '2026-05-01T10:00:00.123456Z',
            size: 4683090000,
            details: { family: name.split(':')[0] },
          })),
        });
        return;
      }

      if (request.url === '/v1/models') {
        send(response, 200, { object: 'list', data: models.map((id) => ({ id, object: 'model' })) });
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/chat/completions') {
        const parsed = JSON.parse(body) as { model?: string; stream?: boolean };

        if (parsed.stream === true) {
          // Written in two socket chunks on purpose: a frame split across reads is the case that breaks
          // a naive parser, so the end to end run exercises it.
          response.writeHead(200, { 'content-type': 'text/event-stream' });
          response.write(`data: ${JSON.stringify(chunkFrame('hola '))}\n\n`);
          response.end(
            `data: ${JSON.stringify(chunkFrame('desde el stub'))}\n\n` +
              `data: ${JSON.stringify(finishFrame())}\n\n` +
              'data: [DONE]\n\n',
          );
          return;
        }

        send(response, 200, {
          id: 'chatcmpl-stub',
          object: 'chat.completion',
          created: 0,
          model: parsed.model ?? 'stub',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'hola desde el stub' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 },
        });
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/messages') {
        send(response, 200, {
          id: 'msg_stub',
          type: 'message',
          role: 'assistant',
          model: 'stub',
          content: [{ type: 'text', text: 'hola desde el stub' }],
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 3, output_tokens: 4 },
        });
        return;
      }

      send(response, 404, { error: `stub does not serve ${request.method} ${request.url}` });
    })();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();

  if (address === null || typeof address === 'string') {
    throw new Error('the stub provider did not bind a port');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    fail: () => {
      broken = true;
    },
    heal: () => {
      broken = false;
    },
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, 'close');
    },
  };
}

export interface RunningGateway {
  readonly baseUrl: string;
  close(): Promise<void>;
}

export async function startGateway(): Promise<RunningGateway> {
  const { NestFactory } = await import('@nestjs/core');
  const { FastifyAdapter } = await import('@nestjs/platform-fastify');
  const { AppModule } = await import('../app.module.js');
  const { ApiErrorFilter } = await import('../gateway/api-error.filter.js');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  app.useGlobalFilters(new ApiErrorFilter());
  await app.listen({ host: '127.0.0.1', port: 0 });

  const server = app.getHttpServer() as { address(): { port: number } | null };
  const address = server.address();

  if (address === null) {
    throw new Error('the gateway did not bind a port');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await app.close();
    },
  };
}

export interface HttpResult {
  readonly status: number;
  readonly body: unknown;
}

export async function call(
  baseUrl: string,
  method: string,
  path: string,
  payload?: unknown,
): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: payload === undefined ? {} : { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const text = await response.text();
  let body: unknown = null;

  try {
    body = text === '' ? null : JSON.parse(text);
  } catch {
    body = text;
  }

  return { status: response.status, body };
}

/** A database outside the repository, so a run never touches the developer's data. */
export function temporaryDatabasePath(): string {
  return join(tmpdir(), `kr-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

export function databaseBytes(path: string): Buffer {
  return readFileSync(path);
}

export class Checks {
  private readonly lines: string[] = [];

  async run(name: string, fn: () => Promise<void> | void): Promise<void> {
    try {
      await fn();
      this.lines.push(`PASS  ${name}`);
    } catch (error) {
      this.lines.push(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  report(): number {
    for (const line of this.lines) {
      console.log(line);
    }

    const failed = this.lines.filter((line) => line.startsWith('FAIL'));

    console.log('');
    console.log(`${this.lines.length - failed.length}/${this.lines.length} PASS`);

    return failed.length;
  }
}

