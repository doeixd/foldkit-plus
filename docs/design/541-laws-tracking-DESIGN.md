# Laws on every state owner: declared once on the data, judged by one judge, evidenced in the contract graph (tracking)

**What this tracks.** A datum has one owner here. A rule about that datum should too. For a row a server owns that is already true: `Entity.invariant` is declared once and read by the writer's `WHERE`, a `CHECK`, a form and the client's pre-check. For a Sync document and for the local Model it is not. The rule is restated per transition (`authorize: { CreatedTodo: … }`, an Agent capability's `available`), so the next transition added skips it and nothing says so. And for every owner, nothing records how each transition is known to keep each law.

**The slots, per owner, at `19dbc89`.**

| Slot | Entity row | Sync document | Local Model |
| --- | --- | --- | --- |
| Law: what every state holds | `Entity.invariant` | none | none |
| Named states | none: each write restates its source in a `when` | none | none |
| Who may | `Guards.attach` rules | `authorize` | not applicable |
| When it applies | `when` on a write | folded into `authorize`, keyed by Message tag | `available(model)`, a callback on an Agent capability |
| What it changes | `sets`, `increment`, `compute`: data | `update`: a function | `update`: a function |
| Evidence a move keeps a law | runtime only | none | one hand-written walk (`heldValue.test.ts`) |

For Entities the law and the move are already one expression language (`Expr`) with one reference judge (`Entity.judge`) and one SQL lowering. So most of this is asking questions the declarations can already answer. The two new declarations are a named state (`Entity.refine`) and a document's `laws`.

**The issues.**

- [#533](./533-can-hint-DESIGN.md): one `can` hint over the held row
- [#534](./534-sync-document-laws-DESIGN.md): a document's laws, judged over the snapshot an operation leaves
- [#535](./535-refinements-DESIGN.md): a named state, and a write declared between states
- [#536](./536-laws-check-DESIGN.md): check each write against the laws before it runs
- [#537](./537-contract-graph-laws-DESIGN.md): laws and write edges in the contract graph
- [#538](./538-walks-and-scenarios-DESIGN.md): walks and scenarios as the evidence a law takes
- [#539](./539-bare-descriptor-DESIGN.md): a descriptor made before its invariants judges none of them
- [#540](./540-law-first-guide-DESIGN.md): one law-first guide and skill reference
- [#542](./542-form-judges-held-row-DESIGN.md): a form judges an invariant over the held row, not just the fields it sets

**Order.** The descriptor bug comes first: it is a fault today, and refinements add a third kind of descriptor on top of it. The `can` hint and the Sync laws are small and each has a consumer in the tree. Refinements come next, then the check, which reads them and produces the evidence the graph rule asks for. The guide can start now with the rows that already exist. Only the Message half of the graph issue waits on foldkit/foldkit#1655.

**What stays out, and what would reopen it.** Following the 2026-11-12 decision on #439, each is a condition, not an open issue.

- **A `requires` for a Message no declared write backs.** A Message backed by a write takes its precondition from the write's `when`. Reopen when an application states one Message's condition in two places (an Agent `available` and a Sync rule, or a view) and neither is a declared write.
- **A transition graph declared on its own (`Entity.transitions`).** The arrows are declared where they happen: a write goes from one refinement to another, and the check compares them with what the patch does. Reopen if an application needs to forbid an arrow no write attempts, with the case.
- **A solver.** Enumeration decides enums and literal inputs. A numeric law (`reserved <= stock` under an increment) is undecided and takes a scenario or a walk.
- **Code generation or a second IR.** The contract-layer plan's invariant 4 already says the graph is derived, never restated.
- **A declarative `update`.** It stays a function. What is declared is its footprint.

**Related.**

- #190, the contract layer: the graph these laws become nodes of.
- #516: a cascade's clear leaves a row no declared write could leave. The same promise, broken across rows.
- #439's closing note: each item below names its consumer.

**Where the ideas come from.**

- `doeixd/gen2` declares a `TransitionGraph` on an Entity and checks it for coherence, but never against actions: `transitionChecks` is always returned empty in `src/authz/mutation-plan.ts`.
- The Dirived note declares the moves (`requires`, `writes`) and an assurance level per law, with no law on the data to compare them with.
- `devagrawal09/specter` states behavior as given, when, expect or reject, and runs it against the real handler. Its README says plainly that this does not cover every history.

Each has one part. Entity already has the law and the move in one language, so this repository can have all three.
