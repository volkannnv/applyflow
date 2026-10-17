import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';
import { createPostgresDatabase } from '../server/database.mjs';
import { randomUUID } from 'node:crypto';
const origin = 'http://127.0.0.1:5173';
const password = 'test-only-long-password-42';
const application = {
  id: 'shared-id',
  company: 'Test',
  role: 'Frontend',
  location: 'İstanbul',
  workType: 'Uzaktan',
  stage: 'saved',
  date: '2026-10-15',
  interviewAt: '',
  url: '',
  notes: 'Private A',
  color: '#287565',
};
async function fixture(t, options = {}) {
  let database;
  let databaseUrl;
  let cleanup = async () => {};
  if (process.env.TEST_DATABASE_URL) {
    const { Pool } = await import('pg');
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const schema = 'test_' + randomUUID().replaceAll('-', '');
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set('options', `-c search_path=${schema}`);
    databaseUrl = url.toString();
    cleanup = async () => {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    };
    try {
      database = await createPostgresDatabase(url.toString());
    } catch (error) {
      await cleanup();
      throw error;
    }
  }
  let app = createApp({ origins: [origin], database, ...options });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  t.after(async () => {
    app.server.closeAllConnections();
    await new Promise((resolve) => app.server.close(resolve));
    await app.closeDatabase();
    await cleanup();
  });
  let base = `http://127.0.0.1:${app.server.address().port}`;
  return {
    ...app,
    async restart() {
      app.server.closeAllConnections();
      await new Promise((resolve) => app.server.close(resolve));
      await app.closeDatabase();
      database = await createPostgresDatabase(databaseUrl);
      app = createApp({ origins: [origin], database, ...options });
      app.server.listen(0, '127.0.0.1');
      await once(app.server, 'listening');
      base = `http://127.0.0.1:${app.server.address().port}`;
    },
    async request(path, { method = 'GET', body, cookie, headers = {} } = {}) {
      const response = await fetch(base + '/api' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Origin: origin,
          'X-ApplyFlow-Request': '1',
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      return {
        status: response.status,
        data,
        cookie: response.headers.get('set-cookie')?.split(';')[0],
        rawCookie: response.headers.get('set-cookie'),
      };
    },
  };
}
async function register(f, email = 'a@example.test') {
  const r = await f.request('/auth/register', {
    method: 'POST',
    body: { email, name: 'Test User', password },
  });
  assert.equal(r.status, 201);
  return r;
}
test('accounts are isolated, writes are atomic, stale revisions cannot overwrite data', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/applications')).status, 401);
  const a = await register(f),
    b = await register(f, 'b@example.test');
  assert.match(a.rawCookie, /HttpOnly/);
  assert.match(a.rawCookie, /SameSite=Lax/);
  const stored = await f.db
    .prepare('SELECT password_hash FROM users WHERE email=?')
    .get('a@example.test');
  assert.notEqual(stored.password_hash, password);
  assert.ok(stored.password_hash.includes(':'));
  assert.notEqual(
    (await f.db.prepare('SELECT token_hash FROM sessions LIMIT 1').get()).token_hash,
    a.cookie.split('=')[1],
  );
  const save = await f.request('/applications', {
    method: 'PUT',
    cookie: a.cookie,
    body: { applications: [application], revision: 0 },
  });
  assert.equal(save.status, 200);
  assert.equal(save.data.revision, 1);
  assert.deepEqual((await f.request('/applications', { cookie: b.cookie })).data.applications, []);
  // Same record ID in another account is an independent record, never an ownership claim.
  assert.equal(
    (
      await f.request('/applications', {
        method: 'PUT',
        cookie: b.cookie,
        body: {
          applications: [{ ...application, notes: 'Private B' }],
          revision: 0,
          user_id: a.data.user.id,
        },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request('/applications', { cookie: a.cookie })).data.applications[0].notes,
    'Private A',
  );
  const stale = await f.request('/applications', {
    method: 'PUT',
    cookie: a.cookie,
    body: { applications: [], revision: 0 },
  });
  assert.equal(stale.status, 409);
  assert.equal(
    (await f.request('/applications', { cookie: a.cookie })).data.applications.length,
    1,
  );
  const invalid = await f.request('/applications', {
    method: 'PUT',
    cookie: a.cookie,
    body: { applications: [{ ...application, stage: 'bogus' }], revision: 1 },
  });
  assert.equal(invalid.status, 400);
  assert.equal((await f.request('/applications', { cookie: a.cookie })).data.revision, 1);
  const changed = await f.request('/applications', {
    method: 'PUT',
    cookie: a.cookie,
    body: {
      applications: [{ ...application, stage: 'interview', interviewAt: '2026-10-22T15:00' }],
      revision: 1,
    },
  });
  assert.equal(changed.data.applications[0].stage, 'interview');
  assert.equal(
    (
      await f.request('/applications', {
        method: 'PUT',
        cookie: a.cookie,
        body: { applications: [], revision: 2 },
      })
    ).status,
    200,
  );
  assert.equal(
    (await f.request('/applications', { cookie: b.cookie })).data.applications[0].notes,
    'Private B',
  );
});
test('login, expiration, logout, password change and CSRF checks', async (t) => {
  const f = await fixture(t);
  const a = await register(f);
  assert.equal(
    (
      await f.request('/auth/register', {
        method: 'POST',
        body: { email: 'short@example.test', name: 'Test', password: 'short' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request('/auth/login', {
        method: 'POST',
        body: { email: 'a@example.test', password: 'wrong' },
      })
    ).status,
    401,
  );
  const login = await f.request('/auth/login', {
    method: 'POST',
    body: { email: 'A@EXAMPLE.TEST', password },
  });
  assert.equal(login.status, 200);
  assert.equal(
    (await f.request('/auth/me', { cookie: login.cookie })).data.user.email,
    'a@example.test',
  );
  assert.equal(
    (
      await f.request('/applications', {
        method: 'PUT',
        cookie: a.cookie,
        headers: { Origin: 'https://evil.example' },
        body: { applications: [], revision: 0 },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/auth/logout', {
        method: 'POST',
        cookie: a.cookie,
        headers: { 'X-ApplyFlow-Request': '' },
        body: {},
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await f.request('/auth/password', {
        method: 'POST',
        cookie: a.cookie,
        body: { currentPassword: 'wrong', newPassword: password + 'new' },
      })
    ).status,
    400,
  );
  const changed = await f.request('/auth/password', {
    method: 'POST',
    cookie: a.cookie,
    body: { currentPassword: password, newPassword: password + 'new' },
  });
  assert.equal(changed.status, 200);
  assert.equal((await f.request('/auth/me', { cookie: login.cookie })).status, 401);
  assert.equal((await f.request('/auth/me', { cookie: a.cookie })).status, 401);
  assert.equal((await f.request('/auth/me', { cookie: changed.cookie })).status, 200);
  assert.equal(
    (
      await f.request('/auth/login', {
        method: 'POST',
        body: { email: 'a@example.test', password },
      })
    ).status,
    401,
  );
  const newLogin = await f.request('/auth/login', {
    method: 'POST',
    body: { email: 'a@example.test', password: password + 'new' },
  });
  assert.equal(newLogin.status, 200);
  await f.request('/auth/logout', { method: 'POST', cookie: newLogin.cookie, body: {} });
  assert.equal((await f.request('/auth/me', { cookie: newLogin.cookie })).status, 401);
  await f.db.prepare('UPDATE sessions SET expires_at=0').run();
  assert.equal((await f.request('/auth/me', { cookie: changed.cookie })).status, 401);
});
test('auth attempts are rate limited and production cookies are secure', async (t) => {
  const f = await fixture(t, { authLimit: 1, secureCookies: true });
  const a = await register(f);
  assert.match(a.rawCookie, /Secure/);
  assert.equal(
    (
      await f.request('/auth/login', {
        method: 'POST',
        body: { email: 'a@example.test', password },
      })
    ).status,
    429,
  );
});
test('duplicate accounts are rejected and concurrent writes have exactly one winner', async (t) => {
  const f = await fixture(t);
  const a = await register(f);
  assert.equal(
    (
      await f.request('/auth/register', {
        method: 'POST',
        body: { email: 'A@EXAMPLE.TEST', name: 'Duplicate', password },
      })
    ).status,
    409,
  );
  const writes = await Promise.all(
    ['First', 'Second'].map((notes) =>
      f.request('/applications', {
        method: 'PUT',
        cookie: a.cookie,
        body: { applications: [{ ...application, notes }], revision: 0 },
      }),
    ),
  );
  assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
  const winner = writes.find((r) => r.status === 200);
  const current = await f.request('/applications', { cookie: a.cookie });
  assert.deepEqual(current.data, winner.data);
});
test('a database constraint failure rolls back the whole transaction', async (t) => {
  const f = await fixture(t);
  const a = await register(f);
  await assert.rejects(
    f.database.transaction(async (connection) => {
      await connection
        .prepare('UPDATE users SET revision=revision+1 WHERE id=?')
        .run(a.data.user.id);
      await connection
        .prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
        .run('test-token', 'nonexistent-user', Date.now());
    }),
  );
  assert.equal((await f.request('/applications', { cookie: a.cookie })).data.revision, 0);
  assert.equal(
    await f.db.prepare('SELECT * FROM sessions WHERE token_hash=?').get('test-token'),
    undefined,
  );
});
test(
  'PostgreSQL accounts, sessions and records survive an app restart',
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async (t) => {
    const f = await fixture(t);
    const a = await register(f);
    const saved = await f.request('/applications', {
      method: 'PUT',
      cookie: a.cookie,
      body: { applications: [application], revision: 0 },
    });
    assert.equal(saved.status, 200);
    await f.restart();
    assert.equal(
      (await f.request('/auth/me', { cookie: a.cookie })).data.user.email,
      'a@example.test',
    );
    assert.deepEqual((await f.request('/applications', { cookie: a.cookie })).data, saved.data);
  },
);
test('records persist after the SQLite connection is reopened', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'applyflow-test-'));
  const path = join(dir, 'test.sqlite');
  const first = createApp({ databasePath: path });
  first.db
    .prepare('INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)')
    .run('u', 'test@example.test', 'Test', 'test-hash');
  first.db
    .prepare(
      'INSERT INTO applications(user_id,id,company,role,location,work_type,stage,application_date,color,position) VALUES(?,?,?,?,?,?,?,?,?,?)',
    )
    .run('u', 'a', 'Company', 'Role', '', 'Uzaktan', 'saved', '2026-10-15', '#287565', 0);
  first.db.close();
  const second = createApp({ databasePath: path });
  assert.equal(
    second.db.prepare('SELECT count(*) AS n FROM applications WHERE user_id=?').get('u').n,
    1,
  );
  second.db.close();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
});
