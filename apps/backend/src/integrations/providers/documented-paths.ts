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
}

export const DOCUMENTED_PATHS: Readonly<Record<ProviderFormat, DocumentedPaths>> = {
  // Chat completions, with the model list beside it.
  openai: { root: '/v1', chat: '/chat/completions', models: '/models' },
  // The Messages API, of the same shape.
  claude: { root: '/v1', chat: '/messages', models: '/models' },
  // The model collection is the endpoint itself: a completion names the model in its path.
  gemini: { root: '/v1beta', models: '/models' },
  // Local, and its own provider: one root, a liveness probe and a model list.
  ollama: { root: '/api', models: '/tags' },
};

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
