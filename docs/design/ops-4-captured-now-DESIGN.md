# A write's time is captured at the reader's action (#232, plan phase 4)

Status: built (2026-10-28). Phase 4 of [operations-PLAN.md](./operations-PLAN.md):
`Data.mutate`'s `now`, `Remote.now`, the request's `now` on the wire,
`RemoteServer.make`'s `clockSkew` and the `ClockSkewed` diagnostic. Proven in
`examples/chirp` and `examples/reference`.

## The problem

[232-write-effects-DESIGN.md](./232-write-effects-DESIGN.md) predicted a
`Stamp.clock` as the time the store last heard from the server (`lastHeard`),
because `Data.mutate` runs in `update`, which reads no clock. That number was
never the one the server stored: the server read its own clock when the
request arrived, so a new chirp drew at one time and moved when the answer
brought another. The plan's constraint for this phase: **the predicted value
and the sent value are the same number**, and a retry carries it again.

## The decision: the time is read by a Command and carried in the Message

The plan left two options open:

- **(a)** `now` is read by a Command, as Chirp's `MintId` reads randomness,
  and carried in the Message that calls `Data.mutate`.
- **(b)** `Data.mutate` predicts at once, its Command reads the clock and
  sends a follow-up `MutationClocked` that restamps the pending layer, and the
  request goes out after it with that `now`.

Both were worked through on Chirp's post and like. **(a) is built.**

```text
the action ──▶ Remote.now(now => Message.ClockedPost({ post, now }))   a Command: Effect's Clock
                     │
ClockedPost ──▶ Data.mutate(model, PostChirp, post, { now })
                     ├─ the prediction stamps createdAt = now          (in update, pure)
                     ├─ the ledger keeps now beside the input          (StartedWrite.now)
                     └─ the request sends now                          (MutationRequest.now)
server ──▶ |now − own clock| ≤ clockSkew ? now : own clock (+ ClockSkewed)
retry  ──▶ the ledger's now again
```

Why (a):

- **One number, decided once.** In (a), `now` exists before the prediction is
  made, so the pending row is drawn at the time that is sent. In (b) the
  first frame of the pending row has no time, or a stand-in. A stand-in is
  `lastHeard` again, and the row moves when `MutationClocked` lands. With no
  stand-in, the row is absent from a list ordered by time until the restamp.
  Either way (b) draws one value and sends another.
- **(b) needs the reducer to send.** A Foldkit Command yields one Message, so
  the request must leave after `MutationClocked`. That means a Command
  returned from Remote's reduction of it. Only the wiring's `route` and
  `Remote.fold` return Commands. `Data.reduce` returns a Model, and the
  README's Quick start and `examples/remote` reduce Remote's Messages with
  it. There a write would be predicted and never sent, silently. Making every reduction return Commands
  breaks every such call site for one field.
- **The cost falls only where a value reads the clock.** A like stamps no
  time: `LikePost` keeps its one Message, and so do Chirp's edit and unlike.
  Under (b), every write would pay for a second Message. An insert already
  mints its id in a Command, as the reference app's `NameNote` does, and there
  the time rides in the same Command at no extra cost.
- **The choice is made at the action.** Chirp's heart decides like or unlike
  from the Model at the press, which is why `like` reads `Data.get(Liked, …)`
  in `update`. A follow-up Message decides against a Model one Message later.
  That is the "keys faster than a frame" trap: two presses before the
  restamp both see the old heart.

The cost of (a) is one Message and one Command at a write site that stamps a
time and does not already have a Command before it. `Remote.now(toMessage)`
is that Command. It reads Effect's `Clock`, so a test pins it with
`TestClock`, and `Trace.run` runs it, since it is one of Remote's Commands, at
the trace's `now`.

### Without `now`

`Data.mutate` without `now` predicts no time. The row reads as missing the
stamped field until the answer brings the server's. This is the plan's
three-valued rule: a value the client cannot know is unknown, and unknown
predicts nothing. `lastHeard` is removed. It was a known-wrong value drawn as
if it were right, and nothing needs it once `now` is given.

## The stored operation

The plan's schematic `Operation { write, id, input, context: { now } }` is the
ledger's existing `StartedWrite`, keyed by request id, with `now` added
(`Option<number>`). `MutationStarted.write.now` carries it into the ledger.
`Data.retry` sends it again with the same input, keys, request id and
operation id. The server then stores the time the retry shows again, and a
writer's ledger answers the retry from its record (#203). The record keeps
its name, because `operation` already names the operation id, on the wire
and in the ledger's `operations` map. Calling the record `Operation` would
give that one word two meanings.

## The server

- **`RemoteServer.make({ clockSkew })`** is a `Duration.Input`: 60 seconds
  unless given, and `0` to never take a client's time. It is read when the
  server is made, so a value that is no duration fails there.
- **The handler decides the write's time once** (`writeTime`), before the
  source runs. It is the sent `now` when `|now − Clock| ≤ clockSkew`, and
  otherwise the server's own clock. Every `MutationSource.run` and
  `RemoteServer.mutation` handler receives it as `now: number`.
  `RemoteServer.write` stamps `Stamp.clock` from it. A hand-written handler
  that writes a time reads the same value, so its retry keeps the time too.
- **`ClockSkewed`** (`foldkit-remote-server`'s diagnostics: `mutation`,
  `sent`, `own`, `bound`) is reported through `Diagnostics` when a sent time
  falls outside a bound above zero. At `0`, refusing every client time is the
  configuration, so nothing is reported.
- The clock fields still reach the writer as `stamped`, which the retry
  comparison skips. A retry whose first attempt fell back to the server's
  clock, or an older client that sends no time, still answers the row it made.

## The wire

`MutationRequest.now` is `Schema.optional(Schema.Int)`, in milliseconds since
the epoch, the same as `Expr.now`.

- An older client sends none, and the server uses its own clock.
- An older server decodes with Effect's default and ignores the extra key.

`REMOTE_PROTOCOL_VERSION` changes only for `ReadRequest` or
`LiveRequirement`, and this is a mutation field that both ages accept, so it
stays at 4. `Remote.json` and `RemoteServer.answer` decode the request
through the schema, so Chirp's trace test proves the field crosses the wire.

## Security

Of a write's context, only `now` comes from the client, and only within the
bound. So a client can backdate or postdate a row by at most `clockSkew`. A
server that must not accept that sets `clockSkew: 0`. The viewer is never
sent: it is the server's principal.

## Smaller changes

- `DomainMutateOptions.now` and `MutateOptions.now` were `() => number`, the
  clock that dated the answer in the store. Both are now the reader's time, a
  `number`. The answer is dated by Effect's `Clock` when it lands. Two sibling
  options named `now` with different meanings would have been a trap.
- `TraceConfig.now` sets the time the trace's clock stands at. Every Command
  and Subscription the trace runs reads it, and so does every answer it asks
  a client for. Before, the clock always stood at 0.

## A retry without a ledger (#291)

Decided 2026-10-29. `writeTime` runs on every attempt, so a retried update
that falls back to the server's clock (no `now`, or one past `clockSkew`)
writes a new time, and replaces the one the attempt that landed stored. #291
asks to keep the time of the attempt that landed. The rule:

> Without a ledger, a retry is a new write, and the time it stores is that
> attempt's: the sent `now` while it lies within `clockSkew`, otherwise the
> server's clock at that attempt. Keeping the first landing's time on any
> retry is what a writer's ledger does.

- **Only a record knows a retry.** The operation id names a write across
  attempts, but an unledgered server keeps nothing under it, so it cannot
  tell a retry from a second write. The guess an unledgered writer makes for
  a conditioned write (the row already holds what this write sets) cannot
  decide the time: skipping the clock fields and then not writing makes a
  real second edit with equal values keep the first `editedAt`, and an
  unconditioned update reads no row before it writes, so the guess would add
  a read to every update.
- **The captured `now` already keeps it where it can.** The time the reader
  acted is decided once (`Remote.now`), predicted, sent, and sent again by
  `Data.retry` and the outbox. A lost answer retried within `clockSkew`, the
  common case, stores the same time. Past the bound the server's own clock is
  the rule phase 7 §9 states, since an outbox cannot tell an honest wait from
  a forged one.
- **Capturing a time for a write that passed none was rejected.** A sending
  Command could read the clock when `now` is absent, but that makes the
  client's clock the time of every write, including those an application
  leaves to the server on purpose, and the reading reaches the ledger only
  through another Message: (b) above, rejected for the same reasons.
- **The prediction does not change.** The client predicts from `now` or
  predicts no time, and `Law.check` compares one attempt, so it is unchanged.
- **What "the retry comparison skips" covers.** The server section says the
  clock fields reach the writer as `stamped`, which a retry comparison skips.
  A retried insert does not write a taken id again, so its row keeps its
  time. But #291 reports that an unledgered retry of an update pinned to a
  revision compares its new time with the stored one and conflicts with
  itself. That comparison is `foldkit-remote-drizzle`'s (`holdsWritten`); by
  the rule above it should leave out the fields the write sets on its own
  clock, since a retry's time is not evidence the write differs. It is left
  to that package.

## Deferred

- **Persisting the stored operation** across a reload: phase 7 (#247). The
  record now holds everything a re-send needs.
- **`now` for an update's clock** (`editedAt`): phase 3's
  `Entity.sets(…, { on: 'write' })`. The same `now` serves it unchanged.
- **`GuardServer.mutation`'s context** does not pass `now` on to its handler.
  It has no clock stamps of its own. Add it when a guarded handler needs one.

## Tests

- `packages/remote/test/stamp.test.ts`: the new row shows at the `now` given,
  a store that has heard from the server predicts no time without it, and a
  client clock behind the server's places the row by its own time, which the
  answer keeps.
- `packages/remote/test/failedWrites.test.ts`: the request sends `now`, and a
  retry sends the same `now`.
- `packages/remote/test/wire.test.ts`: `now` survives the JSON codec, and a
  request without it decodes.
- `packages/remote/test/trace.test.ts`: a trace's `now` reaches its Commands
  and the answers it asks for.
- `packages/remote-drizzle/test/stamp.test.ts`, over SQLite:
  - a time within the bound, before or after the server's, is written;
  - the bound itself is taken;
  - past it, the server's own time is written and `ClockSkewed` is reported;
  - `clockSkew: 0` never takes a client's time and reports nothing;
  - a retry with the same `now` answers the row it made.
- `examples/chirp/test/post.test.ts`: a `Trace` with a fixed clock submits
  the compose form. `Remote.now` reads the trace's time, and the chirp is
  predicted at it. The real server, through `Remote.json`, runs two seconds
  ahead and stores the same time. The answer leaves the row's time and its
  place in the timeline as they were.
- `examples/reference/test/notebook.test.ts`: a note is added at the time
  `NameNote` read.
- Mutation specs, all killed:
  - `packages/remote/test/stamp.mutations.ts` (19);
  - `packages/remote-drizzle/test/stamp.mutations.ts` (17);
  - `examples/chirp/test/chirp.mutations.ts` (two new);
  - `examples/reference/test/reference.mutations.ts` (one new).
- `heldValue.test.ts` gets no generator, because this phase adds no Message:
  `MutationStarted` carries `now` in its `write`, which only the ledger reads.
