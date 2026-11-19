# How Guard works

In most applications, permission checks live scattered across route handlers, SQL queries, forms, and background jobs. When you add an endpoint or a role, you have to find every check and update it by hand. One missed `WHERE` clause leaks another customer's rows, and one forgotten field check lets a user change their own role.

`foldkit-guard` lets you declare access rules once on your data model. Row rules compile straight into SQL `WHERE` clauses for multi-tenant reads, run on the server when saving writes, and generate permission hints for your UI and forms. To see a full app running with sign-in and guarded notes, look at [`examples/auth`](../examples/auth) or [`examples/chirp`](../examples/chirp).

You describe each table as an *Entity* (a schema of typed fields from `foldkit-entity`, built on Effect `Schema`) and the signed-in user as a *principal* (a typed record built from your session). `foldkit-guard` splits permissions into server-only checks on the user and data-driven rules over rows.

## Write your first guard set

This example defines a `Note` table, declares an admin check and an author check, and evaluates whether a member can read their own note:

```ts
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'

const User = Schema.Struct({ id: Schema.String, role: Schema.Literals(['admin', 'member']) })
const NoteFields = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, authorId: Schema.String, title: Schema.String }),
)

const G = Guards.declare(
  'Notes',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isAuthor: guard.row(NoteFields, user => Expr.eq(NoteFields.fields.authorId, user.id)),
  }),
  { key: user => user.id, unguarded: 'deny' },
)

const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

Effect.runSync(
  Policy.decide(G.isAuthor, {
    principal: Option.some({ id: 'ada', role: 'member' }),
    interaction: 'Read',
    row: { id: 'n1', authorId: 'ada', title: 'Draft' },
  }),
) // true
```

`Policy.decide` returns an `Effect` that resolves to `true` for Ada's note and `false` if `authorId` is someone else. Passing `Option.none()` for a signed-out visitor also returns `false`.

Here is what each part does:

- **`Entity.define`** creates a typed table definition; `NoteFields.fields` exposes typed references to its columns.
- **`Guards.declare`** registers a named guard set (`'Notes'`). `key` extracts a stable user ID for cache scoping, and `unguarded: 'deny'` closes any action you omit (use `'allow'` for open-by-default).
- **`guard.principal()`** declares a server-only check by name. Its function lives in `G.implement`, so your role logic stays out of browser bundles.
- **`guard.row(NoteFields, user => ...)`** builds a frozen expression tree (`Expr`) instead of a runtime callback. At declaration time `user.id` is an input placeholder (not a real user), so both SQL compilers and in-memory evaluators can inspect `Expr.eq(...)`.
- **`Policy`** is the executable server half. `G.implement` requires a body for every principal guard (receiving `Option<User>`, none for visitors) and rejects missing or extra keys in TypeScript.
- **`Policy.decide`** tests one guard against a principal, an action name (`'Read'`, `'Create'`, `'Update'`, `'Delete'`, or a custom name), and an optional row.

## How a request is decided in two steps

When a request arrives, your server resolves the signed-in user once and hands that principal to `Policy`. `Policy` resolves every permission in two steps:

1. **Decide principal guards once.** The server runs each `guard.principal()` body for that user and replaces it with `Always` (allowed) or `Never` (denied).
2. **Simplify what remains into a `Condition`.** A `Condition` is a tagged boolean tree (`_tag: 'Always' | 'Never' | 'Row' | 'And' | 'Or'`). Inside an array of guards (logical OR), any `Always` collapses the whole rule to `Always`, and any `Never` drops out.

Attach rules to an Entity with `Guards.attach` and ask `Policy.readable` what remains for an admin versus a member:

```ts
const Note = NoteFields.pipe(Guards.attach(G, { row: { Read: [G.isAuthor, G.isAdmin] } }))

const forAdmin = Effect.runSync(
  Policy.readable(Note, Option.some({ id: 'lin', role: 'admin' })),
) // { _tag: 'Always' }

const forMember = Effect.runSync(
  Policy.readable(Note, Option.some({ id: 'ada', role: 'member' })),
) // { _tag: 'Row', guard: G.isAuthor, ... }
```

For Lin the admin, `G.isAdmin` becomes `Always`, so `Read` collapses to `{ _tag: 'Always' }` and SQL adds no extra `WHERE` clause. For Ada the member, `G.isAdmin` becomes `Never` and disappears, leaving only `G.isAuthor`, which compiles to `WHERE author_id = ?`.

For a signed-out visitor (`Option.none()`), every row guard that reads a placeholder field of `user` collapses to `Never`. A row guard that reads only columns of the row (such as `published = true`) still runs for visitors.

## What safety bugs Guard prevents

Authorization bugs rarely come from one bad `if` check. They come from gaps between layers: a missed query, a race condition, a leaky error, or an edit that moves a row across tenants. Guard blocks each of these structurally.

### Unprotected endpoints and unguarded table copies

Calling `GuardServer.validate(Policy, { entities, domain, server })` (from `foldkit-guard/server`) checks your whole server at startup. It throws before serving a request if any guarded Entity's data source, query, live stream, or write skips its rules, or if a query filters or sorts by a hidden field.

Because `Guards.attach` returns a new copy of the Entity carrying the rules, passing the bare `NoteFields` copy by mistake could serve rows unguarded. Every Guard server adapter detects when another copy of that Entity carries guards and throws if you pass the unguarded one.

### Moving a row out of your own reach

Suppose a user may edit rows in their own organization, and they send an update changing `orgId` to another company's ID. Checking only the row *before* the write would allow it.

`GuardServer.writer` (the guarded wrapper for declared database writes) checks an update's row rule on **both the row before and the row after**. If the new row fails the `Update` rule, the write fails with `Forbidden`. When a write changes two fields together (for example `status` and `price`), each field's rule is checked with the *other* edit already applied, so one edit cannot unlock a field rule for another. Custom handlers wrapped with `GuardServer.mutation` check the row before running; the handler owns what it writes.

### Race conditions between checking and writing

Between reading a row to check permissions and saving an update, another request might change the row's owner or status. Passing `revision: 'revision'` (naming a numeric version column on your Entity) to `GuardServer.writer` pins every update and delete to the revision the guards checked. If another write moves that column first, the writer re-reads the row and re-evaluates the guards up to three times instead of overwriting blind.

### Hidden-field leaks through filters, writes, and errors

Hiding a field like `salary` or `internalNote` from JSON responses is not enough. A caller could still filter by `salary > 100000`, sort by `salary`, or trigger a write condition (`when`) that fails only when `salary` exceeds a threshold.

Guard blocks those side channels. `GuardServer.validate` refuses queries that filter or sort by any field or relation (called a *member*) that has a `Read` rule. `GuardServer.writer` refuses writes whose precondition (`when`), expected revision (`expect`), or computed field reads a hidden member. If a data rule (*invariant*) over a hidden field fails, the writer returns a generic `Invalid` error without naming which rule failed.

### Unsafe cascading deletes

When deleting a parent row cascades to child rows, `GuardServer.writer` checks every child row against its own `Delete` rule in the same SQL statement before removing anything. If even one child fails, the whole delete returns `Forbidden` naming only the child Entity, never a row ID. Pass guarded children in `{ children: [...] }`, or declare `authorizedBy: 'parent'` on a relation when parent permission is enough.

### Guessing when client data is incomplete

A browser holds only the rows it has fetched and never runs `guard.principal()` functions. Treating unknown permission as "no" locks buttons the user can click; treating it as "yes" misleads the UI.

Piping `Guards.may` onto an Entity adds a server-computed `may` field per row. Reading it with `May.answer(may, 'Update')` (imported from `foldkit-guard`) returns three values: `Option.some(true)` (allowed), `Option.some(false)` (denied), or `Option.none()` (undecided). Use `May.refused(may, 'Update')` to disable controls only on a known "no", leaving undecided actions live for the server to judge.

## Real scenarios you can model today

The same `Guards.attach` declaration covers row access, field locks, redaction, related tables, UI hints, offline sync, AI agents, and file uploads.

### Multi-tenant isolation, field locks, and redaction

Use `always` for rules every action must obey and no role can override. Use `Write` as shorthand for `Create`, `Update`, and `Delete`, `Interaction.make` for custom actions, `Guards.on` with `Guards.explain` or `Guards.redact` for custom denials, and `[]` (an empty OR list) to allow nobody:

```ts standalone
import { Option, Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { Guards, Interaction } from 'foldkit-guard'

const Staff = Schema.Struct({
  id: Schema.String,
  orgId: Schema.String,
  role: Schema.Literals(['admin', 'member']),
})

const TicketFields = Entity.define(
  'Ticket',
  Schema.Struct({
    id: Schema.String,
    orgId: Schema.String,
    assigneeId: Schema.String,
    internalNote: Schema.String,
  }),
)

const G = Guards.declare(
  'Tickets',
  Staff,
  guard => ({
    isAdmin: guard.principal(),
    inOrg: guard.row(TicketFields, p => Expr.eq(TicketFields.fields.orgId, p.orgId)),
    isAssignee: guard.row(TicketFields, p => Expr.eq(TicketFields.fields.assigneeId, p.id)),
  }),
  { key: p => p.id, unguarded: 'deny' },
)

const Close = Interaction.make('Close')

const Ticket = TicketFields.pipe(
  Guards.attach(G, {
    always: [G.inOrg],
    row: { Read: [G.inOrg], Write: [G.isAssignee, G.isAdmin] },
    interactions: {
      [Close.key]: Guards.on([G.isAdmin], Guards.explain('Only an admin can close tickets.')),
    },
    members: {
      orgId: { Update: [] },
      internalNote: { Read: Guards.on([G.isAdmin], Guards.redact('[hidden]')) },
    },
  }),
)

const summary = Guards.matrix([Ticket])
```

`Guards.matrix([Ticket])` returns a plain-text audit table listing every rule: `always: inOrg`, `Ticket.Read: inOrg → not_found`, `Ticket.Update: isAssignee | isAdmin → forbidden`, `Ticket.Close: isAdmin → explain("Only an admin can close tickets.")`, `Ticket.orgId.Update: nobody → forbidden`, and `Ticket.internalNote.Read: isAdmin → redact("[hidden]")`. By default, a denied `Read` returns `not_found` so callers cannot tell hidden rows exist, while a denied write returns `forbidden`. Because `inOrg` is in `always`, even an admin stays inside their own organization, and `Update: []` makes `orgId` immutable.

### Inherited and cross-row permissions

Use `Entity.relate` and `Relation.one` to link tables, then use `Guards.inherit` so child rows copy their parent's `Read` rule, or `Expr.path` to read a parent column directly:

```ts standalone
import { Schema } from 'effect'
import { Entity, Expr, Relation } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'

const User = Schema.Struct({ id: Schema.String, projectIds: Schema.Array(Schema.String) })
const ProjectFields = Entity.define('Project', Schema.Struct({ id: Schema.String }))
const TaskFields = Entity.define('Task', Schema.Struct({ id: Schema.String, title: Schema.String }))

const { Project: ProjectRel, Task: TaskRel } = Entity.relate(
  { Project: ProjectFields, Task: TaskFields },
  { Task: { project: Relation.one(ProjectFields) } },
)

const G = Guards.declare(
  'Work',
  User,
  guard => ({
    inProject: guard.row(ProjectRel, p => Expr.in(ProjectRel.fields.id, p.projectIds)),
    projectMember: guard.row(TaskRel, p =>
      Expr.in(Expr.path(TaskRel.relations.project, ProjectRel.fields.id), p.projectIds),
    ),
  }),
  { key: p => p.id, unguarded: 'deny' },
)

const Project = ProjectRel.pipe(Guards.attach(G, { row: { Read: [G.inProject] } }))
const Task = TaskRel.pipe(
  Guards.attach(G, { row: { Read: [Guards.inherit('project')], Update: [G.projectMember] } }),
)
```

`Expr.in` checks membership in the user's `projectIds` list, and `Guards.inherit('project')` compiles to a SQL subquery over `Project`'s `Read` rule (checking for cycles at startup). Cross-row rules (`Expr.path` or `Expr.exists`) work on `Read`, `Update`, and `Delete`, where SQL evaluates them in the statement. `Guards.attach` refuses cross-row rules on `Create`, members, or single-row handlers at setup time.

### One declaration across every boundary

Every other Foldkit Plus package enforces the same attached rules through its own Guard subpath:

| Boundary | Subpath | What it enforces |
| --- | --- | --- |
| SQL reads (Drizzle) | `foldkit-guard/drizzle` | Compiles `Read` and `always` into SQL `WHERE` clauses (`GuardDrizzle.visible`). |
| Member reads & `may` | `foldkit-guard/server` | Omits or redacts hidden fields and computes `may` (`GuardServer.filter`). |
| Declared writes | `foldkit-guard/server` | Checks row, member, link, revision, and cascade rules (`GuardServer.writer`). |
| Custom handlers | `foldkit-guard/server` | Checks a named `Interaction` before running (`GuardServer.mutation`). |
| Route-level UI | `foldkit-guard` | Serves one `Me` row (`signedIn`, `key`, `may`) via `Guards.me` and `GuardServer.me`. |
| Offline Sync | `foldkit-guard/sync` | Guards sync journal opens, admits, and edits (`GuardSync.document`, `admit`). |
| AI agents | `foldkit-guard/agent` | Gates tool visibility and dispatch on `may` (`GuardAgent.available`, `authorize`). |
| File uploads | `foldkit-guard/media` | Checks principal guards on upload routes (`GuardMedia.uploadPolicy`). |

`may` is always a client hint. The browser never receives `G.implement`, and the server ignores client `may` values and re-checks every write when it commits.

## How Guard, Expressions, and Laws act like a constraint solver

A constraint solver takes rules over typed variables and narrows what is possible: it filters valid solutions, simplifies partial facts, detects impossible paths, and proves when changes stay safe.

In Foldkit Plus, you write all of your rules in the same `Expr` language: field Schemas, table rules (`Entity.invariant`), named row states (`Entity.refine`), write preconditions (`when` / `from`), query filters (`Query.where`), and `foldkit-guard` row rules. Every write succeeds only when all four hold together:

> **Authorization (`Guard`) AND precondition (`from`, `when`) AND invariants (`before`, `after`) AND Schema**

Those shared declarations act as a constraint system across three layers:

### 1. Live enforcement and SQL filtering

On reads, `GuardDrizzle.visible` combines your `Read` condition with your query's `WHERE` clause into one SQL statement, so the database solves for every row meeting both constraints.

On writes, `GuardServer.writer` and your declared writer refuse any commit that breaks a guard, precondition, or invariant, while SQL `CHECK` constraints protect one-row invariants against raw SQL. Every stored row is therefore guaranteed to hold your state invariants, and checking `Update` row guards on both `before` and `after` turns row guards into transition constraints per actor.

### 2. Partial evaluation and residualization

When only some values are known, Guard and `Judge` (the in-memory expression evaluator in `foldkit-entity`) simplify the constraints instead of guessing:

- `Policy.readable` evaluates every principal guard once and folds the boolean tree to `Always`, `Never`, or only the row guards left over.
- `Condition.residual(condition, row, input, operators)` checks every single-row guard against `row` right away and keeps only cross-row guards (`Expr.path`, `Expr.exists`) for the SQL statement.
- `Condition.judge` checks a partially held client row twice — assuming unknown guards are `true`, then assuming `false`. Because a `Condition` contains no `not`, whenever both runs agree the answer is exact; otherwise it stays undecided.
- `Data.can` (from `foldkit-remote`) evaluates a row's `may`, the write's `when` / `from`, and the Entity's invariants over client rows in the server's order (`Forbidden`, `Unmet`, `Invalid`). Your UI and AI agents can check which actions can succeed before sending a request.

### 3. Static constraint propagation with `Laws.check`

Because invariants and declared writes are `Expr` data, `Laws.check` (from `foldkit-entity`) runs a built-in, synchronous constraint solver over your declarations with no database. It enumerates finite fields (booleans and literal unions) and propagates numeric intervals from Schema bounds, `when` conditions, and assumed invariants through write operations using their declared monotonic laws.

This example defines an `Account` invariant (`balance >= 0`) and a fee write (`Write.update` with `Entity.input` for the write's arguments), then proves statically that the fee can never overdraw an account:

```ts standalone
import { Schema } from 'effect'
import { Entity, Expr, Laws, Write } from 'foldkit-entity'

const Account = Entity.define(
  'Account',
  Schema.Struct({
    id: Schema.String,
    status: Schema.Literals(['open', 'closed']),
    balance: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
).pipe(
  Entity.invariant('neverOverdrawn', ({ after }) => Expr.gte(after.balance, 0), {
    message: 'Balance cannot go negative',
    path: ['balance'],
  }),
)

const ChargeFee = Write.update(
  Entity.input(Account, Schema.Struct({ id: Schema.String })),
  {
    id: 'id',
    compute: { balance: ({ row }) => Expr.sub(row.balance, 5) },
    when: () => Expr.gte(Account.fields.balance, 5),
  },
)

const report = Laws.check({ writes: [{ name: 'ChargeFee', write: ChargeFee }] })
report.pairs[0]?.verdict._tag // 'Kept'
```

`Laws.check` narrows `balance` from `when` to `[5, ∞)`, subtracts `5` through `Expr.sub`'s monotonic law (a larger input gives a larger result) to get `[0, ∞)`, and records one verdict in `report.pairs` for each write-and-invariant pair (`Kept`, `Refused`, or `Undecided`). Here `ChargeFee` is `Kept` for every valid account. If the narrowed range is empty, `Laws.check` reports `Unmeetable` (a dead write). If a rule can fail, it prints a concrete failing `before`, `input`, and `after` example checked by `Judge`.

## Where the boundary sits: authority vs. validity, and limits

Two boundaries keep this model sound:

- **Authority never excuses an invalid row, and a valid row never grants access.** Guards are alternatives (`[G.isAssignee, G.isAdmin]`) that change whenever roles change, while invariants hold for everyone, admins included. That is why `Laws.check` reads only your writes and Entity invariants — never your Guards, not even `always` — and why refusals stay distinct: `Forbidden` (not allowed), `Unmet` (precondition not met), and `Invalid` (result breaks an invariant).
- **Runtime guards check one request; intervals track one variable at a time.** Running a guard guarantees that *this* request obeyed the rules, not that *every* future input will. Likewise, `Laws.check`'s interval pass tracks each number independently, so a `when` comparing two unknowns (such as `amount <= balance`) reports `Undecided` instead of guessing, leaving relational rules to runtime checks, multi-step tests, or an external solver.

## Where to go next

- **Wire sign-in to a guard set:** read [Auth and Guard](./auth-and-guard.md).
- **Decide whether a rule belongs in a Schema, an invariant, a `when`, or a Guard:** read [Laws: where a rule goes](./laws.md).
- **Look up every Guard option and server adapter:** read the [`foldkit-guard` README](../packages/guard/README.md).
