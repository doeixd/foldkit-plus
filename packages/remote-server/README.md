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

const ProjectsByOwnerSource = RemoteServer.query(
  ProjectsByOwner,
  ({ input, window, principal, select }) =>
    projectsPage({ ownerId: input.ownerId, window, principal }),
)

const Server = RemoteServer.make({
  entities: [ProjectSource],
  queries: [ProjectsByOwnerSource],
})
```

A Query returns:

```ts
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
`select` slice when the client sent one, and the principal.

### Running a query body over rows you already hold

A descriptor declared with
[`Query.define`](../remote#queries-and-pagination) carries its meaning as a
value, and `evaluate` runs that value directly:

```ts
import { evaluate } from 'foldkit-entity'

evaluate(PostsBySlug.body!, { slug: 'intro' }, rows)
// the matching rows, in the order the body asks for
```

It lives in [`foldkit-entity`](../entity), beside the IR it interprets, because
it is that IR's reference semantics rather than anything this package does —
and because a client judging rows it already holds needs it without depending on
a server package. This package re-exports it, so importing it from either place
means the same thing.

It is pure — it reads the rows it is given and nothing else — and it is the
reference the compiled interpreters are checked against. `foldkit-remote-drizzle`
turns the same body into SQL; the test suite runs both over the same rows in a
real SQLite and requires the same ids in the same order. That is what makes a
body source-neutral in fact rather than in principle.

**It follows SQL, not JavaScript.** The case that matters is null: `null = null`
is *unknown* in SQL and matches no row, where JavaScript would call the two
equal. A comparison keeps a row only when it is true, so a null on either side
drops it.

What it refuses rather than guesses:

- **Ordering by a column that is null in some row.** SQLite sorts nulls first,
  Postgres sorts them last for `asc`: the databases disagree with each other, so
  there is no answer to be conformant to and picking one would make this wrong
  against the other.
- **Comparing values it has no order for**, such as a number against a string.
- **Searching text that holds a NUL character**, which Postgres text cannot
  hold and SQLite's `like` stops at.

Each throws where the query runs, naming the query. An ordering is checked
before anything is sorted: every term over every matched row, in row order, so
the error names the first row that breaks it (`number and string` when a later
row holds text), the same on every engine, whichever pair a sort would have
compared first. One matched row, or none, has nothing to order and is never
refused.

### Checking an interpreter against the semantics

`evaluate` is the reference, and `cases` is what it is a reference *to*: the
conformance suite, exported so an interpreter written elsewhere can be held to
the same semantics.

```ts
import { Subject, cases, rows } from 'foldkit-remote-server'

for (const { what, body, input, expected } of cases) {
  expect(yourInterpreter(body, input, rows).map(row => row.id)).toEqual(expected)
}
```

Every case is chosen to make interpreters **disagree**, which is the only kind
that tests anything: mixed case, nulls on both sides of a comparison, `%` and
`_` as literal text, the empty search, a predicate compared to a boolean either
way round. That is not caution for its own sake — `contains` reached a released
package meaning three different things because every value in the original
fixture happened to be lowercase.

Both interpreters here run it: this package over rows in memory, and
`foldkit-remote-drizzle` compiled to SQL against a real SQLite.

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
mutation, so it needs no `Refusal` declared. The Source is also given `requestId`, the client's id for the
request, and `operation`, the operation's id across clients, both the same on
every retry of it. Record a write under `operation`, never `requestId`: a
request id is a counter in one client's Model, so two clients' first requests
share it, and a record keyed by it would answer one client with another's write.
`operation` is none from a client that sends none, and bounded on the wire (128
characters of `A-Z a-z 0-9 : . _ -`). A Source
may additionally return connection changes:

```ts
RemoteServer.prepend(connection, Project.ref(id))
RemoteServer.append(connection, Project.ref(id))
RemoteServer.remove(connection, Project.ref(id))
```

Those confirmed changes replace the corresponding optimistic connection layers
on the client.

A mutation declared as a `Write` (`Mutation.write`) needs no handler.
`RemoteServer.write(mutation, writer)` binds the input to the write, only the
keys the client named when it named some, and hands the row's id and new values
to an `EntityWriter`, which writes them and answers the row as written:

```ts
RemoteServer.write(EditProject, writer(Db.Project)) // `writer` from foldkit-remote-drizzle
```

The answer is the mutation's patch, or for a delete its deletion. With
`expect`, the writer is told the revision the row was read at; no row at it is
refused as `Refusal.conflict`. With `when`, the writer is handed the
precondition and the input encoded, checks it in the statement that writes, and
fails a row at the revision that does not hold it with `RemoteUnmet`
(`RemoteServer.unmet()`), which is refused as `Refusal.unmet`: absent first, then
a moved revision, then the precondition. A row the write would leave that
breaks an invariant of its Entity (`Entity.invariant`) is the writer's to
refuse, with `RemoteServer.invalid(message, rule, path)`, which is refused as
`Refusal.invalid`: the invariant's id and path, or none and empty when the
caller may not be told them. A writer says it judges invariants
(`invariants: true`), and a write over an Entity that has some, through a writer
that does not, is refused where it is served. A writer says it checks one
(`preconditions: true` on `EntityWriter`), and a write with a `when` over a
writer that does not is refused where it is served, rather than written whatever
the row holds. A write's increments reach the writer apart from its values
(`increments`, each field's amount, encoded), to be added in the statement that
writes; a writer says it adds them (`increments: true`), and a write with one
over a writer that does not is refused where it is served; so are computed
assignments (`assignments`, each a `Computation`), over a writer that computes
them (`assignments: true`). An increment or a computed assignment that expects
no revision is served only over a writer with a ledger (`ledger: true`), which
records each update under its `operation` and answers a retry from the record
(`recorded`), and only for a request carrying an operation id. Even so, a
concurrent pair must land as one result: an increment only of an integer, and a
computed assignment only where the writer `commutes` it, unless the writer pins
the row it read (`pins: true`, a guard with a revision). A writer
may refuse a write for what only its store knows (`refuses`, asked once where
the write is served): the Drizzle writer refuses an amount that may be a
fraction for a column that holds integers. An update of no row fails; an insert of an id
already holding what it writes answers that row, and a delete of a row already
gone succeeds, so a retry of either is safe. An insert of an id holding
anything else fails: that row is not its answer. The writer must be for the write's own Entity,
which is checked where the mutation is served.

A writer with a `read` (the row as a principal may see it, under the read
rule its Source applies) answers through it: the patch is the written row as
its writer now sees it, and a row the write moved out of their sight answers
in `deleted`, so the client takes it out of every list rather than placing
it where the server would not list it. A writer may refuse with
`RemoteServer.forbid`, as `foldkit-guard`'s `GuardServer.writer` does. Its
`linked` answers a row's links as stored, whatever a reader may see of the
rows they point at, so such a guard can tell a write that unlinks a hidden row
from one that changes nothing; `foldkit-remote-drizzle`'s `writer` has both.

Remote mutations are immediate requests against **server-owned** state. They are
not a durable offline intent log; client-authored edits that must survive offline
belong to `foldkit-sync`.

## Live data

There are two ways to produce live changes.

### Write a live Source directly

```ts
const ProjectLive = RemoteServer.live(Project, {
  subscribe: ({ requirements, after, principal }) =>
    projectEvents({
      requirements,
      after,
      principal,
    }),
})
```

`after` is the client's resume cursor. Events at or before it are duplicates.
The stream carries Remote `LiveChange`s: entity patches/deletes and connection
insert/remove/invalidate events.

If an Entity has no live Source, it contributes no stream. That is not an error:
the client planner can fall back to refetching it.

### Let a `liveHub` re-read changed fields

A hub fans **what changed** out to live subscribers. Give it to the handlers,
and every mutation's answer is published to it: each patch as a change of the
fields it carries, each deletion as a deletion. A mutation Source names nothing
twice.

```ts
const entitySources = [ProjectSource]
const hub = yield* RemoteServer.liveHub(entitySources)

const handlers = RemoteServer.handlers(Server, principal, {
  live: hub,
})

// Only for a write that is not a mutation: a database trigger consumer, a job.
yield* hub.changed(Project.ref(projectId), ['status', 'updatedAt'])
yield* hub.deleted(Project.ref(projectId))
```

A mutation's publish runs after its Source returned, so after a write that
commits as it goes. A failed publish is logged and the mutation still answers:
its write has happened, and a failed answer would be retried.

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
first of them. A key must therefore name everything the Sources decide by:

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
  rule could tell readers apart by.

A hub is an in-memory fan-out, so whatever calls `changed` must be able to wake
the subscriber's fiber. In a worker it cannot: one request cannot wake another's
stream, so a hub fed from a second request delivers nothing and tears the first
stream down (see `AGENTS.md`). On Workers, poll the shared store from inside the
subscriber's own request instead — `examples/cloudflare` has the shape. A hub is
right for a long-lived server process that owns both sides.

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
  entities: [ProjectSource, UserSource],
  queries: [ProjectsByOwnerSource],
  mutations: [RenameProjectSource],
  live: [ProjectLive],
})
```

When the client and server share the Remote domain declaration, validate the
Source names at startup:

```ts
const Data = Remote.define({
  entities: [Project, User],
  queries: [ProjectsByOwner],
  mutations: [RenameProject],
})

RemoteServer.validate(Data, Server)
```

That catches an Entity, Query, or Mutation Source whose name is not declared by
the shared domain instead of letting it silently answer nothing at runtime.

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
  rows;
- nested resolution is bounded by `maxDepth` (default `8`);
- the wire decoder also rejects a selection deeper than
  `MAX_RELATION_DEPTH` (`8`) or more than `MAX_FIELDS_PER_REQUEST` (`256`)
  fields for one Entity;
- returned field names are copied with `Object.hasOwn` into null-prototype
  objects, so names such as `__proto__` or `toString` cannot reach prototypes;
- Source errors are remapped to protocol error types without echoing application
  internals.

A `liveHub` applies the same id bound to a subscription. A hand-written live
Source is responsible for any additional bounds appropriate to its backend.

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
  domain: Data, // or the definition from Remote.define
  rows: {
    User: [{ id: 'u1', name: 'Ada' }],
    Project: [{ id: 'p1', name: 'Apollo', status: 'active', owner: 'User:u1' }],
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
- **422** with `{ error, refusal }`: the mutation refused what was asked, in
  its own `Refusal`.
- **500** with `{ error }`: the handler failed, and the message is its own;
  or something on this side broke, and the message is `Internal error`,
  nothing more. The cause goes to `answer`'s third argument, `onDefect`,
  which by default logs it (`logDefect`). `serveFetch` takes the same as
  `onError(cause, request)`, for a broken layer, resolver or live stream too,
  so a Worker's log (`wrangler tail`) shows what broke.

It binds no principal: pass the `handlers` for the request's own,
established by your authentication, as everywhere else. It carries no live
data.

## Over fetch (Workers)

`serveFetch` from `foldkit-remote-server/fetch` is that route as a value: a
`(request: Request, env: Env) => Promise<Response>` for a Worker's `fetch`,
or any other runtime that speaks `Request`/`Response`. Each request is one
Effect: `layer` is built from the environment, then `resolvePrincipal` says
who is asking, then the request is answered as them. The resolver may need
what `layer` provides (a session store, an auth service):

```ts
import { serveFetch } from 'foldkit-remote-server/fetch'

export default {
  fetch: serveFetch({
    server,
    resolvePrincipal: request =>
      Effect.succeed({ actorId: request.headers.get('x-actor') ?? 'anon' }),
    layer: env => databaseLayer(drizzle(env.DB)),
  }),
}
```

Only `POST`s to `path` (default `/remote`) are answered; anything else is a 404. A body that is not JSON, or not a request, is a 400 that reaches no
handler; a handler's failure a 500 with its message.

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
subscribes to nothing. `Remote.httpWithLive` is the other end; a client that
disconnects interrupts the subscription, as closing the RPC stream would.

The stream moves on its own even when nothing changes: a `: ping` comment opens
it, and another follows every `liveHeartbeat` (default 15 seconds), so proxies
and worker runtimes do not drop an idle connection. The heartbeat stops with
the events it serves, so a stream with nothing to serve still ends.

`live` takes a hub whose `changed`/`deleted` signals reach these streams. What
calls it must be able to wake the subscriber's fiber: in a worker, one request
cannot wake another's stream, so a hub fed from a second request delivers
nothing and ends the first stream. Poll the shared store from inside the
subscriber's own request instead — `examples/cloudflare`'s `pollLive` is the
shape. A hub is right for a long-lived process that owns both sides.

## What it does not own

`foldkit-remote-server` intentionally does **not** own:

- HTTP/WebSocket transport or serialization;
- authentication protocol or session storage;
- a database connection;
- the client's normalized cache;
- client rendering or Surface activation;
- durable/offline client-authored state.

Those boundaries keep this package an interpreter of the Remote contract rather
than another application runtime.

## See also

- [Server-derived state](../../docs/remote.md) — the client/server mental model
  and ownership rules.
- [`foldkit-remote`](../remote) — requirements, normalized client Model,
  subscriptions, mutations, live reads, and retention.
- [`foldkit-remote-drizzle`](../remote-drizzle) — compile Entity selections and
  Query windows into Drizzle reads.
- [`examples/kitchen-sink`](../../examples/kitchen-sink) — Remote +
  RemoteServer + Drizzle + `liveHub` in one executable trace.
- [`examples/cloudflare`](../../examples/cloudflare) — Remote + Sync +
  remote-drizzle on D1 in a real worker, with a polling live Source.
