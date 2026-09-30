import { SECRET_MAX_LENGTH, SECRET_MIN_LENGTH } from '../types/api';

/**
 * The length boundary the gateway applies to a secret, mirrored so the panel can explain a problem
 * before sending anything. The gateway keeps enforcing it, and it is the only check mirrored here:
 * every other rule is answered by the gateway and shown as the message it returned.
 */
export function describeSecretProblem(secret: string): string | null {
  if (secret.length < SECRET_MIN_LENGTH || secret.length > SECRET_MAX_LENGTH) {
    return `El secreto debe tener entre ${SECRET_MIN_LENGTH} y ${SECRET_MAX_LENGTH} caracteres.`;
  }

  return null;
}
