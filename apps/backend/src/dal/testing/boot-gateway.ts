import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DalModule } from '../dal.module.js';

/**
 * Boots the persistence and configuration graph the way the gateway does, so a test can assert the
 * refusal to start in a real Nest boot without importing the provider catalog of another lane.
 * `abortOnError: false` keeps the failure inside the promise instead of ending the process silently.
 */
async function boot(): Promise<void> {
  const context = await NestFactory.createApplicationContext(DalModule, { abortOnError: false });

  await context.close();
}

boot().catch((error: unknown) => {
  new Logger('bootstrap').error(error instanceof Error ? error.message : 'bootstrap failed');
  process.exitCode = 1;
});
