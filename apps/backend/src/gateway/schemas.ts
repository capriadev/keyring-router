import { z } from 'zod';
import { PROVIDER_IDS } from '../types/provider.js';

/** `POST /api/credentials`. Domain rules (slug format, URL shape) belong to bll, not here. */
export const createCredentialBodySchema = z.object({
  namespace: z.string().min(1).max(32),
  providerId: z.enum(PROVIDER_IDS),
  baseUrl: z.string().min(1),
  authKind: z.enum(['none', 'api_key']),
  // Refused instead of silently dropped: this slice persists no secret.
  secret: z.undefined().optional(),
});

/** `POST /api/policies` */
export const createPolicyBodySchema = z.object({
  credentialId: z.string().min(1).nullish(),
  pattern: z.string().min(1),
  effect: z.enum(['allow', 'deny']),
});

/** `:id` of a credential or a policy. */
export const idParamsSchema = z.object({ id: z.string().min(1) });

/** `GET /api/catalog?credentialId=` */
export const catalogQuerySchema = z.object({ credentialId: z.string().min(1).optional() });

export type CreateCredentialBody = z.infer<typeof createCredentialBodySchema>;

export type CreatePolicyBody = z.infer<typeof createPolicyBodySchema>;

export type IdParams = z.infer<typeof idParamsSchema>;

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
