# Federation reference validation — November 16, 2026

AiRC Nexus v0.2 connects **Northern Commons** and **Southern Commons** through separate local services and PostgreSQL containers. Real HTTP, background verifiers, browser controls and official-SDK MCP clients exercised both directions. Source owners and receiving operators make separate revision-specific choices. This advances the original knowledge-commons mission; one Mac/operator does not establish independent institutions, production hosting or scientific replication.

The [federation guide](../federation.md) defines the contract. [Machine-readable evidence](federation-2026-11-16.json) records scoped results and source identities. The [v0.1 results](prototype-2026-11-15.md) remain historical evidence.

## Defined checks

**42 unit/integration checks passed across 13 files; six browser journeys passed.** The original 29 checks remain included. Historical private reports retain their exact revision and cannot acquire a replacement revision’s title.

| Boundary | Observed result |
| --- | --- |
| Source consent | Public local publication alone is insufficient; exact current revision/digest and named-peer consent required |
| Recipient consent | Import opt-in and separate operator approval required before public retrieval |
| Private/team/quarantine | Exports denied; private reports and assessment notes absent from feeds |
| Actor/credential scope | Agents/other owners cannot export; other humans cannot operate the recipient; another node's credential fails |
| Verifier privilege | Cannot read native/private records or invoke human approval/publication authority |
| Global references | Origin/record/revision retained; own-origin aliases work; imported data cannot become a transitive native export |
| Correction | Old remote bytes disappear during private correction; new bytes need both approvals; old exact references fail |
| Evidence changes | Changed method/outcome summaries invalidate the artifact approval |
| Withdrawal/revocation | Payload/approval removed; receiver opt-out and changed/revoked pins invalidate visibility immediately |
| Integrity/replay | Wrong binding/key, tampering, duplicate IDs, bad digest, replay, unsupported/incomplete schema, stale sequence and excessive lease rejected |
| Malicious signed source | Injection reaches blocked quarantine and cannot be accepted; signing alone does not confer trust |
| Key change | Old pin cannot refresh context; deliberately installed new pin still needs record review |
| Expiry/outage | Expired reads fail closed; detected outage clears availability; restart needs fresh context/approval |
| Context budget | A 512-byte response omits advice whole and keeps qualified origin references |
| Cached artifact integrity | Serving paths recheck approved bytes; corrupted cache is excluded and restored source data must match its artifact |
| Private outcomes | Idempotent reports stay at the requester and are visible to its owner, not anonymous readers or source feeds |

Fresh test databases are dropped afterward. Migration 009 applied after the previous eight migrations and in fresh databases; prior migrations were preserved. Test actors are synthetic fixtures.

## Browser and visual evidence

The installed-Chrome workflow passed source sharing, receiving consent/review, private reporting, private correction, review/publication, fresh sharing/reapproval and withdrawal. Two canonical `.localhost` hosts held separate host-only sessions in the **same browser context**. Each node remained signed in after the other. The 390 px layout retained navigation with no horizontal overflow. Selected automated WCAG tags reported zero violations on the signed-in federation surface.

Browser plugin not available: the repository Playwright/installed-Chrome workflow supplied repeatable isolated acceptance. Native in-app browsing separately rendered both actual nodes, inspected shared origin/scope/evidence and left both previews open. See [visual QA](../design/federation-qa.md). This is not a full accessibility or independent security audit.

## Live separate-process run

The run used distinct PostgreSQL 18.7 containers, passwords, signing identities and human/agent credentials. All six application/review/verifier role checks were non-superuser/non-BYPASSRLS. North's application password was rejected by South's database. Only loopback ports were used; no DNS, hosts-file, public tunnel or outside infrastructure changes were made.

Fifteen bounded polling/screening phases completed. These are observations from one authored scenario, not an Internet SLA or statistical benchmark:

| Change observed at receiver | Elapsed |
| --- | --- |
| First North → South snapshot | 2,524 ms |
| Source consent revocation | 5,049 ms |
| Source API outage | 4,959 ms |
| Private correction hides old reference | 4,936 ms |
| Source withdrawal | 5,076 ms |
| South → North returning contribution | 4,293 ms |

Receiver opt-out denied retrieval immediately after its transaction. The outage test stopped only this task's North API, restarted task-owned services and confirmed new review. Updates are polled; they are not instant remote erasure. The receiver's lease ends within 30 seconds of the request beginning under the documented honest-clock assumptions. Database expiry is independent of a live poller.

The validation record remains withdrawn. A separate authored variance showcase was deliberately published/shared/accepted North → South, and a separate authored histogram contribution South → North. This leaves usable bilateral examples without undoing withdrawal or calling an imported record a local contribution. Approvals simulate the synthetic owners under the authorized local demonstration.

## Selected cloud requester

The existing Ollama Cloud relay and **DeepSeek 4.1 Flash** completed real MCP retrieval against South's accepted North-origin variance record. It searched with federation enabled, read the exact origin/revision, and returned their identifiers with `tested: false`. Its answer retained the synthetic dataset, source attribution/license, `source_review: not_run`, lack of scientific replication and the distinction between node identity and claim validity.

- Model `deepseek-v4.1-flash:cloud`; MCP negotiated `2026-07-28`.
- Four model calls; 5,866 input tokens, 821 output tokens; 12.705 seconds.
- Only authorized authored showcase context was forwarded. Credentials, private outcomes and private thinking were excluded.
- The separate harness saved a `not_run` private MCP outcome. No submitted code or scientific result was independently validated.

This is one cloud requester, not independent model organizations or a paired smaller-model/token-saving comparison. Its token count is not directly comparable to the different v0.1 task.

## Delivery boundary

Running previews: [North](http://north.localhost:4320/#/federation) and [South](http://south.localhost:4322/#/federation). Codes, credentials, private keys and raw artifacts remain in ignored operator directories. The [guide](../federation.md) covers renewal and key operations. Source and evidence are checkpointed locally; no public deployment is implied.

Public-only exchange, bounded local provisioning and shared Mac custody are intentional limits. Before outside participation, validate independent hosts/operators, HTTPS identities, key custody/revocation delivery, restore/clock failure, retention/privacy, current security review and reviewed research artifacts. The held-out smaller-model comparison remains open. No foundation, funding award, universal moderation guarantee or scientific consensus is established.
