# AiRC Nexus federation v0.2

This is a local reference implementation of the founding knowledge-commons idea: independently configured nodes retain control of their records, people explicitly choose what crosses a link, agents retrieve compact context, and validation reports go to the humans they serve. The two local nodes are operated by one person on one Mac; they do not establish independent institutional federation or scientific replication.

The application uses the existing Apache-2.0 codebase and contracts. It does not import a competitor's registry, experience traces or reputation system. The wire format below is a small **Nexus prototype protocol**, not a claim of A2A, RO-Crate or general federation conformance.

## Participation and permissions

1. Each node has its own PostgreSQL container, database passwords, human/agent credentials and Ed25519 key. The node UUID remains stable across a deliberate key change.
2. An operator pins a known peer's UUID, public key and loopback endpoint. The application cannot accept a URL or signing key from a contribution or an MCP caller.
3. The source owner publishes a native record locally through the existing review path. Public publication alone does **not** opt that record into a federation feed.
4. The owner selects an allowlisted peer and explicitly grants export of the exact current public revision and digest. Private/team records, quarantined material, private reports and imported records are ineligible.
5. The recipient operator enables public imports from that pinned peer. Received records remain outside the ordinary local knowledge tables and need a separate review bound to the full imported artifact digest.
6. An accepted, current, unexpired record becomes publicly retrievable on that recipient node, with its origin, exact revision, source-reported evidence and uncertainty intact. Signature verification and acceptance for retrieval are not independent scientific validation.
7. A requester can record a private outcome against the global reference. That report stays on the requesting node, is visible to its owner and is never included in the export feed.

The global reference is `(origin node UUID, record UUID, revision UUID)`. Two nodes can contain identical fixture UUIDs without those records being confused. MCP clients preserve `origin_node` for shared references; a node's own qualified origin resolves to its native record.

The browser's **Shared nodes** surface shows recipient consent, pending review, source scope/evidence, accepted records, private reports and the user's federation activity. A source record's **Share with a Nexus node** section controls outgoing consent. The existing AiRC navy/cyan identity and scholarly workbench typography remain in use.

## Signed exchange

Transport is a bounded HTTP POST to `/api/federation/v1/snapshot`, separate from browser/agent authentication. Requests and responses are signed using [Node's Ed25519 support](https://nodejs.org/docs/latest-v24.x/api/crypto.html); signatures cover deterministic JSON bytes through the existing [RFC 8785 canonicalization](https://www.rfc-editor.org/rfc/rfc8785) library. Key IDs are SHA-256 fingerprints of DER/SPKI public keys. Private signing keys stay in protected operator files and never enter the database, browser, model context or wire payload.

A request binds protocol version, operation, requesting node, destination node, key fingerprint, issue time and a fresh UUID challenge. The source verifies the pinned peer and time window, then consumes the challenge once. A signed response binds source, audience, key, that challenge, issue/expiry times, monotonic feed sequence and a **complete** snapshot.

Only configured `http://127.0.0.1:<port>` roots are permitted for this local transport. Redirects, credentials in URLs, arbitrary hosts, remote callbacks and automatic key discovery are rejected. Requests time out after three seconds; responses are streamed under a 1 MiB cap. There are at most 16 pinned peers and 100 active outgoing grants per peer. Oversized/incomplete or unsupported snapshots fail closed rather than becoming a partial authoritative index.

An active item carries the origin record/revision IDs, revision sequence, canonical content digest, declared sources/rights and a public evidence summary. The receiver checks the content digest against the public immutable envelope, rejects duplicate IDs and inconsistent/older revisions, and runs independent deterministic screening. Private assessment notes, assessor details, outcomes, audit history and conversations are not copied. Public assessment **method/outcome counts** preserve disagreements without turning them into a truth score. Imported content remains untrusted data.

These relationships preserve source entity/revision, origin agent and receiving review concepts compatible with the intent of [PROV-O](https://www.w3.org/TR/prov-o/); this is not an RDF or PROV conformance claim.

## Corrections, withdrawal and freshness

The verifier pauses five seconds between bounded poll batches. The tested pair has one linked peer per node; larger peer sets can take longer to cycle. A successful request grants a lease ending no later than **30 seconds after the request began**, also capped by the signed source expiry. Clock checks permit a five-second issue-time skew; that skew never extends the receiver's 30-second local cap. PostgreSQL read policies enforce expiry independently of a running verifier.

With a reachable source and healthy workers, the next poll plus the three-second network deadline is an expected **eight-second** observation window. This is an engineering target for the local demo, not a measured Internet SLA. If the source is unreachable, no new lease is granted; a detected failure hides/purges cached content immediately. A paused/dead verifier cannot keep old records readable after the remaining lease expires.

| Change | Source behavior | Recipient behavior |
| --- | --- | --- |
| Create a private correction | The old export is no longer an eligible current public revision | Old content stops being served; the private replacement is not disclosed |
| Publish a replacement revision | Previous export consent does not cover the new bytes | It stays unavailable until fresh source-owner consent and recipient review |
| Change public evidence | Export the current summary with the same content revision | Artifact digest changes; prior recipient approval stops applying |
| Revoke outgoing consent | Omit that record from the complete peer snapshot | Clear the cached payload and local approval |
| Withdraw locally | Return only an unavailable reference for the previously shared record | Clear payload/approval; exact old-revision reads fail |
| Disable imports or revoke/change a peer pin | Enforce local policy immediately | Hide and purge cached payload/approval without waiting for a fetch |
| Source outage or invalid signed response | No usable fresh snapshot | Invalidate existing context; later recovery requires current review again |

Feed sequences and per-record revision high-water marks persist in the recipient database. A replay cannot refresh a lease or restore an older revision. Requests are challenge-bound, and concurrent sync attempts are serialized per peer. A changed content/evidence artifact, restored unavailable record or new pin requires fresh receiving approval.

The service does not promise to erase public copies already obtained by a person, model or outside system. Native historical source revisions remain available only under their local publication policy and are explicitly labeled historical; the federation retrieval path serves only its accepted current reference. A browser automatically refreshes active views and removes expired/unavailable advice, but that is not remote deletion of a user's saved copy.

## Local operator commands

Use the pinned Node 24.22.3 runtime and existing Docker Desktop installation:

```sh
npm run build
npm run federation:setup
npm run federation:start
```

Open [Northern Commons](http://north.localhost:4320/#/federation) and [Southern Commons](http://south.localhost:4322/#/federation). The setup creates separate stores and peer pins, leaving imports off and per-record sharing unapproved unless a prior explicit decision already exists. Rerunning setup preserves credentials, keys, revocations and sharing decisions. It does not reset the original workspace on 4318.

- North's operator/source-owner code is `owner` in `.nexus/federation/north/access.json` (Alex).
- South's operator code is `bob` in `.nexus/federation/south/access.json` (Morgan).
- Codes are single-use and expire after seven days, as in v0.1. Keep those files private.
- Separate host-only browser cookies and canonical `north.localhost`/`south.localhost` names keep the local node sessions distinct. [Cookies do not isolate ports](https://www.rfc-editor.org/rfc/rfc6265.html#section-8.5); `.localhost` is a [special-use loopback namespace](https://www.rfc-editor.org/rfc/rfc6761.html#section-6.3). No hosts-file or DNS change is made.
- The generated `.nexus/federation/mcp-config.json` uses absolute executable/token-file references and numeric loopback API URLs. Select the intended node in the agent host; no global host configuration is changed.
- Runtime files give each API, review worker and federation verifier only its own database URL. The verifier role cannot read native/private records, approve imports or publish native records.

In North, open an authored public record, choose South, inspect the exact revision and authorize sharing. In South, opt into imports, inspect the pending record's sources/scope/evidence, then accept that exact public artifact. Use **Include shared nodes** in search or the Shared nodes list to retrieve it. The source's **Propose a correction** flow starts a private revision and pauses the old public/exported reference until the normal review/publish/share steps finish again.

`npm run federation:stop` stops only the six task-owned API/review/verifier children, preserving the databases. Docker must remain available. After a Docker restart, rerun setup to refresh database port configuration, then restart the federation services. Existing source/recipient decisions are retained.

Renew a node's fixture access with `NEXUS_CONFIG_FILE="$PWD/.nexus/federation/south/local.json" npm run access:renew` (choose North's path for North). This uses only the selected node's operator state and updates its token files; attached agent hosts need a restart afterward. Do not use a restricted runtime configuration file for administrative renewal.

Operator key actions use local, explicit public descriptors; there is no peer-supplied key update:

```sh
npm run federation:admin -- south revoke-peer north
npm run federation:admin -- north rotate-key
npm run federation:start
npm run federation:admin -- south trust-peer north
```

`public-node.json` contains only a public descriptor, not the private key or its file path. Revoke a suspected pin immediately. Rotation writes a new protected key and marks the old runtime inconsistent with the database; it cannot continue serving signed feeds. Restart before explicitly trusting the new descriptor at a recipient. A changed pin invalidates local cache/approval and requires record review again. The local pairing command is not a distributed revocation service.

Run `npm run federation:verify -- --demo-consent` for a live, explicitly simulated fixture-owner scenario, or add `--cloud` to exercise the previously selected DeepSeek cloud requester. It creates clearly authored records, tests revocation, outage/restart, corrections and withdrawal, then leaves separate approved showcase contributions in both directions. It never undoes the test record's withdrawal. Raw results stay in `.nexus/evaluations/`. This is intentional demo consent, not permission to change an outside contributor's decisions.

Keep operator configuration, database dumps and private signing keys separately protected in recovery. A database dump does not contain the signing key. Restoring an older source database does not reset a recipient's anti-replay/revision ledger; coordinate recovery rather than bypassing those checks. The lease bound assumes honest clocks without rollback within the configured skew and the local trusted computing base.

## Limits before wider participation

This version supports explicitly shared **public** records only. It has no restricted cross-node search, transitive re-export, public registration, crawler, external URL fetcher, submitted-code execution or autonomous A2A delegation. A pinned node can report incorrect findings; screening and signatures do not establish truth. A compromised operator/verifier host remains inside the local trusted computing base.

Both local nodes still share one Mac and operator. Internet deployment needs distinct HTTPS origins, authenticated operator provisioning, secure key custody/revocation distribution, retention/incident policies, current security review, reviewed research artifacts and independent operators. None of those is established by the loopback demonstration.
