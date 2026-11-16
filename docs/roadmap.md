# Research and pilot roadmap

Status: Proposed milestones. This is a sequence of validation gates, not a delivery schedule or a commitment to a particular implementation stack.

## 0. Establish the concept repository

Publish the founding vision with architecture, security, governance, research references, and this roadmap. Keep the distinction between intention and demonstrated behavior visible.

Exit evidence: the public repository contains these documents, local and remote revisions match, and implementation and licensing status are explicit.

## 1. Define the pilot and contribution rules

Select one narrow class of software problems and one computational research use case with appropriately authorized, shareable evidence. Define a minimum Knowledge Unit, applicability fields, evidence assessments, and the intended human reporting workflow.

Compare existing knowledge-sharing projects before deciding whether to build a new core, contribute upstream, or supply an interoperable profile. Select licenses before accepting implementation contributions. Name the pilot operators and review owners.

Exit evidence: accepted pilot brief, licensed contribution policy, a small permissioned example corpus, recorded alternatives, a security design review, and a predeclared evaluation plan.

## 2. Demonstrate useful retrieval

Build a minimal search interface and MCP/API adapter over the pilot corpus. Return bounded, structured context with exact record revisions, evidence, source references, applicability limits, and explicit misses. Compare simple retrieval approaches before adding costly model processing.

Use public, synthetic, or explicitly authorized material. Do not harvest private project histories to seed the index.

Exit evidence: at least one smaller local model and another independent client can retrieve and use the records; incompatible environments and disputed results are visible; evaluation compares outcomes, latency, and cost with a baseline search workflow.

## 3. Demonstrate opt-in contribution and review

Add private drafts, local minimization, authorized upload, quarantine, evidence checks, owner-controlled publication, independent review, and correction/withdrawal handling. Reproduction execution is optional and separately authorized under isolation controls.

Exit evidence: a solution can be contributed and independently reused; negative evidence remains visible; sensitive or malicious fixtures are handled as intended; review failures and reviewer outages do not grant publication permission; human review load and resource use are measured.

## 4. Demonstrate a small federation

Connect two or three independently operated nodes. Exercise public references and explicitly authorized restricted exchange without centralizing the underlying private datasets. Negotiate supported versions and enforce authorization at every participating node.

Exit evidence: cross-node retrieval, revision discovery, negative evidence, correction, withdrawal, key revocation, node outage, and denied access are exercised. Declare propagation and caching limits and show that restricted metadata does not enter public discovery.

## 5. Evaluate bounded agent collaboration

Only after retrieval demonstrates value, test agent assistance for unresolved questions. Evaluate A2A interoperability, task scope, consent, deadlines, cancellation, compute budgets, and evidence returned to the requester. Agents report results and uncertainty to their humans.

Exit evidence: collaboration improves selected unresolved cases at a measured cost; refusal, timeout, cancellation, and malicious responses are handled; tasks cannot silently expand their scope or delegate indefinitely.

## 6. Decide whether and how to expand

Invite external contributors and researchers to assess results. Refine domain-specific evidence rules, accessibility, governance, operational capacity, and sustainability. Evaluate institutional partners and funding only against demonstrated demand and the relevant program requirements.

Exit evidence: a public pilot report covering successes, failures, costs, security limitations, external reuse, and a reasoned decision to expand, revise, integrate upstream, or stop.

## Evaluation design

Predeclare tasks, inclusion criteria, corpus versions, model/client versions, budgets, and scoring before running comparisons. Keep evaluation tasks separate from corpus construction where possible, retain failures, and avoid letting an agent grade its own claims as the only measure.

| Question | Proposed measure |
| --- | --- |
| Does retrieval help? | Fraction of eligible tasks resolved under a defined validation procedure, compared with ordinary search/documentation |
| Does context stay useful and small? | Retrieved tokens/bytes, truncation disclosures, missing critical limitations, and outcome by model |
| Is knowledge applicable? | Correct version/environment matches, explicit abstentions, and incompatible recommendations |
| Can others reuse it? | Outcomes reported by separately identified participants, with declared affiliations and actual evidence |
| Is it affordable? | End-to-end time, inference tokens, indexing/storage use, reproduction compute, and reviewer minutes |
| Is contribution control effective? | Authorization violations, privacy leaks in a fixed test set, consent failures, and withdrawal propagation |
| Does review withstand abuse? | Attack successes, missed malicious content, false positives, escalations, and review latency |
| Is science represented honestly? | Source traceability, method/data availability, stated uncertainty, expert review, and limits on reproduction claims |

Set numerical success and stop thresholds with pilot participants before implementation evaluation. Report denominators and uncertainty; a successful small trial is not evidence of universal reliability or general scientific validity.

## Deferred scope

Universal web-scale indexing, automatic bulk transcript capture, unrestricted remote execution, payments or knowledge marketplaces, permanent large-model moderation infrastructure, and legal foundation formation are outside the initial pilot. Reconsider them only after evidence and governance justify the added scope.
