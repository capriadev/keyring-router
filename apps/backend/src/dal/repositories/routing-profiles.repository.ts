import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { RoutingMode } from '../../types/routing.js';
import { DATABASE, type KrDatabase } from '../client.js';
import { routingProfiles } from '../schema/routing.js';

/** One routing profile as it is stored and read, keyed by the model id alone. */
export interface RoutingProfileRecord {
  readonly id: string;
  readonly providerModelId: string;
  readonly mode: RoutingMode;
  readonly cascade: readonly string[];
  readonly createdAt: number;
}

/**
 * The profiles the user wrote: which mode and which cascade apply to each model. It is user data, read
 * by the router and written through the API, so it lives beside policies rather than beside the derived
 * routing state.
 */
@Injectable()
export class RoutingProfilesRepository {
  constructor(@Inject(DATABASE) private readonly db: KrDatabase) {}

  list(): RoutingProfileRecord[] {
    return this.db
      .select()
      .from(routingProfiles)
      .orderBy(asc(routingProfiles.providerModelId))
      .all();
  }

  findByModel(providerModelId: string): RoutingProfileRecord | undefined {
    return this.db.select().from(routingProfiles).where(eq(routingProfiles.providerModelId, providerModelId)).get();
  }

  insert(record: RoutingProfileRecord): void {
    this.db.insert(routingProfiles).values(record).run();
  }

  /** True when a profile was removed, so the caller can answer 404 for an unknown id. */
  deleteById(id: string): boolean {
    return this.db.delete(routingProfiles).where(eq(routingProfiles.id, id)).run().changes > 0;
  }
}