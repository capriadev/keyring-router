/**
 * The local panel is a browser page served on the loopback address, and the API answers on another
 * loopback port, so every call the panel makes is cross origin. Without CORS the browser discards the
 * answer and the panel reports the gateway as unreachable while it is answering. This module is the whole
 * policy of which origins may call the API, kept in one place and testable without the network.
 */

/** The hosts a local panel can be served from. A page served from anything else is not the panel. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/** The methods the panel uses. A browser preflights every non simple one, which is why OPTIONS is here. */
export const PANEL_CORS_METHODS: readonly string[] = ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'];

/**
 * Whether a browser origin belongs to the local panel.
 *
 * - No origin at all is not a browser crossing an origin (curl, the CLI, a server side call), so it is
 *   allowed: the CORS mechanism never applied to it to begin with.
 * - An http or https origin on a loopback host is a local page and is allowed, any port, so the panel is
 *   not pinned to one.
 * - Anything else is refused. A website the user visits has a non loopback origin, and it must not be
 *   able to read this API. The gateway listens on loopback only, and this is what keeps a browser honest
 *   to that boundary.
 */
export function isLocalPanelOrigin(origin: string | undefined): boolean {
  if (origin === undefined) {
    return true;
  }

  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  return (url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname);
}