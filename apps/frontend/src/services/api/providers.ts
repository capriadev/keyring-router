import type { ProvidersResponse } from '../../types/api';
import { requestJson } from './client';

/** `GET /api/providers`. The catalog the form offers, so no provider list is hardcoded here. */
export function listProviders(): Promise<ProvidersResponse> {
  return requestJson<ProvidersResponse>('/api/providers');
}