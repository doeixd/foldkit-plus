# Context terms, and one viewer per side (operations phase 2, #232)

Status: built (2026-10-28). Phase 2 of [operations-PLAN.md](./operations-PLAN.md).
`Expr.viewer` and `Expr.now` in `foldkit-entity`; read by the reference
interpreter, the SQL compiler, the memory server and the Remote client; the
server's viewer declared once, at `RemoteServer.make`. `source(…, { viewer })`
is removed.

## The problem

Who asks and what time it is were not part of the language. A rule could
compare a field with an input the principal filled, but not with "whoever
asks", and the viewer was declared three times: `Remote.make({ viewer })` on
the client, and on the server both `RemoteServer.make({ viewer })` (for
stamps) and `source(binding, { viewer })` (for each `Derived.exists`), the same
function passed twice.

## Decision

```text
Expr.viewer(User)   a term: whoever asks, as a User's id; null for a visitor or a viewer of another Entity
Expr.now            a term: the time, in milliseconds

ExprContext = { viewer: Option<EntityRef>, now: Option<number> }

server: RemoteServer.make({ viewer }) ─┬─ every Source's read     (EntitySourceContext.viewer)
                                       ├─ every query's run       (+ Effect Clock → exprContext)
                                       ├─ every live subscription (re-reads carry it)
                                       └─ every write             (as before: stamps)
client: Remote.make({ viewer })  ───── list judgements (live inserts, answers, news, filters); now: none
```

### The names

The plan's schematic `Expr.viewer` is settled as **`Expr.viewer(Entity)`**, a
function of the viewer's Entity. A term needs its target to be relation-shaped:
a path goes on from it to that Entity's relations, and "a viewer of another
Entity" has to mean something (it reads null, as `Derived.exists` already read
none). A bare `Expr.viewer` would have to learn its Entity from a domain-wide
declaration that `foldkit-entity` does not have. `Expr.now` is a value, as the
plan names it.

Both are new `Expr` variants (`Viewer`, `Now`), and two new kernel operations
(`viewer`, `now`), so `Query.unsupported` refuses them by name in an
interpreter that does not list them (the livestore and TanStack examples). A
`ViewerExpr` carries `entity` (its identity), `target` (the Entity, as a
relation does) and `schema` (text: a ref's id travels as text). Its value type
is `IdOf<Entity>`, so `Expr.eq(Like.fields.userId, Expr.viewer(User))`
compiles and comparing it with a number does not. `ReadsOf` treats both as
reading no Entity, so a Post query may compare with a User's viewer.

They live in `packages/entity/src/context.ts`, with `ExprContext`,
`contextValue` (what a term comes to in a context) and `viewerIdOf` (the
viewer's id when they are a row of an Entity), which every interpreter shares.

### What none means

- **A visitor** (`viewer: none`) is a real viewer: `Expr.viewer` reads null, a
  comparison with it is unknown, and a list over it holds no row, on both
  sides alike.
- **No reading of the time** (`now: none`) is not a null. `contextValue`
  answers none, and every interpreter refuses the body rather than compare
  with a null, which would predict "no rows" where the server finds some.
- **No context at all** (a run given none) is refused too
  (`ContextMissingError`, a `QueryEvaluateError`). `evaluateEach` refuses the
  run, not each row: no row causes it.

So a body the client cannot judge is the server's to say, through the refusal
paths that already exist (`belongsEncoded`'s `unknown`, a list invalidated).
Phase 1's three-valued evaluation will turn the same cases into `unknown`
directly.

### Server: one viewer, handed to what it mounts

`RemoteServer.make({ viewer })` was already there for stamps. It is now the
only place:

- `EntitySourceContext`, `QuerySource.run`'s context and `LiveSource.subscribe`'s
  context gain `viewer?: Option<EntityRef>`, which the handlers fill from the
  server's `viewer` of the principal, as the mutation context already was. The
  live hub keeps each subscriber's viewer and re-reads with it; `pollLive`
  passes it to its source.
- An `EntitySource` declares the members it answers per reader
  (`perViewer`). `RemoteServer.make` refuses a source with any when it has no
  `viewer`: `Post's liked depend on who reads them (Derived.exists), but the
  server has no viewer`.
- The drizzle `source` sets `perViewer` from its `Derived.exists` members and
  reads the reader from `context.viewer`. Its `viewer` option is removed.
- A query body's terms: the drizzle `query` and the memory server build an
  `ExprContext` per request with `exprContext(body, viewer, now)`, the viewer
  from the run and `now` from Effect's `Clock`, and compile or evaluate with
  it. The SQL compiler binds each term as a parameter, as it binds an input,
  and decides a predicate over the context alone before SQL, as it
  decides one over the input alone.

**Why `viewer` is optional on a source's context.** A source is also read
outside a server: by tests, by `writer`'s own reads of stored fields, by
`foldkit-guard` and Sync. Requiring it would change every such call for no
gain, since they read no per-reader member. Optional would be a quiet
fallback, so the absence is refused where it matters: the drizzle source
refuses a read of a `perViewer` member given no viewer, and `exprContext`
refuses a body over `Expr.viewer` run outside a server. Neither is ever read as
a visitor.

### Client

`Remote.make({ viewer })` stays the client's one declaration. The list
judgements made with a Model in hand (a live insert's policy, a write's
answer, a read's news, and `Data.filtered`'s `matching`) pass
`{ viewer: viewer(model), now: none }`. `matching`'s options, `belongsEncoded`
and `impactOn` take the context. The client has no reading of the time a
server judged a list at, so a list over `Expr.now` stays the server's. Phase 4
supplies an operation's `now` to its prediction; it is the write's time, not a
list's, and is not used here.

Pending placement (`pendingPlaced`) is memoized over the store and reads no
Model, so it judges without a context: a pending row in a list over the viewer
is placed by the answer. Phase 5 runs predictions over the operation, which
carries its context.

### Existing members over the new terms

- `Write.stamp` takes an `ExprContext`. A clock stamp is `Expr.now`'s value
  (`contextValue(Expr.now, by)`), and a stamped relation is `Expr.viewer` of
  its target (`viewerIdOf`). A text field stamped with the viewer names no
  Entity, so it still takes whoever asks; phase 3 replaces stamps with
  `Entity.sets` over these terms.
- The drizzle `Derived.exists` reads its reader as `Expr.viewer` of the
  Entity its viewer relation points at (`viewerIdOf`). Re-expressing the
  member itself as an `Expr` over relations needs phase 1's paths and `exists`.

## What is refused, and where

| Case | Refused |
| --- | --- |
| A server with no `viewer` mounting a source with a `Derived.exists` | `RemoteServer.make`, naming the source and members |
| A read of a per-reader member given no viewer (outside a server) | the source's read, as a `RemoteServerError` |
| A query body over `Expr.viewer` run outside a server | `exprContext` |
| A body read with no context, or no reading of a time it reads | `ContextMissingError` (memory), `QueryCompileError` (SQL) |
| A computed assignment over the context | `Write.update`/`insert`, where declared |
| A write's `when`, or its Entity's invariant, over the context | `writer`, where built (a writer is given no context yet) |
| A body over the context in an engine without them | `Query.unsupported`, by name |

## Not in this phase

- **Writes reading the context.** A precondition, an invariant or a guard rule
  over `Expr.viewer` needs the writer to be given the context; phase 3
  (`Entity.sets`, rules comparing relation refs) and phase 4 (the write's
  `now`) carry it there.
- **Paths through the viewer** (`Expr.viewer(User)` followed to `org`): phase 1
  builds `Expr.path`; the term carries `target` for it.
- **Three-valued answers.** Phase 1.

## Tests

- `packages/entity/test/context.test.ts` and `.test-d.ts` (8 mutations): the
  terms in `evaluate`, a visitor and a viewer of another Entity, no reading of
  the time, a run with no context refused as a run, `decided` with and without
  a context, an assignment refused; the types accept the id and the time and
  refuse each in the other's place.
- `packages/remote-drizzle/test/contextTerms.test.ts` (6 mutations, one
  equivalent on SQLite): a body over each term through SQL and through the
  memory server, which agree; a predicate over the context alone; a body run
  outside a server refused.
- `packages/remote-drizzle/test/derivedExists.test.ts` (12 mutations): `liked`
  read through a server's viewer; a server without one refused, naming the
  binding; a read outside a server refused for the member and answered for the
  rest.
- `packages/remote/test/contextTerms.test.ts` (4 mutations): a live insert
  judged with `Remote.make`'s viewer; a list over `Expr.now` left to the
  server; `matching` refusing a body over the viewer without a context.
