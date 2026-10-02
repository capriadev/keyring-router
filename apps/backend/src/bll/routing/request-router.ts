import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SECRET_KEY_SOURCE, type SecretKeySource } from '../../config/secret-key-source.js';
import { CatalogRepository } from '../../dal/repositories/catalog.repository.js';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { PoliciesRepository } from '../../dal/repositories/policies.repository.js';
import { RoutingRepository } from '../../dal/repositories/routing.repository.js';
import type { ProtocolAdapter, ProtocolRequestTarget } from '../../integrations/providers/protocol-adapter.js';
import type { ChatCapableAdapter } from '../../types/chat-transport.js';
import type { ChatFormat, ChatTranslator, TranslateRequestOptions } from '../../types/chat.js';
import type { Credential } from '../../types/credential.js';
import type { ProviderFormat } from '../../types/provider-catalog.js';
import type { AdapterTarget } from '../../types/provider.js';
import type { RoutingAttempt, RoutingCandidate, RoutingMode, SkippedAttempt } from '../../types/routing.js';
import { evaluateExposure } from '../catalog/policy.js';
import { adapterTargetFor } from '../credentials/adapter-target.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import { buildAttempts } from './candidates.js';
import { chatRequestTarget, providerChatProfile } from './chat-target.js';
import { ChatNotSupportedError, ModelNotFoundError, RoutingError } from './errors.js';
import { toRoutingState } from './state.js';
import { applyServiceState } from './verdict.js';
import {
  CHAT_TRANSLATORS,
  translatorFor,
  type ChatTranslationPort,
  type TranslationPair,
} from './translation.js';

/**
 * Formats the chat facade translates between. `ollama` is one of them because its chat endpoint is
 * OpenAI shaped (`/v1/chat/completions`), so a credential of that provider is served by an identity
 * translation towards `ollama`. A provider protocol outside this set is refused.
 */
const TRANSLATED_FORMATS: readonly ChatFormat[] = ['openai', 'claude', 'gemini', 'ollama'];

export interface RouteInput {
  /** The namespaced id the client asked for, exactly as it arrived. */
  readonly model: string;
  /** The format the client speaks, decided by the endpoint that served the request. */
  readonly clientFormat: ChatFormat;
  readonly stream: boolean;
}

/**
 * One request plus how it may be served: the mode and the cascade the user wrote. Both come from the
 * configuration until feature 21 gives them a home per entry point.
 */
export interface RoutePlanInput extends RouteInput {
  readonly mode: RoutingMode;
  readonly cascade: readonly string[];
}

/**
 * What the router decided before anything is sent: the ordered attempts that remain in service and the
 * ones skipped with their reason. It names credentials and models only, so it can be logged or
 * reported as is.
 */
export interface RoutePlan {
  readonly requestId: string;
  /** The namespace of the model the client asked for, which the request is scoped to. */
  readonly namespace: string;
  readonly attempts: readonly RoutingAttempt[];
  readonly skipped: readonly SkippedAttempt[];
}

/**
 * One resolved request: the credential, the catalog entry and the adapter that will carry the call,
 * plus everything the translation needs. Every identifier here is non secret: the credential secret
 * lives inside `target`, which only the transport receives.
 */
export interface ResolvedRoute {
  readonly requestId: string;
  readonly model: string;
  readonly namespace: string;
  readonly providerModelId: string;
  readonly credentialId: string;
  readonly providerId: string;
  readonly providerFormat: ProviderFormat;
  readonly pair: TranslationPair;
  readonly translator: ChatTranslator;
  readonly translateOptions: TranslateRequestOptions;
  readonly adapter: ChatCapableAdapter;
  readonly target: ProtocolRequestTarget;
}

/**
 * One namespaced model to one credential, one catalog entry, one protocol and one translator. It
 * decides; it never calls the provider and never translates.
 *
 * This spec resolves a single candidate: the model id names the credential. Choosing among several
 * candidates of one provider is spec 004's job, and it belongs to this same module.
 */
@Injectable()
export class RequestRouter {
  private readonly logger = new Logger('RequestRouter');

  constructor(
    @Inject(CredentialsRepository) private readonly credentials: CredentialsRepository,
    @Inject(CatalogRepository) private readonly catalog: CatalogRepository,
    @Inject(PoliciesRepository) private readonly policies: PoliciesRepository,
    @Inject(RoutingRepository) private readonly routing: RoutingRepository,
    @Inject(ProviderRegistry) private readonly registry: ProviderRegistry,
    @Inject(SECRET_KEY_SOURCE) private readonly keySource: SecretKeySource,
    @Inject(CHAT_TRANSLATORS) private readonly translators: ChatTranslationPort,
  ) {}

  resolve(input: RouteInput): ResolvedRoute {
    const requestId = randomUUID();

    try {
      return this.decide(requestId, input);
    } catch (error) {
      if (error instanceof RoutingError) {
        // A refusal is a decision too, and this keeps the promise of one line per request.
        this.logger.log(`route request=${requestId} outcome=refused code=${error.code}`);
      }

      throw error;
    }
  }

  /**
   * The plan of one request: every candidate it may be served by, in the order they would be tried,
   * with the ones out of service removed. The mode and the cascade come from the caller (configuration
   * for now, per entry point later); the state comes from the store. Nothing is sent here, so the whole
   * decision is observable before the first byte.
   */
  plan(input: RoutePlanInput): RoutePlan {
    const requestId = randomUUID();
    const parts = splitNamespacedModelId(input.model);

    if (parts === null) {
      throw new ModelNotFoundError(input.model);
    }

    const exposed = this.exposedCandidates();
    const requested = exposed.find(
      (candidate) => candidate.namespace === parts.namespace && candidate.providerModelId === parts.providerModelId,
    );

    // A requested model that is not an exposed candidate is unknown: either the namespace does not
    // exist, the model is not in the catalog, or the policy hides it. The three are one answer, and it
    // is why a mode that reaches beyond the cascade can never serve a hidden model: the requested one
    // is checked here, before the plan is built, and never falls through to a different model.
    if (requested === undefined) {
      throw new ModelNotFoundError(input.model);
    }

    const attempts = buildAttempts({
      mode: input.mode,
      requested: parts,
      cascade: input.cascade,
      exposed,
    });

    const now = Date.now();
    const state = toRoutingState({
      lockouts: this.routing.listLockouts(),
      quotas: this.routing.listQuotas(),
    });
    const verdict = applyServiceState({ attempts, state, now });

    // Identifiers only: the mode, what will be tried and what was skipped, never a value.
    this.logger.log(
      `route request=${requestId} outcome=planned model=${input.model} mode=${input.mode}` +
        ` attempts=${verdict.attempts.length} skipped=${verdict.skipped.length}`,
    );

    return { requestId, namespace: parts.namespace, attempts: verdict.attempts, skipped: verdict.skipped };
  }

  /**
   * Resolves one planned attempt into everything the transport needs. The credential is looked up by id
   * (a cascade entry may name another account, even another namespace) and the model id is the exact
   * provider model of the attempt, never re-split from the client's text.
   */
  resolveAttempt(requestId: string, attempt: RoutingAttempt, input: RouteInput): ResolvedRoute {
    const credential = this.credentials.findById(attempt.credentialId);

    if (credential === undefined) {
      throw new ModelNotFoundError(input.model);
    }

    return this.buildRoute(requestId, credential, attempt.providerModelId, input);
  }

  private decide(requestId: string, input: RouteInput): ResolvedRoute {
    const parts = splitNamespacedModelId(input.model);

    if (parts === null) {
      throw new ModelNotFoundError(input.model);
    }

    const credential = this.credentials.findByNamespace(parts.namespace);

    if (credential === undefined) {
      throw new ModelNotFoundError(input.model);
    }

    const row = this.catalog
      .listByCredential(credential.id)
      .find((candidate) => candidate.providerModelId === parts.providerModelId);

    if (row === undefined) {
      throw new ModelNotFoundError(input.model);
    }

    // The listing and the routing evaluate the same function over the same rules: a model the listing
    // hides is not routable, and a caller cannot tell a hidden model from an unknown one.
    if (!this.isExposed(credential.id, input.model)) {
      throw new ModelNotFoundError(input.model);
    }

    return this.buildRoute(requestId, credential, parts.providerModelId, input);
  }

  /**
   * Turns one credential and one provider model into a resolved route. It is the single assembly point
   * for both the direct path and each attempt of the cascade, so the two can never drift apart.
   */
  private buildRoute(
    requestId: string,
    credential: Credential,
    providerModelId: string,
    input: RouteInput,
  ): ResolvedRoute {
    const profile = providerChatProfile(credential.providerId, providerModelId);
    const pair: TranslationPair = {
      from: input.clientFormat,
      to: translatedFormat(profile.format, credential.providerId),
    };
    const translator = translatorFor(this.translators, pair, credential.providerId);
    const credentialTarget: AdapterTarget = adapterTargetFor(credential, this.credentials, this.keySource);

    // Identifiers only: no body, no message, no header and no credential value reaches a log line.
    this.logger.log(
      `route request=${requestId} outcome=resolved model=${input.model} credential=${credential.id}` +
        ` provider=${credential.providerId} adapter=${profile.format} client=${pair.from} stream=${input.stream}`,
    );

    return {
      requestId,
      model: input.model,
      namespace: credential.namespace,
      providerModelId,
      credentialId: credential.id,
      providerId: credential.providerId,
      providerFormat: profile.format,
      pair,
      translator,
      translateOptions: {
        model: providerModelId,
        stream: input.stream,
        unsupportedParams: profile.declared?.unsupportedParams ?? [],
        ...(profile.requestDefaults === undefined ? {} : { requestDefaults: profile.requestDefaults }),
      },
      adapter: chatTransport(this.registry, profile.format, credential.providerId),
      target: chatRequestTarget(credential.providerId, credentialTarget),
    };
  }

  /** Whether one credential's model passes the policy, over the same rules the listing uses. */
  private isExposed(credentialId: string, namespacedId: string): boolean {
    return evaluateExposure(this.policies.list(), { credentialId, namespacedId });
  }

  /**
   * Every exposed (credential, model) pair as a candidate. The credential order and the catalog order
   * are preserved, so two credentials exposing the same model stay deterministic, and a model the
   * policy hides never enters the list: the plan is only ever built from what a caller could see.
   */
  private exposedCandidates(): RoutingCandidate[] {
    const rules = this.policies.list();
    const candidates: RoutingCandidate[] = [];

    for (const credential of this.credentials.list()) {
      for (const model of this.catalog.listByCredential(credential.id)) {
        const namespacedId = `${credential.namespace}/${model.providerModelId}`;

        if (evaluateExposure(rules, { credentialId: credential.id, namespacedId })) {
          candidates.push({
            credentialId: credential.id,
            namespace: credential.namespace,
            providerId: credential.providerId,
            providerModelId: model.providerModelId,
            namespacedId,
          });
        }
      }
    }

    return candidates;
  }
}

/** The namespace is everything before the first slash: a model id may carry slashes of its own. */
function splitNamespacedModelId(model: string): { namespace: string; providerModelId: string } | null {
  const separator = model.indexOf('/');

  if (separator <= 0 || separator === model.length - 1) {
    return null;
  }

  return { namespace: model.slice(0, separator), providerModelId: model.slice(separator + 1) };
}

/**
 * The client format is a `ChatFormat` by construction; the provider protocol may not be one. A
 * protocol the facade cannot translate, such as a local server that speaks a dialect of its own, is
 * refused by name instead of being sent a body it would reject field by field.
 */
function translatedFormat(format: ProviderFormat, providerId: string): ChatFormat {
  if (TRANSLATED_FORMATS.includes(format as ChatFormat)) {
    return format as ChatFormat;
  }

  throw new ChatNotSupportedError(
    providerId,
    `it speaks ${format}, and the facade translates ${TRANSLATED_FORMATS.join(', ')}`,
  );
}

/**
 * The chat transport of one protocol. The protocol adapter contract does not declare the chat methods
 * yet, so the router checks for them: a protocol without a chat transport fails loudly instead of
 * being handed a request it cannot carry.
 */
function chatTransport(registry: ProviderRegistry, format: ProviderFormat, providerId: string): ChatCapableAdapter {
  const adapter: ProtocolAdapter & Partial<ChatCapableAdapter> = registry.resolveFormat(format);
  const { chat, chatStream } = adapter;

  if (typeof chat !== 'function' || typeof chatStream !== 'function') {
    throw new ChatNotSupportedError(providerId, `its ${format} adapter carries no chat transport`);
  }

  // Bound to the adapter, so a method that reads state of its own keeps working when it is called.
  return {
    chat: (target, call) => chat.call(adapter, target, call),
    chatStream: (target, call) => chatStream.call(adapter, target, call),
  };
}

