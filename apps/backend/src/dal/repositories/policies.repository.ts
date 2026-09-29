import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { PolicyRule } from '../../types/policy.js';
import { DATABASE, type KrDatabase } from '../client.js';
import { policies } from '../schema/policies.js';

@Injectable()
export class PoliciesRepository {
  constructor(@Inject(DATABASE) private readonly db: KrDatabase) {}

  list(): PolicyRule[] {
    return this.db
      .select()
      .from(policies)
      .orderBy(asc(policies.createdAt), asc(policies.id))
      .all();
  }

  insert(rule: PolicyRule): void {
    this.db.insert(policies).values(rule).run();
  }

  /** True when a rule was removed, so the caller can answer 404 for an unknown id. */
  deleteById(id: string): boolean {
    return this.db.delete(policies).where(eq(policies.id, id)).run().changes > 0;
  }
}
