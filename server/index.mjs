import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.mjs';
import { createPostgresDatabase } from './database.mjs';
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 3001);
const configuredOrigins = process.env.APP_ORIGINS || process.env.RENDER_EXTERNAL_URL;
const origins = (
  configuredOrigins ||
  'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:3001,http://localhost:3001'
)
  .split(',')
  .map((s) => s.trim());
if (production && (!configuredOrigins || origins.some((o) => !o.startsWith('https://'))))
  throw Error('Production requires HTTPS APP_ORIGINS.');
const databasePath = resolve(process.env.DATABASE_PATH || 'data/applyflow.sqlite');
if (production && !process.env.DATABASE_URL)
  throw Error('Production requires a PostgreSQL DATABASE_URL.');
const database = process.env.DATABASE_URL
  ? await createPostgresDatabase(process.env.DATABASE_URL)
  : undefined;
if (!database) mkdirSync(dirname(databasePath), { recursive: true });
const { server, closeDatabase } = createApp({
  database,
  databasePath,
  origins,
  secureCookies: production,
  serveStatic: true,
});
server.listen(port, process.env.HOST || '127.0.0.1', () =>
  console.log(`ApplyFlow API: http://127.0.0.1:${port}`),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await closeDatabase();
      process.exit(0);
    }),
  );
