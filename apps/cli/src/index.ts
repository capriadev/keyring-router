/**
 * The `kr` command line. It is a thin client of the gateway's own HTTP API: every management command goes
 * through the same endpoints the local UI uses, so the two can never disagree about what a credential or a
 * policy is. Only `serve` and `doctor` touch the process and the filesystem.
 */
import { EXIT, isCliError, type CommandContext } from './client.js';
import { findCommand, helpText } from './commands/registry.js';
import { printJson } from './output.js';

async function main(argv: readonly string[]): Promise<number> {
  const [name, ...rest] = argv;

  if (name === undefined || name === '--help' || name === '-h' || name === 'help') {
    process.stdout.write(helpText());
    return EXIT.ok;
  }

  const command = findCommand(name);

  if (command === undefined) {
    process.stderr.write(`unknown command: ${name}\n\n`);
    process.stderr.write(helpText());
    return EXIT.usage;
  }

  const json = rest.includes('--json');
  const context: CommandContext = { argv: rest, json };

  try {
    return await command.run(context);
  } catch (error) {
    if (isCliError(error)) {
      process.stderr.write(
        json ? `${JSON.stringify({ error: { code: error.code, message: error.message } })}\n` : `${error.message}\n`,
      );

      return error.exitCode;
    }

    // Anything else is a bug of this command line, and the message names no input of the user.
    process.stderr.write('unexpected failure\n');

    return EXIT.usage;
  }
}

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
