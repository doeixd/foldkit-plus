# Laws: where a rule goes

Checked against `foldkit-entity` 0.17.0, `foldkit-guard` 0.11.0, `foldkit-remote` 0.26.0, `foldkit-sync` 0.17.0, `foldkit-surface` 0.14.0 and `foldkit-metadata` 0.1.0.

A law is a rule about state, declared as data and held by the owner of that
state where it changes. It is not a package: the declarations live in
`foldkit-entity`, `foldkit-guard` and `foldkit-sync`, and each interpreter (the
server's writer, the journal, the client's pre-send check, a form, a `CHECK`
constraint) reads the same one.

## Where does a rule go

Pick the kind by what the rule reads:

| The rule reads | Declare with | Refused as |
| --- | --- | --- |
| One value | the field's Schema | a decode failure |
| The case a row is | `Entity.defineVariants` | a decode failure or `Invalid` |
| Other rows, counted or looked up | `Derived.count`, `Derived.exists` (computed, never stored) | nothing |
| The row after a write | `Entity.invariant` | `Invalid` |
| The row before and after | `Entity.invariant` reading `before` | `Invalid` |
| The row before, and the input | `Write.update(…, { when })` | `Unmet` |
| The state a row is in, and the one a write leaves | `Entity.refine`, then `{ from, becomes }` | `Unmet`; `Invalid` for a `becomes` only the writer can judge |
| The principal and the row | `Guards.attach` | `Forbidden` |
| The shared snapshot a durable Message leaves | `laws` on `forApplication(…).make` | `Invalid`, with the law's id as `rule` |

A write lands only when authorization AND precondition AND invariants hold; a
document's operation when `authorize` AND its laws hold. Invariants and
preconditions are never guard alternatives: authority does not excuse an
invalid row. Use the cheapest kind that states the rule. `Data.can` declares
nothing: it reads these over the client's rows (below).

```ts
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'

const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['draft', 'published']),
    stock: Schema.Number,
    reserved: Schema.Number,
  }),
)

const Product = ProductFields.pipe(
  Entity.invariant('reservedWithinStock', ({ after }) => Expr.lte(after.reserved, after.stock), {
    message: 'Reserved stock cannot exceed the stock',
    path: ['reserved'],
  }),
)

Entity.judge(Product, { after: { id: 'p1', status: 'draft', stock: 3, reserved: 5 } })
// { _tag: 'Invalid', failures: [{ id: 'reservedWithinStock', … }] }
```

- `Entity.invariant` declares and runs nothing; `Entity.judge` is pure and
  answers `Valid`, `Invalid` or `Undecided` (a field the rule reads is missing).
  A null fails an invariant.
- An invariant judges the row a write leaves, so a row that already breaks it
  stays until written, and a write lands only if the row it leaves holds. Adding
  an invariant refuses nothing already stored.
- A transition invariant (reads `before`) judges every update, no create or
  delete. A `CHECK` cannot see it.
- The client's `Data.mutate` refuses only what it can already decide over held
  rows; the server's answer is the truth.
- Invariants read stored rows only: not another Entity, an input or a
  principal. A rule across several rows is a handler's. A rule about the past
  needs a stored field (`everPublished`), since no rule reads older than the
  row before.

## A state, and a document's law

```ts
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })
const Published = Entity.refine(Product, 'Published', { status: 'published' })
// { from: Draft, becomes: Published } on a Write.update
```

`Entity.refine` names a state as a value, not a descriptor (a reader that did
not know it would treat `Draft` as `Product`). `from` joins it to the write's
`when`, so another state is `Unmet`. `becomes` is proved by enumeration where
the write is declared (a claim the patch cannot keep throws there), or, over
numbers, is the write's postcondition `becomes:<State>`, judged where it
commits and refused as `Invalid`. A state reaching another row is a query's, not a
write's `from`.

A document's law (`foldkit-sync`):

```ts sketch
forApplication(App).make({
  documentId, shared, durable,
  laws: { atMost100Todos: { holds: ({ after }) => after.todos.length <= 100, message: '…', path: ['todos'] } },
})
```

`holds({ before, after })` is typed over the shared fields, sees no principal
or Message, and runs in the journal after `reduce`, before the append. It is
strict: it judges `after` whatever `before` held, so a document that already
breaks it refuses every operation that leaves it broken. For a law added to
live documents write the monotone form,
`after.todos.length <= Math.max(100, before.todos.length)`, and audit stored
snapshots with `Board.judge(snapshot, snapshot)` (`Option.some(law)` for each
refused) before deploying. A replica's `submit` fails with `LawBrokenError`
first, a hint; match the refusal with `Sync.isInvalidBy(refusal, Board.laws.x)`.

## Checking every write

`Laws.check({ writes })` (`foldkit-entity`) is pure: each declared write
against each invariant of its Entity (`kept`, `refused`, `undecided`), and the
arrows writes make between states. `Laws.show(report)` prints it;
`npx foldkit-plus laws src/laws.ts#report` prints a module's export.

| Says | Repair |
| --- | --- |
| `kept` | none (an `Enumerated` record) |
| `refused` (pair) | the writer refusing it is the law at work (add a `runtimeOnly` line); otherwise narrow the write's `when`/`from` or input |
| `undecided` | a number, text, increment or missing operator: walk it through the writer, a scenario, or a `runtimeOnly` line |
| `holds`, `enforced` | none |
| `undeclared` | declare `from` and `becomes`, or narrow the write |
| `refused` (arrow) | right if the invariant forbids the move; else fix the write or the rule |
| `unreached` | declare the write that enters the state (imports are not seen) |
| `terminal` | none if final; else declare the write that leaves it |

These are reports, never faults. An entry without a `write` is
`{ name, entity, footprint }` with `Footprint.declared({ writes, by })` or
`Footprint.unknown` (writes every member, `undecided` against every invariant).

## Evidence, and clearing `law-unwitnessed`

`Graph.validate(module, { evidence })` (`foldkit-surface`) reports each
transition that writes a path a law reads with no evidence (`law-unwitnessed`);
a Sync document's durable Messages each write the whole shared slice, so each
needs evidence per law, and a Message added later is reported until covered.

| Record | Issued by |
| --- | --- |
| `Enumerated` | `Laws.check`, a pair kept by reading declarations (in `report.pairs[].evidence`) |
| `Walked` | `Walk.run` (`foldkit-remote/testing`), no walk failing |
| `Scenario` | `Scenario.run` (`foldkit-remote/testing`), a runner with no mismatch |
| `RuntimeOnly` | `Evidence.runtimeOnly({ transition, law, why })`, by hand, `why` non-empty |

A record typed by hand or copied is refused (`evidence-unmatched`). Ids are
`write:Restock`, `Product.reservedWithinStock`, `durable:CreatedTodo`,
`sync:capped-board.atMost100Todos`. Pass `[...enumerated, ...walk, line]` as
`evidence`; `Graph.toMarkdown` writes the table. A local Message has no `writes`
edge yet.

## `Data.can`

`Data.can(model, Mutation, input)` is a hint, from the held rows and no I/O:
`Can.Yes`, `Can.No({ refusal })` (`Forbidden`, `Unmet` or `Invalid`, in the
server's order) or `Can.Undecided({ reasons })` (a row not held, a field or
operator missing). `Data.mutate` does not read it: the server answers some
writes the client calls `Unmet` as written. It throws for a mutation that is
not a declared `Write`. `Data.capability` and `Data.available` give an agent
capability the same answer.

See also:
[the guide](https://github.com/doeixd/foldkit-plus/blob/main/docs/laws.md),
[Declared writes](https://github.com/doeixd/foldkit-plus/blob/main/docs/declared-writes.md),
[entity.md](entity.md), [guard.md](guard.md), [sync.md](sync.md),
[surface.md](surface.md), [remote.md](remote.md).
