/**
 * End to end run of the first slice over a real loopback socket, with stub providers and a temporary
 * database. This is the repository's own evidence: no external service, no developer data.
 *
 * Run with: npm run e2e --workspace apps/backend
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import {
  Checks,
  call,
  databaseBytes,
  startGateway,
  startStubProvider,
  temporaryDatabasePath,
} from './harness.js';

type Json = Record<string, any>;

const SECRET = 'e2e-live-0123456789abcdef-key';
const databasePath = temporaryDatabasePath();

process.env.KR_DB_PATH = databasePath;
process.env.KR_HOST = '127.0.0.1';
process.env.KR_SECRET_PEPPER = randomBytes(32).toString('base64');

const { runMigrations } = await import('../dal/migrate.js');

// Applying twice proves the migration is idempotent on an existing database.
runMigrations(databasePath);
runMigrations(databasePath);

const stub = await startStubProvider();
const guarded = await startStubProvider({ requireAuthorization: true, models: ['gpt-oss:20b'] });
const gateway = await startGateway();
const checks = new Checks();

const api = (method: string, path: string, payload?: unknown) =>
  call(gateway.baseUrl, method, path, payload);

let localId = '';
let cloudId = '';
let denyRuleId = '';

await checks.run('health answers ok on a real socket', async () => {
  const response = await api('GET', '/api/health');
  assert.equal(response.status, 200);
  assert.equal((response.body as Json).status, 'ok');
});

await checks.run('providers lists ollama', async () => {
  const response = await api('GET', '/api/providers');
  assert.equal(response.status, 200);
  const ids = (response.body as Json[]).map((entry) => entry.providerId);
  assert.ok(ids.includes('ollama'), `ollama missing from ${ids.length} providers`);
});

await checks.run('providers serves the whole catalog (spec 009 F1)', async () => {
  const response = await api('GET', '/api/providers');
  const providers = response.body as Json[];
  assert.ok(providers.length >= 100, `expected the catalog, got ${providers.length} entries`);
  const groq = providers.find((entry) => entry.providerId === 'groq');
  assert.ok(groq !== undefined, 'groq missing from the catalog listing');
  assert.equal(groq.format, 'openai');
  assert.ok(groq.modelCount > 0, 'a catalog entry must declare its model count');
});

await checks.run('create the no-auth local credential', async () => {
  const response = await api('POST', '/api/credentials', {
    namespace: 'local',
    providerId: 'ollama',
    baseUrl: `${stub.url}/`,
    authKind: 'none',
  });
  assert.equal(response.status, 201);
  assert.equal((response.body as Json).baseUrl, stub.url);
  localId = (response.body as Json).id;
});

await checks.run('create an api_key credential and never read the secret back', async () => {
  const response = await api('POST', '/api/credentials', {
    namespace: 'cloud',
    providerId: 'groq',
    baseUrl: `${guarded.url}/v1`,
    authKind: 'api_key',
    secret: SECRET,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const body = response.body as Json;
  cloudId = body.id;
  assert.equal(JSON.stringify(body).includes(SECRET), false, 'the response carried the secret');
  assert.equal('secretCiphertext' in body || 'secretIv' in body || 'secretTag' in body, false);
  assert.equal(typeof body.secretHint, 'string');
});

await checks.run('the database file holds no plaintext secret', () => {
  const bytes = databaseBytes(databasePath).toString('utf8');
  assert.equal(bytes.includes(SECRET), false, 'the secret is readable in the database file');
});

await checks.run('a Latin-1 secret is accepted and a non Latin-1 one is refused', async () => {
  const accepted = await api('POST', '/api/credentials', {
    namespace: 'latin1',
    providerId: 'groq',
    baseUrl: `${stub.url}/v1`,
    authKind: 'api_key',
    secret: 'clave-nandu-ñ-1234567890',
  });
  assert.equal(accepted.status, 201, JSON.stringify(accepted.body));

  const refused = await api('POST', '/api/credentials', {
    namespace: 'unicode-two',
    providerId: 'groq',
    baseUrl: `${stub.url}/v1`,
    authKind: 'api_key',
    secret: 'clave-日本語-1234567890',
  });
  assert.equal(refused.status, 400, 'a header-unrepresentable secret must be refused');
  assert.match(String((refused.body as Json).error.message), /Latin-1/);
});

await checks.run('a repeated namespace is refused', async () => {
  const response = await api('POST', '/api/credentials', {
    namespace: 'local',
    providerId: 'ollama',
    baseUrl: stub.url,
    authKind: 'none',
  });
  assert.equal(response.status, 409);
});

await checks.run('validate reaches the provider', async () => {
  const response = await api('POST', `/api/credentials/${localId}/validate`);
  assert.equal(response.status, 200);
  assert.equal((response.body as Json).ok, true);
});

await checks.run('the guarded provider receives the stored secret', async () => {
  const before = guarded.requests.length;
  const response = await api('POST', `/api/credentials/${cloudId}/validate`);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const seen = guarded.requests.slice(before).map((entry) => entry.headers.authorization);
  assert.ok(seen.some((value) => value === `Bearer ${SECRET}`), `headers: ${JSON.stringify(seen)}`);
});

await checks.run('refresh discovers the catalog and exposes nothing yet', async () => {
  const response = await api('POST', `/api/credentials/${localId}/refresh`);
  assert.equal(response.status, 200);
  assert.equal((response.body as Json).discovered, 2);
  assert.equal((response.body as Json).exposed, 0);
});

await checks.run('catalog shows the models as not exposed and models stays empty', async () => {
  const catalog = await api('GET', '/api/catalog');
  assert.equal(catalog.status, 200);
  const models = catalog.body as Json[];
  assert.equal(models.length, 2);
  assert.deepEqual(
    models.map((model) => model.exposed),
    [false, false],
  );
  assert.deepEqual(models.map((model) => model.namespacedId).sort(), [
    'local/llama3.2:3b',
    'local/qwen2.5:7b',
  ]);
  const exposed = await api('GET', '/api/models');
  assert.deepEqual(exposed.body, []);
});

await checks.run('an allow rule exposes the namespaced models', async () => {
  const created = await api('POST', '/api/policies', { pattern: 'local/*', effect: 'allow' });
  assert.equal(created.status, 201);
  const exposed = await api('GET', '/api/models');
  assert.deepEqual(
    (exposed.body as Json[]).map((model) => model.namespacedId).sort(),
    ['local/llama3.2:3b', 'local/qwen2.5:7b'],
  );
});

await checks.run('a deny rule beats the global allow', async () => {
  const created = await api('POST', '/api/policies', {
    pattern: 'local/qwen2.5:7b',
    effect: 'deny',
  });
  denyRuleId = (created.body as Json).id;
  const exposed = await api('GET', '/api/models');
  assert.deepEqual(
    (exposed.body as Json[]).map((model) => model.namespacedId),
    ['local/llama3.2:3b'],
  );
});

await checks.run('removing the deny rule restores the listing', async () => {
  const removed = await api('DELETE', `/api/policies/${denyRuleId}`);
  assert.equal(removed.status, 204);
  const exposed = await api('GET', '/api/models');
  assert.equal((exposed.body as Json[]).length, 2);
});

await checks.run('credentials are listed without any secret material', async () => {
  const response = await api('GET', '/api/credentials');
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(/ciphertext|secretIv|secretTag|secret_iv|secret_tag/i.test(serialized), false);
  assert.equal(serialized.includes('authKind'), true);
});

await checks.run('an invalid policy pattern is refused', async () => {
  const response = await api('POST', '/api/policies', { pattern: 'local/[a-z]*', effect: 'allow' });
  assert.equal(response.status, 400);
});

await checks.run('an unknown credential answers 404 with a stable code', async () => {
  const response = await api('POST', '/api/credentials/00000000-0000-0000-0000-000000000000/refresh');
  assert.equal(response.status, 404);
  assert.equal((response.body as Json).error.code, 'credential_not_found');
});

await checks.run('a broken provider answers 502 and stores a secret free error', async () => {
  stub.fail();
  const response = await api('POST', `/api/credentials/${localId}/refresh`);
  assert.equal(response.status, 502);
  assert.equal((response.body as Json).error.code, 'provider_failure');
  const listing = await api('GET', '/api/credentials');
  const broken = (listing.body as Json[]).find((credential) => credential.namespace === 'local');
  assert.ok(broken !== undefined, 'the local credential should still be listed');
  assert.equal(typeof broken.lastRefreshError, 'string');
  assert.equal(JSON.stringify(broken).includes(SECRET), false);
  stub.heal();
});

// The own API: the endpoint a client points at, over the same policy filtered listing.
const MODEL = 'local/qwen2.5:7b';

await checks.run('GET /v1/models serves the same set as /api/models', async () => {
  const openai = await api('GET', '/v1/models');
  const internal = await api('GET', '/api/models');
  assert.equal(openai.status, 200);
  const listed = (openai.body as Json).data.map((entry: Json) => entry.id).sort();
  const exposed = (internal.body as Json[]).map((model) => model.namespacedId).sort();
  assert.deepEqual(listed, exposed);
  assert.deepEqual(listed, ['local/llama3.2:3b', 'local/qwen2.5:7b']);
});

await checks.run('POST /v1/chat/completions answers in OpenAI shape', async () => {
  const response = await api('POST', '/v1/chat/completions', {
    model: MODEL,
    messages: [{ role: 'user', content: 'hola' }],
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const body = response.body as Json;
  assert.equal(body.object, 'chat.completion');
  assert.equal(body.model, MODEL);
  assert.equal(body.choices[0].message.content, 'hola desde el stub');
  assert.equal(body.choices[0].finish_reason, 'stop');
  assert.equal(body.usage.total_tokens, 7);
});

await checks.run('POST /v1/chat/completions streams SSE frames and the sentinel', async () => {
  const response = await fetch(`${gateway.baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, stream: true, messages: [{ role: 'user', content: 'hola' }] }),
  });
  assert.equal(response.status, 200);
  const text = await response.text();
  const frames = text
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data:'));
  assert.ok(frames.length >= 3, `expected frames, got: ${text}`);
  assert.equal(frames.at(-1), 'data: [DONE]');
  const joined = frames
    .map((frame) => frame.replace(/^data: /, ''))
    .filter((payload) => payload !== '[DONE]')
    .map((payload) => JSON.parse(payload) as Json)
    .map((frame) => frame.choices?.[0]?.delta?.content ?? '')
    .join('');
  assert.equal(joined, 'hola desde el stub');
});

await checks.run('POST /v1/messages answers a Claude shaped client', async () => {
  const response = await api('POST', '/v1/messages', {
    model: MODEL,
    max_tokens: 64,
    messages: [{ role: 'user', content: 'hola' }],
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const body = response.body as Json;
  assert.equal(body.type, 'message');
  assert.equal(body.role, 'assistant');
  assert.equal(body.content[0].text, 'hola desde el stub');
  assert.equal(body.stop_reason, 'end_turn');
});

await checks.run('a model the policy does not expose cannot be reached through /v1', async () => {
  const denied = await api('POST', '/api/policies', {
    pattern: 'local/llama3.2:3b',
    effect: 'deny',
  });
  assert.equal(denied.status, 201);
  const response = await api('POST', '/v1/chat/completions', {
    model: 'local/llama3.2:3b',
    messages: [{ role: 'user', content: 'hola' }],
  });
  assert.ok(response.status >= 400 && response.status < 500, `expected a refusal, got ${response.status}`);
  const removed = await api('DELETE', `/api/policies/${(denied.body as Json).id}`);
  assert.equal(removed.status, 204);
});

await gateway.close();
await stub.close();
await guarded.close();

// The run owns its database: leaving it behind would pile up files in the OS temp folder.
rmSync(databasePath, { force: true });

process.exit(checks.report() === 0 ? 0 : 1);

