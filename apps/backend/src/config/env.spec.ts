import assert from 'node:assert/strict';
import { isAbsolute, join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { DEFAULT_DB_PATH, DEFAULT_HOST, DEFAULT_PORT, loadEnv } from './env.js';
import { REPO_ROOT } from './paths.js';

describe('loadEnv', () => {
  it('defaults to loopback, port 4310 and the repository data folder', () => {
    const env = loadEnv({});

    assert.equal(env.host, DEFAULT_HOST);
    assert.equal(env.port, DEFAULT_PORT);
    assert.equal(isAbsolute(env.dbPath), true);
    assert.equal(env.dbPath, join(REPO_ROOT, DEFAULT_DB_PATH));
  });

  it('reads an explicit host, port and database path', () => {
    assert.deepEqual(loadEnv({ KR_HOST: '0.0.0.0', KR_PORT: '5000', KR_DB_PATH: 'temp/other.db' }), {
      host: '0.0.0.0',
      port: 5000,
      dbPath: resolve(REPO_ROOT, 'temp/other.db'),
      routingMode: 'normal',
      routingCascade: [],
    });
    assert.equal(loadEnv({ KR_DB_PATH: '/tmp/absolute.db' }).dbPath, resolve('/tmp/absolute.db'));
  });

  it('defaults the routing mode to normal, so an installation is unchanged until it opts in', () => {
    const env = loadEnv({});

    assert.equal(env.routingMode, 'normal');
    assert.deepEqual(env.routingCascade, []);
  });

  it('reads the routing mode and the cascade, trimming entries and dropping empties', () => {
    const env = loadEnv({
      KR_ROUTING_MODE: 'auto_model',
      KR_ROUTING_CASCADE: 'gpt-6-luna, meta/llama-3 ,, ',
    });

    assert.equal(env.routingMode, 'auto_model');
    // A provider model id carries slashes of its own, so an entry is kept whole and never split.
    assert.deepEqual(env.routingCascade, ['gpt-6-luna', 'meta/llama-3']);
  });

  it('rejects an unknown routing mode by name', () => {
    assert.throws(() => loadEnv({ KR_ROUTING_MODE: 'auto_everything' }), /KR_ROUTING_MODE/);
  });

  it('ignores unrelated variables', () => {
    assert.equal(loadEnv({ PATH: 'C:\\Windows', NODE_ENV: 'test' }).port, DEFAULT_PORT);
  });

  it('rejects unreadable values without echoing them', () => {
    assert.throws(() => loadEnv({ KR_PORT: 'abc' }), /KR_PORT/);
    assert.throws(() => loadEnv({ KR_PORT: '0' }), /KR_PORT/);
    assert.throws(() => loadEnv({ KR_PORT: '70000' }), /KR_PORT/);
    assert.throws(() => loadEnv({ KR_HOST: '' }), /KR_HOST/);
    assert.throws(() => loadEnv({ KR_DB_PATH: '' }), /KR_DB_PATH/);
  });
});
