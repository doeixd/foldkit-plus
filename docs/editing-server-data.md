# Editing server data through a journal

When rows are too many to replicate, but edits to them must survive going
offline and agree across devices, let a journal own the edits, make the
table the journal's read model, and draw each row as Remote read it with the
edits it has not absorbed laid over it.

This guide uses both [Remote](./remote.md) and [Sync](./replication.md); read
those first. [`examples/registry`](../examples/registry) is the whole pattern,
100,000 products edited from two devices.

## When to use it, and who owns what

| You have | Use | Who owns the fact |
| --- | --- | --- |
| Rows a server holds, edited online, where losing the cache loses nothing | a Remote mutation | the server; the client's optimistic layer goes when the request settles |
| Shared state small enough for every replica to hold whole | a Sync slice | the journal; every replica keeps the document |
| Rows too many to replicate, edited offline, and the edits must converge | this pattern | the journal owns the edits; the table is derived from them |

In this pattern:

- **The journal owns the edits.** Each is a durable Message, committed in one
  order, stamped with the sequence it committed at (`at`) and who committed it
  (`by`).
- **The table is the journal's read model.** Only the journal writes it: each
  committed edit, applied with its sequence. Each row carries the highest
  sequence applied to it, its `revision`. The table is not a second owner; it
  can be rebuilt from the seed and the log.
- **Remote caches the table's rows**, as it caches any server-owned fact.
- **The replicated slice holds only what the table lacks**: edits not yet
  applied, or applied but not yet read back. Usually nothing.

## The mental model

```text
cell shown = the row's value, unless an edit of that cell is
             pending (no `at`), or
             committed after the row's revision (at > row.revision)
```

```text
device                                   server
------                                   -----------------------------------------
cell edit -> EditedProducts (pending) -> journal: validate -> sequence n -> stamp {at: n, by}
  shown at once, kept in the outbox        |
                                           +-> settle -> table: row, revision := n
                                           |              (only where revision <= n)
                                           +-> reply and notice -> every replica: edit {at: n}
Remote read <----------------------------- the row {..., revision}
shown = row + edits where at is none or at > row.revision
on a clock: AbsorbedEdits {through} -> replicas drop at <= through; the log compacts
```

An edit is in one of four states:

1. **Pending.** On this device only, in its outbox. Shown at once.
2. **Committed, not yet in the row.** The journal has it; the table has not
   written it, or this device has not read the row since. Shown.
3. **In the row.** A read of the row is at or past its sequence. The row shows
   it; the edit is not needed.
4. **Absorbed.** The server has recorded that the table holds it. Every
   replica drops it, and the log behind it compacts.

The revision is per row, not one checkpoint for the table, because Remote
caches rows read at different moments. Recovery applies edits in commit order
and stops at the first failure, so a row at revision 7 holds every edit to it
up to 7.

## A sixty-second path: one column

`foldkit-sync/entity` keeps the edits one per cell and lays them over the
rows; `foldkit-sync/journal` keeps the table. In the domain, shared by client
and server:

```ts
import { EditableEntity } from 'foldkit-sync/entity'

export const ProductEdits = EditableEntity.make(Product, { members: ['cents'] })
```

In the application, the durable Message, its fold, and the rows as shown:

```ts
const Base = Bundle.compose({
  remote: Remote.Model,
  edits: Schema.Array(ProductEdits.Edit),
}).pipe(Bundle.withMessages({ ...Remote.messages, EditedProducts: ProductEdits.edited }))

// in update
EditedProducts: ({ changes, at, by }) => ({
  model: modifyFields(model, {
    edits: edits =>
      ProductEdits.merge(edits, changes, Option.fromUndefinedOr(at), Option.fromUndefinedOr(by)),
  }),
}),

// what the grid draws
const rowsOf = (model: Model) =>
  RowModel.map(GridCrud.rows(Products.page(model), row => row.id), model.edits, ProductEdits.overlay<Row>)
```

In the Sync contract, the stamp the journal writes at commit:

```ts
stamp: {
  EditedProducts: ({ changes }, commit) =>
    Message.EditedProducts({ changes, ...ProductEdits.stamped(commit) }),
},
```

On the server, the table:

```ts
const { settle, absorb } = editsJournal({
  documentId: RegistrySync.documentId,
  journal,
  editsOf: operation => /* EditedProducts' changes and at, or none */,
  // One cell, with its sequence, never moving a row back.
  apply: (change, at) =>
    Effect.try(() =>
      sqlite.run('update products set cents = ?, revision = ? where id = ? and revision <= ?', [
        change.value, at, change.id, at,
      ]),
    ),
  // The highest revision any row holds: settling refuses a table past the journal.
  tableRevision: Effect.try(() => sqlite.highestRevision()),
  holdsThrough: (snapshot, through) => ProductEdits.holdsThrough(snapshot.edits, through),
  absorbed: (through, cursor) => /* the server's AbsorbedEdits operation */,
  server,
})
// journalExchange({ ..., settle }) applies on every exchange; a clock calls absorb.
```

`editsOf` and `absorbed` are the application's Messages, spelled out in
[`examples/registry/src/journal.ts`](../examples/registry/src/journal.ts);
they are elided above. The snippets compile in
[`examples/registry/test/guide.test-d.ts`](../examples/registry/test/guide.test-d.ts).

## What each call does, and does not

- **`ProductEdits.edited` and `.Edit`** are schemas: the Message's fields and
  a cell's stored edit. They describe; they hold nothing.
- **`merge`** is pure: the edits with the changes laid over them, each cell's
  latest kept. It does no I/O and sends nothing; `Sync.fact` in `update` is
  what makes the Message durable and sends it.
- **The stamp** runs on the server at commit, inside the journal. A client
  never sends `at` or `by`; the journal's `validate` refuses one that does,
  since its sender would show the edit as committed when it was not.
- **`overlay`** is a pure read for `RowModel.map`, built once per `edits`,
  which the map caches by identity. It owns nothing.
- **`settle`** is I/O: it runs `apply` for each committed change as a
  recovery intent. The effect ledger and the table are separate databases, so
  an intent may run twice after a crash; `apply` never moving a row back is
  what makes that harmless.
- None of this is a Remote mutation. Remote only reads the table.

## Build outward

**Absorbing.** On a clock, `absorb` records, as the server's own operation,
that the table holds every edit through the recovery cursor. Every replica
drops those edits, and the journal compacts the log behind them, so a new
replica is sent a small snapshot, not the history. It never compacts past
what recovery has applied. Let only the server append it: an `authorize` rule
on the contract.

**Held edits.** When the slice drops an edit whose row this page has cached at
an older revision, the row would show the stale read until it is read again.
`onReinstall` keeps such edits (`held`) and asks for the rows again; once a
read reaches an edit, `settled` lets it go.

**Conflicts.** The later commit wins, by the journal's order, not by edit
time: an edit made offline earlier but committed later wins. `replaced` tells
a page whose own edit lost: its replica wrote the cell, and another
replica's commit holds another value. It compares replicas, not people, so
the same person's two tabs are told of each other. When the journal absorbed
the winning edit before the losing page heard of it, the slice no longer says
whose it was; `settled` sees it in the row (at or past the edit, another
value) and reports "a later edit".

**Refusals.** A refused operation comes back with its rejection, the operation
itself included, and the replica drops it. `cellsOf` names what it changed, so
the page can mark the cells and say why.

**Marks.** Each cell can say where its edit is: not yet sent, saved and not yet
in the table, refused, replaced, and where another device is. The grid's
`GridMarkStyle` and `GridLegend` draw them.

**An unchanged cell is no edit.** The grid reports nothing for a draft left
as it began, judged against the text the edit began from, not the row as it
is now; otherwise leaving an editor as it opened would write the old value
over a change another device made meanwhile.

## Failure and recovery

- **Offline.** The edit stays pending in the outbox, through a reload, and is
  sent on reconnect.
- **The table write fails or lags.** The edit is committed and the row's
  revision older, so it keeps showing. The next exchange's `settle` tries
  again; nothing absorbs past it. `settle` runs on exchanges, not on a timer.
- **A write runs twice.** Harmless: it never moves a row back.
- **A refused operation.** Rejected by id, dropped by the replica, its cells
  marked; the outbox behind it still goes.
- **A forged stamp, or a forged `AbsorbedEdits`.** Refused by `validate` and
  `authorize`.
- **Two devices edit one cell.** The later commit wins everywhere; the loser
  is told.
- **A server restarted over a compacted journal.** `settle` starts at the
  journal's floor, not at 0, so it does not ask for history that is gone.
- **A server reset.** A new epoch: replicas rebuild and resend what they had
  not sent; committed edits of the old history are gone. `onReinstall` is told
  (`reset`), and the page reads its rows again, since their revisions counted
  the old history. The table must be reset with the journal: a table that
  outlived it holds revisions past every new sequence, so `apply` would skip
  each new edit and the replicas would count it absorbed. `settle` refuses to
  start while `tableRevision` is past the journal's cursor
  (`TableAheadOfJournalError`), on every exchange, until the two agree.
- **An edit to a row the table has not got.** Refuse it at commit, in the
  journal's `validate`; its sender is told and its cell marked. Recovery
  cannot refuse what has committed: let through, the edit would change no row
  and vanish once absorbed. The registry's `validate` does this.
- **A sorted page.** An unabsorbed edit shows its new value in its row's old
  position until the page is read again.
- **The recovery cursor in a persistent deployment** lives in the process; a
  restarted server recovers again from the floor, and the ledger keeps each
  intent from writing twice within an epoch.

## Limits and when not to use it

- A cell is last-writer-wins. Text is not merged; for that, see CRDT-backed
  documents.
- The journal and the table must survive, or be rebuilt, together.
- If every replica can hold the whole state, a plain Sync slice is simpler.
- If edits need no offline life, a Remote mutation is simpler.

## Terms you may know

| Here | Elsewhere |
| --- | --- |
| a row's `revision` | a read model's checkpoint or position (Marten's projection progress, EventStoreDB's subscription checkpoint, Axon's tracking token), kept per row |
| an edit shows while the row's revision is older | EventStoreDB's stale-read check: the client's position is past the read model's |
| committed, not yet in the row | Linear's completed transactions waiting for their `lastSyncId` |
| dropping edits the base has | Replicache discarding mutations up to `lastMutationID`; Electric discarding optimistic state once its txid arrives |
| journal and table | Kleppmann's system of record and derived data |
