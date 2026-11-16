import { readFile } from 'node:fs/promises';
import { createPool } from '../packages/db/index.js';
import { migrate } from './migrate.js';
import { provisionHosted } from '../packages/federation/hosted.js';

const passwords = await Promise.all(
  ['postgres', 'app', 'worker', 'federation'].map(async (name) =>
    (await readFile(`/run/secrets/${name}_password`, 'utf8')).trim(),
  ),
);
if (passwords.some((v) => !/^[a-f0-9]{48}$/.test(v))) throw new Error('invalid_setup_secret');
const pool = createPool(`postgresql://postgres:${passwords[0]}@database:5432/nexus`);
try {
  for (const [i, role] of ['nexus_app', 'nexus_worker', 'nexus_federation'].entries()) {
    const exists = (await pool.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1', [role]))
      .rows[0];
    if (!exists)
      await pool.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${passwords[i + 1]}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
    else if (!exists.rolcanlogin)
      await pool.query(`ALTER ROLE ${role} LOGIN PASSWORD '${passwords[i + 1]}'`);
  }
  await migrate(pool);
  await provisionHosted(pool, {
    stateDir: '/state',
    origin: process.env.NEXUS_PUBLIC_ORIGIN ?? '',
    label: process.env.NEXUS_NODE_LABEL ?? '',
    operatorName: process.env.NEXUS_OPERATOR_NAME ?? '',
  });
  console.log(
    'Initialized this host’s separate operator, agent, signing identity and empty knowledge store.',
  );
} finally {
  await pool.end();
}
