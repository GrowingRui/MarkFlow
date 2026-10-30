// One query function for both databases: Neon Postgres when DATABASE_URL is set (production),
// otherwise PGlite, an embedded Postgres, stored in .data/pglite (or memory:// in tests).
import { SCHEMA } from './schema.js';

let pending;

function db() {
  pending ??= connect().catch(err => { pending = undefined; throw err; });
  return pending;
}

async function connect() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    return { query: (text, params = []) => sql.query(text, params) };
  }
  if (process.env.VERCEL) throw new Error('DATABASE_URL is not set.');
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  if (!dir.includes('://')) (await import('node:fs')).mkdirSync(dir, { recursive: true });
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dir);
  await pg.exec(SCHEMA);
  return { query: async (text, params = []) => (await pg.query(text, params)).rows };
}

export async function query(text, params) {
  return (await db()).query(text, params);
}
