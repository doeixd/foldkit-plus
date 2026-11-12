# entity/remote-server: check each declared write against the invariants and against the states it names, before any runs

**What is missing.** A declared write and an invariant are both data in one language: the write's `when`, `sets`, `increment` and `compute`, and the invariant's predicate over `before` and `after`. The writer already builds the row a write leaves and judges it, at run time, inside the `WHERE`. Nothing asks the same question when the write is defined. So which writes an invariant can refuse, and which states a write actually joins, are known only by reading every write.

**The reference judge can already answer it.** A scratch script over `examples/writes`' `Product`, calling `Entity.judge` for each pair of statuses at `19dbc89`:

```text
draft     -> published   Valid
draft     -> archived    Valid
published -> draft       Invalid by publishedStaysPublished
published -> archived    Valid
archived  -> draft       Valid
archived  -> published   Valid
```

Joined with the writes that set `status`:

- `Publish` has `when: status = 'draft'` and sets `published`. Its only edge is draft to published.
- `Revert` sets `draft` with no `when` (`examples/writes/src/domain.ts:88-94`). From published it is refused by `publishedStaysPublished`, which is what the example shows. From archived it lands.

Two things nothing shows today:

- An archived product can go back to draft through `Revert`. Whether that is meant, only the reader of every write knows.
- No declared write sets `archived`. The example's one archived row is seeded by SQL (`examples/writes/src/demo.ts:30`).

**Proposal (sketch: a shape to review, not an API).** A pure function over a domain's Entities, refinements and declared writes that returns findings, as `Module.validate` returns `readonly Finding[]`. It asks two questions of each write.

*Does it keep each invariant of its Entity?*

| Case | Answer |
| --- | --- |
| The write sets, increments and computes no field the invariant reads | Kept: there is nothing to judge |
| Every field involved is an enum or a literal input | Enumerated with `Entity.judge`: kept, or refused from the listed states |
| Anything else (a number, free text, an operator) | Undecided |

*Does it go where it says?* With the refinement issue's source and `becomes`:

| Finding | Meaning |
| --- | --- |
| Arrow holds | Every row in the source, with the patch applied, is in the target |
| Arrow broken | Some row in the source leaves the target, with the row |
| Undeclared arrow | A write with no `becomes` moves a row from one refinement to another |
| Unreached | No write leaves a row in this refinement |
| Terminal | No write starts from it. A report, not a fault |

Printed, it reads:

```text
Product.status
  Draft -> Published      Publish     holds
  Archived -> Draft       Revert      undeclared
  Published -> Draft      Revert      refused by publishedStaysPublished
  Archived                            unreached: no declared write sets it

Sell    x reservedWithinStock    undecided (numeric); no evidence
Rename  x reservedWithinStock    kept: writes no field it reads
```

- **A report first.** A write an invariant can refuse is legitimate: the refusal is typed and the server sends it. A stricter mode, where a finding fails unless the write says why on its line (as `survives: 'reason'` and `// write: infrastructure` do), is the graph issue's rule and is not built here.
- **Undecided is an answer.** No solver. A numeric law stays a run-time check and takes its evidence from a scenario or a walk.
- **Variants.** A variant Entity's `_tag` is an enum and its case invariants are already generated, so its cases enumerate the same way.

**Consumers.**

- The refinement issue's `becomes`, where enumeration decides it at definition.
- The `can` hint's tests, which need the expected arrows.
- The evidence the graph issue's rule asks for.
- A diagram of each Entity's states for `docs/declared-writes.md`. The contract-layer plan lists "docs and diagrams" among the graph's outputs.

Following #439's closing note: if none of these is being built, this waits. It is built in the change that first reads its answer.

**Not in scope.**

- Cross-row effects (#516's cascade clear) and laws over a `Derived` member.
- Sync documents and the local Model, whose `update` is a function. Their evidence is a scenario or a walk.

**Done when.**

- The function returns the report above for `examples/writes`, in a test.
- Adding a write that sets `status: 'draft'` from any state adds its arrows to the output with no other change.
- An invariant that reads a numeric field is reported undecided, never kept.
- `Undecided` from `Entity.judge` (a missing operator) is reported undecided.
- Mutation specs: treating undecided as kept, and skipping `when` while enumerating, each turn a named test red.
- `npx foldkit-plus laws` prints the report for a project's domain, beside `docs`.

**References.** `packages/entity/src/invariant.ts:305-361`, `packages/entity/src/write.ts:139-146`, `packages/remote-server/src/index.ts:2335`, `examples/writes/src/domain.ts`, `docs/design/entity-transition-DESIGN.md`.
