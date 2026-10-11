# foldkit-guard

Who may do what, declared once on a Foldkit Plus domain.

**Early.** This package declares a guard set, decides its guards, attaches
them to an Entity, and enforces reads served from `RemoteServer.memory` or
through a Source's `filter`. A Drizzle binding's `visible`, a mutation's
write plan and the client's `may` hint are the next slices of
[`guard-DESIGN.md`](../../docs/design/guard-DESIGN.md), which explains the
whole design and why.

## What it is

Authorization in an application is usually several callbacks, one per seam,
each with its own idea of who is asking. A guard set says it once, in the
shared domain code the client imports too, and keeps the rule's logic on the
server:

- a **principal guard** is declared by name; its body is supplied only on the
  server, so it never ships to the browser;
- a **row guard** is an `Expr` over one Entity's fields, with the principal's
  fields as inputs. It is data, so the SQL compiler and `evaluate` run it, and
  the client may hold it without learning anything a query does not.

Authentication stays the application's: it provides who is asking.

## Sixty seconds

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
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, projectId: Schema.String }),
)

// Shared: names and predicates, which are data.
const G = Guards.declare(
  'Todos',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isOwner: guard.row(TodoFields, p => Expr.eq(TodoFields.fields.ownerId, p.id)),
    inProject: guard.row(TodoFields, p => Expr.in(TodoFields.fields.projectId, p.projectIds)),
  }),
  { key: user => user.id },
)

// Server: the body of every principal guard, and nothing else.
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

Effect.runSync(
  Policy.decide(G.isOwner, {
    principal: Option.some({ id: 'ada', role: 'member', projectIds: [] }),
    interaction: 'Read',
    row: { id: 't1', ownerId: 'ada', projectId: 'p1' },
  }),
) // true
```

What each call does, and does not:

- `Guards.declare` reads nothing and stores nothing. It builds each row
  guard's predicate once, with placeholders (`p.id` is the input
  `principal.id`), and checks it reads only its Entity's fields. Branching on
  a placeholder (`p.role === 'admin'`) is a type error: there is no value yet.
- `G.implement` is the only place a body exists. A missing or extra key is a
  type error, and refused at runtime for a caller the types do not reach.
- `Policy.decide` is an `Effect` of a `Decision`: `true`, `false`, or
  `{ allowed: false, reason }` for a refusal the caller may read. A visitor
  is `Option.none()`, and passes no row guard, whose body is over a
  principal's fields.
- `G.Principal` is the server's Context key for who is asking, an
  `Option` of the principal; `G.key(user)` names a principal for grouping.

## Attaching guards to an Entity

A guard set names rules; attaching says where each one applies, per surface
(the row, a member, a relation) and per interaction:

```ts
import { Interaction } from 'foldkit-guard'

const Archive = Interaction.make('Archive')

const Todo = TodoFields.pipe(
  Guards.attach(G, {
    row: {
      Read: [G.isOwner, G.inProject, G.isAdmin],
      Write: [G.isOwner],
      [Archive.key]: Guards.on([G.isAdmin], Guards.explain('Only an admin may archive.')),
    },
    members: { ownerId: { Update: [G.isAdmin] } },
  }),
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

- A surface's list is a disjunction: "owner, or project member, or admin".
  `Guards.all(a, b)` is a conjunction as one guard. `always: [...]` is ANDed
  after every surface's list and cannot be out-voted: a tenant boundary or
  "signed in" belongs there.
- `Write` is shorthand for Create, Update and Delete. A member's `Update`
  governs setting it on creation too, unless the member names a `Create`.
- Each surface refuses its own way by default: a row Read answers not found,
  so existence does not leak; a member or relation Read omits the value; a
  write is forbidden. `Guards.on(guards, Guards.redact(value))` shows a hidden
  member as `value` instead, typed by the member's schema;
  `Guards.on(guards, Guards.explain(reason))` gives a refused write a sentence.
- `Guards.inherit('project')` makes a row's Read its `one` relation's Read.
- Every key is checked against the Entity: a member it lacks, a row guard over
  another Entity, a guard of another set, or a misspelled interaction is a type
  error where it is written.
- Attaching is metadata: the result is the same Entity (`Entity.same`), and
  attaching twice appends to each surface's list and replaces its refusal.
- `Guards.guardFields(Todo, 'Read')` names the members a row interaction's
  guards read, so a change to one is known to change who may.
- A surface with no guards on a guarded Entity falls to the set's
  `unguarded` (`'allow'` by default); the matrix prints it `open`, or
  `closed` under `unguarded: 'deny'`.

## Deciding reads

A server asks the `Policy` which rows a principal may read. Every principal
guard is decided by its body (once, however many rules name it); what is
left is a `Condition` over the row, which an interpreter runs:

```ts
import { Condition } from 'foldkit-guard'

const ada = Option.some({ id: 'ada', role: 'member' as const, projectIds: ['p1'] })
const readable = Effect.runSync(Policy.readable(Todo, ada))
// isAdmin was false, so: isOwner or inProject, over each row

Condition.holds(readable, { id: 't1', ownerId: 'ada', projectId: 'p9' }, Policy.inputOf(ada), () => false)
// true
```

- `Condition.always` and `Condition.never` are a read settled without
  looking at rows: an admin, or a visitor (who passes no row guard).
- `Condition.holds` is how an interpreter that has the rows runs it; a
  database compiles it instead. Its last argument answers an inherited Read,
  which only the caller can look up.
- `Policy.readMembers(Todo, principal, members)` decides each member's own
  Read rule, with the refusal it shows (`Omit` or `Redact`).

## Serving reads

`foldkit-guard/server` turns the rules into `foldkit-remote-server`'s seams.
It is a subpath, so the shared declaration the browser imports never brings
the server along.

```ts
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'

const visitor: Option.Option<typeof User.Type> = Option.none()

const backend = RemoteServer.memory({
  domain: Remote.define({ entities: [Todo] }),
  rows: { Todo: [{ id: 't1', ownerId: 'ada', projectId: 'p1' }] },
  principal: visitor, // reads nothing: every Read rule here needs a principal
  ...GuardServer.memory(Policy, [Todo]),
})
```

- A row its Read rules refuse is absent: from a read by id (the client reads
  it as not found), from every query, and from relations, where a `one` ref
  reads `null`. An inherited Read looks the related row up and decides it by
  its own rules; a loop of them reads as refused.
- A member its own Read rule refuses is withheld (settled, so the client
  reads it as unavailable) or shows its `redact` value. The fields the rule
  reads are read too, so it can be decided.
- An Entity not listed has no guards to apply and is read by everyone.
- For a Source of your own, `GuardServer.filter(Todo, Policy)` is its
  `filter`; the Source's own read must still apply the row's Read rules,
  which a Drizzle binding will do through `visible`.
