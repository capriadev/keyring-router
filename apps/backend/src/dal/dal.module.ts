import { Module } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { ConfigModule } from '../config/config.module.js';
import { createDatabase, DATABASE } from './client.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { CredentialsRepository } from './repositories/credentials.repository.js';
import { PoliciesRepository } from './repositories/policies.repository.js';

/** Owns the database connection and every repository. Only this layer touches Drizzle. */
@Module({
  imports: [ConfigModule],
  providers: [
    { provide: DATABASE, useFactory: (env: AppEnv) => createDatabase(env.dbPath), inject: [APP_ENV] },
    CredentialsRepository,
    CatalogRepository,
    PoliciesRepository,
  ],
  exports: [CredentialsRepository, CatalogRepository, PoliciesRepository],
})
export class DalModule {}
