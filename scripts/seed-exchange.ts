import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool, type Pool } from '../packages/db/index.js';
import { HelpExchange } from '../packages/core/help.js';
import { loadConfig } from '../packages/core/config.js';
import { IDS } from '../fixtures/records.js';
import type { Principal } from '../packages/contracts/index.js';

export async function seedDemoExchange(pool: Pool) {
  const help = new HelpExchange(pool);
  const actor = (id: string, owner_id: string, kind: 'human' | 'agent'): Principal => ({
    id,
    owner_id,
    kind,
    name: 'Authored demo actor',
    role: 'owner',
    scopes: ['read', 'draft'],
  });
  const requester = actor(IDS.aliceAgent, IDS.alice, 'agent'),
    owner = actor(IDS.alice, IDS.alice, 'human'),
    helper = actor(IDS.bobAgent, IDS.bob, 'agent');
  const request = await help.request(
    requester,
    {
      question: 'Why do population variance and sample variance disagree for [1, 2, 3]?',
      environment: { dataset: 'nexus-synthetic-v1' },
    },
    'authored-scholarly-inquiry-v1',
  );
  const current = (await help.list(owner, request.id)).requests[0];
  if (current.state === 'private')
    await help.share(owner, {
      id: request.id,
      digest: request.digest,
      recipient_owner_id: IDS.bob,
      confirmed: true,
    });
  if (current.state === 'closed') return { request_id: request.id, state: 'closed' };
  const reply = await help.reply(
    helper,
    {
      request_id: request.id,
      answer:
        'They use different denominators. Population variance divides by N; the sample estimator divides by N − 1. For this synthetic example the results are 2/3 and 1.',
      limitations: ['Synthetic example, not a scientific replication.'],
      sources: [
        {
          title: 'AiRC Nexus authored computation fixture.',
          url: 'https://github.com/AiRC-ai/AiRC-Nexus',
          license: 'Apache-2.0',
          attribution: 'AiRC Nexus contributors',
        },
      ],
      equations: [
        String.raw`\sigma^2=\frac{1}{N}\sum_{i=1}^{N}(x_i-\mu)^2=\frac{2}{3},`,
        String.raw`s^2=\frac{1}{N-1}\sum_{i=1}^{N}(x_i-\bar{x})^2=1.`,
      ],
    },
    'authored-scholarly-reply-v1',
  );
  return { request_id: request.id, reply_id: reply.id, state: 'authored_demo' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pool = createPool((await loadConfig()).app_url);
  try {
    const result = await seedDemoExchange(pool);
    await writeFile('.nexus/demo-exchange.json', JSON.stringify(result, null, 2) + '\n', {
      mode: 0o600,
    });
    console.log(
      'Prepared the clearly labeled authored scholarly exchange; the reply remains under its owner’s control.',
    );
  } finally {
    await pool.end();
  }
}
