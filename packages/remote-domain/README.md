# foldkit-remote-domain

Experimental: it tracks a beta. It pins the exact `@alchemy.run/domain` and
`alchemy` releases it was checked against (`2.0.0-beta.86`).

An [Alchemy Domain](https://github.com/alchemy-run/alchemy) model is an
authoritative server: Commands go to Aggregates that `decide`, the Events they
record are the truth, and Views fold those Events into rows. This package lets
a Foldkit page read and write that model **through Remote**, as it reads and
writes any other server, instead of keeping a second copy of the rows.

It does that on the client's side of the wire: `DomainRemote.layer` is a
`RemoteClient` built from the Domain Api's own typed client. Nothing sits
between them, and no Remote server is involved.

## Who owns what

| Fact or transition | Owner |
| --- | --- |
| Whether a command is allowed, and the Events it records | the Domain model (`decide`, `evolve`) |
| Who may read a row | the Domain model (the View's `validate`, its middleware) |
| The page's copy of a row, a write's pending state, its optimistic value, a refusal | Remote (`Remote.Model`) |
| A write's **receipt** while its View has not caught up, and each row's revision | Remote (`Remote.Model`), as a read-after token and a row revision on Remote's wire |

The page still declares the write as Plus declares any write
(`Mutation.write`), so prediction, `Data.refusal` and `Refusal.isInvalidBy` read
the same declaration they read against a SQL server. Only the authority changes.
The adapter owns no row, decides nothing and holds nothing a reload would lose:
it translates. The one thing the Domain model cannot tell a client, how far its
View has to read before it shows a write the client already knows committed,
it hands to Remote as a token, and Remote keeps it in its Model.

`foldkit-remote-domain` and `foldkit-remote-server` are two ways to reach an
authority, not two layers of one. A Remote server answers a page from a SQL
store it guards itself; this package answers it from a Domain Api, which already
authenticates and decides who reads each key. Do not put one in front of the
other: each would authorize every call a second time.
It also does not use `@alchemy.run/domain/Foldkit`, which folds Domain state
into Model fields of the application's own: beside `Remote.Model` that is two
owners of one row.

## The mental model

A Domain command commits at once, but a View is updated afterwards, so a read
straight after a write can still show the row from before it. Remote's Model
keeps the facts that close that gap, and the adapter carries them across:

```text
revision(row) = the View state's revision field, sent with every row
floor(key)    = the receipt of the newest write to the key no read has confirmed,
                sent to Remote as the write's read-after token, `stream@version`

a row reaches Remote's store  only if  revision(row) >= the revision Remote holds
a read of key                 asks     snapshot(key, { atLeast: floor(key) })  while a floor is set
floor(key) clears             when     such a read answers; a View still behind is named in `behind`
```

A **receipt** is the `{ stream, version }` a command answers with. A **revision**
is a number field of the row that every event of its stream moves, which you
name when you bind the View. Rows are ordered by it, never by the View's
cursor: the cursor does not move when a state changes with no output event.

## Install

```bash
pnpm add foldkit-remote-domain @alchemy.run/domain@2.0.0-beta.86 alchemy@2.0.0-beta.86
```

The pinned betas peer on `effect ^4.1.4`. Foldkit Plus's own tests run them on
`effect@4.1.4`.

| Entry | Holds | Runs |
| --- | --- | --- |
| `foldkit-remote-domain` | `DomainRemote`: the `RemoteClient` layer and its bindings | the browser, a test |
| `foldkit-remote-domain/lower` | `Lower.check`, `Lower.write`: a declared write becomes an aggregate | where the model is hosted |
| `foldkit-remote-domain/imported` | `Imported.mutation`, `describe`, `show`: a command nobody declared a `Write` for | anywhere |
| `foldkit-remote-domain/testing` | `Fixture.make`: a model as a `RemoteClient` for client tests | tests |

## Sixty seconds: one View, one command

The Domain side is Domain's own code: an Event, a Command, an Aggregate that
decides it, a View that folds it, a Model, an Api.

```ts
import * as Domain from '@alchemy.run/domain'
import { Effect, Option, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'

class Renamed extends Domain.Event('Renamed', { name: Schema.String, revision: Schema.Int }) {}

class Rename extends Domain.Command('Rename', {
  target: Schema.String,
  input: { name: Schema.String },
  events: [Renamed],
}) {}

class Note extends Domain.Aggregate('Note', {
  id: Schema.String,
  state: Schema.Struct({ name: Schema.String, revision: Schema.Int }),
  initial: { name: '', revision: 0 },
  commands: [Rename],
  decide: {
    Rename: (state, command) => [new Renamed({ name: command.name, revision: state.revision + 1 })],
  },
  evolve: { Renamed: (_, event) => ({ name: event.name, revision: event.revision }) },
}) {}

class NoteRow extends Domain.View('NoteRow', {
  from: [Note],
  key: Note,
  state: Schema.Struct({ name: Schema.String, revision: Schema.Int }),
  initial: { name: '', revision: 0 },
  evolve: { Renamed: (_, event) => ({ name: event.name, revision: event.revision }) },
}) {}

class Notes extends Domain.Model('Notes', { aggregates: [Note], views: [NoteRow] }) {}

class NotesApi extends Domain.Api('NotesApi', {
  model: Notes,
  commands: ['Rename'],
  views: ['NoteRow'],
}) {}
```

The Remote side declares the Entity the page reads and the mutation it sends,
and binds each to the Api:

```ts
const NoteEntity = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
)

const RenameNote = Mutation.make('RenameNote', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
})

const NoteReads = DomainRemote.view(NoteEntity, NotesApi, 'NoteRow', { revision: 'revision' })

const RenameBinding = DomainRemote.command(RenameNote, NotesApi, 'Rename', {
  entity: NoteEntity,
  target: input => input.id,
  input: input => ({ name: input.name }),
  written: (_reply, input) => ({ name: input.name }),
})

const client = DomainRemote.layer(NotesApi, {
  views: [NoteReads],
  commands: [RenameBinding],
  principal: Effect.succeed(Option.some('ada')),
  denied: () => 'Unauthenticated',
})
```

What each call means:

- `DomainRemote.view` and `DomainRemote.command` are **declarations**. They do
  no I/O. They throw, naming the field, where they are made when the View's state
  lacks a field the Entity declares or `revision` is not stored as a number; the
  View and command names, and the keys they use, are checked by type against the
  Api's own.
- `DomainRemote.layer` is the only call that does anything: it provides
  `RemoteClient` once the Api's client is provided.
  Provide that client over a protocol, `NotesApi.layerClientInProcess` on the
  server or `NotesApi.layerClientHttp(url)` (it needs an `HttpClient`) from a browser, and `Remote.make`'s
  Data uses it as it uses any `RemoteClient`.
- `principal` is who the Domain session is, as results name them. The adapter
  refuses a write made for anyone else before it sends anything
  (`RemotePrincipalChanged`).
- `denied` says what a middleware's refusal means to Remote, `'Unauthenticated'`
  or `'Forbidden'`. A refused read is always `Unauthenticated`.
- `written` is what the write answers with when its View is behind (below). It
  does not read the View, and it is not the row: it is the fields the command's
  reply says it wrote.

## A write whose View is behind

`mutate` sends the command, and then reads the View at the command's receipt.
What it answers depends on whether the View has caught up (the **View behind**
rows are the ones that need the adapter):

| What happened | What Remote sees |
| --- | --- |
| the command committed, the View is caught up | `MutationSucceeded` with the row the View now holds |
| the command committed, the View is behind | `MutationSucceeded` with `written(reply, input)` as the row's values, and the receipt as the answer's `after` token: Remote holds the row to it |
| a Rejection the binding maps with `refuse` | `RemoteMutationError` carrying the mutation's own `Refusal` |
| a Rejection mapped with `forbid`, `unauthenticated` or `fail` | `RemoteForbidden`, `RemoteUnauthenticated`, or `RemoteMutationError` with a message |
| a middleware error | `RemoteUnauthenticated` or `RemoteForbidden`, by `denied` |
| the transport failed, the Api did not answer, or the call was cut short | `RemoteUnreachable`: the outcome is unknown, and Remote's retry carries the same operation |

It never answers a committed write as failed, and never with a row older than
the write. Answering `Unreachable` would call a known commit unknown, and
answering success with no row would release the optimistic layer over the old
value; the reply is the third thing the client has, and it is authoritative for
what the write set. With it in the answer, Remote's own echo rule keeps a
lagging live patch from overwriting those fields.

Remote keeps the floor in its Model, beside the row: a reload that restores
the store (`persistence`) restores it too. While it is set, Remote reads the
row again carrying the token, and the adapter asks the View at the receipt.
`Data.inspect(model).floors` lists the rows waiting, and `why` names the wait
(`ReadAfter`). Nothing in the adapter is pending.

### The command id

A Remote operation is one write across retries; Domain's idempotency key is a
`commandId`. The adapter derives it, so that a retry is the same command and
nothing else is:

```text
commandId = `${mutation}:${operation}:${digest}`
digest    = a short hash of [principal, target, keys, input]
```

| Case | SQLite, ledgered writer | Domain alone | Domain through the adapter |
| --- | --- | --- | --- |
| same operation, same request, same principal | answered from the record | first receipt | first receipt |
| same operation, different input | refused: recorded for another request | first receipt, silently | a new command, decided on its own |
| same operation, another principal | decided afresh in its own scope | first receipt, `decide` skipped | a new command, decided afresh |

A request with no `operation` is refused (`RemoteMutationError`): sending it
would make a retry a second write. `Data.mutate` always mints one.

The middle row still differs from the SQL ledger for a command written by hand.
A command lowered with `Lower.write` closes it where it is decided (below).

## Importing a command nobody declared

A Domain command with no `Write` still has to be callable from a page.
`Imported.mutation` declares one as a mutation, with the command's own schemas as
its input and output and no `write`, so Remote predicts nothing for it:

```ts
import { Footprint } from 'foldkit-entity'
import { Imported } from 'foldkit-remote-domain/imported'

const ImportedRename = Imported.mutation(NotesApi, 'Rename', {
  entity: NoteEntity,
  footprint: Footprint.declared({ writes: [NoteEntity.fields.name], by: 'the notes team' }),
})

const description = Imported.describe(NotesApi, {
  views: [NoteReads],
  commands: [DomainRemote.command(ImportedRename, NotesApi, 'Rename', {
    entity: NoteEntity,
    target: input => input.target,
    input: input => input.input,
  })],
})
console.log(Imported.show(description))
```

Its **footprint** says which fields the command reads and writes: `Derived` from
a `Write`, `Declared` by an author (with `by`, whose word it is), or `Unknown`.
Unknown is a value a consumer must handle, never an empty list: Remote reads it
as "may write any field", so no list is judged unaffected by the command.
`Imported.describe` lists what the bindings import, each command with JSON
Schemas of its input and reply, its rejections and the form key each shows
beside, and its footprint. `Imported.show` prints that as Markdown. The shop
example keeps its own as `IMPORTED.md` and a test compares it, so a Domain
release that changes a schema shows as a diff.

## Testing a page against a Domain model

`foldkit-remote-domain/testing` hosts a model in memory with every View delivery
held until you drain, seeds it, and answers `RemoteClient` through the adapter.
A client test then drives a page against a real Domain model with no server:

```ts
import { REMOTE_PROTOCOL_VERSION, RemoteClient } from 'foldkit-remote'
import { Fixture } from 'foldkit-remote-domain/testing'

const shop = Fixture.make(NotesApi, {
  model: Notes, // the Domain.Model the Api is over
  given: [{ aggregate: 'Note', id: 'n1', events: [new Renamed({ name: 'Draft', revision: 1 })] }],
  bindings: { views: [NoteReads], commands: [RenameBinding], denied: () => 'Unauthenticated' },
})

const read = Effect.gen(function* () {
  yield* shop.drain // the View sees the seeded Event only after this
  const client = yield* RemoteClient
  return yield* client.read({
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Note', id: 'n1', fields: ['name', 'revision'] }],
  })
}).pipe(Effect.provide(shop.layer))
```

`shop.layer` provides `RemoteClient` and the Api's own client;
`shop.commits()` lists the Events commands committed (seeded Events are not
commands); `shop.as` is who the calls are made as, for a model with middleware
that reads the call's headers (`as`, `headers`, `middleware` and `handlers` are
its options). `through` wraps the Api's client after the actor's headers are
attached, to hold a reply back or lose it after the command ran; this package's
own ordering tests use it.

`given` commits Events directly, as Domain's Stories do, through
`Model.Internals`, which Domain marks internal: a Domain release can change it,
and the tests of this package fail when it does.

## Lowering a declared write

`foldkit-remote-domain/lower` turns a `Write` into an aggregate, so the rules
are declared once and decided by the same code a SQL server runs. `decide` states
no rule: it lands the write through `RemoteServer.write` over `GuardServer.writer`
over `RemoteServer.memoryWriter` on the one row the aggregate holds. Change the
shared rule, and both authorities change.

<!-- docs-check standalone
import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Mutation } from 'foldkit-remote'

const User = Schema.Struct({ id: Schema.String })
const ProductFields = Entity.define(
  'Product',
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    stock: Schema.Number,
    reserved: Schema.Number,
    revision: Schema.Number,
  }),
)
const Shop = Guards.declare(
  'Shop',
  User,
  guard => ({
    isOwner: guard.row(ProductFields, user => Expr.eq(ProductFields.fields.ownerId, user.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const reservedWithinStock = Entity.invariant<typeof ProductFields>(
  'reservedWithinStock',
  ({ after }) => Expr.lte(after.reserved, after.stock),
  { message: 'Reserved stock cannot exceed the stock', path: ['reserved'] },
)
const Product = ProductFields.pipe(
  Guards.attach(Shop, { row: { Read: [Shop.isOwner], Update: [Shop.isOwner] } }),
  reservedWithinStock,
)
const Policy = Shop.implement({})
const ReserveStock = Mutation.write(
  'ReserveStock',
  Write.update(
    Entity.input(
      Product,
      Schema.Struct({ id: Schema.String, revision: Schema.Number, quantity: Schema.Int }),
      { quantity: Entity.unmapped },
    ),
    { id: 'id', expect: 'revision', increment: { reserved: 'quantity' } },
  ),
)
-->

```ts
import * as Domain from '@alchemy.run/domain'
import { Option, Schema } from 'effect'
import { RpcMiddleware } from 'effect/rpc'
import { Lower } from 'foldkit-remote-domain/lower'

class StockReserved extends Domain.Event('StockReserved', {
  quantity: Schema.Int,
  reservedAfter: Schema.Number,
  revisionAfter: Schema.Number,
}) {}

class ProductListed extends Domain.Event('ProductListed', { row: Product.schema }) {}

class CurrentUser extends Domain.RequestContext<CurrentUser>()(
  'Shop/CurrentUser',
  Schema.OptionFromNullOr(User),
) {}
class Session extends RpcMiddleware.Service<Session, { provides: CurrentUser }>()('Shop/Session') {}

const Reserved = Lower.write(ReserveStock, {
  policy: Policy,
  revision: 'revision',
  principal: CurrentUser,
  middleware: [Session],
  listed: ProductListed,
  event: StockReserved,
  record: (after, _before, input) =>
    new StockReserved({
      quantity: input.quantity,
      reservedAfter: after.reserved,
      revisionAfter: after.revision,
    }),
  apply: (row, event) => ({ ...row, reserved: event.reservedAfter, revision: event.revisionAfter }),
})
// Reserved.command · .rejections · .decide · .evolve · .reply · .state · .initial
// Reserved.view · .binding(api) · .reads(api, viewName)
```

`Lower.write` derives everything it can, and asks for what it cannot:

| Part of the model | Comes from |
| --- | --- |
| The command's tag and target | the mutation's name; the Entity's `id` |
| The command's input | the write's input fields, less the id, plus the operation and its digest |
| Rejections `Conflict`, `Unmet`, `Invalid` | the members of the mutation's `Refusal` |
| Rejections `Forbidden`, `Unauthenticated`, `NotFound`, `Reused` | fixed: how a guarded update refuses, and a reused operation |
| `decide`, `evolve`, the reply, the View's state and `evolve` | derived; the View copies the aggregate's row field for field |
| The adapter's two bindings (`binding`, `reads`) | derived from all of the above |

| You supply | Why it cannot be derived |
| --- | --- |
| `event`, `record`, `apply` | an Event's tag and fields are a stored contract the declaration has no name for |
| `listed` | the write updates a row; some Event has to make it exist |
| `revision` | which field every Event moves, which `expect` reads |
| `principal`, `middleware` | Domain's middleware provides who asks; the guard consumes it |
| `policy` (and `operators`) | the rules' implementations, and the table that judges them in memory |

**`Reused`.** The lowered aggregate remembers, per operation, the digest it was
first sent with (the last 256), and refuses another request under it. That
check is answered only to who may write the row: a visitor, or someone the guard
refuses, hears the guard, never that an operation was used.

**Where it stops.** `Lower.check(write)` returns, as data, what keeps a write out
of one aggregate: a `when`, a rule, an invariant or a context value that reads
another row (`OutsideBoundary`), or a member the row does not persist
(`NotPersisted`). `Lower.write` throws listing them. One aggregate is one
consistency boundary; Domain's answer for a rule across two is a Saga or a
Policy, which is not built here. A lowered write holds no ledger,
`requires`, `cascades`, `restricts` or `clears`.

## Failure and recovery

- **A View behind.** The write answers with `written`'s row and its receipt as
  a token, and Remote holds the row to it. A read of that key carries the token,
  and the adapter asks the View at the receipt; if the View has not reached it
  within `confirmWithin` (2 seconds by default: the Api's client takes no
  deadline of its own), the read names the row in `behind`, and Remote keeps
  what it holds and the floor, never the row from before. Remote asks again when
  its read entry next restarts (a refresh, or a change of what it reads). A live
  stream opened while a floor is set gets the token too: its frames for that key
  are only signals, and the adapter reads at the receipt and sends the row when
  it answers.
- **A lost reply.** The command may have committed or not. The call fails
  `RemoteUnreachable`, and Remote's retry carries the same operation, so the same
  `commandId`: Domain returns the first receipt and does not decide again.
  A reply that did arrive is kept (the last 1,024), so a retry of it is not sent.
- **A reload.** The floor and the revision are in Remote's store, so a reload
  that restores the store keeps both, and asks at the token again. One that
  restores nothing starts with nothing held.
- **Rows out of order.** Every row and live frame carries its revision, and
  Remote drops one older than the row it holds. Once a key reads as deleted or
  hidden at a revision, no row of that revision or an earlier one is let back
  in, and a key created again at a lower revision stays absent until its
  revision passes the old one. The revision must therefore keep rising across
  the stream's whole life. Two rows of one key at one revision with different
  values (an event that did not move it) are both written, the later last; the
  adapter no longer remembers rows, so it does not report them.
- **Another principal.** Remote forgets what it holds when who is signed in
  changes (`Data.forget`); the adapter holds no rows, so none can reach another
  principal.
- **A hidden row.** A row the View's `validate` refuses reads as absent, as a
  guarded SQL read of a hidden row does.

## Limits

- **Reads are by id only.** A request with relations or windows, any list, and
  any `query` fail by name (`RemoteReadError`, `RemoteQueryError`,
  `RemoteLiveError`); a Domain Api's queries are not bound. Server-rendered first
  paint from a View's cursor is not built.
- **`written` and who may read.** A write's reply is not passed through the
  View's `validate`. `DomainRemote.command` refuses `written` where its Entity's
  Update rules do not imply its Read rules, or a member has a Read rule; such a
  row is read through the View only.
- **Open upstream behaviour, as of `2.0.0-beta.86`.** These are Domain's, not
  fixed here, and not yet reported to the Alchemy project:
  - A `commandId` reused with different input, or by another principal, returns
    the first receipt and skips `decide`. The adapter derives the id from who
    asks and what, so it never reuses one; a client of the Api that does is
    answered with another caller's reply.
  - The Api's View client takes no timeout for an `atLeast` read, so the adapter
    supplies its own `confirmWithin`, and a read behind it waits as long as that.
  - A snapshot carries no stream version, so a client cannot compare one with a
    receipt: only the server can, through `atLeast`. That is why the adapter
    orders rows by a revision field you name.
- **Not exercised.** There is no deploy, Durable Object hosting or WebSocket
  protocol here: tests run on `Domain.InMemory` and over a local HTTP server
  (`Domain.protocolHttp`).
- **A beta.** The adapter breaks when Domain's behaviour does. Its
  `behaviour.test.ts` fails when a release changes what the adapter relies on.

## Reference

| Export | Entry | What it is |
| --- | --- | --- |
| `DomainRemote.view`, `.command` | `.` | bind a View to an Entity, a command to a mutation |
| `DomainRemote.refuse`, `.forbid`, `.unauthenticated`, `.fail` | `.` | how a Rejection reaches Remote |
| `DomainRemote.layer` | `.` | the `RemoteClient` |
| `Receipt` | `.` | `{ stream, version }` |
| `Lower.check`, `Lower.write`, `LoweringFinding` | `./lower` | lower a declared write |
| `Imported.mutation`, `.describe`, `.show` | `./imported` | an undeclared command, and what was imported |
| `Fixture.make` | `./testing` | a model as a client-test fixture |
