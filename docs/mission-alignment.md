# Prototype alignment with the founding idea

The project's purpose remains an open, community-governed knowledge network connecting people and AI across software, scientific research and other disciplines. This prototype tests a small part of that network; a product resemblance is not a reason to adopt another project's mission or implementation.

| Founding requirement | Local prototype expression | Later evidence required |
| --- | --- | --- |
| Agents seek help from other agents | A bounded help exchange: private question, explicit owner-approved recipient, private reply, and separate reply-owner sharing consent. Two accountable demo owners exercise the exchange through MCP/API. | Real model participation and A2A exchange across independently operated nodes |
| Bilateral, opt-in participation | Retrieval, private draft contribution and exact-revision publication consent are separate capabilities. | Independent contributors choose to share useful knowledge under documented rights |
| Smaller models get the context they need | Version/environment-aware search and measured byte budgets preserve sources, uncertainty and limitations. | Paired model evaluation proves usefulness rather than assuming it |
| Scientific collaboration as well as coding | Software and computational-method profiles; ten authored computational examples; references toward RO-Crate/PROV and Nanopublications. | Qualified domain review and real reproducibility work; executing a computation does not prove a scientific claim |
| Report to the humans served by the agents | Owner-visible activity includes the owner's agents, private outcomes, exact revisions, help requests and replies. | Actual requester workflows demonstrate that people can inspect and correct agent behavior |
| Participants control their information | Database-enforced visibility, private defaults, inert references, explicit audiences and withdrawal. | Restricted federation, query privacy and correction/revocation propagation under independent operation |
| Open public infrastructure | Owner-selected Apache-2.0 core, node-aware identifiers and documented interoperability boundaries. | Community participation, sustainable stewardship and neutral governance; no foundation or external partnership is implied |
| Monitored contributions with accountable review | Quarantine, bounded pattern screening, exact-revision human review and explicit negative evidence. | Independent security evaluation, measured abuse/false-positive rates and appropriate scientific review |

## Implementation boundary

Nexus application code is authored for this project. Standard libraries provide MCP, schema validation, HTTP and database support. A small authored fixture was tested against KnowledgePulse's published SDK to understand its contract; no registry, social platform, trace-capture pipeline, scoring system or reputation economy is being copied into the application.

The bounded same-node help exchange is an explicit addition following the owner's November 15 request to keep the original AI-help-AI idea visible. It extends the initial four-tool/four-screen pilot with a help surface and scoped request/list/reply tools. It does not activate autonomous agents, spend model budget, publish private questions, or claim cross-node A2A conformance.

The build proceeds through compatibility, persistence/permissions, retrieval, user/agent interfaces, consent/review, and evaluation. Federation and broad cross-domain claims remain gated by evidence.
