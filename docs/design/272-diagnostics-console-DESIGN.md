# An error diagnostic reaches `console.error` (#272)

Status: built (2026-10-28) in `foldkit-surface`: `Diagnostics.log` writes an
`error` diagnostic through Effect's log with `Logger.LogToStderr` set, so
Effect's default logger hands it to `console.error`.

## The problem

The default reporter, `Diagnostics.log`, logged through `Effect.logError` and
`Effect.logWarning`. Effect 4's default logger writes every level with
`console.log`, unless the fiber's `Logger.LogToStderr` is set, when it writes
every level with `console.error`. Nothing set it, so:

- In a browser an `error` diagnostic (`MountFailed`, `PageContained`,
  `BundleUnloaded`, `HostDefect`) was a plain `console.log` line, and
  `Behaviors.consoleErrors`, the end-to-end check that a page logs no error,
  passed a page that reported one. #237 had moved SSR's own `console.error`s
  onto the channel, so those faults left the check then.
- On Node an error went to stdout; on a Worker, `wrangler tail` listed it at
  the `log` level.
- `docs/errors.md` told readers to install a reporter calling
  `console.error` to get what the default should have done.

## Decision

```text
Diagnostics.log(d)
  level 'error'   ─▶ Effect.logError,   LogToStderr = true  ─▶ default logger: console.error / stderr
  level 'warning' ─▶ Effect.logWarning, LogToStderr as set  ─▶ default logger: console.log / stdout
```

The reporter's own failure ("the diagnostics reporter broke on …") is an
error and goes the same way.

- **An error is something that broke on this side**, which is what an
  end-to-end test should fail on, what DevTools draws red, and what a Worker's
  tail and an error tracker's console integration pick out.
- **A warning stays a log line.** It means "the application should change
  something": `ExchangeFailed` while offline, `HandlerUnnamed`. Sent to
  `console.error`, it would fail every offline test that uses
  `consoleErrors`; `console.warn` is out of reach for the same reason as the
  next point.
- **Still Effect's log, not the console directly.** A server that replaced the
  logger (JSON lines, OpenTelemetry), set a minimum level, or annotates its
  logs gets diagnostics through it as before, with their level. Only Effect's
  default logger reads `LogToStderr`; a replaced logger decides for itself.
  Calling `console.error` directly would bypass all of it, and Effect's
  default logger offers no `console.warn` route, so warnings keep its
  `console.log`.

## Rejected

- **`consoleErrors` also collecting `[foldkit-…]` lines.** It couples a test
  helper to the log's text, misses a diagnostic an application routes through
  its own reporter, and leaves the browser, Node and Workers each showing an
  error as a plain line.
- **`LogToStderr` for every level.** Warnings would fail end-to-end tests that
  are right to pass, and on Node mix stdout's ordinary lines into stderr.

## Opting out, routing elsewhere

Unchanged: provide another `Diagnostics.Reporter`. One that wants the
default's routing and something more composes `Diagnostics.log`. One that
logs an error without `console.error` calls `Effect.logError` itself, which
goes where the logger in effect sends it.

## Tests

- `packages/surface/test/diagnostics.test.ts` spies on `console.error` and
  `console.log` under Effect's default logger: an error reaches
  `console.error` and not `console.log`, a warning the reverse, and a broken
  reporter reaches `console.error`.
- `packages/plus/test/playwright.test.ts` builds a page that reports both
  through the default reporter, and asserts `Behaviors.consoleErrors` lists
  the error and not the warning.
- `diagnostics.mutations.ts` drops `LogToStderr` from each path, and sets it
  for warnings too.
