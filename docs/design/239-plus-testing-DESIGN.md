# `foldkit-plus/testing`: the Workers stack and Playwright behaviors (#239)

Status: built (2026-10-27): `foldkit-plus/testing/workers` (`Stack`) and
`foldkit-plus/testing/playwright` (`Behaviors`), used by
`examples/cloudflare`'s tests, `pnpm dev` and e2e. See [Deferred](#deferred).

## The problem

Chirp's most useful tests (#231) were the ones no package helped write: the
Worker on a local workerd with a real D1 over real HTTP, and Playwright flows
that assert a property of the running app rather than a screen. A write shows
before the server answers. It survives the answer. A revisited list never
reads "Loading…". The console stays clean. Each took real effort, and every
application on the recommended stack wants the same.

#253 already built the stack, in `examples/cloudflare/src/workers.ts`, and
said where it should go. #250 built `Trace`, which checks the "never blinks"
rule on Models without a browser. This design moves the stack, adds the
browser assertions, and keeps them from saying what `Trace` already says.

## The subpaths

```text
foldkit-plus/testing/workers     Stack.start, Stack.writeBundle    wrangler, esbuild (optional peers)
foldkit-plus/testing/playwright  Behaviors.optimistic, .neverShows, .consoleErrors    playwright (types only)
foldkit-plus/remote/testing      Trace, Respond (unchanged, generated from foldkit-remote/testing)
```

They are `foldkit-plus`'s own entry points, beside the generated re-exports.
`scripts/entries.ts` lists them in `OWN` and `OWN_FILES`, and the generator
writes their exports. There is no new package, as the user asked.

There is no `foldkit-plus/testing` root that gathers all three. `Trace` already
has a path, `foldkit-plus/remote/testing`. A second path would be a second
name for one module.

The heavy tools are split by subpath, so a test that only drives a browser
never loads Wrangler.

## What moved from examples/cloudflare

| Was | Now |
| --- | --- |
| `src/workers.ts`: `startWorkersStack`, `writeWorker`, `WorkersStack` | `foldkit-plus/testing/workers`: `Stack.start`, `Stack.writeBundle`, `Stack<Env>` |
| The `pnpm mutate` esbuild plugin inside it | `examples/cloudflare/src/mutation.ts`, passed as `plugins` |
| `smol-toml` parsing `wrangler.toml` | Wrangler's own reader, `experimental_readRawConfig`, which also reads `wrangler.json` and `.jsonc` |
| `miniflare`'s `supportedCompatibilityDate`, from the example's own pin | The same constant, from the Miniflare Wrangler depends on |
| `test/workers.test.ts` and its mutations, over the example's `wrangler.toml` | `packages/plus/test/workers.test.ts`, over a fixture of its own (D1, one migration, a Worker that echoes its vars and secrets) |

The example keeps `stack.ts`, which is its call: its entry, its local
`AUTH_ORIGIN` and a fresh `UPLOAD_TOKEN`. It also keeps the mutation plugin,
which is this repository's tooling.

Two choices changed in the move:

- **Wrangler reads the configuration.** #253 parsed the TOML itself because
  Wrangler's normalized config cannot be fed back in. Wrangler's raw reader,
  which #253 had not tried, returns the file's table unchanged. The harness
  takes that table, so one reader serves both.
- **Miniflare comes from Wrangler.** #253 noted that the example's `miniflare`
  pin had to move with Wrangler's, or the date check would ask a different
  runtime than the one started. Resolving `miniflare` from Wrangler's own
  location makes them one copy. An application then lists only `wrangler`.

## The Playwright behaviors

```ts
import { Behaviors } from 'foldkit-plus/testing/playwright'

const errors = Behaviors.consoleErrors(page)
await Behaviors.neverShows(page, {
  text: 'Loading…',
  during: () =>
    Behaviors.optimistic(page, {
      act: () => page.getByRole('button', { name: 'Add' }).click(),
      shows: page.getByRole('button', { name: 'Buy milk', exact: true }),
    }),
})
expect(errors()).toEqual([])
```

- **`optimistic(page, { act, shows, hold?, within? })`** holds every Remote
  mutation at the network for `hold` (3 seconds unless given). `shows` must
  be visible within `within` of `act` (1 second). It must still be visible
  after every answer has landed and the page has drawn it, which is the
  #226 like-count bug. A mutation is recognized by Remote's own wire schema,
  `RemoteJsonRequest` with `operation: 'mutate'`, not by a URL. The call
  throws when `act` sent no mutation, since then nothing was held. It also
  throws when `within` is not shorter than `hold`, because the answer could
  then be what shows.
- **`neverShows(page, { text, during })`** installs a `MutationObserver` in
  the open document and in every document loaded while `during` runs. After
  each change it searches the rendered text (`innerText`, which leaves out
  hidden text) for `text`. A text shown for one frame is therefore seen, not
  sampled. Chirp's e2e sampled `innerText()` every 100 ms, and the #243 blip
  fell between samples in some runs. The call throws with the line that
  showed.
- **`consoleErrors(page)`** collects `console.error` and uncaught
  exceptions. It returns a reader, so any assertion library can check the
  list.

Each behavior waits for the page to be **quiet** before it looks again, after
the answers or after `during`. Quiet means three frames in a row with no DOM
change, capped at two seconds. It is not a fixed sleep: it ends as soon as
the page stops drawing.

### How they relate to `Trace`

Both check the same rule, that a read showing a value keeps showing it. They
check it at different layers, and neither restates the other.

| | `Trace` (`foldkit-plus/remote/testing`) | `Behaviors` (`foldkit-plus/testing/playwright`) |
| --- | --- | --- |
| Observes | every Model, after every Message | the drawn page, after every DOM change |
| Order of answers | chosen by the test, each interleaving deterministic | whatever the network and the Worker do |
| Sees | the reducer and the read entries | also SSR, hydration, persistence, the view, the Worker |
| Says when it fails | which Message regressed which read, and `Data.why` | which text showed, or which write did not |
| Speed | milliseconds, no browser | seconds, Chromium and a stack |

So `neverShows` does not know read states. It knows text, which is what a
user sees. When it fails, a `Trace` test pins the Message responsible.
`Trace.regressions` stays the one statement of the rule over Models.
`optimistic` decides nothing about `Ready` or `Refreshing` either.

The first run proved the split worth having. `neverShows` around a reload of
the Cloudflare page caught a "Loading…" frame. `Data.persistence` restores the
stored list in a Subscription, so the first frame is drawn before the stored
rows arrive. `Trace` cannot see this: its start Model is whatever the test
hands it. The e2e now asserts what holds today, that adding a todo never
blinks the list. The reload is filed under [Deferred](#deferred).

## Dependencies

| Tool | How `foldkit-plus` depends on it | Why |
| --- | --- | --- |
| `wrangler` | optional peer, `^4.116.0` | The harness, the config reader, and through it Miniflare and workerd |
| `esbuild` | optional peer, `^0.28.0` | The stack's bundler, with the source condition and the app's plugins |
| `playwright` | optional peer, `^1.64.0`, types only | `Page`, `Locator`, `Request`. The module calls nothing but the page it is given |
| `miniflare`, `smol-toml` | none | Miniflare is read from Wrangler; the TOML is read by Wrangler |

An optional peer is the shape AGENTS.md prescribes ("An adapter's library is
a peer"). An application installing `foldkit-plus` for its browser code
installs none of the three. An application that tests gets the versions it
chose, and only one copy of each.

**Failing loudly.** `testing/workers` imports Wrangler and esbuild with a
dynamic `import()` on first use, not at the top of the module, so importing
the subpath loads nothing. A missing peer becomes this error:

```text
foldkit-plus/testing/workers needs `wrangler`, which is not installed. Add it as a dev dependency: pnpm add -D wrangler
```

Any other failure, such as a peer's own dependency missing or a throw while
it loads, is rethrown unchanged. `testing/playwright` cannot reach that point
without Playwright: its only argument is a `Page`.

`foldkit-plus` adds `wrangler`, `esbuild`, `playwright` and
`@cloudflare/workers-types` as dev dependencies, to test against. The last
keeps Wrangler's optional peer resolved as it is in the examples, so the
lockfile holds one Wrangler. `examples/cloudflare` drops `miniflare` and
`smol-toml`.

## Options considered

1. **A new package, `foldkit-testing`.** Rejected: the user asked for none,
   and `foldkit-plus` is already the umbrella an application installs.
2. **Heavy tools as dependencies of `foldkit-plus`.** Rejected: about 21 MB
   of Wrangler and workerd in every browser app's tree.
3. **Static imports of the peers.** Node would fail at import with "Cannot
   find package 'wrangler'". That is loud, but it does not say which subpath
   needed the package or how to add it. Rejected for the dynamic import.
4. **`Behaviors.cachedRevisit(page, { leave, back })`**, as the issue sketched.
   Rejected for `neverShows`: a revisit is one `during` among several (a
   reload, a back navigation, a refresh after a write), and the special case
   would be a second way to say the same thing.
5. **`Behaviors.failOnConsoleErrors(page)`.** A Playwright listener cannot
   fail the test that registered it, so the call would have to hook the test
   runner. `consoleErrors` returns the list, and the test asserts it.
6. **A `writes` predicate on `optimistic`** for writes other than Remote's.
   Deferred: no caller has one yet. Sync writes over a WebSocket, which
   `page.route` does not see, and a form `POST` has no example.
7. **`secrets: 'generate'` on the stack.** Rejected: a test needs the value
   to use it (`UPLOAD_TOKEN` as a bearer), so the caller mints it.
   `crypto.randomUUID()` is one line.
8. **`stack.d1('DB')`.** Rejected: `(await stack.env()).DB` already says it,
   and it must be read after each swap.

## Testing

- `packages/plus/test/workers.test.ts` covers the stack: start at the newest
  date workerd supports, vars and secrets, migrations, a swap over the same
  D1, a build error, a Worker that does not start, the four refusals, the
  deploy bundle's path, and the missing-peer message.
  `workers.mutations.ts` breaks it 15 ways. Fourteen are killed; one
  survives, as declared since #253.
- `packages/plus/test/playwright.test.ts` drives a page made to pass or break
  each behavior. Add can write optimistically, pessimistically, with a revert,
  or with no request. A load can blink "Loading…" for one frame or keep a
  hidden one. It runs in Chromium from Node, as the `unit` project's CI job
  already installs it. `playwright.mutations.ts` breaks it 11 ways, all
  killed.
- `examples/cloudflare/e2e/page.e2e.ts` uses all three behaviors.

## Deferred

- **The reload blink.** The Cloudflare page reads "Loading…" for a frame on a
  reload, before `Data.persistence` restores the stored rows. A restore that
  lands before the first draw belongs in `foldkit-remote`. Once it lands, the
  e2e adds `neverShows` around `page.reload()`.
- **The typed Remote client over HTTP** (`stack.remote({ cookie }).query(…)`),
  waiting on #213's documented protocol and test client.
- **Auth helpers** (`stack.signUp`, `stack.signIn`) against Yielded's routes,
  waiting on #228's reference app, the second consumer.
- **Warnings and diagnostics** in `consoleErrors`, waiting on #237's typed
  channel, so a test can tell an expected diagnostic from an unexpected one.
- **A `writes` predicate** for writes that are not Remote mutations (see
  option 6), and holding WebSocket frames (`page.routeWebSocket`) for Sync.
- From #253, unchanged: attaching to a running stack, surviving a Worker that
  does not start, the Worker's logs under `pnpm dev`, watching
  `wrangler.toml`, and assets with `run_worker_first`.
