import type { ProviderFormat } from '../../types/provider-catalog.js';
import { stripTrailingSlashes } from './http.js';

/**
 * The path each protocol documents for the model list this gateway validates and discovers with, next to the
 * chat endpoint where the protocol names one as a fixed path.
 *
 * A credential may hold the bare host of a provider, its API root, or the chat endpoint itself. A base URL
 * that names no path of its own is completed with the documented path of its format instead of a path an
 * adapter invents, and any other base keeps the shape the user typed. Every catalog entry of a format ends
 * with that format's documented path, which the spec asserts.
 */
export interface DocumentedPaths {
  /** The API root the documented paths hang from: what completes a base URL that names no path. */
  readonly root: string;
  /** The model list, relative to the root. */
  readonly models: string;
  /** The chat endpoint, relative to the root, where the protocol documents one as a fixed path. */
  readonly chat?: string;
  /** The streamed chat endpoint, when the protocol documents a different one (`{model}` is substituted). */
  readonly chatStream?: string;
  /** The root the chat path hangs from, when it is not the root the model list hangs from. */
  readonly chatRoot?: string;
}

export const DOCUMENTED_PATHS: Readonly<Record<ProviderFormat, DocumentedPaths>> = {
  // Chat completions, with the model list beside it.
  openai: { root: '/v1', chat: '/chat/completions', models: '/models' },
  // The Messages API, of the same shape.
  claude: { root: '/v1', chat: '/messages', models: '/models' },
  // The model collection is the endpoint itself: a completion names the model in its path.
  gemini: {
    root: '/v1beta',
    models: '/models',
    chat: '/models/{model}:generateContent',
    chatStream: '/models/{model}:streamGenerateContent?alt=sse',
  },
  // Local, and its own provider: one root, a liveness probe and a model list.
  ollama: { root: '/api', models: '/tags' },
};

export interface ChatEndpointInput {
  readonly baseUrl: URL;
  readonly paths: DocumentedPaths;
  /** The provider model id, for a protocol that names the model in the path. */
  readonly model?: string;
  readonly stream: boolean;
}

/**
 * The chat URL of one provider, built the way the model list URL is: a base with no path is completed
 * with the documented root, a base that already names the chat endpoint keeps its shape, a base that
 * names the model list has that segment replaced, and any other base is treated as a root of its own
 * because a gateway may add a segment the catalog declares per provider.
 */
export function chatEndpointFor(input: ChatEndpointInput): string {
  const template = input.stream ? (input.paths.chatStream ?? input.paths.chat) : input.paths.chat;

  if (template === undefined) {
    throw new Error('this protocol documents no chat endpoint');
  }

  const [path, query] = template
    .replace('{model}', encodeURIComponent(input.model ?? ''))
    .split('?');
  const endpoint = new URL(input.baseUrl);

  endpoint.pathname = chatPathFor(endpoint.pathname, input.paths, path ?? '');

  if (query !== undefined) {
    endpoint.search = `?${query}`;
  }

  return endpoint.toString();
}

function chatPathFor(pathname: string, paths: DocumentedPaths, chat: string): string {
  const path = stripTrailingSlashes(pathname);
  const root = paths.chatRoot ?? paths.root;

  if (path === '' || path === '/') {
    return `${root}${chat}`;
  }

  if (paths.chat !== undefined && path.endsWith(paths.chat)) {
    return path;
  }

  if (path.endsWith(paths.models)) {
    return `${path.slice(0, -paths.models.length)}${chat}`;
  }

  return `${path}${chat}`;
}

/**
 * The model list URL of one provider, built from the base URL a credential holds:
 * a base with no path is completed with the documented path, a base that already names the model list or the
 * chat endpoint keeps its shape, and any other base is a root of its own, because a gateway may add a
 * segment the catalog declares per provider.
 */
export function modelsEndpointFor(baseUrl: URL, paths: DocumentedPaths): string {
  const endpoint = new URL(baseUrl);
  endpoint.pathname = modelsPathFor(endpoint.pathname, paths);

  return endpoint.toString();
}

function modelsPathFor(pathname: string, paths: DocumentedPaths): string {
  const path = stripTrailingSlashes(pathname);

  if (path === '' || path === '/') {
    return `${paths.root}${paths.models}`;
  }

  if (path.endsWith(paths.models)) {
    return path;
  }

  if (paths.chat !== undefined && path.endsWith(paths.chat)) {
    return `${path.slice(0, -paths.chat.length)}${paths.models}`;
  }

  return `${path}${paths.models}`;
}
