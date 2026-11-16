# Prototype implementation ledger

Started November 15, 2026. Scope: local v0.1 from the [prototype plan](prototype-plan.md). These milestones track observed implementation evidence; the planned model benchmark and production/federation gates remain separate.

## Current plan

| Milestone | State | Evidence |
| --- | --- | --- |
| P0: MCP compatibility and reuse | Protocol/host checks passed | SDK 2.4.0 real stdio search/get calls passed with legacy `2025-11-25` and pinned `2026-07-28`; Codex CLI 0.141.0 discovered both tools in an isolated process. No model turn or new chat was created. |
| P1: schema and permissions | Focused checks passed | Real PostgreSQL 18.7, separate app/worker roles, migrations, RLS, revision freezing and per-revision grants; fresh/incremental migration checks passed. |
| P2: retrieval and context | Focused checks passed | Full-text retrieval, exact/range environment checks, UTF-8 budgets and whole-record omission when critical context cannot fit. |
| P3: MCP and website | Implemented; browser acceptance in progress | Seven database-backed MCP tools; website search/detail, contributions/review, help exchange and owner activity. Native in-app browser search/science/detail/help inspection passed. |
| P4: consent and review | Core integration checks passed | Private quarantine, bounded screening, exact-revision review/consent, negative evidence and withdrawal. The help exchange separately gates question and reply sharing by their owners. |
| P5: evaluation and delivery | Pending | Complete fixture corpus, regression/e2e checks, measured retrieval and optional model comparisons. |

## P0 decisions

- Development uses verified project-local Node 24.22.3; npm is used because the machine's pnpm shim points to a missing package. The application supports Node >=22.12; the pinned container target remains Node 24.
- The official SDK's `serveStdio` factory is required to serve the 2026 and legacy eras correctly. Tests assert the actual negotiated protocol, not just successful tool listing.
- The Codex probe overrides MCP/catalog settings only for its child process. It reads one compatible existing model descriptor to satisfy host startup, but performs no inference and changes no user configuration.
- KnowledgePulse's published `@knowledgepulse/sdk@0.1.0` accepted the authored SOP fixture with `https://knowledgepulse.dev/schema/v1`; it rejected the currently documented `https://openknowledgepulse.org/schema/v1`. Namespace aliasing is explicit in the limited preview mapper. General compatibility is not claimed.
- The upstream SDK was tested in an ignored, isolated compatibility workspace. Its older validation and optional document/model dependency graph is not in the Nexus application dependencies. The main application uses a bounded Zod 4 contract and does not capture session traces.
- A small RO-Crate field-mapping preview preserves source references without claiming a fully validated scientific profile or executing anything.
- Apache-2.0 was selected by the project owner and applied. Third-party data/evidence rights remain explicit per record.

Runtime evidence containing local configuration stays in ignored `.nexus/`. Do not commit credentials, browser sessions, database files or full host tool inventories.

## Current verification

The current 23 checks passed: seven real-PostgreSQL storage/lifecycle tests, four HTTP boundary/session tests, three database-backed MCP tests, two protocol negotiation tests, two interoperability mapping tests, two bilateral help-consent tests and three bounded-context/screening tests. Tests use fresh task-owned databases and remove those databases after each test file. Fresh and incremental migrations both run against PostgreSQL 18.7. TypeScript/Vite build and formatting checks passed.

The owner selected Ollama Cloud with DeepSeek 4.1 Flash for actual requester evaluation. The existing local Ollama API successfully relayed a bounded connectivity check to that cloud model. This is a cloud-requester check, not evidence of small local model performance. Full task comparisons remain pending.
