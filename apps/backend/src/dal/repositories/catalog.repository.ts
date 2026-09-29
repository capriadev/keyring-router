import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE, type KrDatabase } from '../client.js';
import { catalogModels, type CatalogModelRow } from '../schema/catalog.js';

/** One discovered model as the catalog table stores it, without the credential scope. */
export interface CatalogModelInput {
  readonly providerModelId: string;
  readonly displayName: string;
  readonly sizeBytes: number | null;
  readonly family: string | null;
  readonly providerModifiedAt: string | null;
  readonly discoveredAt: number;
}

/** Row id from the data model: `${credential_id}:${provider_model_id}`. */
function toCatalogRowId(credentialId: string, providerModelId: string): string {
  return `${credentialId}:${providerModelId}`;
}

@Injectable()
export class CatalogRepository {
  constructor(@Inject(DATABASE) private readonly db: KrDatabase) {}

  /** Replaces the derived rows of one credential atomically. */
  replaceForCredential(credentialId: string, models: readonly CatalogModelInput[]): void {
    this.db.transaction((tx) => {
      tx.delete(catalogModels).where(eq(catalogModels.credentialId, credentialId)).run();

      if (models.length > 0) {
        tx.insert(catalogModels)
          .values(
            models.map((model) => ({
              ...model,
              id: toCatalogRowId(credentialId, model.providerModelId),
              credentialId,
            })),
          )
          .run();
      }
    });
  }

  list(): CatalogModelRow[] {
    return this.db
      .select()
      .from(catalogModels)
      .orderBy(asc(catalogModels.credentialId), asc(catalogModels.providerModelId))
      .all();
  }

  listByCredential(credentialId: string): CatalogModelRow[] {
    return this.db
      .select()
      .from(catalogModels)
      .where(eq(catalogModels.credentialId, credentialId))
      .orderBy(asc(catalogModels.providerModelId))
      .all();
  }
}
