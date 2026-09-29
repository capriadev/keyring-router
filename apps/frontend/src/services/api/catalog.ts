import type { CatalogResponse } from '../../types/api';
import { requestJson } from './client';

/** `GET /api/catalog`. Discovered models plus their exposure decision; optional credential filter. */
export function listCatalog(credentialId?: string): Promise<CatalogResponse> {
  const query = credentialId === undefined ? '' : `?credentialId=${encodeURIComponent(credentialId)}`;

  return requestJson<CatalogResponse>(`/api/catalog${query}`);
}
