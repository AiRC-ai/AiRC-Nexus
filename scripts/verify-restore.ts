import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, stat, readFile, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createHash, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { loadConfig } from '../packages/core/config.js';
import { createPool } from '../packages/db/index.js';
import { Store } from '../packages/core/store.js';
import { ANONYMOUS } from '../packages/contracts/index.js';
import { recordId } from '../fixtures/records.js';

const config = await loadConfig();
if (!/^airc-nexus-pg-[a-f0-9]{8}$/.test(config.container))
  throw new Error('task_owned_database_required');
const database = `nexus_restore_${randomBytes(6).toString('hex')}`;
const management = createPool(config.admin_url);
const databaseUrl = (url: string) => {
  const parsed = new URL(url);
  parsed.pathname = '/' + database;
  return parsed.toString();
};
const restoredAdmin = createPool(databaseUrl(config.admin_url));
const restoredApp = createPool(databaseUrl(config.app_url));
const directory = '.nexus/backups';
await mkdir(directory, { recursive: true, mode: 0o700 });
const path = `${directory}/nexus-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;
const run = async (args: string[], input?: string, output?: string) => {
  const child = spawn(
    'docker',
    [
      'exec',
      '-i',
      config.container,
      'sh',
      '-c',
      'export PGPASSWORD="$(cat /run/secrets/pg-password)"; exec "$@"',
      'sh',
      ...args,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );
  // Keep database diagnostics out of terminal output: they can contain privileged context.
  child.stderr.resume();
  const ended = new Promise<void>((accept, reject) => {
    child.once('error', () => reject(new Error('database_backup_process_failed')));
    child.once('close', (code) =>
      code === 0 ? accept() : reject(new Error('database_backup_process_failed')),
    );
  });
  const pipes: Promise<unknown>[] = [ended];
  if (input) pipes.push(pipeline(createReadStream(input), child.stdin));
  else child.stdin.end();
  if (output)
    pipes.push(pipeline(child.stdout, createWriteStream(output, { flags: 'wx', mode: 0o600 })));
  else child.stdout.resume();
  await Promise.all(pipes);
};
const identity = async (pool: ReturnType<typeof createPool>) =>
  (
    await pool.query(`
  SELECT (SELECT count(*) FROM nexus.records)::integer AS records,
    (SELECT count(*) FROM nexus.record_revisions)::integer AS revisions,
    (SELECT md5(string_agg(id::text||digest,',' ORDER BY id)) FROM nexus.record_revisions) AS revision_fingerprint`)
  ).rows[0];
let created = false;
try {
  const before = await identity(management);
  await run(
    ['pg_dump', '-U', 'postgres', '--format=custom', '--no-owner', '--dbname=nexus'],
    undefined,
    path,
  );
  await management.query(`CREATE DATABASE ${database} TEMPLATE template0`);
  created = true;
  await run(
    ['pg_restore', '-U', 'postgres', '--no-owner', '--exit-on-error', '--dbname', database],
    path,
  );
  assert.deepEqual(await identity(restoredAdmin), before);
  const roles = await restoredAdmin.query(
    "SELECT rolname,rolsuper,rolbypassrls FROM pg_roles WHERE rolname IN ('nexus_app','nexus_worker')",
  );
  assert.equal(roles.rowCount, 2);
  assert.ok(roles.rows.every((r) => !r.rolsuper && !r.rolbypassrls));
  const policies = await restoredAdmin.query(
    "SELECT relname,relrowsecurity,relforcerowsecurity FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='nexus' AND relname IN ('records','record_revisions','help_requests','help_replies')",
  );
  assert.equal(policies.rowCount, 4);
  assert.ok(policies.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity));
  const store = new Store(restoredApp);
  assert.equal((await store.get(ANONYMOUS, recordId(1))).id, recordId(1));
  await assert.rejects(store.get(ANONYMOUS, recordId(101)));
  await assert.rejects(store.get(ANONYMOUS, recordId(106)));
  const result = {
    passed: true,
    records: before.records,
    revisions: before.revisions,
    protected_tables_checked: 4,
    restored_nonprivileged_roles: 2,
    anonymous_private_and_team_reads_denied: true,
    dump_bytes: (await stat(path)).size,
    dump_sha256: createHash('sha256')
      .update(await readFile(path))
      .digest('hex'),
    backup: path,
    scope:
      'Local authored demo PostgreSQL dump restored into a temporary database; no outside backup service or disaster-recovery claim.',
  };
  await mkdir('.nexus/evaluations', { recursive: true, mode: 0o700 });
  await writeFile(
    '.nexus/evaluations/backup-restore.json',
    JSON.stringify(result, null, 2) + '\n',
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result));
} finally {
  await Promise.all([restoredAdmin.end(), restoredApp.end()]);
  if (created) await management.query(`DROP DATABASE ${database} WITH (FORCE)`);
  await management.end();
}
