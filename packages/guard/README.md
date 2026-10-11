# foldkit-guard

Who may do what, declared once on a Foldkit Plus domain.

**Early.** This package declares a guard set and decides its guards. Attaching
guards to an Entity, and the seams that derive their checks from them (a
binding's `visible`, a Source's `authorize`, a mutation's write plan, the
client's `may` hint), are the next slices of
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
