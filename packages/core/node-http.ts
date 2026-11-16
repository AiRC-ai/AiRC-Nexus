import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';

export function httpsOrigin(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    isIP(url.hostname) ||
    !url.hostname.includes('.') ||
    url.hostname.length > 253
  )
    throw new Error('https_node_origin_required');
  return url.origin;
}
/** Bounded, non-redirecting node I/O. Certificate and hostname checks stay enabled. */
export async function nodeRequest(
  url: URL,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    timeoutMs: number;
    maxBytes: number;
    caFile?: string;
  },
) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('invalid_node_url');
  const ca = options.caFile ? await readFile(options.caFile) : undefined;
  return new Promise<{ status: number; text: string }>((accept, reject) => {
    let finished = false;
    const finish = (error?: Error, result?: { status: number; text: string }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (error) reject(error);
      else accept(result!);
    };
    const run = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = run(
      url,
      {
        method: options.method ?? 'GET',
        headers: options.headers,
        signal: options.signal,
        ...(url.protocol === 'https:' ? { rejectUnauthorized: true, ...(ca ? { ca } : {}) } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > options.maxBytes) {
            finish(new Error('node_response_limit'));
            res.destroy();
            req.destroy();
          } else chunks.push(chunk);
        });
        res.once('error', () => finish(new Error('node_response_failed')));
        res.once('end', () =>
          finish(undefined, {
            status: res.statusCode ?? 0,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    const timer = setTimeout(() => {
      finish(new Error('node_request_deadline'));
      req.destroy();
    }, options.timeoutMs);
    timer.unref();
    req.once('error', (error: NodeJS.ErrnoException) => {
      const allowed = new Set([
        'CERT_HAS_EXPIRED',
        'ERR_TLS_CERT_ALTNAME_INVALID',
        'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
        'SELF_SIGNED_CERT_IN_CHAIN',
        'DEPTH_ZERO_SELF_SIGNED_CERT',
        'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
      ]);
      finish(
        new Error(allowed.has(error.code ?? '') ? `node_tls_${error.code}` : 'node_request_failed'),
      );
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}
