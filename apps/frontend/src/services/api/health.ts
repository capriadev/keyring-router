import type { HealthResponse } from '../../types/api';
import { requestJson } from './client';

/** `GET /api/health` */
export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>('/api/health');
}
