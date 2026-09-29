import { EXIT, request, type CommandContext } from '../client.js';
import { parseFlags, stringFlag } from '../args.js';
import { gatewayEnvironment } from '../env-file.js';
import { info, printJson } from '../output.js';
import { buildServiceDefinition, missingEntryPoint } from '../service/definition.js';
import { createService, firstEvent, serviceExists } from '../service/windows.js';
import { repoRoot } from '../paths.js';

/**
 * `kr service`: the gateway as a Windows service, so it starts with the machine and survives a crash
 * without a terminal open. Installing and removing one changes the system, so both commands say what they
 * are about to do and report exactly what happened, including the elevation they need.
 */

export async function serviceCommand(context: CommandContext): Promise<number> {
  const [subcommand, ...rest] = context.argv;

  switch (subcommand) {
    case 'install':
      return await installCommand(rest, context);
    case 'uninstall':
      return await uninstallCommand(rest, context);
    case 'status':
      return await statusCommand(rest, context);
    case 'restart':
      return await restartCommand(rest);
    default:
      throw new Error('usage: kr service <install|uninstall|status|restart>');
  }
}

function definitionFrom(argv: readonly string[]) {
  const parsed = parseFlags(argv, {
    port: { type: 'string', description: 'port the service listens on' },
    db: { type: 'string', description: 'database file the service uses' },
    json: { type: 'boolean', description: 'machine readable output' },
  });
  const root = repoRoot();
  const definition = buildServiceDefinition({
    root,
    nodePath: process.execPath,
    environment: gatewayEnvironment(root, {}),
    ...(stringFlag(parsed, 'port') === undefined ? {} : { port: stringFlag(parsed, 'port') }),
    ...(stringFlag(parsed, 'db') === undefined ? {} : { dbPath: stringFlag(parsed, 'db') }),
  });

  return { definition, parsed };
}

async function installCommand(argv: readonly string[], context: CommandContext): Promise<number> {
  const { definition, parsed } = definitionFrom(argv);
  const problem = missingEntryPoint(definition);

  if (problem !== null) {
    throw new Error(problem);
  }

  if (parsed.values.json === true || context.json) {
    printJson(definition);
  } else {
    info(`installing the service "${definition.name}"`);
    info(`  entry point  ${definition.script}`);
    info(`  workdir      ${definition.workingDirectory}`);
    info(`  logs         ${definition.logDirectory}`);
    info(`  variables    ${definition.env.map((entry) => entry.name).join(', ') || 'none'}`);
    info('  this needs administrator rights: run it from an elevated terminal');
  }

  const service = createService(definition);
  const installed = firstEvent(service, ['install', 'alreadyinstalled']);
  service.install();
  const installEvent = await installed;
  const started = firstEvent(service, ['start', 'alreadystarted']);
  service.start();
  const startEvent = await started;

  info(`service ${installEvent}, ${startEvent}`);

  return EXIT.ok;
}

async function uninstallCommand(argv: readonly string[], context: CommandContext): Promise<number> {
  const { definition } = definitionFrom(argv);
  const service = createService(definition);

  if (!serviceExists(service)) {
    info('the service is not installed: nothing to remove');

    return EXIT.ok;
  }

  const removed = firstEvent(service, ['uninstall', 'alreadyuninstalled']);
  service.uninstall();
  const event = await removed;

  // The claim is verified instead of assumed: an uninstall that leaves the wrapper behind is worse than none.
  const stillThere = serviceExists(createService(definition));

  if (context.json) {
    printJson({ event, stillInstalled: stillThere });

    return stillThere ? EXIT.usage : EXIT.ok;
  }

  info(`service ${event}${stillThere ? ' (the wrapper is still installed, check the logs in ' + definition.logDirectory + ')' : ''}`);

  return stillThere ? EXIT.usage : EXIT.ok;
}

async function statusCommand(argv: readonly string[], context: CommandContext): Promise<number> {
  const { definition } = definitionFrom(argv);
  const installed = serviceExists(createService(definition));
  let answering = false;

  try {
    await request('GET', '/api/health');
    answering = true;
  } catch {
    answering = false;
  }

  if (context.json) {
    printJson({ installed, answering, script: definition.script, logDirectory: definition.logDirectory });

    return installed ? EXIT.ok : EXIT.usage;
  }

  info(`installed  ${installed ? 'yes' : 'no'}`);
  info(`answering  ${answering ? 'yes' : 'no'} (GET /api/health)`);
  info(`entry      ${definition.script}`);
  info(`logs       ${definition.logDirectory}`);

  return installed ? EXIT.ok : EXIT.usage;
}

async function restartCommand(argv: readonly string[]): Promise<number> {
  const { definition } = definitionFrom(argv);
  const service = createService(definition);

  if (!serviceExists(service)) {
    throw new Error('the service is not installed: install it with kr service install');
  }

  const stopped = firstEvent(service, ['stop', 'alreadystopped']);
  service.stop();
  await stopped;

  const started = firstEvent(service, ['start', 'alreadystarted']);
  service.start();
  await started;

  info('service restarted');

  return EXIT.ok;
}
