import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

// Both adapters expose the same async statements. Transactions own their connection
// until completion, so concurrent requests cannot interleave transaction statements.
function sqliteStatements(raw) {
  return {
    prepare(sql) {
      const statement = raw.prepare(sql);
      return Object.fromEntries(
        ['run', 'get', 'all'].map((method) => [
          method,
          (...params) => statement[method](...params),
        ]),
      );
    },
  };
}

export function createSqliteDatabase(path = ':memory:') {
  const raw = new DatabaseSync(path);
  raw.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  const statements = sqliteStatements(raw);
  let pending = Promise.resolve();
  const exclusive = (work) => {
    const result = pending.then(work);
    pending = result.catch(() => {});
    return result;
  };
  return {
    raw,
    prepare(sql) {
      return Object.fromEntries(
        ['run', 'get', 'all'].map((method) => [
          method,
          (...params) => exclusive(() => statements.prepare(sql)[method](...params)),
        ]),
      );
    },
    transaction(work) {
      return exclusive(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await work(statements);
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      });
    },
    close: () => exclusive(() => raw.close()),
  };
}

function postgresStatements(connection) {
  return {
    prepare(sql) {
      let index = 0;
      const query = sql.replace(/\?/g, () => `$${++index}`);
      return {
        async run(...params) {
          const result = await connection.query(query, params);
          return { changes: result.rowCount };
        },
        async get(...params) {
          return (await connection.query(query, params)).rows[0];
        },
        async all(...params) {
          return (await connection.query(query, params)).rows;
        },
      };
    },
  };
}

export async function createPostgresDatabase(
  connectionString,
  { schemaPath = new URL('./schema.postgres.sql', import.meta.url), max = 5 } = {},
) {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  pool.on('error', (error) =>
    console.error('PostgreSQL connection error:', error.code || error.name),
  );
  const database = {
    ...postgresStatements(pool),
    async transaction(work, { readOnly = false } = {}) {
      const client = await pool.connect();
      try {
        await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        const result = await work(postgresStatements(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
  try {
    // Cold starts can initialize concurrently. Serialize schema creation across instances.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(718314043)');
      await client.query(readFileSync(schemaPath, 'utf8'));
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    await pool.end();
    throw error;
  }
  return database;
}
