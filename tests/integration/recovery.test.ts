import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testContext } from './helpers.js';

describe('database connection interruption', () => {
  let t: Awaited<ReturnType<typeof testContext>>;
  beforeAll(async () => {
    t = await testContext();
  });
  afterAll(async () => {
    await t?.close();
  });
  it('keeps a real Node client alive after an idle backend is terminated and reconnects', async () => {
    const module = pathToFileURL(resolve('packages/db/index.ts')).href;
    const code = `const {createPool}=await import(${JSON.stringify(module)});
      const next=new Promise(r=>process.stdin.once('data',r));
      const pool=createPool(process.env.NEXUS_TEST_DATABASE_URL);
      try {
        const r=await pool.query('SELECT pg_backend_pid() AS pid');
        console.log(r.rows[0].pid);
        await next;
        await pool.query('SELECT 1');
        console.log('reconnected');
      } finally {await pool.end();process.stdin.destroy();}`;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
      env: {
        PATH: process.env.PATH ?? '',
        NEXUS_TEST_DATABASE_URL: t.app.options.connectionString!,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let output = '',
      diagnostics = '';
    let acceptPid: (pid: number) => void, acceptNotice: () => void;
    const pidReady = new Promise<number>((accept) => {
      acceptPid = accept;
    });
    const handled = new Promise<void>((accept) => {
      acceptNotice = accept;
    });
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const pid = output.match(/^(\d+)\n/);
      if (pid) acceptPid(Number(pid[1]));
    });
    child.stderr.on('data', (chunk) => {
      diagnostics = (diagnostics + chunk.toString()).slice(0, 10000);
      if (diagnostics.includes('nexus_database: idle connection lost')) acceptNotice();
    });
    const ended = new Promise<number | null>((accept, reject) => {
      child.once('error', () => reject(new Error('recovery_client_start_failed')));
      child.once('close', accept);
    });
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('recovery_client_timeout')), 10000);
      timer.unref();
    });
    try {
      const pid = await Promise.race([pidReady, deadline]);
      const owned = await t.admin.query(
        'SELECT 1 FROM pg_stat_activity WHERE pid=$1 AND datname=current_database()',
        [pid],
      );
      expect(owned.rowCount).toBe(1);
      await t.admin.query('SELECT pg_terminate_backend($1)', [pid]);
      await Promise.race([
        handled,
        ended.then(() => {
          throw new Error('client_exited_before_recovery');
        }),
        deadline,
      ]);
      child.stdin.end('continue\n');
      expect(await Promise.race([ended, deadline])).toBe(0);
      expect(output).toContain('reconnected');
      expect(diagnostics.includes('nexus_database: idle connection lost')).toBe(true);
      expect(diagnostics.includes('Client {')).toBe(false);
    } finally {
      clearTimeout(timer!);
      if (child.exitCode === null) child.kill('SIGTERM');
    }
  });
});
