# One operation, two interpreters (#232, #242, #247, #257)

Status: plan (2026-10-28). It replaces `232-stamps-revision-PLAN.md`, which
patched stamps inside the current shape; most of its steps are special cases
of this plan. It builds on [232-write-effects-DESIGN.md](./232-write-effects-DESIGN.md),
[233-derived-members-DESIGN.md](./233-derived-members-DESIGN.md) and
[245-mutation-answers-DESIGN.md](./245-mutation-answers-DESIGN.md).

API names marked *schematic* are proposals to be settled in each phase's
design note. Every other name exists in the code today.

## The idea

**Every rule in the domain is an `Expr`, and a write's context is part of the
language.** A write is an *operation*: a pure function of its input, its
context, and the rows it can see. The client and the server each interpret
the same declaration. The client does it in memory, against what it holds,
and that is the prediction. The server compiles it to SQL, against the real
data, and that is the truth.

```text
operation(input, context { viewer, now }, visible rows)
  → the row, the derived values it moves, the lists it joins or leaves, whether it is allowed

client: memory interpreter, three-valued    → prediction (unknown ⇒ wait for the answer)
server: SQL interpreter, in a transaction   → truth
law:    where the client's answer is not unknown, it equals the server's
```

## Why: what this replaces

Today four related things are four mechanisms:

| Rule | Today | In this design |
| --- | --- | --- |
| A list's membership and order | `Expr` (query body, `OrderTerm`) | unchanged |
| A derived member | `Derived.count` / `Derived.exists`, special-cased in `bind` and in the client's prediction | `Expr` over relations; `Derived.*` stay as constructors of it |
| An invariant | `Expr`, server and CHECK only | `Expr`, also run on the client (forms, predictions) |
| Who may write | guard rules, server only | `Expr` over the row and `Expr.viewer`, also run on the client |
| A server-chosen value | `Entity.stamps({ author: Stamp.viewer, createdAt: Stamp.clock })` | a field whose value is an `Expr` over the context |

The landed stamps work has four debts, and each one dissolves here:
- **One fact as two members.** `authorId` and `author`, `userId` and `user`.
  Dissolved: `author = Expr.viewer` on the relation, and rules compare
  relation refs directly.
- **The viewer defined three times.** Dissolved: one context provider per side.
- **No replacement for `presets`.** Dissolved: `orgId = Expr.viewer.org`, a
  relation path.
- **A stale predicted time** (`lastHeard`). Dissolved: `now` is captured at
  the user's action and shared with the server.

## The design

### 1. Context is part of `Expr`

`Expr.viewer` and `Expr.now` (*schematic*) are terms like a field.
`Expr.viewer` is a `one`-relation-shaped term, so paths through it work:
`Expr.viewer.pipe(Expr.path(User.relations.org))`.

Each side provides the context once:

- **Client:** `Remote.make({ viewer })`, which exists today. `now` comes from
  the operation (§4).
- **Server:** `RemoteServer.make({ viewer })`, which exists. Sources and
  writers read it from the server they are mounted in. `source(…, { viewer })`
  is removed.

### 2. A field's value may be an `Expr` over the context

```ts
// schematic
const Post = Chirp.Post.pipe(
  Entity.sets({ author: Expr.viewer, createdAt: Expr.now }, { on: 'create' }),
  Entity.sets({ editedAt: Expr.now }, { on: 'write' }),
)
```

- A member that `sets` names is never input. The server refuses an input
  that sets it, because the operation computes it.
- `author` is the relation itself. A guard rule says
  `Expr.eq(Like.relations.user, Expr.viewer)`, so Chirp's `Post.authorId` and
  `Like.userId` go.
- `on: 'write'` covers `editedAt`, with no separate mechanism.
- `Entity.stamps` and `Stamp` are removed. This is breaking; they are unreleased.

### 3. Three-valued evaluation is the client's rule (#242)

- The client evaluates every `Expr` to *true*, *false* or *unknown*. *Unknown*
  is the result whenever a term reads a row or field the store does not hold,
  a server-only filter, or a field hidden from this viewer.
- Only *true* and *false* become predictions. *Unknown* means no prediction
  for that part: a list it can't judge is refetched, and an invariant it can't
  decide isn't refused locally.
- Relation paths (`Expr.path`, `Expr.exists` over a relation) are the other
  half of #242. They are what makes `Expr.viewer.org` and `exists(…)` express
  derived members and rules.
- This one rule replaces today's ad-hoc cases, such as "a list whose body the
  client can't judge is the server's to place" and "a refused prediction drops".

### 4. An operation is a value, with its context captured once

```ts
// schematic
interface Operation<W> {
  readonly write: W                // the declared write
  readonly id: string              // the request id, as today
  readonly input: WriteInput<W>
  readonly context: { readonly now: number } // viewer is not sent; the server's principal is it
}
```

- `Data.mutate` builds it, predicts from it at once, and its Command sends it.
- **`now`:** the client captures it when the user acts and sends it with the
  operation.
  - Today `Data.mutate` runs in `update`, which reads no clock. So `now` is
    read by a Command, as today's `MintId` reads randomness, and carried by
    the Message that calls `Data.mutate`. The phase's design note decides
    between that and a `MutationClocked` follow-up Message. The constraint is
    that the predicted value and the sent value are the same number.
  - The server accepts the sent `now` if it lies within a skew bound of its
    own clock: default 60 s, set with `RemoteServer.make({ clockSkew })`
    (*schematic*). Otherwise it uses its own time and reports a
    `ClockSkewed` diagnostic. The bound keeps a client from backdating rows
    by more than that.
- **`viewer`** is never sent. The server reads it from the principal. The
  client predicts with its own identity, which is the same value for a
  signed-in client.
- Because the context travels with the operation, a retry repeats it exactly:
  same id, same `now`, so it is idempotent with the same stored values (#203's
  class of bug can't recur).

### 5. One law, checked three ways (#257)

*Where the client's evaluation is not unknown, it equals the server's.*

- **Conformance in CI:** for each declared write in Chirp, the reference app
  and a test domain, run the operation through the client interpreter and
  through `RemoteServer.write`, with the same principal, the same `now`
  (`TestClock`), and the client holding everything the operation reads.
  Compare the row, the derived values, the list placements and `may`. It runs
  on SQLite, on PGlite, and on the Postgres-locale job.
- **In development:** when an answer lands, compare it with the prediction
  for every part that wasn't unknown, and report one `PredictionMismatch`
  diagnostic. That replaces `PlacementMismatch` and `AnswerGap` as separate
  mechanisms; they become its cases.
- **CHECK constraints** stay the third interpreter (#259). The conformance
  suite checks that a row the CHECKs refuse is one the client's invariant
  evaluates to *false*.

### 6. What it gives, for free

- **`may` on the client.** Guard rules evaluated three-valued predict whether
  you may edit the row you just made (#242). Chirp then draws a new chirp in
  the timeline before the answer.
- **Forms validate with the domain's invariants.** The form runs them locally
  and the server enforces the same ones.
- **Retries and a durable outbox.** An `Operation` is a value. `Data.retry`
  (#260) sends the stored one again. Persisting failed and pending operations
  across a reload is #247's outbox, with no new model. This is the same shape
  as Sync's durable Messages, so Remote writes and Sync operations converge.
- **`Data.why` explains predictions.** Each is an evaluated `Expr`, so it can
  say why a row joined a list, or which term was unknown.

## Security model

- **The client's result is never trusted, only its inputs.** The server
  re-evaluates every rule, value and invariant from the operation's input,
  its own principal, and its own data.
- **Of the context, only `now` comes from the client,** and only within the
  bound. A server that must not accept client time sets `clockSkew: 0`.
- **A client can predict a rule it can't see the data for only as *unknown*.**
  Rules over hidden data never leak through predictions, because unknown
  predicts nothing.

## Limits, on purpose

- **Opaque writes.** A hand-written handler, or one that calls an external
  API, isn't an `Expr`. Its prediction is unknown, and the answer brings the
  truth (#245), as today. Such a handler names the rows it touched with
  `Remote.patch(Entity, id, {})`, which exists.
- **Writing on someone's behalf.** An `actAs` capability under which
  `Expr.viewer` is taken from the input is a later, separate decision.
- **Server-minted ids.** Clients name ids. A server id breaks the operation's
  value identity and needs its own design.

## Phases

| Phase | What | Replaces / closes | Breaking | Done when |
| --- | --- | --- | --- | --- |
| 1 | Three-valued `Expr` evaluation and relation paths in `foldkit-entity` | #242 (core) | No | Every operator has a three-valued memory interpreter; `unknown` is produced for unheld rows and hidden fields; paths compile to SQL on SQLite and Postgres; conformance passes |
| 2 | Context terms (`Expr.viewer`, `Expr.now`); one context provider per side | plan step 2; part of #251 | Yes: `source`'s `viewer` | `viewer` is defined once per side; a binding that needs it fails at `RemoteServer.make`, naming it |
| 3 | `Entity.sets(…, { on })` over context; remove `Entity.stamps`; relation-only author; rules compare relation refs | stamps, plan steps 1, 3, 5 | Yes: `Entity.stamps`, `Stamp`, Chirp's `authorId`/`userId` | Chirp and the reference app declare `author`/`user` once; `orgId` from a viewer path in a test domain; `editedAt` on update |
| 4 | `Operation` with captured `now`; `clockSkew` on the server | plan step 4; #203's class | No | A new row's predicted `createdAt` equals the stored one in a Trace with a fixed clock; out-of-bound time reports `ClockSkewed` |
| 5 | The client runs the existing interpreters (derived members, invariants, guard rules) three-valued, over the operation | the special cases in `predictionOfWrite`; #242's `may` | No | Chirp draws a new chirp before the answer; the form validates with the Entity's invariants |
| 6 | The law: conformance in CI; `PredictionMismatch` in development | #257; folds `PlacementMismatch`, `AnswerGap` | Yes: those diagnostic variants become cases of one | Conformance runs in `pnpm test`; a deliberately wrong interpreter fails it |
| 7 | The durable outbox on stored `Operation`s | #247; `Data.retry`'s reload gap (#260) | No | A failed or pending write survives a reload and retries with the same id and `now` |

- Phase 1 is the foundation: 2 needs paths through the viewer, and 5 needs
  three-valued evaluation.
- Phases 2 and 4 are independent of each other and can run beside 1's later
  parts.
- Phase 6's dev check can start as soon as 3 lands, and its conformance
  suite grows with each phase.

Each phase lands with:
- its design note (deciding its *schematic* names);
- README and skill-reference updates, and a changelog entry with breaking
  changes marked;
- mutation specs;
- for a phase that touches prediction, a `heldValue.test.ts` generator;
- a green CI run on `main`, checked with `gh run list --branch main`, not
  only local checks.

## Risks

- **`Expr` growing into a general language.** Hold the line: only what can
  compile to SQL and evaluate three-valued in memory. Anything else is an
  opaque write.
- **Cost of evaluation on every write.** Evaluation is over loaded lists and
  rows the write touches, as `impact.ts` does today. Memoize the compiled
  operation per write declaration, at definition time.
- **The phase-4 timing choice** (`now` in the calling Message versus a
  follow-up Message) affects ergonomics. Decide it with one real app, Chirp,
  before generalizing.
