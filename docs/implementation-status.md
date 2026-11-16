# Prototype implementation ledger

Started November 15, 2026. Scope: local v0.1 from the [prototype plan](prototype-plan.md). These milestones track observed implementation evidence; the planned model benchmark and production/federation gates remain separate.

## Separate-host HTTPS extension — November 16

v0.3 now runs on two distinct Ubuntu hosts, each with its own PostgreSQL container, random logical operator/agent identities, node signing key and endpoint TLS key. The two public HTTPS origins validate normal certificate trust and exact hostname; operator cookies are secure and host-only. No local demo accounts or private datasets were migrated to the hosts.

All **47 unit/integration tests and six browser journeys passed**, plus the real cross-host HTTPS/MCP acceptance scenario. Source and recipient opt-in, private/team export denial, cross-node credentials/origins, private correction, new approvals and withdrawal passed. Direct hash checks found no foreign private titles in native revisions or cache. Private outcomes stayed only at their requesting node. Forced certificate renewal and serving the new leaf passed; PKI monitoring remained healthy.

See [hosted operations](hosted-nodes.md) and [separate-host evidence](validation/hosted-2026-11-16.md). These are separate logical operators under one administrator, not independent institutions or a public Internet launch. The entries below preserve the earlier local milestones.

## Federation extension — November 16

The v0.2 local reference is running as **Northern Commons** and **Southern Commons**, with separate PostgreSQL containers, node keys and operator/agent credentials. Public export is a source-owner decision bound to the current revision and selected peer. A recipient separately enables imports and approves the full artifact. Imported records retain their origin and source-reported evidence; private/team records and private requester outcomes remain local.

**42 unit/integration checks and six browser journeys passed.** The live separate-process scenario passed in both directions, including consent revocation, receiver opt-out, source outage/restart, correction/reapproval, withdrawal and private MCP reporting. The observed safety-change propagation phases were about five seconds, under the declared 30-second lease cap. A selected DeepSeek cloud requester found/read the exact federated reference and preserved its unverified scope using 5,866 input and 821 output tokens.

See the [federation guide](federation.md), [results](validation/federation-2026-11-16.md) and [visual QA](design/federation-qa.md). This is one Mac/operator, not independent institutional federation, public hosting or scientific replication. The sections below preserve the original v0.1 milestones and evidence.

## v0.1 plan

| Milestone | State | Evidence |
| --- | --- | --- |
| P0: MCP compatibility and reuse | Protocol/host and selected-cloud checks passed | SDK 2.4.0 real stdio search/get calls passed with legacy `2025-11-25` and pinned `2026-07-28`; Codex CLI 0.141.0 discovered the spike tools in an isolated process. The separate DeepSeek harness completed actual tool-calling journeys. No new Codex chat was created. |
| P1: schema and permissions | Focused checks passed | Real PostgreSQL 18.7, separate app/worker roles, migrations, RLS, revision freezing and per-revision grants; fresh/incremental migration checks passed. |
| P2: retrieval and context | Local checks passed | Code-friendly and natural-language full-text search, labeled broader matches, exact/range environment checks, UTF-8 budgets and whole-record omission when critical context cannot fit. The authored regression and 1,000-record workload are measured. |
| P3: MCP and website | Implemented; local browser acceptance passed | Seven database-backed MCP tools; selected branded Evidence Workbench, search/detail, contributions/review, help and activity. Four isolated Chrome acceptance journeys and native in-app browser search/science/detail inspection passed. |
| P4: consent and review | Core integration checks passed | Private quarantine, bounded screening, exact-revision review/consent, negative evidence and withdrawal. The help exchange separately gates question and reply sharing by their owners. |
| P5: evaluation and delivery | Initial evaluation and local delivery complete; research gates open | 60 seeded fixtures, 50 authored post-implementation tasks, matched keyword retrieval, selected cloud requester/peer checks, pinned Compose stack, restart and backup/restore, operator guide and bounded results report. Held-out model comparisons and real-user validation remain open. |

## P0 decisions

- Development uses verified project-local Node 24.22.3; npm is used because the machine's pnpm shim points to a missing package. The application supports Node >=22.12; the pinned container target remains Node 24.
- The official SDK's `serveStdio` factory is required to serve the 2026 and legacy eras correctly. Tests assert the actual negotiated protocol, not just successful tool listing.
- The Codex probe overrides MCP/catalog settings only for its child process. It reads one compatible existing model descriptor to satisfy host startup, but performs no inference and changes no user configuration.
- KnowledgePulse's published `@knowledgepulse/sdk@0.1.0` accepted the authored SOP fixture with `https://knowledgepulse.dev/schema/v1`; it rejected the currently documented `https://openknowledgepulse.org/schema/v1`. Namespace aliasing is explicit in the limited preview mapper. General compatibility is not claimed.
- The upstream SDK was tested in an ignored, isolated compatibility workspace. Its older validation and optional document/model dependency graph is not in the Nexus application dependencies. The main application uses a bounded Zod 4 contract and does not capture session traces.
- A small RO-Crate field-mapping preview preserves source references without claiming a fully validated scientific profile or executing anything.
- Apache-2.0 was selected by the project owner and applied. Third-party data/evidence rights remain explicit per record.

Runtime evidence containing local configuration stays in ignored `.nexus/`. Do not commit credentials, browser sessions, database files or full host tool inventories.

## v0.1 baseline verification

The v0.1 baseline **29 unit/integration checks and four browser journeys passed**. The integration set includes storage/lifecycle, HTTP boundaries/session handling, database-backed MCP, protocol negotiation, mapping previews, bilateral help consent, bounded context/screening, natural-language regression, set-based read-policy equivalence and actual Node-client recovery after an idle backend is terminated. Fresh task-owned test databases are removed afterward. Eight migrations apply both fresh and incrementally against PostgreSQL 18.7.

The owner chose **Option 3, Evidence Workbench**, using the supplied AiRC circuit-A logo, navy/cyan identity, Inter controls and Source Serif 4 reading typography. Desktop and narrow captures, real MathML, separate sharing/revocation and selected-tag automated accessibility checks passed. See the root [design QA](../design-qa.md).

The owner selected Ollama Cloud with DeepSeek 4.1 Flash. A live requester retrieved the intended exact revision, retained its unverified scope and recorded a private harness outcome. Two isolated sessions also completed request → simulated fixture-owner approval → private reply → separate approval → requester report → revocation. These checks use one cloud model under one operator, not a smaller-local-model or independent-replication benchmark.

The final isolated retrieval run found the target in the top five for **30/30 answerable tasks**; the flat-keyword arm also scored **30/30**. All **10/10 wrong-version tasks** excluded incompatible records. Of ten unfamiliar questions with unknown compatibility explicitly included, five returned no public candidate and five returned labeled broader matches. This is retrieval behavior, not an appropriate-abstention or validated-task-success score.

At 1,000 synthetic records and ten concurrent clients, warm search p95 was **370.80 ms**, and get p95 **144.03 ms**, excluding model inference. Backup/restore, task-owned service recovery and the isolated Compose privilege/port checks passed. See the [validation report](validation/prototype-2026-11-15.md), [operator guide](operator-guide.md) and [dependency declarations](validation/dependencies.json).

## Open acceptance gates

The implementation is ready for local exploration. The original 200-run, two-model comparison has not been run: the user selected a single cloud model, no suitable smaller local model was provisioned, and the new 50-task set was authored after tuning. No incremental usefulness/token-saving claim, real scientific replication, independent-node federation, production identity or public-service readiness is established. The next research pilot needs genuinely held-out tasks, a selected smaller model, paired outcomes and consenting outside users before those gates can be accepted.
