# Traps: Cloudflare, Workers, D1, auth and servers

Read before touching a Worker, the Miniflare or Wrangler stack, D1, auth, an RPC or WebSocket server, or server logging.

## Who is asking: decide the principal from the real request

- **Do not trust, or require, a header the transport does not carry.** Variants found:
  - A page navigation carries no CSRF header and often no `Origin`: a Yielded resolver in its default `'scripted'` mode refuses every signed-in page render (a pre-read that forges headers hides it). Read the cookie with `requests: 'navigation'` behind a reader that cannot write (`pageReader`).
  - Node's `fetch` sends `Sec-Fetch-Mode: cors` whatever it is given, so a navigation-resolver test using it is refused: send such requests through `node:http` (`examples/reference/test/worker.test.ts`).
  - An Effect RPC request's headers override its connection's (`RpcServer` puts the connection's headers first: `rpc/RpcServer.js:907` over HTTP, `:1204` over WebSocket; `Headers.fromInput` kept the last through 4.1.1 and joins repeats with `", "` since 4.1.4), so a body or frame can claim or add to `origin`, `cookie` or CSRF headers. Decide the principal from the real request in front of the route, never from an `RpcMiddleware`'s `headers` (Sync's section 14.3 prototype pins it; no shipped server reads them, ac62e3d3).
  - A browser `WebSocket` sends no header of yours (URL and subprotocols only), so a CSRF header (`x-effect-auth-csrf`) never reaches a Sync upgrade and a resolver asking for one answers every socket as a visitor. Check `Origin` alone there (always sent on an upgrade), or a credential in a subprotocol.

## Effect services and logging

- **Effect's default logger writes every level to stdout in Node, and with `console.log` in a browser.**
  A server speaking a protocol over stdio (MCP) must not report through it (agent-mcp's `stdio` sends diagnostics to stderr). `Effect.logError` never reached `console.error` or `Behaviors.consoleErrors` in a browser (#272); only `Logger.LogToStderr` moves it, for every level at once. `Diagnostics.log` sets it for errors alone.
- **A service given with `Layer.provide` is hidden from `toWebHandler`'s `middleware`; filter the router's own `Die(HttpServerResponse)`.**
  Media's reporter never reached the middleware reporting `RequestDefect` until `serveFetch` used `Layer.provideMerge`; the middleware's cause also holds the router's `Die(HttpServerResponse)`, to filter out before reporting a defect.
- **`Effect.provide(layer)` closes the layer when that effect ends.**
  The sandbox's `makeJournalOn(…).pipe(Effect.provide(WasmClient.layerMemory({})))` closed the database as soon as the journal opened ("Could not read the epoch"). Offer a service that needs a connection as a Layer requiring it and wire with `Layer.provide` (the core `Journal.layer` does); outside Effect keep the layer in a `ManagedRuntime`; `Layer.buildWithScope` is the escape hatch. A `Response` whose body streams outlives the Effect that built it: `serveFetch` provided the request's layer that way and every live re-read ran after it closed (only a layer with a finalizer shows it); build such a layer into a `Scope` the stream closes (`Stream.ensuring`).
- **Effect 4 `Rpc.make` streams via `stream: true`,** not `success: RpcSchema.Stream(...)`.
  Handlers come from `RpcGroup.toLayer`; the in-process test client is `RpcTest.makeClient(group)`.
- **One worker request cannot wake another's stream, in any form.**
  An open SSE response in a worker is owned by its request's `ioContext`; a second request that offers to a Queue, succeeds a Deferred, or calls `enqueue` on the first's captured `ReadableStreamDefaultController` wakes the fiber and tears the stream down (`workerd/io/io-context.h: Promise will never complete`, or "your Worker's code had hung" with a pending timer). Proven with no library: a worker storing a controller at module scope and enqueuing from `/offer` while `/open` streams heartbeats. Only the same request's own offer (its own `setTimeout`) is delivered. It is not an Effect bug, miniflare artifact, or heartbeat matter (`dispatchFetch` and a real server both do it). An in-memory hub fanning `changed` to live subscribers is undeployable on Workers: share the durable store (D1) and have each live stream re-read it inside its own request (`foldkit-remote-drizzle`'s `pollLive`; a `LiveHub` push reaches nobody).

## Workers, D1 and auth

- **A worker's dependencies resolve with the page's conditions.**
  The pages sandbox's SharedWorker loaded micromark's `decode-named-character-reference` in its `browser` build (makes a DOM element on load) and died with "document is not defined" while the tabs showed no error, only edits that never arrived. Playwright shows no SharedWorker console: construct the worker in a probe page and read its `error` event's `filename`. A package with a `worker` export is fixed by adding `worker` to `resolve.conditions`.
- **Yielded's core `AuthPersistence` cannot commit on D1.**
  It signs in and up inside a transaction, which `@effect/sql-d1` refuses: use `@yielded/auth-persistence-drizzle/D1` (commits in D1 batches). Its `@yielded/auth-platform-workerd` imports a `.wasm` and `node:crypto`, so Node cannot load it: keep what a Node test reads in a module apart, and bundle with `loader: { '.wasm': 'copy' }` and `nodejs_compat`. On Node, Yielded's Argon2id needs `node:crypto`'s `argon2` (Node 24.7); tests hash with scrypt (`PasswordScrypt.layer`) instead of `Testing.services`.
- **On D1 the ledger is a `batch`, not a transaction.**
  D1 refuses `BEGIN`, so the ledger reads the record first and writes the row and its record in one batch, recording only where the write changed a row (`changes() > 0`). Node SQLite tests run the transaction path: test a D1 change on workerd. Four requests sent at once through `Stack.start`'s HTTP origin did not interleave D1 work, so a race test that way passed with the race handling removed: run a race against `stack.env().DB` from Node.
- **A Worker's `console.error` never reached `Stack.start`'s output** (#269).
  An SSR 500 said only "The page could not be rendered"; Wrangler's harness runs workerd with `logLevel: 'none'` and only keeps the lines (`getLogs`). The stack now prints each as `[worker] …` by level, with an `Error`'s stack, and `stack.logs()` takes them; they arrive beside the response, so poll `logs()` after a request.

## Miniflare and Wrangler

- **Miniflare's rate limiter counts in windows on the clock's minute.**
  Three requests across a boundary were all admitted and CI read `[200, 200, 200]`. Test the code that consumes a limiter with a fake binding.
- **Miniflare and the Wrangler harness reset or lose state on reload.**
  Binding handles (D1, R2) read before `setOptions` or a harness `update` throw "Attempted to use poisoned stub" after it, which is why `examples/cloudflare`'s `WorkersStack.env` is a function: read bindings again after a swap. The harness drops its whole session when an update fails to start (a Worker that builds but throws on load): the next `listen()` has a new port and empty storage, `persist: false` is fixed, so `Stack.watch` starts each change on a second short-lived harness first (about 0.35 s) and swaps only what started; a reload loop must stop there. With no `compatibilityDate` Miniflare runs an old runtime lacking `URL.canParse` (which the auth resolver needs), while at a recent date `streams_enable_constructors` stops workerd starting: give the local stack and `wrangler.toml` one date and one set of flags.
