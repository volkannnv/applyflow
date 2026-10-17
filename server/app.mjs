import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { isApplication, safeUrl } from '../src/lib/model.ts';

const derive = promisify(scrypt);
const sessionLifetime = 7 * 24 * 60 * 60;
const cookieName = 'applyflow_session';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });
const httpError = (status, message) => Object.assign(new Error(message), { status });
const passwordValid = (p) => typeof p === 'string' && p.length >= 12 && p.length <= 128;
async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64);
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password, encoded) {
  const [salt, hash] = encoded.split(':');
  const key = await derive(password, salt, 64);
  return timingSafeEqual(Buffer.from(hash, 'hex'), key);
}
async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw httpError(415, 'JSON verisi bekleniyor.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5_000_000) throw httpError(413, 'Dosya en fazla 5 MB olabilir.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
    return value;
  } catch {
    throw httpError(400, 'Geçersiz JSON verisi.');
  }
}
export function validateApplications(items) {
  if (
    !Array.isArray(items) ||
    items.length > 1000 ||
    new Set(items.map((a) => a?.id)).size !== items.length
  )
    throw httpError(400, 'En fazla 1000 benzersiz başvuru kaydedebilirsin.');
  for (const a of items) {
    if (a && typeof a.date === 'string' && Number.isNaN(new Date(a.date + 'T12:00:00Z').getTime()))
      throw httpError(400, 'Geçersiz başvuru tarihi.');
    if (
      !isApplication(a) ||
      !a.id ||
      a.id.length > 100 ||
      !a.company.trim() ||
      a.company.length > 80 ||
      !a.role.trim() ||
      a.role.length > 120 ||
      a.location.length > 100 ||
      a.notes.length > 6000 ||
      a.url.length > 2048 ||
      (a.url && !safeUrl(a.url)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(a.date) ||
      new Date(a.date + 'T12:00:00Z').toISOString().slice(0, 10) !== a.date ||
      (a.interviewAt && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a.interviewAt))
    )
      throw httpError(400, 'Başvuru bilgileri geçersiz veya alan sınırlarını aşıyor.');
  }
  return items;
}
export function createApp({
  databasePath = ':memory:',
  origins = ['http://127.0.0.1:5173'],
  secureCookies = false,
  serveStatic = false,
  authLimit = 20,
} = {}) {
  const db = new DatabaseSync(databasePath);
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const limiter = new Map();
  // A dummy hash makes nonexistent-account login perform the same password work.
  const dummyHash = hashPassword(randomBytes(32).toString('hex'));
  const cookie = (token, age = sessionLifetime) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secureCookies ? '; Secure' : ''}`;
  function createSession(userId) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(
      digest(token),
      userId,
      Date.now() + sessionLifetime * 1000,
    );
    return cookie(token);
  }
  function authenticate(req) {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    if (!token || token.length > 100) return null;
    return (
      db
        .prepare(
          'SELECT users.*, sessions.token_hash FROM sessions JOIN users ON users.id=sessions.user_id WHERE token_hash=? AND expires_at>?',
        )
        .get(digest(token), Date.now()) ?? null
    );
  }
  function list(userId) {
    return db
      .prepare(
        `SELECT id,company,role,location,work_type AS workType,stage,application_date AS date,interview_at AS interviewAt,url,notes,color FROM applications WHERE user_id=? ORDER BY position`,
      )
      .all(userId);
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    const send = (status, data, headers = {}) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        ...headers,
      });
      res.end(JSON.stringify(data));
    };
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!path.startsWith('/api/')) {
        if (!serveStatic || !['GET', 'HEAD'].includes(req.method))
          throw httpError(404, 'Sayfa bulunamadı.');
        let file = resolve(root, '.' + decodeURIComponent(path));
        if (file !== root && !file.startsWith(root + sep))
          throw httpError(404, 'Sayfa bulunamadı.');
        if (!existsSync(file) || !statSync(file).isFile()) file = resolve(root, 'index.html');
        if (!existsSync(file)) throw httpError(404, 'Önce pnpm build komutunu çalıştır.');
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.css': 'text/css; charset=utf-8',
          '.svg': 'image/svg+xml',
          '.png': 'image/png',
        };
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        );
        res.writeHead(200, {
          'Content-Type': types[extname(file)] || 'application/octet-stream',
          'Cache-Control': extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600',
        });
        if (req.method === 'HEAD') return res.end();
        createReadStream(file).pipe(res);
        return;
      }
      // The custom header is required on every mutation, including login CSRF.
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (
          req.headers['x-applyflow-request'] !== '1' ||
          !origins.includes(req.headers.origin) ||
          req.headers['sec-fetch-site'] === 'cross-site'
        )
          throw httpError(403, 'İstek kaynağı doğrulanamadı.');
      }
      if (path === '/api/health' && req.method === 'GET') return send(200, { ok: true });
      if (
        ['/api/auth/register', '/api/auth/login', '/api/auth/password'].includes(path) &&
        req.method === 'POST'
      ) {
        const key = req.socket.remoteAddress;
        const now = Date.now();
        for (const [ip, entry] of limiter) if (entry.until < now) limiter.delete(ip);
        const entry = limiter.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
        if (++entry.count > authLimit)
          throw httpError(429, 'Çok fazla deneme. 15 dakika sonra tekrar dene.');
        limiter.set(key, entry);
      }
      if (path === '/api/auth/register' && req.method === 'POST') {
        const { email, name, password } = await readJson(req);
        if (
          typeof email !== 'string' ||
          email.length > 254 ||
          !/^\S+@\S+\.\S+$/.test(email.trim()) ||
          typeof name !== 'string' ||
          !name.trim() ||
          name.trim().length > 80 ||
          !passwordValid(password)
        )
          throw httpError(400, 'Geçerli bir ad, e-posta ve 12–128 karakterli parola gir.');
        const normalized = email.trim().toLowerCase();
        const hash = await hashPassword(password);
        const user = { id: randomUUID(), email: normalized, name: name.trim() };
        try {
          db.prepare('INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)').run(
            user.id,
            user.email,
            user.name,
            hash,
          );
        } catch (e) {
          if (e.code?.startsWith('ERR_SQLITE'))
            throw httpError(409, 'Bu e-posta ile hesap oluşturulamadı. Giriş yapmayı dene.');
          throw e;
        }
        return send(201, { user }, { 'Set-Cookie': createSession(user.id) });
      }
      if (path === '/api/auth/login' && req.method === 'POST') {
        const { email, password } = await readJson(req);
        if (
          typeof email !== 'string' ||
          email.length > 254 ||
          typeof password !== 'string' ||
          password.length > 128
        )
          throw httpError(400, 'E-posta ve parolanı kontrol et.');
        const user = db
          .prepare('SELECT * FROM users WHERE email=?')
          .get(email.trim().toLowerCase());
        if (!(await verifyPassword(password, user?.password_hash ?? (await dummyHash))) || !user)
          throw httpError(401, 'E-posta veya parola hatalı.');
        return send(200, { user: publicUser(user) }, { 'Set-Cookie': createSession(user.id) });
      }
      const user = authenticate(req);
      if (!user) throw httpError(401, 'Devam etmek için giriş yap.');
      if (path === '/api/auth/me' && req.method === 'GET')
        return send(200, { user: publicUser(user) });
      if (path === '/api/auth/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE token_hash=?').run(user.token_hash);
        return send(200, { ok: true }, { 'Set-Cookie': cookie('', 0) });
      }
      if (path === '/api/auth/password' && req.method === 'POST') {
        const { currentPassword, newPassword } = await readJson(req);
        if (
          typeof currentPassword !== 'string' ||
          currentPassword.length > 128 ||
          !passwordValid(newPassword)
        )
          throw httpError(400, 'Yeni parola 12–128 karakter olmalı.');
        if (!(await verifyPassword(currentPassword, user.password_hash)))
          throw httpError(400, 'Mevcut parola hatalı.');
        const hash = await hashPassword(newPassword);
        db.exec('BEGIN IMMEDIATE');
        try {
          const changed = db
            .prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=?')
            .run(hash, user.id, user.password_hash);
          if (!changed.changes)
            throw httpError(409, 'Parolan başka bir oturumda değişti. Yeniden giriş yap.');
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
        return send(200, { ok: true }, { 'Set-Cookie': createSession(user.id) });
      }
      if (path === '/api/applications' && req.method === 'GET')
        return send(200, { applications: list(user.id), revision: user.revision });
      if (path === '/api/applications' && req.method === 'PUT') {
        const body = await readJson(req);
        const items = validateApplications(body.applications);
        if (!Number.isSafeInteger(body.revision) || body.revision < 0)
          throw httpError(400, 'Geçersiz kayıt sürümü.');
        db.exec('BEGIN IMMEDIATE');
        try {
          const result = db
            .prepare('UPDATE users SET revision=revision+1 WHERE id=? AND revision=?')
            .run(user.id, body.revision);
          if (!result.changes)
            throw httpError(
              409,
              'Başvurular başka bir sekmede değişti. Son verileri yeniden yükleyip işlemi tekrarla.',
            );
          db.prepare('DELETE FROM applications WHERE user_id=?').run(user.id);
          const insert = db.prepare(
            'INSERT INTO applications(user_id,id,company,role,location,work_type,stage,application_date,interview_at,url,notes,color,position) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
          );
          items.forEach((a, i) =>
            insert.run(
              user.id,
              a.id,
              a.company.trim(),
              a.role.trim(),
              a.location,
              a.workType,
              a.stage,
              a.date,
              a.interviewAt,
              a.url,
              a.notes,
              a.color,
              i,
            ),
          );
          db.exec('COMMIT');
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
        return send(200, { applications: list(user.id), revision: body.revision + 1 });
      }
      throw httpError(404, 'İşlem bulunamadı.');
    } catch (e) {
      if (res.headersSent) return res.destroy();
      const status = e.status || 500;
      if (status === 500) console.error('ApplyFlow API error:', e.code || e.name);
      send(status, {
        error: status === 500 ? 'Sunucuda bir sorun oluştu. Lütfen tekrar dene.' : e.message,
      });
    }
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return { server, db };
}
