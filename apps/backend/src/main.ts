import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { APP_ENV, type AppEnv } from './config/env.js';
import { ApiErrorFilter } from './gateway/api-error.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  app.useGlobalFilters(new ApiErrorFilter());
  app.enableShutdownHooks();

  const env = app.get<AppEnv>(APP_ENV);

  await app.listen({ host: env.host, port: env.port });

  new Logger('bootstrap').log(`keyring router listening on http://${env.host}:${env.port}`);
}

bootstrap().catch((error: unknown) => {
  new Logger('bootstrap').error(error instanceof Error ? error.message : 'bootstrap failed');
  process.exitCode = 1;
});

