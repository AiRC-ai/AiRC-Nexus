import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, type Pool } from '../packages/db/index.js';
import { loadConfig } from '../packages/core/config.js';

export async function migrate(pool: Pool) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(4318001)');
    await db.query(
      'CREATE TABLE IF NOT EXISTS public.nexus_migrations(version integer PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const directory = resolve('packages/db/migrations');
    const files = (await readdir(directory)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    for (const file of files) {
      const version = Number(file.split('_')[0]);
      const existing = await db.query('SELECT 1 FROM public.nexus_migrations WHERE version=$1', [
        version,
      ]);
      if (existing.rowCount) continue;
      await db.query(await readFile(resolve(directory, file), 'utf8'));
      await db.query('INSERT INTO public.nexus_migrations(version) VALUES($1)', [version]);
    }
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = createPool((await loadConfig()).admin_url);
  try {
    await migrate(pool);
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
}
