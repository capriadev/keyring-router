import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { describe } from 'node:test';
import { buildServiceDefinition, missingEntryPoint, serviceEnvironment } from './definition.js';

function fakeRoot(withBackend: boolean): string {
  const root = mkdtempSync(join(tmpdir(), 'kr-service-'));

  if (withBackend) {
    const target = join(root, 'apps', 'backend', 'dist');

    // The definition points at apps/backend/dist/main.js, so the check needs something to find there.
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'main.js'), '// built backend', 'utf8');
  }

  return root;
}

describe('serviceEnvironment', () => {
  test('carries the variables the gateway boots with, and only those', () => {
    const env = serviceEnvironment({
      root: 'C:/repo',
      nodePath: 'node',
      environment: {
        KR_SECRET_PEPPER: 'pepper',
        KR_PORT: '4310',
        UNRELATED: 'ignored',
        KR_DB_PATH: '',
      },
    });

    assert.deepEqual(env, [
      { name: 'KR_PORT', value: '4310' },
      { name: 'KR_SECRET_PEPPER', value: 'pepper' },
    ]);
  });

  test('a flag replaces the value of the file with the same name instead of duplicating it', () => {
    const env = serviceEnvironment({
      root: 'C:/repo',
      nodePath: 'node',
      environment: { KR_PORT: '4310' },
      port: '4399',
      dbPath: 'C:/data/kr.db',
    });

    assert.deepEqual(env, [
      { name: 'KR_PORT', value: '4399' },
      { name: 'KR_DB_PATH', value: 'C:/data/kr.db' },
    ]);
  });
});

describe('buildServiceDefinition', () => {
  test('runs the built backend from the repository root and keeps a restart policy', () => {
    const root = fakeRoot(false);
    const definition = buildServiceDefinition({ root, nodePath: 'node', environment: {} });

    assert.equal(definition.script, join(root, 'apps', 'backend', 'dist', 'main.js'));
    assert.equal(definition.workingDirectory, root);
    assert.equal(definition.logDirectory, join(root, 'logs', 'gateway'));
    assert.equal(definition.waitSeconds, 5);
    assert.ok(definition.maxRestarts > 0, 'a crash has to be retried, not ignored');
  });

  test('an unbuilt backend fails the install instead of installing a service that cannot boot', () => {
    const definition = buildServiceDefinition({ root: fakeRoot(false), nodePath: 'node', environment: {} });

    assert.match(String(missingEntryPoint(definition)), /build:backend/);
  });

  test('a built backend passes the check', () => {
    const definition = buildServiceDefinition({ root: fakeRoot(true), nodePath: 'node', environment: {} });

    assert.equal(missingEntryPoint(definition), null);
  });
});


describe('serviceEnvironment', () => {
  test('carries the variables the gateway boots with, and only those', () => {
    const env = serviceEnvironment({
      root: 'C:/repo',
      nodePath: 'node',
      environment: {
        KR_SECRET_PEPPER: 'pepper',
        KR_PORT: '4310',
        UNRELATED: 'ignored',
        KR_DB_PATH: '',
      },
    });

    assert.deepEqual(env, [
      { name: 'KR_PORT', value: '4310' },
      { name: 'KR_SECRET_PEPPER', value: 'pepper' },
    ]);
  });

  test('a flag overrides the value the file declared', () => {
    const env = serviceEnvironment({
      root: 'C:/repo',
      nodePath: 'node',
      environment: { KR_PORT: '4310' },
      port: '4399',
      dbPath: 'C:/data/kr.db',
    });

    assert.deepEqual(env, [
      { name: 'KR_PORT', value: '4399' },
      { name: 'KR_PORT', value: '4399' },
      { name: 'KR_DB_PATH', value: 'C:/data/kr.db' },
    ].filter((entry, index, all) => all.findIndex((other) => other.name === entry.name && other.value === entry.value) === index));
  });
});

describe('buildServiceDefinition', () => {
  test('runs the built backend from the repository root and keeps a restart policy', () => {
    const root = fakeRoot(false);
    const definition = buildServiceDefinition({ root, nodePath: 'node', environment: {} });

    assert.equal(definition.script, join(root, 'apps', 'backend', 'dist', 'main.js'));
    assert.equal(definition.workingDirectory, root);
    assert.equal(definition.logDirectory, join(root, 'logs', 'gateway'));
    assert.equal(definition.waitSeconds, 5);
    assert.ok(definition.maxRestarts > 0, 'a crash has to be retried, not ignored');
  });

  test('an unbuilt backend fails the install instead of installing a service that cannot boot', () => {
    const definition = buildServiceDefinition({ root: fakeRoot(false), nodePath: 'node', environment: {} });

    assert.match(String(missingEntryPoint(definition)), /build:backend/);
  });

  test('a built backend passes the check', () => {
    const definition = buildServiceDefinition({ root: fakeRoot(true), nodePath: 'node', environment: {} });

    assert.equal(missingEntryPoint(definition), null);
  });
});
