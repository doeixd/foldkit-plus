# A deterministic trace of reads, without a browser (#250)

Status: slice 1 built (2026-10-27): `foldkit-remote/testing`'s `Trace` and
`Respond`, over queries, read batches and mutations. See [Deferred](#deferred).

## The problem

"A list on screen never blinks to `Loading`" (#234) is a property of the
reducer, the read entries that plan and fetch, and the order answers land in.
Until now the only way to test it whole was a browser. Chirp's e2e held the
mutate request at the network and sampled `main.innerText()` every 100 ms
for four seconds. That is slow, and flaky in the way that matters: the #243
blip showed in some runs and not others, and a one-frame regression can fall
between two samples.

The pieces it needs already exist and are deterministic: `update` is pure, a
read entry's plan is a function of the Model, and every answer is a Message.
What is missing is a driver that runs them in a chosen order and keeps every
Model in between.

Two tests in `foldkit-remote` hand-roll parts of that driver:

- `departed.test.ts` stood in for the retain entry by writing
  `RetentionChanged` Messages itself (`showing(...)`), and for the read entry
  by asking `Remote.planQueries` whether a refetch would be planned. Neither
  is what the runtime does, so a change to either entry could pass it.
- `heldValue.test.ts` walks every `RemoteMessage` through `Data.reduce` and
  checks the #234 rule by hand (`holds`, `kept`, `violations`).

## What it is

```text
steps ──▶ update ──▶ Model ──▶ read entries (the real ones) ──▶ requests, held
  ▲                                                                 │
  └──────────── Respond.query / read / mutation releases one ◀──────┘
                      (answered by the test's RemoteClient)
```

`Trace.run(Data, config)` runs the application's `update` and the domain's
own Subscriptions (`Data.subscriptions(active)`), starting at a Model. Every
request a read entry or a Remote Command makes is **held**. A step is either
one of the application's Messages, sent through `update`, or a `Respond`,
which lets one held request go on: the test's `RemoteClient` answers it (or
the step names a failure), and the Messages that follow run until everything
waits again. Every Message is recorded with the Model it left.

`Trace.tags(trace, read)` is what a read showed across the trace, one entry
per change of tag. `Trace.regressions(trace, reads)` is every time a read
that showed a value stopped showing it with no reason a reader can see,
named with the Message that did it and `Data.why`.

```ts
const trace = await Trace.run(Data, {
  start: loaded,
  update,
  active,
  client: server, // what answers a request once a step lets it go on
  steps: [
    Message.Created({ id: 'p2', name: 'Two' }),
    Respond.mutation(Create),       // the answer lands first
    Respond.read(Project, 'p2'),    // then the row's fields
  ],
})
expect(Trace.regressions(trace, { list })).toEqual([])
expect(Trace.tags(trace, list)).toEqual(['Ready', 'Refreshing', 'Ready'])
```

## Options considered

1. **A reducer-only trace**: steps are `RemoteMessage`s, folded with
   `Data.reduce`. Cheap, and what `heldValue.test.ts` does. Rejected as the
   design: it cannot see what the read entries do in response (a restart that
   abandons a request, a `ReadStarted` that marks a row loading, the
   `RetentionChanged` the retain entry sends), which is where #225 and #243
   lived. A test author would write those Messages by hand, a second copy of
   the entries' behavior that can drift from it.
2. **A copy of the entries' behavior in the trace**: plan from the Model,
   emit `QueryStarted`/`ReadStarted` and the answers itself. Rejected for the
   same reason, in library code: two owners of "what a read entry sends".
3. **Run the real entries and Commands, with a held client** (chosen). The
   entries' streams run on Effect fibers under a scheduler the trace flushes
   itself, so everything is synchronous between steps. The `RemoteClient`
   each fiber sees parks every call on a callback; a `Respond` step resumes
   one with what the test's client answers. Restarts follow Foldkit's
   runtime: after each Message every entry's dependencies are recomputed, and
   one whose dependencies changed under its schema's equivalence (or its
   `keepAliveEquivalence`) is interrupted and started again, abandoning what
   it held.
4. **Story or Scene with resolvers**: Foldkit's `Story` resolves Commands by
   name with result Messages. It does not run Subscriptions, and a resolver
   that hands back a Message is the hand-written answer of option 1.

### Where it lives

A subpath, `foldkit-remote/testing`, not a method on the domain. It is test
code: it should not be on every application's `Data` or in its bundle. It
takes the domain as its first argument, so every reference stays typed
(`Respond.query(list.ref)`, `Respond.mutation(Create)`,
`Respond.read(Project, id)`), and it can say `Data.why` for a regression.
#239 proposes `foldkit-plus/testing` for the Workers stack and Playwright
behaviors; that umbrella can re-export this when it exists.

### What answers

The test hands the trace a `RemoteClient` service. The trace decides *when*
a request is answered; the client decides *what* the answer is. That client
can be a fake over a few rows, or a server's in-process handlers, so a test
that wants realistic answers uses the server it already has instead of
writing pages by hand. A step may name a failure instead
(`Respond.query(ref, { fail })`), which is what an interleaving with a failed
refresh needs; there is no per-step answer override, since the client
already owns the answer.

## The API

```ts
import { Respond, Trace } from 'foldkit-remote/testing'

Trace.run(Data, {
  start,      // the Model the Subscriptions start at
  update,     // the application's; it must take Remote's Messages (a type error otherwise)
  active,     // the active record, as Data.subscriptions and Data.why take it
  options?,   // Data.subscriptions' options, less `now`
  client,     // RemoteClient['Service']: what answers a released request
  steps,      // the application's Messages and Respond steps, in order
}): Promise<Trace<AppModel, Message>>

Respond.query(ref, { fail? })      // the oldest held query of that connection
Respond.read(Entity, id, { fail? }) // the oldest held read batch asking for that row, whole
Respond.mutation(M, { fail? })     // the oldest held request of that mutation
Respond.all                        // everything held, and what that leads to, until nothing is

trace.entries  // { step, message, model, skipped }: every Message, in order
trace.pending  // the requests still held at the end
Trace.tags(trace, read)              // ['Ready', 'Refreshing', 'Ready']
Trace.regressions(trace, { list })   // [{ read, step, message, from, to, why }]
```

`step` is 0 for what the Subscriptions sent as they started, then the
1-based index of the step that caused the Message. `skipped` names the
Commands an `update` returned that the trace did not run.

### The rule `regressions` checks

A read that showed a value (`Ready`, `Refreshing`) must after the next
Message still show it (`Ready`, `Refreshing`), fail *with* it (`Failed` with
`previous`), or say the server has no such row (`NotFound`). `Loading`,
`Initial` and a `Failed` without the value are regressions (#234). The rule
is checked between every two consecutive Models, so a regression that lasts
one Message is caught.

It does not know the exceptions `heldValue.test.ts` names (a `Hydrated`
snapshot under `replace`, retention past `departedLimit`, every row of a
list deleted): those really remove the value, and a test that walks into one
filters it by the Message that caused it.

## Failing loudly

- A `Respond` that matches nothing held throws, naming the step and listing
  what is held. A request abandoned by a restart is no longer held, so
  answering it is this error, as in the runtime its answer reaches no one.
- A Subscription or Command that dies throws with its cause, as the runtime
  crashes on one.
- A step that causes more than 10,000 Messages, or a `Respond.all` that has
  answered 1,000 requests and still holds more, throws as a loop.
- `update` must take Remote's Messages: an `update` typed over the
  application's own Messages alone is a type error at `update`, since the
  Subscriptions would send it Messages it does not handle.

`Respond.all` with nothing held is not an error: it is how an interleaving
says "and then the rest", whatever the rest turned out to be.

## What it models, and what it does not

Modelled:

- `update`, with Remote's own Commands (`Remote.mutate(…)`,
  `Remote.preload`) run against the held client.
- Every read entry and the retain entry, restarted as the runtime restarts
  them, each Message handled before the next, every Model recorded.
- A request abandoned by a restart.

Not modelled:

- **Time.** The trace's clock stands still: a wait of zero ends (as the next
  tick would end it), a longer one never does. So a retention `grace`, an
  age-out under a refreshing policy and a live restart's backoff never fire.
  `now` is 0 for every Message the entries stamp.
- **Live streams.** A live entry's subscription is opened and never sends;
  script its events as `LiveReceived` Messages.
- **Other Commands and Subscriptions.** Only Remote's run; the rest are named
  in `skipped`. An application's own Subscriptions (a URL, a key) are not
  started: pass `active`, not the application's whole subscription record.
- **Folded domains.** `Remote.fold` lifts Remote's Messages into a wrapper;
  the trace sends them unwrapped, so it drives a domain whose Messages are in
  the application's union (`Data.wiring`, or `...Remote.messages`).
- **The view.** It records Models; what a Model draws is a Scene test.
- **Concurrency between a stream and the runtime.** Foldkit hands a Model to
  each Subscription asynchronously, so a stream may emit a Message or two
  more before it is restarted. The trace restarts at once. Both orders are
  allowed by the runtime; the trace takes one, deterministically.

One thing to know: `Data.subscriptions` registers the active record's readers
with the domain for good, because retention is the domain's. A test file that
traces several active records over one domain roots all of them in each
later trace; give such a test a domain of its own.

## Deferred

- `Respond.live(event)` and time steps (`Trace.advance(duration)`), so live
  restarts, `grace` and age-outs can be traced.
- Folded domains (`Remote.fold`): run its lifted Subscriptions.
- A typed answer override (`Respond.mutation(M, answer => …)` from the
  issue), if a test turns out to need one its client cannot give.
- `foldkit-plus/testing` re-exporting this (#239), and Chirp's sampled e2e
  becoming a smoke test with a Trace test beside it.
- Rewriting `heldValue.test.ts`'s seeded walk over `Trace`: its generators
  build a Message from the Model of the moment (a live cursor), which a list
  of steps cannot, and its subject is the reducer alone. It stays as it is.
