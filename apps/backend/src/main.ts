import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { APP_ENV, type AppEnv } from './config/env.js';
import { ApiErrorFilter } from './gateway/api-error.filter.js';
import { PANEL_CORS_METHODS, isLocalPanelOrigin } from './gateway/cors.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

  app.useGlobalFilters(new ApiErrorFilter());

  // The panel is a browser page on loopback talking to this API on another loopback port, so every call
  // it makes is cross origin and the browser refuses the answer without these headers. Only loopback
  // origins are allowed, so a website the user visits cannot read this API. See `gateway/cors.ts`.
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow: boolean) => void) => {
      callback(null, isLocalPanelOrigin(origin));
    },
    methods: [...PANEL_CORS_METHODS],
  });

  app.enableShutdownHooks();

  const env = app.get<AppEnv>(APP_ENV);

  await app.listen({ host: env.host, port: env.port });

  new Logger('bootstrap').log(`keyring router listening on http://${env.host}:${env.port}`);
}

bootstrap().catch((error: unknown) => {
  new Logger('bootstrap').error(error instanceof Error ? error.message : 'bootstrap failed');
  process.exitCode = 1;
});

