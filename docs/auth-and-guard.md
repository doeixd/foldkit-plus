# Auth and Guard

When users sign in with a session cookie, your server has two distinct security questions on every request: **who is asking**, and **what are they allowed to read or change**. Mixing those checks inside ad-hoc handlers either locks out public visitors or leaves authorization gaps across server queries, sync journals, and AI agents.

`foldkit-auth` answers **who is asking** by turning a request's session into your application's **principal** (`User`, or `Option.none()` for an unauthenticated visitor). `foldkit-guard` answers **what they may do** by enforcing read, write, and capability rules against that principal across every seam. Both packages work independently or together through that single principal value.

## How Auth and Guard split responsibility

A request enters `foldkit-auth`, which verifies the cookie/CSRF header and builds your principal; that principal then passes to `foldkit-guard`, which filters readable rows, checks write permissions, and computes UI `may` hints.

| Question | Package / hook | Where it runs | Failure behavior |
| --- | --- | --- | --- |
| Valid session on this request? | `foldkit-auth` (`AuthServer.resolver`) | Server per request | `401 Unauthenticated` before reads |
| Who is the session (`User`, role)? | Your `principal` callback | Server per request | `401` if callback refuses session |
| Which rows and fields can they read? | `foldkit-guard` (Read rules) | Server SQL or evaluator | Filtered out silently |
| May they execute this write? | `foldkit-guard` (Write rules) | Server before/in write | `403 Forbidden` |
| What may the UI draw as allowed? | `Me` and row `may` hints | Server computes; client reads | Button hidden; server re-checks |
| Sign-in, sign-out, cookies | Yielded Auth | Auth routes | `PasswordRejected`, etc. |

Two rules keep the boundary clean:

- **A visitor is valid, not a 401:** A request with no cookie resolves to `Option.none()`, and guard rules decide what public rows a visitor may read. `foldkit-auth` returns `401` only for expired/invalid sessions or missing CSRF headers.
- **Auth authenticates; Guard authorizes:** Resolve identity in `principal`, and keep role or ownership checks inside your guard set so Remote, Sync, and agents enforce the same policy.

## Sharing one principal type across client and server

Your guard set declares the principal schema, and `foldkit-auth`'s `principal` callback returns a value matching it. That schema is the entire contract between the two packages (from [`examples/auth/src/domain.ts`](../examples/auth/src/domain.ts)):

```ts
import { Schema } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'

export const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['admin', 'member']),
})
export type User = typeof User.Type

const NoteFields = Entity.define(
  'Note',
  Schema.Struct({ id: Schema.String, authorId: Schema.String, title: Schema.String }),
)

export const G = Guards.declare(
  'Notes',
  User,
  guard => ({
    isAdmin: guard.principal(),
    isAuthor: guard.row(NoteFields, p => Expr.eq(NoteFields.fields.authorId, p.id)),
  }),
  { key: user => user.id, unguarded: 'deny' },
)

export const Note = NoteFields.pipe(Guards.attach(G, { row: { Read: [G.isAuthor, G.isAdmin] } }))
```

Both browser and server import this shared domain file. `isAdmin` is declared here as a named predicate whose server implementation stays private, while `isAuthor` is a data expression (`Expr`) that compiles directly to SQL (see [Expressions](./expressions.md)).

On the server, wire both into one endpoint (reduced from [`examples/auth/src/server.ts`](../examples/auth/src/server.ts), where `AppAuth`, `AppAuthLive`, `http`, `Users`, and `server` come from your app's auth and server setup):

<!-- docs-check
import { Auth, AuthContract, Password, Sessions } from '@yielded/auth'
import { Context, Effect, Layer, Schema } from 'effect'
import { RemoteServer } from 'foldkit-remote-server'
const AppAuth = Auth.make(
  AuthContract.make('docs/Auth', {
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
const http = { origin: 'https://app.example' } as const
declare const Users: { readonly find: (id: string) => Effect.Effect<User> }
const server = RemoteServer.make<Option.Option<User>>({ entities: [] })
-->

```ts
import { Option } from 'effect'
import { AuthServer } from 'foldkit-auth/server'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'

// Guard: server-only bodies for principal predicates.
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

// Auth: look up the current User per request rather than trusting old claims.
const principal = (session: { readonly subjectId: string }) => Users.find(session.subjectId)

const resolving = { auth: AppAuth, http, principal, key: Policy.key }

export const remote = serveFetch({
  server,
  resolvePrincipal: AuthServer.resolver(resolving),
  headers: AuthServer.answered(resolving),
  layer: () => AppAuthLive,
})
```

`serveFetch` resolves the principal once per request and hands it to your server Sources, marking responses `cache-control: no-store` by default so user-specific answers stay private.

## Drawing capabilities and handling refusals in the browser

Rules run on the server; the client renders UI from filtered rows, server-computed `may` flags, and `RemoteData.denied` errors:

| On the client | Source | Purpose |
| --- | --- | --- |
| `Me` (`Guards.me`) | `foldkit-guard` | Row with `signedIn`, `key`, and top-level `may` flags |
| Row `may` | `foldkit-guard` | Per-row permission hint computed by the server |
| `RemoteData.denied(err)` | `foldkit-remote` | Surfaces `Unauthenticated` (401) or `Forbidden` (403) |
| `believing()` | `foldkit-auth` | Fetch wrapper detecting account switches in other tabs |
| `Site.access` | `foldkit-site` | Redirects unauthenticated visitors away from private UI |

**Draw from `may`, recover from `denied`.** Hide buttons when `may` says no, prompt for sign-in (and call `Remote.forget`) on `401 Unauthenticated`, and surface a permission error on `403 Forbidden`.

Because `may` is only a UI hint, the server ignores client `may` flags and re-evaluates every write rule when a mutation arrives. If the client already holds a `may` saying no, it can reject the write locally as `Forbidden` right away to save a round trip. See [what `may` tells a reader](../packages/guard/README.md#what-may-tells-a-reader-and-what-it-does-not) for details.

## Failure scenarios end to end

| Scenario | Auth | Guard | Client sees |
| --- | --- | --- | --- |
| No cookie | `Option.none()` visitor | Evaluates visitor rules | Public rows only; `signedIn: false` |
| Missing CSRF or foreign cookie | `401` | Skipped | `denied`: `Unauthenticated` |
| Expired or signed-out session | `401` (`Your session ended.`) | Skipped | `denied`: `Unauthenticated` |
| Other tab switched accounts | `401` (`SUBJECT_CHANGED`) | Skipped | Call `Remote.forget` and re-fetch |
| Read rule fails for user | Resolves `User` | Filters row out | Row omitted from results |
| Write rule fails for user | Resolves `User` | `403`; write aborted | `denied`: `Forbidden` |
| Source skips Read rules | — | `GuardServer.validate` throws | Server refuses to boot |

## Using Guard or Auth on its own

- **Guard without Auth:** Supply any `resolvePrincipal` function returning your principal type (for example, a bearer token parser or test header reader).
- **Auth without Guard:** `AuthServer.resolver` returns your `User` directly so custom Sources can inspect it, though you give up shared declarative enforcement and automatic `Me` flags.

## Keep keys, fresh lookups, and hosts aligned

- **Share one principal key:** Pass `Policy.key` to `AuthServer.resolver` so client subject checks (`Me.key` and `AuthServer.answered`) match server identity.
- **Look up fresh principals:** Load `User` from your database per request by `subjectId` instead of trusting login-time claims that miss role revocations.
- **Use the right host resolver:** Pair `serveFetch` with `pageReader` (`requests: 'navigation'`) using `AuthServer.host`, and use `requests: 'browser'` for WebSocket sync hosts (`documentHost`) where browsers omit custom CSRF headers.
- **Validate at startup:** Run `GuardServer.validate(Policy, ...)` at boot so an unguarded Source fails immediately.

## Next

- See the full auth and guard example app in [`examples/auth`](../examples/auth).
- Read the [`foldkit-auth` README](../packages/auth/README.md) for session resolvers, `believing()`, and CSRF options.
- Read the [`foldkit-guard` README](../packages/guard/README.md) for row rules, write rules, and `may` flags.
