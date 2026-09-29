import { Inject, Injectable } from '@nestjs/common';
import { asc, count, eq, isNotNull } from 'drizzle-orm';
import type { Credential, StoredSecret } from '../../types/credential.js';
import { DATABASE, type KrDatabase } from '../client.js';
import { credentials } from '../schema/credentials.js';

/**
 * Every read of a credential goes through this projection, never through a bare `select()`. The
 * encrypted columns stay out of the objects that travel to `bll/` and to a response body, so the
 * secret cannot leak by accident through a spread or a JSON serialization.
 */
const credentialColumns = {
  id: credentials.id,
  namespace: credentials.namespace,
  providerId: credentials.providerId,
  baseUrl: credentials.baseUrl,
  authKind: credentials.authKind,
  secretHint: credentials.secretHint,
  lastValidatedAt: credentials.lastValidatedAt,
  lastRefreshAt: credentials.lastRefreshAt,
  lastRefreshError: credentials.lastRefreshError,
  createdAt: credentials.createdAt,
} as const;

/** Reads the five secret columns and refuses a half written row instead of guessing. */
function toStoredSecret(row: {
  secretCiphertext: string | null;
  secretIv: string | null;
  secretTag: string | null;
  secretVersion: number | null;
  secretHint: string | null;
}): StoredSecret | null {
  const { secretCiphertext, secretIv, secretTag, secretVersion, secretHint } = row;

  if (
    secretCiphertext === null &&
    secretIv === null &&
    secretTag === null &&
    secretVersion === null &&
    secretHint === null
  ) {
    return null;
  }

  if (
    secretCiphertext === null ||
    secretIv === null ||
    secretTag === null ||
    secretVersion === null ||
    secretHint === null
  ) {
    throw new Error('credential secret row is incomplete');
  }

  return { secretCiphertext, secretIv, secretTag, secretVersion, secretHint };
}

@Injectable()
export class CredentialsRepository {
  constructor(@Inject(DATABASE) private readonly db: KrDatabase) {}

  insert(credential: Credential, secret: StoredSecret | null = null): void {
    this.db
      .insert(credentials)
      .values(secret === null ? credential : { ...credential, ...secret })
      .run();
  }

  list(): Credential[] {
    return this.db
      .select(credentialColumns)
      .from(credentials)
      .orderBy(asc(credentials.createdAt), asc(credentials.namespace))
      .all();
  }

  findById(id: string): Credential | undefined {
    return this.db.select(credentialColumns).from(credentials).where(eq(credentials.id, id)).get();
  }

  findByNamespace(namespace: string): Credential | undefined {
    return this.db.select(credentialColumns).from(credentials).where(eq(credentials.namespace, namespace)).get();
  }

  /** The encrypted secret of one credential, or null when it holds none. Never logged. */
  readStoredSecret(id: string): StoredSecret | null {
    const row = this.db
      .select({
        secretCiphertext: credentials.secretCiphertext,
        secretIv: credentials.secretIv,
        secretTag: credentials.secretTag,
        secretVersion: credentials.secretVersion,
        secretHint: credentials.secretHint,
      })
      .from(credentials)
      .where(eq(credentials.id, id))
      .get();

    return row === undefined ? null : toStoredSecret(row);
  }

  /**
   * Rotation. A single UPDATE, so ciphertext, IV, tag, version and hint land together or not at all;
   * the previous ciphertext is gone from the row, not kept beside the new one.
   */
  replaceSecret(id: string, secret: StoredSecret): void {
    this.db.update(credentials).set(secret).where(eq(credentials.id, id)).run();
  }

  /**
   * Counts stored secrets without reading them. An un-migrated database has no credentials table,
   * which cannot hold a secret either, so it counts as none.
   */
  countStoredSecrets(): number {
    if (!this.hasCredentialsTable()) {
      return 0;
    }

    const row = this.db
      .select({ total: count() })
      .from(credentials)
      .where(isNotNull(credentials.secretCiphertext))
      .get();

    return row?.total ?? 0;
  }

  markValidated(id: string, validatedAt: number): void {
    this.db.update(credentials).set({ lastValidatedAt: validatedAt }).where(eq(credentials.id, id)).run();
  }

  /** A successful refresh clears the error of the previous attempt. */
  markRefreshed(id: string, refreshedAt: number): void {
    this.db
      .update(credentials)
      .set({ lastRefreshAt: refreshedAt, lastRefreshError: null })
      .where(eq(credentials.id, id))
      .run();
  }

  markRefreshFailed(id: string, error: string): void {
    this.db.update(credentials).set({ lastRefreshError: error }).where(eq(credentials.id, id)).run();
  }

  private hasCredentialsTable(): boolean {
    const row = this.db.$client
      .prepare("select name from sqlite_master where type = 'table' and name = 'credentials'")
      .get();

    return row !== undefined;
  }
}
