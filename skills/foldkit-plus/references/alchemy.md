# Deploying with Alchemy

Checked against `alchemy` 2.0.0-beta.84 and `@alchemy.run/cloudflare` 2.0.0-beta.84.

[Alchemy](https://alchemy.run) declares cloud resources as Effect values in
one file, `alchemy.run.ts`, and creates, updates or deletes them to match
(`alchemy plan`, `alchemy deploy`). It is the "A" of the CAFE stack
(Cloudflare, Alchemy, Foldkit, Effect). Here it takes the place of
`wrangler.toml` and the `wrangler` commands that
[`examples/cloudflare`](https://github.com/doeixd/foldkit-plus/tree/main/examples/cloudflare)
deploys with.

## What it owns

Alchemy owns **infrastructure**: which Worker, D1 database, R2 bucket, Durable
Object namespace, rate limit and secret exist, and which binding names the
Worker sees them under. It owns no application state. The Worker's code is the
same code `examples/cloudflare` runs (Remote's `serveFetch`, `foldkit-media`'s
server, Sync's `defineDocumentHost`, Yielded Auth's routes). Alchemy only declares what that code's
`env` holds.

```text
alchemy.run.ts (resources) -> plan (diff with state) -> deploy -> Worker env -> src/worker.ts
```

Alchemy v2 is in beta and its README warns of breaking changes. Pin exact
versions, and record the choice in the plan.

## What was checked here

Against `alchemy@2.0.0-beta.84` and `@alchemy.run/cloudflare@2.0.0-beta.84`:

- On 2026-10-29 the stack below type-checked, and `InferEnv` of it was
  assignable to `examples/cloudflare`'s `WorkerEnv`. Removing a required
  binding (`DB`, `MEDIA`) fails the check; the optional `UPLOAD_TOKEN` and
  `AUTH_ORIGIN` are not checked, so a stack without them still compiles and
  the Worker refuses uploads or answers `/auth/…` with a 404.
- On 2026-10-27, before the Worker served sign-in, `alchemy plan` of the
  stack without `AUTH_ORIGIN` against a real account answered "3 to create,
  6 binding changes": the Worker, the database and the bucket, and six bindings.

Nothing was deployed, so whether `alchemy deploy` or `alchemy dev` builds and
runs this app has not been shown here. Run `alchemy dev` before the first
deploy, and ask the user before deploying anything.

## The stack

```sh
pnpm add -D alchemy@2.0.0-beta.84 @alchemy.run/cloudflare@2.0.0-beta.84 @effect/platform-node
```

Alchemy's own peers include `effect@^4.0.5` and `vite@^8.0.7`.

```ts sketch
// alchemy.run.ts
import * as Alchemy from 'alchemy'
import * as Cloudflare from '@alchemy.run/cloudflare'
import { Config, Effect } from 'effect'
import type { SyncHost, WorkerEnv } from './src/worker.ts'

export const App = Cloudflare.Website.Foldkit('App', {
  main: 'src/worker.ts',
  env: {
    DB: Cloudflare.D1.Database('Db', { migrations: './migrations' }),
    MEDIA: Cloudflare.R2.Bucket('Media'),
    IMAGES: Cloudflare.Images.Images('IMAGES'),
    LIMITER: Cloudflare.RateLimit('LIMITER', {
      namespaceId: 1001,
      simple: { limit: 100, period: 60 },
    }),
    SYNC_HOST: Cloudflare.DurableObject<SyncHost>('SyncHost'),
    UPLOAD_TOKEN: Config.Redacted('UPLOAD_TOKEN'),
    AUTH_ORIGIN: Config.String('AUTH_ORIGIN'),
  },
  assets: {
    runWorkerFirst: ['/remote', '/sync', '/me', '/auth/*', '/_image/*', '/_media/*'],
  },
})

// A required binding the Worker reads that the stack does not declare is a type error.
const fits = (env: Cloudflare.InferEnv<typeof App>): WorkerEnv => env
void fits

export default Alchemy.Stack(
  'TodosApp',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const app = yield* App
    return { url: app.url }
  }),
)
```

What each part does, and what it does not do:

- **`Cloudflare.Website.Foldkit`** is one Worker. It builds the app through
  its own Vite config and serves the build as the Worker's static assets.
  `main` is the Worker's `fetch`, and the Worker module also exports the
  `SyncHost` class. `runWorkerFirst` sends those paths to `main`, and every
  other path is served from the assets.
  - `examples/cloudflare` instead splits the work between a Pages project and
    a Worker, with `_worker.js` forwarding between them. Here that forwarding
    and its CORS headers are not needed.
  - `main` cannot be combined with `foldkit({ ssr: { build } })`. A
    server-rendered app gets its Worker from its server entry instead.
- **`D1.Database`** applies `./migrations` on deploy. It records what it
  applied in its own `__alchemy_migrations` table. A database that Wrangler
  already migrated is adopted one way: Alchemy copies Wrangler's history into
  its table and stops writing Wrangler's.
- **`Config.Redacted('UPLOAD_TOKEN')`** reads the secret from the environment
  (or `.env`) when the stack runs. Planning fails while it is unset. The
  Worker sees it as a `string`. `Config.String('AUTH_ORIGIN')` is read the same
  way: the origin of the page that signs people in, which here is the site's
  own URL. Without it the Worker answers `/auth/…` and `/me` with a 404.
- **`Images` and `RateLimit`** are bindings only, with no resource behind
  them. Images must be enabled on the account.
- **`Cloudflare.state()`** keeps the deploy state in a Worker on the account
  (`alchemy-state-store`), and Alchemy deploys that Worker when the account
  has none. For a dry run that may touch nothing, plan with
  `state: Alchemy.localState()`, which keeps state in `.alchemy/`.

## Commands

```sh
alchemy dev                 # local Worker runtime with live reload
alchemy plan --stage prod   # the diff only; reads the account, changes nothing
alchemy deploy --stage prod # creates and updates: confirm with the user first
```

Credentials come from an Alchemy profile (`alchemy profile`) or from
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. When the token can reach
several accounts, set the account id. `alchemy provider check-env` checks them
in CI.

## When to stay on Wrangler

`examples/cloudflare` is the path this repository's own tests and demos run
(miniflare, no account), and its README lists the `wrangler` commands that
publish it. Stay on that path when the user prefers it, when they do not want
a beta tool in the deploy, or when an existing `wrangler.toml` already works.
The Worker code is the same either way. Only the declaration of its resources
moves.
