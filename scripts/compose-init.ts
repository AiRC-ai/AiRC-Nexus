import { readFile } from 'node:fs/promises';
import { createPool } from '../packages/db/index.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { seedDemoExchange } from './seed-exchange.js';

const passwords = await Promise.all(
  ['postgres', 'app', 'worker'].map(async (name) =>
    (await readFile(`/run/secrets/${name}_password`, 'utf8')).trim(),
  ),
);
if (passwords.some((p) => !/^[a-f0-9]{48}$/.test(p))) throw new Error('invalid_setup_secret');
const admin = createPool(`postgresql://postgres:${passwords[0]}@database:5432/nexus`);
try {
  for (const [i, role] of ['nexus_app', 'nexus_worker'].entries()) {
    const exists = await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (!exists.rowCount)
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${passwords[i + 1]}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
  }
  await migrate(admin);
  await seed(admin);
  const app = createPool(`postgresql://nexus_app:${passwords[1]}@database:5432/nexus`);
  try {
    await seedDemoExchange(app);
  } finally {
    await app.end();
  }
  console.log(
    'Initialized the isolated Compose demo, separate roles and authored corpus. Operator codes are in .nexus/compose/operator/access.json.',
  );
} finally {
  await admin.end();
}
