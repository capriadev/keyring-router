import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { Writable } from 'node:stream';

/**
 * How a command answers: a small aligned table for a human, JSON for a script. Nothing here ever writes a
 * secret back to the terminal, not even masked.
 */

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function info(message: string): void {
  process.stdout.write(`${message}\n`);
}

function cell(value: string, width: number): string {
  return value.length > width ? `${value.slice(0, width - 1)}…` : value.padEnd(width);
}

/** A column aligned table, with the header in the same shape as the rows so a pipe stays readable. */
export function printRows(columns: readonly string[], rows: readonly (readonly string[])[]): void {
  if (rows.length === 0) {
    info('(nothing to list)');
    return;
  }

  const widths = columns.map((column, index) =>
    Math.max(column.length, ...rows.map((row) => (row[index] ?? '').length)),
  );

  info(columns.map((column, index) => cell(column, widths[index] ?? column.length)).join('  '));
  info(widths.map((width) => '-'.repeat(width)).join('  '));

  for (const row of rows) {
    info(row.map((value, index) => cell(value, widths[index] ?? value.length)).join('  '));
  }
}

class SilentOutput extends Writable {
  override _write(_chunk: unknown, _encoding: BufferEncoding, done: () => void): void {
    done();
  }
}

/** A line read without echoing it, so a secret never lands in the terminal scrollback. */
async function readHiddenLine(): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: new SilentOutput(), terminal: true });

  try {
    const [line] = await once(rl, 'line');

    return String(line);
  } finally {
    rl.close();
  }
}

/**
 * The secret of a credential. On a terminal it is typed without echo; when stdin is a pipe the value is
 * read from it, which is how a script supplies one. A secret passed as a command line argument is not
 * supported on purpose: the shell history would keep it.
 */
export async function promptSecret(question: string): Promise<string> {
  if (process.stdin.isTTY !== true) {
    const chunks: Buffer[] = [];

    for await (const chunk of process.stdin) {
      chunks.push(Buffer.from(chunk as Buffer));
    }

    const [first = ''] = Buffer.concat(chunks).toString('utf8').split('\n');

    return first.trim();
  }

  process.stdout.write(question);

  try {
    return (await readHiddenLine()).trim();
  } finally {
    process.stdout.write('\n');
  }
}
