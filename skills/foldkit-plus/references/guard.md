# foldkit-guard

Early: a guard set can be declared, decided and attached to an Entity. Nothing
enforces an attachment yet: the seams that derive their checks from it
(`visible`, a Source's `authorize`, a mutation's write plan, `may`) are the
next slices of
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

- `Guards.declare(name, PrincipalSchema, guard => ({ … }), { key })` takes the
  principal as a `Schema.Struct`; its fields are what row guards read.
- `G.implement(bodies)` must give a body to every principal guard and nothing
  else (a type error, and refused at runtime too).
- `policy.decide(guard, { principal, interaction, row })` is an
  `Effect<Decision>`; a visitor is `Option.none()` and passes no row guard.
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
- `foldkit-guard/server`: `...GuardServer.memory(Policy, [Todo, Project])`
  spread into `RemoteServer.memory` enforces row and member Reads, inherited
  Reads included; `GuardServer.filter(Todo, Policy)` is a Source's `filter`
  for member Reads. The principal is an `Option` (none is a visitor).
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
  serve every row). Every guarded Entity needs both. A declared write of one
  must land through its `GuardServer.writer`; a handler cannot be checked.
- Handlers: `GuardServer.mutation(ArchiveTodo, { entity: Todo, policy: Policy,
  interaction: Archive.key, id: input => input.id, source: source(Db.Todo) },
  ({ input, row }) => …)` checks the row's rule for that interaction over the
  row as its writer sees it before the handler runs; what it writes is its
  own to check.
- Writes: `RemoteServer.write(EditTodo, GuardServer.writer(Todo, Policy,
  writer(Db.Todo)))` checks a declared write before it lands (row rule over
  the row as it is and, for an update, as it would be; each member's and
  relation's own; a create over what it proposes, an unset field matching no
  guard), refuses as `Forbidden`, and answers as the writer now sees the row:
  a row the write hid from them in `deleted`. The binding needs `visible`.
  `GuardServer.writer(Todo, Policy, writer(Db.Todo), { presets: { ownerId:
  user => user.id } })` sets a field from who is asking on create; the input
  must leave it out.
- Who is asking: `RemoteServer.handlers(server, G.Principal)` reads it per
  call; authentication provides it per request
  (`Effect.provideService(G.Principal, principal)`). Give a live hub
  `{ key: Policy.keyOf }` (every field the rules may read, so a changed claim
  is not shared) so two requests by one person share a re-read.
  Client side, scope a cache snapshot by `G.key(user)` and `Data.forget` on
  sign-in or sign-out.

See the [README](https://github.com/doeixd/foldkit-plus/blob/main/packages/guard/README.md).
