import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const directory = resolve('.nexus/federation'),
  pidFile = resolve(directory, 'processes.json');
const services = {};
for (const name of ['north', 'south'])
  for (const role of ['server', 'worker', 'federation']) {
    const root = resolve(directory, name);
    services[`${name}-${role}`] = {
      file: resolve(`dist/apps/${role}/main.js`),
      root,
      role,
      marker: '--nexus-instance=' + createHash('sha256').update(root).digest('hex').slice(0, 12),
    };
  }
const owns = (pid, key) =>
  Number.isInteger(pid) &&
  services[key] &&
  (() => {
    const cmd =
      spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).stdout ?? '';
    return cmd.includes(services[key].file) && cmd.includes(services[key].marker);
  })();
let previous = {};
try {
  previous = JSON.parse(await readFile(pidFile, 'utf8'));
} catch {}
async function stop(pids) {
  for (const [key, pid] of Object.entries(pids)) if (owns(pid, key)) process.kill(pid, 'SIGTERM');
  for (let i = 0; i < 60 && Object.entries(pids).some(([key, pid]) => owns(pid, key)); i++)
    await new Promise((r) => setTimeout(r, 100));
  if (Object.entries(pids).some(([key, pid]) => owns(pid, key)))
    throw new Error('A task-owned federation child has not stopped.');
}
if (process.argv.includes('--stop')) {
  await stop(previous);
  await rm(pidFile, { force: true });
  console.log('Stopped only the task-owned federation services; database data is retained.');
} else {
  await stop(previous);
  const pids = {};
  try {
    for (const [key, service] of Object.entries(services)) {
      if (!existsSync(service.file) || !existsSync(resolve(service.root, 'identity.json')))
        throw new Error('Build and run federation:setup first.');
      await mkdir(resolve(service.root, 'logs'), { recursive: true, mode: 0o700 });
      const fd = openSync(resolve(service.root, `logs/${service.role}.log`), 'a', 0o600);
      const child = spawn(process.execPath, [service.file, service.marker], {
        cwd: process.cwd(),
        detached: true,
        stdio: ['ignore', fd, fd],
        env: {
          PATH: process.env.PATH ?? '',
          NEXUS_CONFIG_FILE: resolve(service.root, `runtime-${service.role}.json`),
          ...(service.role !== 'worker'
            ? { NEXUS_FEDERATION_IDENTITY: resolve(service.root, 'identity.json') }
            : {}),
        },
      });
      await new Promise((accept, reject) => {
        child.once('spawn', accept);
        child.once('error', reject);
      });
      closeSync(fd);
      pids[key] = child.pid;
      child.unref();
    }
    await writeFile(pidFile, JSON.stringify(pids, null, 2) + '\n', { mode: 0o600 });
    for (const port of [4320, 4322]) {
      let ready = false;
      for (let i = 0; i < 40; i++) {
        if (!Object.entries(pids).every(([key, pid]) => owns(pid, key)))
          throw new Error('A federation child stopped during startup.');
        try {
          const r = await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(1000),
          });
          if (r.ok) {
            ready = true;
            break;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 250));
      }
      if (!ready) throw new Error('A federation node did not become ready.');
    }
    console.log(
      'Northern Commons: http://north.localhost:4320 · Southern Commons: http://south.localhost:4322',
    );
    console.log(
      'Two node APIs, review workers and federation verifiers are running. Import/export remain opt-in.',
    );
  } catch (error) {
    await stop(pids);
    await rm(pidFile, { force: true });
    throw error;
  }
}
