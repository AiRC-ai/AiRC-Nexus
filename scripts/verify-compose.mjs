import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const compose = ['compose', '--env-file', '.nexus/compose/compose.env'];
const roles = [];
for (const service of ['app', 'worker']) {
  const code = `import {loadConfig} from './dist/packages/core/config.js';
    import {createPool} from './dist/packages/db/index.js';
    import assert from 'node:assert/strict';
    const c=await loadConfig(); const service=${JSON.stringify(service)};
    assert.equal(c.admin_url,''); assert.equal(c[service==='app'?'worker_url':'app_url'],'');
    const p=createPool(c[service==='app'?'app_url':'worker_url']);
    try {
      const r=await p.query('SELECT current_user,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user');
      assert.equal(r.rows[0].rolsuper,false); assert.equal(r.rows[0].rolbypassrls,false);
      console.log(JSON.stringify({service,...r.rows[0],only_own_database_secret:true}));
    } finally {await p.end()}`;
  const run = spawnSync(
    'docker',
    [...compose, 'exec', '-T', service, 'node', '--input-type=module', '-e', code],
    { encoding: 'utf8', timeout: 15000 },
  );
  assert.equal(run.status, 0, `Compose ${service} role check failed; diagnostics suppressed.`);
  roles.push(JSON.parse(run.stdout));
}
const ids = spawnSync('docker', [...compose, 'ps', '-q', 'app', 'worker', 'database'], {
  encoding: 'utf8',
});
assert.equal(ids.status, 0);
const inspected = spawnSync('docker', ['inspect', ...ids.stdout.trim().split('\n')], {
  encoding: 'utf8',
});
assert.equal(inspected.status, 0);
// Deliberately omit environment, mount sources and raw container configuration.
const containers = JSON.parse(inspected.stdout).map((c) => ({
  service: c.Config.Labels['com.docker.compose.service'],
  read_only: c.HostConfig.ReadonlyRootfs,
  cap_drop: c.HostConfig.CapDrop,
  ports: c.NetworkSettings.Ports,
  image: c.Image,
}));
const database = containers.find((c) => c.service === 'database');
assert.ok(database && Object.values(database.ports).every((p) => p === null));
const app = containers.find((c) => c.service === 'app');
const bindings = Object.values(app.ports).flat().filter(Boolean);
assert.equal(bindings.length, 1);
assert.ok(bindings.every((p) => p.HostIp === '127.0.0.1' && p.HostPort === '4319'));
for (const c of containers.filter((c) => c.service !== 'database')) {
  assert.ok(c.read_only);
  assert.ok(c.cap_drop.includes('ALL'));
}
const response = await fetch('http://127.0.0.1:4319/health', { signal: AbortSignal.timeout(5000) });
assert.equal(response.status, 200);
assert.equal((await response.json()).mode, 'local-demo');
const result = {
  passed: true,
  roles,
  containers,
  loopback_app_only: true,
  database_not_published: true,
};
await mkdir('.nexus/evaluations', { recursive: true, mode: 0o700 });
await writeFile('.nexus/evaluations/compose.json', JSON.stringify(result, null, 2) + '\n', {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    passed: true,
    services_checked: containers.length,
    restricted_database_roles: roles.length,
    loopback_app_only: true,
    database_not_published: true,
  }),
);
