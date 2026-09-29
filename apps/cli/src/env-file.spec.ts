import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { describe } from 'node:test';
import { gatewayEnvironment, readEnvFile } from './env-file.js';

function envFile(content: string): string {
  const root = mkdtempSync(join(tmpdir(), 'kr-env-'));

  writeFileSync(join(root, '.env'), content, 'utf8');

  return root;
}

describe('readEnvFile', () => {
  test('reads assignments, skips comments and blank lines, and unwraps quotes', () => {
    const root = envFile(['# a comment', '', 'KR_PORT=4310', 'KR_SECRET_PEPPER="abc="', "KR_DB_PATH='data.db'"].join('\n'));

    assert.deepEqual(readEnvFile(root), {
      KR_PORT: '4310',
      KR_SECRET_PEPPER: 'abc=',
      KR_DB_PATH: 'data.db',
    });
  });

  test('a missing file is not an error: a fresh checkout has no .env yet', () => {
    assert.deepEqual(readEnvFile(mkdtempSync(join(tmpdir(), 'kr-env-'))), {});
  });

  test('a line without an assignment is skipped instead of guessed', () => {
    assert.deepEqual(readEnvFile(envFile('not an assignment\nKR_PORT=1')), { KR_PORT: '1' });
  });
});

describe('gatewayEnvironment', () => {
  test('the file wins over the inherited environment and the flags win over the file', () => {
    const root = envFile('KR_PORT=1111\nKR_HOST=0.0.0.0');
    const previous = process.env.KR_PORT;
    process.env.KR_PORT = '2222';

    try {
      const fromFile = gatewayEnvironment(root, {});
      assert.equal(fromFile.KR_PORT, '1111');
      assert.equal(fromFile.KR_HOST, '0.0.0.0');

      const withFlag = gatewayEnvironment(root, { KR_PORT: '3333' });
      assert.equal(withFlag.KR_PORT, '3333');
    } finally {
      if (previous === undefined) {
        delete process.env.KR_PORT;
      } else {
        process.env.KR_PORT = previous;
      }
    }
  });
});
