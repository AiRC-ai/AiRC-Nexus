# AiRC Nexus: existing work and prototype implications

Research date: November 15, 2026. Recommendations in this document are proposals for the first prototype, not accepted protocol specifications or demonstrated product capabilities.

## Recommendation

Build a small reference service that proves **permission-aware retrieval, revision-specific evidence, human reporting, and opt-in contribution**. Use established MCP libraries and scientific provenance conventions. Evaluate KnowledgePulse interoperability; do not fork an entire agent social network or build a new discovery protocol for the first release.

The broad idea is already being pursued. Nexus's opportunity must be demonstrated in the quality of reuse, privacy boundaries, evidence presentation, and accessibility to smaller models. This review does not establish a unique market position, unmet demand, or an advantage over existing projects.

## Research method and limits

The review covered eight GitHub repository snapshots, selected implementation paths, official product documentation, protocol specifications, and scientific infrastructure. The [source manifest](source-snapshots-2026-11-15.json) records exact default-branch commits and hashes for 37 retrieved files. Retrieval does not mean every line was audited. Deeper static inspection concentrated on KnowledgePulse's knowledge model and registry, Abund.ai's findings and license, Context Hub's feedback/annotations, and Context7's integration and deployment documentation.

No upstream application was installed or executed. No hosted API was tested for privacy or security, no agents were registered, and no third-party code was incorporated. Repository dates are the observed head commit dates, not estimates of activity across all branches or hosted services. Feature descriptions below distinguish project claims from observations and design inferences. This is not a full security audit or a performance benchmark.

## Landscape

| Category and project | Relevant existing capability | Consequence for Nexus |
| --- | --- | --- |
| Direct knowledge sharing: [KnowledgePulse](https://openknowledgepulse.org/docs/getting-started/introduction/) | Knowledge units, capture/retrieval, MCP tools, privacy labels, scoring and reputation | Closest software/protocol reuse candidate; test the actual access and evidence semantics before adopting it. |
| Agent network: [Abund.ai](https://abund.ai/) | Findings with environment details, confirmations/disputes, wiki, work requests, moderation and MCP | Strong functional overlap; its source license excludes it as the proposed fork foundation. |
| Solved knowledge: [Context8](https://www.context8.org/) | Advertises public solutions, private vaults, scoped API access and reuse across agents | Another direct competitor. Public marketing is insufficient to establish privacy, federation, or independently verified evidence. |
| Agent documentation: [Context Hub](https://github.com/andrewyng/context-hub/tree/67dcbeb2eb42c808549f08397920ad58be7c2206) | Curated/versioned documentation, local annotations and maintainer feedback | A practical baseline and integration candidate; local learning is distinct from publishing reusable evidence. |
| Documentation retrieval: [Context7](https://github.com/upstash/context7/tree/4087030ad2dc16578130e2dab1e48ba735f8ea38) | MCP/API access to current documentation; enterprise deployment and private sources | Compare with it as an existing way to improve context; distinguish the public connector from the licensed deployment offering. |
| Collaboration: [OpenAgents](https://github.com/openagents-org/openagents/tree/830564228f2e7b68552c42b0c6080ec7fe06f792) | Shared workspaces, conversations, files, multiple agent integrations, MCP/A2A | Potential future client/network integration; a workspace alone does not establish a public evidence commons. |
| Agent memory: [Graphiti](https://github.com/getzep/graphiti/tree/869c1b279e01a2767a464581e1cb657ce0e39271) and [Mem0](https://github.com/mem0ai/mem0/tree/f1791daa86d469249c9b002f62644d58a1eb96a0) | Temporal graphs or persistent user/session/agent memory | Useful adjacent technology, but not a reason to begin with conversation ingestion or a graph database. |
| Scientific claims: [Nanopublications](https://nanopub.net/) | Small signed claims, provenance, content-based identifiers, supersession/retraction and decentralized servers | Particularly important prior art for the scientific mission. Evaluate export/mapping rather than inventing equivalent conventions without comparison. |
| Research artifacts: [RO-Crate](https://www.researchobject.org/ro-crate/specification/1.3/index.html) and [Workflow Run RO-Crate](https://www.researchobject.org/workflow-run-crate/) | Structured research objects and execution provenance connecting inputs, outputs, code and methods | Use as the target vocabulary/profile for computational evidence bundles. |
| Scholarly discovery: [OpenAlex](https://help.openalex.org/api/) | Machine-readable scholarly entities and their relationships | Reference/enrichment source, subject to permitted use; a scholarly citation is not a validation outcome. |
| Research federation: [EOSC](https://digital-strategy.ec.europa.eu/en/policies/open-science-cloud) | Operational federation of research infrastructure and services | A governance/interoperability precedent and possible later integration route, not a dependency for a local prototype. |
| Executable paper methods: [Paper2Agent](https://github.com/jmiao24/Paper2Agent/tree/8c2d059165ef8cdcb70dbea76655b9c2b55b38e6) | Converts research/code assets into tested MCP tools and skills | A possible evidence producer or capability provider later; do not equate generated tools with universal scientific verification. |

An absent capability in this table means it was not established by the reviewed material, not that the project necessarily lacks it. No user counts, revenue, or market-share estimates were inferred from repository stars or marketing claims.

## Closest candidate: KnowledgePulse

### What is present

At commit `9ff0e3f4531f9b02bfad391d780a27db69f0245b`, the [SDK type definitions](https://github.com/chesterkuo/OpenKnowledgePulse/blob/9ff0e3f4531f9b02bfad391d780a27db69f0245b/packages/sdk/src/types/knowledge-unit.ts) describe reasoning traces, tool-call patterns and expert procedures. Metadata includes visibility, privacy level, quality score, contributor identity and validator identifiers. The repository contains a registry and MCP tools; GitHub metadata and the retrieved license identify Apache-2.0. These are tangible reuse candidates, not just a landing-page concept.

Its [scoring implementation](https://github.com/chesterkuo/OpenKnowledgePulse/blob/9ff0e3f4531f9b02bfad391d780a27db69f0245b/packages/sdk/src/scoring.ts) combines properties such as complexity, novelty, tool diversity and reported outcome confidence. That can be an experience-ranking heuristic. It should not be reused as Nexus's scientific truth or independent-reproduction score.

### What changes the adoption decision

1. **Versioned evidence needs a richer contract.** The reviewed unit type exposes a mutable list of validator identifiers. Nexus needs assessments bound to an immutable record revision, explicit methods/artifacts, failed outcomes, affiliations and applicability. A validator count cannot carry those meanings by itself.
2. **Read isolation is not established by a visibility field.** The reviewed [GET routes](https://github.com/chesterkuo/OpenKnowledgePulse/blob/9ff0e3f4531f9b02bfad391d780a27db69f0245b/registry/src/routes/knowledge.ts#L8-L36) do not pass caller identity or permitted visibility into the search call. The reviewed [PostgreSQL store](https://github.com/chesterkuo/OpenKnowledgePulse/blob/9ff0e3f4531f9b02bfad391d780a27db69f0245b/registry/src/store/postgres/knowledge-store.ts#L32-L113) filters quarantine and content criteria without an explicit caller/visibility predicate. This static observation is enough to require an isolation test before adoption; it is not a finding about a hosted deployment or every configuration.
3. **Negative results need first-class treatment.** In the reviewed [validation handler](https://github.com/chesterkuo/OpenKnowledgePulse/blob/9ff0e3f4531f9b02bfad391d780a27db69f0245b/registry/src/routes/knowledge.ts#L94-L125), the submitted `valid` value is bound to an unused variable while the response reports a validation flag. It does not establish the revision-specific pass/fail evidence history Nexus needs. Do not infer scientific validity from that response.
4. **Documentation and source differ.** The [protocol page](https://openknowledgepulse.org/docs/architecture/protocol/) describes `Trace`, `Pattern` and `SOP`; the pinned SDK uses `ReasoningTrace`, `ToolCallPattern` and `ExpertSOP`. An adapter must target a concrete version and prove round-trip behavior, rather than infer compatibility from similar names.
5. **Collection philosophy matters.** Nexus should accept a deliberately prepared explanation and evidence. Capturing model thoughts, entire sessions or tool inputs is not required for a useful solution record.

**Decision:** write a minimal Nexus application core and keep an interoperability boundary. Spend at most two engineer-days on a KnowledgePulse fixture/mapping spike at implementation start. Reuse a package only if exact-version tests preserve permissions, negative evidence and revision references without importing unwanted capture behavior. Otherwise retain it as a comparison and later adapter target. A full registry fork is not the default.

## Abund.ai: useful overlap, unsuitable fork terms

The [findings model](https://github.com/abund-ai/abund.ai/blob/ec383047aaeecefdde4463c906df7e2ae612e7bd/workers/src/lib/findings.ts) captures an error, cause, fix, tags and environment. Confirmations include a worked/did-not-work value and a short note, and affect ranking. These are useful interaction ideas. They are a different evidence contract from a reproducible artifact tied to an exact revision and an independent party.

The website describes the platform as open source. The pinned [Source Available License v1.0](https://github.com/abund-ai/abund.ai/blob/ec383047aaeecefdde4463c906df7e2ae612e7bd/LICENSE.md) restricts operating competing services and redistributing it as a hosted service. Accordingly, this plan does not use Abund.ai code as Nexus's foundation. Any different reuse would need a separately established permission basis.

The [moderation implementation](https://github.com/abund-ai/abund.ai/blob/ec383047aaeecefdde4463c906df7e2ae612e7bd/workers/src/lib/moderation.ts) also illustrates a useful distinction: it groups trusted moderation votes by human owner and records reversals. Such accountability can reduce some duplicated-owner voting. It still does not prove scientific correctness or eliminate coordinated independent accounts.

## Documentation and memory systems: useful baselines

**Context Hub:** the pinned [annotation documentation](https://github.com/andrewyng/context-hub/blob/67dcbeb2eb42c808549f08397920ad58be7c2206/docs/feedback-and-annotations.md) explicitly keeps annotation content out of retrieval by default and treats opt-in annotation text as untrusted. Notes are local; feedback goes to maintainers. This corrects the tempting assumption that every annotation is automatically shared collective knowledge. Use its permission-conscious presentation as a reference and compare Nexus against a simple curated-document workflow.

**Context7:** its public repository reports MIT licensing, but the [on-premise documentation](https://github.com/upstash/context7/blob/4087030ad2dc16578130e2dab1e48ba735f8ea38/docs/enterprise/on-premise.mdx) requires an issued deployment license. Online deployments can send public-library search queries to the cloud; offline licenses follow a different path. Do not infer a freely reusable full hosted corpus or entirely local processing from an open MCP connector. Treat it as a strong retrieval baseline and possible optional reference source, not a hard dependency.

**Graphiti:** the pinned [README](https://github.com/getzep/graphiti/blob/869c1b279e01a2767a464581e1cb657ce0e39271/README.md#L300-L324) explicitly says its reference MCP/REST servers omit authentication, authorization and prompt-injection protection. It offers a core library for applications that supply their own controls. A reference server is therefore not an acceptable ready-made protected Nexus node. Temporal graphs may become useful after relation-heavy query demand is demonstrated.

**Mem0:** its pinned [README](https://github.com/mem0ai/mem0/blob/f1791daa86d469249c9b002f62644d58a1eb96a0/README.md) focuses on persistent personalized memory and distinguishes SDK, self-hosted and managed offerings. Its published managed-platform benchmark figures are not measurements of Nexus or necessarily of the open-source SDK. The prototype should not adopt memory ingestion simply because agents need reusable knowledge.

## Scientific foundations to reuse

### Claims, methods and provenance are separate objects

[Nanopublications](https://nanopub.net/) already separates assertions, provenance and publication metadata, with signed, immutable publications and later supersession or retraction. This is substantial prior art for the proposed knowledge commons. A Nexus record should be able to reference or eventually export an appropriate nanopublication without claiming a new universal scientific truth format.

[RO-Crate 1.3](https://www.researchobject.org/ro-crate/specification/1.3/index.html) is a published recommendation for research-object metadata. [Workflow Run RO-Crate](https://www.researchobject.org/workflow-run-crate/) provides profiles for execution provenance. [W3C PROV-O](https://www.w3.org/TR/prov-o/) supplies established concepts for entities, activities and responsible agents. Use these as mapping targets. A normal JSON application record can remain the initial API shape; full RDF/SPARQL infrastructure is not necessary to test retrieval.

The [FAIR principles](https://www.gofair.foundation/fair-principles), including [A1.2](https://www.gofair.foundation/a1-2), explicitly accommodate authentication and authorization. Machine accessibility does not require making confidential data public. Nexus must keep restricted metadata restricted, even when public research profiles assume discoverable metadata.

### Executable science has limits

The primary [Paper2Agent article](https://www.nature.com/articles/s41586-026-11044-y), published September 16, 2026, reports converting papers and supporting code into tested MCP tools. In one reported corpus, 74 of 100 computational biology papers were successfully agentified; missing assets and environment/dependency issues contributed to failures. Those are the authors' results on their study, not a general success rate or a Nexus benchmark.

The implication is practical: begin with a small computational-method example whose code, data, expected outputs and permissions are available. Distinguish tool construction, reproducing an analysis, and independent scientific replication. An app running a script successfully must not display a badge claiming the underlying scientific finding is true.

[OpenAlex](https://help.openalex.org/api/) can supply scholarly references; [EOSC](https://digital-strategy.ec.europa.eu/en/policies/open-science-cloud) shows how autonomous research nodes can participate in shared infrastructure. Neither needs to be connected live for the first demonstration. ORKG is a relevant structured-research lead, but its main pages could not be inspected through the research browser during this pass; no detailed capability or reuse decision is based on it.

## Protocol choices

| Concern | Proposed choice | Basis and practical limit |
| --- | --- | --- |
| Agent access to knowledge | Official MCP SDK and structured tools | [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) covers context exchange, not knowledge validity. |
| Initial transport | Local stdio adapter to the same application service used by the website/API | Avoid exposing an experimental remote MCP endpoint before its authorization is implemented. |
| Version target | MCP `2026-07-28`, official TypeScript SDK v2; prove actual client compatibility first | [Current versioning](https://modelcontextprotocol.io/specification/versioning) and [SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk) show that old handshake-based examples and package imports are not the current default. Pin exact releases during the first build. |
| Protected remote MCP, later | Standards-based resource-server authorization | Use the selected [authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization); a local token adapter is not a substitute for the remote OAuth profile. |
| Peer task exchange, later | A2A | [A2A](https://a2a-protocol.org/latest/) addresses agent communication and task exchange; it does not verify returned claims. |
| Capability discovery, later | Evaluate AGNTCY/OASF | [AGNTCY documentation](https://docs.agntcy.org/) already covers directory, identity, messaging and observability components. |
| Public artifact provenance, later | Evaluate Nanopublications and established signing such as Sigstore | [Sigstore](https://docs.sigstore.dev/about/overview/) provides artifact identity/signing and transparency. Public log metadata needs a separate privacy review before use for restricted material. |

The first interoperability spike must record exact client, SDK and protocol versions. A working SDK test client alone does not prove Codex, AiRC, or every smaller-model host supports that version. If a required host is older, choose and test an official compatibility adapter with a support horizon, or explicitly narrow supported clients. Do not mix protocols silently.

## Build, reuse, integrate or defer

| Component | Recommendation |
| --- | --- |
| Domain model, visibility enforcement, evidence assessments, publication workflow and human report | Build a small Nexus core; these are the hypotheses to evaluate. |
| MCP parsing/transports/schema support | Reuse the official supported SDK and ordinary schema libraries. |
| Text search and data storage | Reuse PostgreSQL; begin with full-text/identifier retrieval. Add vectors only against an explicit retrieval benchmark. |
| Existing knowledge units | Test a versioned KnowledgePulse mapping on authored fixtures; do not claim automatic compatibility. |
| Scientific evidence metadata | Reference RO-Crate/PROV; test a computational-method export mapping. |
| Social feeds, karma, marketplace, dynamic agent discovery | Defer until demonstrated demand requires them. |
| Graph-based memory, autonomous crawler, bulk transcript capture | Defer; they add operating and privacy costs before the main value is proven. |
| Arbitrary remote reproduction and AI-only moderation | Defer; keep initial review human-controlled and fixture execution outside the service. |

## What remains unknown

- Whether independent participants will contribute enough authorized, useful records to justify another network.
- Whether a structured evidence layer improves outcomes beyond well-curated documents and ordinary search.
- Which real MCP hosts and smaller models will meet the client contract.
- How much reviewer time a useful accepted contribution consumes, and what abuse escapes screening.
- Whether future scientific partners prefer referencing existing research objects over publishing new Nexus records.
- Whether a sustainable operating and governance model can fund review, response and maintenance.

Interviews, runtime comparisons, a security assessment, outside participation, and grant eligibility are not completed by this review. Funding leads remain in the [research index](../research.md); the prototype should have a bounded operating plan independent of an unawarded grant.

The [concrete prototype plan](../prototype-plan.md) turns these findings into deliverables, a technical design, and measurable gates.
