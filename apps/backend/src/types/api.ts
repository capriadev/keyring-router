/**
 * The wire shapes the gateway answers with. They are declared once, in `@keyring-router/contracts`, so the
 * local interface and the command line describe the same bytes. Every layer of this app imports them from
 * here and no module reaches into the package on its own: that keeps one import path for a shape and one
 * place to look when it changes.
 */
export type {
  ApiErrorBody,
  ApiErrorCode,
  AuthKind,
  CatalogModel,
  CatalogRefreshResult,
  CatalogResponse,
  Credential,
  CredentialCreateRequest,
  CredentialSecretRequest,
  CredentialsResponse,
  DeclaredModel,
  ExposedModel,
  HealthResponse,
  ModelsResponse,
  PoliciesResponse,
  PolicyEffect,
  PolicyRule,
  PolicyRuleCreateRequest,
  ProviderDescriptor,
  ProviderDetailResponse,
  ProvidersResponse,
  ValidationResult,
} from '@keyring-router/contracts';

export type {
  ClaudeContentBlockDeltaEvent,
  ClaudeContentBlockStartEvent,
  ClaudeContentBlockStopEvent,
  ClaudeErrorBody,
  ClaudeMessageDeltaEvent,
  ClaudeMessageResponse,
  ClaudeMessageStartEvent,
  ClaudeMessageStopEvent,
  ClaudeStreamEvent,
  ClaudeUsage,
  OpenAiAssistantMessage,
  OpenAiChatCompletionChunk,
  OpenAiChatCompletionResponse,
  OpenAiChunkDelta,
  OpenAiErrorBody,
  OpenAiModelEntry,
  OpenAiModelListResponse,
  OpenAiToolCall,
  OpenAiUsage,
} from '@keyring-router/contracts';