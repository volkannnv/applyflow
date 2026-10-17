import { resolve } from 'node:path';
import { createApi } from './app.mjs';
import { createPostgresDatabase } from './database.mjs';
import { createFetchAdapter } from './fetch-adapter.mjs';

async function productionDatabase() {
  if (!process.env.DATABASE_URL) throw Error('DATABASE_URL is required.');
  return createPostgresDatabase(process.env.DATABASE_URL, {
    schemaPath: resolve(process.cwd(), 'server/schema.postgres.sql'),
    max: 2,
  });
}

export function createNetlifyHandler({ getDatabase = productionDatabase, authLimit = 20 } = {}) {
  // Reuse the pool in warm instances; retry initialization after a failed cold start.
  let pending;
  const initialize = async () => {
    const database = await getDatabase();
    const api = createApi({
      database,
      secureCookies: true,
      authLimit,
      // Netlify supplies the public request URL. Never trust forwarded host headers
      // or accept the caller's Origin as configuration.
      origins: (origin, req) => {
        const url = new URL(req.url);
        return url.protocol === 'https:' && origin === url.origin;
      },
    });
    return createFetchAdapter(api.handler);
  };
  return async (request, context) => {
    try {
      pending ??= initialize().catch((error) => {
        pending = undefined;
        throw error;
      });
      const handle = await pending;
      // context.ip is provided by Netlify, unlike client-supplied IP headers.
      return await handle(request, context.ip);
    } catch (error) {
      console.error('ApplyFlow Function error:', error.code || error.name);
      return Response.json(
        { error: 'Sunucuya bağlanılamadı. Lütfen tekrar dene.' },
        {
          status: 503,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }
  };
}
