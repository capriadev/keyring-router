import type { SecretKeySource } from '../../config/secret-key-source.js';
import type { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import type { Credential, StoredSecret } from '../../types/credential.js';
import type { AdapterTarget } from '../../types/provider.js';
import { SecretNotFoundError } from '../errors.js';
import { openSecret, requireSecretKey } from './secrets.js';

/**
 * The only place a credential becomes an adapter target, so `AdapterTarget.secret` has exactly one
 * origin. An `authKind: 'none'` credential never touches the keyring, which keeps local providers
 * working on an installation that has no pepper at all.
 */
export function adapterTargetFor(
  credential: Credential,
  credentials: CredentialsRepository,
  keySource: SecretKeySource,
): AdapterTarget {
  if (credential.authKind === 'none') {
    return { baseUrl: credential.baseUrl, authKind: 'none' };
  }

  const stored: StoredSecret | null = credentials.readStoredSecret(credential.id);

  if (stored === null) {
    throw new SecretNotFoundError(credential.id);
  }

  return {
    baseUrl: credential.baseUrl,
    authKind: 'api_key',
    secret: openSecret(requireSecretKey(keySource), stored),
  };
}
