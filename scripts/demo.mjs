import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd(),
  pidFile = resolve('.nexus/processes.json');
const roles = {
  server: resolve('dist/apps/server/main.js'),
  worker: resolve('dist/apps/worker/main.js'),
};
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function owns(pid, role) {
  if (!Number.isInteger(pid) || !roles[role]) return false;
  const command =
    spawnSync('ps', ['-p', String(pid), '-o', 'args='], { encoding: 'utf8' }).stdout ?? '';
  return command.includes(roles[role]);
}
let previous = {};
try {
  previous = JSON.parse(await readFile(pidFile, 'utf8'));
} catch {}
async function stop(pair) {
  for (const [role, pid] of Object.entries(pair))
    if (owns(pid, role) && alive(pid)) process.kill(pid, 'SIGTERM');
  for (
    let i = 0;
    i < 40 && Object.entries(pair).some(([role, pid]) => owns(pid, role) && alive(pid));
    i++
  )
    await new Promise((r) => setTimeout(r, 100));
  if (Object.entries(pair).some(([role, pid]) => owns(pid, role) && alive(pid)))
    throw new Error('A task-owned service did not stop; inspect .nexus/logs before retrying.');
}
if (process.argv.includes('--stop')) {
  await stop(previous);
  await rm(pidFile, { force: true });
  console.log('Stopped task-owned Nexus services.');
} else {
  if (Object.keys(roles).every((role) => owns(previous[role], role) && alive(previous[role]))) {
    console.log('Nexus services are already running.');
    process.exit(0);
  }
  // Recover a partially stopped pair without leaving the surviving child behind.
  await stop(previous);
  await mkdir('.nexus/logs', { recursive: true, mode: 0o700 });
  const pinned = resolve('.nexus/runtime/node-v24.22.3-darwin-arm64/bin/node');
  const node = existsSync(pinned) ? pinned : process.execPath;
  const started = {};
  try {
    for (const [role, file] of Object.entries(roles)) {
      if (!existsSync(file)) throw new Error('Build the prototype first.');
      const log = openSync(resolve(`.nexus/logs/${role}.log`), 'a', 0o600);
      const child = spawn(node, [file], { cwd: root, detached: true, stdio: ['ignore', log, log] });
      await new Promise((accept, reject) => {
        child.once('spawn', accept);
        child.once('error', reject);
      });
      closeSync(log);
      started[role] = child.pid;
      child.unref();
    }
    await writeFile(pidFile, JSON.stringify(started, null, 2) + '\n', { mode: 0o600 });
    const config = JSON.parse(await readFile('.nexus/local.json', 'utf8'));
    let ready = false;
    for (let i = 0; i < 20; i++) {
      if (!alive(started.server) || !alive(started.worker))
        throw new Error('A prototype service stopped during startup.');
      try {
        const r = await fetch(`http://127.0.0.1:${config.port}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        const body = await r.json();
        if (body.mode === 'local-demo') {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!ready) throw new Error('Prototype health check did not become ready.');
    console.log(`AiRC Nexus is ready at http://127.0.0.1:${config.port}`);
    console.log('Local sign-in codes are in .nexus/access.json. Stop with npm run demo:stop.');
  } catch (error) {
    for (const [role, pid] of Object.entries(started))
      if (owns(pid, role) && alive(pid)) process.kill(pid, 'SIGTERM');
    await rm(pidFile, { force: true });
    console.error(error.message);
    process.exitCode = 1;
  }
}
