# surface: the contract graph has no law and no write edge; add both, and a `Module.validate` rule that asks how each transition is known to keep each law

**What is missing.** The contract-layer plan (#190, `docs/design/contract-layer-PLAN.md` §5.1) derives one graph from the declarations: owners, field paths, transitions, capabilities, access rules, data requirements and Surfaces, joined by `owns`, `reads`, `causes`, `guards`, `needs` and `activeOn`. It can answer "who can reach `invoice.total`?". It cannot answer "what can make `reserved` exceed `stock`?", because:

- no node is a law (an `Entity.invariant`, a Sync document law);
- no edge says which paths a transition writes. `owns(Owner, Path)` says whose `update` is the only writer, not which transition writes what;
- nothing records how a transition is known to keep a law.

`Module.validate` has six rules today (`packages/surface/src/index.ts:1809-1815`, `validate` at `:1901`). None concerns a law.

The parts of an evidence record already exist, for operators:

- `Evidence` is a tagged record of a law passing `Conformance.laws` (`packages/entity/src/operators.ts:33`).
- It is stamped by what tested it, so a record built by hand or copied from another implementation is refused (`packages/entity/src/tested.ts`).
- `pnpm mutate` proves a named test fails when a guard is removed.
- `docs/design/482-temporal-laws-MATRIX.md` is a law by evidence by status table, kept by hand.

**Proposal (sketch: a shape to review, not an API).**

| Node or edge | From |
| --- | --- |
| Law | `Entity.invariant`, a Sync document's `laws` |
| State | `Entity.refine` |
| `reads(Law, Path)` | `dependenciesOf` the predicate, which `invariant.ts` already computes as `before` and `after` |
| `writes(Transition, Path)` | A declared write's `sets`, `increment`, `compute`. For a Message, see below |
| `from(Transition, State)`, `to(Transition, State)` | A write's source and `becomes` |
| `keeps(Transition, Law, Evidence)` | The check, a scenario, a walk |

One rule, `law-unwitnessed`: a transition writes a path a law reads, and no evidence says how the law is kept. A pair that shares no path never matches, so most pairs cost nothing.

Evidence kinds, each stamped by what produced it as `tested.ts` stamps a `Tested` record:

| Kind | Produced by |
| --- | --- |
| `Enumerated` | The check, over enums and literals |
| `Scenario` | A declared scenario run against the real `update` or writer |
| `Walked` | A seeded walk, naming its seeds and length |
| `RuntimeOnly` | Nothing before production. It says why, on the line |

And one query beside the plan's security queries: which transitions can break a given law, and on what evidence each is believed not to.

**What needs the graph, and what does not.** Entities and declared writes need no Block Composition, so their half can be built on `Module.validate` as it stands. A Message's `writes` edge is not declared anywhere today (`modifyFields` names fields at run time, and `pnpm writes:check` scans for the seams). That half waits for the graph's transitions, with #190.

**Consumer.** The examples' own `Module.validate` tests, once the check and the walk helper produce records to store. Following #439's closing note, this is built in the change that has evidence to check, not before.

**Not in scope.**

- Moving `482-temporal-laws-MATRIX.md` onto these records. Its laws are properties of Remote's reducer, not invariants of an Entity. The same record shape could back its Evidence column later.
- Proving anything. A `Walked` record says which seeds passed, as `AGENTS.md` says of `heldValue.test.ts`: "a walk's green is only its seeds".

**Done when.**

- `Module.validate` over `examples/writes` reports `Sell x reservedWithinStock` as unwitnessed, and stops once a scenario or a walk is recorded for it.
- A record copied from another Entity, or built by hand, is refused.
- A generated table of law by transition by evidence for `examples/writes` is checked in, and `pnpm docs:check` fails when it is stale.
- Mutation specs: dropping the rule, and accepting an unstamped record, each turn a named test red.

**References.** `docs/design/contract-layer-PLAN.md` §4 (invariants 3 and 4) and §5.1, `packages/surface/src/index.ts:1809-1960`, `packages/entity/src/operators.ts:29-51` and `:208-250`, `packages/entity/src/tested.ts`, `docs/design/482-temporal-laws-MATRIX.md`, `scripts/mutate.mjs`.
