# Security and privacy proposal

Status: Design requirements for a future prototype. No security controls, moderation service, or validation infrastructure have been implemented or tested by this repository.

The [v0.1 prototype plan](prototype-plan.md) starts with local fixtures, deterministic screening and human review. It excludes arbitrary submitted-code execution, unrestricted URL fetching, public hosting and a permanent AI moderation service. The broader controls below apply as those capabilities are evaluated for later stages.

## Security objective

Permit useful knowledge exchange while protecting contributors' information, preserving the integrity of evidence, and keeping execution authority with the responsible human or organization. Treat remote nodes, knowledge records, attachments, tool descriptions, and agent messages as untrusted inputs.

AI review can assist screening and triage. It cannot guarantee the absence of malicious content, establish scientific truth, or grant itself permission to publish or execute something.

## Consent and data boundaries

- Participation is opt-in. Retrieval access and contribution permission are separate capabilities.
- New contributions begin as private drafts. Public or group publication requires an explicit decision covering the exact reviewed material and audience, or a clearly scoped standing policy chosen by its owner.
- Minimize and sanitize queries as well as contributions; an error message can expose proprietary code, personal information, or infrastructure details.
- Review what leaves the client before upload. Do not send raw conversations, private reasoning traces, credentials, full repositories, or unpublished research by default.
- Preserve source rights, attribution, visibility restrictions, and limits on downstream use with each revision and artifact.
- Apply permissions to searches, snippets, counts, embeddings, caches, reviewer access, and telemetry as well as primary records.
- Define retention, withdrawal, revocation, and correction behavior before collecting real user data. Do not promise to erase copies already obtained by public recipients.

## Proposed review pipeline

1. **Intake:** authenticate the contributor, authorize the destination and visibility, validate the schema, enforce size/rate limits, and quarantine attachments.
2. **Screening:** check for secrets, personal information, malicious payloads, prompt injection, and missing source permissions. Scanning is a fallible control, not proof that sharing is safe.
3. **Independent review:** separate reviewer identities and privileges from contributors. AI reviewers receive bounded inputs and no automatic authority to act on embedded instructions.
4. **Evidence checks:** inspect claimed methods, environment compatibility, test artifacts, contradictions, and whether supposed independent reviewers are related.
5. **Authorized execution, when justified:** run a reproduction only in a disposable, isolated environment with explicit resource limits and permitted dependencies. Default to no secrets, no privileged host access, and no network egress.
6. **Publication:** require both policy acceptance and the owner's sharing authorization for the reviewed revision. Failed, unavailable, or inconclusive review keeps a record quarantined or clearly restricted under the chosen policy.
7. **After publication:** accept abuse reports, corrections, failed replications, and withdrawals; invalidate affected search results and caches according to the federation policy.

Low-risk text and executable artifacts require different review paths. Human escalation criteria, reviewer budgets, appeals, and an emergency removal procedure must be defined before opening public intake.

## Threats and intended controls

| Threat | Required design response |
| --- | --- |
| Prompt injection and tool misuse | Keep retrieved text in a data boundary; never promote it into system instructions, permissions, or automatic tool execution |
| False knowledge and coordinated confirmations | Attach reviews to evidence and exact revisions; record affiliations; preserve dissent; do not equate votes or identities with correctness |
| Private data leakage | Local minimization, scoped credentials, private defaults, source-aware access checks, and restricted logs and derived indexes |
| Malicious code or attachments | Quarantine, safe parsing, isolated reproduction, bounded dependencies, and manual escalation |
| Compromised or dishonest nodes | Per-request authorization, verified origins, bounded trust policies, revocation, and the ability to disconnect a peer |
| URL-based access to internal services | Restrict fetch destinations and redirects, reject private/internal targets where inappropriate, and apply egress controls to discovery and artifact retrieval |
| Abuse and runaway resource costs | Quotas, compute budgets, timeouts, cancellation, bounded agent delegation, and operator stop controls |
| Stale or retracted findings | Version-aware retrieval, validity labels, withdrawal propagation, and cache invalidation |
| Scientific overclaiming | Domain-specific review, explicit methods and uncertainty, qualified human oversight, and separate analysis reproduction from independent replication |

## Identity and cryptographic provenance

Evaluate established signing and provenance systems before introducing custom cryptography. Signatures can help establish who supplied a particular artifact and whether it changed. They cannot certify that an assertion is true, that a reviewer is independent, or that code is safe.

Define how identities are established, how keys are stored and recovered, how compromised identities are revoked, and how a node learns of that revocation. A verified identity must not acquire unrestricted trust across the federation.

## Protocol and operational boundaries

Use resource-scoped authorization and least privilege. A Nexus service must not become a proxy that forwards a user's unrelated credentials to arbitrary peers. The official [MCP security guidance](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices) discusses token passthrough, confused-deputy risks, and server-side request forgery; implementation must select and review a specific supported specification version.

Establish dependency review, secret handling, audit access, backups, recovery, patching, operator accountability, and a confidential vulnerability reporting channel before hosting a pilot. Audit records should preserve decisions and necessary provenance without retaining prohibited content.

## Pilot acceptance evidence

- A restricted record cannot be discovered through search, metadata, embeddings, caches, or a peer query by an unauthorized caller.
- A malicious record cannot cause the supported reference client to execute code, disclose secrets, change policy, or delegate without authorization.
- An update invalidates stale reviews; a retraction or access revocation reaches participating nodes within a declared bound.
- An unavailable reviewer cannot silently approve publication. A denied or cancelled collaboration request cannot continue consuming unbounded resources.
- A sandboxed reproduction cannot reach host credentials or prohibited network destinations.
- A failed replication remains visible and affects the record presented to the next user.
- False positives, missed attacks, human review load, and compute costs are measured and reported.

These are future acceptance criteria. Passing a limited test set would provide bounded evidence, not a guarantee about all clients, nodes, or content.
