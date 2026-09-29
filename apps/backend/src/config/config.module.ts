import { Module } from '@nestjs/common';
import { APP_ENV, loadEnv } from './env.js';
import { SECRET_KEYRING_CONFIG, loadSecretKeyringConfig } from './secrets.env.js';

@Module({
  providers: [
    { provide: APP_ENV, useFactory: () => loadEnv() },
    { provide: SECRET_KEYRING_CONFIG, useFactory: () => loadSecretKeyringConfig() },
  ],
  exports: [APP_ENV, SECRET_KEYRING_CONFIG],
})
export class ConfigModule {}
