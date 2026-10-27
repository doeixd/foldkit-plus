# A failed write is the ledger's to keep (#260)

Status: built (2026-10-27) in `foldkit-remote`: `Data.failedWrites`,
`Data.retry`, `Data.dismiss`, and the wiring's `shared`. Deferred: a
development warning about a failure nobody reads, which waits for #237's
diagnostics channel.

## The problem

When a write fails, its optimistic layer is released and the change goes.
Nothing told the application. `Page.assemble(Data.wiring(actives))` routes
`MutationFailed` into Remote's reducer, and the application's own update
never sees it. So by default a post, a like or an edit vanished with no word.
Chirp kept its own list of every write it sent (`sent`, with each one's kind
and draft), pruned by guessing from `Data.mutation`'s `Unknown`/`Applied`, and
a write that skipped `tracked(...)` still failed silently.

Remote already kept a ledger: `pending`, `applied`, `failed`, each failure's
error and operation id. It did not keep what the write was, so the
application had to.

## Decision

```text
Data.mutate ──MutationStarted { write: { mutation, input, keys } }──▶ ledger.writes[requestId]
                                                                        │
MutationSucceeded ──▶ applied; the write and any old failure are dropped
MutationFailed    ──▶ failed (bounded window); the write stays beside its error
                                                                        │
Data.failedWrites(model, M?)  ◀── reads ─────────────────────────────────┤
Data.retry(model, requestId)  ──▶ Data.mutate(M, input, { requestId, keys, optimistic })
Data.dismiss(model, requestId) ──▶ forgets the failure and its write
```

1. **The ledger owns what a write was.** `MutationStarted` carries
   `write: { mutation, input, keys }`, and the reducer records it with the
   optimistic operations the request showed. It is dropped when the request
   applies (with any earlier failure of it, so an applied retry is not still
   listed) and pruned with the failure window (1024). `Data.forget` drops
   it, as it drops every failure: a write of the last principal is not the
   next one's to retry.
2. **`Data.failedWrites(model, mutation?)`** lists every failed write, oldest
   first, as `{ requestId, mutation, input, error, refusal }`. Given a
   mutation, only its writes, typed by it, with the refusal decoded by its
   `Refusal` (the function `Data.refusal` now shares). A retry in flight is
   pending, not listed.
3. **`Data.retry(model, requestId)`** is `Data.mutate` with what the ledger
   recorded: the same input, keys, request id, and so the same operation id,
   which `mutate` already reuses for a failed request; the optimistic
   operations show again. It is `None` for anything not failed, so a second
   press while the first is in flight sends nothing.
4. **`Data.dismiss(model, requestId)`** forgets a failed write. Anything else
   returns the same Model.
5. **Hearing a failure in `update` uses the assembly's own mechanism.**
   `Data.wiring(actives, { shared: ['MutationFailed'] })` declares those
   tags shared (`Wiring.shared`, which Mirror's URL wirings already use).
   Remote reduces the Message first, then the application's own update
   receives it, typed: the tag joins the own update's Message union, so an
   exhaustive match must answer it, and removing the option makes it a
   compile error again. Its Model already lists the failure.

## Options considered

- **The issue's `onSettled: { failed: failure => Message.X(...) }`.**
  Rejected: a callback that builds a second Message for the same fact. The
  assembly already has a way for an integration to let the parent observe a
  tag it reduces, and `MutationFailed` is already one of the application's
  Messages.
- **Recording the write on `MutationFailed`.** It would need the input to
  travel only on failure, and leave a pending write unrecorded. Recording at
  the start keeps one record per request from start to settle, which is also
  what #247's outbox will persist.
- **Requiring `write` on `MutationStarted`.** `Data.mutate` always gives it.
  The field is optional so the reducer tests that build `MutationStarted` by
  hand keep testing layers alone; such a request is not listed when it fails.
- **`failedWriteRetention`, a timer that drops old failures.** Rejected: it
  would hide a failure the reader has not seen, the silence the issue is
  about. The window bounds memory; the application decides when a failure
  is answered.
- **A `Mutation.is(M, failed)` guard over an untyped list.** The optional
  mutation argument narrows by construction, with no guard to forget.

## Deferred

- **A development warning for a failure nobody observes** (issue point 4).
  It belongs to the diagnostics channel #237 proposes, which does not exist
  yet; a console line from Remote alone would be a second channel. Until
  then a failure is visible in the Model (`Data.failedWrites`,
  `Remote.inspect(...).mutations.failed`).
- **Persisting failed or pending writes across a reload**: #247.

## Tests

`packages/remote/test/failedWrites.test.ts`, with `failedWrites.mutations.ts`
(16 mutations, all killed): listing, order, typing and refusal by mutation;
in flight and applied writes unlisted; a write in flight kept while another
fails; the window; `forget`; retry with the same request id, operation id,
keys and optimistic change, refused while pending, listed once on a second
failure, lifted through a fold; dismiss; and an assembled application's own
update receiving `MutationFailed` after Remote reduced it, with the type of
its Message checked. `readme.test-d.ts` checks the README's calls, and a
wiring refuses a tag that is not Remote's.
