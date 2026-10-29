# foldkit-guard

Who may do what, declared once on a Foldkit Plus domain, and enforced on every
path a row is read or written by.

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

## What it owns, and what it does not

| Fact | Owner |
| --- | --- |
| Who is asking | your authentication, which provides it as `G.Principal` |
| Who may do what | the guard set: declared once, in the shared domain code |
| A principal guard's body | `G.implement`, on the server only |
| Which rows a read returns | each binding's `visible`, compiled from the rules |
| Enforcement | each seam of `foldkit-remote-server`, `-drizzle` and `foldkit-sync`, through this package's subpaths |
| What a client shows as allowed | the server's `may` answer, foreseen by the client for a row it writes |

It does not authenticate, and it does not trust the client: a hint the client
reads (`may`) is the server's answer, or the client's reading of the shared
rules for a row it just wrote, and the server checks every write again when
it is made.

## Mental model

```text
shared (client and server)               server only
Guards.declare  names and Exprs          G.implement  principal guards' bodies ──> Policy
Guards.attach   the rules on an Entity
        │
        └─> every seam reads the same rules, decided by the same Policy:
              reads     GuardDrizzle.visible, GuardServer.memory    which rows
                        GuardServer.filter                          members, relations, may
              writes    GuardServer.writer, GuardServer.mutation    checked before, read back after
              Sync      GuardSync.authorize, admit, opens           edits through the journal
              agents    GuardAgent                                  reads may
              startup   GuardServer.validate                        every guarded Source is guarded
```

A rule is decided in two steps: each principal guard by its body, once per
request, then what is left, row guards, as a condition over the row that SQL
or an evaluator runs. That split is why row guards are data and principal
guards are names.

## Install

```sh
pnpm add effect foldkit-entity foldkit-guard
```

`foldkit-guard` is the shared declaration. Its subpaths bring their packages
as optional peers: `foldkit-guard/server` needs `foldkit-remote` and
`foldkit-remote-server`, `/drizzle` also `foldkit-remote-drizzle` and
`drizzle-orm`, `/sync` `foldkit-sync` and `foldkit-remote-server`,
`/agent` `foldkit-remote`, and `/media` `foldkit-media`.

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
  Schema.Struct({
    id: Schema.String,
    ownerId: Schema.String,
    projectId: Schema.String,
    title: Schema.String,
  }),
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
  { key: user => user.id, unguarded: 'deny' },
)

// Server: the body of every principal guard, and nothing else. A row guard
// calling a primitive operator runs it by the table given as a second argument,
// `G.implement(bodies, { operators })`; `Operators.kernel` when not given.
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

Effect.runSync(
  Policy.decide(G.isOwner, {
    principal: Option.some({ id: 'ada', role: 'member', projectIds: [] }),
    interaction: 'Read',
    row: { id: 't1', ownerId: 'ada', projectId: 'p1', title: 'Write the README' },
  }),
) // true
```

What each call does, and does not:

- `Guards.declare` reads nothing and stores nothing. It builds each row
  guard's predicate once, with placeholders (`p.id` is the input
  `principal.id`), and checks it reads only its Entity's fields. Branching on
  a placeholder (`p.role === 'admin'`) is a type error: there is no value yet.
- A row guard may compare a `one` relation itself, the id it points at
  (`guard.row(Like, p => Expr.eq(Like.relations.user, p.id))`), so no field
  repeats the link. SQL reads the relation's column; a rule judged over a
  row a Source read, whose link is a ref key (`'User:ada'`), reads the id.
- A set that names the Entity its principals are rows of (`{ viewer: User }`,
  each by `key`) lets a rule read who asks:
  `guard.row(Like, () => Expr.eq(Like.relations.user, Expr.viewer(User)))`.
  `Policy.viewer(principal)` is that row's ref, the server's one viewer:
  `RemoteServer.make({ viewer: Policy.viewer })`. A rule over `Expr.viewer`
  in a set without one, or over `Expr.now`, is refused where it is declared.
- A row's `Read`, `Update` and `Delete` rules may reach another row
  (`Expr.path`, `Expr.exists`, a path from the viewer: `Expr.eq(Note.fields.orgId,
  orgOfViewer)`). A Read rule compiles to SQL, which reads the rows it reaches
  as stored: the rule is the server's decision, as a principal guard's body is.
  An Update or Delete rule is judged in the write's own statement
  (`update … where … and <rule>`): `GuardServer.writer` judges what the row
  alone decides in memory and hands the rest to its writer as `requires`,
  which remote-drizzle's `writer` holds the row to, refusing with `Forbidden`
  (and the `explain`) where it fails. So the rule reads the other row as the
  write lands. Such a rule is judged over the row as stored, so a write that
  would change what it reads of its own row (its fields, the relation its path
  leaves by) is refused; `may` leaves such an interaction unanswered, since one
  row cannot decide it; and `GuardServer.writer` over a writer without
  `requires` throws where it is made. Every other surface (`Create`, `Write`,
  a member, a relation, a named interaction, `always`) is judged over one row
  in memory, so `Guards.attach` refuses such a rule there.
- `G.implement` is the only place a body exists. A missing or extra key is a
  type error, and refused at runtime for a caller the types do not reach.
- `Policy.decide` is an `Effect` of a `Decision`: `true`, `false`, or
  `{ allowed: false, reason }` for a refusal the caller may read. A visitor
  is `Option.none()`, and passes no row guard that reads a principal's
  fields; one over the row alone (`isPublished`) holds for a visitor too.
- `G.Principal` is the server's Context key for who is asking, an
  `Option` of the principal; `G.key(user)` names the person, for what is
  theirs whatever their claims, such as a cache snapshot (see
  [Who is asking](#who-is-asking)).

## Attaching guards to an Entity

A guard set names rules; attaching says where each one applies, per surface
(the row, a member, a relation) and per interaction. Here a todo also has a
relation, `project`, which a client follows to its `Project`; it is stored as
the same `projectId` the row guard reads, and `Project` has no guards, so
anyone may read one:

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
  Guards.may, // the server's answer to what a reader may do: see What the client may do
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
- `Write` is shorthand for Create, Update and Delete. Beside it, a slot of its
  own (`Delete`) adds its rules to Write's, and its refusal replaces Write's,
  whichever is written first. A member's `Update` governs setting it on
  creation too, unless the member names a `Create`.
- An interaction the application names (`Interaction.make('Archive')`) is
  the row's, under `interactions`, keyed by `[Archive.key]`, so a misspelling
  is a type error. Only a Read inherits.
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
  `unguarded`, which `declare` requires so the choice is written down:
  `'deny'` refuses it (the matrix prints `closed`), `'allow'` lets everyone
  (`open`).

## Deciding reads and writes

A server asks the `Policy` which rows a principal may read. Every principal
guard is decided by its body (once, however many rules name it); what is
left is a `Condition` over the row, which an interpreter runs:

```ts
import { Condition } from 'foldkit-guard'

const ada = Option.some({ id: 'ada', role: 'member' as const, projectIds: ['p1'] })
const readable = Effect.runSync(Policy.readable(Todo, ada))
// isAdmin was false, so: isOwner or inProject, over each row

const t1 = { id: 't1', ownerId: 'ada', projectId: 'p9', title: 'Write the README' }
Condition.holds(readable, t1, Policy.inputOf(ada), () => false, Policy.operators)
// true
```

- `Condition.always` and `Condition.never` are a read settled without
  looking at rows: an admin, or a visitor whose rules all read the principal.
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
- A Source of your own cannot be shown to apply the row's Read rules:
  `GuardServer.validate` refuses one, as it refuses a `RemoteServer.entity`
  without `GuardServer.memory`'s or `GuardDrizzle.visible`'s rule. Serve a
  guarded Entity through one of those.

Over Drizzle, `foldkit-guard/drizzle` compiles the row's Read rules into each
binding's `visible`, which the binding applies on every path its table is
read by (by id, as a relation's target and children, counted, through a
query). Here `todos` and `projects` are your Drizzle tables for `Todo` and
`Project`; a fixture with a guarded `Project` too, run over SQLite, is
[`test/drizzle.test.ts`](test/drizzle.test.ts):

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
      derived: { may: { supplied: true } }, // not a column: `GuardServer.filter` answers it
      visible: visible.Todo,
    },
    Project: { table: projects },
  },
)
const TodoSource = source(Db.Todo, { filter: GuardServer.filter(Todo, Policy) })
```

- Each principal guard is decided first; what is left is SQL. An inherited
  Read is `project_id in (select id from projects where …)`, the related
  table's own rule inside.
- It is checked when built, before any request: an inherited Read whose
  Entity is not listed or has no Read rule, or a loop of them, throws. An
  inherited relation must be stored as a foreign key on this table; one that
  is not fails its first read, which is when the binding is first known.
- The principal reaches a binding untyped, so it is checked: one that is not
  an `Option` of the set's schema is a defect, never read as a visitor.
- A rule calling a primitive operator compiles by the SQL table `bind` is
  given, and is checked when built against the one passed here
  (`GuardDrizzle.visible(Policy, [Todo], { operators })`, the kernel when not
  given), since `visible` is built before `bind`.
- `visible` is the row's Read. Member and relation Reads are the Source's
  `filter`, as `TodoSource` has it.

A body may need a service, a membership lookup say, and name it in its
Effect. The read seams (`GuardDrizzle.visible`, `GuardServer.memory`,
`GuardSync`) take a Policy that needs nothing more, since a read rule runs
inside a read whose requirements are the Source's. Provide the services once,
at startup; what changes with each request belongs in the principal:

```ts
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
GuardDrizzle.visible(ReadPolicy, [Todo]) // a type error with `Checked`
```

A seam built from `ReadPolicy` counts as built from `Checked`, so
`GuardServer.validate(Checked, …)` accepts it: `validate` checks that a seam
runs the declared rules, not which services they were given. The write seams take the
Policy as it is and require its services where the write runs.

## Serving writes

A declared write (`Mutation.write`) is served by `RemoteServer.write` with no
handler (the [declared writes guide](../../docs/declared-writes.md) shows the
whole path, client to statement). Wrap its writer, and the write rules are checked before it lands:

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

- An update or a delete reads the row first, as its writer may see it. An
  update of a row they may not see is refused; a delete of one changes
  nothing and answers it gone, as for a row already deleted.
- The row's rule for the command must hold over the row, and an update's
  over the row as it would be after it too: a write cannot move a row out of
  its writer's reach.
- Each member the write sets needs its own `Create` or `Update` rule to
  hold, and each relation it points elsewhere its `Unlink` and `Link`. An
  update's member and `Link` rules hold over the row before and over the
  row after with that one change undone: every other member's new value
  and link, and this member's old value (or the relation pointing where it
  did). So each change must be allowed given everything else the write does:
  a write cannot set together what each change alone would be refused, and a
  rule that reads its own member ("change `status` only while it is
  `draft`") still allows the change it exists for. An increment or a
  computed assignment to a member is that member's change; a value computed
  from a member reads the row before, as the statement does. `Unlink` holds
  over the row before alone. What
  a relation was linked to is read as stored (the writer's `linked`), since a
  link to a row hidden from its writer reads to them as none; a writer that
  cannot say treats every link it sees as none as one that may be there, so
  changing it needs `Unlink` too.
- A create is checked over the values it proposes. A guard that reads a field
  it leaves unset does not hold, whatever it asks (`isNull` and `isNotNull`
  alike): the create never said what the field holds.
- A refusal is `Forbidden`, with the sentence `Guards.explain` gave; the
  write never runs.
- The answer is read back under the binding's `visible` and the Entity's
  member Read rules: the row as its writer may now see it, with no more
  fields than the write set, and a row the write hid from them in `deleted`,
  so the client takes it out of its lists instead of placing it.

Reading the row and writing it are two statements, so another write can land
between the check and the write. Name a revision, a field stored as a number
that the writer moves on by one with every write it lands, and the guard closes
that window for every write that moves it: for an Entity with
a `revision` field, `GuardServer.writer(Todo, Policy, writer(Db.Todo), {
revision: 'revision' })`. Every update and delete then lands only on the
revision its rules were decided over (the writer's `expect`, one compare and
set statement). If the row moved after the check, it is decided again over
the row as it now is, up to three times, then fails with "changed while it
was written"; nothing is written over a version no rule saw. An input that
`expect`s a revision the row is not at is a `Conflict`, decided before any
rule, and not retried. An input may expect only the revision the writer pins:
one expecting another field is refused, at startup by `GuardServer.validate`
and at run time, since the pin would leave that field where it was. A writer
with no `revision` keeps the window, and `GuardServer.validate` reports each
write through one that a change can come between, as an `UnpinnedWrites`
[diagnostic](#diagnostics): an update, or a delete of
an Entity the server also updates. An insert has no row before it, so an
Entity that is only inserted and deleted needs no revision.

A declared write's `when` (`foldkit-entity`) is the writer's to check, in the
statement that writes; the guarded writer passes it through and speaks first.
The order is: a row hidden from the writer, then a rule that does not hold
(both `Forbidden`), then a stale input revision (`Conflict`), then the
precondition (`Unmet`). So `Unmet` reaches only someone the rules let write the
row. A precondition, or an expected revision, over a member with a Read rule
would still answer for that member (Unmet or written, Conflict or not), so the
guarded writer refuses such a write before any rule, whether or not
`GuardServer.validate` ran; `validate` refuses it at startup too, as it refuses
a query body that filters by such a member. A pinned write that is unmet is not
decided again: the row did not move, it does not hold.

A declared write's `increment` is the writer's to add, in the statement that
writes. The guard requires each incremented member's Update rule, as for a
member it sets, and holds the row's rules over the sum the writer will store, so
a rule `stock >= 0` refuses a sale past zero. The row the guard summed over must
be the row the writer writes: the input's expected revision keeps it so, or the
writer's `revision` pin. An increment with neither is refused. A computed
assignment is the same: its member's Update rule holds, the guard reads what it
computes from, and judges the row `Write.apply` works out by the writer's own
table (`EntityWriter.operators`, the binding's for the Drizzle writer), which is
the row the writer writes; one it cannot work out is refused, never judged as
it was, with a fixed message, and the operator's own refusal is reported as
`ComputeRefused`. With a `revision` the guarded writer `pins`, so under a ledger a
real-number increment or a computed assignment needs no `expect` of its own (no
writer lands one without either); `validate`
refuses one computed from a member with a Read rule, which its answer would
disclose.

An Entity's invariants (`Entity.invariant`) are the writer's to judge, over the
row its statement writes; the guarded writer passes them through and speaks
first. They are not rules, and are never one of a command's alternatives:
`Update: [isOwner, isManager]` says who may, and an invariant says what every
row must hold whoever writes it, so being allowed does not make a row valid and
a valid row does not make anyone allowed. `Invalid` reaches only someone the
rules let write the row. An invariant that reads the row before (a transition
invariant) is the same: the writer's, after the rules. An invariant that reads a member with
a Read rule is enforced all the same, but its refusal names no invariant and no path ("The row
would be invalid"), since naming it would say what that member holds.

Over a writer with a ledger (`foldkit-remote-drizzle`'s `writer(binding, {
ledger })`), a retry of an operation that landed is answered from the ledger,
before any rule: it was decided when it landed, and deciding it again over a row
that has moved since could refuse a write that happened. A new operation is
decided as any write is.

The binding must have a `visible` rule, which is how the writer reads a row
as its writer may see it; the writer refuses one without. That the rule is
`GuardDrizzle.visible`'s is what `GuardServer.validate` checks of the
Entity's Source, so give the writer that Source's binding.

A client should not choose whose a new row is. The Entity says which fields
the write's context sets (`Entity.sets` in `foldkit-entity`), and
`RemoteServer.write` sets them before the guarded writer checks the create or
the update, so a rule over them holds of the creator: with
`Entity.sets({ ownerId: Expr.viewer(UserRow) }, { on: 'create' })` added to the
`Todo` above (`UserRow` the Entity a principal is a row of), a todo is its
creator's, and `RemoteServer.make({ viewer })` says who that is. A member rule
over such a member judges the server's value like any other: declare none there.

No input may set `ownerId`, which is refused where the write is declared. A
visitor is no one to set, and is refused even where the rules would let
anyone create. A create of an id already taken is refused with one answer,
whatever the row there holds, so it tells nothing the asker may not read. Only
the writer's ledger recognises a retry, by its operation and who asked, and
answers it with its row, first time kept; the same id from another account is
refused.

A handler writes what its code writes, so it is guarded where it is defined:
`GuardServer.mutation` is `RemoteServer.mutation` with the row's rule for one
interaction checked before the handler runs.

```ts
const ArchiveTodo = Mutation.make('ArchiveTodo', { Input: { id: Schema.String }, Output: {} })

GuardServer.mutation(
  ArchiveTodo,
  { entity: Todo, policy: Policy, interaction: Archive.key, id: input => input.id, source: TodoSource },
  ({ input, row }) => Effect.succeed({ output: {} }), // `row`: the todo, as its writer sees it
)
```

- The row `id` names is read through `source`, which must apply the
  Entity's Read rules (it is refused where it is defined otherwise); a row
  the writer may not see is refused, and the rule must hold over the rest.
- With no `id` (a create), the rule must hold of who is asking alone. An
  `id` that answers an `Option` serves create and edit in one mutation (one
  `Crud.editor` for both): `Option.none()` is a create, checked against the
  row's `Create` rule.
- What the handler writes is its own to check: members it sets, relations it
  points. `fields` reads more of the row for it.
- Each row of the Entity its answer carries is read back through `source`,
  its `authorize` and `filter` applied, as a declared write's is: the answer
  shows the writer only what they may now see of the fields it named, and a
  row the handler hid from them answers as deleted.

## Checking a server at startup

A Source written by hand over a guarded Entity serves every row, and nothing
at request time can tell. `GuardServer.validate` looks before any request:

```ts
GuardServer.validate(Policy, { entities: [Todo], domain: Data, server: backend.server })
```

It throws, naming each:

- for an Entity of `entities` whose Source lacks the rule `GuardDrizzle.visible`
  or `GuardServer.memory` built for it, or the `GuardServer.filter` built for
  it;
- for a query listing such an Entity without the rule, and a query the server
  serves that the domain does not declare, whose Entity no one can name;
- for a query whose body filters or orders by a member with a Read rule. A
  row comes back without that member, but the query still answers for it: a
  `cost < $max` halved twenty times reads the cost the row hid. This holds
  whoever asks, since one body serves every principal. Where some readers
  must filter by it, give the value an Entity of its own with a row Read
  rule: a row a reader may not see is not in their list at all. A member of
  another row the body reaches counts too (each relation a path, a path from
  the viewer or an exists follows, the field it ends at, an exists' filter):
  SQL reads a reached row under its `visible` rule, never its members';
- for a declared write of such an Entity that does not land through the
  `GuardServer.writer` built for it, and for one whose interaction (`Create`
  for an insert, `Update`, `Delete`) has no rule under `unguarded: 'allow'`,
  which would let anyone make it: give it a rule, or `[Guards.anyone]` to say
  that anyone may;
- for a live Source over such an Entity that does not read through the Source
  checked here: `pollLive` over that Source names it (`LiveSource.reads`) and
  passes, as a live hub does; a hand-written stream, or a `pollLive` over
  another Source, is refused;
- for an Entity carrying another set's guards;
- for a field its Source declares `shared` (sent to every live subscriber as
  written) when a Read rule could tell readers apart: the rows', `always`, the
  field's own, or, for a relation, its target rows', a target not among
  `entities` included; and for `may` declared `shared`, which is each
  reader's own whoever may read the row.

A rule built from another `Policy`, for another Entity, or for this one before
its guards were attached does not count. Every guarded Entity's Source needs both its rule and its
filter, even one with no member rules yet, so a rule attached later is
applied rather than served past. `GuardServer.memory` gives both; over
Drizzle, each Source takes its `filter`, and each binding its `visible`.

A handler (`RemoteServer.mutation`) writes what its code writes, which no
check at startup can read.

## Diagnostics

Two things a guarded server goes past without failing are reported through
`foldkit-surface`'s `Diagnostics` channel (re-exported by `foldkit-remote`),
by default Effect's log:

| `_tag` | `level` | When |
| --- | --- | --- |
| `ComputeRefused` | `error` | An operator refused to work out a value a guarded write computes (text holding NUL, an implementation that throws). The write was refused with a fixed message; this carries the operator's `error`. |
| `UnpinnedWrites` | `warning` | `GuardServer.validate` found `mutations` writing through a writer with no `revision` that a change can come between. |

`ComputeRefused` is reported inside the write, so the reporter the server
runs with applies (`serveFetch`'s `diagnostics`, or
`Layer.succeed(Diagnostics.Reporter, report)` in its layer).
`GuardServer.validate` runs before any Effect of the server's, so it takes
the reporter as an option, `diagnostics`, beside `entities`, `domain` and
`server`. In a test, pass `Diagnostics.collect().report` and assert on
`reported`.

## Who is asking

Authentication decides who is asking; guards only read it. Give the handlers
`G.Principal` instead of a principal, and each call reads it, so one handler
set answers every request, and whatever authenticates a request provides it:

```ts
const handlers = RemoteServer.handlers(backend.server, G.Principal)

// per request: `body` is what it sent, and authentication resolved `principal`
RemoteServer.answer(handlers, body).pipe(Effect.provideService(G.Principal, principal))
```

A live hub shares a re-read between subscribers with one principal. Two
requests by one person each decode a principal of their own, so give the hub
`Policy.keyOf`, which names a principal by every field, as JSON keeps it (a
set, a bigint, a date included; a visitor too), and they share one:

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
`Remote.forget` (`forget` on a domain made with `Remote.make`), since every
fact the cache holds was read as someone.

## What the client may do

The client has no principal guard's body and none of the principal's fields,
and it is not where a write is checked. To grey out a button for the reason
the server would refuse it, it reads the server's answer: `Guards.may` adds a
derived member, `may`, which `GuardServer.filter` answers from the row as its
reader sees it. `Todo` above is piped through it after its guards, and over
Drizzle its binding marks it `supplied`, since it is not a column.

For a row the client writes, which the server has not answered yet, Remote
foresees `may` from the same rules (`Derived.make`'s `predict`): a row guard
over the row, its links and `Expr.viewer` is judged over what the store holds;
a principal guard, a rule over the principal's fields, and one over a row or
field the store lacks are unknown. Every rule is an `or` of `and`s with no
negation, so it is decided where it comes out the same with every unknown part
taken to hold and taken not to. `may` is foreseen only when every part of it
is, so a new post's Edit shows at once where its author's rule allows it, and
nothing is shown where an admin's body would decide.

A held `may` also refuses a write where it is made (`Derived.make`'s
`forbids`): `Data.mutate` of an update whose row's `may.row.Update` is `false`,
or whose written member or relinked relation reads `false`, or of a delete
whose `Delete` does, is refused at once with `Forbidden` and the `explain` as
`reason`, as the server would refuse it. Each is judged over the row before the
write, which is where the server's writer judges it first.

```ts
import { May } from 'foldkit-guard'

// Select it as any member, and read it with `May`; `row` is a Todo read through `Row`.
const Row = Entity.select(Todo, { title: true, may: true })
May.can(row.may, Archive.key) // the row's rule for Archive
May.canSet(row.may, Todo, 'ownerId') // the row's Update, and ownerId's own
May.canLink(row.may, Todo, 'project', 'Link')
```

- It answers the row's `Update`, `Delete` and each named interaction, each
  member with its own `Update` rule, and each relation with a `Link` or
  `Unlink` rule, all held over the row as a write's check would hold them
  over it as it is.
- A member or relation without its own rule follows the row's `Update`; an
  interaction the answer does not name reads `false`.
- `May.reason(row.may, 'Delete')` is the sentence an `explain` gave a
  refusal, `Option.none()` where the interaction is allowed or was refused
  without one: as for a write, only an `explain` says why.
- It is a hint, read when the row was: a live patch of the fields its rules
  read does not answer it again, so it is stale until the row is read again.
  The write is checked when it is made, whatever `may` said.
- A Source without the filter does not answer it: the client reads it as
  unavailable.
- `foldkit-crud`'s editor locks the keys the reader may not set with
  `locks: May.locks(Todo)`, for `foldkit-mixins-form`'s `locked`.

### What `may` tells a reader, and what it does not

`may` is a UI hint; enforcement is on the server only. Every write is checked
when it is made, by the rules, whatever the client holds or sends: the server
never reads a `may` from a request, and a `may` that says yes (stale after a
change of role, foreseen, or edited in the page's cache) changes nothing it
decides. These hold, each tested against the real handlers (the audit is
#284):

- **No existence oracle.** A row its reader may not see is not read, `may`
  included: the answer is the one for an id that does not exist. A write to
  it is refused as a write to a missing row is (`Forbidden`, or for a delete,
  answered gone).
- **Its shape is the shared declaration's.** `may` names the same
  interactions, members and relations for every reader and row: those the
  Entity's attachment rules, which the browser bundle carries already. Only
  the booleans are the reader's, and they say what the reader may do, never
  why another may. There is no option to leave a member out, since its name
  is public in the declaration anyway; a fact the reader should not learn
  belongs in a principal guard's body, which never leaves the server.
- **A reason is the declaration's sentence.** `reasons` holds only an
  `explain`'s text, for an interaction refused to this reader; a plain refusal
  says nothing. The text is a constant of shared code, so it ships in the
  bundle whether or not it is sent: write it for the reader, never naming
  another person, an id, or how the rule decides. No type or lint rule checks
  wording, so this one is review's.
- **One reader's answer is no one else's.** `GuardServer.validate` refuses a
  Source that shares `may` with every live subscriber, and `serveFetch`
  answers every request `cache-control: no-store`. Pages that render a
  reader's rows into HTML (`foldkit-ssr`) send their own `private, no-store`
  through the entry's `headers`, and a client changing principal calls
  `Remote.forget`.
- **A foreseen `may` is never sent.** What the client foresees for a row it
  wrote is shown until the server's answer replaces it; a write's input is its
  Mutation's, and `may` is not in it.

## Who the client is: `Me`

"Show the Admin link", "show a sign-in page rather than a 404" and "who am
I signed in as" are questions about the visitor, not about a row.
`Guards.me` declares them as one Entity with one row, `me`: everyone reads
their own and no one writes it. It holds `signedIn`, `key` (the principal's
`key`, `Option.none()` for a visitor) and `may` for the interactions named
here; `GuardServer.me` serves it, deciding `may` with the Policy.

```ts
const OpenAdmin = Interaction.make('OpenAdmin')

// Shared domain code, beside the other Entities.
export const Me = Guards.me(G, {
  interactions: { [OpenAdmin.key]: [G.isAdmin] },
})

// The server: one Source among the others.
const MeSource = GuardServer.me(Me, Policy)
```

- The client reads `Me` through Remote like any row (`Entity.select(Me,
  { signedIn: true, key: true, may: true })`), so it is `Loading`, `Ready`
  or stale as data is, survives SSR, and `Remote.forget` on any change of
  principal (a sign-in as much as a sign-out) drops it. `May.can(me.may, OpenAdmin.key)` is the server's answer; no rule runs
  on the client.
- Its Read is `Guards.anyone`, whatever the set leaves `unguarded`, and its
  writes are nobody's, as the matrix prints them. `Guards.anyone` serves any
  surface that is public under a set that denies the rest: a Read of it
  restricts no one, so a Sync document over its rows needs no readers and
  `validate` lets a Source share them.
- `may` is read with the row, as any `may` is: a principal whose role
  changes sees it when `Me` is read again.
- `key` is the set's `key` of the principal, shown to that principal: make it
  an id, never a session token or anything secret. `Me` is answered per
  request, shares nothing with live subscribers, and goes out under
  `serveFetch`'s `no-store`.

## When a rule refuses

| Cause | Server | Client |
| --- | --- | --- |
| A row's Read refused | not returned, not settled | not found; a tombstone |
| A member's Read refused (`omit`) | the field settled, unread | that field `Unavailable` |
| A member's Read refused (`redact`) | the replacement value | `Ready` with it, by design indistinguishable |
| A relation's Read refused | withheld, as a member's | unavailable |
| A write refused | `Forbidden`, a 403 over JSON | `Data.mutation` is `Failed` with `_tag: 'Forbidden'`, `reason` from an `explain` |
| A write moved a row out of its writer's sight | answered in `deleted` | tombstoned; it leaves every list |
| A delete of a row its writer cannot see | nothing deleted; answered gone | tombstoned |
| A Sync edit refused | rejected by its id, with its reason | the replica drops it, with the reason |
| An agent's capability refused | — | `AgentAuthorizationError` before dispatch, its message an `explain`'s; not offered while `available` says no |
| A Source left unguarded | `GuardServer.validate` throws at startup | — |

A refusal says why only through `Guards.explain`: a plain one is `forbidden`,
so a probing caller learns only "no", and a row a principal may not read is
not found rather than forbidden, so its existence does not leak.

## Sync

A `foldkit-sync/entity` cell edit is a write to a member of a row, through the
journal instead of a mutation, so it answers to the same rules.
`foldkit-guard/sync` checks it in two halves, by where each can run, and
keeps a document's edits from reaching anyone the rows would hide them from:

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

`sync` and `journal` are the document's Sync contract and journal
(`foldkit-sync/journal`), here with the principal as `G.Principal` holds it;
`changesOf` reads an operation's cell edits, and `db` is the database
`TodoSource` reads. A document's readers are principal guards, so of
`Todo`'s Read rule only `isAdmin` can be one: the rows anyone else reads
differ from person to person, and a document is one audience.

- **Under the lock**, `authorize` refuses what the principal guards settle:
  the row's `Update`, and each changed member's, with an `explain`'s
  sentence. It reads no row, and its bodies must not suspend.
- **Before the journal**, `admit` reads each row an edit names through the
  Entity's guarded Source: a row the principal cannot see is refused, and
  the row's `Update` must hold over it as it is and as it would be after all
  of the operation's edits to it. Each changed member's rule must hold over
  it as it is, and as the edits would leave it with that member's own edit
  undone, as for a writer. An
  edit to a member outside the document, or a value its member cannot
  encode, is refused.
- **A document is one audience.** Every replica that opens it receives every
  edit, so `document` refuses where it is declared an edited member that is
  not a field or has a Read rule of its own, a reader the rows' Read rule
  does not name among its top-level guards (one inside `Guards.all` is not
  enough: all of it must hold), rows with a Read rule and no readers named,
  and `always` rules over the row. `opens` lets any
  reader (anyone, when it names none) who passes the Entity's `always`.
- Presence on the same socket is stamped by the server with the connection's
  peer id, and joins only who may open the document:
  `Sync.presence.serve(socket, hub, { peerId, opens: GuardSync.opens(Policy, Edits, principal) })`.
  What a presence value carries is the application's.

## Agents

An agent should not be offered, or attempt, what the server would refuse.
`foldkit-guard/agent` reads `may` from the row the Model holds, for a
`foldkit-agent` capability's `authorize` and `available`:

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

`App` and `Message` are the client application's: its Model holds Remote's
store at `remote` and the selected todo's id at `selected`, and `Message`
has a `RequestedArchive` with the todo's `id`.

- `Row` selects `may`. A row not read yet, or whose read failed, refuses:
  there is no answer to go on. One being read again answers as it last did.
  A refusal its rule explained is the agent's error message.
- `available` is for a capability over a row the Model alone names (the one
  selected): a visitor is then not offered it at all.
- `withPrincipal(G.Principal)` makes the agent's principal the server's
  type.
- It is the agent's gate, not the check: the Message's mutation is checked on
  the server, under the same principal.

## Uploads

`foldkit-media`'s upload routes ask one question of an `UploadPolicy`
before reading a byte: may this request upload (`Upload`), or have an image
named by URL described (`DescribeUrl`)? `foldkit-guard/media` answers it with
principal guards, for who your resolver says is asking:

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

`resolve` is the resolver your Remote server is given:
`(request: Request) => Effect<Option<User>, E, R>`, which
`AuthServer.resolver` from `foldkit-auth/server` is. `inspector` is
`foldkit-media`'s `Inspector` for where you run (`inspectorSharp()`,
`inspectorImages(env.IMAGES)`).

- Only principal guards: no row exists before an upload, so a row guard is a
  type error. A route admits when any one of its guards allows, and a route
  given no guards admits nobody.
- The resolver gets the request's URL, method and headers and never its
  body, so the route still reads no byte before the policy answers.
- A resolver that fails (an untrusted origin, a session that ended) is a
  `401`; a principal the guards refuse is a `403`. Either says only its kind:
  an `explain` sentence stays on the server.
- `Policy` must need no service; give it what its bodies need with
  `Policy.provide`, as the other seams take it.
- Beside a deployment's secret for scripts:
  `uploadPolicyAny(uploadPolicyBearer(secret), GuardMedia.uploadPolicy(…))`.

## Limits

- **`may` is as stale as its row.** It is the server's answer for the row as
  it was read, or the client's reading of the rules for a row it wrote; a
  live patch of a field its rules read does not answer it again.
- **A handler's own writes are its own to check.** `GuardServer.mutation`
  checks the row's rule for its interaction; members it sets and relations
  it points are not known to it, and no startup check can read them.
- **Under a guard, a create refetches the lists over its Entity.** The client
  cannot tell an answer read back under the writer's rule from one a plain
  handler made up, so it does not place a created row by the list's body
  alone.
- **A Sync document is one audience.** Per-member or per-row secrecy within
  one is not something a replicated log offers: `GuardSync.document` refuses
  it where it is declared.
- **A `revision` pins one row, against the writes that move it.** A write
  rule reads the principal and the row, so pinning the row's revision makes
  the check and the write one. Only the declared writes that pin or `expect`
  it move it on: a handler (`RemoteServer.mutation`), raw SQL or a migration
  that changes the row without moving it is not seen, unless the table carries
  `foldkit-remote-drizzle`'s `revisionTrigger`, which has the database move it
  on every update that does not. Sync's `applyEdits` keeps one revision for two
  changes in one operation, so a table Sync writes takes no trigger, and the
  pin does not see that second change. A writer given no `revision` does not
  see a change landing between its check and its write.
- **Sync's `admit` reads the table, which lags the journal.** An edit lands
  in the table when its exchange settles, so an edit admitted before another
  lands is judged against the row as it was: a concurrent change of owner
  can let its old owner's edit through. Where that matters, keep the fields
  a row rule reads out of the document and change them through a guarded
  Remote write.
- **Sync's `authorize` is synchronous.** Its principal guards' bodies must not
  suspend; row guards run in `admit`, which may.
- **A row guard over a field the client sets on create** reads as matching
  nothing while the create leaves it unset; use a preset (`presets`) for a
  field that should be the creator's.
