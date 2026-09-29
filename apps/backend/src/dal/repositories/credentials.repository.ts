import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Credential } from '../../types/credential.js';
import { DATABASE, type KrDatabase } from '../client.js';
import { credentials } from '../schema/credentials.js';

@Injectable()
export class CredentialsRepository {
  constructor(@Inject(DATABASE) private readonly db: KrDatabase) {}

  insert(credential: Credential): void {
    this.db.insert(credentials).values(credential).run();
  }

  list(): Credential[] {
    return this.db
      .select()
      .from(credentials)
      .orderBy(asc(credentials.createdAt), asc(credentials.namespace))
      .all();
  }

  findById(id: string): Credential | undefined {
    return this.db.select().from(credentials).where(eq(credentials.id, id)).get();
  }

  findByNamespace(namespace: string): Credential | undefined {
    return this.db.select().from(credentials).where(eq(credentials.namespace, namespace)).get();
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
}
