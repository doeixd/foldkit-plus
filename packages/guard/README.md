# foldkit-guard

In most applications, permission checks live scattered across route handlers,
SQL `WHERE` clauses, form field locks, and UI buttons. Adding a role or an
endpoint means hunting down every check by hand, and a single missed `WHERE`
clause leaks another customer's rows.

`foldkit-guard` lets you declare who may read and change each row once on your
data model, in the shared domain code both client and server import. You split
rules into server-only checks on the signed-in user (*principal guards*) and
data rules over each row (*row guards*, written as expressions). On the server,
those rules compile into SQL filters and check every write; on the client, a
`may` hint tells your UI which actions to enable.

Read [How Guard works](../../docs/guard.md) for an end-to-end walkthrough, or
see it running in [`examples/auth`](../../examples/auth) and
[`examples/chirp`](../../examples/chirp) (live at
[foldkit-chirp-demo.pages.dev](https://foldkit-chirp-demo.pages.dev/)).

## How rules are split and who owns what

A guard set splits every rule into two parts so shared domain code stays safe
in the browser:

- A **principal guard** is declared by name in shared code, while its body
  lives only on the server (`G.implement`), keeping server-only role or
  membership lookups out of the client bundle.
- A **row guard** is an `Expr` over one Entity's fields and the principal's
  fields. Because it is pure data, the SQL compiler and in-memory evaluator both
  run it; see the [Expressions guide](../../docs/expressions.md).

| Fact | Owner |
| --- | --- |
| Who is asking | Your authentication layer, provided as `G.Principal` |
| Who may do what | The guard set, declared once in shared domain code |
| Principal guard bodies | `G.implement`, on the server only |
| Which rows a read returns | Each binding's `visible`, compiled from the rules |
| Server enforcement | Subpaths for `foldkit-remote-server`, `-drizzle`, and `foldkit-sync` |
| Client button and lock hints | The server's `may` answer, foreseen locally for pending writes |

Authentication stays outside this package: your auth layer resolves `G.Principal`
per request, and the server checks every write against the rules even when the
client already holds a `may` hint.

Use a guard for rules about **who** may read or change a row. Rules about
**what** a row may hold regardless of who writes it belong in
`Entity.invariant`, which fails with `Invalid` rather than `Forbidden`.
[One domain declaration](../../docs/entity.md) shows both on one Entity, and
[Auth and Guard](../../docs/auth-and-guard.md) traces sign-in through to a
guarded row.

## How a rule is enforced across your app

Shared domain code declares the rules with `Guards.declare` and attaches them to
Entities with `Guards.attach`. On the server, `G.implement` supplies the
principal guard bodies to produce a `Policy`. Every seam enforces that same
`Policy`:

- **Reads:** `GuardDrizzle.visible` and `GuardServer.memory` filter rows;
  `GuardServer.filter` filters members, relations, and `may`.
- **Writes:** `GuardServer.writer` and `GuardServer.mutation` check rules before
  writing and filter the returned row.
- **Sync:** `GuardSync.authorize`, `admit`, and `opens` guard replicated edits
  through the journal.
- **Agents:** `GuardAgent` gates capabilities and `may` hints.
- **Startup:** `GuardServer.validate` verifies every guarded Source and write at
  boot.

When deciding a rule, the server evaluates each principal guard once per
request, leaving a boolean condition over row fields that SQL or the in-memory
evaluator runs.

## Install

```sh
pnpm add effect foldkit-entity foldkit-guard
```

`foldkit-guard` holds the shared declarations. Its subpaths integrate with
optional peer packages: `foldkit-guard/server` (`foldkit-remote`,
`foldkit-remote-server`), `/drizzle` (`foldkit-remote-drizzle`, `drizzle-orm`),
`/sync` (`foldkit-sync`, `foldkit-remote-server`), `/agent` (`foldkit-remote`),
and `/media` (`foldkit-media`).

## A first guard set

This declares a `Todo` entity with three guards (`isAdmin`, `isOwner`,
`inProject`), implements the server-only check, and evaluates a read for Ada
(the owner) and Bo (someone else):

```ts
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'member']),
  projectIds: Schema.Array(Schema.String),
})
const TodoFields = Entity.define(
  'Todo',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, projectId: Schema.String, title: Schema.String }),
)

const G = Guards.declare('Todos', User, guard => ({
  isAdmin: guard.principal(),
  isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
  inProject: guard.row(TodoFields, p => Expr.in(TodoFields.fields.projectId, p.projectIds)),
}), { key: user => user.id, unguarded: 'deny' })

const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

const sampleTodo = { id: 't1', ownerId: 'ada', projectId: 'p1', title: 'Write the README' }
const decide = (id: string) =>
  Effect.runSync(Policy.decide(G.isOwner, { principal: Option.some({ id, role: 'member', projectIds: [] }), interaction: 'Read', row: sampleTodo }))

decide('ada') // true
decide('bo') // false
```

Ada owns `t1`, so `decide('ada')` returns `true`; Bo's ID differs from
`ownerId`, so `decide('bo')` returns `false`.

- `Guards.declare` builds each row guard's predicate once using placeholders
  (`p.id` stands for `principal.id`) and rejects predicates over another Entity
  or direct JavaScript branching on placeholders at compile time.
- `G.implement` supplies the body for every principal guard (missing or extra
  keys fail typechecking and runtime validation). Pass `{ operators }` as a
  second argument when row guards call custom primitive operators (defaults to
  `Operators.kernel`).
- `Policy.decide` returns an `Effect` yielding `true`, `false`, or
  `{ allowed: false, reason }`. Anonymous visitors pass `Option.none()` and
  fail row guards that read principal fields, while passing row-only predicates
  such as `isPublished`.
- `G.Principal` is the server `Context` key holding `Option<Principal>`;
  `G.key(user)` returns the stable user identifier for cache scoping (see
  [Who is asking](#who-is-asking)).

## Attaching guards to an Entity

A guard set names rules; `Guards.attach` places them on each surface (row,
member, relation) and interaction. Here a todo links to a `Project` via
`project` (stored as `projectId`), and `Project` has no guards so anyone can
read it:

```ts
import { Relation } from 'foldkit-entity'
import { Interaction } from 'foldkit-guard'

const ProjectFields = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const Related = Entity.relate(
  { Todo: TodoFields, Project: ProjectFields },
  { Todo: { project: Relation.one(ProjectFields) } },
)
const Project = Related.Project

const Archive = Interaction.make('Archive')

const Todo = Related.Todo.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.inProject, G.isAdmin],
      Write: [G.isOwner],
    },
    interactions: {
      [Archive.key]: Guards.on([G.isAdmin], Guards.explain('Only an admin may archive.')),
    },
    members: { ownerId: { Update: [G.isAdmin] } },
  }),
  Guards.may, // adds the derived `may` hint member: see What the client may do
)

Guards.matrix([Todo])
// Todo.Read: isOwner | inProject | isAdmin → not_found
// Todo.Create: isOwner → forbidden
// Todo.Update: isOwner → forbidden
// Todo.Delete: isOwner → forbidden
// Todo.Archive: isAdmin → explain("Only an admin may archive.")
// Todo.ownerId.Create: isAdmin → forbidden
// Todo.ownerId.Update: isAdmin → forbidden
```

### Combining rules and interactions

- Lists on a surface act as a disjunction ("owner, or project member, or
  admin"). Use `Guards.all(a, b)` for conjunctions, and `always: [...]` for
  rules ANDed across every surface (such as tenant isolation or requiring a
  signed-in user).
- `Write` expands to `Create`, `Update`, and `Delete`; adding a specific slot
  such as `Delete` alongside `Write` appends its rules and replaces `Write`'s
  refusal. A member's `Update` rule also governs `Create` unless `Create` is
  listed separately.
- Custom interactions (`Interaction.make('Archive')`) live under `interactions`
  keyed by `[Archive.key]`, catching typos at compile time.
- `Guards.inherit('project')` delegates a row's `Read` to its `one` relation's
  `Read` rule.
- Surfaces left unguarded on a guarded Entity fall back to `unguarded` from
  `Guards.declare` (`'deny'` prints `closed`, `'allow'` prints `open`).

### Refusals, descriptors, and guard fields

- Default refusals vary by surface: row reads return not found (hiding
  existence), member and relation reads omit the value, and writes return
  `Forbidden`. Use `Guards.on(guards, Guards.redact(value))` to replace a
  hidden member with a typed fallback, or `Guards.on(guards, Guards.explain(reason))`
  to attach a message to a refused write.
- Unknown member keys, guards from another Entity or set, and misspelled
  interactions are type errors.
- `Guards.attach` returns a new descriptor carrying the rules (`Entity.same` is
  still `true`); pass that returned descriptor to every enforcement API
  (`GuardServer.writer`, `filter`, `memory`, `mutation`, `GuardDrizzle.visible`,
  and `GuardSync.document`), which throw if given an unguarded descriptor of a
  guarded Entity.
- `Guards.guardFields(Todo, 'Read')` lists the row's own fields read by its
  `Read` rules (plus inherited relations) so live updates know when to refetch.

### What a row guard may read

A row guard is an `Expr` over its Entity's row and the principal's fields:

- Compare a `one` relation directly to the linked ID
  (`guard.row(Like, p => Expr.eq(Like.relations.user, p.id))`) without storing a
  duplicate field.
- Pass `{ viewer: User }` to `Guards.declare` so rules can reference
  `Expr.viewer(User)`, matched against `Policy.viewer(principal)`
  (`RemoteServer.make({ viewer: Policy.viewer })`).
- Scope rules per variant case (`Entity.defineVariants`) with `Expr.is`:
  `guard.row(Domain, p => Expr.is(Domain, 'Available', ({ price }) => Expr.lte(price, p.budget)))`.
- Reach across relations in row `Read`, `Update`, and `Delete` rules using
  `Expr.path`, `Expr.exists`, or a viewer path
  (`Expr.eq(Note.fields.orgId, orgOfViewer)`). `Read` rules compile to SQL;
  `Update` and `Delete` rules run inside the write statement
  ([Rules that read another row](#rules-that-read-another-row)).

## Serving reads

`foldkit-guard/server` connects your rules to `foldkit-remote-server` while
keeping server code out of browser bundles:

```ts
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'

const visitor: Option.Option<typeof User.Type> = Option.none()

const Data = Remote.define({ entities: [Todo, Project] })
const backend = RemoteServer.memory({
  domain: Data,
  rows: {
    Todo: [{ id: 't1', ownerId: 'ada', projectId: 'p1', title: 'Write', project: 'Project:p1' }],
    Project: [{ id: 'p1', name: 'Borealis' }],
  },
  principal: visitor, // reads no todo: every Read rule here needs a principal
  ...GuardServer.memory(Policy, [Todo]),
})
```

- Rows refused by `Read` are absent from by-ID lookups, queries, and relations
  (`one` refs become `null`). Inherited `Read` rules evaluate the related row's
  rules (cycles evaluate as refused).
- Members or relations refused by `Read` are withheld (`Unavailable`) or
  replaced with their `redact` value, while the fields those rules inspect are
  still fetched to decide them.
- Unlisted Entities remain public; custom Sources must use `GuardServer.memory`
  or `GuardDrizzle.visible` + `GuardServer.filter` to pass
  `GuardServer.validate`.

### Filtering Drizzle queries

Over Drizzle, `foldkit-guard/drizzle` compiles row `Read` rules into each
binding's `visible` filter so every query, by-ID read, relation, and count
applies them in SQL (here `todos` and `projects` are your Drizzle tables; see
[`test/drizzle.test.ts`](test/drizzle.test.ts) for a full SQLite fixture):

<!-- docs-check
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
})
const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})
-->
```ts
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { bind, source } from 'foldkit-remote-drizzle'

const visible = GuardDrizzle.visible(Policy, [Todo])
const Db = bind(
  { Todo, Project },
  {
    Todo: {
      table: todos,
      relations: { project: { field: todos.projectId } },
      derived: { may: { supplied: true } }, // computed by `GuardServer.filter`
      visible: visible.Todo,
    },
    Project: { table: projects },
  },
)
const TodoSource = source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) })
```

- Principal guards run first in memory; remaining row conditions compile to SQL.
  Inherited `Read` rules become `project_id in (select id from projects where …)`
  subqueries.
- `GuardDrizzle.visible` validates at build time that inherited targets are
  listed with `Read` rules and free of cycles; inherited relations must store a
  foreign key on the child table.
- Passing a principal value outside `Option<Principal>` throws a defect rather
  than treating it as a visitor.
- Pass `{ operators }` to `GuardDrizzle.visible(Policy, [Todo], { operators })`
  when rules use custom primitive operators so they match your `bind` table.
- `visible` enforces row `Read` rules; `GuardServer.filter` enforces member
  reads, relation reads, and `may`.

### Providing services to principal guards

Read seams (`GuardDrizzle.visible`, `GuardServer.memory`, `GuardSync`) require a
`Policy` with all Effect services already provided at startup, keeping request
context in the principal:

```ts
import { Context } from 'effect'

class Memberships extends Context.Service<
  Memberships,
  { readonly admins: ReadonlyArray<string> }
>()('app/Memberships') {}

const Checked = G.implement({
  isAdmin: principal =>
    Effect.map(Memberships, ({ admins }) =>
      Option.exists(principal, user => admins.includes(user.id)),
    ),
})
const ReadPolicy = Checked.provide(Context.make(Memberships, { admins: ['ada'] }))
GuardDrizzle.visible(ReadPolicy, [Todo]) // passing `Checked` directly is a type error
```

`GuardServer.validate(Checked, …)` treats `ReadPolicy` as equivalent to
`Checked`, while write seams accept `Checked` directly and resolve its services
per write.

### Guarded reads are omitted from edge caches

`foldkit-remote-server`'s `serveFetch` caches reads at the edge only when one
response applies to every caller. Because guarded Entities attach principal-aware
`visible` or `filter` rules, responses for guarded Entities (including row-only
rules) and SSR pages reading them bypass edge caching (`no-store`). Serve truly
public cached data from an unguarded Entity.

## Serving writes

A declared write (`Mutation.write`) runs through `RemoteServer.write` (see the
[declared writes guide](../../docs/declared-writes.md)). Wrap its writer with
`GuardServer.writer` to enforce write rules before any row changes:

```ts
import { Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { writer } from 'foldkit-remote-drizzle'

const EditTodo = Mutation.write(
  'EditTodo',
  Write.update(Entity.input(Todo, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
RemoteServer.write(EditTodo, GuardServer.writer(Todo, Policy, writer(Db.Todo)))
```

### How writes and cascades are checked

- **Reads before writing:** updates and deletes load the row under the writer's
  visibility. Hidden rows fail updates as `Forbidden` and answer deletes as
  already deleted.
- **Row rules:** `Create` checks proposed values (fields left unset fail any
  guard reading them). `Update` checks the row both before and after the write so
  writers can move rows only within their own visibility. `Delete` checks the
  existing row.
- **Member and link rules:** each set or incremented member requires its `Create`
  or `Update` rule, and changed relations require `Unlink` on the old target and
  `Link` on the new one. Updates evaluate each member/link rule against the new
  row with that one change reverted, preventing multi-field bypasses while
  letting transition rules like "update `status` only while `draft`" pass.
- **Refusals and readback:** signed-in failures return `Forbidden` (with
  `Guards.explain` text); visitors (`Option.none()`) return `Unauthenticated` so
  clients prompt for sign-in and outbox writes retry cleanly. Accepted writes
  return only fields and relations the writer may read, reporting rows that left
  the writer's visibility in `deleted`.
- **Cascades and link clearing:** for `onDelete: 'cascade'` and `onDelete: 'setNull'`
  relations, pass `{ children: [Like] }` to `GuardServer.writer`. Cascades check
  every child's `Delete` rule (unless `authorizedBy: 'parent'`) and `setNull`
  checks each child's `Update` and `Unlink` rules in the same statement/batch,
  refusing the whole delete on any failure without leaking child IDs.

### A revision closes the gap between the check and the write

Because loading a row and writing it are separate statements, another write can
land in between. Add a numeric `revision` field and pass `{ revision: 'revision' }`
to `GuardServer.writer` so every update and delete pins the revision it checked:

```ts sketch
GuardServer.writer(Todo, Policy, writer(Db.Todo), { revision: 'revision' })
```

If another write moves the row first, the guard reloads and re-evaluates up to
three times before failing with an `Internal error` (`ServerDefect` logged as
`"changed while it was written"`). Client inputs with stale `expect` revisions
fail immediately with `Conflict`. `GuardServer.validate` emits an
`UnpinnedWrites` diagnostic for updates or deletes on Entities without a
`revision` pin.

### Preconditions, increments and invariants

- **Preconditions (`when`):** the writer checks `when` after guards pass, in the
  order: hidden row (`Forbidden`), stale expected revision (`Conflict`), failed
  guard (`Forbidden`), unmet precondition (`Unmet`). `GuardServer.validate` and
  the writer reject preconditions or `expect` over fields with `Read` rules to
  prevent oracle leaks.
- **Increments and computed assignments:** increments require the member's
  `Update` rule and check row rules over the resulting sum; computed
  assignments run through `Write.apply` with your `operators` table (emitting
  `ComputeRefused` on operator errors) and reject reads from `Read`-guarded
  members. Both require either `expect` or a writer `revision` pin.
- **Invariants (`Entity.invariant`):** invariants run after guards pass and fail
  with `Invalid`. Invariants reading a `Read`-guarded member still run, reporting
  a generic `"The row would be invalid"` message without naming hidden values.

### Retries

When a writer uses a ledger (`writer(binding, { ledger })`), retries of an
already-applied operation replay from the ledger immediately, while failed or
first-time requests evaluate against the current principal and row.

### The writer's binding

Give `GuardServer.writer` the same binding (`Db.Todo`) used by the Entity's
Source so its `visible` filter matches `GuardDrizzle.visible`.

### Fields the server sets

Use `Entity.sets` (`Expr.viewer`, `Expr.now`) in `foldkit-entity` for fields
such as `ownerId` so `RemoteServer.write` populates them before guards run.
Inputs attempting to set those fields fail declaration checks, and visitors
fail with `Unauthenticated`. Duplicate creates return `Refusal.taken` uniformly,
while ledger retries replay the original row to the same creator.

### Handlers

Custom mutation handlers (`RemoteServer.mutation`) use `GuardServer.mutation` to
check one interaction rule before executing:

```ts
const ArchiveTodo = Mutation.make('ArchiveTodo', { Input: { id: Schema.String }, Output: {} })

GuardServer.mutation(
  ArchiveTodo,
  { entity: Todo, policy: Policy, interaction: Archive.key, id: input => input.id, source: TodoSource },
  ({ input, row }) => Effect.succeed({ output: {} }), // `row`: the todo, as its writer sees it
)
```

- `id` loads the target row through `source` (rejecting hidden rows); omitting
  `id` checks principal/create rules, and returning an `Option` handles both
  create (`Option.none()`) and edit (`Option.some(id)`).
- Pass `fields` to select extra columns for your handler; returned Entity rows
  pass back through `source`'s `authorize` and `filter`, marking newly hidden
  rows as deleted.

### Rules that read another row

`Read`, `Update`, and `Delete` row guards can traverse relations (`Expr.path`,
`Expr.exists`, or viewer paths). `Read` rules compile into SQL subqueries, while
`Update` and `Delete` rules pass remaining cross-row conditions to
`remote-drizzle`'s `writer` via `requires` (`update … where … and <rule>`) so
they evaluate atomically at write time on SQLite and Postgres (Postgres apps
call `postgres()` from `foldkit-remote-drizzle/pg` at startup).

- Cross-row `Update`/`Delete` rules read the stored row, blocking writes that
  would move a row out of reach (such as moving a note to another team).
- `may` leaves cross-row interactions undecided (`May.answer` returns an `Unknown` `Verdict`).
  Keep forms editable and hide controls with `May.refused` rather than
  `!May.can`, letting the server render the final decision.
- `GuardServer.writer` throws if given a writer without `requires` support;
  single-row seams (`GuardServer.mutation`, `GuardSync.document`,
  `GuardServer.memory`) reject cross-row rules on those surfaces by name.

## Checking a server at startup

Hand-written Sources or unguarded queries bypass row filtering silently unless
checked at startup. Call `GuardServer.validate` once when booting your server:

```ts
GuardServer.validate(Policy, { entities: [Todo], domain: Data, server: backend.server })
```

It throws with a descriptive list if any of the following hold:

- A guarded Entity's Source lacks the `GuardDrizzle.visible`/`GuardServer.memory`
  rule or `GuardServer.filter` built for that `Policy`, or a query uses a
  Source or undeclared Entity without them.
- A query body filters or orders by a `Read`-guarded member (or reached member),
  preventing existence or value oracles across shared query definitions. Move
  secret values to a separate row-guarded Entity when filtering is needed.
- A declared write bypasses `GuardServer.writer`, or leaves `Create`/`Update`/`Delete`
  unguarded under `unguarded: 'allow'` (use `[Guards.anyone]` for explicit
  public writes).
- A live Source skips the guarded Source (`pollLive` passes via `LiveSource.reads`),
  an Entity carries another set's guards, or a rule uses an operator missing from
  `Policy`'s table.
- A Source marks a field `shared` when row, `always`, field, or target `Read`
  rules depend on the reader, or marks `may` as `shared`.

`ReadPolicy` (services already provided) satisfies `validate` for `Checked`.
Custom `RemoteServer.mutation` handlers write arbitrary code and stay outside
startup inspection.

## Who is asking

Pass `G.Principal` to `RemoteServer.handlers` and provide the resolved
principal per request:

<!-- docs-check
declare const body: unknown
declare const principal: Option.Option<typeof User.Type>
-->
```ts
const handlers = RemoteServer.handlers(backend.server, G.Principal)

// per request: `body` is what it sent, and authentication resolved `principal`
RemoteServer.answer(handlers, body).pipe(Effect.provideService(G.Principal, principal))
```

For live hubs, pass `Policy.keyOf` so subscribers with identical principals share
refetches while claim changes (such as updated `projectIds`) get distinct keys:

```ts
const hub = Effect.gen(function* () {
  return yield* RemoteServer.liveHub([...backend.server.entities.values()], {
    key: Policy.keyOf,
  })
})
```

On the client, scope persisted caches with `G.key(user)` (`RemotePersistence`'s
`scope`) and call `Remote.forget` on sign-in or sign-out so cached rows from an
earlier user clear immediately.

## What the client may do

Because browser bundles exclude principal guard bodies and user claims, views
read server-computed `may` hints attached via `Guards.may` and populated by
`GuardServer.filter` (marked `derived: { may: { supplied: true } }` in Drizzle):

<!-- docs-check
import type { Selected } from 'foldkit-entity'
declare const row: Selected<typeof Row>
-->
```ts
import { May } from 'foldkit-guard'

// Select it as any member, and read it with `May`; `row` is a Todo read through `Row`.
const Row = Entity.select(Todo, { title: true, may: true })
May.can(row.may, Archive.key) // the row's rule for Archive
May.canSet(row.may, Todo, 'ownerId') // the row's Update, and ownerId's own
May.canLink(row.may, Todo, 'project', 'Link')
```

- `may` covers `Update`, `Delete`, custom interactions, member `Update` rules,
  and relation `Link`/`Unlink` rules over the loaded row (members/relations
  without rules inherit `Update`).
- A rule that reads a field hidden or redacted for the reader leaves its `may`
  entry out. The server evaluates the rule when it receives a write.
- `May.reason(row.may, 'Delete')` returns `Option<string>` from `Guards.explain`.
- `foldkit-crud` passes `locks: May.locks(Todo)` to lock disallowed fields in
  `foldkit-mixins-form` while keeping undecided fields editable.

For optimistic writes, Remote foresees `may` locally (`Derived.make`'s
`predict`) over row-only and viewer expressions when principal parts agree, and
blocks writes immediately (`forbids`) when a held `may` already refuses `Update`,
a written member/relation, `Delete`, or a held cascade child—saving a round trip
while still checking on the server. `Law.check` (`foldkit-remote/testing`) tests
that client and server refusals agree.

### What `may` tells a reader, and what it does not

`may` is strictly a UI hint: the server ignores any `may` on a request and
re-evaluates every write against the live rules and row.

- **Hidden rows stay hidden:** rows refused by `Read` return as missing rather
  than exposing `may` or `Forbidden`.
- **Fixed declaration shape:** `may` keys come from the shared Entity
  declaration; keep sensitive logic inside server-only principal guard bodies.
- **Public refusal text:** `Guards.explain` strings ship in the shared bundle,
  so write user-facing messages free of IDs or internal rule details.
- **Per-reader isolation:** `GuardServer.validate` blocks `shared: true` on
  `may`, `serveFetch` sends `no-store`, SSR pages send `private, no-store`, and
  `Remote.forget` clears cached hints on principal changes.
- **Client predictions stay local:** foreseen `may` values update the local UI
  until the server response arrives and stay out of mutation payloads.

## Who the client is: `Me`

Use `Guards.me` to expose the current visitor's sign-in state and global
capabilities (such as `"Show the Admin link"`) as a single-row Entity `me`,
served by `GuardServer.me`:

```ts
const OpenAdmin = Interaction.make('OpenAdmin')

// Shared domain code, beside the other Entities.
export const Me = Guards.me(G, {
  interactions: { [OpenAdmin.key]: [G.isAdmin] },
})

// The server: one Source among the others.
const MeSource = GuardServer.me(Me, Policy)
```

- Select `{ signedIn: true, key: true, may: true }` through Remote like any row,
  and call `Remote.forget` on sign-in or sign-out so `Me` updates.
- `Me` uses `Guards.anyone` for `Read` and denies all writes; `key` exposes
  `G.key(user)` to that user, so keep it to a public ID rather than a token.

## When a rule refuses

| Cause | Server | Client |
| --- | --- | --- |
| Row `Read` refused | Omitted | Missing / tombstoned |
| Member `Read` refused (`omit`) | Field withheld | Field is `Unavailable` |
| Member `Read` refused (`redact`) | Replacement value | `Ready` with replacement |
| Relation `Read` refused | Withheld | `Unavailable` |
| Write refused | `Forbidden` (403 JSON) | `Failed` (`_tag: 'Forbidden'`) |
| Visitor write refused | `Unauthenticated` (401 JSON) | `Failed` (`_tag: 'Unauthenticated'`) |
| Write hid row from writer | Listed in `deleted` | Tombstoned; leaves lists |
| Delete of hidden row | Answered as deleted | Tombstoned |
| Sync edit refused | Rejected with `Forbidden` | Dropped; `status.rejected` set |
| Agent capability refused | — | `AgentAuthorizationError` or hidden |
| Source left unguarded | `GuardServer.validate` throws | — |

Refusals only include text when `Guards.explain` is set, keeping plain refusals
opaque and hidden rows indistinguishable from missing IDs.

## Diagnostics

Recoverable server anomalies emit typed diagnostics through `foldkit-surface`'s
`Diagnostics` channel (defaulting to Effect logging):

| `_tag` | `level` | When |
| --- | --- | --- |
| `ComputeRefused` | `error` | A computed write operator threw or refused input (e.g. NUL bytes) |
| `UnpinnedWrites` | `warning` | `GuardServer.validate` found writes on a writer without `revision` |

`ComputeRefused` uses the server's reporter (`serveFetch`'s `diagnostics` or
`Diagnostics.Reporter` layer); `GuardServer.validate` accepts `diagnostics` as
an option. Use `Diagnostics.collect()` in tests.

## Sync

`foldkit-guard/sync` checks `foldkit-sync/entity` cell edits in two stages:
principal guards synchronously under the journal lock (`authorize`), and row/row
field rules against the database before admitting operations (`admit`), plus
connection gating (`opens`):

<!-- docs-check
import type { CellChange } from 'foldkit-guard/sync'
import type { Operation, Sync } from 'foldkit-sync'
import type { JournalExchangeOptions } from 'foldkit-sync/journal'
declare const sync: Sync<unknown, unknown>
declare const journal: JournalExchangeOptions<unknown, unknown, typeof principal>['journal']
declare const changesOf: (operation: Operation) => ReadonlyArray<CellChange>
declare const db: unknown
-->
```ts
import { GuardSync } from 'foldkit-guard/sync'
import { databaseLayer } from 'foldkit-remote-drizzle'
import { EditableEntity } from 'foldkit-sync/entity'
import { journalExchange } from 'foldkit-sync/journal'

// Edits to titles: a member with a Read rule of its own could not be one.
const TodoEdits = EditableEntity.make(Todo, { members: ['title'] })

// Who may open it: its readers, each in the rows' Read rule. Only an admin reads every todo.
const Edits = GuardSync.document(TodoEdits, { readers: [G.isAdmin] })

// Under the journal's lock: the principal's own guards, for the Sync contract's authorize.
const authorize = { EditedTodos: GuardSync.authorize(Policy, Edits) }

// Each exchange, as its principal: whether they may open it, and each edit against its row.
journalExchange({
  sync,
  journal,
  principal,
  opens: GuardSync.opens(Policy, Edits, principal),
  admit: operation =>
    GuardSync.admit(Policy, Edits, { principal, source: TodoSource, changesOf })(operation).pipe(
      Effect.provide(databaseLayer(db)),
    ),
})
```

- `authorize` evaluates principal guards synchronously for row `Update` and
  changed member rules.
- `admit` loads each target row through the guarded `source` and checks row and
  member `Update` rules before and after all edits in the operation.
- `GuardSync.document` requires one shared audience (`readers` must match
  top-level principal guards in the Entity's `Read` rule; edited fields must
  lack per-member `Read` rules and `always` rules).
- Presence sockets gate connections with `Sync.presence.serve(socket, hub, { peerId, opens: GuardSync.opens(Policy, Edits, principal) })`.

## Agents

`foldkit-guard/agent` reads `may` from Remote's client Model for
`foldkit-agent` capability `authorize` and `available` checks so agents only
see and invoke actions the user can perform:

<!-- docs-check
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
const Message = defineMessageUnion({ RequestedArchive: { id: Schema.String } })
const App = Surface.application({
  Model: Schema.Struct({ remote: Remote.Model, selected: Schema.String }),
  Message,
})
-->
```ts
import { Agent } from 'foldkit-agent'
import { GuardAgent } from 'foldkit-guard/agent'

const TodoAgent = Agent.forApplication(App).withPrincipal(G.Principal)
// The Todo an id names, read through `Row` from the client's Model.
const todo = Remote.select(Remote.at(Data, App.model.remote), Row)

TodoAgent.expose(Message, {
  RequestedArchive: {
    description: 'Archive a todo',
    authorize: GuardAgent.authorize(Archive.key, ({ input, model }) => todo(input.id).read(model)),
    available: GuardAgent.available(Archive.key, model => todo(model.selected).read(model)),
  },
})
```

- `Row` selects `may`. Missing or failed reads refuse dispatch; rules reading
  another row stay offered and defer to the server check.
- `withPrincipal(G.Principal)` aligns the agent's principal type with the server,
  which still enforces every write independently.

## Uploads

`foldkit-guard/media` supplies `foldkit-media`'s `UploadPolicy` using your
principal guards and session resolver (`AuthServer.resolver` from
`foldkit-auth/server`) before reading upload bytes:

<!-- docs-check
import type { Inspector } from 'foldkit-media'
declare const resolve: (request: Request) => Effect.Effect<Option.Option<typeof User.Type>, unknown>
declare const inspector: Layer.Layer<Inspector>
-->
```ts
import { Layer } from 'effect'
import { uploadLayer, uploadsKeyValueStore } from 'foldkit-media/server'
import { GuardMedia } from 'foldkit-guard/media'

const uploads = uploadLayer().pipe(
  Layer.provide(
    Layer.mergeAll(
      uploadsKeyValueStore(),
      inspector,
      GuardMedia.uploadPolicy(Policy, { resolve, Upload: [G.isAdmin], DescribeUrl: [G.isAdmin] }),
    ),
  ),
)
```

- Only principal guards apply (row guards are rejected at compile time). Omitted
  routes deny all callers.
- `resolve` inspects URL, method, and headers before reading the body, returning
  `401` on resolver failure and `403` when guards refuse (keeping `explain`
  messages on the server).
- Provide all services on `Policy` via `Policy.provide` ahead of time, and
  combine with `uploadPolicyAny(uploadPolicyBearer(secret), GuardMedia.uploadPolicy(…))`
  when scripts upload via bearer token.

## Lower level: asking the Policy yourself

Custom Sources and interpreters can query `Policy` directly via `readable`,
`readMembers`, `writable`, `writeMembers`, and `linkable`:

```ts
import { Condition } from 'foldkit-guard'

const ada = Option.some({ id: 'ada', role: 'member' as const, projectIds: ['p1'] })
const readable = Effect.runSync(Policy.readable(Todo, ada))
// isAdmin was false, so: isOwner or inProject, over each row

const t1 = { id: 't1', ownerId: 'ada', projectId: 'p9', title: 'Write the README' }
Condition.holds(readable, t1, Policy.inputOf(ada), () => false, Policy.operators)
// true
```

- `Condition.always` and `Condition.never` short-circuit row scans when
  principal guards alone decide access.
- `Condition.holds` evaluates a condition over an in-memory row; its fourth
  argument resolves inherited `Read` relations. It answers `true` only where
  the whole condition is true: a guard the row makes unanswerable (text
  holding a NUL character, NaN, a sum too large to add exactly) refuses it,
  even beside a guard that allows.

## Limits

- **`may` reflects the last read row:** live patches to guarded fields require
  a refetch to refresh `may`.
- **Custom handlers check their own fields:** `GuardServer.mutation` checks the
  row rule for its interaction; field-level and link-level rules inside custom
  handler bodies stay the handler's responsibility.
- **Cross-row `Read` rules skip live list placement:** `Guards.attach` tracks
  own-row `Read` fields for list refetches, while changes on reached rows stay
  at the list's last read until refetched.
- **Sync documents share one audience:** per-member or per-row secrecy inside a
  replicated Sync document is refused by `GuardSync.document`.
- **Revisions pin declared writes:** raw SQL or migrations outside declared
  writes advance revisions only if the database installs `revisionTrigger` from
  `foldkit-remote-drizzle` (omitted on Sync-managed tables).
- **Sync `admit` lags the journal slightly:** `admit` reads the current table
  when admitted, so concurrent ownership changes belong in guarded Remote writes
  outside the Sync document.
- **Sync `authorize` runs synchronously:** keep principal guard bodies
  synchronous when used with Sync.
- **Server-owned creator fields:** declare fields like `ownerId` with
  `Entity.sets` so `RemoteServer.write` populates them before guards evaluate.

## Next

- Walk through sign-in and permissions end to end: [How Guard works](../../docs/guard.md)
- Connect authentication to guards: [Auth and Guard](../../docs/auth-and-guard.md)
- Declare updates and deletes with row guards: [Declared writes](../../docs/declared-writes.md)
- Run a complete guarded application: [`examples/auth`](../../examples/auth)
