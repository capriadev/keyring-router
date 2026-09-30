/**
 * The wire shapes the local interface reads. They are declared once, in `@keyring-router/contracts`, so this
 * interface and the gateway cannot drift apart, and this module stays the single import path the components
 * use for them.
 *
 * The namespace rule is the one value kept here: a client validates it early to explain a typo before
 * sending anything, while the gateway remains the authority that enforces it.
 */
import type { CredentialCreateRequest, PolicyRuleCreateRequest } from '@keyring-router/contracts';

export type {
  ApiErrorBody,
  ApiErrorCode,
  AuthKind,
  CatalogModel,
  CatalogRefreshResult,
  CatalogResponse,
  Credential,
  CredentialsResponse,
  DeclaredModel,
  ExposedModel,
  HealthResponse,
  ModelsResponse,
  PoliciesResponse,
  PolicyEffect,
  PolicyRule,
  ProviderDescriptor,
  ProviderDetailResponse,
  ProvidersResponse,
  ValidationResult,
} from '@keyring-router/contracts';

export type {
  ClaudeErrorBody,
  ClaudeMessageResponse,
  ClaudeStreamEvent,
  OpenAiChatCompletionChunk,
  OpenAiChatCompletionResponse,
  OpenAiErrorBody,
  OpenAiModelListResponse,
} from '@keyring-router/contracts';

/** What a credential is created with: the same bytes the gateway accepts. */
export type CredentialInput = CredentialCreateRequest;

/** What a policy rule is created with. */
export type PolicyRuleInput = PolicyRuleCreateRequest;

/** The namespace slug rule, mirrored so the form can explain a typo before sending it. */
export const NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;

/** The same boundary the gateway applies to a secret, mirrored so the form can explain a length before sending it. */
export const SECRET_MIN_LENGTH = 8;
export const SECRET_MAX_LENGTH = 4096;