# Stamps, revised: one fact, one member, one viewer (#232 follow-up)

Status: plan (2026-10-28). Builds on [232-write-effects-DESIGN.md](./232-write-effects-DESIGN.md).

## Where #232 left it

A write's effects are inferred. The only thing declared is what the server
chooses for a new row, once, on the Entity:

```ts
Entity.stamps({ authorId: Stamp.viewer, author: Stamp.viewer, createdAt: Stamp.clock })
```

The server fills and enforces these values, and the client predicts them. The
direction is right. A review found three design debts and one weak
prediction. Each gets harder to change once applications depend on it, so all
four are fixed before the stamps API is released.

| # | Problem | Evidence |
| --- | --- | --- |
| 1 | One fact is declared as two members | Chirp stamps `authorId` and `author`. `Like` gained a `userId` field beside its `user` link only because a guard rule could not read a link. |
| 2 | "Who is the viewer" is defined three times | `Remote.make({ viewer })` on the client. `RemoteServer.make({ viewer })` and `source(…, { viewer })` on the server, where the same function is passed twice. |
| 3 | Removing `presets` lost a capability | `presets` could set any principal-derived value (`tenantId: user => user.orgId`). `Stamp.viewer` covers only the asker's id. |
| 4 | The predicted time is stale | `update` reads no clock, so the prediction uses `lastHeard(store)`, the time the store last heard from the server. A new row can land below newer ones and jump when the answer arrives. |

Two smaller gaps are folded in: a clock stamp on updates (`editedAt`), and the
missing law that a prediction equals the server's value.

## Principles

- One fact, one member, one declaration. A stamp sits on the member that
  *is* the fact.
- Each side says who the viewer is once. Everything else reads it.
- Typed references, not names (#251). A stamp that reads the viewer's data
  names an Entity member, not a string.
- The client predicts only what it can compute. What it can't, it leaves to
  the answer, without guessing.

## The plan

### 1. Stamp the relation, read its id (one fact, one member)

- `Entity.stamps` accepts `Stamp.viewer` on a `one` relation to the viewer's
  Entity. A text field still takes it, for an Entity whose viewer has no
  Entity.
- Guard rules and `Expr` can read a `one` relation's id, for example
  `Expr.idOf(Like.relations.user)`, so a rule like "a like is its liker's"
  needs no duplicate field.
- `bind` refuses a column that backs both a stamped relation and a field. The
  message names both members and says to keep the relation.
- Chirp: drop `Post.authorId` and `Like.userId`, and stamp `author` and
  `user` only. The guard rule moves to `Expr.idOf(Like.relations.user)`. The
  reference app does the same for its author.
- Tests: the rule still refuses taking back someone else's like; a duplicated
  column is refused at `bind`; mutations of both.

### 2. One viewer per side

- The server declares the viewer once, at `RemoteServer.make({ viewer })`.
  Sources and writers get it from the server they are mounted in, through the
  request context they already receive.
- `source(binding, { viewer })` loses the option. A binding with a
  `Derived.exists` mounted in a server without `viewer` fails when the server
  is made, naming the binding.
- The client keeps `Remote.make({ viewer })`, its one definition.
- Breaking: `source`'s `viewer` is removed. Every caller of `source`, `writer`
  and `cms-drizzle` is updated (see the AGENTS.md trap about a constructor
  that starts requiring an option).

### 3. Stamps from the viewer's own data (replaces `presets`)

- `Stamp.viewer.field(User.fields.orgId)`: the stamped value is a member of
  the viewer's own row, named by a typed reference.
  - The server reads it from the principal, through a mapping declared once on
    `RemoteServer.make({ viewer })`, which returns the viewer's ref and the
    members it can answer.
  - The client predicts it from the viewer's row in its store, when the store
    holds that member. When it doesn't, the client predicts nothing for that
    member and leaves it to the answer.
- `Entity.stamps` refuses a `Stamp.viewer.field` whose member's type does not
  fit the stamped field.
- This restores tenant-style values (`orgId`, `teamId`) that `presets` gave,
  with one declaration on the Entity in place of one per writer.

### 4. The predicted time is the moment the user acted

- `Data.mutate` still predicts at once, with `lastHeard` as a placeholder, so
  the row shows in the same frame.
- The Command that sends the request reads the Effect `Clock` first and
  dispatches `MutationClocked({ requestId, now })` before the request goes
  out. The reducer restamps that request's pending layer with `now` and
  re-places its rows.
  - The jump this can cause is at most one frame and lands before the answer.
  - The answer then corrects by milliseconds, not by however long the store
    had been idle.
- `MutationClocked` for a settled or unknown request is a no-op that returns
  the Model it was given.
- Tests:
  - a `Trace` shows a new row ordered by the clocked time before the answer;
  - `heldValue.test.ts` gets a generator for the new Message.

### 5. Clock stamps on every write (`editedAt`)

- `Stamp.clock` takes when it applies: `Stamp.clock({ on: 'create' })`, the
  default, or `Stamp.clock({ on: 'write' })` to stamp on every insert and
  update.
- An update predicts an `on: 'write'` stamp as in step 4, and the server
  writes it in `RemoteServer.write`. A retried update keeps the first value,
  as a retried insert does.
- One shape covers both; there is no separate `Stamp.updated`.

### 6. The law: a prediction is what the server writes

- A conformance test, the first case of #257: for each stamped Entity in
  Chirp and the reference app, it runs one insert through the client's
  prediction and through `RemoteServer.write` with the same viewer and a fixed
  `TestClock`. The predicted stamped values must equal the stored ones.
- It runs in `pnpm test`, so a stamp the client and server disagree on fails
  CI.

## Deferred, deliberately

- **Writing on someone's behalf.** An input that sets a stamped member stays
  refused. A future seam, which this plan does not build: a guard capability
  (`actAs`) under which `Stamp.viewer` honours an input value. It is written
  down so it isn't mistaken for an oversight.
- **A server-minted id.** Clients still name ids. Generating them server-side
  breaks optimistic references and needs its own design.
- **`may` for a row just made (#242).** Chirp's timeline keeps drawing a new
  chirp only after the answer until #242 lands.

## Order and acceptance

| Step | Depends on | Breaking | Done when |
| --- | --- | --- | --- |
| 1 Relation-only stamps | — | Yes (Chirp/reference fields removed; `bind` refusal) | Chirp has no `authorId`/`userId`; the guard rule reads the relation's id; refusal tested |
| 2 One server viewer | — | Yes (`source`'s `viewer`) | `viewer` is defined once per side; a missing one fails at `RemoteServer.make` |
| 3 `Stamp.viewer.field` | 2 | No | A tenant field is stamped and predicted in a test domain; a mistyped one is refused |
| 4 `MutationClocked` | — | No | A Trace orders a new row by its clocked time before the answer |
| 5 `Stamp.clock({ on })` | 4 | Yes (`Stamp.clock` becomes a function) | `editedAt` is stamped and predicted on update, and a retry keeps it |
| 6 Prediction law | 1–5 | No | Conformance passes for Chirp and the reference app; mutating a server stamp fails it |

Steps 1, 2 and 4 are independent and can run in parallel. Each step lands with
its README and skill-reference updates, changelog entry, mutation spec, and a
green CI run on `main` (`gh run list --branch main`), not only local checks.
