# foldkit-guard

A guard set is declared once, implemented on the server, attached to
Entities, and enforced by each seam through a subpath: reads and writes
(`/server`, `/drizzle`), Sync edits (`/sync`), agents (`/agent`), uploads (`/media`). The design
and its reasons are
[guard-DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/guard-DESIGN.md).

## What it owns

Who may do what, declared once in shared domain code. It owns the
declaration; the server owns the bodies; authentication (who is asking) stays
the application's, handed in through `G.Principal`.

- **Principal guard**: `guard.principal()`. A name whose body only the server
  has (`G.implement({ isAdmin: principal => … })`), so its logic never ships
  to the client. Asked of the principal alone.
- **Row guard**: `guard.row(Entity, p => Expr…)`. A predicate over one
  Entity's fields, with the principal's fields as inputs (`p.id` is the input
  `principal.id`). Data, so the SQL compiler and `evaluate` both run it. A
  placeholder is not a value: branching on one is a type error.

## Basic use

- `Guards.declare(name, PrincipalSchema, guard => ({ … }), { key, unguarded: 'deny' })` takes the
  principal as a `Schema.Struct`; its fields are what row guards read.
- `G.implement(bodies)` must give a body to every principal guard and nothing
  else (a type error, and refused at runtime too).
- `policy.decide(guard, { principal, interaction, row })` is an
  `Effect<Decision>`; a visitor is `Option.none()` and passes no row guard that
  reads the principal (one over the row alone, `isPublished`, holds for anyone).
  `Decision` is `boolean | { allowed: false; reason }`.
- `G.inputOf(user)` is the principal's fields as query inputs, encoded.
- `Expr.in(field, p.projectIds)` is how a membership the principal carries
  reads in a row guard.

## Attaching

```ts
const Archive = Interaction.make('Archive')

const Todo = TodoFields.pipe(
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

- Default refusals: a row Read is not found, a member or relation Read is
  omitted, a write is forbidden. `Guards.on(guards, Guards.redact(value))` and
  `Guards.explain(reason)` choose another.
- `Guards.all(a, b)` is a conjunction; `Guards.inherit('project')` makes a
  row's Read its `one` relation's Read.
- A member the Entity lacks, a row guard over another Entity, a guard of
  another set, a mistyped redact or a misspelled interaction is a type error.
- The result is the same Entity (metadata only); attaching twice appends. It
  also declares `ReadFilter` (what the row's Read rules read), so Remote
  fetches a list, rather than placing a row it does not hold, on a change to one.
- `Guards.matrix([Todo])` prints every surface; `Guards.guardFields(Todo,
  'Read')` names what a row interaction's guards read.

## Deciding reads (server)

- `Policy.readable(Todo, principal)` decides every principal guard and
  returns a `Condition` over the row (`Always`, `Never`, or row guards joined
  by and/or, plus inherited Reads); `Condition.holds(condition, values,
  Policy.inputOf(principal), inherit)` runs it over stored values.
- `Policy.readMembers(Todo, principal, members)` gives each ruled member's
  condition and its refusal (`Omit` or `Redact`).
- `Policy.writable(Todo, principal, 'Update' | 'Create' | 'Delete' | Archive.key)`
  is `{ condition, deny }`; `Policy.writeMembers(..., 'Create' | 'Update')` and
  `Policy.linkable(Todo, principal, 'project', 'Link' | 'Unlink')` likewise.
- A body may need a service (`Effect.map(Memberships, …)`). The read seams
  (`GuardDrizzle.visible`, `GuardServer.memory`, `GuardSync`) take a Policy
  needing nothing: `Policy.provide(context)` gives one, once at startup, and
  a seam built from it counts as built from `Policy` for `validate`.
  Per-request facts belong in the principal.
- `foldkit-guard/server`: `...GuardServer.memory(Policy, [Todo, Project])`
  spread into `RemoteServer.memory` enforces row and member Reads, inherited
  Reads included; `GuardServer.filter(Todo, Policy)` is a Source's `filter`
  for member Reads. The principal is an `Option` (none is a visitor).
  `GuardServer.me(Me, Policy)` goes in the same call's `entities`, with `Me`
  left out of the rows' domain.
- `foldkit-guard/drizzle`: `GuardDrizzle.visible(Policy, [Todo, Project])`
  gives each binding's `visible` (`bind(..., { Todo: { table, visible:
  visible.Todo } })`); an inherited Read compiles to a subquery, checked
  (listed, ruled, no loop) when built. Member and relation Reads are the Source's
  `filter`: `source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) })`.
- A relation's Read rules are guards over the parent row: where they refuse,
  the relation is withheld, like a member.
- `GuardServer.validate(Policy, { entities, domain, server })` at startup
  throws for a guarded Entity whose Source, or a query listing it, lacks the
  rule or filter the guard seams built for it (a hand-written Source would
  serve every row). Every guarded Entity needs both. A query whose body
  filters or orders by a member with a Read rule is refused too: its answer
  would tell what the member hides. A declared write of one
  must land through its `GuardServer.writer`; a handler cannot be checked. A
  field a Source declares `shared` is refused when a Read rule (rows',
  `always`, its own, a relation target's) could tell its readers apart. So are
  a hand-written live Source over a guarded Entity (use a live hub), a served
  query the domain does not declare, and a seam built from the Entity before
  `Guards.attach` (seams are matched by attachment, not name).
- Handlers: `GuardServer.mutation(ArchiveTodo, { entity: Todo, policy: Policy,
  interaction: Archive.key, id: input => input.id, source: source(Db.Todo) },
  ({ input, row }) => …)` checks the row's rule for that interaction over the
  row as its writer sees it before the handler runs, and reads its answer's
  rows back as the writer now sees them; what it writes is its own to check.
  An `id` answering an `Option` (`Schema.OptionFromNullOr` in the input) is
  create-or-edit: `none` is checked against `Create`.
- Writes: `RemoteServer.write(EditTodo, GuardServer.writer(Todo, Policy,
  writer(Db.Todo)))` checks a declared write before it lands (row rule over
  the row as it is and, for an update, as it would be; each member's and
  relation's own; a create over what it proposes, an unset field matching no
  guard), refuses as `Forbidden`, and answers as the writer now sees the row:
  a row the write hid from them in `deleted`. The binding needs `visible`.
  `GuardServer.writer(Todo, Policy, writer(Db.Todo), { presets: { ownerId:
  user => user.id } })` sets a field from who is asking on create; the input
  must leave it out. Pass `revision: 'revision'` (a field stored as a number,
  which the writer moves on with each write it lands) so an update or delete
  lands only on the revision its rules were decided over, decided again if the
  row moved; an input may `expect` only that field. A change that does not move
  it (a handler, raw SQL) is not seen; without `revision`, none is, and
  `GuardServer.validate` warns. A `when` or `expect` over a member with a Read
  rule is refused by the writer itself, and by `validate` at startup.
- `may`: `TodoFields.pipe(Guards.attach(G, { … }), Guards.may)` adds a derived
  member `GuardServer.filter` answers per row (over Drizzle, bind it
  `derived: { may: { supplied: true } }`); select `may: true` and read it with
  `May.can(may, Archive.key)`, `May.canSet(may, Todo, 'ownerId')`,
  `May.canLink(may, Todo, 'project', 'Link')`, and `May.reason(may, 'Delete')`
  (an `explain`'s sentence for a refusal, else none). A hint, never the check.
- `Me`, the visitor as an Entity: `const Me = Guards.me(G, { interactions: {
  [OpenAdmin.key]: [G.isAdmin] } })` in shared code, `GuardServer.me(Me,
  Policy)` among the Sources. One row, `me` (`ME`): `signedIn`, `key`
  (`Policy.key` of the principal; none for a visitor), `may`. Its Read is
  `Guards.anyone`, its writes nobody's. Read it as any row for nav links,
  "who am I", and route-level `may`; `Remote.forget` on any change of principal
  drops it.
- Sync: `foldkit-guard/sync`. `GuardSync.document(ProductEdits, { readers: [G.isStaff] })`
  (refused at definition when an edit could reach a reader its rows hide it from);
  `authorize: { EditedProducts: GuardSync.authorize(Policy, Edits) }` under the
  journal's lock (principal guards only); `journalExchange({ …, opens:
  GuardSync.opens(Policy, Edits, principal), admit: GuardSync.admit(Policy, Edits,
  { principal, source, changesOf }) })` reads each edited row before the journal.
- Uploads: `foldkit-guard/media`'s `GuardMedia.uploadPolicy(Policy, { resolve, Upload: [G.isEditor],
  DescribeUrl: [G.isAdmin] })` is `foldkit-media`'s `UploadPolicy`: principal guards per route
  (any one allows; a route not named admits nobody; a row guard is a type error), for who
  `resolve` (Remote's resolver, `AuthServer.resolver`) says is asking, read from the headers
  alone. A resolver failure is a `401`, a refusal a `403`, each its kind only. `Policy` needs no
  service (`Policy.provide`).
- Agents: `foldkit-guard/agent`'s `GuardAgent.authorize(Archive.key, ({ input,
  model }) => Data.get(TodoRow, input.id).read(model))` and
  `GuardAgent.available(...)` gate a capability on the row's `may` (refused
  until it is answered; an explained refusal is the agent error's message); `Agent.forApplication(App).withPrincipal(G.Principal)`.
- Who is asking: `RemoteServer.handlers(server, G.Principal)` reads it per
  call; authentication provides it per request
  (`Effect.provideService(G.Principal, principal)`). Give a live hub
  `{ key: Policy.keyOf }` (every field the rules may read, so a changed claim
  is not shared) so two requests by one person share a re-read.
  Client side, scope a cache snapshot by `G.key(user)` and `Data.forget` on
  sign-in or sign-out.

See the [README](https://github.com/doeixd/foldkit-plus/blob/main/packages/guard/README.md).
