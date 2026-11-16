import pg from 'pg';
import type { Principal } from '../contracts/index.js';
import { ANONYMOUS } from '../contracts/index.js';
import { createHash } from 'node:crypto';

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function createPool(connectionString: string) {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 5_000,
  });
}
export type Pool = pg.Pool;
export type Connection = pg.PoolClient;
export async function withActor<T>(
  pool: Pool,
  actor: Principal,
  fn: (db: Connection) => Promise<T>,
) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT set_config('nexus.principal_id', $1, true)", [actor.id]);
    const value = await fn(db);
    await db.query('COMMIT');
    return value;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    db.release();
  }
}
export async function authenticate(pool: Pool, token?: string): Promise<Principal | null> {
  if (!token) return ANONYMOUS;
  if (token.length > 256) return null;
  const { rows } = await pool.query('SELECT * FROM nexus.authenticate($1)', [tokenHash(token)]);
  return (rows[0] as Principal | undefined) ?? null;
}
