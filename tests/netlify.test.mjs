import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSqliteDatabase, createPostgresDatabase } from '../server/database.mjs';
import { createNetlifyHandler } from '../server/netlify.mjs';

const origin = 'https://applyflow-test.netlify.app';
const password = 'test-only-long-password-42';

async function fixture(t, authLimit = 20) {
  let database;
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = await import('pg');
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schema = 'test_' + randomUUID().replaceAll('-', '');
    await admin.query(`CREATE SCHEMA ${schema}`);
    t.after(async () => {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    });
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    // A new deployment may cold-start several instances against an empty database.
    const connections = await Promise.all([
      createPostgresDatabase(url.toString(), { max: 2 }),
      createPostgresDatabase(url.toString(), { max: 2 }),
    ]);
    database = connections[0];
    t.after(async () => {
      for (const connection of connections) await connection.close();
    });
  } else {
    database = createSqliteDatabase(':memory:');
    t.after(() => database.close());
  }
  let initializations = 0;
  const getDatabase = async () => {
    initializations++;
    return database;
  };
  const handler = createNetlifyHandler({ getDatabase, authLimit });
  const second = createNetlifyHandler({ getDatabase, authLimit });
  return {
    database,
    handler,
    second,
    get initializations() {
      return initializations;
    },
    async request(
      path,
      {
        method = 'GET',
        body,
        cookie,
        ip = '192.0.2.1',
        headers = {},
        use = handler,
        url = origin,
      } = {},
    ) {
      return use(
        new Request(url + '/api' + path, {
          method,
          headers: {
            Origin: url,
            'Content-Type': 'application/json',
            'X-ApplyFlow-Request': '1',
            ...(cookie ? { Cookie: cookie } : {}),
            ...headers,
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
        { ip },
      );
    },
  };
}

test('Functions preserve sessions and records across instances and deployment URLs', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/health')).status, 200);
  assert.equal((await f.request('/auth/me')).status, 401);
  const registered = await f.request('/auth/register', {
    method: 'POST',
    body: { email: 'demo@example.test', name: 'Demo', password },
  });
  assert.equal(registered.status, 201);
  const rawCookie = registered.headers.get('set-cookie');
  assert.match(rawCookie, /HttpOnly/);
  assert.match(rawCookie, /SameSite=Lax/);
  assert.match(rawCookie, /; Secure/);
  assert.equal(registered.headers.get('cache-control'), 'no-store');
  const cookie = rawCookie.split(';')[0];
  const item = {
    id: 'demo',
    company: 'Demo',
    role: 'Developer',
    location: 'İstanbul',
    workType: 'Uzaktan',
    stage: 'saved',
    date: '2026-10-18',
    interviewAt: '',
    url: '',
    notes: 'Türkçe kayıt ✓',
    color: '#287565',
  };
  const saved = await f.request('/applications', {
    method: 'PUT',
    cookie,
    body: { applications: [item], revision: 0 },
  });
  assert.equal(saved.status, 200);
  const read = await f.request('/applications', { cookie, use: f.second });
  assert.deepEqual(await read.json(), { applications: [item], revision: 1 });
  const stale = await f.request('/applications', {
    method: 'PUT',
    cookie,
    use: f.second,
    body: { applications: [], revision: 0 },
  });
  assert.equal(stale.status, 409);
  const login = await f.request('/auth/login', {
    method: 'POST',
    body: { email: 'demo@example.test', password },
    url: 'https://new-name.netlify.app',
    use: f.second,
  });
  assert.equal(login.status, 200);
  assert.equal(f.initializations, 2);
  const logout = await f.request('/auth/logout', { method: 'POST', cookie, body: {} });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await f.request('/auth/me', { cookie, use: f.second })).status, 401);
});

test('Functions enforce CSRF and streamed body limits', async (t) => {
  const f = await fixture(t);
  const body = { email: 'demo@example.test', name: 'Demo', password };
  for (const headers of [
    { Origin: 'https://evil.example' },
    { Origin: 'null' },
    { 'X-ApplyFlow-Request': '' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { Origin: 'https://evil.example', 'X-Forwarded-Host': 'evil.example' },
  ]) {
    const response = await f.request('/auth/register', { method: 'POST', body, headers });
    assert.equal(response.status, 403);
  }
  assert.equal(
    (
      await f.request('/auth/register', {
        method: 'POST',
        body,
        url: 'http://applyflow-test.netlify.app',
      })
    ).status,
    403,
  );
  const tooLarge = await f.request('/auth/register', {
    method: 'POST',
    body: { ...body, name: 'x'.repeat(5_000_001) },
  });
  assert.equal(tooLarge.status, 413);
  const malformed = await f.handler(
    new Request(origin + '/api/auth/register', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-ApplyFlow-Request': '1' },
      body: '{',
    }),
    { ip: '192.0.2.1' },
  );
  assert.equal(malformed.status, 400);
});

test('auth rate limits survive new instances, ignore spoofed IP headers, and expire', async (t) => {
  const f = await fixture(t, 1);
  const body = { email: 'missing@example.test', password };
  assert.equal((await f.request('/auth/login', { method: 'POST', body })).status, 401);
  assert.equal(
    (
      await f.request('/auth/login', {
        method: 'POST',
        body,
        use: f.second,
        headers: { 'X-Forwarded-For': '192.0.2.99', 'X-Nf-Client-Connection-Ip': '192.0.2.99' },
      })
    ).status,
    429,
  );
  assert.equal(
    (await f.request('/auth/login', { method: 'POST', body, ip: '192.0.2.2' })).status,
    401,
  );
  await f.database.prepare('UPDATE auth_attempts SET expires_at=0').run();
  assert.equal((await f.request('/auth/login', { method: 'POST', body })).status, 401);
});

test('concurrent first requests share initialization and failed initialization can retry', async (t) => {
  const db = createSqliteDatabase(':memory:');
  t.after(() => db.close());
  let attempts = 0;
  const handler = createNetlifyHandler({
    getDatabase: async () => {
      if (++attempts === 1) throw Error('unavailable');
      return db;
    },
  });
  const request = () => handler(new Request(origin + '/api/health'), { ip: '192.0.2.1' });
  const failed = await request();
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get('cache-control'), 'no-store');
  assert.equal((await failed.text()).includes('unavailable'), false);
  const responses = await Promise.all([request(), request(), request()]);
  assert.ok(responses.every((response) => response.status === 200));
  assert.equal(attempts, 2);
});
