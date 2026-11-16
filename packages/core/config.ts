import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface LocalConfig {
  admin_url: string;
  app_url: string;
  worker_url: string;
  container: string;
  port: number;
  origin: string;
}
export async function loadConfig(): Promise<LocalConfig> {
  let config: Partial<LocalConfig> = {};
  try {
    config = JSON.parse(await readFile(resolve('.nexus/local.json'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const secret = async (name: string, fallback = '') => {
    const path = process.env[`${name}_FILE`];
    return path ? (await readFile(path, 'utf8')).trim() : (process.env[name] ?? fallback);
  };
  const port = Number(process.env.NEXUS_PORT ?? config.port ?? 4318);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('invalid_local_port');
  return {
    admin_url: await secret('NEXUS_ADMIN_DATABASE_URL', config.admin_url),
    app_url: await secret('NEXUS_DATABASE_URL', config.app_url),
    worker_url: await secret('NEXUS_WORKER_DATABASE_URL', config.worker_url),
    container: config.container ?? '',
    port,
    origin: process.env.NEXUS_ORIGIN ?? config.origin ?? `http://127.0.0.1:${port}`,
  };
}
