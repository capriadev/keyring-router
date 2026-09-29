import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { SECRET_KEY_SOURCE, createSecretKeySource } from '../config/secret-key-source.js';
import {
  SECRET_KEYRING_CONFIG,
  assertPepperWhenSecretsExist,
  type SecretKeyringConfig,
} from '../config/secrets.env.js';
import { createDatabase, DATABASE } from './client.js';
import { DatabaseLifecycle } from './database-lifecycle.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { CredentialsRepository } from './repositories/credentials.repository.js';
import { CREDENTIAL_SECRET_SALT_ID, InstallKeysRepository } from './repositories/install-keys.repository.js';
import { PoliciesRepository } from './repositories/policies.repository.js';

/** Owns the database connection and every repository. Only this layer touches Drizzle. */
@Module({
  imports: [ConfigModule],
  providers: [
    { provide: DATABASE, useFactory: (env: AppEnv) => createDatabase(env.dbPath), inject: [APP_ENV] },
    DatabaseLifecycle,
    CredentialsRepository,
    CatalogRepository,
    PoliciesRepository,
    InstallKeysRepository,
    {
      provide: SECRET_KEY_SOURCE,
      /**
       * Composed here because this module is the only one in the graph that holds both halves: the
       * database handle that owns the per install salt and, through `ConfigModule`, the boot pepper.
       * The derivation itself lives in `config/` and every secret operation lives in `bll/`.
       */
      useFactory: (
        credentials: CredentialsRepository,
        installKeys: InstallKeysRepository,
        config: SecretKeyringConfig,
      ) => {
        assertPepperWhenSecretsExist(config, credentials.countStoredSecrets());

        return createSecretKeySource(config, () => installKeys.readOrCreate(CREDENTIAL_SECRET_SALT_ID));
      },
      inject: [CredentialsRepository, InstallKeysRepository, SECRET_KEYRING_CONFIG],
    },
  ],
  exports: [
    CredentialsRepository,
    CatalogRepository,
    PoliciesRepository,
    InstallKeysRepository,
    SECRET_KEY_SOURCE,
  ],
})
export class DalModule {}
