import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { booleanFlag, noPositionals, parseFlags, requiredPositional, stringFlag } from './args.js';
import { isCliError } from './client.js';

const specs = {
  namespace: { type: 'string' as const, description: 'namespace' },
  json: { type: 'boolean' as const, description: 'machine readable' },
};

describe('parseFlags', () => {
  test('reads a string flag, a boolean flag and the positionals apart', () => {
    const parsed = parseFlags(['local', '--namespace', 'work', '--json'], specs);

    assert.equal(stringFlag(parsed, 'namespace'), 'work');
    assert.equal(booleanFlag(parsed, 'json'), true);
    assert.deepEqual(parsed.positionals, ['local']);
  });

  test('an unknown flag is a usage error instead of being ignored', () => {
    try {
      parseFlags(['--nonsense'], specs);
      assert.fail('an unknown flag should not pass');
    } catch (error) {
      assert.ok(isCliError(error));
      assert.equal(error.exitCode, 1);
    }
  });

  test('a flag that expects a value refuses to be last', () => {
    assert.throws(() => parseFlags(['--namespace'], specs));
  });
});

describe('positional arguments', () => {
  test('exactly one is required where the command takes one', () => {
    assert.equal(requiredPositional(parseFlags(['local'], specs), 'namespace'), 'local');
    assert.throws(() => requiredPositional(parseFlags([], specs), 'namespace'));
    assert.throws(() => requiredPositional(parseFlags(['a', 'b'], specs), 'namespace'));
  });

  test('a command that takes none refuses an extra argument', () => {
    noPositionals(parseFlags([], specs));
    assert.throws(() => noPositionals(parseFlags(['extra'], specs)));
  });
});
