// Read-only Codex host discovery; no thread creation or model request.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';

await mkdir('.nexus/compat', { recursive: true });
const existing = JSON.parse(
  await readFile(resolve(homedir(), '.codex/ollama-launch-models.json'), 'utf8'),
);
// Use a single already-compatible catalog descriptor only in this isolated process.
// No inference is performed and the user's catalog is never changed.
const descriptor = existing.models.find((m) => typeof m.base_instructions === 'string');
if (!descriptor)
  throw new Error('No compatible local model descriptor is available for the host probe');
await writeFile(
  '.nexus/compat/probe-model-catalog.json',
  JSON.stringify({ models: [descriptor] }),
  { mode: 0o600 },
);
const child = spawn(
  'codex',
  [
    'app-server',
    '--stdio',
    '-c',
    `mcp_servers={nexus_compat={command=${JSON.stringify(process.execPath)},cwd=${JSON.stringify(process.cwd())},startup_timeout_sec=10,args=["--import",${JSON.stringify(resolve('node_modules/tsx/dist/loader.mjs'))},${JSON.stringify(resolve('apps/mcp/spike.ts'))}]}}`,
    '-c',
    `model_catalog_json=${JSON.stringify(resolve('.nexus/compat/probe-model-catalog.json'))}`,
  ],
  { stdio: ['pipe', 'pipe', 'pipe'] },
);
let nextId = 0;
const pending = new Map();
let stderr = '';
child.stderr.on('data', (b) => {
  stderr += b.toString();
});
child.on('exit', (code) => {
  for (const p of pending.values()) p.reject(new Error(`Codex discovery process exited (${code})`));
});
createInterface({ input: child.stdout }).on('line', (line) => {
  try {
    const m = JSON.parse(line);
    if (m.id !== undefined && pending.has(m.id)) {
      const { resolve, reject, timer } = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(timer);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    }
  } catch {
    /* Non-protocol output is not treated as a response. */
  }
});
const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 20_000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
try {
  await request('initialize', { clientInfo: { name: 'nexus-compatibility', version: '0.1.0' } });
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
  const configuration = await request('config/read', { includeLayers: false });
  const configuredNames = Object.keys(configuration.config?.mcp_servers ?? {});
  let result,
    toolNames = [];
  for (let attempt = 0; attempt < 15; attempt++) {
    result = await request('mcpServerStatus/list', { detail: 'toolsAndAuthOnly' });
    const server = result.data?.find((s) => s.name === 'nexus_compat');
    toolNames = Object.keys(server?.tools ?? {}).sort();
    if (toolNames.includes('nexus_search')) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const evidence = {
    host: 'Codex CLI 0.141.0 app-server',
    node: process.version,
    scope: 'Isolated process configuration, discovery only, no threads or model calls',
    configuredNames,
    observedServerNames: result.data?.map((s) => s.name) ?? [],
    toolNames,
    discovered: toolNames.some((n) => n.includes('nexus_search')),
  };
  await mkdir('.nexus/compat', { recursive: true });
  await writeFile('.nexus/compat/codex-discovery.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence));
  if (!evidence.discovered) {
    console.error('Nexus was not present in the host discovery response; bounded metadata saved.');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(e.message);
  const diagnostics = stderr
    .split('\n')
    .filter((line) => /Error:|error loading|failed to parse/.test(line))
    .slice(-2)
    .map((line) =>
      line.replace(/\/Users\/[^/\s]+/g, '/Users/[user]').replace(/https?:\/\/\S+/g, '[URL]'),
    );
  if (diagnostics.length) console.error(diagnostics.join('\n').slice(0, 1200));
  process.exitCode = 1;
} finally {
  for (const p of pending.values()) clearTimeout(p.timer);
  child.stdin.end();
  child.kill('SIGTERM');
  await rm('.nexus/compat/probe-model-catalog.json', { force: true });
}
