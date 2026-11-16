# Local prototype operator guide

This checkout is the project root. It contains the working AiRC Nexus v0.1 reference application; do not create a nested Arctic repository. The operator, people, agents, sources and scientific examples in the seed are synthetic fixtures.

## Setup and services

Prerequisites: Node 24.22.3, npm, Docker Desktop. The already prepared Mac checkout has a verified project-local Node executable under `.nexus/runtime/`; prepend its `bin` directory to `PATH` when using that installation. A fresh machine must install the stated Node release from the official distribution.

```sh
npm ci
npm run build
npm run setup
npm run db:seed
npm run seed:exchange
npm run access:prepare
npm run demo
```

`setup` creates or restarts only this checkout's labeled PostgreSQL container, bound to a randomly assigned **loopback** port with a private data directory. PostgreSQL 18.7 and the container digest are pinned. The application and worker use separate login roles with no superuser or RLS-bypass privilege. Migration/seed commands use a separate administrative connection. Setup creates no database service on a public interface.

`demo` starts the API/website and screening worker as detached, task-owned Node children. The website is **http://127.0.0.1:4318**. Health is `/health`. Minimal operational logs are in `.nexus/logs/`. `npm run demo:stop` waits for those owned children to stop. Starting a partially stopped pair recovers both services; unrelated processes are not killed. Rebuild and restart after source changes. A process already holding the port is an error, not a process to terminate automatically.

If Docker Desktop stops, start it first (`docker desktop start --timeout 60` on the tested installation), then run `npm run setup`, `npm run demo:stop` and `npm run demo`. Setup refreshes the container's current loopback port without resetting its data. A temporary PostgreSQL connection loss is handled with generic diagnostics and fresh connections; this cannot keep Docker itself running.

The seed command is idempotent and does not reset user-created drafts, restore withdrawn records, or reverse existing sharing decisions. The authored scholarly exchange remains private on its helper's side until that fixture owner separately approves the reply.

## Sign-in and fixture identities

Open `.nexus/access.json` locally. Never paste it into chat, issue reports or version control.

| Key | Fixture identity | Purpose |
| --- | --- | --- |
| `owner` | Alex | Human knowledge owner and requester owner |
| `bob` | Morgan | Separate human/helper owner |
| `reviewer` | Riley | Assigned reviewer |
| `alice_agent` | Alex's agent | Scoped MCP read, private draft/help and outcome access |
| `bob_agent` | Morgan's agent | Separate scoped MCP principal |

Use human codes in **Sign in → One-time sign-in code**. Codes expire in seven days and are consumed once. Browser sessions expire after 12 hours and use HttpOnly, SameSite Strict cookies. Agent tokens expire in seven days. `npm run access:renew` rotates the fixture codes and agent tokens, revokes their previous credentials and rewrites the local token files. Restart any attached MCP client afterward. Existing browser sessions keep their original expiry; sign out to revoke the active session.

Public search works without sign-in. To inspect Option 3, sign in as Morgan and select **Help exchange**, then the authored variance question. Its checkbox enables sharing of that exact reply. Sign in as Alex in a separate browser context to observe that a private reply is unavailable before consent and disappears after revocation.

These identities are a local adapter, not production authentication or public registration. Do not use the prototype for unpublished research, customer data or real credentials.

## MCP compatibility and connection

`npm run access:prepare` writes `.nexus/mcp-config.json` with absolute executable paths and **token-file references**. It also creates private `.nexus/secrets/alex-agent.token` and `morgan-agent.token` files. Choose the single identity appropriate to the host. Nothing is registered in the user's global Codex or other MCP configuration automatically.

The adapter starts with `node dist/apps/mcp/main.js`. Configure `NEXUS_URL` to the matching loopback API and `NEXUS_TOKEN_FILE` to the selected file. Anonymous read-only use can omit the token. Do not give the adapter a database URL or human sign-in code. The observed SDK 2.4.0 negotiations are legacy `2025-11-25` and pinned `2026-07-28`; actual host/tool-calling support beyond the tested clients must be checked separately.

Seven tools are exposed: search, exact-revision get, private draft submission, private outcome reporting, private help request, permitted help read and private help reply. There is no publication, human-consent or code-execution MCP tool. Models receive reference data and evidence limits, never new authority from retrieved text.

## Operator verification

```sh
npm run typecheck
npm run build
npm test
npm run test:e2e
npm run eval:retrieval
npm run verify:restore
npm run format:check
npm audit
```

Browser tests use the existing Google Chrome installation in isolated temporary profiles, with screenshots of authored fixtures and no traces, videos or credential diagnostics. PostgreSQL integration/browser/evaluation databases are created under unique task-owned names, then dropped. Do not run the retrieval load measurement alongside other database tests when comparing latency.

The 50-task manifest in `evals/tasks.json` is a **post-implementation authored regression pilot**, not held-out or independently curated evidence. The matched flat-keyword arm uses the same public corpus and RLS; its result is retrieval coverage, not model task success. Model comparisons and independent scientific validation remain open.

Optional live checks, already exercised on the owner's selected backend:

```sh
npm run eval:smoke
npm run eval:peer
```

They use the existing authenticated local Ollama relay at `127.0.0.1:11434`, model `deepseek-v4.1-flash:cloud`. Only authored task data and bounded permitted results are forwarded. There are no new accounts, model downloads or API keys. Each model stage is bounded to 8,000 cumulative input tokens, 2,000 output tokens, ten tools, six model calls and 300 seconds; a limit failure does not count as a pass. Provider token usage is recorded, private thinking is not. The peer harness simulates human approvals in an isolated fixture database; it never sends messages to real outside participants.

## Backup and recovery

`npm run verify:restore` creates a private custom-format dump in `.nexus/backups/`, restores it into a temporary database in this checkout's PostgreSQL container, compares record/revision identities and checks RLS/private/team denial with the ordinary application role. It drops the temporary restore database afterward and retains the dump. Keep writes quiescent during this comparison. This check targets the native local stack; it is not a tested off-device backup or Compose disaster-recovery procedure.

The dump includes private demo content, credential hashes and sessions. Keep its parent directory private and ignored. A dump does not include PostgreSQL login roles; the same restricted roles must exist when recovering into a different cluster. The runtime `.nexus/local.json`, secret files and role provisioning remain separate operator material.

Do not edit an applied migration. Add a new numbered migration, verify fresh and incremental application, then back up and restart the application. Use `npm run db:migrate` with the native setup's administrative configuration. A screening outage leaves submissions quarantined: it does not approve or publish them.

## Pinned Compose alternative

`npm run compose:setup` builds the pinned Node 24.22.3 image and starts a separate PostgreSQL/application/worker stack at **http://127.0.0.1:4319**. A one-off initializer provisions roles, migrations and authored data. Its sign-in codes are in `.nexus/compose/operator/access.json`, separate from the native stack. This is packaging validation, not federation.

The database has no published port. Application ports bind only to host loopback. The database/worker network is internal; the app also attaches to a frontend bridge for the host port, following [Docker's frontend/backend networking pattern](https://docs.docker.com/engine/network/). The frontend bridge does not impose an outbound-traffic deny policy on the app; the service has no remote-content fetch or submitted-code execution feature. Application and worker are unprivileged, have read-only roots, dropped capabilities and only their own database secret mounted. The one-off initializer alone receives setup secrets. Host secret files are readable through their individual read-only container mounts; their host parent directory is mode 0700. No secret values are included in the image, Compose YAML or environment variables.

`npm run verify:compose` checks the actual host port, separate restricted roles, secret isolation, read-only application roots and dropped capabilities without printing privileged configuration. `npm run compose:stop` stops/removes only the named Compose containers and networks. Its database volume and private operator files are retained. Use one stack at a time for routine work. No remote deployment, DNS, tunnel, public signup or external telemetry is part of this setup.
