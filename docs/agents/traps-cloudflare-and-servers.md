# Traps: Cloudflare, Workers, D1, auth and servers

Read before touching a Worker, the Miniflare or Wrangler stack, D1, auth, an RPC or WebSocket server, or server logging.

- **Effect's default logger writes every level to stdout in Node.** A server
  speaking a protocol over stdio (MCP) must not report through it; agent-mcp's
  `stdio` sends diagnostics to stderr. In a browser it writes every level with
  `console.log`, so an `Effect.logError` never reached `console.error` or
  `Behaviors.consoleErrors` (#272); only `Logger.LogToStderr` moves it, for
  every level at once. `Diagnostics.log` sets it for errors alone.
- **A service given with `Layer.provide` is hidden from `toWebHandler`'s
  `middleware`.** Media's reporter never reached the middleware reporting
  `RequestDefect` until `serveFetch` used `Layer.provideMerge`. The
  middleware's cause also holds the router's own `Die(HttpServerResponse)`:
  filter it out before reporting a defect.
- **`Effect.provide(layer)` closes the layer when that effect ends.** The
  sandbox opened its journal with `makeJournalOn(…).pipe(Effect.provide(
  WasmClient.layerMemory({})))`, so the database closed as soon as the
  journal was open, and every exchange failed with "Could not read the epoch".
  Offer a service that needs a connection as a Layer that requires it, and
  wire the two with `Layer.provide`, so they live and close together (the
  core `Journal.layer` now does); outside Effect, keep the layer in a
  `ManagedRuntime`. `Layer.buildWithScope` is the escape hatch, not the API.
  A `Response` whose body streams outlives the Effect that built it: `serveFetch`
  provided the request's layer that way, and every live re-read ran after the
  layer closed, which only a layer with a finalizer shows. Build such a layer
  into a `Scope` the stream closes (`Stream.ensuring`).
- **A worker's dependencies resolve with the page's conditions.** The pages
  sandbox's SharedWorker loaded micromark's `decode-named-character-reference`
  in its `browser` build, which makes a DOM element on load, and died with
  "document is not defined" before answering anything; the tabs showed no
  error, only edits that never arrived. Playwright shows no SharedWorker
  console: construct the worker in a probe page and read its `error` event's
  `filename`. A package with a `worker` export is fixed by adding `worker` to
  `resolve.conditions`.
- **A page navigation carries no CSRF header, and often no `Origin`.** A
  Yielded resolver in its default `'scripted'` mode refuses every signed-in
  page render for that reason; a pre-read that forges the headers hides it.
  Read the cookie with `requests: 'navigation'` behind a reader that cannot
  write (`pageReader`).
- **Node's `fetch` sends `Sec-Fetch-Mode: cors` whatever it is given,** so a
  test simulating a browser navigation with it is refused by a navigation
  resolver. Send such requests through `node:http`, as
  `examples/reference/test/worker.test.ts` does.
- **An Effect RPC request's headers override its connection's.** `RpcServer`
  puts the connection's headers before each request's (`rpc/RpcServer.js:907`
  over HTTP, `:1204` over a WebSocket); `Headers.fromInput` kept the last
  through 4.1.1 and joins repeats with `", "` since 4.1.4, so a request body
  or frame can claim, or add to, another `origin`, `cookie` or CSRF header.
  Decide the principal from the real request in front of the
  route, never from an `RpcMiddleware`'s `headers` (Sync's §14.3 prototype
  pins it; no shipped server here reads them, ac62e3d3).
- **A browser `WebSocket` sends no header of yours.** Its constructor takes
  a URL and subprotocols only, so a CSRF header (`x-effect-auth-csrf`) that
  every Remote POST carries never reaches a Sync upgrade; a resolver asking
  for one answers every socket as a visitor. Check `Origin` alone there (the
  browser always sends it on an upgrade), or a credential in a subprotocol.
- **Yielded's core `AuthPersistence` cannot commit on D1.** It signs in and up
  inside a transaction, and `@effect/sql-d1` refuses transactions; use
  `@yielded/auth-persistence-drizzle/D1`, which commits in D1 batches. Its
  `@yielded/auth-platform-workerd` imports a `.wasm` and `node:crypto`, so Node
  cannot load it: keep what a test reads from Node in a module apart, and
  bundle it with `loader: { '.wasm': 'copy' }` and `nodejs_compat`. On Node,
  Yielded's Argon2id needs `node:crypto`'s `argon2` (Node 24.7); the tests
  hash with scrypt (`PasswordScrypt.layer`) instead of `Testing.services`.
- **A Worker's `console.error` never reached `Stack.start`'s output** (#269).
  An SSR 500 said only "The page could not be rendered"; Wrangler's harness
  runs workerd with `logLevel: 'none'` and only keeps the lines (`getLogs`).
  The stack now drains them: each is printed by level as `[worker] …`, with
  an `Error`'s stack, and `stack.logs()` takes them for a test. They arrive
  beside the response, not on it: poll `logs()` after a request.
- **On D1 the ledger is a `batch`, not a transaction.** D1 refuses `BEGIN`, so
  the ledger reads the record first and writes the row and its record in one
  batch, recording only where the write changed a row (`changes() > 0`). Node
  SQLite tests run the transaction path, not the batch one: test a D1 change
  on workerd. And four requests sent at once through `Stack.start`'s HTTP
  origin did not interleave their D1 work, so a race test that way passed with
  the race handling removed; run a race against `stack.env().DB` from Node.
- **Miniflare's rate limiter counts in windows on the clock's minute.** Three
  requests across a boundary were all admitted, and CI read `[200, 200, 200]`.
  Test the code that consumes a limiter with a fake binding.
- **Miniflare poisons binding handles on every reload.** A D1 or R2 handle read
  before `setOptions` or a harness `update` throws "Attempted to use poisoned
  stub" after it, which is why `examples/cloudflare`'s `WorkersStack.env` is a
  function: read bindings again after a swap.
- **Wrangler's test harness drops its whole session when an update fails to
  start.** A Worker that builds but throws on load takes the runtime down, and
  the next `listen()` has a new port and empty storage; a reload loop must stop
  there, not report a swap. Its `persist: false` is fixed, so no restart keeps
  D1: `Stack.watch` starts each change on a second, short-lived harness first
  (about 0.35 s) and swaps only what started.
- **Miniflare with no `compatibilityDate` runs an old runtime.** It lacked
  `URL.canParse`, which the auth resolver needs; at a recent date,
  `streams_enable_constructors` stops workerd starting. Give the local stack
  and `wrangler.toml` one date and one set of flags.
- **Effect 4 `Rpc.make` streams via `stream: true`,** not `success:
  RpcSchema.Stream(...)`. Handlers come from `RpcGroup.toLayer`; the in-process
  test client is `RpcTest.makeClient(group)`.
- **One worker request cannot wake another's stream, in any form.** An open
  SSE response in a worker (a live subscribe, a fetch that never answers) is
  owned by its request's `ioContext`. A second request that offers to a Queue,
  succeeds a Deferred, or even calls `enqueue` directly on the first's captured
  `ReadableStreamDefaultController` does wake its fiber — and immediately tears
  the stream down: `workerd/io/io-context.h: Promise will never complete` or,
  if the stream has a pending timer, `The Workers runtime canceled this
  request because it detected that your Worker's code had hung`. Proven
  minimal, with no library involved: a worker that stores a controller at
  module scope and enqueues to it from `/offer` while `/open` streams heartbeats
  reproduces it. Same request only: an offer scheduled by that same request
  (its own `setTimeout`) is delivered fine. It is not an Effect bug, not a
  miniflare artifact, and not fixed by a heartbeat — `dispatchFetch` and a real
  HTTP server both do it. So an in-memory hub fanning `changed` out to live
  subscribers is undeployable on Workers: what crosses requests is the durable
  store they share (D1), and each live stream re-reads it from inside its own
  request. `foldkit-remote-drizzle`'s `pollLive` is the shape; a
  `LiveHub` push reaches nobody.
