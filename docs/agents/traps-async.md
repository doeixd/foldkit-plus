# Traps: async, ordering and fibers

Read before writing code that awaits, forks, subscribes, or depends on the order of Messages or frames.

- **Re-check invariants after every `await`, and ask what else can run while you are suspended.**
  A `disposed` flag read once before two awaits still registered tools after disposal; moving bookkeeping after an await fixed a false-success bug and introduced double registration, so overlapping passes had to be serialized.
- **A Subscription lands after the first frame: what the first frame must show goes through `flags`.**
  Foldkit starts Subscriptions after the first render, so a restore made in one drew `Loading` for a frame on every reload (#262); `flags` run with the resources Layer before `init`.
- **Foldkit draws the next screen before a Navigate Command runs.**
  A scroll offset recorded on `navigate` or `popstate` was already clamped to the new, shorter page, and a restore made when the entry changed was undone by the loading state drawn after it. Record at the reader's action and hold a restore until the screen settles (`examples/cms/src/scroll.ts`).
- **Subscribe before the action that can produce the event.**
  `update` can emit a completing Message synchronously, so a listener attached after the dispatch misses it and waits for its timeout.
- **A Message that reopens a gate must land before what can trip it.**
  A restarted live stream emitted `GapCleared` beside its resubscribe (`Stream.merge`); a failing resubscribe hit the still-open gap (which ignores further breaks) and the late `GapCleared` then closed it: the stream stopped for good (every run once a test made the resubscribe fail). Sequence them with `Stream.concat`.
- **An Effect handed to a loop is the one value, built once.**
  `Effect.sleep(every).pipe(Effect.andThen(resolve(request)), Effect.forever)` called `resolve` when the loop was built and re-ran that one Effect (a resolver answering `Effect.succeed(sessions.get(token))` had decided already, so a revoked session was never seen). Pass a function (`Effect.andThen(() => resolve(request))`) or `Effect.suspend`, and test with a resolver that decides when called.
- **Guard fire-and-forget work, and catch defects at an edge that must not throw.**
  An un-awaited reconcile turned a failure into an unhandled rejection; `Effect.result` captures failures, not defects.
- **Settle subscriptions before advancing TestClock.**
  A forked stream fiber registers window listeners on the real scheduler and `TestClock.adjust` moves virtual time without yielding to it, so events dispatched right after the fork hit nothing and a debounce test observed the un-reset timer. Yield (a hundred `yieldNow`) after the fork before the first adjust.
- **Keep interrupting a cold Z3 context until its check settles.**
  The WASM worker can enter `check` after the first interrupt and run to its timeout (#627). Retain the solver permit and retry the context interrupt until that check returns.
