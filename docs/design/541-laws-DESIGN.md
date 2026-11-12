# Laws on every state owner (#541 and its parts)

**Status:** Decided 2026-11-12 (decisions delegated by the owner). Nothing
here is built by this note. It settles
[#541](https://github.com/doeixd/foldkit-plus/issues/541) and its parts
(#533 to #540, #542, #543) and gives the build plan. Read against the tree at
`75b6a1ca2`. Where this note and an issue's sketch disagree, this note is the
decision; where it and the source disagree, the source wins and the work
package says so in its report.

The rule that decided most questions is #439's closing note
([decisions-2026-11-12-data-platform.md](./decisions-2026-11-12-data-platform.md)):
a thing is built in the change that first reads its answer, and nothing is
exported for a consumer that does not exist.

## 0. Decisions

| # | Issue | Question | Decision |
| --- | --- | --- | --- |
| D1 | #539 | Where an Entity's invariants are kept | With the identity, as relations, derived members and `sets` are. Every descriptor judges them. Build as the issue's fix 1. |
| D2 | #539 | The same question for `Guards.attach` | The attachment stays on its descriptor (#332 chose that on purpose). An enforcing reader given a descriptor without it, of an Entity another descriptor of which carries one, throws by name. |
| D3 | #543.1 | A durable Message that reads outside the shared projection | Bug, build as written, in `Sync.mount`: compare the live `update`'s slice with the replay's, refuse on a difference, name the fields. Always on. |
| D4 | #534 | A document's laws | `laws` on `forApplication(...).make`, each `{ holds({ before, after }), message, path? }`, judged by a new `judge` hook in `foldkit-durable` after `reduce` and before the append is written. Refused as `Invalid` with `rule`. |
| D5 | #534 Q1 | Repair | Strict, as an Entity: the snapshot the operation leaves is judged, whatever the one before held. A law added to live documents is written monotone over `before`. `contract.judge` lets a deploy audit stored snapshots first. |
| D6 | #534 Q2 | The server's own appends | Judged: they go through `journal.append`. A reaction whose append a law refuses parks at once, as one `authorize` refuses does today. |
| D7 | #534 Q3 | The replica | `submit` judges the optimistic snapshot it already computed and fails with `LawBrokenError` before the outbox. A hint: the server judges again. |
| D8 | #534 Q4 | D1 | Holds. `commitOnce` is fresh per attempt, so a retried commit reduces and judges again. |
| D9 | #533 | Where `can` lives and what it is | `Data.can(model, mutation, input)` in `foldkit-remote`, beside `Data.refusal`: `Yes`, `No { refusal }` or `Undecided`. It reuses `forbiddenByWrite` and `brokenByWrite` and adds the `when`. |
| D10 | #533 | Does the pre-send check start refusing `Unmet` | No. A `when` that is false over the held row is not always `Unmet` on the server (a write already made is answered as written). The send path keeps refusing `Forbidden` and `Invalid` only. |
| D11 | #533 | Agent `available` by default | Declined. No declaration joins a Message to a write, and `available(model)` sees no input. An application writes `available: model => Data.can(...)._tag !== 'No'`, which no longer restates the condition. |
| D12 | #535 | What a refinement is | A named predicate over the row, a value: `Entity.refine(Product, 'Draft', ({ row }) => …)`. Not a descriptor: no `Query.from(Draft)`, no `Entity.input(Draft, …)`. |
| D13 | #535 Q4 | The literal form, and type narrowing | Declined. One form, the predicate. Nothing narrows. |
| D14 | #535 | A write's source | Its `when`: `when: () => Draft.predicate`. No `from` option, which would be a second way to say it. |
| D15 | #535 Q1 | `becomes`: enforced or checked | Checked where the write is declared, by enumeration, and refused there when it is broken or cannot be decided. Never enforced at run time. No new refusal. |
| D16 | #535 Q2, #543.4 | A predicate reading another row, or the past | Refused where declared. `build` is given `row` alone, so it cannot read `before`. |
| D17 | #535 Q3 | A write with no `becomes` | As today. The check reports the arrows it makes between declared states as `undeclared`, a report and not a fault. |
| D18 | #536 | The check | `Laws.check({ writes, evidence? })` in `foldkit-entity`, pure, returning a report. Enumeration over finite fields, no solver. |
| D19 | #536 | "Writes no field it reads, so kept" | True of a state invariant only. A transition invariant over untouched fields is enumerated or undecided, never kept by disjointness. |
| D20 | #536 | `npx foldkit-plus laws` | Declined. The CLI loads no TypeScript. A project prints `Laws.show(report)` from a test. |
| D21 | #537 | Graph nodes and edges | Not built. The graph does not exist (contract-layer Phase 3, not started). `Laws.check`'s report holds what the graph will read. |
| D22 | #537 | A `Module.validate` rule | Declined in `foldkit-surface`. `unwitnessed` is a finding of `Laws.check`. |
| D23 | #537 | Evidence records | `Laws.evidence(write, invariant, { by, where })`: a pointer written by hand, checked to name a pair the check left undecided. No stamp. |
| D24 | #538 | The walk helper | `Walk.run` in `foldkit-remote/testing`, asynchronous, with `from` as a list of named starts (#543.2). No property-testing dependency. |
| D25 | #538 | Scenarios as data | Declined. A hand-written scenario is a plain test, and a generated one repeats the conformance suites. |
| D26 | #542 | The form judges over the held row | `Entity.judgeInput(input, value, { operators?, over? })`; the form keeps the row it was filled over (`form.over`); Crud passes it. |
| D27 | #542 Q1 | Which row | The visible row when the form is filled. Not followed after. The pre-send check stays for a row that moved. |
| D28 | #542 Q2 | A rule over two keys, mid-edit | Shown on an edit only when every form key that sets a field it reads has been touched. A submit shows all. |
| D29 | #542 Q3 | Operators | No new plumbing. A table that lacks an operator answers `Undecided`, never the opposite answer. |
| D30 | #543.3 | `Undecided` as a request for fields | `Entity.judgedBy(input)`: the members outside the input that its invariants read. Crud adds them to what it loads. |
| D31 | #543.5 | `closed: true` on a Surface | Not built. No second caller. |
| D32 | #540 | The guide | `docs/laws.md` and `skills/foldkit-plus/references/laws.md`, in two passes: the rows that exist now, then each new row as it lands. |

## 1. What was checked

Probed with a scratch test under `examples/writes/test` (deleted after), over
source:

```text
Entity.judge(Full, { after })      Invalid        Entity.judge(bare, { after })      Valid
Guards.attached(Full)              Some           Guards.attached(bare)              None
Full.identity === bare.identity    true           Full.fields.stock === bare.fields.stock   true

draft -> published  Valid      published -> draft     Invalid      archived -> draft      Valid
draft -> archived   Valid      published -> archived  Valid        archived -> published  Valid
```

Read from the code:

- `bind` reads `Entity.invariants(entity)` (`remote-drizzle/src/bind.ts:613`)
  and `RemoteServer.write` reads `Entity.invariants(write.input.entity)`
  (`remote-server/src/index.ts:2405`). A binding made from the bare
  descriptor enforces no invariant on the server. #539 is worse than its
  "medium": with a bare binding an invalid row is stored.
- `GuardServer` reads `attached(entity)` of the descriptor it is given
  (`guard/src/server.ts:615`, `:1214`). A set declared `unguarded: 'allow'`
  with a bare binding serves the Entity unguarded. This is the same fault,
  and it fails open.
- Nothing in `packages/remote/src` reads a write's `when` (a grep for
  `.when` finds only `Match.when`). #533's table is right.
- `forbiddenByWrite` reads the supplied `may` member from `entity.derived`,
  which is the identity's, so the client's who-may check does not depend on
  which descriptor a write was declared over.
- The journal's commit runs `validate`, `authorize`, `stamp`, `reduce`, then
  the `INSERT` (`durable/src/journal.ts:1210-1262`). `reduce` also runs on
  load (`:909`), so a law cannot live in `reduce`: a law added later would
  stop a stored document loading.
- `effect@4.1.1` ships no `fast-check` and no `Schema.toArbitrary`.
- `examples/writes` has no view (`src`: `demo.ts`, `domain.ts`, `main.ts`,
  `server.ts`). #533's "greys out Publish" cannot be its done-when.
- `foldkit-surface` depends on `foldkit-metadata` and `foldkit` only, and
  `Module.validate` reads `Contract`s over Model paths
  (`surface/src/index.ts:1901`). It cannot see an Entity.

Not run: #543's scenario (the issue's author ran it; the code agrees, since
`derivedReplay` applies the Message over `initial`), and the Crud path of
#542.

## 2. Descriptors (#539)

### D1. Invariants belong to the identity

[#332's design](./332-entity-versions-DESIGN.md) sorted an Entity's parts by
one question: can two descriptors rightly differ? It put relations, derived
members and `sets` under "no" and Entity metadata, invariants included, under
"yes: an interpreter's own view". For invariants that was wrong. The invariant
design says an invariant is "a fact about stored rows, true for every writer"
([entity-invariant-DESIGN.md](./entity-invariant-DESIGN.md) §1). A fact about
the row has one answer.

Build:

- `Shape` (`entity/src/descriptor.ts`) gains `invariants: Array<Invariant>`.
  `invariantsOf` reads it, after the variant cases' as today. The
  `foldkit-entity/invariants` metadata key is removed (nothing outside
  `invariant.ts` reads it).
- The step `Entity.invariant` returns the descriptor it was given, as
  `relate` does. `Product === ProductFields` where no metadata step came
  between.
- **Declared twice.** The same `DeclaredInvariant` applied again to the same
  Entity is a no-op (a module evaluated twice, two pipes over one base). A
  different declaration with an id the Entity holds throws, as today.
- **`DeclaredInvariant.entity`** read before the step runs still throws.
- `Entity.invariants(InventoryFields)` now answers both invariants. The
  assertion at `entity/test/invariant.test.ts:96` is replaced.

Tests that pipe different invariants onto one shared base now collide, as
members did after #332. Each such test takes an Entity of its own (CLAUDE.md,
"A member is the Entity's, not its descriptor's").

### D2. Guards stay on the descriptor, and a bare one is refused

#332 names `G.attach` as a view made on purpose, and the guard tests rely on
it (`PlainFields` is attached two different ways in
`guard/test/server.test.ts:869` and `:901`). "Attaching twice appends" is
also designed. Moving attachments to the identity would merge those, and it
is a contract change across five packages for a fault a check closes.

Build, in `foldkit-guard`:

- `attach` records the Entity's identity as guarded (a `WeakSet` in
  `attach.ts`).
- `enforced(entity)`: `attached(entity)`, except that `None` for an identity
  recorded as guarded throws: `[foldkit-guard] Product carries guards on
  another descriptor of it; pass the one Guards.attach returned`.
- The enforcing readers call `enforced`: `server.ts` (`:142`, `:410`, `:615`,
  `:1214`), `drizzle.ts:30`, `sync.ts` (`:98`, `:133`). The hint readers
  (`may.ts`, `condition.ts`, `placed.ts`) keep `attached`: a rule declared
  with `guard.row(ProductFields, …)` is how every guard set starts.

A test that binds a bare descriptor beside a guarded one of the same Entity,
to compare them, takes an Entity of its own.

## 3. Sync

### D3. Closure of a durable Message (#543 part 1)

`Sync.mount`'s `step` (`sync/src/mount.ts`) has the live Model and the
contract in one place. For a durable Message it compares two values:

```text
live     = projection.get(update(model, message).model)
replayed = sync.replay(projection.get(model), message)
```

- They are compared with the shared codec's equivalence, after an identity
  check.
- `before` is the live Model's own slice, which already holds every pending
  edit, so a pending operation cannot cause a false refusal.
- On a difference the Message is not applied and not submitted. `step`
  returns the Model it was given. The failure goes to `onPersistenceFailure`
  as a `ReplayError`: `durable "ClearedShown" reads Model fields outside the
  shared projection: filter`.
- The fields are named on the failing path only: `update` runs again with
  each top-level field the projection does not own reset to `initial` in
  turn, and those that change the slice are listed.
- Where `replay` itself throws (a Command, a write outside the projection)
  nothing changes: `submit` refuses it as today.

It is always on. The cost is one more `update` and one comparison per
durable dispatch; the work package reports a figure for a 10,000-item slice,
and a regression there is reported, not fixed with an option.

`replica.submit` cannot do this: it has no Model. Static derivation of a
Message's reads (contract-layer Q13) is not attempted.

### D4 to D8. A document's laws (#534)

```ts sketch
forApplication(App)
  .withPrincipal<Principal>()
  .make({
    documentId: DocumentId.make('todos-capped'),
    shared: Projection.pick(App.model.todos),
    durable: MessageSet.make(App, [Message.CreatedTodo, Message.DuplicatedTodo]),
    laws: {
      atMost100Todos: {
        holds: ({ after }) => after.todos.length <= 100,
        message: 'A list holds 100 todos',
        path: ['todos'],
      },
    },
  })
```

- **Shape.** `laws` is a record keyed by id. `holds` takes `{ before, after }`,
  both `Schema.Struct.Type<Fields>`, and answers a boolean; only `true`
  holds. It sees no principal and no Message. `path` is optional, typed
  `ReadonlyArray<keyof Fields & string>`.
- **Outside `shared`.** `holds` is typed over the shared fields, so reading
  another part of the Model does not compile. The issue's "refused where the
  contract is made" is a type test.
- **The id and the message** must fit `SyncRefusal`'s `Words`; `make` throws
  otherwise.
- **Where it is judged.** `foldkit-durable`'s journal gains one option:

  ```ts sketch
  readonly judge?: (request: {
    readonly key: string
    readonly principal: Principal
    readonly operation: Operation          // as stamped
    readonly before: Snapshot
    readonly after: Snapshot
  }) => true | { readonly rule: string; readonly message: string; readonly path: ReadonlyArray<string> }
  ```

  It runs in `commit` after `reduce` and before the operation's `INSERT`. A
  refusal is an `OperationRejectedError` with `reason` set to the message and
  two new optional fields, `rule` and `path`. A `judge` that throws is an
  `InvalidOperationError`, as a throwing `reduce` is.
- **The contract.** `PolicyJournalContract` gains `judge`, built from `laws`
  (the first broken law, in declaration order), so `makeJournal({ ...contract })`
  applies it. The defined contract also gives `laws` back as declared values
  (`contract.laws.atMost100Todos: { id, message, path }`) and
  `contract.judge(before, after): Option<DeclaredLaw>`.
- **The refusal.** `journalExchange` maps an `OperationRejectedError` that
  has a `rule` to `SyncRefusal.Invalid({ entity: none, rule: some(id),
  message, path })`. One without stays `Forbidden`.
  `Sync.isInvalidBy(refusal, contract.laws.atMost100Todos)` matches it; a
  replica is one document's, so the id is enough.
- **Not a rule.** `authorize` is unchanged and a law is never one of its
  alternatives.

**D5, repair.** A law judges `after`, strictly. A document that already
breaks a law refuses every operation that leaves it broken, including one
that only partly repairs it. That is the Entity's rule and the reason to keep
it is the same: one meaning of "the law holds". The guide gives the form for
a law added to live documents:

```ts sketch
holds: ({ before, after }) => after.todos.length <= Math.max(100, before.todos.length)
```

and names `contract.judge(snapshot, snapshot)` as the audit to run over
stored snapshots before the deploy. Judging "only when the operation changes
what the law reads" is declined: a law is a function, and what it reads is
not known.

**D6.** `appendAsServer` and a reaction's append go through `journal.append`,
so the hook judges them with no further code. The work package proves the
park with a test rather than trusting `serverJournal.ts:587-588`.

**D7.** `replica.submit` has the optimistic snapshot before and the replayed
one after. It calls the definition's `judge` and fails with `LawBrokenError
{ rule, message, path }` (a new `ReplicaError`) before the outbox is written.
The optimistic snapshot holds pending operations the server may refuse, so
this can refuse an edit the server would have taken; Remote's pre-send check
has the same property and the same answer: it is a hint over what is held.

**D8.** Confirmed by the code: on D1 the hook sees the latest committed
snapshot, and a commit that loses the `(key, sequence)` constraint retries
through `commitOnce`, which reads, reduces and judges again.

## 4. The `can` hint (#533)

```ts sketch
const answer = Data.can(model, Publish, { id: 'p1', status: 'published' })
// Can.Yes
// Can.No({ refusal })          Forbidden { reason }, Unmet, or Invalid { entity, rule, message, path }
// Can.Undecided({ reasons })   the row is not held, a field or an operator is missing, an input key is absent
```

- **Owner.** `foldkit-remote`. The three parts need the visible store, the
  viewer and the bound operator table, which only Remote holds. Two parts
  exist there already.
- **Order**, the server's: `forbiddenByWrite`, then the `when`, then
  `brokenByWrite`. The first definite refusal answers `No`. Otherwise any
  part that could not decide answers `Undecided`. Otherwise `Yes`.
- **The `when`** is judged with `Judge.predicate` over the visible held row,
  with the encoded input, the viewer context and the store's rows, as
  `whyReasons.ts` judges a list's `where`. Known false is `No(Unmet)`;
  unknown is `Undecided`.
- **Input** is `Partial<Input>`. A write whose input is fixed apart from the
  id is asked with all of it. One with a free key (`Restock`'s `quantity`) is
  asked per value, or without it: a `when` that reads the missing key is
  undecided, and the invariants are judged over the row as it would be with
  the keys given.
- **`Can`** is a `defineTaggedUnion`, read with its `match`.
- **D10.** `writes.ts` is not changed to refuse `Unmet` before sending.
  `examples/writes`' own `Publish` says why: publishing a published product
  "is answered as written, as a retry would be". The hint says `No`; the send
  still asks the server. The docs say so.
- **D11.** `docs/agents.md` shows `available` and `authorize` written from
  `Data.can` for a capability over the selected row. Input-aware
  availability would be a change to `foldkit-agent`'s contract; it reopens
  when an example has a capability over a row write that needs it.

Done-when replaces the issue's:

- `examples/writes`' demo prints `Data.can` for Publish on a draft, a
  published and an archived product (`Yes`, `No(Unmet)`, `No(Unmet)`) and for
  Revert on a published one (`No(Invalid)` naming `publishedStaysPublished`),
  and its demo test asserts the lines.
- A row missing a field the `when` reads answers `Undecided`.
- Three mutations, one per part, each killed by a named test.
- `docs/declared-writes.md` gains the section under "What the client shows
  meanwhile".

## 5. Refinements and the check (#535, #536)

### D12 to D17. A refinement is a value

The issue's sketch makes a refinement a third kind of descriptor
(`Query.from(Draft)`, `Entity.input(Draft, …)`). That is the shape of #539:
another descriptor of one Entity, which every reader of `AnyEntity` (the
store, the Drizzle compiler, a guard, a form, `bind`) must tell apart, and
any that does not treats `Draft` as `Product` and says nothing. A value has
no such reader.

```ts sketch
const Draft = Entity.refine(Product, 'Draft', ({ row }) => Expr.eq(row.status, 'draft'))
const Published = Entity.refine(Product, 'Published', ({ row }) => Expr.eq(row.status, 'published'))

Draft.predicate      // over the row as stored: Query.where, a guard row rule, a write's `when`
Draft.after          // over the row a write leaves: inside an invariant
Entity.inState(Draft, row)   // Option<boolean>; none when the row lacks a field it reads
Entity.states(Product)       // every refinement declared on the Entity

const Publish = Mutation.write(
  'Publish',
  Write.update(Entity.input(Product, PublishInput), {
    id: 'id',
    when: () => Draft.predicate,
    becomes: Published,
  }),
)
```

- **Declared on the identity**, like an invariant after D1: `refine`
  registers the state in the Entity's shape and returns the value. A name
  declared twice on one Entity throws.
- **`build` is called twice**, over the fields (`predicate`) and over
  `Expr.next` of each (`after`), as `declareOn` builds `before` and `after`.
  It is given `row` and nothing else, so it reads neither the past nor an
  input (D16, #543 part 4). A predicate over another Entity, or reading
  nothing, is refused as an invariant's is.
- **Printed by name.** `Expr.show` prints `Product.Draft`. The work package
  chooses how (the mechanism `Expr.operator`'s `definedAs` uses is the
  obvious one) and says which in its report.
- **`when: () => Draft.predicate`** is the source. The write is a
  `ConditionedWrite`, refused as `Unmet` from any other state, with no new
  code path.
- **`becomes`** (updates and inserts) is a claim the declaration checks:
  every row the write can start from, with its patch applied, is in the
  target. `Write.update` runs the enumerator (below) and throws for a broken
  claim, with a row that breaks it, and for one it cannot decide: `becomes:
  InStock cannot be decided from the declarations; it is a checked claim,
  not a postcondition`. A postcondition enforced where the write commits
  would need a per-write predicate in both writers, the guard and the
  client's pre-check. It reopens with an application that needs a numeric
  one.
- **Not built:** `Query.from(Draft)`, narrowing, the literal form, a
  predicate over another row.

Done-when replaces the issue's:

- `examples/writes` declares its three states once. `Publish`'s `when` is
  `Draft.predicate` and it declares `becomes: Published`.
- A `becomes` the patch cannot keep throws where the write is declared,
  naming a row. One over a numeric field throws as undecided.
- `Query.where(Draft.predicate)` returns drafts on SQLite, Postgres and the
  memory backend.
- `Entity.inState` answers none for a row missing `status`.
- A type test: `build` has no `before`.
- Mutations: skipping the `when` while enumerating `becomes`, and judging
  `becomes` over the row before, each killed by a named test.

### D18 to D20. `Laws.check`

```ts sketch
const report = Laws.check({
  writes: [Rename, Publish, Revert, Restock, Sell],   // anything with { name, write }
  evidence: [Laws.evidence(Sell, reservedWithinStock, { by: 'walk', where: 'test/sell.walk.test.ts' })],
})
Laws.show(report)   // the table below, as text
```

The report is data: `pairs` (each write against each invariant of its
Entity, with the members the invariant reads, the members the write writes,
and the verdict), `arrows`, `states` and `findings`.

Owner: `foldkit-entity`, in new files (`laws.ts`, and `enumerate.ts` shared
with `becomes`). A `Mutation.write` result fits `{ name, write }`, so the
package needs nothing of Remote's. Entities and states come from the writes'
own `input.entity`.

**A finite field** is one whose encoded schema is a literal, a union of
literals or a boolean, with or without null (read with `SchemaAST`'s guards).

**One write against one invariant:**

| Case | Verdict |
| --- | --- |
| A state invariant, and the write writes no member it reads | `Kept`, by disjointness: the row holds it after exactly when it did before |
| Every member the invariant reads is finite, and the write changes each only by a `set` | Enumerated with `Entity.judge`: `Kept`, or `Refused` with the rows and inputs |
| Anything else: a number, free text, an increment, a computed field, a link, a context set, an operator the table lacks, more than 4,096 rows | `Undecided`, with the reason |

**D19.** The issue's first row ("sets no field the invariant reads: kept")
is unsound for a transition invariant. `after.count > before.count` is broken
by every write that leaves `count` alone. Disjointness decides state
invariants only.

**Enumeration.** The rows before are every assignment of the finite members
read. Rows are not filtered by the Entity's own invariants: a row may be
invalid before a write (`docs/declared-writes.md`). A `when` is judged
three-valued over each; a row it definitely refuses is dropped, and one it
cannot decide stays. A set key's values are its input schema's literals when
that is finite, else the field's own.

**States.** For each Entity with declared states and each write whose
relevant members are finite, the rows before and after give arrows:

| Finding | Meaning |
| --- | --- |
| `holds` | A declared `becomes`, which the declaration already proved |
| `undeclared` | A write with no `becomes` takes a row from one state to another |
| `refused` | The arrow's row after breaks an invariant, named |
| `unreached` | No write leaves a row in the state |
| `terminal` | No write starts from it. A report, not a fault |
| `unwitnessed` | A pair left `Undecided` has no evidence (D23) |

`Refused`, `undeclared` and `terminal` are reports. A write an invariant can
refuse is legitimate. Only `unwitnessed` is meant to fail a test.

Expected for `examples/writes`, once it declares its states:

```text
Product
  Draft -> Published       Publish     holds
  Archived -> Draft        Revert      undeclared
  Published -> Draft       Revert      refused by publishedStaysPublished
  Archived                             unreached

Rename   x reservedWithinStock        kept: writes no member it reads
Sell     x reservedWithinStock        undecided: stock is incremented
Restock  x reservedWithinStock        undecided: stock is incremented
```

The example keeps the report as text in `examples/writes/LAWS.md`, compared
by a file snapshot in its test, so a write added later changes a checked-in
file. `pnpm docs:check` is not extended.

**D20.** `foldkit-plus docs` reads READMEs. Printing a project's report
would mean loading its TypeScript from the CLI, which nothing there does.

## 6. Evidence, the graph, and walks (#537, #538, #543 part 2)

### D21, D22. The graph waits; the rule lives with the check

The contract graph is Phase 3 of
[contract-layer-PLAN.md](./contract-layer-PLAN.md), not started and waiting
on foldkit/foldkit#1655. Adding Law and State nodes to a graph that does not
exist is not a change anyone can make. What those nodes and edges would be
derived from is in `Laws.check`'s report: each pair holds the members the law
reads and the members the write writes. Phase 3 reads the report.

`Module.validate` takes a `Module`: one application's contracts over its
Model's paths. An Entity write is not one of them, and `foldkit-surface`
cannot import `foldkit-entity`. The rule the issue asks for is `Laws.check`'s
`unwitnessed` finding. A Message's `writes` edge still waits for #190.

### D23. Evidence is a pointer

```ts sketch
Laws.evidence(Sell, reservedWithinStock, { by: 'walk', where: 'test/sell.walk.test.ts' })
Laws.evidence(Restock, reservedWithinStock, { by: 'runtime', where: 'the amount is free; the writer refuses' })
```

`by` is `'walk' | 'test' | 'runtime'`, and `where` is a non-empty string.
`Laws.check` throws for evidence naming a write and an invariant of
different Entities, or a pair it did not leave `Undecided`: a copied record,
and one a later change made unnecessary, are both refused.

The stamp `tested.ts` puts on an operator's evidence is not copied. That
stamp exists because a server publishes those records and a table accepts
them. These records never leave a test process, the producer (a walk in
`foldkit-remote/testing`) and the checker (`foldkit-entity`) share no module
that could hold a stamp without a new dependency, and a walk's green "is
only its seeds" either way. Stamped records reopen when the graph stores
evidence or something publishes it.

`482-temporal-laws-MATRIX.md` is not moved onto these records.

### D24. `Walk.run`

```ts sketch
const result = await Walk.run({
  cases: messages,                 // Record<Tag, Record<name, (model) => Case>>
  from: [{ name: 'loaded', start: loaded }, { name: 'installed mid-refresh', start: installed }],
  step: (model, message) => Data.reduce(model, message),      // may return a Promise
  violations: (before, message, after) => [...],              // each law, by id
  seeds: 200,
  steps: 12,
  regressions,                     // { name, from, case }: run first, each from its own start
})
// { failures: [{ start, seed, path, broken }], seeds, steps }
```

- **Home:** `foldkit-remote/testing`, beside `Trace` and `Law`. Its callers
  are `heldValue.test.ts` and `examples/writes`' walk of `Sell` and
  `Restock` through the real writer, and both already import that entry.
  `foldkit-plus/remote/testing` follows from the generator.
- **The union is checked at the call.** `Walk.cases<Message>()({...})`
  requires a key for every tag, so a new variant does not compile until it
  has a generator. This is `heldValue.test.ts`'s `satisfies`, moved.
- **Asynchronous.** A walk of declared writes must go through the writer:
  over the reference alone `Sell` breaks `reservedWithinStock` at once, and
  the law is kept only because the writer refuses.
- **The generator** is `heldValue.test.ts`'s linear congruential one,
  unchanged, so the same seeds draw the same walks.
- **#543 part 2:** `from` is a list. States no Message produced (a
  checkpoint, a hydrated snapshot, a row written by SQL) are written by hand
  and named; a failure prints the start. Values are not derived from a
  Schema: Effect 4.1 ships no arbitrary, and a property-testing dependency
  stays out of scope.

### D25. No `Scenario`

A hand-written given, when and expect over `RemoteServer` is the test
`examples/writes/test/law.test.ts` already is. A scenario generated from the
check's own answer runs the reference judge against the writer, which
`remote-drizzle`'s invariant and conformance suites do for every dialect.
It reopens when a second example writes the same harness by hand.

## 7. Forms (#542, #543 part 3)

**One judge, three callers.** The judge is `Entity.judge`. The form, `Data.can`
and the pre-send check differ only in the facts they hold. The form cannot
call `Data.can`: `foldkit-form` does not depend on Remote, and should not.

- **`Entity.judgeInput(input, value, options)`**, with `options: { operators?,
  over? }` in place of the positional `operators` (one caller, the form).
  With `over`, an encoded held row, `after` is the row with the input's keys
  laid over it and `before` is the row, so transition invariants are judged.
  Without it, as today.
- **`Entity.rowFrom(entity, value)`**: a decoded Selection value as the
  encoded row the judge reads, each field present encoded and each `one`
  relation as its id. It is the loop `Entity.check` already has, shared.
- **`Entity.judgedBy(input)`** (D30): the members outside the input read by
  an invariant that also reads a member the input sets, as a
  `Record<string, true>` for `selectFor`'s `also`.
- **The form** keeps `over` in its Model as
  `Schema.OptionFromNullOr(Schema.Record(Schema.String, Schema.Unknown))`,
  decoding as none from a Model stored before it existed. `form.over(model,
  row)` sets it. `fill` leaves it; `Reset` clears it.
- **Timing** follows #192. On an edit the marks are cleared as today, then
  the input is judged over the row, and a failing invariant is marked only
  when every form key that sets a field it reads is touched (D28). A blur
  judges nothing. A submit marks every failure. `Undecided` shows nothing.
- **Crud** adds `Entity.judgedBy(form.input)` to what it loads, and calls
  `form.over` with `Entity.rowFrom` of the loaded value where it fills
  (`filledOf`). A new row has none.
- **D27.** The row is the visible one, pending layers included, at the
  moment of the fill. It is not updated while the form is open: the form's
  values were taken from that row too. The pre-send check stays.

The issue's done-when stands, with "the form, the button and the pre-send
check" read as the form, `Data.can` and `brokenByWrite`, in one Crud test.

## 8. Not built, and what reopens each

| Item | Reopens when |
| --- | --- |
| Guard attachments on the identity (D2) | The `enforced` check proves too coarse for a real domain |
| Input-aware Agent availability (D11) | An example exposes a row write as a capability and needs it |
| A refinement as a descriptor, narrowing, the literal form (D12, D13) | An application needs a row type narrowed by state, with the case |
| `becomes` enforced where the write commits (D15) | An application needs a postcondition enumeration cannot decide |
| A refinement over another row (D16) | A `when` can read a derived member |
| `npx foldkit-plus laws` (D20) | The CLI can load a project's TypeScript |
| Law and State nodes, `Module.validate` rule, a Message's `writes` (D21, D22) | contract-layer Phase 3 |
| Stamped evidence (D23) | The graph stores evidence, or something publishes it |
| `Scenario` (D25) | A second example hand-writes the harness |
| Values derived from a Schema for a walk (D24) | Effect ships an arbitrary, or a walk's hand-written starts miss a fault |
| `closed: true` on a Surface (D31) | Agent or Mirror needs D3's comparison |

## 9. Work packages

Every brief carries CLAUDE.md's git rules (shared worktree, explicit-path
commits, the temporary-index recipe for shared files, never `add -A`), the
checks to run (`pnpm format:check`, `pnpm typecheck:force`, the package's
tests, `npx vitest run examples --project unit`, `pnpm mutate:check`), and
its mutation spec. A package that changes a published API runs the Jev
review with its README and skill reference included, adds its entry under
Unreleased in `CHANGELOG.md` (a shared file: temporary index), and updates
its `skills/foldkit-plus/references/` file. Subagents push and report; the
coordinating session checks CI.

```text
WP1 ──┬── WP2 (entity) ──────────┬── WP7 (form, crud)
      ├── WP3 (remote: can) ─────┘
      ├── WP4 (remote: walk) ─── after WP2 for its examples/writes half
      └── WP8a (docs, now)        WP8b (docs, last)
WP5 (sync: closure) ── WP6 (sync, durable: laws)      both after the sessions now in packages/sync and packages/durable commit
```

### WP1. Descriptors (#539). Default model.

It is security-sensitive (a guard that fails open) and changes what five
packages read.

- **Owns:** `packages/entity/src/descriptor.ts`, `invariant.ts`;
  `packages/guard/src/attach.ts`, `server.ts`, `drizzle.ts`, `sync.ts`;
  their tests; every test elsewhere that forks one base Entity by invariant
  or by guard (found by running the suites). `examples/writes/src/domain.ts`
  keeps `ProductFields` (the guard rule needs it) and gains a line in its
  comment.
- **API:** D1 and D2.
- **Done when:** the issue's four calls answer `Invalid`; a test over each
  of the form, `brokenByWrite`, the Drizzle writer and `invariantChecks`
  built on the bare descriptor; a guarded writer, a Drizzle guard and a Sync
  guard made from a bare descriptor of a guarded Entity each throw by name;
  `docs/declared-writes.md` and `docs/entity.md` say that either name
  judges, and that a server binds the descriptor `Guards.attach` returned;
  #332's table in `332-entity-versions-DESIGN.md` gets a dated note.
- **Mutations:** `invariantsOf` reading nothing of the shape; `enforced`
  returning `attached` unchanged.

### WP2. Refinements and `Laws.check` (#535, #536, #537's rule, #543 part 4). Default model.

It decides a published API's shape, and its enumeration must be sound.

- **After** WP1. **Owns:** `packages/entity/src/write.ts`, `entity.ts`
  (exports), `expr.ts` only if the printed name needs it, new `refine.ts`,
  `enumerate.ts`, `laws.ts`; `packages/entity/test`; `examples/writes/src`
  and `examples/writes/test` apart from the demo and its test (WP3's),
  `examples/writes/LAWS.md`; the dialect test for
  `Query.where(Draft.predicate)` in `packages/remote-drizzle/test` (a new
  file).
- **API:** §5, and `Laws.evidence` with the `unwitnessed` finding (§6).
  Build the enumerator and `Laws.check` first, then `refine` and `becomes`
  on it. Tagged values are `Data.taggedEnum`, as `write.ts`'s are: the
  package does not depend on `foldkit`.
- **Done when:** §5's two done-when lists; the report above for
  `examples/writes` as a file snapshot; a write added to the example changes
  it with no other edit; a numeric invariant is `Undecided`, never `Kept`; a
  transition invariant over untouched fields is not `Kept` by disjointness;
  an operator the table lacks is `Undecided`; evidence for another Entity's
  pair, or for a decided pair, throws.
- **Mutations:** undecided treated as kept; `when` skipped while
  enumerating; disjointness applied to a transition invariant; `becomes`
  judged over the row before; the `unwitnessed` finding dropped.
- **Leaves for WP4:** the `Sell` and `Restock` evidence. Until WP4 lands the
  example's test asserts the two `unwitnessed` findings by name.

### WP3. `Data.can` (#533). Sonnet.

One package, with the design fixed here.

- **After** WP1. **Owns:** `packages/remote/src/remote.ts` (the `Data`
  entry), `mutation.ts` (a `when` judge beside `brokenByWrite`), a new
  `can.ts`; `packages/remote/test/can.test.ts` and its mutation spec;
  `examples/writes/src/demo.ts` and `test/demo.test.ts` (WP2 owns the rest
  of the example; the two briefs name each other's files);
  `docs/declared-writes.md`'s section and `docs/agents.md`'s example.
- **Does not touch** `writes.ts` (D10) or `testing.ts` and
  `heldValue.test.ts` (WP4).
- **API and done-when:** §4.

### WP4. `Walk.run` (#538, #543 part 2). Sonnet.

- **After** WP1 for the helper, **after** WP2 for the example's half.
  **Owns:** a new `packages/remote/src/walk.ts`, the export line in
  `testing.ts`, `packages/remote/test/heldValue.test.ts`, a new
  `examples/writes/test/sell.walk.test.ts`, and the two
  `Laws.evidence` lines in the example's law test.
- **API:** D24.
- **Done when:** `heldValue.test.ts` passes through the helper with the same
  seeds and the same regressions, and no local loop left; a variant without
  a generator is a type error at `Walk.cases` (a `@ts-expect-error` test); a
  law that holds from `loaded()` and fails from an installed start is found,
  with the start's name in the failure; `Sell` and `Restock` walked through
  the example's server keep `reservedWithinStock`, and the example's report
  has no `unwitnessed` finding; `pnpm --filter foldkit-plus generate` and
  `pnpm paths` run.
- **Mutations:** the walk stopping after its first step; `from` reading only
  its first start; in the example, the writer's invariant check dropped
  (the walk goes red).

### WP5. Closure of a durable Message (#543 part 1). Sonnet.

A bug with a reproduction and a fixed design.

- **After** the sessions now editing `packages/sync` have committed; check
  `git status` first. **Owns:** `packages/sync/src/mount.ts`, its header
  comment and `make.ts`'s `derivedReplay` comment, a new
  `packages/sync/test/closure.test.ts` and mutation spec, the durable
  Message section of `packages/sync/README.md` and
  `skills/foldkit-plus/references/sync.md` ("reads" beside "writes"),
  `docs/replication.md:146-152`.
- **API:** D3. No new export.
- **Done when:** the issue's `ClearedShown` is refused before the outbox,
  naming `filter`, and the Model returned is the one given (`toBe`); a
  durable Message that reads a local field without changing the slice is
  accepted; a pending operation causes no false refusal; a figure for a
  10,000-item slice is in the report.
- **Mutations:** the comparison dropped; the comparison made against the
  replica's committed slice.

### WP6. A document's laws (#534). Default model.

It changes two packages' contracts and what crosses the wire.

- **After** WP5 (both edit `packages/sync`) and after the session editing
  `packages/durable` has committed. **Owns:**
  `packages/durable/src/journal.ts`, `errors.ts`;
  `packages/sync/src/make.ts`, `journal.ts`, `sync.ts`, `refusal.ts`,
  `errors.ts`, `index.ts`; their tests; `docs/replication.md:330-425`;
  `examples/todo-app` only if it has the cap today (check; do not add one).
- **API:** D4 to D8.
- **Done when:** the guide's cap is a law, and a second durable Message that
  grows the list is refused at 100 with no rule of its own; the rejection
  carries `Invalid` with the law's id and `Sync.isInvalidBy` matches it; a
  law reading outside `shared` does not compile; `appendAsServer` is judged
  and a reaction's refused append parks at once; `replica.submit` fails with
  `LawBrokenError` before the outbox; on a D1 journal a concurrent commit is
  judged against the snapshot it lands on; a document that already breaks a
  law takes the operation that repairs it and refuses one that does not;
  "Choosing document boundaries" says where a law fits (unique usernames
  still do not).
- **Mutations:** the hook dropped; `after` given the snapshot before; the
  refusal mapped without its `rule`; the replica's judge dropped.

### WP7. A form over the held row (#542, #543 part 3). Default model.

Three packages' contracts.

- **After** WP2 (which owns `entity.ts`) and WP3. **Owns:**
  `packages/entity/src/invariant.ts` (`judgeInput`, `rowFrom`, `judgedBy`)
  and their export lines in `entity.ts`; `packages/form/src/index.ts`;
  `packages/crud/src/index.ts`; their tests, READMEs and skill references;
  `entity-invariant-DESIGN.md`'s status line.
- **API:** §7.
- **Done when:** the issue's list, with the three-judge test in
  `packages/crud/test`; the quote form selecting only `discountPct` loads
  `approvedBy`; a form Model stored without `over` decodes.
- **Mutations:** `over` dropped from the form's judgement; judging on a
  blur; the touched-keys condition dropped; `judgedBy` returning nothing.

### WP8. The guide (#540). Sonnet.

- **WP8a, now, in parallel with everything:** `docs/laws.md` with the table
  and the authoring order for the rows that exist (Schema, variants,
  `Derived`, `Entity.invariant`, `when`, `Guards.attach`), the four-kind
  table moved from `entity-transition-DESIGN.md` §1 (which then links to the
  guide), `skills/foldkit-plus/references/laws.md`, its row in `SKILL.md`,
  and the README's one line. Every block compiles under `pnpm docs:check` or
  is marked `ts sketch`.
- **WP8b, last:** the rows for `Entity.refine`, a document's `laws`,
  `Data.can`, `Laws.check` and its findings with a repair for each, the
  monotone form of a law added to live documents (D5), "when a state depends
  on the past, store the fact" (D16), and the section on a rule about the
  data written on one transition, with the Sync cap. `npx foldkit-plus docs
  "where does a rule go"` returns the guide's first section.
- **Owns:** those files only. The other packages' briefs own their own
  READMEs and references.

## 10. For the maintainer

- **Breaking, in `0.x`:** `Entity.invariants(bare)` answers the invariants
  and the step returns its argument (WP1); `Entity.judgeInput`'s third
  parameter becomes an options object (WP7); a server that binds a bare
  descriptor of a guarded Entity now throws at start (WP1).
- **#539 is a server fault too**, by reading the code: a binding from the
  bare descriptor enforces no invariant, and a guard set declared
  `unguarded: 'allow'` serves it unguarded. Not run against a database.
- **Declined against an issue's text:** the `Module.validate` rule and the
  stamped records of #537, `Scenario` of #538, `npx foldkit-plus laws` of
  #536, the descriptor form and narrowing of #535, the Agent default of
  #533, and `closed` of #543. Each has a reopening condition in §8.
- **D5** refuses every operation on a document that already breaks a law
  until one repairs it. If that is too strict for a deployed document, the
  alternative is to refuse only an operation that takes a holding law to
  broken, which lets a broken document grow. This note chose the strict one.
- **D3** costs one extra `update` per durable dispatch. WP5 reports the
  figure.
