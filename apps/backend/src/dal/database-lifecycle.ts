import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { DATABASE, type KrDatabase } from './client.js';

/**
 * Releases the SQLite handle when the application context shuts down. Without it the database file
 * stays locked by the process, which on Windows keeps it from being moved or deleted.
 */
@Injectable()
export class DatabaseLifecycle implements OnModuleDestroy {
  constructor(@Inject(DATABASE) private readonly db: KrDatabase) {}

  onModuleDestroy(): void {
    closeDatabase(this.db);
  }
}

/**
 * Releases the SQLite handle and never lets a close failure replace the failure being reported: a
 * caller that closes while unwinding a refusal has a cause of its own to propagate, and a handle
 * that cannot be closed is already unusable. Closing matters because SQLite keeps the file locked
 * for the life of the process, which on Windows stops the user from moving or deleting it.
 */
export function closeDatabase(db: KrDatabase): void {
  try {
    db.$client.close();
  } catch {
    // Deliberately swallowed: see above.
  }
}
