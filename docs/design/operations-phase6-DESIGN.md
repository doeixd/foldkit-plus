# The law (operations phase 6, #257)

Status: design (2026-10-28). Phase 6 of [operations-PLAN.md](./operations-PLAN.md).
It builds on phase 5's client rules ([phase 5](./operations-phase5-DESIGN.md)).

## The problem

Phases 1 to 5 gave the client its own interpreter for every rule a declared
write runs. Only phase 1's `Judge` against SQL was checked against the
server, case by case. Nothing checks that what `Data.mutate` shows while a
write is pending is what the server then stores: a count moved by two, a
`may` foreseen wrong, a row placed where the server does not list it all
pass every test that checks one side.

## Decision

```text
law:  for every part the client predicts (not unknown), the server's answer equals it

CI:          Law.check(client, server, operation)      → parts compared, mismatches
development: verifyPredictions                         → one PredictionMismatch per part
```

### 1. `Law.check`, in `foldkit-remote-server`

`Law.check` runs one operation through both interpreters as an application
does, with nothing stubbed:

1. **The client holds what it reads.** Every row named in `holds` is read
   through the server's handlers as the principal, all of its members, and
   reduced into the client's Model (`ReadReceived`); every list in `lists` is
   queried and merged (`ConnectionMerged`). So the client holds exactly what
   the server would send it, and nothing a guard hides.
2. **The client predicts.** `Data.mutate` with the given `now`, as an
   application calls it. What its request's layer shows (each patched row's
   fields, each deletion) and each list's order are the prediction; a list
   the client could not place (marked stale) is unknown.
3. **The server writes**, through `FoldkitRemoteMutate` with the same `now`
   and principal.
4. **Compare.** Each predicted row is read back as the principal; each list
   is queried again. A refusal by the server is compared with the client's
   local verdict (§4).

It returns the parts compared and the mismatches, and **fails when it
compared nothing**: two sides that both said nothing agree, and agreeing is
not evidence. A test asserts the mismatches are none and names the parts it
expects compared, so a prediction that silently stops is caught too.

It lives beside `RemoteServer` because it needs both packages and the server
already depends on the client. It is exported from the package root, not a
new subpath.

### 2. `PredictionMismatch`, in development

`Remote.make({ verifyPredictions: true })` replaces `verifyPlacement` and
`verifyAnswers` (breaking). One diagnostic, `PredictionMismatch`, carries
the part that disagreed:

| `part._tag` | Was | When |
| --- | --- | --- |
| `Value` | new | an answered field differs from what the request's layer showed |
| `Placement` | `PlacementMismatch` | the server's first page lists a placed list otherwise |
| `Gap` | `AnswerGap` | an answer left out a field the client showed |

`Value` is decided where the answer lands: for each field the request's
layer patched, the store after the answer against the store as shown before
it, skipping a field another pending request also patches (it shows that
one's value both times).

### 3. Lists over paths, judged over the store

`matching` and `belongsEncoded` judge with `Judge.query` over the store as a
holder (`holderOf`), not `evaluateEach` over plain rows. A body reading a
path or a path from the viewer is judged three-valued: known where the
store holds the rows the path reaches, unknown (left to the server)
otherwise. A body over one row judges as before.

### 4. A write refused locally

`Data.mutate` judges the Entity's invariants over the row the write leaves
(the store's row with the write's values over it, a moved field not held).
Where one is **definitely false**, it sends nothing: the request fails at
once with the `Invalid` refusal the server would send (`rule`, `message`,
`path`), through the same `MutationFailed` path, so an application handles
both alike. Undecided refuses nothing.

`Law.check` holds this to the law: a server's `Invalid` must meet a client
verdict that is not `Valid`, and a client `Invalid` must meet a server
refusal. The CHECK constraints are the server's last word on the same
invariants; the suite also writes a row the CHECKs refuse straight into the
database and requires the client's judgement of it to be `Invalid`.

### 5. Counts and exists stay deltas

`Derived.count` and `Derived.exists` are not moved onto `Expr` evaluation.
A count is not an `Expr` (no aggregate exists), and over the store either
would be unknown: the store never holds every row pointing at one
(`holderOf`'s `pointing` is always incomplete). What the client can know is
the change a write makes, which `derivedOfWrite` predicts. The law is what
was missing, and the conformance cases cover every count and exists Chirp
and the test domain declare.

## Deferred, to phase 7

- **Write rules over paths**, judged in SQL in the write's statement.
- **Refusing on a false `may`.** `may` is foreseen for the written row; a
  write's own guard rules are the server's, and refusing on a held `may`
  needs the write's surface named on the client.

## Tests

- `packages/remote-drizzle/test/law.test.ts`: a test domain on SQLite,
  PGlite and the locale Postgres job; `examples/chirp/test/law.test.ts` and
  `examples/reference/test/law.test.ts`; a mutation spec breaking each
  interpreter (a count by two, `now` moved, an order inverted, an invariant
  ignored) that the suites must kill.
- `packages/remote/test/verifyPredictions.test.ts`, replacing
  `verifyAnswers` and `verifyPlacement`.
