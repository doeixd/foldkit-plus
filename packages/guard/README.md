# foldkit-guard

Who may do what, declared once on a Foldkit Plus domain.

**Early.** This package declares a guard set, decides its guards, attaches
them to an Entity, and enforces reads: served from `RemoteServer.memory`,
through a Source's `filter`, or compiled into a Drizzle binding's `visible`.
Writes and the client's `may` hint are the next slices of
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
  `Option` of the principal; `G.key(user)` names the person, for what is
  theirs whatever their claims, such as a cache snapshot (see
  [Who is asking](#who-is-asking)).

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
- Writes are decided alike, each principal guard's body told the interaction:
  `Policy.writable(Todo, principal, 'Update')` is the row's rule for it,
  `{ condition, deny }` (`Forbidden`, or `Explain` with its sentence);
  `Policy.writeMembers(Todo, principal, members, 'Update')` each member's;
  `Policy.linkable(Todo, principal, 'project', 'Link')` a relation's, when it
  has one.

## Serving reads

`foldkit-guard/server` turns the rules into `foldkit-remote-server`'s seams.
It is a subpath, so the shared declaration the browser imports never brings
the server along.

```ts
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'

const visitor: Option.Option<typeof User.Type> = Option.none()

const Data = Remote.define({ entities: [Todo] })
const backend = RemoteServer.memory({
  domain: Data,
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
- A relation's Read rule is decided over its parent row, as a member's is:
  where it refuses, the relation is withheld. The rows it leads to are still
  narrowed by their own Read rules.
- An Entity not listed has no guards to apply and is read by everyone.
- For a Source of your own, `GuardServer.filter(Todo, Policy)` is its
  `filter`; the Source's own read must still apply the row's Read rules.

Over Drizzle, `foldkit-guard/drizzle` compiles the row's Read rules into each
binding's `visible`, which the binding applies on every path its table is
read by (by id, as a relation's target and children, counted, through a
query). Here `Todo` also has a `project` relation to a guarded `Project`,
and `todos` and `projects` are their Drizzle tables; the whole fixture, run
over SQLite, is [`test/drizzle.test.ts`](test/drizzle.test.ts):

```ts
import { GuardDrizzle } from 'foldkit-guard/drizzle'

const visible = GuardDrizzle.visible(Policy, [Todo, Project])
const Db = bind(
  { Todo, Project },
  {
    Todo: { table: todos, relations: { project: { field: todos.projectId } }, visible: visible.Todo },
    Project: { table: projects, visible: visible.Project },
  },
)
```

- Each principal guard is decided first; what is left is SQL. An inherited
  Read is `project_id in (select id from projects where …)`, the related
  table's own rule inside.
- It is checked when built, before any request: an inherited Read whose
  Entity is not listed or has no Read rule, or a loop of them, throws. An
  inherited relation must be stored as a foreign key on this table.
- The principal reaches a binding untyped, so it is checked: one that is not
  an `Option` of the set's schema is a defect, never read as a visitor.
- `visible` is the row's Read. Member and relation Reads are the Source's
  `filter`: `source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) })`.

## Serving writes

A declared write (`Mutation.write`) is served by `RemoteServer.write` with no
handler. Wrap its writer, and the write rules are checked before it lands:

```ts
import { writer } from 'foldkit-remote-drizzle'

const EditTodo = Mutation.write(
  'EditTodo',
  Write.update(Entity.input(Todo, Schema.Struct({ id: Schema.String, title: Schema.String })), {
    id: 'id',
  }),
)
RemoteServer.write(EditTodo, GuardServer.writer(Todo, Policy, writer(Db.Todo)))
```

- An update or a delete reads the row first, as its writer may see it. An
  update of a row they may not see is refused; a delete of one changes
  nothing and answers it gone, as for a row already deleted.
- The row's rule for the command must hold over the row, and an update's
  over the row as it would be after it too: a write cannot move a row out of
  its writer's reach.
- Each member the write sets needs its own `Create` or `Update` rule to
  hold, and each relation it points elsewhere its `Unlink` and `Link`.
- A create is checked over the values it proposes. A field it leaves unset
  matches no guard, not even `Expr.isNull`: the create never said it is
  empty.
- A refusal is `Forbidden`, with the sentence `Guards.explain` gave; the
  write never runs.
- The answer is read back under the binding's `visible`: the row as its
  writer may now see it, and a row the write hid from them in `deleted`, so
  the client takes it out of its lists instead of placing it.

The binding must have a `visible` rule (`GuardDrizzle.visible`'s), which is
how the writer reads a row as its writer may see it.

A client should not choose whose a new row is. `presets` sets a field from
who is asking on every create, before the rules are checked, so a rule over
it holds of the creator:

```ts
GuardServer.writer(Todo, Policy, writer(Db.Todo), { presets: { ownerId: user => user.id } })
```

The create's input leaves `ownerId` out; an input that sets it is refused as
the server's own mistake. A visitor has no one to preset from, and is refused
even where the rules would let anyone create. A preset must be a field of the
Entity, of that field's type.

A handler writes what its code writes, so it is guarded where it is defined:
`GuardServer.mutation` is `RemoteServer.mutation` with the row's rule for one
interaction checked before the handler runs.

```ts
const Archive = Interaction.make('Archive')
const ArchiveTodo = Mutation.make('ArchiveTodo', { Input: { id: Schema.String }, Output: {} })

GuardServer.mutation(
  ArchiveTodo,
  { entity: Todo, policy: Policy, interaction: Archive.key, id: input => input.id, source: source(Db.Todo) },
  ({ input, row }) => Effect.succeed({ output: {} }), // `row`: the todo, as its writer sees it
)
```

- The row `id` names is read through `source`, which must apply the
  Entity's Read rules (it is refused where it is defined otherwise); a row
  the writer may not see is refused, and the rule must hold over the rest.
- With no `id` (a create), the rule must hold of who is asking alone.
- What the handler writes is its own to check: members it sets, relations it
  points. `fields` reads more of the row for it.

## Checking a server at startup

A Source written by hand over a guarded Entity serves every row, and nothing
at request time can tell. `GuardServer.validate` looks before any request:

```ts
GuardServer.validate(Policy, { entities: [Todo], domain: Data, server: backend.server })
```

It throws, naming each, for an Entity of `entities` whose Source lacks the
rule `GuardDrizzle.visible` or `GuardServer.memory` built for it, or the
`GuardServer.filter` built for it; for a query listing such an Entity without
the rule; for a declared write of such an Entity that does not land through
the `GuardServer.writer` built for it; and for an Entity carrying another
set's guards. A rule built from another `Policy`, or for another Entity,
does not count. Every guarded Entity's Source needs both its rule and its
filter, even one with no member rules yet, so a rule attached later is
applied rather than served past. `GuardServer.memory` gives both; over
Drizzle, each Source takes its `filter`, and each binding its `visible`.

A handler (`RemoteServer.mutation`) writes what its code writes, which no
check at startup can read.

## Who is asking

Authentication decides who is asking; guards only read it. Give the handlers
`G.Principal` instead of a principal, and each call reads it, so one handler
set answers every request, and whatever authenticates a request provides it:

```ts
const handlers = RemoteServer.handlers(backend.server, G.Principal)

// per request, once authentication has resolved `principal`
RemoteServer.answer(handlers, body).pipe(Effect.provideService(G.Principal, principal))
```

A live hub shares a re-read between subscribers with one principal. Two
requests by one person each decode a principal of their own, so give the hub
`Policy.keyOf`, which names a principal by every field the rules may read (a
visitor included), and they share one:

```ts
const hub = yield* RemoteServer.liveHub([...backend.server.entities.values()], {
  key: Policy.keyOf,
})
```

Two principals with one key are read as the first of them, so a key that
named only the person (`G.key`) would read a request made after their
projects changed as an older request's claims; `Policy.keyOf` changes with
any field. On the client, a cache snapshot is scoped by the person
(`RemotePersistence`'s `scope: G.key(user)`), and a sign-in or sign-out is
`Data.forget`, since every fact the cache holds was read as someone.
