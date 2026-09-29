import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { SALT_BYTES } from '../../config/secrets.env.js';
import { DATABASE, type KrDatabase } from '../client.js';
import { installKeys } from '../schema/install-keys.js';

/** The salt of the credential secret key. One value per installation. */
export const CREDENTIAL_SECRET_SALT_ID = 'credentials-secret-salt';

@Injectable()
export class InstallKeysRepository {
  constructor(@Inject(DATABASE) private readonly db: KrDatabase) {}

  /**
   * Reads the value of an installation key, creating it on first use. A salt is never rotated:
   * a new one would leave every stored secret undecryptable.
   */
  readOrCreate(id: string): string {
    const existing = this.find(id);

    if (existing !== null) {
      return existing;
    }

    const value = randomBytes(SALT_BYTES).toString('base64');

    // Insert or ignore: a second process racing for the same key must adopt the stored value
    // instead of overwriting it, otherwise one of the two would derive a different key.
    this.db.insert(installKeys).values({ id, value, createdAt: Date.now() }).onConflictDoNothing().run();

    const stored = this.find(id);

    if (stored === null) {
      throw new Error(`installation key could not be stored: ${id}`);
    }

    return stored;
  }

  private find(id: string): string | null {
    const row = this.db.select({ value: installKeys.value }).from(installKeys).where(eq(installKeys.id, id)).get();

    return row?.value ?? null;
  }
}
