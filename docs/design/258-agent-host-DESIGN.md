# The running application is the agent's host (#258)

Status: built (2026-10-27): `Agent.host(config)` hosts a Foldkit runtime in a
page, and `Agent.headless(config)` runs the same `init`, `update`,
Subscriptions and `resources` with no view, for tests and servers. The
kitchen-sink demo binds its agent to a headless runtime over the in-process
Remote server. Not built: see [Deferred](#deferred).

## The problem

`Agent.bind` needs a host, `{ model, dispatch, subscribe?, observe? }`, and a
real Foldkit application cannot give one:

- `Runtime.run` and `Runtime.hydrate` return nothing, `SSR.hydrate` wraps
  them, and `Runtime.embed`'s handle has only Ports and `dispose`. Foldkit
  exposes neither the Model nor a dispatch from outside the runtime.
- The hosts in the repository are `Sync.mount` (which builds its own runtime)
  and hand-written loops over `update` (`examples/todo/src/store.ts`, the
  kitchen-sink demo) that run no Command, Subscription or Remote read.

So an application on the recommended stack could attach an agent only by
keeping a second copy of the Model beside the runtime, which is a second owner.

## What owns what

```text
runtime  ── owns ──>  Model          (init, update, Commands, Subscriptions)
host     ── reads ─>  the Model the runtime committed
host     ── sends ─>  a Message into the runtime's own queue
agent    ── binds ─>  host           (expose, authorize, complete: unchanged)
```

The host owns nothing. It is an observation of the runtime plus an entry into
its queue, so an agent's Message runs exactly as a click's does: through
`update`, its Commands, its Subscriptions and Remote. Authorization stays in
`bind`; the host is never handed to an agent directly.

## Options considered

1. **A host returned by `SSR.hydrate` and `makeApplication`** (the issue's
   sketch). `makeApplication` is Foldkit's and returns a program, not a handle;
   `SSR.hydrate` would cover one of four starters (`run`, `hydrate`, `embed`,
   `SSR.hydrate`). Rejected: one seam per starter is four ways to do one thing.
2. **An inbound Port for dispatch.** Ports are reachable only through
   `embed`'s handle, and a Port decodes what it is sent, so a decoded Message
   with an `Option` field fails (the trap `Sync.mount` hit). Rejected.
3. **Wrap the application config, before any starter sees it (chosen).** Every
   starter takes the same config, so `Agent.host(config)` returns
   `{ config, host }` and the application starts `config` however it already
   does. Nothing in Foldkit or `foldkit-ssr` changes.

## The page host

```ts
const { config, host } = Agent.host({ Model, init, update, view, container, subscriptions })
Runtime.run(Runtime.makeApplication(config))   // or hydrate, embed, SSR.hydrate

const agent = TodoAgent.bind({ definition: AppAgent, host: { ...host, principal: () => principal } })
```

`Agent.host` returns the config with three additions:

- **`update`, wrapped.** After the application's `update` returns, the host
  records the new Model, reports the Message to `observe`, settles the
  `dispatch` that sent it, and tells `subscribe` when the Model changed. It
  records only a transition of the Model the runtime holds: DevTools'
  time-travel replays `update` over older Models, and those are not commits.
- **One Subscription entry, `foldkit-agent/host`.** Its stream is the host's
  queue, so a dispatched Message enters through `enqueueMessage`, the queue the
  DOM's events use. The runtime reads its `modelToDependencies` first with the
  Model it booted with (fresh, hydrated, or restored by a development reload,
  which skips `init`, so wrapping `init` would miss it), before it processes any
  Message. The stream's start is when the host starts accepting Messages, and
  its end when the host learns the runtime stopped.

  A runtime disposed before its Subscriptions start never starts that stream,
  so never reports stopping. The host therefore tells a lagging read of the
  Model (one `update` produced in this boot) from the next runtime's first
  read, and a read of a Model it never produced while running is a second
  runtime started from the same config, which it refuses by failing that
  runtime's boot.
- **`crash.report`, wrapped.** A crash stops the runtime processing Messages, so
  the host stops accepting them, then calls the application's own `report`.

`model()` throws until the runtime is running. `dispatch` returns a Promise
that resolves once `update` has applied that Message, and rejects when the
runtime is not running or stops first, saying which. A config already hosted
is refused.

## The headless runtime

```ts
const app = Agent.headless({ init, update, subscriptions, resources })
// app.host, as above; app.dispose()
```

The same fields an application config has, minus the view. It runs
Foldkit's loop without a DOM:

- a Message is applied on the dispatching stack, in arrival order, with
  re-entrant dispatches queued behind it;
- each Command starts a microtask later, with `resources` provided from one
  build of the Layer for the runtime's life, and its Message is queued;
- each Subscription restarts when its dependencies change under its
  equivalence (`keepAliveEquivalence`, or the dependencies Schema's);
- a throwing `update`, a failing Command or Subscription crashes it: it stops,
  releases its resources, and rejects every pending and later `dispatch`.

What it does not run, and refuses rather than half-runs: `managedResources`,
`routing` and `ports` are type errors, and an interruptible Command (one with a
`key`) crashes it, since Foldkit's interrupt registry is internal and a
shared one would let one session interrupt another's work. A Command that waits
for a render (`Render.afterCommit`) falls back to the next animation frame, which
a server does not have.

This is a second implementation of Foldkit's loop, the cost the issue accepts
for running an application where there is no document. It is kept to the
semantics an agent depends on, and it reads the same config, so there is no
second application.

## Server use

One headless runtime per session, signed in as that session's principal:

```ts
createAgent: ({ principal }) => {
  const app = Agent.headless({ init, update, subscriptions, resources: clientFor(principal) })
  return TodoAgent.bind({ definition: AppAgent, host: { ...app.host, principal: () => principal } })
}
```

Remote runs over whatever `RemoteClient` the resources give, including
`Remote.clientLayer` over the in-process handlers, and the server's Guards
decide every write as they do for a browser.

## Deferred

- **A Foldkit seam.** If Foldkit's runtime handle grows a Model reader and a
  dispatch, `Agent.host` can read them instead of wrapping the config.
- **Interruptible Commands headless.** Needs Foldkit to export its registry.
- **Chirp.** Its client entry is `SSR.hydrate`, which spreads the config it is
  given, so `Agent.host` composes with it; wiring Chirp's agent is its own
  change.
