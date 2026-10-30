# foldkit-guard

Checked against `foldkit-guard` 0.6.0.

A guard set is declared once, implemented on the server, attached to
Entities, and enforced by each seam through a subpath: reads and writes
(`/server`, `/drizzle`), Sync edits (`/sync`), agents (`/agent`), uploads (`/media`). The design
and its reasons are
[guard-DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/guard-DESIGN.md).

## What it owns

Who may do what, declared once in shared domain code. It owns the
declaration; the server owns the bodies and is the only place a rule is
enforced; authentication (who is asking) stays the application's, handed in
through `G.Principal`.

- **Principal guard**: `guard.principal()`. A name whose body only the server
  has (`G.implement({ isAdmin: principal => … })`), so its logic never ships
  to the client. Asked of the principal alone.
- **Row guard**: `guard.row(Entity, p => Expr…)`. A predicate over one
  Entity's fields, with the principal's fields as inputs (`p.id` is the input
  `principal.id`). Data, so the SQL compiler and `evaluate` both run it. A
  placeholder is not a value: branching on one is a type error, and so is a
  predicate that reads another Entity.

A rule is decided in two steps: each principal guard by its body, once per
request, then the row guards left over, as a condition over the row that SQL
or an evaluator runs.

## Minimal example

<!-- docs-check
import { Entity } from 'foldkit-entity'
const TodoFields = Entity.define(
  'Todo',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, projectId: Schema.String }),
)
-->

```ts
import { Option, Schema } from 'effect'
import { Expr } from 'foldkit-entity'
import { Guards, Interaction } from 'foldkit-guard'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.String,
  projectIds: Schema.Array(Schema.String),
})

// Shared code: the guards' names and the row guards' predicates.
export const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    signedIn: guard.principal(),
    isAdmin: guard.principal(),
    isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
    inProject: guard.row(TodoFields, p => Expr.in(TodoFields.fields.projectId, p.projectIds)),
  }),
  { key: user => user.id, unguarded: 'deny' },
)

// Server only: a body for every principal guard, and nothing else.
export const Policy = G.implement({
  signedIn: principal => Option.isSome(principal),
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

const Archive = Interaction.make('Archive')

export const Todo = TodoFields.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.inProject, G.isAdmin], // a disjunction
      Write: [G.isOwner], // Create, Update and Delete
    },
    interactions: {
      [Archive.key]: Guards.on([G.isAdmin], Guards.explain('Only an admin may archive.')),
    },
    members: { ownerId: { Update: [G.isAdmin] } }, // governs Create too, unless named
    always: [G.signedIn], // ANDed after every surface
  }),
)
```

`TodoFields` is an Entity with `ownerId` and `projectId` fields
([entity.md](entity.md)); `Todo` is the same Entity carrying its rules.

- The principal is a `Schema.Struct`; its fields are what row guards read.
  `Expr.in(field, p.projectIds)` is how a membership it carries reads.
- `G.implement(bodies)` must give a body to every principal guard and nothing
  else (a type error, and refused at runtime too).
- `unguarded` is required: `'deny'` refuses a surface with no rule, `'allow'`
  lets anyone.
- `policy.decide(guard, { principal, interaction, row })` is an
  `Effect<Decision>`; a visitor is `Option.none()` and passes no row guard that
  reads the principal (one over the row alone, such as `published = true`,
  holds for anyone).
  `Decision` is `boolean | { allowed: false; reason }`. `G.inputOf(user)` is
  the principal's fields as query inputs, encoded.

## Attaching

- Default refusals: a row Read is not found, a member or relation Read is
  omitted, a write is forbidden. `Guards.on(guards, Guards.redact(value))` and
  `Guards.explain(reason)` choose another.
- `Guards.all(a, b)` is a conjunction; `Guards.inherit('project')` makes a
  row's Read its `one` relation's Read; `Guards.anyone` lets anyone.
- A member the Entity lacks, a row guard over another Entity, a guard of
  another set, a mistyped redact or a misspelled interaction is a type error.
- The result is the same Entity (metadata only); attaching twice appends. It
  also declares `ReadFilter` (what the row's Read rules read), so Remote
  fetches a list, rather than placing a row it does not hold, on a change to one.
- A relation's Read rules are guards over the parent row: where they refuse,
  the relation is withheld, like a member.
- `Guards.matrix([Todo])` prints every surface; `Guards.guardFields(Todo,
  'Read')` names what a row interaction's guards read.

### Rules over who asks and over other rows

- `{ viewer: UserRow }` in `declare`'s options names the Entity each principal
  is a row of (by `key`), so a rule reads who asks:
  `guard.row(Post, () => Expr.eq(Post.relations.author, Expr.viewer(UserRow)))`
  (a `one` relation compares as the id it points at). A set without `viewer`
  refuses such a rule. `Policy.viewer(principal)` is that ref:
  `RemoteServer.make({ viewer: Policy.viewer })`.
- A rule per case of a variant Entity is a row guard over `Expr.is`
  (`guard.row(Domain, p => Expr.is(Domain, 'Available', ({ price }) =>
  Expr.lte(price, p.budget)))`): false on another case's rows.
- A row's `Read`, `Update` and `Delete` rules may reach other rows (`Expr.path`,
  `Expr.exists`, a path from the viewer); SQL reads them as stored. Update and
  Delete rules are judged in the write's statement (remote-drizzle's `writer`,
  whose `requires` the guard fills; another writer throws when guarded), a write
  changing what such a rule reads of its own row is refused, and `may` leaves
  the interaction out. `Guards.attach` refuses such a rule on `Create`, `Write`,
  a member, relation, named interaction or `always`, judged over one row.

## On the server

- Who is asking: `RemoteServer.handlers(server, G.Principal)` reads it per
  call; authentication provides it per request
  (`Effect.provideService(G.Principal, principal)`, or `foldkit-auth`'s
  resolver, [auth.md](auth.md)). The principal is an `Option`: none is a
  visitor. Give a live hub `{ key: Policy.keyOf }` (every field the rules may
  read, so a changed claim is not shared) so two requests by one person share
  a re-read. On the client, scope a cache snapshot by `G.key(user)` and
  `Data.forget` on sign-in or sign-out.
- A body may need a service (`Effect.map(Memberships, …)`). The read seams
  (`GuardDrizzle.visible`, `GuardServer.memory`, `GuardSync`) take a Policy
  needing nothing: `Policy.provide(context)` gives one, once at startup, and
  a seam built from it counts as built from `Policy` for `validate`.
  Per-request facts belong in the principal.

### Reads

- `foldkit-guard/drizzle`: `GuardDrizzle.visible(Policy, [Todo, Project])`
  gives each binding's `visible` (`bind(..., { Todo: { table, visible:
  visible.Todo } })`); an inherited Read compiles to a subquery, checked
  (listed, ruled, no loop) when built, its primitive operators against the SQL
  table passed as `{ operators }` (`bind`'s). Member and relation Reads are the Source's
  `filter`: `source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) })`.
- `foldkit-guard/server`: `...GuardServer.memory(Policy, [Todo, Project])`
  spread into `RemoteServer.memory` enforces row and member Reads, inherited
  Reads included; `GuardServer.filter(Todo, Policy)` is a Source's `filter`
  for member Reads.
- Underneath: `Policy.readable(Todo, principal)` decides every principal guard
  and returns a `Condition` over the row (`Always`, `Never`, or row guards
  joined by and/or, plus inherited Reads); `Condition.holds(condition, values,
  Policy.inputOf(principal), inherit, Policy.operators)` runs it over stored
  values, the row guards' primitive operators by the policy's table
  (`G.implement(bodies, { operators })`, `Operators.kernel` by default).
  `Condition.residual(condition, values, input, operators)` decides it as far
  as one row can, keeping the row guards that read another row (what a
  writer's `requires` then judges); `Condition.decided` reads `Always`/`Never`
  off it, and `Condition.reachedFrom(condition, { entity, id })` names what
  those guards read of the row written (a path from the viewer's, where it is
  theirs).
  `Policy.readMembers(Todo, principal, members)` gives each ruled member's
  condition and its refusal (`Omit` or `Redact`);
  `Policy.writable(Todo, principal, 'Update' | 'Create' | 'Delete' | Archive.key)`
  is `{ condition, deny }`; `Policy.writeMembers(..., 'Create' | 'Update')` and
  `Policy.linkable(Todo, principal, 'project', 'Link' | 'Unlink')` likewise.

### Writes

- Declared writes: `RemoteServer.write(EditTodo, GuardServer.writer(Todo, Policy,
  writer(Db.Todo)))` checks a declared write before it lands (row rule over
  the row as it is and, for an update, as it would be; each member's and
  relation's own, an update's member and `Link` rules also over the row after
  with that one change undone, so each change is judged given the rest of the
  write, an `Unlink` over the row before alone; a create over what it proposes, an unset field matching no
  guard), refuses as `Forbidden`, and answers as the writer now sees the row:
  a row the write hid from them in `deleted`. The binding needs `visible`.
- Who owns a new row is the Entity's to say, not the writer's:
  `Entity.sets({ ownerId: Expr.viewer(UserRow), createdAt: Expr.now }, { on: 'create' })`, and
  `RemoteServer.write` sets them before the rules run, so a rule over the owner
  holds of the creator. A create of a taken id is refused alike whatever the
  row holds; only a ledgered writer answers a retry, by its operation, with
  the row and its own time.
- Pass `revision: 'revision'` (a field stored as a number, which the writer
  moves on with each write it lands) so an update or delete lands only on the
  revision its rules were decided over, decided again if the row moved; an
  input may `expect` only that field. A change that does not move it (a
  handler, raw SQL) is not seen, unless the table carries
  `revisionTrigger(binding, 'revision')` (`foldkit-remote-drizzle`, run with its
  migration), which moves it on every other update. Without `revision`,
  `GuardServer.validate` reports an update, or a delete of an Entity something
  updates (never an insert), as an `UnpinnedWrites` diagnostic to its `diagnostics?`
  option (default: the log). With `revision` the guarded writer `pins`, so under a
  ledger a real-number increment or a computed assignment needs no `expect` of its own.
- A computed field needs its member's Update rule, and its rules judge the row
  `Write.apply` works out by the writer's table (`EntityWriter.operators`),
  which the writer writes. An operator refusing a computed value refuses the
  write with a fixed message and reports `ComputeRefused` through
  `Diagnostics.report`. A `when`, an `expect` or a computed assignment over a
  member with a Read rule is refused by the writer itself, and by `validate`
  at startup.
- An Entity's invariants (`Entity.invariant`) are not rules: the writer judges
  them after the rules, so neither grants the other, and one reading a
  Read-ruled member is refused as `Invalid` naming no invariant.
- Handlers: `GuardServer.mutation(ArchiveTodo, { entity: Todo, policy: Policy,
  interaction: Archive.key, id: input => input.id, source: source(Db.Todo) },
  ({ input, row }) => …)` checks the row's rule for that interaction over the
  row as its writer sees it before the handler runs, and reads its answer's
  rows back as the writer now sees them; what it writes is its own to check.
  An `id` answering an `Option` (`Schema.OptionFromNullOr` in the input) is
  create-or-edit: `none` is checked against `Create`.

### Checked at startup

`GuardServer.validate(Policy, { entities, domain, server })` throws for:

- a guarded Entity whose Source, or a query listing it, lacks the rule or
  filter the guard seams built for it (a hand-written Source would serve every
  row); every guarded Entity needs both;
- a declared write of a guarded Entity not landing through its
  `GuardServer.writer` (a handler cannot be checked), or one whose interaction
  has no rule under `unguarded: 'allow'` (give it one, or `[Guards.anyone]`);
- a query whose body filters or orders by a member with a Read rule, a member
  of a row it reaches through a path or an exists included: its answer would
  tell what the member hides;
- a field a Source declares `shared` when a Read rule (rows', `always`, its
  own, a relation target's) could tell its readers apart, and a Source sharing
  `may`;
- a live Source over a guarded Entity that does not read through its checked
  Source (a live hub, or `pollLive` over that Source, passes), a served query
  the domain does not declare, and a seam built from the Entity before
  `Guards.attach` (seams are matched by attachment, not name).

## `may`: a hint for the UI

`TodoFields.pipe(Guards.attach(G, { … }), Guards.may)` adds a derived member
`GuardServer.filter` answers per row (over Drizzle, bind it `derived: { may: {
supplied: true } }`). Select `may: true` and read it with
`May.can(may, Archive.key)`, `May.canSet(may, Todo, 'ownerId')`,
`May.canLink(may, Todo, 'project', 'Link')`, and `May.reason(may, 'Delete')`
(an `explain`'s sentence for a refusal, else none).

- For a row the client writes, Remote foresees it from the shared rules before
  the answer, where principal guards, the principal's fields and what the store
  lacks cannot change it; otherwise it waits for the server.
- A held `may` that says no (row `Update`/`Delete`, a written member, a
  relinked relation) has `Data.mutate` refuse the write where it is made, with
  `Forbidden`. The server leaves out of `may.row` an interaction whose rule
  reads another row, which one row cannot decide (the write's statement does),
  so it refuses nothing.
- Threat model: `may` is a UI hint; enforcement is server-only. The server
  never reads `may` from a request, so a stale, foreseen or forged yes is
  refused when written. A row the reader cannot see is read, `may` and all,
  as one that does not exist. `may` names the same keys for every reader
  (the shared declaration's); `reasons` is only an `explain`'s sentence,
  which ships in the bundle anyway: never name another person, an id, or the
  rule's logic in it. `serveFetch` answers `no-store`; SSR pages set their own
  `private, no-store`.

## Other seams

- `Me`, the visitor as an Entity: `const Me = Guards.me(G, { interactions: {
  [OpenAdmin.key]: [G.isAdmin] } })` in shared code, `GuardServer.me(Me,
  Policy)` among the server's Sources (`RemoteServer.make({ entities:
  [GuardServer.me(Me, Policy), …] })`), with `Me` left out of the rows' domain. One row, `me` (`ME`): `signedIn`, `key`
  (`Policy.key` of the principal; none for a visitor), `may`. Its Read is
  `Guards.anyone`, its writes nobody's. Read it as any row for nav links,
  "who am I", and route-level `may`; `Remote.forget` on any change of principal
  drops it. `key` is shown to its own principal: an id, never a token.
- Sync: `foldkit-guard/sync`. `GuardSync.document(ProductEdits, { readers: [G.isStaff] })`
  (refused at definition when an edit could reach a reader its rows hide it from);
  `authorize: { EditedProducts: GuardSync.authorize(Policy, Edits) }` under the
  journal's lock (principal guards only); `journalExchange({ …, opens:
  GuardSync.opens(Policy, Edits, principal), admit: GuardSync.admit(Policy, Edits,
  { principal, source, changesOf }) })` reads each edited row before the journal,
  judging the row's `Update` over it as it is and after the edits, and each changed
  member's over it as it is and after the edits with that member's own undone.
- Uploads: `foldkit-guard/media`'s `GuardMedia.uploadPolicy(Policy, { resolve, Upload: [G.isEditor],
  DescribeUrl: [G.isAdmin] })` is `foldkit-media`'s `UploadPolicy`: principal guards per route
  (any one allows; a route not named admits nobody; a row guard is a type error), for who
  `resolve` (Remote's resolver, `AuthServer.resolver`) says is asking, read from the headers
  alone. A resolver failure is a `401`, a refusal a `403`, each its kind only. `Policy` needs no
  service (`Policy.provide`).
- Agents: `foldkit-guard/agent`'s `GuardAgent.authorize(Archive.key, ({ input,
  model }) => Data.get(TodoRow, input.id).read(model))` and
  `GuardAgent.available(...)` gate a capability on the row's `may` (refused
  until it is answered; an explained refusal is the agent error's message);
  `Agent.forApplication(App).withPrincipal(G.Principal)`.

## Known traps

Met in applications on this stack: what failed, and what to do instead.

- **A Source's `read` is not what a reader may see.** The handlers apply
  `authorize` and `filter` around it, so a member's Read rule lives outside
  `read`, and a live loop that called `read` itself sent a withheld member in
  every patch while the Source passed `GuardServer.validate`. Anything that
  reads to send reads through `RemoteServer.readAs`, as `pollLive` does
  ([#264](https://github.com/doeixd/foldkit-plus/issues/264)).
- **A page render is a navigation**: the resolver that reads its principal
  needs `requests: 'navigation'`, or every signed-in page renders for a
  visitor ([auth.md](auth.md)).

Worked app: [examples/chirp](https://github.com/doeixd/foldkit-plus/tree/main/examples/chirp)'s
`src/guard.ts` (a post is written by its author or an admin), enforced in
`src/server/server.ts`.

See the [README](https://github.com/doeixd/foldkit-plus/blob/main/packages/guard/README.md).
