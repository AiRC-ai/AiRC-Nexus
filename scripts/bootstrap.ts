import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from '../packages/db/index.js';
import { migrate } from './migrate.js';

export async function bootstrap(directory = '.nexus', appPort = 4318, small = false) {
  const root = resolve(directory);
  await mkdir(resolve(root, 'secrets'), { recursive: true, mode: 0o700 });
  const secretPath = resolve(root, 'secrets/database.json');
  const secrets = existsSync(secretPath)
    ? JSON.parse(await readFile(secretPath, 'utf8'))
    : {
        admin: randomBytes(24).toString('hex'),
        app: randomBytes(24).toString('hex'),
        worker: randomBytes(24).toString('hex'),
      };
  secrets.federation ??= randomBytes(24).toString('hex');
  await writeFile(secretPath, JSON.stringify(secrets), { mode: 0o600 });
  const passwordPath = resolve(root, 'secrets/postgres-password');
  await writeFile(passwordPath, secrets.admin, { mode: 0o600 });
  const suffix = createHash('sha256')
    .update(directory === '.nexus' ? process.cwd() : process.cwd() + root)
    .digest('hex')
    .slice(0, 8);
  const container = `airc-nexus-pg-${suffix}`;
  function docker(args: string[]) {
    const r = spawnSync('docker', args, { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Docker operation failed: ${args[0]}`);
    return r.stdout.trim();
  }
  const probe = spawnSync('docker', ['inspect', container], { encoding: 'utf8' });
  if (probe.status === 0) {
    docker(['start', container]);
  } else {
    await mkdir(resolve(root, 'postgres-data'), { recursive: true, mode: 0o700 });
    docker([
      'run',
      '-d',
      '--name',
      container,
      '--label',
      `ai.airc.nexus.workspace=${suffix}`,
      '--cpus',
      small ? '1' : '2',
      '--memory',
      small ? '768m' : '2g',
      '-p',
      '127.0.0.1::5432',
      '-e',
      'POSTGRES_DB=nexus',
      '-e',
      'POSTGRES_PASSWORD_FILE=/run/secrets/pg-password',
      '-v',
      `${passwordPath}:/run/secrets/pg-password:ro`,
      '-v',
      `${resolve(root, 'postgres-data')}:/var/lib/postgresql`,
      'postgres:18.7@sha256:2ea8630df176ad090ec92136dee850397c5af8781e4bcf2e4162593691c61bbc',
    ]);
  }
  const mapped = docker(['port', container, '5432/tcp']);
  const port = Number(mapped.match(/:(\d+)$/)?.[1]);
  if (!Number.isInteger(port)) throw new Error('Cannot resolve task-owned database port');
  const url = (user: string, password: string) =>
    `postgresql://${user}:${password}@127.0.0.1:${port}/nexus`;
  const config = {
    admin_url: url('postgres', secrets.admin),
    app_url: url('nexus_app', secrets.app),
    worker_url: url('nexus_worker', secrets.worker),
    federation_url: url('nexus_federation', secrets.federation),
    container,
    port: appPort,
    origin: `http://127.0.0.1:${appPort}`,
  };
  await writeFile(resolve(root, 'local.json'), JSON.stringify(config, null, 2) + '\n', {
    mode: 0o600,
  });
  const pool = createPool(config.admin_url);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        await pool.query('SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (!ready) throw new Error('Database did not become ready');
    for (const [role, password] of [
      ['nexus_app', secrets.app],
      ['nexus_worker', secrets.worker],
      ['nexus_federation', secrets.federation],
    ]) {
      if (!/^[a-f0-9]{48}$/.test(password))
        throw new Error('Invalid stored development credential');
      const exists = await pool.query('SELECT rolcanlogin FROM pg_roles WHERE rolname=$1', [role]);
      if (!exists.rowCount)
        await pool.query(
          `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
        );
      else if (role === 'nexus_federation' && !exists.rows[0].rolcanlogin)
        await pool.query(`ALTER ROLE nexus_federation LOGIN PASSWORD '${password}'`);
    }
    await migrate(pool);
    console.log(
      'Task-owned PostgreSQL 18 is ready; app/worker roles are separate and non-superuser.',
    );
    console.log('Local credentials are stored only in .nexus (ignored by Git).');
  } finally {
    await pool.end();
  }
  return config;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await bootstrap();
