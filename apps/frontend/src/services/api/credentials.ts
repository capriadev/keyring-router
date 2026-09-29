import type {
  CatalogRefreshResult,
  Credential,
  CredentialInput,
  CredentialsResponse,
  ValidationResult,
} from '../../types/api';
import { requestJson } from './client';

const RESOURCE = '/api/credentials';

/** `GET /api/credentials`. Never exposes a secret field. */
export function listCredentials(): Promise<CredentialsResponse> {
  return requestJson<CredentialsResponse>(RESOURCE);
}

/** `POST /api/credentials`. 409 when the namespace is taken, 422 for an unsupported auth kind. */
export function createCredential(input: CredentialInput): Promise<Credential> {
  return requestJson<Credential>(RESOURCE, { method: 'POST', body: input });
}

/** `POST /api/credentials/:id/validate` */
export function validateCredential(credentialId: string): Promise<ValidationResult> {
  return requestJson<ValidationResult>(`${RESOURCE}/${encodeURIComponent(credentialId)}/validate`, {
    method: 'POST',
  });
}

/** `POST /api/credentials/:id/refresh` */
export function refreshCredential(credentialId: string): Promise<CatalogRefreshResult> {
  return requestJson<CatalogRefreshResult>(`${RESOURCE}/${encodeURIComponent(credentialId)}/refresh`, {
    method: 'POST',
  });
}
