# sync: a document's rules are keyed by Message tag over the snapshot before, so a new durable Message skips them; declare laws judged over the snapshot an operation leaves

**What is wrong.** A Sync contract's `authorize` is a policy per durable tag. Each rule sees the authoritative snapshot before the operation, and "a variant without a rule is allowed" (`packages/sync/src/make.ts:118`). A rule about the document therefore lives on one transition. The guide's own example (`docs/replication.md:357-379`):

```ts
authorize: {
  CreatedTodo: ({ shared }) =>
    shared.todos.length < 100 ? true : { allowed: false, reason: 'A list holds 100 todos' },
}
```

**Scenario.** Add a second durable Message that also grows the list (`DuplicatedTodo`, `ImportedTodos`). It has no rule, so it is allowed, and a list holds 101 todos. Nothing fails at definition, in a test, or at run time. The cap was a fact about the document, and it was written as a fact about one Message.

This is what #183 fixed for rows. That design's opening case is the same one: every check that exists passes, and the state that results is invalid, because nothing judges the state that results.

**The carrier is already there.** `SyncRefusal.Invalid` has `entity`, `rule` and `path` to name an invariant, "as Remote's do", and `journalExchange` "knows none, so it sends them empty" (`packages/sync/src/refusal.ts:33-43`).

**Proposal (sketch: a shape to review, not an API).**

```ts
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

- **Judged over the snapshot the operation leaves**, inside the commit, after the journal has reduced it and before it appends. Every durable tag is judged, including one added later.
- **Reading `before` makes it a transition law**, as an invariant that reads `before` is.
- **Refused as `Invalid`** with `rule` set to the law's id, so a replica matches the declaration and not a string, as `Refusal.isInvalidBy` does for Remote.
- **Not a rule.** `authorize` keeps "who may" and nothing else. A law is never one of its alternatives, so no principal is excused it. The four kinds of #184 then hold for documents too.
- **A function, not an `Expr`.** The snapshot is a slice of the Model, not a row, and both sides run TypeScript. The document boundary rule is unchanged: a law is judged where one document's snapshot is enough.

**Open questions.**

1. **Repair.** A law added to a document that already breaks it would refuse every operation that does not fix it. Entity's answer is to judge the row a write leaves, so a repair lands. Is that enough here, or is a law judged only when the operation changes what it reads?
2. **The server's own writes.** Does `appendAsServer`, or a reaction's append, get judged? A row's invariants hold "whoever writes it". If so, what happens to a reaction whose append is refused?
3. **The replica.** Does it judge its own optimistic edit and show the refusal before the exchange, as `Data.mutate` does, or wait for the server?
4. **D1.** Without a lock a law sees the latest committed snapshot and a concurrent commit retries, as `validate` does today. Confirm that this holds.

**Consumer.** The cap in `docs/replication.md`, and `examples/todo-app`.

**Done when.**

- The guide's cap is a law. A second durable Message that grows the list is refused at 100 with no rule of its own.
- A replica's rejected operation carries `Invalid` with the law's id, and a helper matches it against the declaration.
- A law over a part of the Model outside `shared` is refused where the contract is made.
- Mutation specs: dropping the judge, and judging the snapshot before instead of after, each turn a named test red.
- `docs/replication.md` "Choosing document boundaries" says where a law fits and where it does not. Unique usernames still do not.

**References.** `packages/sync/src/make.ts:88-135`, `packages/sync/src/refusal.ts:28-45`, `packages/sync/src/journal.ts:185-188`, `docs/replication.md:330-425`, `docs/design/entity-invariant-DESIGN.md` §0 and §1, `docs/design/190-sync-refusals-DESIGN.md`.
