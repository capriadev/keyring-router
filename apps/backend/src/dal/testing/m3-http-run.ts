import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../../app.module.js';
import { ApiErrorFilter } from '../../gateway/api-error.filter.js';
import { runMigrations } from '../migrate.js';

/**
 * Temporary end to end run over a real socket: the gateway, its API, a stub provider that requires the
 * authorization header, and a database in a temp folder.
 */
const secret = randomBytes(24).toString('base64url');
const rotated = randomBytes(24).toString('base64url');
const directory = mkdtempSync(join(tmpdir(), 'kr-m3-e2e-'));
const dbPath = join(directory, 'e2e.db');
const seen: string[] = [];

const stub = createServer((request, response) => {
  const authorization = request.headers.authorization ?? '';

  seen.push(`${request.method} ${request.url} authorization=${authorization === '' ? '(none)' : authorization}`);

  if (!authorization.startsWith('Bearer ')) {
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'credential required' }));
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ data: [{ id: 'stub-model', owned_by: 'stub' }] }));
});

await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
const stubPort = (stub.address() as AddressInfo).port;

process.env.KR_DB_PATH = dbPath;
process.env.KR_HOST = '127.0.0.1';
process.env.KR_SECRET_PEPPER = randomBytes(32).toString('base64');

runMigrations(dbPath);

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
  // The default aborts the process, which loses the diagnostic on a boot failure.
  abortOnError: false,
  logger: false,
});

// Same as main.ts, so a failure answers with its stable code and message.
app.useGlobalFilters(new ApiErrorFilter());

await app.listen({ host: '127.0.0.1', port: 0 });

const base = await app.getUrl();

async function call(method: string, path: string, body?: unknown): Promise<{ status: number; text: string }> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return { status: response.status, text: await response.text() };
}

/** A verification harness, not a printer: it fails loudly when an invariant of spec 005 breaks. */
function expect(condition: boolean, label: string): void {
  if (!condition) {
    throw new Error(`FAILED: ${label}`);
  }

  console.log(`ok: ${label}`);
}

console.log(`gateway ${base}`);
console.log(`stub provider http://127.0.0.1:${stubPort}`);
console.log('--- CREATE api_key credential: POST /api/credentials ---');
const created = await call('POST', '/api/credentials', {
  namespace: 'cloud',
  providerId: 'agnes',
  baseUrl: `http://127.0.0.1:${stubPort}`,
  authKind: 'api_key',
  secret,
});
console.log(created.status, created.text);
expect(created.status === 201, 'POST /api/credentials with authKind api_key answers 201');
expect(created.text.includes(secret) === false, 'the created credential carries no secret');
expect(created.text.includes(secret.slice(-4)) === true, 'the created credential carries the hint');
const credentialId = (JSON.parse(created.text) as { id: string }).id;

console.log('--- LIST: GET /api/credentials ---');
const listed = await call('GET', '/api/credentials');
console.log(listed.status, listed.text);
expect(listed.status === 200, 'GET /api/credentials answers 200');
expect(listed.text.includes(secret) === false, 'the listing carries no secret');
expect(
  listed.text.includes('secretCiphertext') === false && listed.text.includes('secret_ciphertext') === false,
  'the listing exposes no ciphertext field',
);

console.log('--- VALIDATE: POST /api/credentials/:id/validate ---');
const validated = await call('POST', `/api/credentials/${credentialId}/validate`);
console.log(validated.status, validated.text);
console.log(`stub saw: ${seen.at(-1) ?? '(nothing)'}`);
expect(validated.status === 200 && validated.text.includes('"ok":true'), 'the provider accepted the credential');
expect(seen.at(-1) === `GET /v1/models authorization=Bearer ${secret}`, 'the stub received the decrypted secret');

console.log('--- REFRESH: POST /api/credentials/:id/refresh ---');
const refreshed = await call('POST', `/api/credentials/${credentialId}/refresh`);
console.log(refreshed.status, refreshed.text);
expect(refreshed.text.includes('"discovered":1'), 'the catalog of the credential was discovered');

console.log('--- CATALOG: GET /api/catalog ---');
const catalog = await call('GET', '/api/catalog');
console.log(catalog.status, catalog.text);
expect(catalog.text.includes('cloud/stub-model'), 'the discovered model is listed with its namespace');

console.log('--- ROTATE: PATCH /api/credentials/:id/secret ---');
const patch = await call('PATCH', `/api/credentials/${credentialId}/secret`, { secret: rotated });
console.log(patch.status, patch.text);
expect(patch.status === 200, 'PATCH /api/credentials/:id/secret answers 200');
expect(patch.text.includes(rotated) === false, 'the rotation answer carries no secret');
expect(patch.text.includes(rotated.slice(-4)) === true, 'the rotation answer carries the new hint');

console.log('--- VALIDATE again with the rotated secret ---');
const revalidated = await call('POST', `/api/credentials/${credentialId}/validate`);
console.log(revalidated.status, revalidated.text);
console.log(`stub saw: ${seen.at(-1) ?? '(nothing)'}`);
expect(seen.at(-1) === `GET /v1/models authorization=Bearer ${rotated}`, 'the stub received the rotated secret');

console.log('--- REJECTED: short secret in the body ---');
const rejected = await call('POST', '/api/credentials', {
  namespace: 'short-secret',
  providerId: 'agnes',
  baseUrl: `http://127.0.0.1:${stubPort}`,
  authKind: 'api_key',
  secret: 'corta',
});
console.log(rejected.status, rejected.text);
expect(rejected.status === 400, 'a short secret is refused with 400');
expect(rejected.text.includes('corta') === false, 'the refusal does not echo the value');

console.log('--- REJECTED: api_key without a secret ---');
const missing = await call('POST', '/api/credentials', {
  namespace: 'no-secret',
  providerId: 'agnes',
  baseUrl: `http://127.0.0.1:${stubPort}`,
  authKind: 'api_key',
});
console.log(missing.status, missing.text);
expect(missing.status === 400 && missing.text.includes('requires a secret'), 'api_key without a secret is refused');

console.log('--- unknown provider ---');
const unknown = await call('POST', '/api/credentials', {
  namespace: 'unknown-provider',
  providerId: 'not-a-provider',
  baseUrl: `http://127.0.0.1:${stubPort}`,
  authKind: 'none',
});
console.log(unknown.status, unknown.text);
expect(unknown.status === 400 && unknown.text.includes('unsupported_provider'), 'an unknown provider is refused by bll');

console.log('--- database file ---');
const fileBytes = readFileSync(dbPath).toString('latin1');
console.log(`path: ${dbPath}`);
console.log(`bytes: ${fileBytes.length}`);
console.log(`contains the namespace: ${fileBytes.includes('cloud')}`);
console.log(`contains the first hint: ${fileBytes.includes(secret.slice(-4))}`);
console.log(`contains the rotated hint: ${fileBytes.includes(rotated.slice(-4))}`);
console.log(`contains the secret: ${fileBytes.includes(secret)}`);
console.log(`contains the rotated secret: ${fileBytes.includes(rotated)}`);
expect(fileBytes.includes('cloud'), 'the database file holds the credential');
expect(fileBytes.includes(rotated.slice(-4)), 'the database file holds only the current hint');
expect(fileBytes.includes(secret) === false, 'the database file holds no plaintext secret');
expect(fileBytes.includes(rotated) === false, 'the database file holds no rotated plaintext secret');

console.log('--- WRONG PEPPER: the gateway starts, the credential fails as a credential problem ---');
const previousPepper = process.env.KR_SECRET_PEPPER ?? '';

await app.close();
process.env.KR_SECRET_PEPPER = randomBytes(32).toString('base64');

const wrongPepperApp = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
  abortOnError: false,
  logger: false,
});

wrongPepperApp.useGlobalFilters(new ApiErrorFilter());
await wrongPepperApp.listen({ host: '127.0.0.1', port: 0 });

const wrongBase = await wrongPepperApp.getUrl();
const wrongValidate = await fetch(`${wrongBase}/api/credentials/${credentialId}/validate`, { method: 'POST' });
const wrongText = await wrongValidate.text();

console.log(wrongValidate.status, wrongText);
expect(wrongValidate.status === 422, 'a wrong pepper answers 422 instead of crashing');
expect(wrongText.includes('secret_undecryptable'), 'a wrong pepper answers with the secret_undecryptable code');
expect(wrongText.includes(rotated) === false, 'the failure carries no secret');

const wrongList = await fetch(`${wrongBase}/api/credentials`);
await wrongList.text();

await wrongPepperApp.close();
process.env.KR_SECRET_PEPPER = previousPepper;

await new Promise<void>((resolve) => stub.close(() => resolve()));
rmSync(directory, { recursive: true, force: true });

console.log('M3 END TO END RUN: OK');

await app.close();
await new Promise<void>((resolve) => stub.close(() => resolve()));
rmSync(directory, { recursive: true, force: true });
