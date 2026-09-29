import type { ModelsResponse } from '../../types/api';
import { requestJson } from './client';

/** `GET /api/models`. Policy-passing models only, the single consumable listing. */
export function listModels(): Promise<ModelsResponse> {
  return requestJson<ModelsResponse>('/api/models');
}
