# foldkit-remote-domain

Checked against `foldkit-remote-domain` 0.1.0, `@alchemy.run/domain` 2.0.0-beta.86 and `foldkit-remote` 0.26.0.

Experimental. Reads and writes an [Alchemy Domain](https://github.com/alchemy-run/alchemy) model (Commands,
Aggregates that `decide`, Events, Views) **through Remote**. This is the Domain library, not the `alchemy`
deploy tool of [alchemy.md](alchemy.md).

## What it owns

| Fact or transition | Owner |
| --- | --- |
| Whether a command is allowed, the Events, who may read a row | the Domain model |
| The page's copy of a row, a write's pending state, a refusal | Remote (`Remote.Model`) |
| A write's receipt while its View has not caught up, each row's revision | Remote (`Remote.Model`): a read-after token and a row revision on Remote's wire |
| The last 1,024 answered commands' receipts and replies, so a retry of one is not sent | the adapter, in memory: a cache; after a reload Domain's command id answers the retry |

`DomainRemote.layer` is a `RemoteClient` built from the Api's typed client: no Remote server sits between them, and
`@alchemy.run/domain/Foldkit` is not used (two owners of one row). The page still declares writes with
`Mutation.write`, so prediction and `Data.refusal` read the same declaration they read against SQL.

## Smallest use

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

const NoteEntity = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, name: Schema.String, revision: Schema.Number }),
)
const RenameNote = Mutation.make('RenameNote', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
})

const Reads = DomainRemote.view(NoteEntity, NotesApi, 'NoteRow', { revision: 'revision' })
const Renaming = DomainRemote.command(RenameNote, NotesApi, 'Rename', {
  entity: NoteEntity,
  target: input => input.id,
  input: input => ({ name: input.name }),
  written: (_reply, input) => ({ name: input.name }),
})

const client = DomainRemote.layer(NotesApi, {
  views: [Reads],
  commands: [Renaming],
  principal: Effect.succeed(Option.some('ada')),
  denied: () => 'Unauthenticated',
})
```

`view`, `command` and `query` are declarations that throw where they are made for a field the View lacks, a `revision`
that is not a number, or a Query that is not served or not paged; only `layer` does anything, once the Api's client is
provided.

## What to know

- **Receipts.** A command answers `{ stream, version }`; the adapter reads the View `atLeast` it. A write whose View is
  behind answers success with `written(reply, input)` as the row and the receipt as `MutationResult.after`
  (`stream@version`): Remote holds the row to it (`Data.inspect(model).floors`, `why`'s `ReadAfter`) and reads it again
  carrying the token; a View that has not reached it in `confirmWithin` (2 s) is named in `behind`, never the old row.
  The adapter holds nothing but the commands it sent.
- **Revision.** Every row and live frame carries the numeric field named in `view(…, { revision })`, which every Event
  must move; Remote orders by it, never by the View cursor. Once a key reads deleted or hidden at a revision, no row of
  that revision or earlier returns.
- **Command id** = `mutation:operation:digest(principal, target, keys, input)`; a missing `operation` is refused; a
  request for another principal is refused before sending. A lost reply is `RemoteUnreachable`; the retry reuses the id.
- **Lists.** `DomainRemote.query(RemoteQuery, Api, 'PagedQuery', { input, id })` binds a Remote query to a paged
  Domain Query, given to `layer` as `queries`. The Query decides what is listed; each listed row is read through its
  Entity's View, which leaves out a row its `validate` hides and gives each its revision. Paging is Domain's, forward
  only: `last`/`before`, `first: 0` and a cursor over 1,024 characters are refused (`RemoteQueryError`). A write's answer
  carries the lists the client asks back, read `atLeast` its receipt; a live list is invalidated once as its stream
  opens (the client reads it once more), then asked again when a row it holds changes, and invalidated when it moved.
- **`one` relations.** A View's state holds the target's id (or `null`); `view` refuses an Entity whose `one` relation
  it lacks. A read answers the ref key and reads a selected target through its own View in the same batch.
- **First paint (`/server`).** `pageReader(Api, { views, resolvePrincipal, middleware })` is a server render's reader:
  `(request, env) => Layer<RemoteClient>`, `DomainRemote.layer` over `Api.clientInProcess` as the principal
  `resolvePrincipal` decides from the request, through the middleware `middleware(principal)` builds (trusting it; no
  request header reaches it). It binds no command (writes fail `RemoteMutationError`), opens no live stream, and notes
  every read private in `PageReads`. Provide it to `Data.satisfy` in `foldkit-ssr`'s `prepare`, with the hosted model's
  Layer. `Remote.resume` carries each row's revision and floor; the browser's live stream names those revisions
  (`LiveRequirement.revisions`) and the adapter sends no frame at or before them, so the page reads nothing it was
  handed.
- **`Lower.write` (`/lower`)** derives a command, `decide`, `evolve`, the View and both bindings from a declared
  `Write`, landing it through `RemoteServer.write` over `GuardServer.writer` over `RemoteServer.memoryWriter`; you give
  `event`, `record`, `apply`, `revision`, `principal`, `middleware`, `listed`, `policy`. `Lower.check` lists what keeps a
  write out of one aggregate (`OutsideBoundary`, `NotPersisted`). Reused operations are `Reused` to who may write only.
- **`Imported` (`/imported`)** declares a command with no `Write` (`mutation`, with a `Derived`, `Declared` or `Unknown`
  footprint), `describe`s what is imported, and `show`s it as Markdown.
- **`Fixture.make` (`/testing`)** hosts the model in memory with deliveries held until `drain`, seeds `given` Events,
  calls as `as` (its headers added to a call's own, which win), and answers `RemoteClient` for client tests; its
  `layer` requires what the Api's client needs that nothing hosted provides (a session middleware left out).
- **Scenarios.** `examples/writes-domain` runs one `Scenario` of `foldkit-remote/testing` on SQLite, in memory and on the
  Domain model.

## Limits

Lists come from paged Domain Queries only, read forward; a plain page carries no read-after token (the wire has none
for a query), and an open live list sees a row join only when a held row changes or it is read again (each time its
stream opens, it is read once more). Relations are `one`
relations held as ids; `many` relations, relation windows and live reads with relations fail by name. A row named in `behind` is asked again with its
token after 1 s, doubling, at most 30 s. Open upstream behaviour in beta.86 (not yet reported):
a reused `commandId` with other input or another principal returns the first receipt and skips `decide`; the View client
takes no timeout for an `atLeast` read; a snapshot carries no stream version. No deploy, Durable Object or WebSocket
path is exercised.

See also: https://github.com/doeixd/foldkit-plus/blob/main/packages/remote-domain/README.md and
https://github.com/doeixd/foldkit-plus/tree/main/examples/writes-domain
