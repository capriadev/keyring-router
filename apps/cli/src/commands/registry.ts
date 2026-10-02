import type { CommandContext } from '../client.js';
import { credentialCommand } from './credentials.js';
import { doctorCommand } from './doctor.js';
import { modelsCommand, providersCommand } from './models.js';
import { policyCommand } from './policies.js';
import { profileCommand } from './profile.js';
import { serveCommand } from './serve.js';
import { serviceCommand } from './service.js';
import { statusCommand, versionCommand } from './status.js';

/** One command of this command line, and the one line of help that says what it is for. */
export interface Command {
  readonly name: string;
  readonly summary: string;
  readonly run: (context: CommandContext) => Promise<number>;
}

const COMMANDS: readonly Command[] = [
  { name: 'serve', summary: 'start the gateway in the foreground', run: serveCommand },
  { name: 'service', summary: 'install, remove, restart or inspect the Windows service', run: serviceCommand },
  { name: 'status', summary: 'health, credentials and exposed models', run: statusCommand },
  { name: 'version', summary: 'version of the running gateway', run: versionCommand },
  { name: 'providers', summary: 'providers the catalog offers', run: providersCommand },
  { name: 'models', summary: 'exposed models, or --catalog for the discovered ones', run: modelsCommand },
  { name: 'credential', summary: 'list, add, validate, refresh or rotate a credential', run: credentialCommand },
  { name: 'policy', summary: 'list, allow, deny or remove an exposure rule', run: policyCommand },
  { name: 'profile', summary: 'list, add or remove a routing profile (mode and cascade per model)', run: profileCommand },
  { name: 'doctor', summary: 'check node, pepper, database and gateway', run: doctorCommand },
];

export function findCommand(name: string): Command | undefined {
  return COMMANDS.find((command) => command.name === name);
}

/** The help text. It lists the commands and the flags a user actually needs, nothing more. */
export function helpText(): string {
  const lines = [
    'keyring router - local gateway for AI inference providers',
    '',
    'usage: kr <command> [options]',
    '',
    'commands:',
    ...COMMANDS.map((command) => `  ${command.name.padEnd(11)}${command.summary}`),
    '',
    'common options:',
    '  --json                     machine readable output',
    `  KR_API_URL                 address of the gateway (default http://127.0.0.1:4310)`,
    '',
    'examples:',
    '  kr serve --port 4310',
    '  kr service install                 (needs an elevated terminal)',
    '  kr credential add --namespace local --provider ollama --base-url http://127.0.0.1:11434',
    '  kr credential add --namespace work --provider groq --base-url https://api.groq.com/openai/v1 --auth api_key',
    '  kr policy allow "work/*"',
    '  kr models',
    '',
  ];

  return lines.join('\n');
}
