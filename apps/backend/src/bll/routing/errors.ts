/**
 * Routing failures. They are not `DomainError`: the codes here belong to the chat facade's own
 * vocabulary (a model that is not served, a protocol the facade cannot translate), it never leaves
 * `bll/routing/`, and the gateway owns the HTTP status of each one. Every message names identifiers
 * only: a namespaced model id, a provider id or a format, never a credential value.
 */
export type RoutingErrorCode =
  | 'model_not_found'
  | 'chat_not_supported'
  | 'invalid_chat_request'
  | 'all_attempts_failed';

export class RoutingError extends Error {
  readonly code: RoutingErrorCode;

  constructor(code: RoutingErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/**
 * The requested model is not served. Three causes reach this one error on purpose: no credential
 * declares the namespace, the credential's catalog holds no such model, or policy hides it. The
 * client cannot tell them apart, so a denied model stays as invisible as an unknown one.
 */
export class ModelNotFoundError extends RoutingError {
  constructor(namespacedId: string) {
    super('model_not_found', `no model is served under the id ${namespacedId}`);
  }
}

/** The provider's protocol has no chat translation in this facade. */
export class ChatNotSupportedError extends RoutingError {
  constructor(providerId: string, detail: string) {
    super('chat_not_supported', `provider ${providerId} cannot serve a chat call yet: ${detail}`);
  }
}

/** The client body cannot be translated as sent. The detail names the field, never a payload. */
export class InvalidChatRequestError extends RoutingError {
  constructor(detail: string) {
    super('invalid_chat_request', detail);
  }
}

/**
 * Every candidate the plan offered failed at the provider, so there is nothing left to try. The detail
 * names each attempt (its namespaced id and provider) and never a credential value, so a client learns
 * what was tried without learning how to reach any account.
 */
export class AllAttemptsFailedError extends RoutingError {
  constructor(attempts: readonly { readonly namespacedId: string; readonly providerId: string }[]) {
    const named = attempts.map((attempt) => `${attempt.namespacedId} (${attempt.providerId})`).join(', ');
    super('all_attempts_failed', `every candidate failed: ${named}`);
  }
}

/**
 * The client closed the connection while its answer was being produced. Nothing can be answered any
 * more, so the caller stops the upstream work and stays quiet: this is not a failure to report to
 * anyone, least of all as a server error.
 */
export class ClientDisconnectedError extends Error {
  constructor() {
    super('the client closed the connection before the answer was complete');
    this.name = 'ClientDisconnectedError';
  }
}
