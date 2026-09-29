import { z } from 'zod';
import { headerUnsafeSecretProblem } from '../bll/credentials/secrets.js';
import { SECRET_MAX_LENGTH, SECRET_MIN_LENGTH } from '../types/credential.js';

/**
 * A storable secret: bounded by length, and sendable as a header value. `CredentialService` applies the
 * same rule again, because it is the only path every writer goes through; sharing the check keeps the
 * boundary and the domain from disagreeing, and the message names the offending character, never the
 * secret.
 */
const secretSchema = z
  .string()
  .min(SECRET_MIN_LENGTH)
  .max(SECRET_MAX_LENGTH)
  .superRefine((value, context) => {
    const problem = headerUnsafeSecretProblem(value);

    if (problem !== null) {
      context.addIssue({ code: 'custom', message: problem });
    }
  });

/**
 * `POST /api/credentials`. Domain rules (slug format, URL shape, whether the provider exists, which
 * auth kind it accepts, whether a secret is required) belong to bll, not here: the catalog is data,
 * so the boundary checks the shape of a provider id and the registry decides if it exists.
 */
export const createCredentialBodySchema = z.object({
  namespace: z.string().min(1).max(32),
  providerId: z.string().min(1).max(64),
  baseUrl: z.string().min(1),
  authKind: z.enum(['none', 'api_key']),
  /** Encrypted by bll before it reaches a column. It never comes back in a response. */
  secret: secretSchema.optional(),
});

/** `PATCH /api/credentials/:id/secret` */
export const rotateSecretBodySchema = z.object({
  secret: secretSchema,
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

export type RotateSecretBody = z.infer<typeof rotateSecretBodySchema>;

export type CreatePolicyBody = z.infer<typeof createPolicyBodySchema>;

export type IdParams = z.infer<typeof idParamsSchema>;

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
