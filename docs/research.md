# Research starting points

Reviewed: November 15, 2026. This is an initial primary-source landscape review for a concept repository, not a comprehensive market study, code audit, or independent evaluation of any service.

## What already overlaps

The proposed space already has direct overlap. Agent collaboration, reusable agent knowledge, MCP retrieval, and federated discovery are active areas. Nexus must demonstrate a useful contribution or interoperate with existing work; novelty and demand are not established by this concept.

The following descriptions summarize what each project's own documentation advertises. They do not establish production quality, safety, adoption, or independent reproducibility.

| Project | Documented overlap | Question for Nexus |
| --- | --- | --- |
| [KnowledgePulse](https://openknowledgepulse.org/docs/getting-started/introduction/) | Knowledge-sharing protocol with KnowledgeUnits, MCP access, privacy controls, quality scoring, and reputation | Could Nexus use or extend its schema? Compare evidence semantics, consent, federation, and science-specific requirements before creating another format. |
| [Abund.ai](https://abund.ai/) | Agent social network advertising shared fixes, agent wiki pages, work requests, human ownership, and MCP/API access | What can be reused or integrated? Determine how evidence and independent reproduction differ from confirmations. |
| [AGNTCY](https://agntcy.org/) | Open-source infrastructure for agent discovery, identity, communication, and observability | Can existing infrastructure supply node and capability discovery without a Nexus-specific replacement? |
| [OpenAlex](https://help.openalex.org/api/) | API access to a connected scholarly graph of works, authors, institutions, sources, and topics | Can permitted scholarly references improve discovery while Nexus preserves the distinction between a citation and validated evidence? |

Further candidates to assess include Context7, OpenAgents, Context8, EOSC, and paper-derived agents. These need focused follow-up before making detailed comparisons. No claim is made that Nexus would be the first or only system with these capabilities.

## Standards to evaluate

- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture): context exchange between AI applications and servers. It is an access interface, not a knowledge corpus or a scientific verification system.
- [A2A specification](https://a2a-protocol.org/latest/specification/): communication and task exchange between independent agents. Its [MCP comparison](https://a2a-protocol.org/latest/specification/#appendix-b-relationship-to-mcp-model-context-protocol) describes complementary roles.
- [MCP security guidance](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices): relevant design concerns include confused-deputy behavior, token passthrough, and server-side request forgery. This link follows a draft; select a reviewed supported version before implementation.

**Design inference:** Nexus's possible contribution is a portable, permission-aware evidence and knowledge layer, coupled with usable human reporting and domain-specific review. These standards alone do not establish that this layer is needed or that the proposed implementation would outperform existing projects.

## Funding and stewardship leads

- [NSF Pathways to Enable Secure Open-Source Ecosystems](https://www.nsf.gov/funding/opportunities/pesose-pathways-enable-secure-open-source-ecosystems): investigate whether the program's requirements could match a future demonstrated open-source ecosystem and eligible applicant.
- [Alfred P. Sloan Foundation Open Source in Science](https://sloan.org/programs/digital-technology/open-source-in-science): investigate alignment with scientific software communities and sustainable stewardship.

These are research leads. No eligibility determination, partnership, application, or funding award exists for Nexus through this work. Before pursuing a specific opportunity, read the current solicitation and verify applicant eligibility, required project maturity, permitted activities, deadlines, award terms, and institutional responsibilities.

## Hypotheses to test

1. Compact evidence-backed context improves smaller models' performance on a defined set of tasks compared with the same models using ordinary search.
2. Explicit environment constraints and negative evidence reduce reuse of incompatible fixes.
3. Contributors will share enough useful, authorized records to sustain a commons without bulk collection of private work.
4. Independent operators can preserve confidentiality and propagate corrections across a small federation at an acceptable cost.
5. A combination of automated screening, bounded AI review, and human oversight can provide useful quality within a measured abuse rate and operating budget.
6. Researchers find sufficient value in domain-specific provenance and reproducibility workflows to participate.

## Next research work

- Inspect candidate projects' actual repositories, licenses, schemas, security boundaries, contribution workflows, and maintenance activity; run a bounded comparison with authorized sample tasks.
- Interview developers, researchers, smaller-model users, and prospective node operators about recurring problems and sharing constraints.
- Define a software evidence profile and a computational research profile with qualified participants.
- Measure retrieval baselines and review costs before choosing a stack or permanent model infrastructure.
- Investigate identity/signing standards, query privacy, abuse incentives, revocation, restricted metadata, and realistic withdrawal semantics.
- Record decisions and dated evidence. Recheck changeable claims when they become relevant to a build, grant application, or partnership.

No external account registration, outreach, service integration, or data contribution was performed for this review.
