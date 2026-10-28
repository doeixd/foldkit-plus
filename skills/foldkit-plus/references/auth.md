# foldkit-auth

A [Yielded Auth](https://github.com/yielded-dev/auth) session read from a
request and handed to Remote's `serveFetch` (`AuthServer.resolver`) and
Sync's `defineDocumentHost` (`requests: 'browser'`) as their principal. The design and
its reasons are
[auth-DESIGN.md](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/auth-DESIGN.md).

## What it owns

Which session a request carries, and whether the request is trusted to use
it. Yielded owns sign-in, sessions and the cookie (the application mounts
`Http.layer(AppAuth, http)` itself); the application's `principal` function
owns who a session is in its terms; `foldkit-guard` owns who may do what.

## Basic use

```ts
import { Effect } from 'effect'
import { AuthServer } from 'foldkit-auth/server'
import { Remote } from 'foldkit-remote'
import { serveFetch } from 'foldkit-remote-server/fetch'

const http = { origin: 'https://app.example' } as const // the options given Http.make(AppAuth, http)

export const remote = serveFetch({
  server,
  resolvePrincipal: AuthServer.resolver({
    auth: AppAuth, // Auth.make(…)
    http,
    principal: session => Effect.succeed({ id: session.subjectId }),
  }),
  layer: () => AppAuthLive, // AppAuth.layer, with its persistence
})

// the client: Origin comes with every POST; the CSRF header is yours to send
const transport = Remote.httpWithLive('/remote', {
  headers: () => ({ 'x-effect-auth-csrf': '1' }),
})
```

- The result is `Option<User>`: `none` is a visitor. The host's `layer` must
  provide `AppAuth`, the same store the sign-in routes write.
- Pass the same `http` object given `Http.make`: the cookie name, trusted
  origins and CSRF header come from it.
- Build the principal from `session.subjectId`, reading memberships fresh;
  claims are a snapshot from sign-in. `principal` may refuse with
  `RemoteServer.unauthenticated(reason)`.

## What it answers

| Request | Answer |
| --- | --- |
| No session cookie | visitor |
| A cookie without a trusted `Origin` or, where `Origin` is missing or `null`, `Sec-Fetch-Site: same-origin` (and, unless `requests: 'browser'`, the CSRF header `x-effect-auth-csrf: 1`) | 401 `The request did not show it came from this application.` |
| A cookie that no longer verifies | 401 `Your session ended.` |
| Two session cookies | 401 `Sign in again.` |
| `x-foldkit-subject` naming someone else | 401 `Who is signed in changed.` |
| The session store fails | defect, a 500 |

A 401 reaches the client as `RemoteUnauthenticated` (`_tag: 'Unauthenticated'`)
on every Remote call kind.

## Gotchas

- On Workers with D1, persist through `@yielded/auth-persistence-drizzle/D1`
  (D1 batches; the core `AuthPersistence` commits in a transaction `@effect/sql-d1` refuses), write
  Yielded's managed tables as your own migration, and bundle
  `WorkerdServices`' Argon2 `.wasm` with `nodejs_compat`
  ([examples/cloudflare](https://github.com/doeixd/foldkit-plus/tree/main/examples/cloudflare)'s
  `src/auth.ts`, `src/authRoutes.ts`, `migrations/0005_auth.sql`).
- On Workers with D1, build auth once per isolate (a `ManagedRuntime`, its
  context provided per request), not per request, and give Yielded's
  `Operations.AuthenticationClock.layer({ futureToleranceMillis: 1000 })`: the
  Worker's clock and D1's differ, and the strict default refuses a correct
  password as `PasswordRejected` now and then.
- Remote's calls verify a session and never renew it: a session with an
  `idleTimeout` ends that long after its last renewal. Renew through Yielded
  (`renewSession`) while the reader is active.
- An application needs Foldkit's exact `effect: 4.0.0` peer allowed
  (`pnpm.peerDependencyRules.allowedVersions: { "foldkit>effect": "4.0.4" }`),
  since Yielded needs 4.0.3 or later. npm refuses the pair outright: add
  `legacy-peer-deps=true` to `.npmrc` and install `effect@^4.0.4`.

- `x-foldkit-subject` (`SUBJECT_HEADER` from `foldkit-auth`, browser-safe):
  give `serveFetch` `headers: AuthServer.answered(config)` (the resolver's
  config, with `key: Policy.key`) and the client's transport
  `fetch: believing().fetch`. The client then repeats whom it was answered
  as, and a read after another tab switched account is refused with
  `SUBJECT_CHANGED` rather than answered as the new account: answer that
  refusal with `Remote.forget`, and call `belief.forget()` in this tab's own
  sign-in and sign-out Commands.
- Sync's upgrade and SSR's posted forms send no header of the page's: pass
  `requests: 'browser'`, and a trusted `Origin` alone vouches for the
  cookie. Sync takes the resolver with `layer: () => AppAuthLive`; SSR builds
  a post's `resources` from it, behind `SSR.entry`'s `origins`.
- A page's own reads before it renders (`foldkit-remote-server/fetch`'s
  `pageReader`) resolve the page request, a navigation with no `Origin` or
  CSRF header: pass `requests: 'navigation'`, which reads the cookie of a
  `GET` or `HEAD` navigation only (never an `Upgrade`, nor a request whose
  `Sec-Fetch-Mode` is not `navigate`). That reader cannot write, which is why no check is
  needed there; never give this resolver to `serveFetch`.
- Yielded counts password attempts (10 per email and per account, then one
  every 6s, successes included) in memory unless given an Effect
  `RateLimiterStore`: on Workers that is per isolate, and a test that signs
  one account in more than ten times quickly is refused `PasswordRejected`.
- Only cookie sessions so far; `Me` is `foldkit-guard`'s (`Guards.me`), and
  the client's sign-in and sign-out are the application's Commands over
  Yielded's client (`examples/auth`). Keep that client out of the entry chunk
  with `foldkit-bundle`'s `Resource.lazy` (see `bundle.md`): the entry names
  it by type only, and the Commands read it with `Resource.get`.

## Sign-up

Creating an account is Yielded's password strategy (`@yielded/auth@0.1.0-beta.43`),
not `foldkit-auth`'s. The README's
[Signing up](https://github.com/doeixd/foldkit-plus/blob/main/packages/auth/README.md#signing-up)
has the compiled wiring; what it takes:

- A `register` action in the contract, declared with `AuthContract.action`
  (payload `{ requestId: Password.PasswordCommandId, email, newPassword,
  registration }`, success `RegistrationAccepted`), since Yielded has no helper.
- `Password.make({ registration, reset })`: registration is accepted only
  beside `reset`. `Password.resetLink({ url })` fails the layer build with
  `ProofConfigurationError { reason: 'delivery' }` unless `url` is `https:`
  and exactly its own `href`; `Password.resetCode()` needs `Proofs.ProofKeys`
  instead. With no reset action in the contract, none is served.
- `Persistence.Provisioning` (from `AuthPersistence.make(AppAuth)`) returns
  the application's account row as `{ values }`, keyed by the subject
  table's column keys; Yielded inserts it in the same commit as the
  credential. D1 accepts only this form.
- `Password.CompromisedPasswords` (asked at every sign-up; no permissive
  default), and refusing stubs of `Password.PasswordActionEvidence` and
  `EmailDelivery.EmailDelivery` when the contract has no change or reset.
- The client calls `register`, then `signIn`. `register` answers alike for a
  new and a taken email and signs no one in. New passwords need 15 code points
  by default (`NewPasswordRejected`). Yielded's `Testing` store refuses
  password management, so sign-up tests need SQL persistence.

## See also

- [foldkit-auth README](https://github.com/doeixd/foldkit-plus/blob/main/packages/auth/README.md)
- [examples/auth](https://github.com/doeixd/foldkit-plus/tree/main/examples/auth): sign-in, `Me`, the cross-tab broadcast and the subject echo, end to end.
- [examples/cloudflare](https://github.com/doeixd/foldkit-plus/tree/main/examples/cloudflare): sign-up and sign-in persisted on D1 in a Worker, read back through `AuthServer.resolver`.
- [guard.md](guard.md): deciding what the principal may do.
