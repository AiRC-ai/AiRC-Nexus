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
  const config = JSON.parse(await readFile(resolve('.nexus/local.json'), 'utf8')) as LocalConfig;
  return {
    ...config,
    app_url: process.env.NEXUS_DATABASE_URL ?? config.app_url,
    worker_url: process.env.NEXUS_WORKER_DATABASE_URL ?? config.worker_url,
    port: process.env.NEXUS_PORT ? Number(process.env.NEXUS_PORT) : config.port,
    origin: process.env.NEXUS_ORIGIN ?? config.origin,
  };
}
