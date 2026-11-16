import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface LocalConfig {
  admin_url: string;
  app_url: string;
  worker_url: string;
  federation_url: string;
  container: string;
  port: number;
  origin: string;
  browser_host: string;
  public_origin: string;
  federation_ca_file: string;
  https_peers_only: boolean;
}
export async function loadConfig(): Promise<LocalConfig> {
  let config: Partial<LocalConfig> = {};
  try {
    config = JSON.parse(
      await readFile(resolve(process.env.NEXUS_CONFIG_FILE ?? '.nexus/local.json'), 'utf8'),
    );
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
    federation_url: await secret('NEXUS_FEDERATION_DATABASE_URL', config.federation_url),
    container: config.container ?? '',
    port,
    origin: process.env.NEXUS_ORIGIN ?? config.origin ?? `http://127.0.0.1:${port}`,
    browser_host: config.browser_host ?? '',
    public_origin: process.env.NEXUS_PUBLIC_ORIGIN ?? config.public_origin ?? '',
    federation_ca_file: process.env.NEXUS_CA_FILE ?? config.federation_ca_file ?? '',
    https_peers_only:
      process.env.NEXUS_HTTPS_PEERS_ONLY === '1' || config.https_peers_only === true,
  };
}
