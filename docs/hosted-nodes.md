# Separate-host HTTPS reference nodes

v0.3 extends the local federation reference to two Linux hosts with distinct operator/agent identities, databases, TLS keys and signing keys. The existing opt-in/evidence workflow remains unchanged. Only specifically shared public revisions cross the link; private/team records and requester reports stay on their own node.

This is a managed LAN/VPN pilot. It does not create independently governed organizations, public signup, an Internet service or scientific validation. [Acceptance evidence](validation/hosted-2026-11-16.md) distinguishes observed results from remaining gates.

## Prerequisites and boundaries

- Two separately administered Linux/Docker environments, available RAM/disk, and an existing administrative SSH path.
- An exact HTTPS DNS name per node and a separately generated endpoint TLS key/full certificate chain. Managed clients and verifier containers must trust the proper root; the intermediate is chain-building material.
- A pinned immutable Nexus application image and the pinned proxy/database/renewal images in `deploy/hosted.compose.yaml`.
- Two checked, unused Docker subnets **per host**. The installer does not prune other networks, expand daemon pools or change global firewall policy.
- Dedicated state directories kept mode 0700. Operator credentials and node private keys are not source artifacts and must not be committed or copied to a peer.

The verified deployment used existing approved DNS/CA names and a dedicated 9443 listener on each host. It required no CA allowlist expansion, DNS change, replacement of an existing certificate or shared-ingress edit. New endpoint TLS keys were generated on their respective hosts; only CSRs and public certificates left the endpoints.

## Prepare one host

From a versioned source release, set the public CA URL and explicitly checked subnets. These are example placeholders, not deployment inventory:

```sh
export NEXUS_CA_URL=https://ca.example.org
export NEXUS_DATA_SUBNET=10.254.101.0/28
export NEXUS_EGRESS_SUBNET=10.254.101.16/28
bash deploy/prepare-host.sh north https://north.example.org:9443 10.0.0.10 airc-nexus-hosted:SOURCE_REV
```

Use the actual immutable hexadecimal image tag and checked bind address. Repeat on the other host with `south`, a different HTTPS origin and different unused subnets. The script creates host-local random database passwords; no password is accepted in an argument. Its private parent directory restricts host access. The database's mounted password file is readable after the official entrypoint drops to PostgreSQL; the host parent remains 0700. Only the dedicated data-mount root is assigned PostgreSQL ownership, which is necessary for PostgreSQL 18's nested PGDATA.

Install the endpoint's full chain as `<state>/tls/node.crt`, its own private key as `node.key` (0600), and the trusted public root as `<state>/trust/root.crt`. Do not reuse another endpoint's leaf or key. Preserve rollback/backup material before certificate operations and follow the existing CA's issuance policy.

## Start and provision

```sh
docker compose --env-file STATE/node.env -f deploy/hosted.compose.yaml up -d --wait database
docker compose --env-file STATE/node.env -f deploy/hosted.compose.yaml run --rm operator node dist/scripts/host-init.js
docker compose --env-file STATE/node.env -f deploy/hosted.compose.yaml up -d --wait app worker verifier proxy renewal
```

`STATE` is that host's `~/.local/share/airc-nexus/north` or `south` path. Provisioning creates exactly one anonymous principal, one unique human operator and one unique agent, with an empty knowledge store. It does not copy the Mac demo's users, credentials, records or private outcomes. Reruns preserve the IDs, keys, credentials and participation decisions.

Each API has only its own application database secret, each worker only its worker secret, and the verifier only its verifier secret. The API/verifier mount the node identity read-only. Databases have no published port. Runtime containers are unprivileged with read-only roots and dropped capabilities. The TLS proxy exposes only the configured LAN address and verifies actual application HTTPS health.

## Pair the nodes

Exchange only `STATE/public/node.json` through the operator's authenticated channel. It contains the public node UUID, signing-key fingerprint/public key, label and HTTPS endpoint. Place the other node's descriptor in `STATE/public/peer.json`, then run:

```sh
docker compose --env-file STATE/node.env -f deploy/hosted.compose.yaml run --rm operator node dist/scripts/host-admin.js peer /state/public/peer.json
```

This pins a specific HTTPS endpoint and signing identity. It does not enable imports or grant record sharing. The verifier is configured HTTPS-only, validates the certificate chain and hostname against its mounted root, refuses redirects, and retains the existing nonce/sequence/digest/expiry checks. Raw queries, private reports and authentication headers are not sent to peers.

## Operator and agent access

The protected `STATE/operator/access.json` contains this node's IDs and initial one-time operator code. The agent's scoped credential is in `STATE/operator/agent.token`. Never paste these into chat, issues, URLs or public configuration. Initial credentials expire in seven days; controlled rotation is an operator responsibility before expiry.

Prepare a new 15-minute one-time human code when needed:

```sh
docker compose --env-file STATE/node.env -f deploy/hosted.compose.yaml run --rm operator node dist/scripts/host-admin.js login
```

The code is written only to `STATE/operator/login.json`, not stdout. Sign in at this node's exact HTTPS origin. Cookies are Secure, HttpOnly, SameSite Strict and host-only with a `__Host-` prefix. The API uses its configured public origin and ignores spoofed forwarding headers when deciding authority.

An MCP client uses the normal stdio adapter, this node's HTTPS `NEXUS_URL`, its own `NEXUS_TOKEN_FILE` and a public `NEXUS_CA_FILE` root certificate. No database credential, signing key or operator code belongs in an MCP configuration. The adapter applies the same TLS hostname/chain validation and response/deadline limits.

## Sharing, correction and withdrawal

Use **Shared nodes** to opt into public imports. A source owner publishes locally and separately authorizes an exact public revision for a named peer. A receiving operator reviews the artifact and approves that exact digest. Scientific scope, failed evidence and source attribution remain visible; acceptance is not an independent validation claim.

Creating a correction pauses the old export while the replacement is private. A newly published revision requires new source consent and recipient review. Revoking consent, opting out or withdrawing removes eligibility; the next signed snapshot clears the old cached payload. Database-enforced 30-second leases prevent indefinite stale access if a verifier or source is unavailable. Previously obtained public copies cannot be remotely erased.

## Renewal, rollback and validation

The pinned Smallstep renewal sidecar uses the node's existing leaf/key for mTLS renewal. It has no CA administrative credential. The unprivileged proxy watches only its own certificate and reloads after a valid replacement; all temporary paths remain on tmpfs. [Smallstep renewal](https://smallstep.com/docs/step-cli/reference/ca/renew/) documents this flow. Full chains and an independent client request are still required after renewal.

Rollback stops only this node's Compose project with `down` **without `-v`**, preserving host-local data, access and keys. Do not roll back a source database over a receiver's anti-replay ledger, restore withdrawn content automatically, share private keys, disable TLS checks or make an intermediate a root anchor. Keep a separate protected signing-key backup; it is not in a database dump.

Run `evals/hosted-live.ts` with a private acceptance configuration and `--authored-test-consent` to test the two real HTTPS origins using authored fixtures. Operator/agent credential paths are inputs from protected files. The harness checks both-sided participation, private/team denial, cross-node credential/origin rejection, private correction, fresh reapproval, withdrawal, bidirectional HTTPS MCP and requester-local outcomes. Direct database checks should compare hashes rather than move private plaintext to another node. Raw evidence belongs in ignored operator storage.
