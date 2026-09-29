import { Service, type ServiceOptions, type WindowsService } from 'node-windows';
import type { ServiceDefinition } from './definition.js';

/**
 * The only place that talks to Windows. `node-windows` wraps winsw, which the package ships: there is no
 * binary to download and no service wrapper of our own to maintain, and the wrapper owns the restart
 * policy, the service account and the log file rotation.
 */

export function serviceOptions(definition: ServiceDefinition): ServiceOptions {
  return {
    name: definition.name,
    description: definition.description,
    script: definition.script,
    workingDirectory: definition.workingDirectory,
    env: definition.env.map((entry) => ({ name: entry.name, value: entry.value })),
    wait: definition.waitSeconds,
    grow: definition.grow,
    maxRestarts: definition.maxRestarts,
  };
}

export function createService(definition: ServiceDefinition): WindowsService {
  return new Service(serviceOptions(definition));
}

export function serviceExists(service: WindowsService): boolean {
  return service.exists === true;
}

/**
 * The first of several events the wrapper may report, awaited with a deadline. The wrapper speaks through
 * events rather than promises, and a request it considers already satisfied answers with a different one:
 * waiting for a single name would hang on the second run of the same command.
 */
export function firstEvent(
  service: WindowsService,
  events: readonly string[],
  timeoutMs = 60_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`the service reported none of ${events.join(', ')} within ${timeoutMs} ms`));
    }, timeoutMs);

    const settle = (value: string): void => {
      clearTimeout(timer);
      resolve(value);
    };

    for (const event of events) {
      service.on(event, () => settle(event));
    }

    service.on('error', (error: unknown) => {
      clearTimeout(timer);
      reject(new Error(error instanceof Error ? error.message : String(error)));
    });
  });
}
