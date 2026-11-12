# docs: one guide and one skill reference for declared data, in the order its rules are written

**What is missing.** The declared-data path (an Entity, its derived members, its invariants, its writes, its rules, then a form and a grid from the same declarations) is what no other layer offers, and it is spread across the documents by package:

- `docs/entity.md`, `docs/declared-writes.md`, `docs/auth-and-guard.md`, `docs/declared-data-to-ui.md`, `docs/editing-server-data.md`, and `docs/replication.md` for a document's rules.
- `docs/declared-writes.md` builds outward in the order a write grows: a guard, an increment, a computed assignment, an invariant, a transition invariant. That teaches each mechanism. It does not teach where a new rule goes.
- `skills/foldkit-plus/references/` has `entity.md`, `guard.md`, `remote.md` and `sync.md`, and nothing that says which slot a rule belongs in.

With 47 packages, a reader or an agent adding a rule has to choose among a Schema check, a guard rule, a `when`, an invariant, a Sync `authorize` and an Agent `available`. The four-kind table that settles it is in a design note (`docs/design/entity-transition-DESIGN.md` §1), not in a guide.

**Proposal.**

*A guide, `docs/laws.md`*, that asks one question of each rule and sends it to its slot:

| The rule is about | It goes in | Refused as |
| --- | --- | --- |
| A value's shape | The Schema | A decode error |
| Which shape a row has | `Entity.defineVariants` | Cannot be written |
| A fact computed from other rows | `Derived` | Never stored, so never wrong |
| Which rows are in a state | `Entity.refine` | Nothing: it is a name |
| What every row, or every change, holds | `Entity.invariant` | `Invalid` |
| Whether this write applies now | The write's source and `when` | `Unmet` |
| Who may | `Guards.attach` | `Forbidden` |
| What every state of a document holds | The Sync contract's `laws` | `Invalid` |

Then the authoring order, each step with the smallest example and the mistake it prevents:

1. Fields and variants: make the wrong row unwritable.
2. Derived members: store a fact once.
3. Refinements: name the states.
4. Invariants: say what holds, on the data.
5. Writes: from a state to a state, with `when` for what the state does not say.
6. Rules: who may.
7. Run the check, and record evidence for what it leaves undecided.

And one section on the mistake this effort started from: a rule about the data written on one transition, with the Sync cap as the example.

*A skill reference, `skills/foldkit-plus/references/laws.md`*, with the table, the order, and how to read the check's findings and repair each. It gets a row in `SKILL.md`'s table. An agent is the reader most likely to add the tenth write to an Entity, and the one that will follow a table.

*The README* gains one line under "Choose who owns the state" pointing at the guide.

**Depends on.** Each row is written when its issue lands. The rows that exist today (Schema, variants, `Derived`, `Entity.invariant`, `when`, `Guards.attach`) can be written now, and are most of the value.

**Not in scope.** Rewriting `docs/declared-writes.md`. It stays the reference for a write. The new guide links to it.

**Done when.**

- `docs/laws.md` exists with the table and the order, every block compiling under `pnpm docs:check` or marked `ts sketch`.
- `skills/foldkit-plus/references/laws.md` exists and `SKILL.md` lists it.
- The four-kind table appears in one published document, and the design note links to it.
- `npx foldkit-plus docs "where does a rule go"` returns the guide's first section.

**References.** `docs/declared-writes.md` (outline), `docs/design/entity-transition-DESIGN.md` §1, `docs/replication.md:330-425`, `skills/foldkit-plus/SKILL.md:28-33`, `scripts/docs-check.mjs`.
