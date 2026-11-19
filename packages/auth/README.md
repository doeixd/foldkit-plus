# `foldkit-auth`

When your application uses [Yielded Auth](https://github.com/yielded-dev/auth)
for sign-in, Yielded sets an HTTP session cookie — but your data endpoints
(`foldkit-remote-server`'s `serveFetch`), real-time sync sockets
(`foldkit-sync`'s `defineDocumentHost`), and server-rendered pages
(`foldkit-ssr`) each need to know who is asking. Re-implementing cookie
parsing, `Origin` and CSRF header checks, and `verifySession` lookups on every
endpoint risks letting a cross-site request borrow someone's session or
silently treating an ended session as an anonymous visitor.

`foldkit-auth` turns a Yielded Auth session cookie into a typed principal for
Remote, Sync, and SSR. `AuthServer.resolver` verifies the request's origin,
checks the session against your `Auth` service, and maps it to your
application's user type — or returns `Option.none()` for a visitor, or `401`
when a session ended or came from an untrusted origin. `AuthServer.host` pairs
the scripted, navigation, and auth route handlers from one configuration.

See it running end-to-end in [`examples/auth`](../../examples/auth),
[`examples/reference`](../../examples/reference), and
[`examples/cloudflare`](../../examples/cloudflare).

## Install

```sh
pnpm add effect @yielded/auth foldkit-remote foldkit-remote-server foldkit-auth
```

`@yielded/auth` is a peer dependency while Yielded is in beta. Run
`npx --legacy-peer-deps foldkit-plus setup` in your project directory to print
the pinned package version and `effect` overrides for your package manager.

## A first protected endpoint

This configures a Yielded `Auth` service, builds a principal resolver with
`AuthServer.resolver`, and wires it into `serveFetch` so every `/remote` request
receives `Option.some({ id })` or `Option.none()`:

```ts
import { Auth, AuthContract, Password, Sessions } from '@yielded/auth'
import { Context, Effect, Layer, Option, Schema } from 'effect'
import { AuthServer } from 'foldkit-auth/server'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'

const AppAuth = Auth.make(
  AuthContract.make('readme/Auth', {
    claims: Schema.Struct({}),
    actions: sessions => ({ signIn: AuthContract.passwordSignIn(sessions) }),
  }),
  {
    sessions: Sessions.stateful({ idleTimeout: '10 minutes', maxAge: '1 hour' }),
    strategies: { password: Password.make() },
    defaultStrategy: 'password',
  },
)
const server = RemoteServer.make<Option.Option<{ readonly id: string }>>({ entities: [] })

export const makeRemote = (layer: () => Layer.Layer<Context.Service.Identifier<typeof AppAuth>>) =>
  serveFetch({
    server,
    resolvePrincipal: AuthServer.resolver({
      auth: AppAuth,
      http: { origin: 'https://app.example' },
      principal: session => Effect.succeed({ id: session.subjectId }),
    }),
    layer,
  })
```

A request with no session cookie passes `Option.none()` (a visitor) into
`server`. A request carrying a valid session cookie with
`Origin: https://app.example` and `x-effect-auth-csrf: 1` resolves to
`Option.some({ id: session.subjectId })`. Any request carrying a cookie from an
untrusted origin, missing the CSRF header, or holding an expired session returns
`401` (`RemoteUnauthenticated`).

- **`AuthServer.resolver(config)`** declares the per-request principal Effect.
  It validates `http.origin` at creation time and reads headers and the session
  store on each call.
- **`auth`** is your `Auth.make(…)` service; `serveFetch`'s `layer` provides the
  same persistence layer shared with Yielded's sign-in routes.
- **`http`** is the same object passed to Yielded's `Http.make(AppAuth, http)`,
  so cookie names, trusted origins, and CSRF headers stay aligned.
- **`principal(session)`** maps a verified session to your application user per
  request. Read fresh memberships here from `session.subjectId` rather than
  relying on claims captured at sign-in; you can also fail with
  `RemoteServer.unauthenticated(reason)`.

## What `foldkit-auth` owns

| Concern | Owner |
| --- | --- |
| Sign-in, passwords, sessions, and cookies | Yielded Auth (`Auth.make`, `Http.make`) |
| Verifying request origin and session cookie | `AuthServer.resolver`; per consumer via `AuthServer.host` |
| Mapping a session to your `User` type | Your `principal` function, run per request |
| Row- and field-level authorization | `foldkit-guard`, given the resolved principal |

Cookie issuance, renewal, and sign-out stay in Yielded Auth's HTTP routes
(mounted directly with `Http.layer(AppAuth, http)` or returned by
`AuthServer.host`). Authorization decisions stay in
[`foldkit-guard`](../guard/README.md), which consumes the principal this package
returns.

## How a request is verified

Every incoming request is evaluated in four steps:

1. **Missing cookie:** If no session cookie is present, the request proceeds as
   an anonymous visitor (`Option.none()`).
2. **Origin and CSRF check:** Because browsers attach cookies to cross-site
   requests automatically, a request with a cookie must prove it came from your
   application. Scripted requests require a trusted `Origin` (or
   `Sec-Fetch-Site: same-origin`) and `x-effect-auth-csrf: 1`; browser requests
   and page navigations use origin and Fetch Metadata checks suited to their
   transport. Failed checks return `401`, never quietly dropping to visitor.
3. **Session lookup:** `verifySession` checks the token against your session
   store; an ended or revoked session returns `401`.
4. **Principal mapping:** `principal(session)` returns `Option.some(user)` or
   refuses with `401`.

### Why the Origin check instead of `SameSite` or a token

Checking browser-enforced headers at the HTTP boundary avoids issuing, storing,
or rotating a separate CSRF token:

- **`Origin`** is compared strictly against `http.origin` and
  `http.trustedOrigins`. When a browser omits `Origin` (same-origin `GET`) or
  sends `Origin: null`, `Sec-Fetch-Site` must equal `same-origin`. Requests with
  neither header are refused.
- **The CSRF header (`x-effect-auth-csrf: 1`)** is a static marker, not a
  secret: scripts on a trusted origin can send it, while injected HTML forms
  cannot. Setting `requests: 'browser'` skips this header where the browser
  itself initiates the request (like a `WebSocket` upgrade or form `POST`).
- **`SameSite=Lax`** is too coarse alone because every subdomain shares a site;
  comparing exact origins ensures sibling subdomains like
  `user-content.app.example` are trusted only when listed in `trustedOrigins`.

Keep your own `GET` endpoints read-only whenever they rely on cookie auth, so
cross-site links cannot trigger side effects.

## The client's side

Remote's HTTP transport posts every call, so browsers include `Origin`
automatically; add the CSRF header in `httpWithLive`:

```ts
import { httpWithLive } from 'foldkit-remote/live'

const transport = httpWithLive('/remote', {
  headers: () => ({ 'x-effect-auth-csrf': '1' }),
})
```

A `401` refusal reaches your Model as a failure; `RemoteData.denied(error)` from
`foldkit-remote` classifies it as `Unauthenticated` with the server's reason.

## Who the client believes it is

Because cookies are shared across browser tabs, signing in or out in one tab
changes who another tab's next request answers as. Without coordination, an
in-flight read in tab two could merge the new account's rows into the old
account's cached Model.

Pair `AuthServer.answered` on the server with `believing()` on the client so
every request echoes who the tab expects to be:

<!-- docs-check standalone
import { Auth, AuthContract, Password, Sessions } from '@yielded/auth'
import { Context, Effect, Layer, Option, Schema } from 'effect'
import { AuthServer } from 'foldkit-auth/server'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'

const AppAuth = Auth.make(
  AuthContract.make('readme/Auth', {
    claims: Schema.Struct({}),
    actions: sessions => ({ signIn: AuthContract.passwordSignIn(sessions) }),
  }),
  {
    sessions: Sessions.stateful({ idleTimeout: '10 minutes', maxAge: '1 hour' }),
    strategies: { password: Password.make() },
    defaultStrategy: 'password',
  },
)
declare const AppAuthLive: Layer.Layer<Context.Service.Identifier<typeof AppAuth>>
const server = RemoteServer.make<Option.Option<{ readonly id: string }>>({ entities: [] })
const http = { origin: 'https://app.example' } as const
declare const Policy: { readonly key: (user: { readonly id: string }) => string }
const principal = (session: { readonly subjectId: string }) =>
  Effect.succeed({ id: session.subjectId })
-->

```ts
import { believing } from 'foldkit-auth'
import { httpWithLive } from 'foldkit-remote/live'

const resolving = { auth: AppAuth, http, principal, key: Policy.key }
serveFetch({
  server,
  resolvePrincipal: AuthServer.resolver(resolving),
  headers: AuthServer.answered(resolving), // sends `x-foldkit-subject` on each response
  layer: () => AppAuthLive,
})

// Browser: wrap fetch so Remote sends and updates the believed subject.
export const belief = believing()
httpWithLive('/remote', {
  headers: () => ({ 'x-effect-auth-csrf': '1' }),
  fetch: belief.fetch,
})
```

- **`AuthServer.answered`** takes the same config plus `key`, writing
  `subjectSaid(Option.some(key(user)))` or `'visitor'` into `x-foldkit-subject`
  (URI-encoded for Latin-1 headers).
- **`believing()`** tracks the last confirmed subject alongside the cookie. Once
  the cookie resolves to someone else, the server rejects the request with
  `SUBJECT_CHANGED` (`401`).
- **Handling `401`:** Any `401` resets `believing()` to anonymous so subsequent
  reads learn the new identity. When `update` sees `SUBJECT_CHANGED`, call
  `Remote.forget` to re-fetch as the new user; for any other `401` reason
  (`Your session ended.`), prompt the user to sign in.
- **Same-tab sign-in or sign-out:** Call `belief.forget()` in the sign-in or
  sign-out Command before clearing `Remote` state so subsequent reads succeed
  immediately instead of hitting one `SUBJECT_CHANGED` round trip.

[`examples/auth`](../../examples/auth) wires this end to end.

## Sync's socket

Browser `WebSocket` upgrades carry `Origin` but cannot set custom headers like
`x-effect-auth-csrf`. Pass `requests: 'browser'` so the resolver verifies the
`Origin` without requiring the CSRF header, and pass `revalidate` to close open
sockets if the session ends (`4401`):

```ts sketch
import { DurableObject } from 'cloudflare:workers'
import { defineDocumentHost } from 'foldkit-sync/do'

export class SyncHost extends defineDocumentHost(DurableObject, {
  sync, // Sync.make(…)
  openJournal, // document journal opener
  resolvePrincipal: AuthServer.resolver({
    requests: 'browser',
    auth: AppAuth,
    http,
    principal: session => Effect.succeed({ id: session.subjectId }),
  }),
  layer: () => AppAuthLive,
  revalidate: { every: '1 minute' },
}) {}
```

## SSR's posted forms

Forms handled by `foldkit-ssr` without client JavaScript are standard browser
`POST`s. `SSR.entry`'s `origins` check rejects cross-origin form posts with
`403` before reading the body, and `resources` resolves the poster using
`requests: 'browser'`:

<!-- docs-check
declare const config: Parameters<typeof SSR.entry>[0]
declare const plan: Parameters<typeof SSR.entry>[1]
-->

```ts
import { Context, Layer, Option } from 'effect'
import { SSR } from 'foldkit-ssr'

class Principal extends Context.Service<Principal, Option.Option<{ readonly id: string }>>()(
  'app/Principal',
) {}

const whoPosted = AuthServer.resolver({
  requests: 'browser',
  auth: AppAuth,
  http,
  principal: session => Effect.succeed({ id: session.subjectId }),
})

export const entry = SSR.entry(config, plan, {
  buildId: 'b1',
  origins: [http.origin],
  resources: request =>
    Layer.effect(Principal, whoPosted(request)).pipe(Layer.provide(AppAuthLive), Layer.orDie),
})
```

Because `Layer.orDie` converts a failed session check into a defect (`500`),
resolve the session in your host before calling `renderPage` (as `Site.access`
does for `303` redirects) if you want an expired session to redirect to sign-in.

## SSR's page reads

When the server renders a page for whoever navigated to it, the browser sends a
`GET` or `HEAD` navigation with no CSRF header and often no `Origin` or
`Sec-Fetch-Site: same-origin` (for example, from an external link or the address
bar). Use `requests: 'navigation'` for `pageReader` so those page navigations
can read the cookie while refusing non-GET methods, upgrades, and script
`fetch`es (`Sec-Fetch-Mode` other than `navigate`):

```ts
import { pageReader } from 'foldkit-remote-server/fetch'

const pageResolving = { auth: AppAuth, http, principal }
const reader = pageReader({
  server,
  resolvePrincipal: AuthServer.resolver({ ...pageResolving, requests: 'navigation' }),
  layer: () => AppAuthLive,
})
```

Use `'navigation'` exclusively with `pageReader` (which handles reads only and
refuses writes and live streams). Passing it to `serveFetch` would break
writes; `AuthServer.host` separates the two types at compile time.

## One host: `AuthServer.host`

A server answering Yielded's auth routes, `/remote`, and SSR page reads needs
three configurations over one `Auth` service. `AuthServer.host` builds all three
from one config and types `scripted` and `navigation` separately so they cannot
be swapped by mistake:

<!-- docs-check
declare const services: Context.Context<Context.Service.Identifier<typeof AppAuth>>
-->

```ts
const host = AuthServer.host({
  auth: AppAuth,
  http,
  services, // AppAuth's layer, built once: ManagedRuntime.make(AppAuthLive).context()
  principal,
  key: Policy.key,
})

export const site = {
  auth: host.routes, // Yielded's routes under /auth/
  remote: serveFetch({ server, layer: () => Layer.empty, ...host.scripted }),
  read: pageReader({ server, layer: () => Layer.empty, ...host.navigation }),
}
```

- **`host.scripted`** requires a trusted `Origin` and `x-effect-auth-csrf: 1`
  and attaches `AuthServer.answered` headers when `key` is set. Typed as
  `ScriptedRequest`, so passing it to `pageReader` is a compile error.
- **`host.navigation`** allows `GET`/`HEAD` navigations and refuses writes,
  upgrades, and script `fetch`es. Typed as `NavigationRequest`, so passing it
  to `serveFetch` or `defineDocumentHost` is a compile error.
- **`services`** provides `Auth` automatically inside both `host.scripted` and
  `host.navigation`; each `layer` callback only supplies what your Sources and
  `principal` need. Build `services` once per isolate (never per request).
- **Routes:** `host.routes` mounts `Http.make(auth, http)` (without OAuth
  callbacks; passing `http.oauth` throws). Sync sockets still take
  `AuthServer.resolver({ requests: 'browser', … })`. Call `host.dispose()` when
  shutting down; `services` stays caller-managed.

See [`examples/reference/src/worker.ts`](../../examples/reference/src/worker.ts)
on Workers and [`examples/auth/src/server.ts`](../../examples/auth/src/server.ts)
on Node.

## Refusals

| Request condition | Response |
| --- | --- |
| No session cookie | Treated as visitor (`Option.none()`) |
| Missing trusted `Origin` / `Sec-Fetch-Site: same-origin` (or CSRF header) | `401`, `The request did not show it came from this application.` |
| `'navigation'` on non-`GET`/`HEAD`, upgrade, or non-`navigate` mode | `401`, `The request did not show it came from this application.` |
| Cookie expired, signed out, idle, or revoked | `401`, `Your session ended.` |
| Multiple session cookies on the request | `401`, `Sign in again.` |
| `x-foldkit-subject` differs from the active session | `401`, `Who is signed in changed.` (`SUBJECT_CHANGED`) |
| Session store error | `500` defect (never falls back to visitor) |

Pages with `Referrer-Policy: no-referrer` send `Origin: null`, and same-origin
`GET`s omit `Origin`; both pass when `Sec-Fetch-Site` equals `same-origin`.
Browsers send Fetch Metadata only over secure contexts (`https:` and
`localhost`), so plain `http:` on remote hosts is refused.

- **Long-lived connections:** `revalidate` re-checks the cookie a live stream or
  socket opened with. Because Yielded rotates session credentials on renewal, an
  open socket closes with `4401` (`Your session ended.`) after renewal so the
  client reconnects with the new cookie.
- **Session idle timeouts:** `verifySession` checks validity without extending
  `idleTimeout`. Call Yielded's `renewSession` while the user is active, or
  size `idleTimeout` to fit your session lifetime.
- **Subject header (`x-foldkit-subject`):** Imported as `SUBJECT_HEADER` from
  `foldkit-auth` (browser-safe, no Yielded import). Holds `'visitor'` or
  `'subject:<key>'`. Without `key`, the resolver compares against
  `session.subjectId`.

## On Workers with D1

[`examples/cloudflare`](../../examples/cloudflare) wires Yielded Auth and
`AuthServer.resolver` on Miniflare and D1 (`src/authRoutes.ts`,
`migrations/0005_auth.sql`, `test/auth.test.ts`). Three Workers-specific rules:

- **Use `@yielded/auth-persistence-drizzle/D1`:** `@effect/sql-d1` rejects
  interactive transactions; the Drizzle D1 adapter commits via D1 atomic batches
  given `D1Client.layer({ db: env.DB })` and
  `Persistence.managed({ subjects, prefix })`.
- **Write your own migrations:** Yielded validates expected columns and unique
  keys at startup instead of running DDL. Declare the managed tables in your
  Drizzle schema and migrations.
- **Keep `@yielded/auth-platform-workerd` in server entry code only:** It
  requires `nodejs_compat` and bundles an Argon2 `.wasm` module that Node tests
  cannot load. Keep shared `Auth.make` and table schemas in a separate module.

Three runtime tips for Workers:

- **Build auth once per isolate:** Initialize `AppAuth` and persistence once in
  a `ManagedRuntime` per D1 binding (via `Host.isolate`), and pass its context
  to each request. Rebuilding per request re-runs first-use storage checks and
  can fail concurrent requests with `500`.
- **Allow small clock skew:** Workers `Date.now()` advances only between I/O
  turns, so a newly issued session can appear slightly ahead of D1's clock and
  fail with `PasswordRejected`. Provide tolerance via
  `Operations.AuthenticationClock.layer({ futureToleranceMillis: 1000 })`.
- **Use a shared `RateLimiterStore` for global limits:** Default password rate
  limiting (10 attempts per email/account, then 1 per 6 seconds) lives in
  isolate memory. Provide an Effect `RateLimiterStore` for limits shared across
  isolates, and sign each test account in once in automated tests.

## Signing up

`foldkit-auth` reads sessions; account registration lives in Yielded's password
strategy, which inserts your application's account row in the same commit via a
provisioning hook. Four parts wire it together:

**1. Declare the `register` action in your contract:**

```ts standalone
import { AuthContract, Password } from '@yielded/auth'
import { Email } from '@yielded/auth/Schema'
import { Schema } from 'effect'

export const Registration = Schema.Struct({ displayName: Schema.NonEmptyString })

export const AuthApi = AuthContract.make('app/Auth', {
  claims: Schema.Struct({}),
  actions: sessions => ({
    signIn: AuthContract.passwordSignIn(sessions),
    register: AuthContract.action({
      payload: Schema.Struct({
        requestId: Password.PasswordCommandId,
        email: Email,
        newPassword: Schema.RedactedFromValue(Schema.String),
        registration: Registration,
      }),
      success: Schema.TaggedStruct('RegistrationAccepted', {}),
      error: Schema.Union([
        Password.NewPasswordRejected,
        Password.PasswordCheckUnavailable,
        Password.PasswordRejected,
        Password.PasswordUnavailable,
        Password.PasswordMethodUnsupported,
        Password.PasswordActionRequired,
      ]),
      mode: 'mutation',
      replay: 'idempotent',
    }),
  }),
})
```

**2. Configure `Password.make` with `registration` and `reset`:**
`Password.resetLink({ url })` validates an `https:` URL with no query or
fragment and an exact `href` (such as `'https://app.example/reset'`);
`Password.resetCode()` uses `Proofs.ProofKeys` instead.

```ts
import { Auth, Sessions } from '@yielded/auth'

export const AppAuth = Auth.make(AuthApi, {
  sessions: Sessions.stateful({ idleTimeout: '1 hour', maxAge: '1 day' }),
  strategies: {
    password: Password.make({
      registration: Registration,
      reset: Password.resetLink({ url: 'https://app.example/reset' }),
    }),
  },
  defaultStrategy: 'password',
})
```

**3. Provision the application's subject row atomically:**

```ts
import { AuthPersistence } from '@yielded/auth-persistence'
import { Effect, Layer } from 'effect'

const Persistence = AuthPersistence.make(AppAuth)

export const Provisioning = Layer.succeed(Persistence.Provisioning, {
  password: {
    values: ({ identifier, registration }) =>
      Effect.sync(() => ({
        id: crypto.randomUUID(),
        status: 'active',
        securityRevision: crypto.randomUUID(),
        email: identifier.value,
        displayName: registration.displayName,
      })),
  },
})
```

**4. Provide the password-management services:**
Screen new passwords with `Password.CompromisedPasswords`, and provide
`PasswordActionEvidence` and `EmailDelivery` stubs if your contract omits
password-change and reset actions:

```ts
import { EmailDelivery } from '@yielded/auth'
import { Redacted } from 'effect'

const common = new Set(['password password', 'correct horse battery staple'])

export const PasswordOnly = Layer.mergeAll(
  Layer.succeed(Password.CompromisedPasswords, {
    check: password =>
      Effect.succeed(
        common.has(Redacted.value(password))
          ? { _tag: 'Rejected', reason: 'common' }
          : { _tag: 'Allowed' },
      ),
  }),
  Layer.succeed(Password.PasswordActionEvidence, {
    verify: () => Effect.fail(Password.PasswordActionRequired.make({})),
  }),
  Layer.succeed(EmailDelivery.EmailDelivery, {
    send: () => Effect.fail(EmailDelivery.EmailNotAccepted.make({})),
  }),
)
```

Provide `PasswordOnly` to `AppAuth.layer` and `Provisioning` to
`Persistence.layer` alongside SQL persistence (Yielded's in-memory `Testing`
store refuses password management; use SQLite in memory for sign-up tests).

**From the browser, register then sign in:** `register` always answers
`RegistrationAccepted` without leaking whether an email is already taken, and
requires at least 15 code points by default (override via
`Password.NewPasswordCheck.layer`):

```ts
import * as Client from '@yielded/auth/Client'

const AppClient = Client.make(AuthApi, { baseUrl: location.origin })

export const signUp = (form: {
  readonly requestId: string
  readonly email: string
  readonly password: Redacted.Redacted<string>
  readonly displayName: string
}) =>
  Effect.gen(function* () {
    const { auth } = yield* AppClient
    yield* auth.register({
      requestId: form.requestId,
      email: form.email,
      newPassword: Redacted.value(form.password),
      registration: { displayName: form.displayName },
    })
    return yield* auth.signIn({ email: form.email, password: Redacted.value(form.password) })
  })
```

Call `belief.forget()` after `signIn` succeeds so subsequent Remote requests pick
up the new session immediately.

## Limits

- **Cookie sessions only:** Bearer credentials (such as MCP tokens) are not
  read by these resolvers.
- **Sync reconnect on rotation:** After a session credential rotates, a Sync
  replica receives `4401` and reconnects; browsers do not expose HTTP failure
  reasons on `WebSocket` upgrades.
- **Subdomain cookies:** Setting a `domain` on the session cookie allows
  subdomains to set a duplicate cookie of the same name, causing
  `Sign in again.` (`401`) until cleared.

## Next

- Enforce row and field permissions from the resolved principal: [`foldkit-guard`](../guard/README.md) and [Auth and Guard](../../docs/auth-and-guard.md)
- Wire auth routes, Remote, and SSR into one Worker: [`foldkit-host`](../host/README.md)
- Handle `401` and `SUBJECT_CHANGED` in your UI: [Errors and failures](../../docs/errors.md#refusals)
