import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { ArgumentsHost } from '@nestjs/common';
import { CatalogRepository } from '../../dal/repositories/catalog.repository.js';
import { CredentialsRepository } from '../../dal/repositories/credentials.repository.js';
import { CREDENTIAL_SECRET_SALT_ID, InstallKeysRepository } from '../../dal/repositories/install-keys.repository.js';
import { PoliciesRepository } from '../../dal/repositories/policies.repository.js';
import { createTestDatabase, type TestDatabase } from '../../dal/testing/test-database.js';
import { randomSecret, testKeySource } from '../../dal/testing/secret-fixtures.js';
import { CatalogService } from '../../bll/catalog/catalog.service.js';
import { CredentialService } from '../../bll/credentials/credential.service.js';
import { registerSecret } from '../../bll/credentials/redaction.js';
import { InvalidInputError } from '../../bll/errors.js';
import { ProviderRegistry } from '../../bll/providers/provider-registry.js';
import { createFakeAdapter } from '../../bll/testing/fake-adapter.js';
import type { ApiErrorBody } from '../../types/api.js';
import { ApiErrorFilter } from '../api-error.filter.js';
import { CredentialsController } from './credentials.controller.js';

describe('CredentialsController', () => {
  let database: TestDatabase;
  let credentials: CredentialsRepository;
  let controller: CredentialsController;

  beforeEach(() => {
    database = createTestDatabase();
    credentials = new CredentialsRepository(database.db);
    const installKeys = new InstallKeysRepository(database.db);
    const keySource = testKeySource(() => installKeys.readOrCreate(CREDENTIAL_SECRET_SALT_ID));
    const registry = new ProviderRegistry([createFakeAdapter({ authKinds: ['none', 'api_key'] })]);

    controller = new CredentialsController(
      new CredentialService(credentials, registry, keySource),
      new CatalogService(
        credentials,
        new CatalogRepository(database.db),
        new PoliciesRepository(database.db),
        registry,
        keySource,
      ),
    );
  });

  afterEach(() => {
    database.dispose();
  });

  it('answers the created credential with the hint and no secret', () => {
    const secret = randomSecret();

    const created = controller.create({
      namespace: 'cloud',
      providerId: 'ollama',
      baseUrl: 'https://api.example.test',
      authKind: 'api_key',
      secret,
    });
    const body = JSON.stringify(created);

    assert.equal(created.secretHint, secret.slice(-4));
    assert.equal(body.includes(secret), false);
    assert.equal(controller.list().some((credential) => JSON.stringify(credential).includes(secret)), false);
  });

  it('rotates through the endpoint and answers with the new hint only', () => {
    const first = `${randomSecret()}0000`;
    const second = `${randomSecret()}1111`;
    const created = controller.create({
      namespace: 'cloud',
      providerId: 'ollama',
      baseUrl: 'https://api.example.test',
      authKind: 'api_key',
      secret: first,
    });

    const rotated = controller.rotateSecret({ id: created.id }, { secret: second });

    assert.equal(rotated.id, created.id);
    assert.equal(rotated.secretHint, '1111');
    assert.equal(JSON.stringify(rotated).includes(second), false);
    assert.equal(JSON.stringify(rotated).includes(first), false);
  });

  it('keeps every error body secret free, even when the failure carries the value', () => {
    const secret = randomSecret();
    registerSecret(secret);

    const resolved = new ApiErrorFilter();
    const replies: ApiErrorBody[] = [];
    const logged: string[] = [];
    const original = process.stderr.write.bind(process.stderr);
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({
          status: () => ({
            send: (body: ApiErrorBody) => {
              replies.push(body);
            },
          }),
        }),
      }),
    } as unknown as ArgumentsHost;

    process.stderr.write = (chunk: string | Uint8Array): boolean => {
      logged.push(String(chunk));
      return true;
    };

    try {
      resolved.catch(new InvalidInputError(`rejected ${secret} because it does not fit`), host);
      resolved.catch(new Error(`internal failure near ${secret}`), host);
    } finally {
      process.stderr.write = original;
    }

    assert.equal(replies.length, 2);
    assert.deepEqual(
      replies.map((reply) => reply.error.code),
      ['invalid_input', 'internal_error'],
    );

    for (const reply of replies) {
      assert.equal(JSON.stringify(reply).includes(secret), false);
    }

    assert.equal(logged.join('').includes(secret), false);
  });
});
