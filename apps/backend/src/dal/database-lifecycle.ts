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
    this.db.$client.close();
  }
}
