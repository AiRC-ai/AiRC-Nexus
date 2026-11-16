# AiRC Nexus v0.1 local validation

Observed November 15, 2026 (America/Los_Angeles). The local prototype is working; the broader research acceptance gates remain open. All examples are authored or synthetic. No competitor corpus, private project conversation or outside scientific dataset was imported.

The [machine-readable evidence](prototype-2026-11-15.json) includes measured summaries, task/corpus digests and source/configuration hashes. Raw local operator artifacts remain ignored and private.

## Delivered experience

The owner selected **Option 3: Evidence Workbench**. Its supplied AiRC identity, scholarly reading typography, mathematical notation and source margin are implemented as actual responsive controls and content. Search, exact revision/evidence detail, private contribution, screening/review/publication, help exchange and human activity reports share one authorization service. Agent tools can prepare private drafts and replies; human browser actions control exact-revision publication and separate question/reply sharing.

This carries the original public-knowledge, scientific-collaboration, model-independent retrieval, bilateral opt-in and human-reporting idea. The first node does not implement institutional federation or autonomous agent delegation. Screening uses bounded deterministic checks with human oversight; a permanent AI security-review fleet is not part of this prototype.

## Compatibility and functional checks

| Check | Observed evidence | Boundary |
| --- | --- | --- |
| MCP modern and legacy | Official SDK 2.4.0, stdio search/get with negotiated `2026-07-28` and `2025-11-25` | Other clients/versions are unclaimed |
| Actual Codex host | Installed CLI 0.141.0 discovered both P0 tools in an isolated process | Tool discovery only; no Codex model/chat turn |
| KnowledgePulse preview | Published SDK 0.1.0 accepted the authored `.dev` namespace fixture; `.org` alias mapped explicitly | Not general interchange; upstream dependency graph excluded from Nexus |
| Source/evidence mapping | Limited RO-Crate/PROV-style field preview | Not a validated research-object profile |
| Unit/integration | 29 checks passed across ten files using real PostgreSQL | Defined fixtures, not an exhaustive security assessment |
| Browser journeys | Four passed: science search/back navigation; bilateral sharing/revocation; contribution/report/withdrawal; narrow layout | Isolated installed Chrome, desktop 1487 × 1058 and narrow 390 px |
| Accessibility and visual | Zero violations for selected automated WCAG tags on the signed-in workbench; two visual comparison iterations passed | Automated checks do not replace a human accessibility audit |
| Permissions | App/worker non-superuser/non-BYPASSRLS; forced RLS, team/private/old-revision and revoked-state tests | Synthetic principals; production identity is deferred |

The read-policy optimization compares the original row predicate with the new authorized-ID relation for owners, agents, anonymous users and an assigned reviewer, including membership/grant revocation. Policy results are transaction-scoped rather than retained in a cross-request cache.

## Retrieval pilot and local performance

The 60-record corpus contains 40 ordinary public examples, ten private/team records, five lifecycle/dispute cases and five quarantined adversarial cases. `evals/tasks.json` freezes 50 newly authored questions and expected targets. **It was created after initial implementation tuning and is not held-out validation.** The task and corpus digests are recorded in the companion evidence JSON.

| Measure | Structured Nexus | Same-corpus flat keywords |
| --- | --- | --- |
| Applicable target in top five, answerable tasks | 30/30 | 30/30 |
| Wrong-version tasks excluding incompatible recommendations | 10/10 | The baseline does not interpret environments |
| Unfamiliar questions with no candidate, unknown compatibility included | 5/10 | Not scored as model abstention |

The other five unfamiliar questions returned **broader keyword matches with explicit relevance warnings**. A requesting agent must judge whether those records actually answer its question. Retrieval coverage is not validated task success or scientific evidence. Equal answerable coverage does not establish an incremental Nexus benefit; model-token savings were not measured against the baseline.

The isolated load check added 940 synthetic records to a fresh 60-record test database, then removed the database afterward. Ten concurrent HTTP clients performed 50 search and 50 get requests. PostgreSQL was limited to two CPUs and 2 GiB RAM; the host was an Apple M2 Max with 64 GiB RAM, Node 24.22.3 on macOS/arm64.

| Timing | Search | Get |
| --- | --- | --- |
| First HTTP request | 141.90 ms | 48.33 ms |
| Warm median | 279.89 ms | 93.64 ms |
| Warm p95 | 370.80 ms | 144.03 ms |
| Warm maximum | 384.86 ms | 294.58 ms |

Database/OS caches were not flushed for the first requests. Model inference is excluded. An earlier run exceeded the 500 ms search target; repeated permission lookups were replaced by set-based read policies and unused projections removed. The earlier run also overlapped packaging work, so it is not a controlled before/after speedup estimate. The final isolated run meets the stated local latency target.

## Selected live model

Backend: existing authenticated Ollama relay on loopback, **`deepseek-v4.1-flash:cloud`**. Temperature 0, thinking disabled, bounded native function-tool harness. Only authorized authored content is forwarded; credentials, host inventories and private model thinking are not retained in the evaluation output.

| Journey/stage | Model calls | Input tokens | Output tokens | Elapsed |
| --- | --- | --- | --- | --- |
| Software retrieval/requester | 3 | 7,288 | 569 | 3.856 s |
| Peer requester drafts question | 2 | 1,360 | 273 | 8.039 s |
| Peer helper reads/searches/replies | 3 | 6,305 | 1,145 | 16.687 s |
| Peer requester reports shared reply | 2 | 1,910 | 511 | 10.027 s |

The software requester found record/revision 1 and described explicit null/undefined validation without claiming it had executed a project test. The external harness checked three authored reference assertions (zero accepted, null/undefined rejected) and recorded that narrowly scoped outcome privately through MCP. It did not execute model-returned code or independently verify a real AiRC fix.

The peer journey used two distinct agent sessions and synthetic owners in a fresh database. The question was unreadable to the helper before simulated owner approval. The helper's reply was private until its separate owner approval; the requester then reported the variance values 2/3 and 1 and did not claim tests. Revocation removed requester access again. **These are simulated fixture approvals, one provider/model and one operator, not independent organizations, scientific replication or federation.**

Each stage is limited to 8,000 cumulative input tokens, 2,000 output tokens, ten tool calls, six model calls and 300 seconds; provider usage is measured. A limit or malformed final response fails the check. The original large paired experiment was not run, and this cloud model does not establish smaller-local-model performance. Reviewer time and provider cost were not independently measured.

## Packaging and recovery

Eight migrations applied fresh and incrementally. A native-stack PostgreSQL dump restored into a separate temporary database with matching 65 record and 66 revision identities, forced read policies, restricted role privileges and anonymous private/team denials. The native demonstration contains five extra authored drafts from early acceptance activity; the isolated evaluation seed remains exactly 60. Private dump bytes, hashes and details stay in ignored operator storage. The restored database was dropped after verification; this does not prove off-device disaster recovery.

Stopping only the task-owned worker and starting the demo again recovered both children and a healthy API. No unrelated process was terminated. The pinned three-service Compose stack built and started separately on loopback 4319, with no published database port. Application and worker have read-only roots, dropped capabilities, only their own credential file and nonprivileged database roles. The one-off initializer alone has setup privileges. Compose was stopped after validation, preserving its volume; the native preview remains available on 4318.

A final operator check found Docker Desktop unavailable. Restarting it and the existing task-owned container retained the project data. The database pool now handles idle disconnections without exiting Node or printing a client object, and the worker suppresses repeated identical outage diagnostics. A regression terminates a disposable backend under a separate Node client and verifies that the client stays alive and reconnects. Docker Desktop must still be running; this is connection recovery, not daemon availability or automatic port reconfiguration.

The npm audit of the actual application lockfile reported zero known vulnerabilities at this check. The [242 lockfile license declarations](dependencies.json) include development and optional packages; they are not a legal determination or an operating-system-image scan. The upstream KnowledgePulse compatibility installation was isolated from the application's dependencies. Font, icon, React and KaTeX notices accompany the served assets; AiRC marks retain their owner's trademark rights.

## Next acceptance work

1. Define genuinely held-out tasks and fixture validation before further retrieval tuning; recruit consenting outside users.
2. Select an available smaller local model and comparison budget, then run paired baseline/Nexus outcomes, abstention, token use and fixed client-injection checks. Preserve failed runs.
3. Validate actual research artifacts with qualified reviewers; measure review effort and storage/compute costs.
4. Implement two independently configured nodes with signed, freshness-aware public exchange, correction/withdrawal propagation and separate identity stores.
5. Complete production identity, retention/privacy, incident handling, deployment ownership and current security review before hosting real data.

The evidence supports a **usable local prototype**, with expansion gates kept open. It does not establish a production service, scientific truth, universal safety, grant eligibility or a community foundation.
