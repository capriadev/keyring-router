import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module.js';
import { APP_ENV, type AppEnv } from '../config/env.js';
import { SECRET_KEY_SOURCE, createSecretKeySource, type SecretKeySource } from '../config/secret-key-source.js';
import {
  SECRET_KEYRING_CONFIG,
  assertPepperWhenSecretsExist,
  type SecretKeyringConfig,
} from '../config/secrets.env.js';
import { createDatabase, DATABASE, type KrDatabase } from './client.js';
import { DatabaseLifecycle, closeDatabase } from './database-lifecycle.js';
import { CatalogRepository } from './repositories/catalog.repository.js';
import { CredentialsRepository } from './repositories/credentials.repository.js';
import { CREDENTIAL_SECRET_SALT_ID, InstallKeysRepository } from './repositories/install-keys.repository.js';
import { PoliciesRepository } from './repositories/policies.repository.js';
import { RoutingProfilesRepository } from './repositories/routing-profiles.repository.js';
import { RoutingRepository } from './repositories/routing.repository.js';

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
    RoutingRepository,
    RoutingProfilesRepository,
    {
      provide: SECRET_KEY_SOURCE,
      /**
       * Composed here because this module is the only one in the graph that holds both halves: the
       * database handle that owns the per install salt and, through `ConfigModule`, the boot pepper.
       * The derivation itself lives in `config/` and every secret operation lives in `bll/`.
       */
      useFactory: createSecretKeySourceProvider,
      inject: [DATABASE, CredentialsRepository, InstallKeysRepository, SECRET_KEYRING_CONFIG],
    },
  ],
  exports: [
    CredentialsRepository,
    CatalogRepository,
    PoliciesRepository,
    InstallKeysRepository,
    RoutingRepository,
    RoutingProfilesRepository,
    SECRET_KEY_SOURCE,
  ],
})
export class DalModule {}

/**
 * Builds the credential key source and enforces the boot guard: secrets exist and the pepper that
 * opens them does not, so starting anyway would turn every stored secret into a decryption failure
 * at request time.
 *
 * The guard runs here because this module is the only one in the graph that holds both halves: the
 * database handle and the pepper. A refusal closes that handle before it propagates, because the
 * process outlives the failed boot (the CLI keeps its own error handling, a test keeps running) and
 * an open SQLite handle keeps the database file locked for that whole time.
 */
export function createSecretKeySourceProvider(
  db: KrDatabase,
  credentials: CredentialsRepository,
  installKeys: InstallKeysRepository,
  config: SecretKeyringConfig,
): SecretKeySource {
  try {
    assertPepperWhenSecretsExist(config, credentials.countStoredSecrets());
  } catch (error) {
    closeDatabase(db);
    throw error;
  }

  return createSecretKeySource(config, () => installKeys.readOrCreate(CREDENTIAL_SECRET_SALT_ID));
}
