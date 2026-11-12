# Laws on every state owner (#541 and its parts)

**Status:** Decided 2026-11-12 (decisions delegated by the owner), revised
the same day for AGENTS.md's "Scope: build the feature". Nothing here is
built by this note. It settles
[#541](https://github.com/doeixd/foldkit-plus/issues/541) and its parts
(#533 to #540, #542, #543) and gives the build plan. Read against the tree at
`75b6a1ca2`. Where this note and an issue's sketch disagree, this note is the
decision; where it and the source disagree, the source wins and the work
package says so in its report.

**What the revision changed.** The first version declined eleven items
because nothing in the tree used them yet. That is no longer a reason: a
feature's tests, an example or a demo are its first consumer. Each of those
items now has a design and a work package. What is still not built is in §8,
each with the concrete reason AGENTS.md allows: it waits on upstream, the
design is unsound, or another design here already does its job.

## 0. Decisions

| # | Issue | Question | Decision |
| --- | --- | --- | --- |
| D1 | #539 | Where an Entity's invariants are kept | With the identity, as relations, derived members and `sets` are. Every descriptor judges them. Build as the issue's fix 1. |
| D2 | #539 | The same question for `Guards.attach` | The attachment stays on its descriptor (#332 chose that on purpose). An enforcing reader given a descriptor without it, of an Entity another descriptor of which carries one, throws by name. |
| D3 | #543.1 | A durable Message that reads outside the shared projection | Bug, build as written, in `Sync.mount`, on a `Closure` helper in `foldkit-surface` (D31 uses it too): refuse on a difference, name the fields. Always on. |
| D4 | #534 | A document's laws | `laws` on `forApplication(...).make`, each `{ holds({ before, after }), message, path? }`, judged by a new `judge` hook in `foldkit-durable` after `reduce` and before the append is written. Refused as `Invalid` with `rule`. |
| D5 | #534 Q1 | Repair | Strict, as an Entity: the snapshot the operation leaves is judged, whatever the one before held. A law added to live documents is written monotone over `before`. `contract.judge` lets a deploy audit stored snapshots first. |
| D6 | #534 Q2 | The server's own appends | Judged: they go through `journal.append`. A reaction whose append a law refuses parks at once, as one `authorize` refuses does today. |
| D7 | #534 Q3 | The replica | `submit` judges the optimistic snapshot it already computed and fails with `LawBrokenError` before the outbox. A hint: the server judges again. |
| D8 | #534 Q4 | D1 | Holds. `commitOnce` is fresh per attempt, so a retried commit reduces and judges again. |
| D9 | #533 | Where `can` lives and what it is | `Data.can(model, mutation, input)` in `foldkit-remote`, beside `Data.refusal`: `Yes`, `No { refusal }` or `Undecided`. It reuses `forbiddenByWrite` and `brokenByWrite` and adds the `when`. |
| D10 | #533 | Does the pre-send check start refusing `Unmet` | No, because it would be wrong: a `when` that is false over the held row is not always `Unmet` on the server (a write already made is answered as written). The send path keeps refusing `Forbidden` and `Invalid` only. |
| D11 | #533 | Agent availability from a write | **Build** (was declined). `foldkit-agent` gains `applies`, judged per invocation after `authorize`. `Data.capability(mutation, toInput)` gives a capability its `authorize` and `applies` from `Data.can`, and `Data.available` its discovery predicate. |
| D12 | #535 | What a refinement is | A named predicate over the row, a value: `Entity.refine(Product, 'Draft', …)`. Not a descriptor: `Entity.input(Draft, …)` stays out, as unsound (§5). What the descriptor form offered is built on the value: `Query.from(Draft)`, `from: Draft`. |
| D13 | #535 Q4 | The literal form, and type narrowing | **Build** (was declined). `Entity.refine(Product, 'Draft', { status: 'draft' })` is the literal form. `Draft.is(row)` is a type guard that narrows the fields the literal names. A Selection's type is not narrowed, as unsound (§5). |
| D14 | #535 | A write's source | **`from: Draft`** (was "its `when`"), conjoined with any `when`. Refused as `Unmet` from another state. |
| D15 | #535 Q1 | `becomes`: enforced or checked | **Both** (was checked only). Decided where the write is declared when enumeration can decide it, and a broken claim throws there. Otherwise enforced where the write commits, as a postcondition, refused as `Invalid`. |
| D16 | #535 Q2, #543.4 | A predicate reading another row, or the past | Another row: **built** for a query and a guard rule, and refused as a write's `from` or `becomes`, which are row-local by design. The past: cannot be written, since `build` is given `row` alone. |
| D17 | #535 Q3 | A write with no `becomes` | As today. The check reports the arrows it makes between declared states as `undeclared`, a report and not a fault. |
| D18 | #536 | The check | `Laws.check({ writes })` in `foldkit-entity`, pure, returning a report. Enumeration over finite fields, no solver. An entry may be a declared write or a `{ name, entity, footprint }` whose footprint is `Declared` or `Unknown`; `Unknown` writes every member. |
| D19 | #536 | "Writes no field it reads, so kept" | True of a state invariant only. A transition invariant over untouched fields is enumerated or undecided, never kept by disjointness. |
| D20 | #536 | `npx foldkit-plus laws` | **Build** (was declined). `foldkit-plus laws <module>` loads the module through `tsx` when the project has it, else Node's own TypeScript support, and prints `Laws.show`. |
| D21 | #537 | Graph nodes and edges | **Build** (was "waits for Phase 3"). `Graph` in `foldkit-surface`: Law, State and Level nodes, `reads`, `writes`, `from`, `to`, `keeps` and `refines` edges, from facts each contract contributes. Only a local Message's `writes` edge waits, on foldkit/foldkit#1655. |
| D22 | #537 | A `Module.validate` rule | **Build** (was declined). `law-unwitnessed` is a rule over the graph, in `Module.validate`, and the one place the question is asked. |
| D23 | #537 | Evidence records | **Stamped** (was a hand-written pointer). `Evidence` in `foldkit-metadata`, issued by what produced it: `Enumerated` by the check, `Walked` by a walk, `Scenario` by a scenario, `RuntimeOnly` by hand with its reason. |
| D24 | #538, #543.2 | The walk helper | `Walk.run` in `foldkit-remote/testing`, asynchronous, with `from` as a list of named starts. **`Walk.states(schema)`** (was declined) derives starts from a Schema with generators per field kind, and no new dependency. |
| D25 | #538 | Scenarios as data | **Build** (was declined). `Scenario` in `foldkit-remote/testing`: given, when, expect, over a declared write or over Messages, run against the real thing, and generated from the check's report. |
| D26 | #542 | The form judges over the held row | `Entity.judgeInput(input, value, { operators?, over? })`; the form keeps the row it was filled over (`form.over`); Crud passes it. |
| D27 | #542 Q1 | Which row | The visible row when the form is filled. Not followed after. The pre-send check stays for a row that moved. |
| D28 | #542 Q2 | A rule over two keys, mid-edit | Shown on an edit only when every form key that sets a field it reads has been touched. A submit shows all. |
| D29 | #542 Q3 | Operators | No new plumbing. A table that lacks an operator answers `Undecided`, never the opposite answer. |
| D30 | #543.3 | `Undecided` as a request for fields | `Entity.judgedBy(input)`: the members outside the input that its invariants read. Crud adds them to what it loads. |
| D31 | #543.5 | `closed: true` on a Surface | **Build** (was "no second caller"). `Surface.make(…, { closed: true })`, tested with `Closure.violations` in a walk, and a Level node in the graph. |
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
- The enforcing readers call `enforced`: every read of `attached` in
  `server.ts` (`me`, `writer` and its `children`, `validate`), and
  `GuardServer.filter` and `mutation` where they are built (`memory` builds
  a `filter` per Entity), `drizzle.ts`'s Read rules, and `sync.ts`'s
  `document` and `opens`. (As built: the first version listed only the
  `attached` lines, which left `filter` and `memory` reading the Entity's
  rules through the Policy unchecked, and `mutation` refusing with a message
  about its Source.) The hint readers
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
reset    = projection.get(update(model with the local fields reset to initial, message).model)
```

- They are compared with the shared codec's equivalence, after an identity
  check.
- The comparison is `Closure.reads` (§6, D31), a helper in `foldkit-surface`
  that a closed Surface's test uses too.
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

It is always on. The built check runs `update` on the live Model and on the
Model with the local fields reset, so it never calls `sync.replay` and a
custom `replay` is not compared. Measured with a 10,000-item slice and a
Message renaming one item, `update` takes 0.2 ms: the check adds 0.4 ms (two
`update`s and the comparison, which stops at items kept by identity) while a
local field differs from its `initial` value, and nothing otherwise.

`replica.submit` cannot do this: it has no Model. A Message's reads cannot be
derived statically (contract-layer Q13): `update` is a function.

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
  still asks the server. The docs say so. This is a correctness reason, not a
  missing consumer.

Done-when replaces the issue's (`examples/writes` has no view to grey out):

- `examples/writes`' demo prints `Data.can` for Publish on a draft, a
  published and an archived product (`Yes`, `No(Unmet)`, `No(Unmet)`) and for
  Revert on a published one (`No(Invalid)` naming `publishedStaysPublished`),
  and its demo test asserts the lines.
- A row missing a field the `when` reads answers `Undecided`.
- Three mutations, one per part, each killed by a named test.
- `docs/declared-writes.md` gains the section under "What the client shows
  meanwhile".

### D11. An Agent capability over a write

The issue asks that a capability dispatching a declared write take its
availability from the write. Two things were missing: a declaration joining
the capability to the write, and a place to judge with the input, since
`available(model)` sees none.

**In `foldkit-agent`:** a variant gains

```ts sketch
readonly applies?: (request: {
  readonly model: Model
  readonly input: ExternalInput
  readonly principal: Principal
}) => boolean | { readonly applies: false; readonly reason: string }
```

- **Order:** `available(model)`, input decoding, `authorize`, then `applies`,
  all over one Model snapshot.
- **After `authorize`, not before.** "Whether it applies" says what the row
  holds. The server refuses `Forbidden` before `Unmet` for that reason, and
  the agent pipeline must not tell a caller who may not write a row what
  state it is in.
- A refusal is `AgentCapabilityUnavailableError`, carrying the reason.
- `introspect` reports `inputDependent` beside `modelDependent`.

**In `foldkit-remote`:**

```ts sketch
Agent.expose(Message, {
  PublishedProduct: {
    name: 'publish_product',
    description: 'Publish a draft product',
    input: Schema.Struct({ id: Schema.String }),
    toMessage: input => input,
    ...Data.capability(Publish, ({ input }) => ({ id: input.id, status: 'published' })),
  },
})
```

- `Data.capability(mutation, toInput)` returns `{ authorize, applies }`, both
  from one `Data.can`: `No(Forbidden)` refuses in `authorize` with the rule's
  sentence, `No(Unmet)` and `No(Invalid)` refuse in `applies` with the
  refusal's sentence, and `Undecided` allows, since the server decides.
- `Data.available(mutation, model => Option<Partial<Input>>)` returns an
  `available`, for a capability over a row the Model alone names (the
  selected product): false while `Data.can` answers `No`.
- They are plain functions, so Remote takes no dependency on the agent
  package. A key written after the spread wins.

Done when: a capability over `Publish` for the selected row is absent from
discovery where the `when` is false, with no condition written; called by
name with an archived product's id it fails with
`AgentCapabilityUnavailableError`; a principal the rules refuse gets the
authorization error and learns nothing of the row's state; `docs/agents.md`
"Availability and authorization are different questions" gains the third
question.

## 5. Refinements and the check (#535, #536)

### D12 to D17. A refinement is a value

The issue's sketch makes a refinement a third kind of descriptor
(`Entity.input(Draft, …)`). That is the shape of #539: another descriptor of
one Entity, which every reader of `AnyEntity` (the store, the Drizzle
compiler, a guard, a form, `bind`) must tell apart, and any that does not
treats `Draft` as `Product` and says nothing. The design is unsound for that
reason, and a value has no such reader. Everything the descriptor form
offered is built on the value.

```ts sketch
const Draft = Entity.refine(Product, 'Draft', { status: 'draft' })              // the literal form
const Published = Entity.refine(Product, 'Published', { status: 'published' })
const InStock = Entity.refine(Product, 'InStock', ({ row }) => Expr.gt(row.stock, row.reserved))

Draft.predicate              // over the row as stored: Query.where, a guard row rule, a `when`
Draft.after                  // over the row a write leaves: inside an invariant
Draft.is(row)                // a type guard: `row is typeof row & { status: 'draft' }`
Entity.inState(Draft, row)   // Option<boolean>; none when the row lacks a field it reads
Entity.states(Product)       // every refinement declared on the Entity
Query.from(Draft)            // Query.from(Product) with the predicate in its `where`

const Publish = Mutation.write(
  'Publish',
  Write.update(Entity.input(Product, PublishInput), { id: 'id', from: Draft, becomes: Published }),
)
```

- **Declared on the identity**, like an invariant after D1: `refine`
  registers the state in the Entity's shape and returns the value. A name
  declared twice on one Entity throws.
- **Two forms (D13).** The literal form is a record of field values, and is
  the conjunction of an `Expr.eq` per key. The predicate form is any `Expr`
  over `row`. Each key of the literal form is typed by its field's encoded
  type.
- **Narrowing (D13).** `Draft.is(row)` is true only where the row is
  definitely a member, and narrows the fields the literal form names. The
  predicate form's `is` narrows nothing. The type of a Selection read through
  `Query.from(Draft)` is not narrowed, because that would be unsound: a held
  row is updated in place by a pending write or a live patch, and
  `Data.get(selection, id)` goes on answering it after it left the state.
- **`build` is called twice**, over the fields (`predicate`) and over
  `Expr.next` of each (`after`), as `declareOn` builds `before` and `after`.
  It is given `row` and nothing else, so it cannot read the past (#543 part
  4). "Was ever published" is a stored field.
- **Another row (D16).** A predicate may reach another row with `Expr.exists`
  or `Expr.path`. Such a refinement is marked non-local. It works where a
  reach works: `Query.where`, `Query.from`, a guard row rule. It is refused
  where declared as a write's `from` or `becomes`, `after` throws, and
  `inState` and `is` answer none without the rows. The reason is the one
  [entity-invariant-DESIGN.md](./entity-invariant-DESIGN.md) §2 gives for
  invariants: a writer judges the row in the statement that writes it, and a
  predicate over another row needs the database to coordinate.
- **Printed by name.** `Expr.show` prints `Product.Draft`. The work package
  chooses how (the mechanism `Expr.operator`'s `definedAs` uses is the
  obvious one) and says which in its report.
- **`from: Draft` (D14)** joins the write's `when` with `and`, so the write
  is a `ConditionedWrite`, refused as `Unmet` from any other state, with no
  new code path. `Data.can` reads it as part of the `when`.
- **`becomes` (D15)**, on updates and inserts, says that every row the write
  can start from, with its patch applied, is in the target.
  - *Decided where declared.* `Write.update` runs the enumerator (below). A
    claim it proves costs nothing at run time. A claim it disproves throws
    there, with a row that breaks it.
  - *Enforced where it commits.* A claim enumeration cannot decide (`Sell`
    with `becomes: InStock`) is a postcondition: the write carries it as
    `ensures`, an invariant of that write alone, with the id
    `becomes:InStock`, the target's `after` as its predicate and the members
    it reads as its path. Each writer judges it beside the Entity's
    invariants, in the statement, and refuses it as `Invalid`. The client's
    `brokenByWrite` and `Data.can` judge it too.
    `Refusal.isInvalidBy(refusal, Write.ensured(Sell.write))` matches it.
  - A writer that cannot judge one says so: `RemoteServer.write` refuses a
    write with `ensures` over a writer without `postconditions`, as it does
    for `preconditions`.

Done-when replaces the issue's:

- `examples/writes` declares its three states once. `Publish` has no `when`
  of its own: it declares `from: Draft, becomes: Published` and is refused as
  `Unmet` from published and archived.
- A `becomes` the patch cannot keep throws where the write is declared,
  naming a row.
- A sale declared `becomes: InStock` is refused as `Invalid` where it would
  leave no stock, on SQLite, Postgres, D1 and the memory backend, and the
  client refuses it before sending.
- `Query.from(Draft)` returns drafts on SQLite, Postgres and the memory
  backend. A non-local refinement is queried on all three, and refused as a
  `from`.
- `Entity.inState` answers none for a row missing `status`.
- Type tests: `build` has no `before`; the literal form's `is` narrows and
  the predicate form's does not; a literal key that is no field, or a value
  the field cannot hold, does not compile.
- Mutations: the `from` predicate dropped from the `when`; `becomes`
  enumerated without the `when`; `becomes` judged over the row before; the
  postcondition left out of the statement.

### D18 to D20. `Laws.check`

```ts sketch
const report = Laws.check({
  writes: [
    Rename, Publish, Revert, Restock, Sell,                    // anything with { name, write }
    { name: 'ShopApi/Touch', entity: Product, footprint: Footprint.declared({ writes: [Product.fields.name], by: 'the Domain model' }) },
    { name: 'ShopApi/Import', entity: Product, footprint: Footprint.unknown },
  ],
})
Laws.show(report)   // the table below, as text
```

**Footprints.** A transition's footprint is the members of its Entity it
reads and writes, in one type, owned by `foldkit-entity`:

```ts sketch
type Footprint =
  | { _tag: 'Derived'; reads: ReadonlyArray<string>; writes: ReadonlyArray<string> }               // Write.footprint(write)
  | { _tag: 'Declared'; reads: ReadonlyArray<string>; writes: ReadonlyArray<string>; by: string }  // the author's word, and whose
  | { _tag: 'Unknown' }
```

- Members are named by Entity field key throughout: a pair's `reads` and
  `writes`, a footprint's, and the graph's `entity` paths say the same thing
  in the same terms. `Footprint.declared` takes fields by reference
  (`Product.fields.name`), so a field of another Entity is a type error and
  an error where it is made.
- An entry with a `write` has a `Derived` footprint and is enumerated.
- An entry with a `Declared` footprint is judged by disjointness alone: a
  state invariant it says it does not write is `Kept`, marked `declared`,
  with no `Enumerated` record, since nothing was enumerated. Every other pair
  is `Undecided`.
- **`Unknown` writes every member.** It is `Undecided` against every
  invariant of its Entity and never `Kept`. In the graph it has a `writes`
  edge to each member, so every law of the Entity asks it for evidence.
- An entry without a `write` makes no arrows: what it sets is not known.

`foldkit-remote-domain`'s `Imported.describe` (the Alchemy note's D12) uses
this type and does not declare its own.

The report is data: `pairs` (each entry against each invariant of its
Entity, with the members the invariant reads, the entry's footprint, and the
verdict), `arrows`, `states` and `findings`. Each pair it decides by
enumeration carries an `Enumerated` evidence record (§6).

Owner: `foldkit-entity`, in new files (`laws.ts`, and `enumerate.ts` shared
with `becomes`). A `Mutation.write` result fits `{ name, write }`, so the
package needs nothing of Remote's. Entities and states come from the writes'
own `input.entity`.

**A finite field** is one whose encoded schema is a literal, a union of
literals or a boolean, with or without null (read with `SchemaAST`'s guards).

**One write against one invariant** (a write's own `ensures` is judged as an
invariant of that write):

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
invalid before a write (`docs/declared-writes.md`). A `when` (with its
`from`) is judged three-valued over each; a row it definitely refuses is
dropped, and one it cannot decide stays. A set key's values are its input
schema's literals when that is finite, else the field's own.

**States.** For each Entity with declared local states and each write whose
relevant members are finite, the rows before and after give arrows:

| Finding | Meaning |
| --- | --- |
| `holds` | A declared `becomes` the declaration proved |
| `enforced` | A declared `becomes` kept by its postcondition, where the write commits |
| `undeclared` | A write with no `becomes` takes a row from one state to another |
| `refused` | The arrow's row after breaks an invariant, named |
| `unreached` | No write leaves a row in the state |
| `terminal` | No write starts from it. A report, not a fault |

All of these are reports. A write an invariant can refuse is legitimate. The
finding that fails a test is the graph's `law-unwitnessed` (§6).

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
file.

**D20. `foldkit-plus laws`.**

```text
npx foldkit-plus laws src/laws.ts            the module's default export
npx foldkit-plus laws src/domain.ts#report   a named export
```

- The export is a `LawReport`, or the `{ writes }` that `Laws.check` takes.
- **Loading TypeScript.** The command resolves `tsx` from the project (by
  walking the `node_modules` folders above the module, as `docs` does) and,
  when it is there, runs itself again under `node --import tsx`. Without it,
  it imports the file with Node's own TypeScript support and, where that
  fails, says to install `tsx`. A project's `.js` import specifiers for `.ts`
  files need `tsx`; the message says so.
- The logic (resolving the module, picking the export, the fallback) lives in
  a module the tests import, since `cli.test.ts` builds `cli.ts` from disk
  and `pnpm mutate` cannot reach it.
- Exit status 1 when the module cannot be loaded or the export is neither
  shape. Findings do not fail the command: they are reports.

## 6. Evidence, the graph, walks and scenarios (#537, #538, #543 parts 2 and 5)

### D23. Evidence records

```ts sketch
// foldkit-metadata
type Evidence =
  | { _tag: 'Enumerated'; transition: string; law: string }
  | { _tag: 'Scenario'; transition: string; law: string; name: string; runner: string }   // 'remote', 'sqlite', 'domain-story'
  | { _tag: 'Walked'; transition: string; law: string; seeds: number; steps: number; starts: ReadonlyArray<string> }
  | { _tag: 'RuntimeOnly'; transition: string; law: string; why: string }

Evidence.issuer('foldkit-remote/walk')   // { issue(record): Evidence }, made once by a producer
Evidence.issuedBy(record)                // Option<string>: the producer, none for a record nothing issued
Evidence.runtimeOnly({ transition, law, why })   // issued here; `why` is a non-empty sentence
```

- **Home: `foldkit-metadata`.** The check that issues `Enumerated` is in
  `foldkit-entity`, the walk and the scenario are in `foldkit-remote`, and
  the rule that reads them is in `foldkit-surface`. Entity and Surface share
  one dependency, and it is this package, whose job is typed facts one
  package attaches to another's declaration.
- **Stamped as `tested.ts` stamps.** An issuer keeps the records it issued in
  a `WeakSet`. A record built as an object literal, or copied with a spread,
  was issued by no one and is refused.
- **Ids.** A transition is `write:Sell` or `durable:CreatedTodo`; a law is
  `Product.reservedWithinStock` or `sync:todos-capped.atMost100Todos`.
  `Laws.transition(mutation)` and `Laws.law(invariant)` give an Entity's;
  the Sync contract's declared laws and Message set give a document's.
  Evidence naming a pair the graph does not hold (another Entity's, a write
  that no longer exists) is itself a finding, `evidence-unmatched`.
- **What the stamp does not prove.** It tells a record a producer made from
  one typed by hand. It does not stop a determined author calling
  `Evidence.issuer`, and a `Walked` record says only which seeds passed. The
  work package adds a repository check that `Evidence.issuer(` appears only
  in the three producer modules.
- **The producers:**

  | Kind | Issued by | When |
  | --- | --- | --- |
  | `Enumerated` | `Laws.check` | A pair it decides `Kept` by enumeration or disjointness |
  | `Walked` | `Walk.run` | A walk with no failure, for each transition it drew against each law it judged |
  | `Scenario` | `Scenario.run` | Per runner with no mismatch, for the scenario's write against each invariant that reads a member it writes |
  | `RuntimeOnly` | `Evidence.runtimeOnly` | By hand: the writer or the journal refuses it in production, and here is why nothing earlier covers it |

`482-temporal-laws-MATRIX.md` is not moved onto these records: its laws are
properties of Remote's reducer over local Messages, whose `writes` edges wait
on upstream (below). `heldValue.test.ts`'s walk does issue `Walked` records
for them, which the matrix can cite when those edges exist.

### D21, D22. The graph

contract-layer Phase 3 builds the whole graph from a Block Composition, which
waits on foldkit/foldkit#1655. The law half needs no Composition. It is built
now, in the shape Phase 3 will extend.

```ts sketch
// foldkit-surface
Graph.Node =
  | Owner { kind, name }            // a contract: remote:Shop, sync:todos-capped
  | Path { space: 'model' | 'entity', path }      // ['todos'], or ['Product', 'reserved']
  | Transition { id, kind: 'write' | 'durable' }  // 'message' joins with #1655
  | Law { id, owner, message }
  | State { entity, name }
  | Level { surface }               // a closed Surface (D31)

Graph.Edge =
  | owns(Owner, Path)
  | reads(Law | Level, Path)
  | writes(Transition, Path)
  | from(Transition, State) | to(Transition, State)
  | keeps(Transition, Law, Evidence)
  | refines(Level, Level)           // one closed Surface's projection contains the other's

Module.graph(module, { evidence? })       // nodes and edges, derived
Module.validate(module, { evidence? })    // the six rules, and three more
Graph.breakersOf(graph, law)              // each transition that writes a path the law reads, and its evidence
```

**Facts.** `Contract` gains `facts?: () => Graph.Facts`, plain nodes and
edges, computed when asked. Nothing is restated: each contract derives its
facts from declarations it already holds (contract-layer invariant 4).

| Contract | Contributes | From |
| --- | --- | --- |
| Remote (`Remote.make`) | A Law per invariant, a State per refinement, a Transition per mutation with a declared write, `reads`, `writes`, `from`, `to`, and a `keeps` edge per `Enumerated` pair | `Laws.facts(Laws.check({ writes }))`, over the domain's mutations. `Laws.facts` returns plain data in this shape; `foldkit-entity` does not import Surface |
| Sync (`forApplication.make`) | A Law per `laws` entry, a Transition per durable and server-only tag, `reads(Law, each shared path)` and `writes(Transition, each shared path)` | The contract's `laws`, Message set and `shared.dependencies`. A law is a function, so it is taken to read the whole shared slice |
| Any closed Surface | A Level, `reads(Level, each path)`, `refines`, and a Law `closure:<name>` reading the same paths | `Surface.make(…, { closed: true })` (D31) |

`keeps` edges also come from the `evidence` option: the records a test's
walks and scenarios returned, and its `Evidence.runtimeOnly` lines.

**Rules added to `Module.validate`:**

| Rule | Meaning |
| --- | --- |
| `law-unwitnessed` | A transition writes a path a law reads, and no `keeps` edge joins them. A pair sharing no path never matches |
| `evidence-unmatched` | An evidence record names a transition and a law the graph does not join, or was issued by no producer |
| `level-declared-twice` | Two closed Surfaces with the same projection and the same Messages |

For a Sync document every durable tag writes the shared slice and every law
reads it, so each tag needs evidence for each law. That is the point of #534:
a durable Message added later appears as `law-unwitnessed` until a walk
draws it or a line says the journal's judge is its only evidence.

`Finding.rule` gains the three names. `Module.validate`'s second parameter
is optional, so every call today stands. `Module.toMarkdown` and
`Module.toMermaid` gain a "Laws" section: law by transition by evidence.
`examples/writes` checks that table in as part of `LAWS.md`, by the same file
snapshot. `pnpm docs:check` is not extended; a snapshot test fails the same
way.

**What waits, and on what.** A local Message's `writes` edge: `modifyFields`
names fields at run time, and the transitions of a Composition are #1655's.
So a law over the local Model has no `law-unwitnessed` rule yet. A walk over
it still runs and still issues records.

### D24. `Walk.run`

```ts sketch
const result = await Walk.run({
  cases: messages,                 // Record<Tag, Record<name, (model) => Case>>
  from: [{ name: 'loaded', start: loaded }, ...Walk.states(Model, { count: 20, seed: 7 })],
  step: (model, message) => Data.reduce(model, message),      // may return a Promise
  violations: (before, message, after) => [...],              // { law, message } each
  laws: ['Product.reservedWithinStock'],                      // what `violations` judges
  transition: tag => `write:${tag}`,                          // default: the tag
  seeds: 200,
  steps: 12,
  regressions,                     // { name, from, case }: run first, each from its own start
})
// { failures: [{ start, seed, path, broken }], evidence: ReadonlyArray<Evidence>, seeds, steps }
```

- **Home:** `foldkit-remote/testing`, beside `Trace` and `Law`. Its callers
  are `heldValue.test.ts`, `examples/writes`' walk of `Sell` and `Restock`
  through the real writer, and the Sync law test; all can import that entry.
  `foldkit-plus/remote/testing` follows from the generator.
- **The union is checked at the call.** `Walk.cases<Message>()({...})`
  requires a key for every tag, so a new variant does not compile until it
  has a generator. This is `heldValue.test.ts`'s `satisfies`, moved.
- **Asynchronous.** A walk of declared writes must go through the writer:
  over the reference alone `Sell` breaks `reservedWithinStock` at once, and
  the law is kept only because the writer refuses.
- **The generator** is `heldValue.test.ts`'s linear congruential one,
  unchanged, so the same seeds draw the same walks.
- **Evidence** is empty when any walk failed.
- **`from` is a list (#543 part 2).** States no Message produced (a
  checkpoint, a hydrated snapshot, a row written by SQL) are written by hand
  and named, or derived:
- **`Walk.states(schema, { count, seed })`** returns named starts decoded
  from values it builds over the Schema's encoded side, by kind: a literal
  or a union picks a member; a boolean either; a number from a small pool
  (0, 1, -1, a large one, a fraction); a string from a pool (empty, short,
  one with a surrogate pair); an array of none, one or two; a struct, a
  record, a tuple and a null by recursion. Each built value is decoded
  through the Schema, so a check refuses what it should, and a refused value
  is drawn again, a bounded number of times. A Schema kind it has no
  generator for throws by name where `states` is called, with the path.
  Effect 4.1 ships no arbitrary, and no property-testing dependency is
  added: these generators are about a hundred lines and need no shrinking
  while a failure prints its start.

### D25. `Scenario`

One shape, for this note and for the Alchemy note's #546 harness
([544-547-alchemy-DESIGN.md](./544-547-alchemy-DESIGN.md) §6), which was the
second harness the first version of this decision waited for. **Owner: this
note's WP12, in `foldkit-remote/testing`.** That note's `WriteScenario` is
this type.

```ts sketch
interface WriteScenario<Principal> {
  readonly name: string
  readonly given: ReadonlyArray<{ readonly entity: AnyEntity; readonly row: Row }>   // encoded rows
  readonly principal: Option.Option<Principal>
  readonly now: number
  readonly when: readonly [mutation: MutationDescriptor, input: unknown]
  readonly operation: string
  readonly expect:
    | { readonly _tag: 'Accepted'; readonly row: Partial<Row> }
    | { readonly _tag: 'Refused'; readonly refusal: RefusalMatch }
    | { readonly _tag: 'Forbidden' }
}

const refused = Scenario.write({
  name: 'a published product does not go back to draft',
  given: [{ entity: Product, row: { id: 'p1', ownerId: 'ada', status: 'published', stock: 5, reserved: 1 } }],
  principal: Option.some({ id: 'ada' }),
  now: 0,
  when: [Revert, { id: 'p1', status: 'draft' }],
  operation: 'op-1',
  expect: Scenario.refused(publishedStaysPublished),   // or Scenario.refused('Unmet'), Scenario.accepted({ status: 'draft' }), Scenario.forbidden
})

interface ScenarioRunner<Principal> {
  readonly name: string          // 'remote', 'sqlite', 'domain-story'
  readonly run: (scenario: WriteScenario<Principal>) => Effect.Effect<ReadonlyArray<ScenarioStep>, unknown, never>
}
// ScenarioStep: { backend, step, expected, actual }, one per thing the runner owns and checked

await Scenario.run(refused, [Scenario.remote({ data: Data, backend: rows => serverLayer(rows) })], { report })
// { mismatches: ReadonlyArray<ScenarioStep>, evidence: ReadonlyArray<Evidence> }

Scenario.fromReport(report, { principal, now })   // one per decided arrow and per refused pair
```

- **Plain data, and runners apart from it.** A scenario holds no function
  and names no backend. `given` is rows per Entity (the Alchemy sketch had
  one Entity's rows; a scenario may seed two).
- **`principal`, `now` and `operation`** are what a run on a second backend
  needs: who asks, the clock, and the operation id a retry repeats.
- **A refusal is matched by declaration**: `Scenario.refused(invariant)` as
  `Refusal.isInvalidBy`, a write's `Write.ensured`, or `'Unmet'`,
  `'Conflict'`, `'Taken'`, `'Referenced'`.
- **Runners.** `Scenario.remote` ships here: it runs through `Law.check`
  over the backend the test supplies as a layer of rows, so the client's
  prediction and the server's answer are compared in the same run. Remote
  does not import `foldkit-remote-server`; the test hands the backend in,
  and `RemoteServer.memoryWriter` (the Alchemy note's WP2a) is the one to
  use where SQLite is not wanted. A SQLite runner that asserts the table and
  the ledger is an example's. The Domain Story runner is
  `foldkit-remote-domain/testing`'s. Each implements `ScenarioRunner`.
- **`Scenario.run`** runs every runner, compares the common decision and row
  once from the scenario, and returns the mismatches, each naming its
  backend and step. A test feeds one a wrong expectation and asserts the
  report, so the reporting can fail.
- **Evidence is issued here, by `Scenario.run`**, one `Scenario` record per
  runner with no mismatch, for the scenario's write against each invariant
  that reads a member it writes. A runner in another package issues nothing
  itself, so there is one producer.
- **Checked against the report before it runs.** With `report` given, a
  scenario that expects what enumeration disproved (published to draft
  landing) throws, naming the invariant, and runs nothing.
- **Generated.** `Scenario.fromReport` gives an acceptance scenario for each
  arrow that holds and a rejection for each refused pair. They run the
  reference judge's answer against the writer in the application's own
  stack, which the conformance suites do only for their own fixtures.
- **Messages.** `Scenario.messages({ name, given, when, expect })` is the
  same idea for an `update`: `given` is a history of Messages applied from
  `initial`, and `Scenario.runMessages(scenario, { app })` applies them and
  judges `expect` over the Model. It survives a change to how the Model
  holds its state. It issues `Scenario` records for a durable Message
  against a document's laws.
- External effects are not executed (the issue's own scope).

### D31. A closed Surface

`Closure`, in `foldkit-surface`, is D3's comparison as a helper:

```ts sketch
Closure.reads(app, projection, model, message)
// the top-level Model fields outside the projection that the projection after `message` depends on; [] when closed

Closure.violations(app, surfaces)
// (before, message, after) => each closed Surface the step broke, for `Walk.run`
```

- `reads` applies `update` to the Model, and to the Model with every
  top-level field the projection does not depend on reset to `initial`, and
  compares the two projections with the projection's codec. On a difference
  it resets one field at a time to name them. It needs only
  `projection.dependencies`, so it works for a read-only Projection.
- A Surface is declared `closed: true` in `Surface.make`'s options. For a
  Message in its set, the projection after depends only on the projection
  before and the Message; for one outside, the projection does not change.
  `Closure.violations` tests both.
- **Where it is enforced.** `Sync.mount` enforces it at run time for its
  shared slice (D3), because a breach there loses data. For any other closed
  Surface it is a law of the application, tested by a walk like any other,
  and its `closure:<name>` Law makes `law-unwitnessed` ask for that walk of
  each durable Message and write that touches its paths.
- **Callers:** `Sync.mount`; `examples/kitchen-sink`, which declares its
  agent context Surface closed and walks it; the graph.

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

## 8. Not built, and the concrete reason

Nothing here is left out for want of a consumer.

| Item | Reason | Kind |
| --- | --- | --- |
| Guard attachments on the identity (D2) | #332 made attachment a per-descriptor view on purpose, and "attaching twice appends" is designed. The fault is closed by `enforced` | Another design here does its job |
| The pre-send check refusing `Unmet` (D10) | A false `when` over the held row is not always `Unmet` on the server, so it would refuse writes the server accepts | Unsound |
| A refinement as a descriptor, `Entity.input(Draft, …)` (D12) | Every reader of `AnyEntity` would have to know it, which is #539's fault again. `from`, `becomes` and `Query.from(Draft)` give what it offered | Unsound |
| A Selection's type narrowed by state (D13) | A held row moves out of the state in place while the type still claims it | Unsound |
| A non-local refinement as a write's `from` or `becomes` (D16) | A writer judges one row in the statement that writes it | Another package's design (the writer's atomicity) |
| A law judged only when the operation changes what it reads (D5) | A law is a function; what it reads is not known | Unsound |
| A local Message's `writes` edge, and `law-unwitnessed` over the local Model (D21) | The transitions of a Composition are foldkit/foldkit#1655's | Waits on upstream |
| A declarative `update`, a solver, a transition graph declared on its own | #541's own "what stays out", unchanged | The issue's scope |

## 9. Work packages

Every brief carries AGENTS.md's git rules (shared worktree, explicit-path
commits, the temporary-index recipe for shared files, never `add -A`), the
checks to run (`pnpm format:check`, `pnpm typecheck:force`, the package's
tests, `npx vitest run examples --project unit`, `pnpm mutate:check`), and
its mutation spec. A package that changes a published API runs the Jev
review with its README and skill reference included, adds its entry under
Unreleased in `CHANGELOG.md` (a shared file: temporary index), and updates
its `skills/foldkit-plus/references/` file. Subagents push and report; the
coordinating session checks CI.

| WP | What | Issues | Model | After |
| --- | --- | --- | --- | --- |
| 1 | Descriptors: invariants on the identity, a bare guarded descriptor refused | #539 | Default | none |
| 2 | Refinements, the enumerator, `Laws.check`, `Footprint` | #535, #536, #543.4 | Default | 1 |
| 3 | `Data.can` | #533 | Sonnet | 1 |
| 4 | `Walk.run`, `Walk.states` | #538, #543.2 | Sonnet | 1; its example half after 2 |
| 5 | `Closure`, and the closure check in `Sync.mount` | #543.1 | Sonnet | the sessions now in `packages/sync` |
| 6 | A document's laws | #534 | Default | 5, and the session now in `packages/durable` |
| 7 | A form over the held row | #542, #543.3 | Default | 2, 3 |
| 8 | The guide | #540 | Sonnet | 8a now; 8b last |
| 9 | Agent `applies`, `Data.capability`, `Data.available` | #533 | Default | 3 |
| 10 | `becomes` enforced where the write commits | #535 | Default | 2, 3, A-WP2a |
| 11 | `Evidence`, and its three producers | #537 | Default | 2, 4 |
| 12 | `Scenario`, shared with the Alchemy note | #538 | Sonnet | 2, 4, 11 |
| 13 | A closed Surface | #543.5 | Sonnet | 5 |
| 14 | The graph: facts, `Module.graph`, the three rules, the renderers | #537 | Default | 6, 11, 13 |
| 15 | `foldkit-plus laws` | #536 | Sonnet | 2 |

```text
1 ─┬─ 2 ─┬─ 10
   │     ├─ 15
   │     ├─ 11 ─┬─ 12
   ├─ 3 ─┼─ 9   │
   │     └─ 7   │
   └─ 4 ────────┘
5 ─┬─ 6 ──┐
   └─ 13 ─┴─ 14 (also after 11)        8a any time, 8b last
```

**Files more than one package edits, and the order.** Each brief names the
others. Work packages of
[544-547-alchemy-DESIGN.md](./544-547-alchemy-DESIGN.md) are written A-WP.

- `packages/entity/src/entity.ts` (the export list): 2, then 10, 11, 7, one
  at a time.
- `packages/entity/src/write.ts`: 2, then 10. `laws.ts`: 2, then 11.
- `packages/remote/src/mutation.ts`: 3, then 10. `can.ts`: 3, then 9.
  `remote.ts`: 3, then 9, then 14. `walk.ts`: 4, then 11. `testing.ts` (the
  export lines): 4, then 12.
- `packages/surface/src/index.ts`: 5 (one export line), then 13, then 14.
- `packages/sync/src`: 5, then 6, then 14 (the contract's `facts`).
- `packages/remote-server/src/index.ts` and
  `packages/remote-drizzle/src/index.ts`: A-WP2a (its export line), then 10,
  then A-WP7. `packages/remote-server/src/memoryWriter.ts` is A-WP2a's; 10
  adds `postconditions` to it after A-WP2a lands.
- `packages/remote/src`: A-WP7 owns `wire.ts`, `model.ts`, `client.ts`,
  `store.ts`, `plan.ts`, `inspect.ts`, `whyReasons.ts`, none of which a
  package here edits. It waits for 3 and 4 by its own text; 9, 10, 11, 12
  and 14 edit other files.
- `examples/writes/package.json` is A-WP1's (an `exports` map). No package
  here edits it.
- `Scenario`: 12 owns the type. A-WP4 uses it. If A-WP4 is ready first it
  ships its local `WriteScenario` in the shape of D25, and 12 deletes it.
- `Footprint`: 2 owns the type. A-WP5 uses it.
- `examples/writes`: 2 owns `src/domain.ts`, the law test and `LAWS.md`; 3
  the demo and its test; 4 the walk test; 10 the sale's `becomes`; 12 a
  scenario test; 14 the `LAWS.md` table's evidence column.

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
  of the form, `brokenByWrite`, the Drizzle writer and `checkConstraints`
  (named `invariantChecks` here first; no such function exists) built on the
  bare descriptor; a guarded writer, a Drizzle guard and a Sync
  guard made from a bare descriptor of a guarded Entity each throw by name;
  `docs/declared-writes.md` and `docs/entity.md` say that either name
  judges, and that a server binds the descriptor `Guards.attach` returned;
  #332's table in `332-entity-versions-DESIGN.md` gets a dated note.
- **Mutations:** `invariantsOf` reading nothing of the shape; `enforced`
  returning `attached` unchanged.

### WP2. Refinements, the enumerator, `Laws.check` (#535, #536, #543 part 4). Default model.

It decides a published API's shape, and its enumeration must be sound.

- **Owns:** `packages/entity/src/write.ts`, `entity.ts` (exports), `expr.ts`
  (`Query.from`'s overload, and the printed name), new `refine.ts`,
  `enumerate.ts`, `laws.ts`; `packages/entity/test`;
  `examples/writes/src/domain.ts`, its law test and `LAWS.md`; a new dialect
  test in `packages/remote-drizzle/test` for `Query.from(Draft)` and a
  non-local refinement.
- **API:** §5 except the enforced half of `becomes`. Build the enumerator and
  `Laws.check` first, then `refine`, `from` and the decided half of
  `becomes`. Until WP10, a `becomes` enumeration cannot decide throws where
  declared with "needs a writer that enforces it", and WP10 replaces that
  throw. Tagged values are `Data.taggedEnum`, as `write.ts`'s are: the
  package does not depend on `foldkit`.
- **Done when:** §5's done-when apart from the sale; the report above as a
  file snapshot; a write added to the example changes it with no other edit;
  a numeric invariant is `Undecided`, never `Kept`; a transition invariant
  over untouched fields is not `Kept` by disjointness; an operator the table
  lacks is `Undecided`.
- **Also:** `Footprint`, `Write.footprint`, and entries without a `write`
  (§5). An `Unknown` entry is `Undecided` against every invariant; a
  `Declared` one is `Kept` only by disjointness over a state invariant; a
  `Declared` field of another Entity throws.
- **Mutations:** undecided treated as kept; `when` skipped while
  enumerating; disjointness applied to a transition invariant; `becomes`
  judged over the row before; the `from` predicate dropped from the `when`;
  `Unknown` read as writing nothing.

### WP3. `Data.can` (#533). Sonnet.

One package, with the design fixed here.

- **Owns:** `packages/remote/src/remote.ts` (the `Data` entry),
  `mutation.ts` (a `when` judge beside `brokenByWrite`), a new `can.ts`;
  `packages/remote/test/can.test.ts` and its mutation spec;
  `examples/writes/src/demo.ts` and `test/demo.test.ts`;
  `docs/declared-writes.md`'s section.
- **Does not touch** `writes.ts` (D10), `testing.ts` or `heldValue.test.ts`.
- **API and done-when:** §4, above D11.

### WP4. `Walk.run` and `Walk.states` (#538, #543 part 2). Sonnet.

- **Owns:** a new `packages/remote/src/walk.ts`, its export line in
  `testing.ts`, `packages/remote/test/heldValue.test.ts`, a new
  `packages/remote/test/walkStates.test.ts`, a new
  `examples/writes/test/sell.walk.test.ts`.
- **API:** D24, without the `evidence` field, which WP11 adds. The
  example's walk runs through its SQLite server; it may use
  `RemoteServer.memoryWriter` instead once A-WP2a has landed, and builds no
  memory writer of its own.
- **Done when:** `heldValue.test.ts` passes through the helper with the same
  seeds and the same regressions, and no local loop left; a variant without
  a generator is a type error at `Walk.cases` (a `@ts-expect-error` test); a
  law that holds from `loaded()` and fails from an installed start is found,
  with the start's name in the failure; `Walk.states` over Remote's Model
  Schema and over the example's row Schema gives values that decode, the
  same for the same seed, and throws by name and path for a kind it lacks;
  `Sell` and `Restock` walked through the example's server keep
  `reservedWithinStock`; `pnpm --filter foldkit-plus generate` and
  `pnpm paths` run.
- **Mutations:** the walk stopping after its first step; `from` reading only
  its first start; `Walk.states` skipping the decode; in the example, the
  writer's invariant check dropped (the walk goes red).

### WP5. `Closure`, and the closure check in `Sync.mount` (#543 part 1). Sonnet.

A bug with a reproduction and a fixed design.

- **After** the sessions now editing `packages/sync` have committed; check
  `git status` first. **Owns:** a new `packages/surface/src/closure.ts`, its
  export line in `index.ts` and its test; `packages/sync/src/mount.ts`, its
  header comment and `make.ts`'s `derivedReplay` comment; a new
  `packages/sync/test/closure.test.ts` and mutation spec; the durable
  Message section of `packages/sync/README.md` and
  `skills/foldkit-plus/references/sync.md` ("reads" beside "writes");
  `docs/replication.md:146-152`; `packages/surface/README.md` and
  `references/surface.md` for `Closure.reads`.
- **API:** D3, and `Closure.reads` of D31. `Closure.violations` is WP13's.
- **Done when:** the issue's `ClearedShown` is refused before the outbox,
  naming `filter`, and the Model returned is the one given (`toBe`); a
  durable Message that reads a local field without changing the slice is
  accepted; a pending operation causes no false refusal; a figure for a
  10,000-item slice is in the report.
- **Mutations:** the comparison dropped; `reads` resetting no field. The
  comparison made against the replica's committed slice survives: both runs
  of `reads` start from the same slice, so a pending edit cannot move it.

### WP6. A document's laws (#534). Default model.

It changes two packages' contracts and what crosses the wire.

- **Owns:** `packages/durable/src/journal.ts`, `errors.ts`;
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

- **Owns:** `packages/entity/src/invariant.ts` (`judgeInput`, `rowFrom`,
  `judgedBy`) and their export lines; `packages/form/src/index.ts`;
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
  evidence kinds and how to clear `law-unwitnessed`, the monotone form of a
  law added to live documents (D5), "when a state depends on the past, store
  the fact" (D16), and the section on a rule about the data written on one
  transition, with the Sync cap. `npx foldkit-plus docs "where does a rule
  go"` returns the guide's first section.
- **Owns:** those files only. The other packages' briefs own their own
  READMEs and references.

### WP9. An Agent capability over a write (#533, D11). Default model.

It changes the agent pipeline's order of checks, where a mistake leaks what
a row holds to a caller who may not write it.

- **Owns:** `packages/agent/src/expose.ts`, `runtime.ts`, `introspect.ts`,
  `errors.ts`, and the adapters' handling of the new reason (found by the
  suites); `packages/remote/src/can.ts` (`capability`, `available`) and the
  two `Data` entries in `remote.ts`; their tests; `docs/agents.md`;
  `references/agent.md` and `references/remote.md`; `examples/kitchen-sink`
  for one capability over a row write.
- **API:** §4, D11.
- **Done when:** D11's list; `applies` is not called for a principal
  `authorize` refused (a spy); one invocation reads one Model snapshot for
  all four steps; a hand-written `available` after the spread wins.
- **Mutations:** `applies` run before `authorize`; `Undecided` treated as a
  refusal; `Data.available` ignoring `No`.

### WP10. `becomes` enforced where the write commits (#535, D15). Default model.

Four packages' contracts, and a new refusal source in both writers.

- **Owns:** `packages/entity/src/write.ts` (`ensures`, `Write.ensured`) and
  the enumerator's handling of it; `packages/remote/src/mutation.ts`
  (`brokenByWrite` judges it); `packages/remote-server/src/index.ts`
  (`EntityWriter.postconditions`, the request's `ensures`, the memory
  backend, the miss classification); `packages/remote-drizzle/src/index.ts`
  (the statement); `packages/guard/src/server.ts` (the guarded writer
  forwards it, and an `ensures` over a Read-ruled member is unnamed, as an
  invariant is); their tests; `examples/writes` (a sale's `becomes: InStock`);
  `docs/declared-writes.md`.
- **Done when:** §5's sale, on SQLite, Postgres, D1 and the memory backend;
  the refusal is `Invalid` with rule `becomes:InStock` and
  `Refusal.isInvalidBy` matches `Write.ensured`; a writer without
  `postconditions` is refused at `RemoteServer.write`; `Law.check` agrees
  for the sale that lands and the one refused; `Laws.check` reports the
  arrow `enforced`.
- **Mutations:** the postcondition left out of the statement; judged over
  the row before; left out of the miss classification; the client's judge
  ignoring it.

### WP11. Evidence records (#537, D23). Default model.

A published shape three packages produce and a fourth reads.

- **Owns:** a new `packages/metadata/src/evidence.ts`, its export and tests;
  `packages/entity/src/laws.ts` (`Enumerated` records, `Laws.transition`,
  `Laws.law`, `Laws.facts`); `packages/remote/src/walk.ts` (the `evidence`
  field); a new `scripts/evidence-check.mjs` in `pnpm check`; READMEs and
  references for metadata and entity.
- **Done when:** a record typed by hand or spread from an issued one has no
  issuer; `Laws.check` issues `Enumerated` for decided pairs and none for an
  undecided one; a walk with a failure issues nothing; `runtimeOnly` refuses
  an empty reason; the script fails on an `Evidence.issuer(` outside the
  producer modules.
- **Mutations:** `issuedBy` answering for any record; a failed walk issuing;
  `Enumerated` issued for an undecided pair.

### WP12. `Scenario` (#538, D25). Sonnet.

- **Owns:** a new `packages/remote/src/scenario.ts`, its export line in
  `testing.ts`, its tests; a new `examples/writes/test/scenarios.test.ts`;
  a Message scenario in `packages/sync/test` for the cap;
  `references/remote.md`. It does not own a Domain runner or
  `examples/writes-domain`, which are A-WP4's.
- **API:** D25: `WriteScenario`, `ScenarioRunner`, `Scenario.write`,
  `.remote`, `.run`, `.fromReport`, `.messages`, `.runMessages`.
- **Done when:** the generated scenarios for `examples/writes` run green
  through the example's server; a scenario expecting published to draft to
  land throws before running, naming `publishedStaysPublished`; each
  hand-written scenario has a mutation that turns it red; a scenario with a
  wrong expectation gives a mismatch naming its backend and step; a run
  issues one `Scenario` record per runner with no mismatch, naming it, and
  none for a runner with one.
- **Mutations:** the report check skipped; `refused` matching any refusal;
  the backend not seeded from `given`.

### WP13. A closed Surface (#543 part 5, D31). Sonnet.

- **Owns:** `packages/surface/src/index.ts` (`Surface.make`'s `closed`, the
  contract's flag), `closure.ts` (`Closure.violations`), their tests and
  README; `examples/kitchen-sink` (its agent context Surface declared closed,
  and a walk of it); `references/surface.md`.
- **Done when:** a closed Surface whose Message reads outside it is found by
  the walk, naming the field; a Message outside its set that changes its
  projection is found; a Surface not declared closed is never tested.
- **Mutations:** the outside-Message half dropped; `closed` ignored.

### WP14. The graph (#537, D21, D22). Default model.

It extends `Module`, which every integration's contract feeds.

- **Owns:** `packages/surface/src/index.ts` (`Graph`, `Contract.facts`,
  `Module.graph`, `Module.validate`'s second parameter and three rules, the
  renderers' Laws section) and a new `graph.ts`;
  `packages/remote/src/remote.ts` (the contract's `facts`);
  `packages/sync/src/make.ts` (the contract's `facts`); their tests;
  `examples/writes` (a `Module.validate` test, and the evidence column of
  `LAWS.md`); an entry with an `Unknown` footprint contributes a `writes`
  edge per member; `examples/todo-app` or the Sync example that holds the cap (a
  `Module.validate` test); `contract-layer-PLAN.md` §5.1 and §6.3, which say
  what Phase 3 now starts from; `references/surface.md`.
- **Done when:** `Module.validate` over `examples/writes` reports `Sell x
  reservedWithinStock` as `law-unwitnessed` and stops once the walk's
  records are passed; over the capped document a durable Message added with
  no evidence is reported; a record typed by hand, or naming another
  Entity's pair, is `evidence-unmatched`; two closed Surfaces declared alike
  are reported; `Graph.breakersOf` answers "what can make `reserved` exceed
  `stock`" with `Sell` and `Restock` and their evidence; a `Module.validate`
  call with one argument behaves as today.
- **Mutations:** the rule dropped; an unissued record accepted; a pair
  sharing no path reported; `refines` computed the wrong way round.

### WP15. `foldkit-plus laws` (#536, D20). Sonnet.

- **Owns:** `packages/plus/src/cli.ts` (the command and its help line), a
  new `packages/plus/src/laws.ts`, their tests and a fixture project;
  `packages/plus/README.md`; `references/agents-md.md` if it lists the
  commands.
- **Done when:** the command prints `examples/writes`' report from its
  module with `tsx` resolved from the example; the fallback and its message
  are tested with `tsx` hidden; a module with neither shape exits 1 and says
  what it found; `cli.ts`'s part is mutated by hand and the spec says so.
- **Mutations:** the named export ignored; a report with findings exiting 1.

## 10. What the Alchemy note needs from this one

[544-547-alchemy-DESIGN.md](./544-547-alchemy-DESIGN.md) §7 names five.

| # | Need | Settled |
| --- | --- | --- |
| N1 | `Laws.check`'s pairs name members by Entity field | Yes. A pair, a footprint and the graph's `entity` paths all use field keys (§5) |
| N2 | An entry that is not a `Write`, with a `Declared` or `Unknown` footprint | Yes: `{ name, entity, footprint }`, in WP2. `Unknown` writes every member and is never `Kept`. `Footprint` is `foldkit-entity`'s type, and `Imported.describe` uses it |
| N3 | Evidence that names which interpreter ran | Evidence is now a stamped record, not a pointer. A `Scenario` record carries `runner`, and `Scenario.run` issues one per runner. A-WP4's item 5 becomes: pass the run's `evidence` to `Module.validate`. A test that is not a scenario is not evidence; `Evidence.runtimeOnly` is the line for that |
| N4 | `Scenario` as plain data with `principal`, `now`, `operation`, runners apart | Yes, D25, owned by WP12 in `foldkit-remote/testing`. `given` is rows per Entity. The Domain Story runner stays A-WP4's, in `foldkit-remote-domain/testing`, as a `ScenarioRunner` |
| N5 | `RemoteServer.memoryWriter` is built once | It is A-WP2a's. Nothing here builds one. WP4 and WP12 may use it; WP10 adds `postconditions` to it after A-WP2a |

One thing this note changes for that one: its §7 says an imported command's
graph nodes wait for contract-layer Phase 3. WP14 builds `Contract.facts`
now, so `Imported.describe`'s footprints can be contributed as `writes`
edges when A-WP5 and WP14 have both landed. That is a follow-up for A-WP5's
owner, not a package here.

## 11. For the maintainer

- **Breaking, in `0.x`:** `Entity.invariants(bare)` answers the invariants
  and the step returns its argument (WP1); `Entity.judgeInput`'s third
  parameter becomes an options object (WP7); a server that binds a bare
  descriptor of a guarded Entity now throws at start (WP1).
- **#539 is a server fault too**, by reading the code: a binding from the
  bare descriptor enforces no invariant, and a guard set declared
  `unguarded: 'allow'` serves it unguarded. Not run against a database.
- **Still not built**, each for a reason in §8 that is not a missing
  consumer. The two most open to argument are guard attachments staying on
  the descriptor (D2) and a refinement staying a value (D12).
- **Two notes, one tree.** The file order between this note's packages and
  the Alchemy note's is in §9. The coordinating session holds it; neither
  set of briefs can see the other's progress.
- **New dependencies between packages:** none. `Evidence` goes in
  `foldkit-metadata` so that Entity and Surface need not see each other;
  Remote, which already depends on both, joins them.
- **`tsx`** is not added as a dependency of `foldkit-plus`: the `laws`
  command uses the project's own, or Node's.
- **D5** refuses every operation on a document that already breaks a law
  until one repairs it. The alternative is to refuse only an operation that
  takes a holding law to broken, which lets a broken document grow. This
  note chose the strict one.
- **D3** costs two more `update`s per durable dispatch while a local field
  differs from its `initial` value, 0.4 ms for a 10,000-item slice (D3).
- **The stamp on evidence** (D23) tells a produced record from a typed one.
  It is not proof, and the note says what it does not prove.
