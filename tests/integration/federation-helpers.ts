import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createIdentity } from '../../packages/federation/protocol.js';
import { installIdentity, configurePeer } from '../../packages/federation/provision.js';
import { Federation } from '../../packages/federation/service.js';
import { syncAll } from '../../packages/federation/sync.js';
import { buildApp } from '../../apps/server/app.js';
import { IDS, recordId, revisionId } from '../../fixtures/records.js';
import { testContext } from './helpers.js';

export async function federationPair(options: { browserHosts?: boolean } = {}) {
  const directory = await mkdtemp(resolve('.nexus/federation-test-'));
  const a = await testContext({ accessPath: resolve(directory, 'north-access.json') }),
    b = await testContext({ accessPath: resolve(directory, 'south-access.json'), records: false });
  const north = createIdentity('Northern Commons', IDS.alice),
    south = createIdentity('Southern Commons', IDS.bob);
  await installIdentity(a.admin, north);
  await installIdentity(b.admin, south);
  const fa = new Federation(a.app, north),
    fb = new Federation(b.app, south);
  const appA = await buildApp(a.app, {
      federation: fa,
      ...(options.browserHosts ? { browserHost: 'north.localhost' } : {}),
    }),
    appB = await buildApp(b.app, {
      federation: fb,
      ...(options.browserHosts ? { browserHost: 'south.localhost' } : {}),
    });
  const urlA = await appA.listen({ host: '127.0.0.1', port: 0 }),
    urlB = await appB.listen({ host: '127.0.0.1', port: 0 });
  await configurePeer(a.admin, south, urlB);
  await configurePeer(b.admin, north, urlA);
  const ownerB = { ...b.owner, id: IDS.bob, owner_id: IDS.bob };
  const sync = () => syncAll(b.federation, south);
  const exportOne = async (id = recordId(1), revision = revisionId(1)) => {
    const row = await a.store.get(a.owner, id, revision);
    return fa.grant(a.owner, {
      record_id: id,
      revision_id: revision,
      digest: row.digest,
      peer_id: south.node_id,
      enabled: true,
      confirmed: true,
    });
  };
  const enable = () =>
    fb.peerConsent(ownerB, { peer_id: north.node_id, import_enabled: true, confirmed: true });
  const approve = async (id = recordId(1)) => {
    const row = (await fb.status(ownerB)).records.find((r) => r.record_id === id);
    if (!row) throw new Error('No pending remote record');
    return fb.approve(ownerB, {
      peer_id: north.node_id,
      record_id: id,
      revision_id: row.revision_id,
      artifact_digest: row.artifact_digest,
      accepted: true,
      confirmed: true,
    });
  };
  return {
    a,
    b,
    north,
    south,
    fa,
    fb,
    ownerB,
    appA,
    appB,
    urlA,
    urlB,
    sync,
    exportOne,
    enable,
    approve,
    close: async () => {
      await Promise.all([appA.close(), appB.close()]);
      await Promise.all([a.close(), b.close()]);
      await rm(directory, { recursive: true, force: true });
    },
  };
}
