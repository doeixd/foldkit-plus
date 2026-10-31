# `foldkit-remote-server`

The server-side interpreter for [`foldkit-remote`](../remote).

A Remote client sends **semantic requirements** — entity ids, selected fields,
query windows, mutations, and live requirements. `foldkit-remote-server` turns
those requirements into calls to application-owned **Sources**, enforces
field-level read authorization while the field names are still known, and
normalizes the results back into the patches the client cache understands.

The central pipeline is:

```text
Remote requirement
      |
      v
RemoteServer handlers
      |
      +-- validate protocol / input
      +-- filter fields by Entity + principal
      +-- group and de-duplicate reads
      |
      v
application Source
      |
      v
normalized Remote result
      |
      v
Remote client -> Message -> Data.reduce -> Model
```

A Source is deliberately small: it says how your application reads one Entity,
runs one Query or Mutation, or produces one live stream. The package does **not**
own HTTP, WebSockets, authentication, or a database connection;
[`answer`](#over-plain-json) answers a JSON request a server you run received. Authentication
resolves a `principal` outside this package; database/API clients remain Effect
requirements of the Sources that use them.

Use this package when the server is yours and you want the selections declared
by `foldkit-remote` to survive all the way to the data boundary instead of
turning back into hand-written per-screen endpoints.

## What this package owns

```text
client owns
  which server facts are required

foldkit-remote-server owns
  requirement interpretation
  field authorization
  read grouping / de-duplication
  nested selection traversal
  normalized wire results

application Sources own
  how those facts are actually loaded or changed

Effect RPC / application owns
  transport + serialization + authentication
```

That separation matters. `RemoteServer` can decide that a client may read
`Project.name` but not `Project.privateNotes`; only your Source knows whether
that field comes from Postgres, another service, an in-memory index, or
something else.

It does **not** own HTTP or WebSocket transport, authentication or session
storage, a database connection, the client's normalized cache, or Surface
activation. A durable write is the client's to keep (Remote's outbox) and the
writer's to recognise when it comes again (a ledger); this package only passes
its operation id through. Client-authored state that must merge across devices
is [`foldkit-sync`](../sync)'s.

## Install

```bash
pnpm add foldkit-remote-server
```

`effect` is a peer dependency; `foldkit-remote` comes with the package.
[`foldkit-remote-drizzle`](../remote-drizzle) is an optional Source compiler for
Drizzle-backed entities and queries.

## Sixty seconds: answer one Entity read

Start with the same Entity the client selects:

```ts
import { Effect, Schema } from 'effect'
import { Entity, Remote, RemoteRpc } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'

const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    privateNotes: Schema.String,
  }),
)
```

Give that Entity one Source:

```ts
// Your authentication's principal type; without it `principal` is `unknown`.
type Principal = { readonly isAdmin: boolean }

const rows = new Map([
  ['p1', { id: 'p1', name: 'Apollo', privateNotes: 'Internal' }],
])

const ProjectSource = RemoteServer.entity<Principal>(Project, {
  // Authentication already resolved `principal` before RemoteServer sees it.
  // Return only fields this caller may read.
  authorize: (principal, fields) =>
    fields.filter(field => field !== 'privateNotes' || principal.isAdmin),

  read: ({ ids, fields }) => Effect.succeed(ids.flatMap(id => {
    const row = rows.get(id)
    return row === undefined ? [] : [{
      id,
      values: Object.fromEntries(Object.entries(row).filter(([field]) => fields.includes(field))),
    }]
  })),
})

const Server = RemoteServer.make({
  entities: [ProjectSource],
})
```

Compile that definition into the Remote RPC handlers for one authenticated
principal:

```ts
const principal: Principal = { isAdmin: false }
const handlers = RemoteServer.handlers(Server, principal)
const layer = RemoteRpc.toLayer(handlers)
```

`RemoteServer.entity` and `make` only describe the server. `handlers` binds
a principal; `RemoteRpc.toLayer` provides handlers to Effect RPC. Neither starts
an HTTP listener. In this example the source returns an Effect over local rows;
replace its body with your database or API reader when connecting real data.

A client requirement such as:

```text
Project:p1 [id, name, privateNotes]
```

runs as:

```text
1. Project declares:       id, name, privateNotes
2. authorize returns:      id, name
3. Source receives:        ids=[p1], fields=[id,name]
4. Source returns:         { id: 'p1', values: { id: 'p1', name: 'Apollo' } }
5. handler normalizes:     Project:p1 { id, name }, settled: privateNotes
6. client records presence for the returned fields, privateNotes as unavailable
```

`privateNotes` never reaches `read`. Authorization happens before application
data access, while the request still has semantic field names. The answer
names the field as **settled**, so the client stops asking for it; it does not
say why. A Selection naming it reads `Failed` with an `Unavailable` error, one
that does not name it is unaffected, and `Data.refresh` asks again.

## The read lifecycle

An Entity read is more than a direct function call because a Remote selection
may contain several ids and nested relations. The handler performs the mechanical
work once so Sources do not have to:

```text
client requirements
      |
      v
group by Entity
      |
      v
union requested fields
      |
      v
filter declared + authorized fields
      |
      v
batch / de-duplicate ids
      |
      v
Entity Source.read(...)
      |
      v
follow selected relation refs
      |
      v
next Entity Source
      |
      v
normalized patches
```

A Source therefore receives the useful boundary directly:

```text
RemoteServer.entity(entity, {
  read: ({ ids, fields, windows?, principal }) => Effect<
    ReadonlyArray<{ id: string; values: Record<string, unknown> }>,
    RemoteServerError,
    R
  >,

  authorize?: (principal, fields) => readonly string[]

  filter?: (principal, fields) => Effect<{
    fields: readonly string[]          // what to read: the allowed fields, and any the decision needs
    apply: (record) => record          // one record as the principal sees it
  }, RemoteServerError, R>
})
```

Important consequences:

- a field the Entity does not declare never reaches `authorize` or `read`.
  Its fields, relations and derived members are all declared, so a relation
  such as `owner` is read and followed like any field;
- a requested field is client input, answered only when the source returns it
  as its own: `constructor` or `__proto__` is settled, never read off
  `Object.prototype`;
- `authorize` can only remove requested fields, never add new ones;
- a Source may return a partial entity — a requested field it omits is settled,
  so the client records it unavailable rather than asking again;
- ids shared by several selections are de-duplicated;
- relation targets are fetched level by level and shared targets are not loaded
  repeatedly;
- a relation the principal may not read is never followed;
- `authorize` decides per field, for every row alike; `filter` decides per
  record, after `read`. It runs once per read (by id or live), may read
  fields the client did not ask for so it can decide (an owner id, say),
  and a member it drops from a record is settled like one the Source did not
  return. `foldkit-guard` builds one from a member's guards.
- a Source, and a query Source, may carry `visible`: the rule that decides
  which rows it returns, as it was given one (a Drizzle binding's `visible`,
  `RemoteServer.memory`'s `readable`). The server never runs it; it is there
  for a startup check such as `GuardServer.validate` to confirm a Source
  applies the rule its Entity requires.

The Source should still avoid reading or returning columns the request did not
ask for. The handler filters returned values again, but the data boundary is the
best place to preserve least privilege and avoid wasted work.

## Nested selections

Suppose the client projects:

```text
Project:p1 {
  id
  name
  owner { id name }
}
```

and the Project Source returns an owner ref:

```text
Project:p1.owner = User:u7
```

The handler follows that ref through the `User` Source on the next level:

```text
Project requirement
      |
      v
Project Source
      |
      | owner = User:u7
      v
User requirement
      |
      v
User Source
```

The Sources do not recursively call each other. `RemoteServer` owns traversal,
depth limits, batching, and de-duplication; each Source still answers only for
its own Entity.

## Queries

A Query Source answers the ordered connection itself. The client's `select`
travels with the request, and the handlers return the selected fields of the
page's items with the edges, so one response carries both:

```ts
import { Query } from 'foldkit-remote'

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: Schema.Struct({ ownerId: Schema.String }),
  Result: Query.connection(Project),
})

// `projectsPage` is your own reader: one page of edges for the window.
const ProjectsByOwnerSource = RemoteServer.query(
  ProjectsByOwner,
  ({ input, window, principal }) => projectsPage({ ownerId: input.ownerId, window, principal }),
)

const Server = RemoteServer.make({
  entities: [ProjectSource],
  queries: [ProjectsByOwnerSource],
})
```

A Query returns:

```ts sketch
{
  edges,
  start,
  end,
}
```

A Source answers membership only; it may ignore `select`. The handlers fetch
the selected fields through the entity sources (authorization included) and
return them as `entities`/`settled` beside the page. Query membership and
entity data stay separate on the way in and travel together on the way out.

`start` and `end` are Remote `Boundary` values (`Terminal`, `Cursor`, or
`Unknown`). The client uses those explicit boundaries when merging pages instead
of guessing from row count.

Query input is decoded through the Query's own Schema before your callback runs.
The callback receives the decoded input, the requested `QueryWindow`, the
`select` slice when the client sent one, the principal, and the server's
`viewer` of it.

A query declared with `Query.define` carries its meaning as a value, so it
needs no hand-written Source: `RemoteServer.memory` runs its body with
`evaluate`, and `foldkit-remote-drizzle` compiles it to SQL (see [Reference
semantics](#reference-semantics-evaluate-and-the-conformance-suite)).

## Mutations

A Mutation Source changes server-owned state. It returns the protocol output
plus any normalized entity/connection changes that should settle the client's
cache immediately:

```ts
import { Effect } from 'effect'
import { Mutation } from 'foldkit-remote'

const RenameProject = Mutation.make('RenameProject', {
  Input: Schema.Struct({ id: Schema.String, name: Schema.String }),
  Output: Schema.Struct({ id: Schema.String }),
})

// `renameProject` is your own write, answering the Output.
const RenameProjectSource = RemoteServer.mutation(
  RenameProject,
  ({ input, principal }) =>
    renameProject(input, principal).pipe(
      Effect.map(output => ({
        output,
        entities: [
          Entity.patch(Project.ref(input.id), { name: input.name }),
        ],
      })),
    ),
)
```

The input is decoded before the Source runs and the output is encoded before it
crosses the wire. A Source refuses with a value of the mutation's `Refusal`:
`Effect.fail(RemoteServer.refuse(SetPrice, { _tag: 'Field', key: 'price', reason: 'too low' }))`.
The value is type-checked against that mutation, encoded by its schema, and
sent beside a message (a 422 over JSON); a refusal made for another mutation,
or not one the mutation declares, is sent as an invalid refusal instead.

A refusal of who is asking, rather than of what they asked, is
`Effect.fail(RemoteServer.forbid('Only an admin may archive.'))`: sent as
`Forbidden` with the reason (a 403 over JSON), or with none when `forbid()` is
given none, so the refusal says nothing of why. It is the same for every
mutation, so it needs no `Refusal` declared.

A Source may additionally return connection changes:

```ts
RemoteServer.prepend(connection, Project.ref(id))
RemoteServer.append(connection, Project.ref(id))
RemoteServer.remove(connection, Project.ref(id))
```

Those confirmed changes replace the corresponding optimistic connection layers
on the client.

### A write sent again: `operation`

The Source is also given `requestId`, the client's id for the request, and
`operation`, the operation's id across clients, both the same on every retry of
it. Record a write under `operation`, never `requestId`: a request id is a
counter in one client's Model, so two clients' first requests share it, and a
record keyed by it would answer one client with another's write. `operation`
is none from a client that sends none, and bounded on the wire (128
characters of `A-Z a-z 0-9 : . _ -`).

Expect the same operation more than once. A write that no answer came back
for fails on the client with `Unreachable` (`RemoteUnreachable`): the request
did not go, or what came back was no Remote answer (not JSON, or under a 408,
429, 502, 503 or 504, which this package never answers with but a gateway or
a rate limiter may). The server may have landed it. `Data.retry` sends it
again under the same operation, and a durable write (`Data.mutate(…, {
durable: true })`) is stored in the page's outbox and sent again on its own,
after an `Unreachable` and after a reload, with the same operation id and the
same `now`. What a retry does depends on the write: setting a value sets it
again, an `expect`ed revision answers `Conflict`, and only a ledger (below)
recognises the operation and answers it from its record. A durable Mutation
therefore needs a writer with a ledger, or a handler that records by
`operation`.

The outbox never sends one principal's waiting writes as another's: it holds
its queue for one store key and scope, and sends none of it once either
changes. The server still decides each send as whoever that request
authenticates as.

### Declared writes: no handler

A mutation declared as a `Write` (`Mutation.write`) needs no handler.
`RemoteServer.write(mutation, writer)` binds the input to the write, only the
keys the client named when it named some, and hands the row's id and new values
to an `EntityWriter`, which writes them and answers the row as written:

```ts
// `EditProject` is a Mutation.write; `writer` and the binding `Db` are foldkit-remote-drizzle's.
RemoteServer.write(EditProject, writer(Db.Project))
```

The answer is the mutation's patch, or for a delete its deletion. The writer
must be for the write's own Entity, which is checked where the mutation is
served. The [declared writes guide](../../docs/declared-writes.md) walks
through the whole path; what this package does with each part of a write:

- **What the server chooses.** A write of an Entity with `Entity.sets` is
  handed the members its context sets as well, never from the input (an
  insert all of them, an update those set `on: 'write'`): `Expr.viewer` from
  `RemoteServer.make({ viewer: principal => Option<{ entity, id }> })`, and
  `Expr.now` from the write's time. A value that comes to null where the
  member holds none (a visitor's) is refused as forbidden; a server that
  serves a write setting the viewer with no `viewer` is refused where it is
  made. A path from the viewer is read through the server's own sources, as
  the asker may see each row (the run context's `read`); a server that mounts
  no source for a row the path reaches is refused where it is made, and a
  path reaching no row the asker may see is null.
- **The write's time** is the client's when it sent one (`Data.mutate`'s
  `now`, the moment the reader acted, which the client showed the row at) and
  it lies within `RemoteServer.make({ clockSkew })` of the server's Effect
  `Clock`: 60 seconds unless given, `0` to never take a client's time.
  Otherwise it is the server's own, and a time past a bound above zero is
  reported as a `ClockSkewed` diagnostic: a durable write sent long after it
  was made takes the server's time. The bound is how far a client can backdate
  or postdate a row; nothing else of a write's context comes from the client.
  A hand-written mutation reads the same time as `now` in its context. A
  retried insert, which only a writer's ledger recognises, keeps its first
  time. A retried update is a new write to a server without a ledger, and
  stores the time of the attempt that ran: the same sent `now` while it lies
  within `clockSkew`, else the server's clock at that attempt (#291). A ledger
  answers the retry from its record, so the first time stays.
- **`expect`**: the writer is told the revision the row was read at; no row
  at it is refused as `Refusal.conflict`.
- **`when`**: the writer is handed the precondition and the input encoded,
  checks it in the statement that writes, and fails a row at the revision
  that does not hold it with `RemoteUnmet` (`RemoteServer.unmet()`), refused
  as `Refusal.unmet`: absent first, then a moved revision, then the
  precondition.
- **Invariants** (`Entity.invariant`) are the writer's to judge over the row
  the write would leave, refusing with `RemoteServer.invalid(message, rule,
  path)`, sent as `Refusal.invalid`: the invariant's id and path, or none and
  empty when the caller may not be told them.
- **Increments and computed assignments** reach the writer apart from its
  values (`increments`, each field's amount, encoded; `assignments`, each a
  `Computation`), to be applied in the statement that writes. One that
  expects no revision is served only over a writer with a ledger, and only
  for a request carrying an operation id; even so, a concurrent pair must land
  as one result: an increment only of an integer, and a computed assignment
  only where the writer `commutes` it, unless the writer pins the row it read
  (`pins: true`, a guard with a revision).
- **A rule over another row.** A writer that holds an update's or a delete's
  row to a `requires` (`RowRequirement`: bodies over the row, all or any of
  them) in its own statement refuses a row that fails it with `Forbidden`:
  `foldkit-guard` hands it a rule that reads another row that way.
- **Creates and deletes.** An update of no row fails, and a delete of a row
  already gone succeeds, so its retry is safe. An insert of an id already
  taken is refused as `Refusal.taken` (the writer fails `insert` with
  `RemoteTaken`, `RemoteServer.taken()`), with one answer whatever the row
  there holds and whether its asker may see it: comparing that row with the
  insert would tell the asker what it holds. Only a writer with a ledger tells a retry from another create
  of the id, by the operation the client sent, and answers it with the row;
  without one, a create whose answer was lost is refused when it is sent
  again. Give a writer a ledger where a client may resend a create, and make
  ids that a guess cannot find where whether a row exists is itself private.

A writer says what it can do, and `RemoteServer.write` refuses, where the
write is served, one that needs what its writer lacks rather than writing it
wrongly:

| `EntityWriter` says | It | Needed by |
| --- | --- | --- |
| `preconditions: true` | checks `when` in the statement | a write with a `when` |
| `invariants: true` | judges the Entity's invariants | a write of an Entity that has any |
| `increments: true` | adds `increments` in the statement | a write with an increment |
| `assignments: true` | computes `assignments` in the statement | a write with a computed assignment |
| `ledger: true` (with `recorded`) | records each update and insert under its `operation`, and answers a retry from the record | an increment or computed assignment with no `expect` |
| `requires: true` | holds the row to `requires` | `GuardServer.writer` over a rule reading another row, which throws where it is made without it |
| `refuses(write)` | names what only its store knows it cannot land (the Drizzle writer: a fractional amount for an integer column) | every write, asked once |

A writer with a `read` (the row as a principal may see it, under the read
rule its Source applies) answers through it: the patch is the written row as
its writer now sees it, and a row the write moved out of their sight answers
in `deleted`, so the client takes it out of every list rather than placing
it where the server would not list it. A writer may refuse with
`RemoteServer.forbid`, as `foldkit-guard`'s `GuardServer.writer` does. Its
`linked` answers a row's links as stored, whatever a reader may see of the
rows they point at, so such a guard can tell a write that unlinks a hidden row
from one that changes nothing; `foldkit-remote-drizzle`'s `writer` has both.

### What an answer carries

A Source answers the rows it changed; the client says what it shows of them.
`Data.mutate` sends, with each request, what its active Surfaces read of each
entity, every field its optimistic layer shows, and the supplied members a
created or edited row foresees (`may`) (`shown`). After the Source runs, the handler reads, of each row the
outcome names (a patch, or a list insert), the shown fields the patch left out
and every shown relation, and answers that read beside the patch (`read`):

```text
outcome rows × client's shown fields − fields the patch carries -> read -> answer
```

So a declared write, which answers the columns it stored, also answers the
derived count, the `may` and the author's name the page reads of the row, and
the client releases its optimistic layer with nothing left to fetch. The read
is an ordinary one: the Sources' `read`, `authorize` and `filter` decide it, a
field the asker may not read comes back settled, and a row they cannot see is
left out of it, keeping what the patch gave.

A Source whose write the server cannot see (a row of a join table, a count it
keeps itself) names the row with no values, and the read answers all of it:

```ts
// Sketch, inside a mutation Source over a `Post` Entity: a like in a join table
// changes its post, so name the post and read nothing yourself.
return { output: { liked: true }, entities: [Remote.patch(Post, input.postId, {})] }
```

The read runs after the write commits, outside its transaction. If it fails,
it is reported as an `AnswerUnread` [diagnostic](#diagnostics) and the
mutation is answered without it: the write has
landed, and the client fetches what it lacks as it would have. A deleted row is
not read.

A declared write (`RemoteServer.write`) also reads each row its row points at
through a `one` relation, before and after the write, through the writer's
`linked`, where that link can change one of the row's derived members: a
`Derived.count` or `Derived.exists` over that relation, or any supplied member
(`Derived.make`), which may read anything. Inserting a `Like` reads what the
page shows of its post, the new `likeCount` included
([#233](https://github.com/doeixd/foldkit-plus/issues/233)), and not its user,
whose members no like changes. A member declared after `Entity.relate` counts:
the Entity has one set of members, whichever descriptor declared them
([#332](https://github.com/doeixd/foldkit-plus/issues/332)). A row's derived
members change only with the rows pointing at it, so no app names them. These rows are read, never sent as patches of their own: one the
asker may not see is not answered at all. Live subscribers hear the outcome's
own patches, not the read, which is one asker's view.

## Live data

A live subscription is one stream per Entity, from that Entity's live Source.
There are three ways to produce one:

- write a live Source directly, below;
- over Drizzle, `foldkit-remote-drizzle`'s `pollLive`, a live Source that
  re-reads the subscribed rows and lists from inside the subscriber's own
  request, which is what Workers need;
- in a long-lived process, a `liveHub` that re-reads what each write changed.

### Write a live Source directly

```ts
// `projectEvents` is your own stream of `LiveChange`s.
const ProjectLive = RemoteServer.live(Project, {
  subscribe: ({ requirements, queries, after, principal }) =>
    projectEvents({
      requirements,
      queries,
      after,
      principal,
    }),
})
```

`after` is the client's resume cursor. Events at or before it are duplicates,
and the stream's cursors count on from it: its first event is `after + 1`, or
the client takes the skipped cursors for a gap and restarts the stream.
The stream carries Remote `LiveChange`s: entity patches/deletes and connection
insert/remove/invalidate events.

`queries` are the lists of this Entity the subscriber reads live
(`liveQuery(Data, …)`), each a `LiveQuery` the handler has already
admitted and resolved: `identity` (the connection as the client keys it, for
the connection events), `select` (what the read draws of each row), and
`edges`, the registered query run as the subscriber with the page's window.
The handler refuses, with `RemoteLiveRefused` and before any live Source is
asked, a list of a query it does not register, an input that does not
decode, one with no `select` or no `first`, one whose `select` is of another
Entity than its query lists (a `QuerySource` names that Entity: `RemoteServer.query`
reads it from the descriptor's connection), and one whose `first`, added to
the ids of its Entity the subscription names, passes `maxIdsPerEntity`. A
subscription watches at most 32 lists (`MAX_LIVE_QUERIES`), refused at decode.

If an Entity has no live Source, it contributes no stream. That is not an error:
the client planner can fall back to refetching it.

A live Source that reads rows to send them must read them as a read would, or
it sends what the read handlers withhold. `RemoteServer.readAs` is that read:
only the asked fields the Source declares and its `authorize` allows, each
record through its `filter`, and no other field.

```ts
const asReader = RemoteServer.readAs(ProjectSource, {
  ids: ['p1'],
  fields: ['name', 'privateNotes'],
  principal: { isAdmin: false },
})
// An Effect that succeeds with Option.some([{ id: 'p1', values: { name: 'Apollo' } }]),
// or Option.none() when the principal may read none of the fields asked.
```

`RemoteServer.allowedFields(ProjectSource, principal, fields)` says which of
`fields` that read would read, without reading: a Source reading several rows
together, each asked for fields of its own, reads them in one read and still
tells nothing of a row whose fields the principal may read none of.

A live Source that sends only what it reads through one Source names it as
`reads`, so a startup check can trust it as far as it trusts that Source:
`GuardServer.validate` accepts a live Source over a guarded Entity only when
it `reads` the guarded Source it checked. `foldkit-remote-drizzle`'s `pollLive`
reads through `readAs` and sets `reads`.

### Let a `liveHub` re-read changed fields

A hub fans **what changed** out to live subscribers. Give it to the handlers,
and every mutation's answer is published to it: each patch as a change of the
fields it carries, each deletion as a deletion. A mutation Source names nothing
twice.

```ts
// Inside an Effect.gen: building a hub is an Effect.
const entitySources = [ProjectSource]
const hub = yield* RemoteServer.liveHub(entitySources)

const handlers = RemoteServer.handlers(Server, principal, {
  live: hub,
})

// Only for a write that is not a mutation: a database trigger consumer, a job.
yield* hub.changed(Project.ref('p1'), ['name'])
yield* hub.deleted(Project.ref('p1'))
```

A mutation's publish runs after its Source returned, so after a write that
commits as it goes. A failed publish is reported as a `PublishFailed`
[diagnostic](#diagnostics) and the mutation still answers: its write has
happened, and a failed answer would be retried.

The hub remembers each subscriber's requirements and principal. `changed`:

1. intersects the changed fields with what each subscriber selected;
2. re-reads only that intersection through the Entity Source;
3. applies that subscriber's authorization again;
4. emits the resulting patch with a continuing cursor, or a deletion where
   the re-read no longer finds the row: deleted, or moved out of that
   subscriber's sight.

`deleted` asks each subscriber again too, for every field it selects: a row
deleted for one writer may only be hidden from them, so a subscriber that
still reads it is sent what it now sees, and only one it is gone for a
deletion. One subscriber's failed read does not keep the others from theirs;
the call fails once they are sent.

Subscribers that selected none of the changed fields do no work, and
subscribers with one principal share one re-read. One principal means the same
value, unless the hub is given a `key`: then two requests whose principals
have one key, each with a principal object of its own, share it, read as the
first of them. A key must therefore name everything the Sources decide by,
the reader itself included when a Source answers a viewer-relative member (a
`Derived.exists`, whose value is each reader's own; `foldkit-guard`'s
`Policy.keyOf` names every field of the principal). A key by role, as here,
fits Sources that answer only by role:

```ts
const hub = yield* RemoteServer.liveHub(entitySources, {
  key: user => (user.isAdmin ? 'admin' : 'member'),
})
```

#### Fields every principal reads alike

A re-read per principal is how the hub stays exact when who is asking decides
what a row shows. Where nothing does, a Source can say so, and the hub sends a
written value as it is:

```ts
// Everyone reads a project's name alike; only an admin reads its private notes.
const SharedProjectSource = RemoteServer.entity<Principal>(Project, {
  authorize: ProjectSource.authorize,
  read: ProjectSource.read,
  shared: ['name'],
})
```

- `shared` names fields every principal reads alike, of every row: no rule
  about who is asking hides the row or the field, or changes its value. The
  server trusts it, so declare it only where that holds; a field the Source
  does not serve is refused when the Source is made.
- `hub.changed(ref, fields, values)` takes the row's stored values. A
  `shared` field among them goes to each subscriber that selected it with no
  read; the rest are re-read as above. A field a subscriber pages with a
  window is always re-read.
- The handlers pass a declared write's answer (`RemoteServer.write`), which
  is the row as stored. A handler's answer is its own claim, so its fields are
  re-read.
- `foldkit-remote-drizzle`'s `source` and `RemoteServer.memory` take it too,
  and `foldkit-guard`'s `GuardServer.validate` refuses a shared field a Read
  rule could tell readers apart by. `source` refuses a `Derived.exists` as
  shared: it is each reader's own.

A hub is an in-memory fan-out, so whatever calls `changed` must be able to wake
the subscriber's fiber. In a worker it cannot: one request cannot wake another's
stream, so a hub fed from a second request delivers nothing and tears the first
stream down: the open response belongs to the request that opened it, and the
Workers runtime cancels it when another request wakes it. On Workers, poll the
shared store from inside the subscriber's own request instead, as `pollLive`
does. A hub is right for a long-lived server process that owns both sides.

A hand-written live Source and a hub number their events independently. Use one
or the other for a given subscription path rather than mixing cursor domains.

## Authentication vs authorization

Keep these boundaries separate:

```text
authentication
  "Who is making this request?"
  Effect RPC middleware / application
             |
             v
          Principal
             |
             v
authorization
  "Which semantic fields may this principal read?"
  RemoteServer.entity(... authorize ...)
```

`RemoteServer.handlers(Server, principal)` deliberately receives a resolved
principal. It does not inspect headers, sessions, cookies, or bearer tokens.
The principal is a value, or a Context key that each call reads, so one
handler set (one RPC layer) answers every request and authentication provides
the key per request:

```ts
class CurrentUser extends Context.Service<CurrentUser, Principal>()('app/CurrentUser') {}
const handlers = RemoteServer.handlers(Server, CurrentUser)

// per request, once authentication has resolved `user`
RemoteServer.answer(handlers, body).pipe(Effect.provideService(CurrentUser, user))
```

Every handler then needs `CurrentUser`, which the types carry: a key holding
another type than the Server's principal is a type error.

For Entity reads:

- undeclared fields are dropped first;
- `authorize` receives only declared, requested fields;
- omitting `authorize` means the requested declared fields are readable;
- a withheld field is answered as settled, without its reason;
- an id whose every requested field is withheld is not read from the Source:
  its fields are settled and no entity is contributed, so it looks the same as
  an id the Source does not know, and existence is not leaked.

Mutation and Query policy belongs in their Sources because those operations are
application-specific rather than field-selection policy.

## Compose and validate the server

A complete server definition is just the collection of Sources:

```ts
const Server = RemoteServer.make({
  entities: [ProjectSource],
  queries: [ProjectsByOwnerSource],
  mutations: [RenameProjectSource],
  live: [ProjectLive],
})
```

When the client and server share the Remote domain declaration, validate the
Source names at startup:

```ts
const Data = Remote.define({
  entities: [Project],
  queries: [ProjectsByOwner],
  mutations: [RenameProject],
})

RemoteServer.validate(Data, Server)
```

That catches an Entity, Query, or Mutation Source whose name is not declared by
the shared domain instead of letting it silently answer nothing at runtime.

`viewer` says who asks, as a row, and is the server's one answer to it:
`RemoteServer.make({ ..., viewer: principal => Option<{ entity, id }> })`. The
server hands it to every Source it mounts, with each read, query and live
subscription (`EntitySourceContext.viewer`), and to every write. A Source
answering a member per reader declares it (`perViewer`, as a `Derived.exists`
does), and a server with no `viewer` refuses that Source where it is made,
naming it. A query body's `Expr.viewer` and `Expr.now` read this viewer and the
server's Effect `Clock` (`exprContext`).

Then compile it into handlers, once per principal, or once for every request
with a Context key as the principal (see Authentication vs authorization):

```ts
const handlers = RemoteServer.handlers(Server, principal, {
  maxIdsPerEntity: 1000,
  maxDepth: 8,
  live: hub,
})
```

`handlers` implements the `RemoteRpc` client shape directly. In-process — tests,
SSR, a worker, or a single service — it can become a `RemoteClient` with:

```ts
const clientLayer = Remote.clientLayer(handlers)
```

Across a process boundary, use:

```ts
const rpcLayer = RemoteRpc.toLayer(handlers)
```

The application supplies the Effect RPC server/transport layer. `RemoteServer`
does not choose HTTP, WebSocket, or another transport for you.

## Runtime dependencies belong to Sources

Sources are Effects, so dependencies stay explicit:

```text
Project Source
    requires Database

Billing Query Source
    requires BillingApi

RemoteServer
    requires Database | BillingApi
```

The server definition does not capture either service. Provide their Layers at
the application boundary. This is also why `foldkit-remote-drizzle` provides
Drizzle-backed Sources rather than putting a database inside `RemoteServer`.

## Hardening

The handler applies bounded, protocol-level safeguards before or around Sources:

- a read batch may name at most `maxIdsPerEntity` distinct ids for one Entity
  (default `1000`); oversized client batches fail rather than loading unbounded
  rows. Remote's client cuts its batches to the same default, and to the
  number given in `Remote.clientLayer(…, { maxIdsPerEntity })`;
- a request body may be at most `maxBodyBytes` (default 1 MiB) where bytes are
  read: `serveFetch`'s option, and `bodyLimit` in front of an `RpcServer`
  route. A larger one is a 413, `{ error, tooLarge: { limit } }`, refused by
  its `content-length` before anything else, or cancelled the moment the bytes
  read pass the limit, and never decoded;
- nested resolution is bounded by `maxDepth` (default `8`);
- the wire decoder also rejects a selection deeper than
  `MAX_RELATION_DEPTH` (`8`) or more than `MAX_FIELDS_PER_REQUEST` (`256`)
  fields for one Entity;
- a collection relation read with no window is the Source's to bound:
  `foldkit-remote-drizzle`'s `source` reads at most `maxCollection` children
  of one row (default 100) and refuses a read that finds more, rather than
  answering a list cut short;
- returned field names are copied with `Object.hasOwn` into null-prototype
  objects, so names such as `__proto__` or `toString` cannot reach prototypes;
- Source errors are remapped to protocol error types without echoing application
  internals.

A live subscription is held to the same bounds, checked once by the handler
before any live Source or the hub sees it: more than `maxIdsPerEntity` ids of
one Entity (the `first` of each live list of it counted with them), or more
pages of one relation than a read may ask, fails the stream with
`RemoteLiveRefused` and nothing is read; more than `MAX_LIVE_QUERIES` (32) live
lists fails the wire decoder before that. That matters most for a polling
Source such as `pollLive`, which re-reads every subscribed row each tick. A
refusal is not truncation: the client does not reconnect it, and
`liveStatus(Data, …)` reads `Refused`. A hand-written live Source can rely on what
it is given having passed, and is responsible for any further bounds its
backend needs.

## A backend held in memory

`RemoteServer.memory` serves rows you give it through the same `handlers` a
real server uses, so a client sees what production would send: only the
fields asked for, and nested relations resolved in one read. Use it for a
first run, a test, a story or a demo, when there is no database yet.
A body calling a primitive operator runs by the `operators` it is given
(`Operators.kernel` by default), and one calling an operator that table lacks
is refused where the server is built.

```ts
const backend = RemoteServer.memory({
  domain: Data, // the definition from Remote.define, or a domain from Remote.make
  rows: {
    Project: [{ id: 'p1', name: 'Apollo', privateNotes: 'Internal' }],
  },
  // Optional: each mutation writes through the store, and the next read sees it.
  mutations: store => [
    RemoteServer.mutation(RenameProject, ({ input }) => {
      store.write('Project', input.id, { name: input.name })
      return Effect.succeed({
        output: { id: input.id },
        entities: [Remote.patch(Project, input.id, { name: input.name })],
      })
    }),
  ],
})

backend.layer // provide it where the real RemoteClient would go
```

`backend.server` is the server definition the layer answers through. Serve
it over a real transport to try a client against HTTP, or to test another
server against it:

```ts
const served = RemoteRpc.toLayer(RemoteServer.handlers(backend.server, undefined))
```

- Rows are in their **wire shape**: a relation is its ref key (`'User:u1'`),
  and a to-many relation is a list of them.
- A query declared with `Query.define` is answered by running its body over
  the rows with [`evaluate`](#running-a-query-body-over-rows-you-already-hold),
  the reference interpreter, and paged with offset cursors. A query with no
  body has nothing to run and is refused when the backend is made, unless you
  pass a source for it in `queries`.
- Every field is readable unless `authorize` names the entity; see below. It
  pushes no live changes, and it is not a server to deploy.

To try authorization without a database, give `authorize` per entity name,
the function `RemoteServer.entity` takes, and the `principal` the layer
answers as. The principal's type is inferred from them, as `RemoteServer.make`
infers it from its sources:

```ts
const guarded = RemoteServer.memory({
  domain: Data,
  rows: { Project: [{ id: 'p1', name: 'Apollo', privateNotes: 'Internal' }] },
  principal: { isAdmin: false },
  authorize: {
    Project: (principal: Principal, fields) =>
      fields.filter(field => field !== 'privateNotes' || principal.isAdmin),
  },
})

// The layer reads as a non-admin; the server answers as anyone.
const asAdmin = RemoteServer.handlers(guarded.server, { isAdmin: true })
```

A withheld field is settled, as from any server: the client stops asking for
it, and a selection that needs it fails as `Unavailable`. A name in
`authorize` the domain does not declare is refused when the backend is made.

`filter` takes the same per-entity form. `readable` decides which rows a
principal may read, once per read, given each row's stored values; its second
argument looks another stored row up by id, for a rule that follows a
relation:

```ts
// Only an admin reads projects.
const adminsOnly = RemoteServer.memory({
  domain: Data,
  rows: { Project: [{ id: 'p1', name: 'Apollo', privateNotes: 'Internal' }] },
  principal: { isAdmin: false },
  readable: (principal: Principal) =>
    Effect.succeed(entity => principal.isAdmin || entity !== 'Project'),
})
```

A row it may not read is absent from a read by id (the client reads it as
not found) and from every query, and a ref to it is dropped from a relation:
a list leaves it out and a `one` ref reads `null`, as a database binding's
`visible` hides it.

An entity no row backs, answered from who is asking (`foldkit-guard`'s
`Me`, say), is a Source of its own beside the rows, in `entities`. Leave it
out of the rows' domain: a Source for an entity the domain declares is
refused when the backend is made, as two Sources for one entity are.

```ts
const Whoami = Entity.make('Whoami', Schema.Struct({ id: Schema.String, admin: Schema.Boolean }))
const WhoamiSource = RemoteServer.entity<Principal>(Whoami, {
  read: ({ ids, principal }) =>
    Effect.succeed(ids.map(id => ({ id, values: { admin: principal.isAdmin } }))),
})

// No principal: served through `serveFetch` or `handlers`, as each request's.
const { server } = RemoteServer.memory({
  domain: Data, // Project only; Whoami is the Source's
  rows: { Project: [{ id: 'p1', name: 'Apollo', privateNotes: 'Internal' }] },
  entities: [WhoamiSource],
})
const asVisitor = RemoteServer.handlers(server, { isAdmin: false })
```

`principal` is only who `layer` answers as. Without it (and a principal type
that does not admit `undefined`), the backend has no `layer`, only its store
and `server`, so nothing can read the rows as nobody.

## Over a MessagePort

`servePort(handlers, port)` from `foldkit-remote-server/port` answers
`foldkit-remote/port`'s client over one `MessagePort`, for a server in a
worker or in the page. It speaks Effect's RPC worker protocol, so reads,
queries, mutations and live streams cross it with their typed errors, and an
interrupted call interrupts its handler. It returns once the client closes its
end; interrupt it to stop sooner:

```ts
import { servePort } from 'foldkit-remote-server/port'

// In the host, for each port a page hands it; `handlers` as above.
Effect.runFork(servePort(handlers, port))
```

It binds no principal: pass the `handlers` for the conversation's own, as
everywhere else. It needs no browser package: the port is driven through
`effect/workers` directly.

## Over plain JSON

`RemoteServer.answer(handlers, body)` answers one request as `Remote.http`
and `Remote.json` send it, whatever received it: an HTTP route, a worker, a
server running in the page. It decodes the request and its payload by the
protocol's own schemas before a handler sees them, so an operation is one of
Remote's three and nothing else, and says what to send:

```ts
// A fetch-style route (Bun, Deno, a Worker; Node through its own adapter).
const route = async (request: Request): Promise<Response> => {
  const body: unknown = await request.json().catch(() => null)
  const answered = await Effect.runPromise(RemoteServer.answer(handlers, body))
  return Response.json(answered.body, { status: answered.status })
}
```

- **200** with `{ result }`: the handler answered.
- **400** with `{ error }`: the body is not a request, names an operation
  Remote does not have, or its payload fails the protocol's schema. No
  handler ran.
- **401** with `{ error, unauthenticated: { reason? } }`: a handler could not
  tell who is asking (`RemoteServer.unauthenticated`). The client fails the
  call, of whatever kind, with `_tag: 'Unauthenticated'`.
- **403** with `{ error, forbidden: { reason? } }`: who is asking may not do
  this (`RemoteServer.forbid`).
- **409** with `{ error, refusal }`: a declared insert's id is already a
  row's, refused as `Refusal.taken`.
- **422** with `{ error, refusal }`: the mutation refused what was asked, in
  its own `Refusal`.
- **500** with `{ error }`: the handler failed, and the message is its own;
  or something on this side broke, and the message is `Internal error`,
  nothing more. The cause is reported as a `ServerDefect`
  [diagnostic](#diagnostics), by default to the log, so a Worker's log
  (`wrangler tail`) shows what broke.

It never answers 408, 429, 502, 503 or 504. Remote's client reads a body
under one of those, or one that is not JSON, as no answer at all
(`Unreachable`): a proxy, gateway or rate limiter in front that answers one
leaves the client unsure whether the write ran, and a durable write is sent
again (see [A write sent again](#a-write-sent-again-operation)).

It binds no principal: pass the `handlers` for the request's own,
established by your authentication, as everywhere else. It carries no live
data.

For an endpoint that serves `RemoteRpc` through Effect's own `RpcServer`,
`bodyLimit(maxBytes)` is the same limit as HTTP middleware (Effect's
`MaxBodySize` fails the RPC body read as a defect, a 500):

```ts
import { Layer } from 'effect'
import { HttpRouter } from 'effect/http'
import { RpcSerialization, RpcServer } from 'effect/rpc'
import { RemoteRpc } from 'foldkit-remote'
import { RemoteServer, bodyLimit } from 'foldkit-remote-server'

// `server` is your RemoteServer.make; answered as an anonymous principal here.
const RpcRoutes = RpcServer.layer(RemoteRpc).pipe(
  Layer.provide(RemoteRpc.toLayer(RemoteServer.handlers(server, 'anonymous'))),
  Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
  Layer.provide(RpcSerialization.layerJson),
  Layer.provide(HttpRouter.middleware(bodyLimit(64 * 1024)).layer),
)
```

The client reads that 413 as the call's own error, and a 401 or 403 from
session middleware in front of the route as `Unauthenticated` or `Forbidden`,
only over `Remote.rpcProtocolHttp(url)` in place of
`RpcClient.layerProtocolHttp({ url })`, which reads the refusal as RPC frames
and loses its status: a durable write would then read as unreachable and be
sent again for good.

## Over fetch (Workers)

`serveFetch` from `foldkit-remote-server/fetch` is that route as a value: a
`(request: Request, env: Env) => Promise<Response>` for a Worker's `fetch`,
or any other runtime that speaks `Request`/`Response`. Each request is one
Effect: `layer` is built from the environment, then `resolvePrincipal` says
who is asking, then the request is answered as them. The resolver may need
what `layer` provides (a session store, an auth service):

```ts
import { serveFetch } from 'foldkit-remote-server/fetch'

// `server` is your RemoteServer.make; `databaseLayer` and `drizzle` provide what its Sources need.
export default {
  fetch: serveFetch({
    server,
    resolvePrincipal: request =>
      Effect.succeed({ actorId: request.headers.get('x-actor') ?? 'anon' }),
    layer: env => databaseLayer(drizzle(env.DB)),
  }),
}
```

Only `POST`s to `path` (default `/remote`) are answered; anything else is a
404. A body larger than `maxBodyBytes` (default 1 MiB) is a 413 with
`{ error, tooLarge: { limit } }`: one whose `content-length` says so before
the layer is built or the principal resolved, any other once the bytes read
pass the limit, its stream cancelled there. Give the client the same number
(`Remote.clientLayer(Remote.http('/remote'), { maxBodyBytes })`) and it cuts its
reads to fit; `Remote.http` reads a 413 as the call's own error, so a durable
write is not resent. A body that is not UTF-8 JSON, or not a request, is a 400
that reaches no handler; a handler's failure a 500 with its message. Every response, refusals
and errors included, says `cache-control: no-store` unless `headers` gives a
`cache-control` of its own: each answer is one principal's rows (and `may`), so
no shared cache may keep one.

A resolver refuses the caller by failing with
`RemoteServer.unauthenticated(reason?)`: a 401 whose body is
`{ error, unauthenticated: { reason? } }`, as `answer`'s 403 carries
`forbidden`, and whose `reason` is the only thing the caller learns. Anything
else this side breaks, the resolver's defects and the layer included, is a
500 that says nothing of it. A visitor is not a refusal: resolve one to the
principal your Sources treat as nobody, and refuse only a credential that was
sent and no longer holds.

`headers: principal => ({ … })` adds headers to every answer to that
principal, a live stream's included; a refusal answered no one and carries
none. `foldkit-auth`'s `AuthServer.answered` uses it to say whom each answer
was for.

`revalidate: { every, key? }` asks `resolvePrincipal` again, of the same
request, every `every` while a live stream is open. A refusal ends the
stream with `Unauthenticated`; a principal whose `key` differs from the one
it opened with ends it as a live error, which the client opens again after,
as the new principal. `key` is who a principal is, as `liveHub`'s `key`:
with guards, `key: Policy.keyOf`. Without `revalidate` a stream serves the
principal it opened with, a revoked session included, until it closes.

A body that opens live (`{ operation: 'live', payload }`) is answered with
the stream as `text/event-stream`: one `data:` frame per `LiveChange`, then
a terminal `event: error` frame carrying the failure's message when the
stream fails rather than ends. A payload no live stream speaks is a 400 that
subscribes to nothing. `httpWithLive` (`foldkit-remote/live`) is the other end; a client that
disconnects interrupts the subscription, as closing the RPC stream would.

The stream moves on its own even when nothing changes: a `: ping` comment opens
it, and another follows every `liveHeartbeat` (default 15 seconds), so proxies
and worker runtimes do not drop an idle connection. The heartbeat stops with
the events it serves, so a stream with nothing to serve still ends.

`live` takes a hub whose `changed`/`deleted` signals reach these streams. What
calls it must be able to wake the subscriber's fiber: in a worker, one request
cannot wake another's stream, so a hub fed from a second request delivers
nothing and ends the first stream. Poll the shared store from inside the
subscriber's own request instead: `foldkit-remote-drizzle`'s `pollLive` does,
with a trigger-kept row log (`rowChangeLog`, `rowLog`) so a quiet tick reads
no rows. A hub is right for a long-lived process that owns both sides.

### A page's reads, in the same process: `pageReader`

A Worker that renders pages reads what each page shows before rendering it
(`Data.satisfy`), as the reader who asked. `pageReader` is that reader, made
from the same config `serveFetch` takes: the request's `RemoteClient` as a
Layer, answered by the server's own handlers with no HTTP in between. The
server, its `layer` and its limits are the ones `/remote` answers with.

```ts
import { pageReader, serveFetch } from 'foldkit-remote-server/fetch'

const remote = { server, resolvePrincipal, layer: (env: Env) => databaseLayer(drizzle(env.DB)) }
const served = serveFetch(remote)
const reader = pageReader({ ...remote, resolvePrincipal: resolvePage })

export default {
  fetch: (request: Request, env: Env) =>
    new URL(request.url).pathname === '/remote'
      ? served(request, env)
      : pages.fetch(PageContext.attach(request, { reader: reader(request, env) })),
}
```

`pages` is the fetch handler Foldkit's build emits, and `PageContext` an
`SSR.requestContext` that carries the reader to `renderPage`
([`foldkit-ssr`](../ssr/README.md#what-the-host-hands-the-page-ssrrequestcontext)).

The resolver is the page's own: a page `GET` is a navigation, which carries
no header a script adds, so a resolver that asks for one (Yielded's CSRF
header) refuses it. With `foldkit-auth`, give
`AuthServer.resolver({ …, requests: 'navigation' })`. When the reader is
provided, the principal is resolved and `layer` built, and `layer` closes
when that Effect ends, so provide it to the pre-read itself
(`Data.satisfy(…).pipe(Effect.provide(reader))`). A refusal fails it with
`Unauthenticated`, as a 401 would.

The reader only reads. A mutation fails with `RemoteMutationError` and a live
open with `RemoteLiveError`: another site can start a navigation, so the
principal it resolves must never write, and a render keeps no stream.

## Diagnostics

A server answers some failures without telling the caller why. Each is a
typed diagnostic, reported through `Diagnostics.Reporter` (`foldkit-surface`'s
channel, re-exported by `foldkit-remote`), which by default is Effect's log:

| `_tag` | `level` | When |
| --- | --- | --- |
| `ServerDefect` | `error` | Something on this side broke (a layer, a resolver, a handler's defect) and the caller was answered `Internal error`; it carries the `cause`. |
| `AnswerUnread` | `warning` | A mutation committed, but reading its answer failed: the client reads those rows again. |
| `PublishFailed` | `error` | A mutation committed, but its live publish failed: live subscribers do not hear it. |
| `ClockSkewed` | `warning` | A write's time was past `clockSkew` from the server's clock (a client clock that is off, or a durable write that waited), so the server wrote its own; it carries `sent`, `own` and `bound`. |

Provide another reporter as any service: `Layer.succeed(Diagnostics.Reporter,
report)` in the layer the handlers run in. `serveFetch` takes one with the
request beside it, used for everything that request runs, a broken layer
included:

```ts
serveFetch({
  server,
  resolvePrincipal,
  layer: (env: Env) => databaseLayer(env),
  diagnostics: (diagnostic, request) =>
    Effect.logError(`${request.method} ${request.url}: ${diagnostic.message}`),
})
```

In a test, `Diagnostics.collect()` gives a reporter and the array it fills.

## Reference semantics: `evaluate` and the conformance suite

### Running a query body over rows you already hold

A descriptor declared with
[`Query.define`](../remote#queries-and-pagination) carries its meaning as a
value (`body`), and `evaluate` runs a body directly:

```ts
import { Entity, Expr, Order, Query, evaluate } from 'foldkit-entity'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, slug: Schema.String }))
const intro = Query.from(Post).pipe(
  Query.where(Expr.eq(Post.fields.slug, 'intro')),
  Query.orderBy(Order.asc(Post.fields.id)),
)

evaluate(intro, {}, [{ id: 'p1', slug: 'intro' }, { id: 'p2', slug: 'outro' }])
// [{ id: 'p1', slug: 'intro' }]: the matching rows, in the order the body asks for
```

It lives in [`foldkit-entity`](../entity), beside the IR it interprets, because
it is that IR's reference semantics rather than anything this package does —
and because a client judging rows it already holds needs it without depending on
a server package. This package re-exports it, so importing it from either place
means the same thing.

It is pure — it reads the rows it is given and nothing else — and it is the
reference the compiled interpreters are checked against. `foldkit-remote-drizzle`
turns the same body into SQL; the test suite runs both over the same rows in a
real SQLite and Postgres and requires the same ids in the same order. That is
what makes a body source-neutral in fact rather than in principle.

**It follows SQL, not JavaScript.** The case that matters is null: `null = null`
is *unknown* in SQL and matches no row, where JavaScript would call the two
equal. A comparison keeps a row only when it is true, so a null on either side
drops it. Where an ordering puts null is the term's to say
(`Order.asc(field, { nulls: 'first' })`); unsaid, it is Postgres's (last
ascending, first descending), which the SQL compiler writes out for SQLite too.

What it refuses rather than guesses, each where the query runs:

- **Ordering by values it has no order for**, such as a number in one row and
  text in another, or by a backend's locale collation, which only that backend
  has. Every term is checked over every matched row before anything is sorted,
  so the refusal is the same on every engine, whichever pair a sort would have
  compared first. One matched row, or none, has nothing to order.
- **NaN**, which SQLite stores as null and Postgres orders after every number.
- **Text holding a NUL character** in a comparison or a search, which Postgres
  text cannot hold and SQLite's `like` stops at.
- **A term with no context.** A body reading `Expr.viewer` or `Expr.now` is
  refused when run without them (`ContextMissingError`), never read as null.

### Checking an interpreter against the semantics

`evaluate` is the reference, and `cases` (in `foldkit-entity/conformance`) is
what it is a reference *to*: the conformance suite, exported so an interpreter
written elsewhere can be held to the same semantics. Here `run` is your
interpreter:

```ts
import { cases, rows } from 'foldkit-entity/conformance'

for (const { what, body, input, expected } of cases) {
  expect(run(body, input, rows).map(row => row.id), what).toEqual(expected)
}
```

Every case is chosen to make interpreters **disagree**, which is the only kind
that tests anything: mixed case, nulls on both sides of a comparison, `%` and
`_` as literal text, the empty search, a predicate compared to a boolean either
way round. That is not caution for its own sake — `contains` reached a released
package meaning three different things because every value in the original
fixture happened to be lowercase.

Both interpreters here run it: this package over rows in memory, and
`foldkit-remote-drizzle` compiled to SQL against a real SQLite and Postgres.

## See also

- [Server-derived state](../../docs/remote.md) — the client/server mental model
  and ownership rules.
- [Errors and failures](../../docs/errors.md) — what a client is and is not
  told, beside the failures every other package owns.
- [`foldkit-remote`](../remote) — requirements, normalized client Model,
  subscriptions, mutations, live reads, and retention.
- [`foldkit-remote-drizzle`](../remote-drizzle) — compile Entity selections and
  Query windows into Drizzle reads.
- [`examples/kitchen-sink`](../../examples/kitchen-sink) — Remote +
  RemoteServer + Drizzle + `liveHub` in one executable trace.
- [`examples/cloudflare`](../../examples/cloudflare) — Remote + Sync +
  remote-drizzle on D1 in a real worker, with a polling live Source.
