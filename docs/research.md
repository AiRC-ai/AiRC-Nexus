# Research index

Reviewed: November 15, 2026. The project remains at concept and research stage.

## Current deliverables

| Document | Contents |
| --- | --- |
| [Existing work and prototype implications](research/landscape-2026-11-15.md) | Direct competitors, selected source-code observations, scientific standards, protocol choices, and build/reuse conclusions |
| [Source snapshots](research/source-snapshots-2026-11-15.json) | Exact commits for eight repositories and hashes/URLs for 37 retrieved files; retrieval is not a full code audit |
| [Concrete prototype plan](prototype-plan.md) | Recommended stack, scope, data/permission model, API/MCP operations, evaluation, work packages, estimates and expansion gates |

## Main findings

KnowledgePulse, Abund.ai and Context8 already overlap directly with reusable agent knowledge. Documentation/context systems and agent-memory systems supply additional baselines. Nexus must establish its value through measured outcomes, privacy, usable evidence and independent participation; a unique market position has not been demonstrated.

Abund.ai's website describes it as open source, but its pinned [repository license](https://github.com/abund-ai/abund.ai/blob/ec383047aaeecefdde4463c906df7e2ae612e7bd/LICENSE.md) restricts competing and hosted services. It is not the proposed fork foundation. KnowledgePulse is a closer reusable protocol candidate, with specific schema, evidence and access-control questions documented in the landscape review.

[Nanopublications](https://nanopub.net/), [RO-Crate](https://www.researchobject.org/ro-crate/specification/1.3/index.html) and [PROV-O](https://www.w3.org/TR/prov-o/) provide substantial scientific knowledge/provenance foundations. Evaluate mappings and references instead of assuming Nexus must invent all of those conventions.

The recommended next engineering step is a bounded interoperability and reuse spike, followed by a local evidence-reuse loop. Federation and A2A assistance have later, separate acceptance gates. See the prototype plan for the exact sequence and proposed thresholds.

## Funding and stewardship leads

- [NSF Pathways to Enable Secure Open-Source Ecosystems](https://www.nsf.gov/funding/opportunities/pesose-pathways-enable-secure-open-source-ecosystems): investigate fit only against the current solicitation, eligible applicant and demonstrated project maturity.
- [Alfred P. Sloan Foundation Open Source in Science](https://sloan.org/programs/digital-technology/open-source-in-science): investigate alignment with scientific software communities and sustainable stewardship.

No eligibility determination, partner commitment, application or funding award has been established. Current applicant rules, deadlines, award terms and institutional responsibilities require their own review before any application. Unawarded funding is not assumed in the prototype operating plan.

## Research still needed

- Actual runtime interoperability with the required hosts and a smaller-model requester.
- Matched-corpus retrieval/outcome benchmarks and measured review costs.
- Interviews and contributions from independent developers, researchers and prospective operators.
- A complete security assessment before real-data intake or network exposure.
- Scientific domain review and tested cross-node correction, withdrawal and identity semantics.

No external registration, outreach, service integration, data contribution or model benchmark was performed in this research pass. Claims about existing projects are bounded by the reviewed primary sources and pinned code paths.
