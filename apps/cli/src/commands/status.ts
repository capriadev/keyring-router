import { EXIT, request, type ApiResult, type CommandContext } from '../client.js';
import { booleanFlag, parseFlags } from '../args.js';
import { info, printJson } from '../output.js';

interface HealthResponse {
  readonly status: string;
  readonly version: string;
  readonly uptimeSeconds: number;
}

interface CredentialSummary {
  readonly namespace: string;
  readonly providerId: string;
  readonly authKind: string;
}

/** `kr status`: what the gateway is, and whether it has anything to route with. */
export async function statusCommand(context: CommandContext): Promise<number> {
  const parsed = parseFlags(context.argv, {
    json: { type: 'boolean', description: 'machine readable output' },
  });

  if (booleanFlag(parsed, 'json') || context.json) {
    const [health, credentials, models] = await Promise.all([
      request('GET', '/api/health'),
      request('GET', '/api/credentials'),
      request('GET', '/api/models'),
    ]);

    printJson({ health: health.body, credentials: credentials.body, models: models.body });

    return EXIT.ok;
  }

  const health = (await request('GET', '/api/health')).body as HealthResponse;
  const credentials = (await request('GET', '/api/credentials')).body as readonly CredentialSummary[];
  const models = (await request('GET', '/api/models')).body as readonly unknown[];

  info(`gateway   ${health.status} (version ${health.version}, up ${Math.round(health.uptimeSeconds)}s)`);
  info(`credentials ${credentials.length}`);
  info(`exposed models ${models.length}`);

  return EXIT.ok;
}

/** `kr version`: the version of the gateway and of this command line. */
export async function versionCommand(context: CommandContext): Promise<number> {
  const health: ApiResult = await request('GET', '/api/health');

  if (context.json) {
    printJson(health.body);

    return EXIT.ok;
  }

  info(`keyring router ${(health.body as HealthResponse).version}`);

  return EXIT.ok;
}
