# Auth and Guard

`foldkit-auth` says **who is asking**. `foldkit-guard` says **what they may do**.
They meet at one value, the principal: auth turns a request into it, guard
decides every read and write on it. Neither does the other's job, and either
works without the other.

```text
request ─> foldkit-auth: cookie ─> session ─> principal ─> foldkit-guard: rules ─> rows, writes, may
           authentication                     (User)       authorization
```

## Which one owns what

| Question | Owner | Where it runs | How it says no |
| --- | --- | --- | --- |
| Is there a session on this request, and may this request use it? | `foldkit-auth` (`AuthServer.resolver`) | server, per request | a 401 (`Unauthenticated`): the request is refused before anything is read |
| Who is that session in the application's terms (`User`, its role)? | the application's `principal` function, given to the resolver | server, per request | a 401, if it refuses the session |
| Which rows, members and relations may this `User` read? | `foldkit-guard` (Read rules) | server: a SQL condition or an evaluator | the rows are absent; nothing says they exist |
| May this `User` make this write? | `foldkit-guard` (Write rules, `GuardServer.writer`, `mutation`) | server, before the write; what it returns is read back through the Read rules | a 403 (`Forbidden`) |
| What may the page *show* as allowed? | the server's `may` answer (`Me`, a row's `may`) | answered on the server, read on the client | a button not drawn; no rule runs on the client |
| Credentials, sign-in, sign-out, the cookie | Yielded Auth itself | its own routes | its own errors (`PasswordRejected`, …) |

Two things follow from the table:

- **A visitor is not a refusal.** No cookie is `Option.none()`, a principal
  like any other, and guard decides what a visitor may read (usually nothing
  guarded). Auth refuses only a credential that was sent and no longer holds,
  or a request that cannot show it came from the application.
- **Auth never authorizes.** A resolver that checks a role and refuses has
  moved a rule out of the guard set, where no read, write, Sync edit or agent
  will find it. Build the principal in `principal`; decide in guards.

## The seam: one principal type

The guard set declares the principal's Schema, and auth's `principal`
function returns a value of it. That shared type is the whole contract
between the two packages (from `examples/auth/src/domain.ts`):

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

This file is shared: the browser imports it too. `isAdmin` is a name here;
its body is given only on the server. `isAuthor` is data, an `Expr`, which
the server compiles to SQL.

On the server, the two packages are wired into one endpoint (from
`examples/auth/src/server.ts`, reduced):

```ts
import { Option } from 'effect'
import { AuthServer } from 'foldkit-auth/server'
import { RemoteServer } from 'foldkit-remote-server'
import { serveFetch } from 'foldkit-remote-server/fetch'

// Guard: the principal guards' bodies, server only.
const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => user.role === 'admin'),
})

// Auth: who a session is, looked up per request, never taken from its claims.
const principal = (session: { readonly subjectId: string }) => Users.find(session.subjectId)

const resolving = { auth: AppAuth, http, principal, key: Policy.key }

export const remote = serveFetch({
  server, // built with GuardServer.memory / GuardDrizzle, checked by GuardServer.validate
  resolvePrincipal: AuthServer.resolver(resolving), // auth: request -> Option<User>
  headers: AuthServer.answered(resolving),
  layer: () => AppAuthLive,
})
```

`serveFetch` asks auth once per request, then answers the request's reads and
writes through the server's Sources, each of which reads that principal
through the guard set's rules. The two never call each other.

## What the client sees

The browser runs no rule and holds no session. What it knows comes from the
server, through Remote, and each package has its own piece:

| On the client | From | Meaning |
| --- | --- | --- |
| `Me` (`Guards.me`) | guard | one row: `signedIn`, `key`, and `may` for named interactions. Read like any row: `Loading`, `Ready`, forgotten by `Remote.forget` |
| `may` on a row | guard | whether this principal may make a write, answered by the server |
| `RemoteData.denied(error)` | Remote | `Unauthenticated` (auth's 401: sign in again) or `Forbidden` (guard's 403: not yours) |
| `believing()` | auth | a `fetch` for Remote's transport that repeats whom the server last answered as, so a read after another tab switched account is refused rather than answered as the other account |
| `Site.access` | site | presentation from `Me`: send a visitor to sign in instead of drawing an empty page. Never a security boundary |

The rule of thumb: **draw from `may`, recover from `denied`.** A button the
server says you may not press is not drawn; a 401 means sign in again
(`Remote.forget` after a change of principal), a 403 means the server
refused this one write.

## Failures, end to end

| What happens | Auth | Guard | The client sees |
| --- | --- | --- | --- |
| No cookie | a visitor (`Option.none()`) | rules decide for a visitor | guarded rows absent; `Me.signedIn` false |
| A cookie from another site, or without the CSRF header | 401 | never asked | `denied`: `Unauthenticated` |
| A session that ended (signed out, expired, revoked) | 401, `Your session ended.` | never asked | `denied`: `Unauthenticated` |
| Another tab switched account | 401, `SUBJECT_CHANGED` (with `believing`) | never asked | forget and read again |
| Signed in, reading a row a Read rule refuses | the user | the row is filtered out | the row is absent, as if it did not exist |
| Signed in, a write a Write rule refuses | the user | 403 before the write runs | `denied`: `Forbidden` |
| A server Source that skips its Read rules | — | `GuardServer.validate` throws at startup | the server does not start |

## Using one without the other

- **Guard without auth.** Any `resolvePrincipal` that returns the guard set's
  principal works: a bearer token, a header in a test, a service binding. The
  guard README's examples provide one directly, as `G.Principal`.
- **Auth without guard.** `AuthServer.resolver` returns whatever your
  `principal` builds; your Sources may read it directly. You lose
  enforcement on every seam from one declaration, and `Me`.

## Keep these consistent

- **One key.** The guard set's `key` (`Policy.key`) names a principal. Give the
  same to the resolver (`key: Policy.key`), so the subject header the client
  repeats (`Me.key`, `AuthServer.answered`) is checked the way it was said.
- **Fresh principals, not claims.** Build the `User` per request from the
  session's `subjectId`. A claim is a snapshot from sign-in, and a rule over a
  stale membership is a hole.
- **Every host, the same resolver.** Remote's `serveFetch`, a Sync document's
  socket (`documentHost` with `requests: 'browser'`, since a browser's
  WebSocket sends no CSRF header), and SSR's posted forms each resolve the
  principal the same way, and guard decides each the same way.
- **Validate at startup.** Call `GuardServer.validate(Policy, …)` where the
  server is built, so a Source that forgot its rules fails loudly.

## See also

- [`foldkit-auth`](../packages/auth/README.md) and
  [`foldkit-guard`](../packages/guard/README.md), each in full.
- [`examples/auth`](../examples/auth): sign-in, `Me`, guarded notes, a page
  `Site.access` sends a visitor away from, and a Sync board, end to end.
