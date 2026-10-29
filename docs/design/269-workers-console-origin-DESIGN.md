# A stack shows the Worker's console, and tells the Worker its origin (#269)

Status: built (2026-10-29) in `foldkit-plus/testing/workers`; the reference
app configures its origin through it.

## The problems

1. **The Worker's console went nowhere.** A page that failed to render
   answered `500 The page could not be rendered.`; `foldkit-ssr` logs why with
   `console.error` inside workerd, and `Stack.start` showed none of it, in a
   test or under `pnpm dev`. Wrangler's test harness runs workerd with
   `logLevel: 'none'` and keeps its structured logs in an array (`getLogs`),
   with no way to subscribe.
2. **The Worker could not be told its own origin.** The harness listens on a
   port it picks (`port: 0` is fixed in its worker inputs, so a `port` option
   is not ours to offer), and `vars` are fixed before it listens. An app that
   configures its origin (`ORIGIN`, which Yielded's `http.origin` and
   `AuthServer.resolver` compare `Origin` with) could not run on the stack, so
   the reference app took each request's own origin and built its routes per
   origin.

## Decision

```text
workerd console --structured logs--> harness.getLogs() --drained every 100 ms, and on logs() and stop-->
    printed as it arrives   ([worker] line, by level: console.error / warn / info / debug / log)
    kept until stack.logs() takes it

Stack.start({ vars: origin => ({ ORIGIN: origin }) })
    harness.listen() -> origin -> harness.update(vars of origin) -> migrations -> the stack is returned
```

### The console

- `StackOptions.console?: 'print' | 'quiet'`, `'print'` by default. Each line
  the Worker writes is printed with Node's console method of its level
  (`error` to `console.error`, and so on), prefixed `[worker]`. An error logged
  with its `Error` carries the stack workerd formatted (probed: `console.error
  ('render failed:', error)` arrives as one message, `render failed: Error:
  boom\n    at Object.fetch (file:///…/worker.js:5:13)`).
- `Stack.logs(): ReadonlyArray<WorkerLog>` takes every line kept since the
  last call, oldest first, whichever mode prints. A test asserts on what one
  request wrote without a stack per test.
- **Printing is the default** because the failure #269 met is a test that
  fails on a 500 and shows nothing; a quiet default would repeat it for every
  new user. A test of a Worker that logs on purpose passes `'quiet'`.
- **Polled, not subscribed.** The harness offers no handler; its own
  `structuredLogsHandler` is fixed. The stack drains `getLogs()` and
  `clearLogs()` in one synchronous step every 100 ms on an unref'd timer, so
  nothing is read twice or lost between them. `logs()` and `stop()` drain first,
  so a line written before stopping is printed and kept, and so is the console
  of a Worker that failed to start.
- **No ordering promise against the response.** workerd writes its logs to a
  pipe the HTTP response does not travel on. In the probe they had arrived
  when `fetch` resolved, but nothing guarantees it, so a test reads them with
  `expect.poll(() => stack.logs())`.

### The origin

- `StackOptions.vars` may be a function of the origin: `vars: origin => ({
  ORIGIN: origin })`. The stack listens, then calls `harness.update` with the
  vars it returns before it applies migrations or returns, so no request the
  caller makes meets the Worker without them. The update is a reload at the
  same origin, as a watched swap is (probed); the plain-object form starts
  once, as before.
- **A function of the origin rather than a binding the stack always sets.**
  The application names its own var (`ORIGIN`, `AUTH_ORIGIN`, `PUBLIC_URL`),
  and the same function can derive more than one (an API origin and a page
  origin under one host). A fixed `STACK_ORIGIN` binding would be a name the
  deploy never sets, so the Worker would read different config in tests than
  in production.
- **Not a request-derived value.** The request's own URL already says the
  origin, and on Workers it is the route Cloudflare matched. A configured
  origin exists to name the one origin the app trusts when the same Worker is
  reachable at more than one (a `workers.dev` host beside a custom domain);
  deriving it from the request gives up exactly that.

### The reference app

The reference app now reads `env.ORIGIN` and builds one host for it, rather
than one per request origin; `stack.ts` passes `vars: origin => ({ ORIGIN:
origin })`, and a deploy sets `ORIGIN` where it serves. A test sends a
scripted sign-in to the Worker under another host, as a second route to the
same Worker would, and it is refused.

## Rejected

- **A `port` option.** The harness sets `server.port` to 0 for every worker it
  runs; there is no option to pass one through. A fixed port would also make
  test files running side by side collide.
- **Restarting the harness with the vars.** `reset()` recreates storage and
  may change the port, which is the very thing the vars must name.
- **Printing only under `watch`.** Tests are where #269's 500 hid.
- **`'collect'` beside `'print'`.** Both keep lines for `logs()`; the only
  choice is whether they are also printed, which `'quiet'` names.

## Tests

- `packages/plus/test/workers.test.ts`: a Worker that logs at each level and
  logs an `Error` is printed by level with the stack, `logs()` takes each line
  once, `'quiet'` prints nothing but still keeps; a Worker that throws at load
  prints its error when the start fails; `vars` as a function reaches the
  Worker as the stack's own origin, from the first request.
- `examples/reference/test/worker.test.ts`: a scripted sign-in under another
  host is refused.
- `workers.mutations.ts` and `reference.mutations.ts` break each piece.
