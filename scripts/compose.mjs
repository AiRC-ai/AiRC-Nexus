import { mkdir, readFile, writeFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const directory = resolve('.nexus/compose');
const envPath = resolve(directory, 'compose.env');
const run = (args) =>
  new Promise((accept, reject) => {
    const child = spawn('docker', ['compose', '--env-file', envPath, ...args], {
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0 ? accept() : reject(new Error('Compose operation failed')),
    );
  });
if (process.argv.includes('--stop')) {
  if (!existsSync(envPath)) throw new Error('No task-owned Compose setup exists.');
  await run(['down']);
} else {
  await mkdir(resolve(directory, 'secrets'), { recursive: true, mode: 0o700 });
  await mkdir(resolve(directory, 'operator'), { recursive: true, mode: 0o700 });
  const secrets = {};
  for (const name of ['postgres', 'app', 'worker']) {
    const path = resolve(directory, `secrets/${name}-password`);
    secrets[name] = existsSync(path)
      ? (await readFile(path, 'utf8')).trim()
      : randomBytes(24).toString('hex');
    if (existsSync(path)) await chmod(path, 0o600);
    await writeFile(path, secrets[name], { mode: 0o600 });
    // Parent directory is 0700; a read-only mount must also be readable by the container's node UID.
    await chmod(path, 0o444);
  }
  for (const role of ['app', 'worker']) {
    const path = resolve(directory, `secrets/${role}-url`);
    if (existsSync(path)) await chmod(path, 0o600);
    await writeFile(path, `postgresql://nexus_${role}:${secrets[role]}@database:5432/nexus`, {
      mode: 0o600,
    });
    await chmod(path, 0o444);
  }
  const suffix = createHash('sha256').update(process.cwd()).digest('hex').slice(0, 8);
  await writeFile(
    envPath,
    `NEXUS_COMPOSE_PROJECT=airc-nexus-compose-${suffix}\nNEXUS_HTTP_PORT=4319\nNEXUS_OPERATOR_UID=${process.getuid?.() ?? 1000}\nNEXUS_OPERATOR_GID=${process.getgid?.() ?? 1000}\n`,
    { mode: 0o600 },
  );
  await run(['build', 'app']);
  await run(['up', '-d', '--wait', 'database']);
  await run(['run', '--rm', 'init']);
  await run(['up', '-d', '--wait', 'app', 'worker']);
  const response = await fetch('http://127.0.0.1:4319/health', {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok || (await response.json()).mode !== 'local-demo')
    throw new Error('Compose host-loopback health check failed.');
  console.log(
    'Isolated Compose demo ready at http://127.0.0.1:4319. Stop with npm run compose:stop; its database volume is retained.',
  );
}
