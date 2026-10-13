# Authentication: Yielded Auth in Foldkit Plus

**Status:** Proposed, 2026-10-13; step 0 built the same day (§3, §9), and §10's questions settled. Nothing in §5 onwards is built. §2 and §3 record what was measured on that date: an inventory of every principal seam, an Effect 4.0.4 run of the whole repository, and a probe that served a guarded Remote read under a Yielded session.
**Target:** a new package, `foldkit-auth`, over [Yielded Auth](https://github.com/yielded-dev/auth) (`@yielded/auth`, `0.1.0-beta.38`); small changes in `foldkit-remote-server`, `foldkit-remote`, `foldkit-remote-drizzle`, `foldkit-sync`, `foldkit-ssr`, `foldkit-agent-mcp`, `foldkit-site` and `foldkit-guard`.
**Related:** [guard-DESIGN.md](./guard-DESIGN.md) (§6.5 `G.Principal`, §8a the `Me` Entity, §8b agents, §8c Sync), [router-DESIGN.md](./router-DESIGN.md) §25 (route guards are presentation), [server-DESIGN.md](./server-DESIGN.md) §19.5 (principal and CSRF middleware per host), [TODO.md](./TODO.md).

Snippets in §5 to §8 are sketches of an API that does not exist yet. The only code here that ran is §3's probe.

---

## 0. The decision in one page

Foldkit Plus decides **who may do what** (`foldkit-guard`) and carries **who is asking** through every seam (`G.Principal`, Sync's connection principal, an agent's principal). It has never decided **who is asking**: every example invents it from a header, a query parameter or a name in `sessionStorage`, with a comment that a real deployment would verify a session. Yielded Auth is that missing third: sign-in methods, sessions, and credential delivery, as Effect services, with the application owning its accounts and its authorization.

```text
Yielded Auth      who is asking      verifies evidence, issues and verifies sessions
foldkit-auth      the seam           a verified session becomes G.Principal, at every entry point;
                                     the client's "who am I" stays in step with the server's
foldkit-guard     who may do what    decides each read and write for that principal
Remote, Sync,     the carriers       read the principal; never parse a credential themselves
SSR, agents
```

The decision:

> **Authentication is Yielded's, authorization is guard's, and `foldkit-auth` is the one place a Yielded session becomes a Foldkit Plus principal.** Every host (Remote over HTTP, Remote's live stream, Sync's socket, SSR, the MCP endpoint) resolves the principal the same way, from a verified credential and never from a value the client names. The seams it plugs into are made generic first, so that they are right with or without Yielded; `foldkit-auth` is then a thin adapter, not a second abstraction over authentication libraries.

Three rules the design keeps, each answering a failure found in §2:

1. **A request is answered as exactly one principal, resolved once, from a verified credential.** A credential that does not verify is either a visitor (none was sent) or a `401` (one was sent and is no longer good), never a quiet visitor in its place.
2. **The client says whom it believes it is, and the server refuses to answer as anyone else.** A sign-out in another tab, an expiry or a switch of account otherwise turns the next read into a visitor's, and the client tombstones every row it held (§6.2).
3. **A cookie-authenticated write proves it came from the application's own origin**, by the same Origin and CSRF-header check Yielded applies to its own sign-in and sign-out (§6.3).

---

## 1. What Yielded Auth is, in the terms used here

Read from its source at `5259166` (2026-10-12) and its published `0.1.0-beta.38`.

- **A shared contract.** `AuthContract.make('app/Auth', { claims, actions })` holds Schemas only, so the browser may import it. `Auth.make(contract, { sessions, strategies })` binds it on the server; `Client.make(contract, { baseUrl })` is a Context service whose methods are Effects over `HttpClient` (no React, no Effect Atom needed).
- **Strategies:** password, email code or link, SMS, passkey, OAuth/OIDC (about twenty-five providers), TOTP as a second factor. A multi-step method returns a flow id and keeps a private request binding in a cookie.
- **Sessions:** `stateful`, `stateless` or `stateAssisted`. A session is `{ sessionId, subjectId, securityRevision, assurance, issuedAt, expiresAt, absoluteExpiresAt, claims }`; `claims` is typed by the contract's Schema and is a **snapshot taken at issuance**.
- **Reading a session on the server:** `auth.getSession()` / `requireSession()` inside a request (they need `AuthRequest`, which `http.middleware` or `http.withRequest(effect)` provides), and `auth.verifySession(redactedCredential)` outside one (sockets, background work). An invalid credential is `null` (or `SessionInvalid`); storage being unavailable stays a failure.
- **The cookie** is `__Host-effect-auth-session`: HttpOnly, Secure, `SameSite=Lax` by default. Its mutations (`signIn`, `signOut`, `renewSession`) require a trusted `Origin` and the header `x-effect-auth-csrf: 1`; `AuthRequest.beforeMutation` runs that check.
- **What the application owns:** `SessionClaims` (a verified identity to claims), `AuthenticationAuthority` (subject status, factor policy, revisions), storage (managed tables, mapped tables, or its own services), and "authorization for your application's actions". Yielded's own `Operations.makeOperation({ access, authorize })` and `requireAssurance` are authorization helpers for its operations; there is no permission model to collide with guard's.
- **What it does not offer:** a push of session changes (the client has an internal per-instance listener behind `Symbol.for('effect-auth/Client')`, not exported, and nothing crosses tabs); lifecycle events with a `sessionId` (a revocation cannot be traced to a connection); a helper that turns a Web `Request` into an `AuthRequest` outside Effect's `HttpRouter` (`HttpRouter.toWebHandler` is the path for Workers and Vite).

---

## 2. What exists in Foldkit Plus

### 2.1 The principal seams, as they are

| Seam | Where the principal comes from | Typed as | Read |
| --- | --- | --- | --- |
| `RemoteServer.handlers(server, principal)` | a value, or a Context key read per call | `P` | per call |
| `serveFetch({ resolvePrincipal })` | `(Request, env) => P \| Promise<P>`; a throw is a 401 with its message | `P` | per request; value only, no key |
| `liveHub(…, { key })` | the subscriber's principal, held for the stream | `P` | once per stream; default key is object identity |
| `Visible` (remote-drizzle) | handed in by the Source | `unknown`, no `R` | per read |
| `RemoteServer.memory`'s `readable` | handed in | `P`, no `R` | per read |
| `defineDocumentHost({ resolvePrincipal })` (Sync on Workers) | as `serveFetch` | `P` | per WebSocket upgrade |
| `journalExchange({ principal, opens, admit })` | a value fixed per connection | `P`; `opens`/`admit` have no `R` | per connection |
| `Sync.presence.serve(…, { peerId })` | a string the server picks | `string` | per connection |
| agent-mcp `authenticate(request)` | synchronous, plain header record | `P \| undefined` | per MCP session |
| `AgentHost.principal(invocation)` | the host | `P` | per invocation |
| `SSR.entry({ flags, headers })` | only through Flags | — | per request |
| `CmsServer.make({ policy })` | `Policy<User>`, `R = never` | `Option<User>` | per call |

No package or example provides `G.Principal` outside a test. The examples: todo-app and sync take `?token=`; cloudflare an `x-actor` header (CORS `*`, so a cookie could not ride); cms an `x-chair` header; registry `?device=`; kitchen-sink uses three principal types in one application.

### 2.2 What is missing, by consequence

1. **Nothing verifies a credential.** Every host would need its own parsing, and each example's comment says so.
2. **Three resolver shapes** (`Promise`-returning function, synchronous function, Context key). The two functions cannot require a service, so cannot call `auth.getSession()`; the Context key can carry any principal, but leaves resolving it to a host that no package or example provides.
3. **A refusal and a breakage look alike.** `serveFetch` and `defineDocumentHost` answer any throw from `resolvePrincipal` as a 401 carrying its message: a database outage while reading a session would tell the caller "401: connection refused".
4. **No `R` where guard decides reads.** `Visible`, `MemoryReadable`, Sync's `opens`/`admit`, and so `GuardDrizzle.visible`, `GuardServer.memory`, `GuardSync` and `CmsServer.make` all take a `Policy<User>` whose bodies need no service. guard-DESIGN §3.4 promised a body may name one in `R` (a membership service, the auth service for step-up); writes keep that promise (`GuardServer.writer` and `mutation` take `Policy<User, R>`), reads do not.
5. **The client has no idea of "signed out".** `Remote.http` turns a 401 into a generic error for reads, queries, mutations and live alike; only `Forbidden` is typed. With cookies, a session that ends mid-use makes the next read a visitor's, the rows a visitor may not read come back absent, and the client tombstones them as `NotFound`.
6. **Cookie-authenticated Remote mutations are unprotected against CSRF.** `serveFetch` parses any body as JSON whatever its `Content-Type` and checks no `Origin`. `SameSite=Lax` stops a cross-site POST from carrying the cookie, but not one from a sibling subdomain. TODO.md's Server section already lists "Principal and CSRF middleware per host".
7. **A live stream outlives its session.** A Remote live subscription and a Sync socket keep the principal they opened with; a revoked or expired session keeps receiving patches until the connection drops.
8. **SSR cannot render as anyone.** `SSR.entry` has Flags and response headers, no per-request Layer, so `Data.satisfy` during a server render runs without a principal.
9. **`Me` does not exist** (guard-DESIGN §8a; TODO.md Guards). Nothing tells the client who it is, or whether to show "Sign in" or the admin link, without running a rule.

---

## 3. The Effect version: a prerequisite

Yielded's packages each declare the peer `effect: ^4.0.3`. `foldkit` 0.165.0 (pinned here) through 0.168.0 (the latest) declare the peer `effect: 4.0.0` exactly, and Foldkit is maintained outside this repository. The two cannot share one Effect without an override.

Measured in a worktree with `pnpm.overrides: { effect: 4.0.4 }` (one copy of Effect resolved):

- **Types:** every package passes `tsc -b --force`. Two examples copied from upstream Foldkit fail (`examples/foldkit/job-application`, `kanban`, 115 errors): `Crypto.randomUUIDv4` became a function within 4.0.x, so `yield* crypto.randomUUIDv4` no longer type-checks. Both pass on 4.0.0.
- **Tests:** 8933 of 8938 pass; five fail and one file fails to load. Rerun alone, all of them pass on 4.0.0:
  - `examples/livestore`: the override reached LiveStore's own Effect release candidate, which has `effect/unstable/*` and 4.0.4 does not. An override scoped to `effect@4.0.0` leaves it alone.
  - `examples/foldkit/job-application` (2 tests): the `randomUUIDv4` change, at runtime.
  - `packages/mixins-builder` (3 tests): the run logs "ResizeObserver is not defined" defects, the Mount `foldkit-primitives`' `Measure` acquires in jsdom. On 4.0.0 that Mount fails silently, as the trap list records; on 4.0.4 the drawings these tests read are missing. *Settled in step 0:* a probe of both versions shows `Stream.callback` swallowing a throw in its registration on 4.0.0 (the stream hangs) and ending the stream with the defect on 4.0.4. `foldkit-mixins` merges a slot's Behaviors into one Mount, and a failing one fails the merge by design (mixins-DESIGN, "Stream merge"), so `Measure`'s failure now ends the canvas's selection and drag Behaviors too. `Measure` refuses to run without a `ResizeObserver`, also by design and tested; the three tests had passed only because 4.0.0 hid that. They now give jsdom a `ResizeObserver` and `document.fonts` (`packages/mixins-builder/test/layout.ts`).
- **The probe** (a test in that worktree, not committed): Yielded's in-memory password sign-in issued a session; `auth.verifySession` turned its credential into `Option<User>`; one `RemoteServer.handlers(server, G.Principal)` set answered the owner with the row, a visitor and a forged credential with nothing. It type-checks under the repository's settings, and mapping every session to another user turns it red.

So: **step 0 moves the repository to Effect ≥ 4.0.4** behind a scoped override, fixes the two examples, settles the Mount behaviour, and asks Foldkit to widen its peer to `^4.0.0`. An application using `foldkit-auth` needs the same override until Foldkit does; the package README says so in its install section.

*Built (step 0):* every exact `effect` and `@effect/*` pin moved to `4.0.4`; the packages' peer stays `^4.0.0`, and `foldkit-durable`'s runtime dependency `@effect/sql-sqlite-node` stays `4.0.0` (its peer is `^4.0.0`), so a consumer is not narrowed. The root `package.json` allows Foldkit's exact peers (`peerDependencyRules.allowedVersions` for `foldkit>effect`, `@foldkit/ui>effect`, `@foldkit/vite-plugin>effect`) and overrides `foldkit>@effect/platform-browser`, which pnpm otherwise installs at Foldkit's exact `4.0.0` for every project that does not name it. The LiveStore example pins the `@effect/platform-*` packages it resolved before, since it runs on Effect's release candidate. The request to Foldkit is not sent: it is the maintainer's to make.

---

## 4. Ownership

| Fact | Owner |
| --- | --- |
| Accounts, subjects, claims, factor policy | the application, through Yielded's `SessionClaims` and `AuthenticationAuthority` |
| Credentials, sessions, cookies, sign-in ceremonies | Yielded Auth |
| Which principal a request is answered as | `foldkit-auth/server`, once per request or connection |
| The principal's shape | the guard set's Schema (`Guards.declare(name, User, …)`); `foldkit-auth` maps a session onto it |
| Who may do what | `foldkit-guard` |
| Who the client believes it is | the `Me` row, a server fact read through Remote like any other |
| Starting and finishing a sign-in from the UI | the application's `update`, through Commands `foldkit-auth/client` builds |

`foldkit-auth` holds no state of its own on either side: the session is Yielded's, the principal is computed per request, and the client's knowledge of it is a Remote row in the Model.

---

## 5. Generic seams first

These change packages that know nothing of Yielded, and each is right on its own: a host using any other authentication provides the same things. They come before `foldkit-auth` so that the adapter is wiring, not workarounds.

### 5.1 One way to resolve a principal

Every host takes the same thing: an Effect from the incoming request to the principal, which may require services and refuses with one typed error.

```ts
// sketch
interface PrincipalResolver<P, R> {
  (request: Request): Effect.Effect<P, Unauthenticated, R>
}
```

- `Unauthenticated` (a new tagged error in `foldkit-remote-server`, with an optional `reason` the caller may read) is the only 401. Any other failure or defect is a 500 that says nothing, as a handler's breakage already is. This replaces "a throw is a 401 with its message" (§2.2.3).
- `serveFetch`, `defineDocumentHost` and agent-mcp's `authenticate` take it instead of their current shapes; `serveFetch` and `defineDocumentHost` gain the `R` through their `layer`. The `Promise` forms go: the project is pre-1.0 and two ways to resolve a principal is one too many.
- `serveFetch` provides the resolved principal under a Context key when given one, so one handler set serves every request, as `handlers` already allows.

*As built (slice 1):* `serveFetch` and `defineDocumentHost` only. The error is `RemoteUnauthenticated` in `foldkit-remote`, beside `RemoteForbidden`, so the client can decode it (slice 2) and Sync, which already peers `foldkit-remote`, shares it; `RemoteServer.unauthenticated(reason?)` makes one. `serveFetch` answers it as `{ error, unauthenticated: { reason? } }`, the 401 twin of `answer`'s 403, and builds `layer` once per request, provided to the resolver too; `defineDocumentHost`'s resolver needs no service yet, and keeps its `{ error }` body, which a browser `WebSocket` cannot read anyway. Not built: agent-mcp's `authenticate`, whose core is Promise-based and owns its sessions, moves to slice 6 with `Auth.socket`; and the Context-key option, which nothing reads, waits for a consumer.

### 5.2 `R` where reads are decided

`Visible` becomes `(principal: unknown, self) => SQL | undefined | Effect<SQL | undefined, RemoteServerError, R>`, with `R` carried by the binding and the Source it builds; `MemoryReadable`'s producer, `JournalExchangeOptions.opens` and `admit` gain an `R` the exchange's caller provides. Then `GuardDrizzle.visible`, `GuardServer.memory`, `GuardSync.opens`/`admit` and `CmsServer.make` take `Policy<User, R>`.

`GuardSync.authorize` keeps `R = never`: it runs under the journal's lock with `Effect.runSync`, and a body that needs a service there is the wrong place for it (its README already says so).

*As built (slice 3):* not `R` threaded through `Visible`, but `Policy.provide(context)`. A Source takes its binding erased (`AnyEntityBinding`), and one read runs the `visible` of every binding its relations reach, so an `R` per binding would have to be gathered across types already erased: only a cast could say the Source needs it, and nothing would check the cast. What a read rule's body needs splits in two. What changes per request (who is asking, their session's assurance) is the principal, which slice 6's resolver builds with every service it likes. What stays put (a membership lookup, a database) is provided once, at startup: `Policy.provide` gives back a Policy whose bodies need nothing more, which the read seams take, and `GuardServer.validate` counts a seam built from it as built from the Policy it came from (`origin.ts`). The write seams already took `Policy<User, R>`. `Guards.declare` now requires `unguarded` (§10, decision 4).

### 5.3 The client learns it was not authenticated

`Remote.http` (and `httpWithLive`'s stream) maps a 401 to a typed `RemoteUnauthenticated` (`_tag: 'Unauthenticated'`, `reason?`) for every call kind, beside `RemoteForbidden`, so `RemoteData`'s `Failed` and `Data.mutation` carry it. Nothing in `foldkit-remote` acts on it; the application (or `foldkit-auth/client`, §6.4) decides what a lost session means.

*As built (slice 2):* `RemoteUnauthenticated` is in every RPC's declared errors (a stream's inside its success schema), so it crosses Effect RPC and a port as well as JSON. `Remote.http` reads a 401 as it whatever its body says; `answer` sends a handler's as the same 401 body `serveFetch` sends a resolver's (one helper, `refusal.ts`); `serveFetch` ends a live stream that fails with it with an `event: error` frame carrying `unauthenticated`, which `liveFetch` reads back. `Data.satisfy` and `prefetch` may fail with it. A live stream refused is a `ReadFailed` with the tag, and restarts with backoff like any break: stopping that is the application's (`forget`), and `foldkit-auth/client`'s (slice 8). Nothing produces a refusal mid-stream yet; slice 4's revalidation will, and its test lands there.

### 5.4 SSR renders as someone

`SSR.entry` gains `provide?: (request: Request) => Layer.Layer<…>` (or an Effect-returning `context`), built per request and provided to the render's Commands and `Data.satisfy`, so a server render reads as the request's principal and ships the `Me` row and `may` answers with it. Response headers stay the existing `headers` option.

### 5.5 Live streams re-check who they serve

`liveHub` and `journalExchange` gain an optional `revalidate`: an Effect run on an interval (default sixty seconds, chosen per host) that answers the connection's principal again. A stream whose principal no longer resolves, or resolves to another key, ends with `Unauthenticated` (Remote live) or closes with 4401 (Sync). Yielded's lifecycle events cannot name a revoked session (§1), so a re-check is the mechanism its own docs recommend; a revocation is seen within one interval.

*As built (slice 4):* on the two hosts that hold the request, not on `liveHub` and `journalExchange`, which never see one: `serveFetch` and `defineDocumentHost` take `revalidate: { every, same? }` and ask `resolvePrincipal` again, of the request the stream or socket opened with. A refusal ends a live stream with an `Unauthenticated` `event: error` frame (slice 2's client reads it back) or closes a socket with 4401; a principal `same` says changed ends the stream as a live error, or closes the socket with 1012, and the client opens it again as the new principal. There is no default interval: `every` is required where `revalidate` is given, and a host without it serves a stream's first principal until it closes. A host over Effect RPC, or one of its own, builds the same loop around its own transport (slice 6's `Auth.socket` will). Building it found that a loop built over `Effect.andThen(resolve(request))` asks once and re-checks that one answer: the resolver is called on each pass.

---

## 6. `foldkit-auth`

A package with three entry points and `@yielded/auth` as a peer dependency (the application installs and configures Yielded itself; trap list: "An adapter's library is a peer"). It is named for the problem, not the library, because there is one authentication story; it does not abstract over others.

### 6.1 Shared: the principal and `Me`

```ts
// sketch: shared domain code
import { FoldkitAuth } from 'foldkit-auth'

export const Me = FoldkitAuth.me(G, {
  interactions: [OpenAdmin],                    // route-level, answered through guard's `may`
})
```

- `Me` is an Entity with one row (`id: 'me'`): `signedIn`, `subjectId: Option`, the session's public `claims`, `assurance` (method, factors, `authenticatedAt`), and `may` for the named interactions. It is read through Remote like any row, so it is `Loading`, `Ready` or stale exactly as data is, survives SSR, and is dropped by `Remote.forget`.
- Its interactions are guard attachments with principal guards: `Me.may` answers "may open the admin area" from the bodies on the server, so the client still runs no rule (guard-DESIGN §7). This closes TODO.md's "Routing's `Me` Entity".
- The principal Schema stays the guard set's. A `User` that guard rules read (`projectIds`, `role`) is not the session's claims: claims are snapshots taken at sign-in, and a rule over a stale membership is a hole. §6.2 builds the principal per request from the session's `subjectId`.

### 6.2 Server

```ts
// sketch: server
import { FoldkitAuth } from 'foldkit-auth/server'

const Auth = FoldkitAuth.server({
  auth: AppAuth,                 // Auth.make(…)
  http,                          // Http.make(AppAuth, { origin }): its Origin and CSRF policy are reused
  guards: G,
  policy: Policy,
  principal: session =>          // a verified session to the guard set's User, per request
    Users.find(session.subjectId),   // an Effect: R flows to the host's layer
})

Auth.remote(server)              // HttpRouter route Layer: POST /remote and the live stream
Auth.fetch(server, layer)        // the same as a Web handler, for Workers and Vite (HttpRouter.toWebHandler)
Auth.me                          // Me's Source, from the request's session and the Policy
Auth.socket                      // a PrincipalResolver for Sync's upgrade and agent-mcp: cookie or bearer, verifySession
Auth.ssr                         // SSR.entry's `provide`: AuthRequest and G.Principal for the render
```

Per Remote request, in order:

1. `http.withRequest` provides Yielded's `AuthRequest` (cookies read, Set-Cookie collected).
2. A mutation (or a live open, which a cookie authorizes as much) must pass `AuthRequest.beforeMutation`: Yielded's own trusted-Origin and `x-effect-auth-csrf` check, configured once on `Http.make`. A body that is not `application/json` is a 415 before anything is read.
3. `auth.getSession()` is read once. No credential sent: the visitor. A credential sent that does not verify: `Unauthenticated`, a 401 (rule 1).
4. The client's `x-foldkit-subject` header (the `subjectId` its `Me` row holds, or `none`) must name the same subject as the session; otherwise `Unauthenticated` with reason `changed` (rule 2). The header carries no secret: it is what `Me` already showed the client.
5. `principal(session)` builds `Option<User>`, provided as `G.Principal` to one handler set; the live hub's `key` is `Policy.keyOf` and its `revalidate` re-runs steps 3–5 for the stream's credential (§5.5).

For a socket, `Auth.socket` reads the session cookie (same origin) or an `Authorization: Bearer` credential from the upgrade request, checks `Origin` against the same trusted list (a cross-site WebSocket hijack is otherwise possible), and verifies with `auth.verifySession`; the connection keeps the credential to revalidate. Presence's `peerId` is the principal's `G.key`, never a value the peer sends.

Workers: per-request SQL and a per-request `Proofs.ProofRequestContext` (there is no socket peer for Yielded's proof rate limiter) are the application's, as Yielded documents; `Auth.fetch` takes the per-request Layer.

### 6.3 Why reuse Yielded's CSRF check

One policy, configured once: the trusted origins and the header name that protect sign-in protect every write the session authorizes. The header also forces a CORS preflight cross-origin, which no form can send, so the check is not only `Origin` (absent in some legacy requests).

### 6.4 Client

```ts
// sketch: client, in the application's update
import { FoldkitAuth } from 'foldkit-auth/client'

const Session = FoldkitAuth.client(AppClient, { remote: Data })   // AppClient = Client.make(AuthApi, …)

// Commands that run Yielded's client and answer with the application's Messages:
Session.signIn({ email, password }, { onDone: SignInCompleted, onFailed: SignInFailed })
Session.signOut({ onDone: SignedOut })
Session.oauth('github', { returnTarget: '/projects' })            // a navigation, not a Message
```

- Every Command runs a Yielded client action over `FetchHttpClient` with `credentials: 'include'` and Yielded's CSRF header, and answers with the application's Message: the session never lands in the Model except through `Me`.
- A completed sign-in or sign-out is followed by `Remote.forget`, which drops every row and `may` read as the old principal and reads `Me` again. The application's `update` does that on the Message, so it stays the one transition owner (docs/state-model.md).
- `Session.http(url)` is `Remote.http` with the CSRF header and `x-foldkit-subject` taken from the Model's `Me` row, read per request.
- A `RemoteUnauthenticated` from any read is the signal the session ended: `Session.lost` is the Subscription that turns it into one Message, and the application decides (forget, show sign-in). A `BroadcastChannel` Subscription carries a sign-in or sign-out to the other tabs as the same Message, since Yielded crosses none.
- Multi-step methods (email code, passkey, OAuth) are Yielded's calls in order, each a Command: their state between steps (the flow id) is the application's Model, as a form draft is. OAuth leaves the page and returns to `returnTarget`, where `Me` is read as on any load.
- Persistence: a snapshot's `scope` is `Me`'s `subjectId` (`visitor` for none), so one person's cache never paints for another (guard-DESIGN §7a rule 3).

### 6.5 Routing and Site

A route carries no authorization (router-DESIGN §25, guard-DESIGN §8a). What a route may decide is **presentation**: send a visitor to the sign-in page instead of drawing an empty project.

```ts
// sketch
Site.access(Projects, {
  from: MeSurface,
  allow: me => me.signedIn,
  otherwise: SignIn,             // with the requested URL as its return target
})
```

- It reads `Me` through a Surface, so it is pure, testable, and never a security boundary: the rows behind `/projects` are still guarded by the server.
- SSR honours the same rule with a 303 to `otherwise` before rendering, which needs `SSR.entry`'s `provide` (§5.4) to read `Me` for the request.
- While `Me` is loading the route draws its loading state, not the sign-in page, so a slow read never flashes "Sign in" at a signed-in user.

### 6.6 Agents

- agent-mcp's `authenticate` takes `Auth.socket`'s resolver (§5.1): an MCP client inside the application's origin sends the cookie; one outside it sends a bearer credential. `principalId` defaults to `G.key`. One runtime per principal is already the adapter's rule.
- Yielded's `OAuthServer` (an authorization server for MCP clients, with PKCE and protected-resource metadata) is the later path for third-party agents. It is its own slice, and nothing above depends on it.
- `GuardAgent` is unchanged: it reads `may`, which the server answered for the session's principal.

### 6.7 Step-up

Yielded expresses "this action needs a recent second factor" as `requireAssurance(invocation, requirement)`, run by the handler, failing with `AssuranceRequired`. In guard terms that is a principal guard whose body requires `AppAuth` and `AuthRequest` (writes already allow `R`). What is missing is the client's half: a refusal the client can act on. A deny `Guards.reauthenticate(requirement)` would refuse with a typed `AssuranceRequired` the client turns into Yielded's step-up ceremony and a retry. It waits for an application that needs it (§10).

---

## 7. Failure, end to end

| Cause | Server | Client |
| --- | --- | --- |
| No session cookie | answered as the visitor | `Me.signedIn` false; guarded rows absent, as for any visitor |
| A session cookie that no longer verifies (expired, revoked) | 401 `Unauthenticated` | `RemoteUnauthenticated`; `Session.lost` fires; nothing is tombstoned |
| `x-foldkit-subject` names another subject (sign-out or switch in another tab) | 401 `Unauthenticated`, `changed` | the same; `forget` and read `Me` again |
| Session storage unavailable | 500, no detail | `Failed` with a generic error; retry is recovery |
| A mutation without a trusted Origin or the CSRF header | Yielded's check refuses (`HookDenied`), answered 403 | `Failed` with `Forbidden` |
| A live stream's session revoked | the stream ends `Unauthenticated` within one `revalidate` interval | as a lost session |
| A Sync socket's session revoked | closed with 4401 within one interval | the transport stops reconnecting as that principal and reports it |
| Wrong password, expired code | Yielded's typed failure (`PasswordRejected`, …) | the Command's failure Message |

---

## 8. What this deliberately does not do

- **No second authentication abstraction.** `foldkit-auth` is Yielded's adapter. The generic seams (§5) are what another provider would implement against.
- **No session in the Model.** The client holds `Me`, a server fact; credentials stay in HttpOnly cookies.
- **No client-side authorization.** `Me.may` and `Site.access` are hints and presentation; the server checks every read and write.
- **No claims as authorization input by default.** The principal is built per request from `subjectId`; an application may choose claims, and the README says what that costs.
- **No exactly-once.** A sign-in whose response is lost is Yielded's recovery story (keep the `requestId`, start a new flow); `foldkit-auth` adds no retries of credential-issuing calls.

---

## 9. Build order

Each slice stands alone, with its tests and a review before the next.

0. **Effect ≥ 4.0.4.** A scoped `pnpm.overrides` (`effect@4.0.0` → `4.0.4`), the two Foldkit examples' `randomUUIDv4()`, the `mixins-builder` Mount behaviour settled, `pnpm check` green; a request upstream to widen Foldkit's peer. Nothing else starts before this.
1. **One resolver** (§5.1): `Unauthenticated`, the Effect resolver in `serveFetch`, `defineDocumentHost` and agent-mcp, a Context key in `serveFetch`; the 401-with-any-message behaviour goes. *Built* for `serveFetch` and `defineDocumentHost`; agent-mcp moves to slice 6 (§5.1).
2. **The client's 401** (§5.3): `RemoteUnauthenticated` on every call kind. *Built.*
3. **`R` for reads** (§5.2): `Visible`, `MemoryReadable`, Sync's `opens`/`admit`; guard's read seams and `CmsServer.make` take `Policy<User, R>`. *Built* as `Policy.provide` (§5.2), with `unguarded` required.
4. **Revalidation** (§5.5) for the live hub and the journal exchange. *Built* on `serveFetch` and `defineDocumentHost` (§5.5).
5. **SSR's per-request `provide`** (§5.4).
6. **`foldkit-auth/server`**: the principal mapping, the Remote endpoint (route Layer and Web handler), the Origin/CSRF and subject checks, `socket` (with agent-mcp's `authenticate` taking an Effect), `ssr`. Tested against Yielded's in-memory Testing Layer, as the probe was.
7. **`Me`** (§6.1): `FoldkitAuth.me`, its Source, `may` for named interactions. Closes the TODO item.
8. **`foldkit-auth/client`** (§6.4): Commands, `Session.http`, `Session.lost`, the cross-tab channel, persistence scope.
9. **An example end to end:** password sign-in, a guarded list, sign-out in a second tab, SSR, a Sync socket; an e2e test in Chromium (`pnpm e2e`), since only a running page shows cookies, redirects and tabs.
10. **`Site.access`** (§6.5) with SSR's 303.
11. **Later, on demand:** `Guards.reauthenticate` (§6.7); Yielded's `OAuthServer` for third-party MCP clients; passkeys and OAuth in the example.

Docs land with each slice: the package README in the onboarding order, a `SKILL.md` row and a reference file, `CHANGELOG.md`.

---

## 10. Questions, settled

Settled 2026-10-13 by the project's owner ("go with your leanings").

1. **The name and the boundary.** `foldkit-auth`, Yielded's adapter; nothing else would take the name.
2. **Effect and Foldkit.** The repository overrides Foldkit's exact Effect peer until upstream widens it (step 0, §3).
3. **Yielded's maturity.** A single-maintainer beta: `foldkit-auth` pins exact versions, and the generic seams (§5) stay independent of it, so leaving costs one adapter.
4. **`unguarded`'s default** (guard-DESIGN §13 question 5). `Guards.declare` will require `unguarded`: a decision written down rather than a default flipped. It lands with slice 3, which changes guard's read seams anyway.
5. **Which example.** A new, smaller `examples/auth` first (slice 9), then todo-app.

Still open:

6. **`revalidate`'s interval.** Sixty seconds bounds how long a revoked session keeps a live stream; a shorter interval costs one session read per connection per interval. As built there is no default: the host names `every`, and `foldkit-auth/server` (slice 6) picks one for the hosts it builds.
