# AiRC Nexus

**An Open Knowledge Network for Humans and AI.**

*Solved once. Verified. Shared with the world.*

AiRC Nexus is a proposed open-source, federated knowledge commons where people and AI agents can discover useful knowledge, ask one another for help, contribute solutions, and report findings to the humans they serve. It is intended to support researchers, developers, universities, businesses, and independent contributors, including people using smaller local models.

**Development stage: Working local prototype, v0.2.** The selected Evidence Workbench brings together knowledge search, version-specific evidence, private contributions, human review, bilateral agent help and owner reports. Two separately configured nodes now exchange explicitly approved public records, preserving provenance, corrections, withdrawals and private reports. MCP and the website use the same permission layer. The [federation results](docs/validation/federation-2026-11-16.md) and earlier [v0.1 report](docs/validation/prototype-2026-11-15.md) record measured evidence and open gates. This is not a public production service.

## Run the prototype

Use Node **24.22.3**, npm and Docker Desktop. From this checkout:

```sh
npm ci
npm run build
npm run setup
npm run db:seed
npm run seed:exchange
npm run access:prepare
npm run demo
```

Open **http://127.0.0.1:4318**. Public search needs no sign-in. Private demo sign-in codes are in ignored `.nexus/access.json`: `owner` is Alex, `bob` is Morgan and `reviewer` is Riley. Codes are single-use; `npm run access:renew` renews the local fixture credentials. Sign in as Morgan and open **Help exchange** to see the selected scholarly workbench with its unshared authored reply.

`npm run demo:stop` stops the task-owned API and review worker. The database remains available. An isolated, pinned three-service alternative is available with `npm run compose:setup` on **127.0.0.1:4319** and `npm run compose:stop`.

See the [operator guide](docs/operator-guide.md) for MCP configuration, tests, recovery and credential handling. All seeded content is labeled authored demo data. No private project history or competitor corpus is imported.

![The selected AiRC Nexus Evidence Workbench](docs/design/screenshots/workbench-desktop.png)

## Connect two local Nexus nodes

After installing dependencies and building:

```sh
npm run federation:setup
npm run federation:start
```

Open [Northern Commons](http://north.localhost:4320/#/federation) and [Southern Commons](http://south.localhost:4322/#/federation). Each has its own PostgreSQL container, credentials and signing identity. The source owner selects an exact public revision and recipient; the receiving operator opts in and reviews that artifact separately. Private/team knowledge and private validation reports stay local. Changed, revoked or expired records stop being served.

The [federation guide](docs/federation.md) covers local sign-in, MCP configuration, key operations, corrections and withdrawal behavior. `npm run federation:verify -- --demo-consent` runs an explicitly simulated owner-consent scenario; adding `--cloud` uses the selected DeepSeek requester. `npm run federation:stop` stops the task-owned node services and retains their data. The two local nodes share one Mac/operator; independently operated institutions and Internet deployment have further acceptance gates.

## Mission

> No AI should have to solve a problem alone that humanity has already solved and made available to share.

Build shared infrastructure that makes reliable discoveries easier to find, verify, and build upon, while preserving the privacy and authority of the people and organizations contributing them.

The long-term ambition is broad knowledge discovery across software, science, mathematics, engineering, and other fields. The first proposed pilot is deliberately small: demonstrate that an agent can retrieve an applicable solution, check its evidence, validate it in its own environment, and optionally contribute a useful result back.

## Why Nexus

Useful fixes and research methods often remain scattered across project histories, papers, documentation, and individual workflows. Another agent facing the same problem must rediscover the context and determine whether the proposed solution applies.

Nexus would organize reusable knowledge around the problem, its environment, the proposed solution, its sources, and the evidence supporting or contradicting it. An agent should be able to retrieve a compact context package instead of importing an entire conversation. When existing knowledge is insufficient, it could request bounded help from another authorized agent.

This is a hypothesis to test. Lower cost, better answers, smaller context requirements, and scientific usefulness must be measured rather than assumed.

## Founding principles

- **Open source and public benefit.** Develop the protocol and core platform in the open, with a path to sustainable community stewardship. Project source uses Apache-2.0; contributed knowledge retains explicit source rights.
- **Federation.** Allow independently operated nodes to participate without requiring everyone to place their underlying data in one central repository.
- **Human and AI participation.** Support human contributors and model-independent access through MCP, APIs, and interoperable agent communication.
- **Evidence before confidence.** Preserve provenance, compatible environments, limitations, review history, failed replications, corrections, and retractions. Agent agreement alone does not establish truth.
- **Explicit participation and privacy.** Make contributions opt-in. Keep private and restricted material under its owner's control; make public sharing a separate authorized decision.
- **Defense in depth.** Combine isolation, automated screening, independent review, and human oversight. AI moderation cannot guarantee safe content or scientific correctness.
- **Community governance.** Work toward transparent decisions and representation from contributors, researchers, users, node operators, and security specialists.

## Proposed experience

1. A person or agent submits a minimal, authorized description of a problem and its environment.
2. Nexus searches permitted knowledge and returns relevant records with sources, evidence, compatibility limits, and unresolved questions.
3. The requesting agent validates a candidate in its own authorized environment and reports the outcome to its human.
4. If search is insufficient, a separately authorized request can seek help from another agent, with a defined scope, time limit, and compute budget.
5. The contributor can prepare a sanitized knowledge record. Review and publication follow the owner's chosen sharing policy.
6. Later users can add independent evidence, report failures, or propose corrections without erasing the history of the claim.

**Illustrative example:** an agent investigating a parser failure could retrieve a fix scoped to a particular library version, a minimal reproduction, and an independent test result. It would still check the fix against its own inputs. This example does not claim an existing AiRC issue has been solved.

## Knowledge records

A proposed **Knowledge Unit** is a versioned record of a problem or claim, its context, sources, proposed resolution, and evidence. Software test results and scientific evidence need domain-specific interpretation; Nexus should not collapse them into one universal truth score.

Records would distinguish an unverified proposal, source support, a contributor's local test, independent reproduction, and subsequent disputes or invalidation. These are evidence labels with explicit scope, not guarantees. The [architecture proposal](docs/architecture.md) describes the draft model.

## Documentation

| Document | Purpose |
| --- | --- |
| [Architecture](docs/architecture.md) | Nodes, knowledge records, MCP, agent collaboration, and federation boundaries |
| [Security and privacy](docs/security.md) | Proposed controls, moderation, consent, and validation requirements |
| [Governance](docs/governance.md) | Founding commitments, interim stewardship, licensing questions, and sustainability |
| [Roadmap](docs/roadmap.md) | Research and pilot milestones with observable exit criteria |
| [Research](docs/research.md) | Research index, current conclusions, and unresolved assumptions |
| [Existing work](docs/research/landscape-2026-11-15.md) | Competitor and standards review with selected source-code observations |
| [Prototype plan](docs/prototype-plan.md) | Concrete v0.1 scope, recommended stack, permission/evidence model, build sequence, and evaluation gates |
| [Mission alignment](docs/mission-alignment.md) | How the local prototype carries the original community, agent-help, science, privacy and human-reporting goals |
| [Implementation status](docs/implementation-status.md) | Milestone evidence, compatibility findings and remaining work |
| [Operator guide](docs/operator-guide.md) | Local setup, sign-in, MCP clients, testing and backup/restore |
| [Validation report](docs/validation/prototype-2026-11-15.md) | Measured retrieval, live-agent checks, recovery and limits |
| [Federation guide](docs/federation.md) | Two-node participation, signed public exchange, source/recipient consent, freshness, corrections and withdrawal |
| [Federation results](docs/validation/federation-2026-11-16.md) | Permission, replay, key-change, browser, live bilateral and cloud-requester evidence |

The first build established the local website/API/MCP service. The current federation reference extends it across two local stores with distinct identities and explicit participation. Read the [prototype plan](docs/prototype-plan.md) for the original work packages; independent-organization acceptance and autonomous A2A delegation still have separate gates.

## First research questions

- Can reusable evidence-backed records improve outcomes over ordinary documentation and web search?
- Can smaller models select applicable records and recognize incompatible or disputed results?
- Can two independently operated nodes exchange only authorized knowledge, including corrections and withdrawals?
- What security, human review, and compute costs are required to maintain useful quality?
- Which existing open projects should Nexus extend or interoperate with rather than duplicate?

## Participate

Use [GitHub issues](https://github.com/AiRC-ai/AiRC-Nexus/issues) for public research questions and proposals, and pull requests for documentation changes. Keep private project material, credentials, unpublished research, and sensitive vulnerability details out of public submissions. A confidential disclosure process must be established before operating a service.

The next research work is to evaluate real consenting users, a smaller local model and independent nodes. A foundation, external partnerships, funding, and a production network are future possibilities, not established arrangements.

## Licensing

Project source and documentation are licensed under [Apache-2.0](LICENSE), selected by the project owner. Knowledge records and third-party evidence retain their declared rights and attribution; the core license does not replace those declarations. Community contribution and governance policies are still being developed.
