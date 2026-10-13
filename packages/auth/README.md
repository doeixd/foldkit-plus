# foldkit-auth

Who is signed in, for a Foldkit Plus server: a [Yielded Auth](https://github.com/yielded-dev/auth)
session read from the request and handed to Remote's `serveFetch` and Sync's
document host as their principal.
[`auth-DESIGN.md`](../../docs/design/auth-DESIGN.md) explains the design and
why.

## What it is

Yielded Auth signs people in and keeps their sessions. `serveFetch`, Remote's
Web handler, and `defineDocumentHost`, Sync's Durable Object, each ask "who
is this request?" through a `resolvePrincipal` Effect. `AuthServer.resolver`
(for Remote) and `AuthServer.socket` (for Sync's upgrade) are that Effect for
an application on Yielded: they read the session cookie Yielded set, verify
it with the application's own `Auth` service, and give back the
application's principal, a visitor, or a refusal the client decodes.

SSR's posted forms and agents do not use it yet (auth-DESIGN §9).

## What it owns, and what it does not

| Fact | Owner |
| --- | --- |
| Credentials, sign-in, sessions, the cookie, renewing a session | Yielded Auth (`Auth.make`, `Http.make`) |
| Which session a request carries, and whether the request may use it | `AuthServer.resolver` |
| Who the session is in the application's terms (a guard set's `User`) | the application's `principal` function, per request |
| Who may do what | `foldkit-guard`, given the principal |

It does not sign anyone in, set, renew or clear a cookie, or serve Yielded's
routes: the application mounts `Http.layer(AppAuth, http)` itself. It does
not authorize either: the principal it returns is what `foldkit-guard`
decides on.

## Mental model

```text
request ─> session cookie ─> from the application? ─> verifySession ─> principal(session) ─> answered as User
              none                   no                    │                  refused
               │                     │                     └ ended: 401       └ 401
            visitor                 401
```

A request is one of three things: a visitor (`Option.none()`), someone
(`Option.some(user)`), or refused (`RemoteUnauthenticated`, a 401 the client
decodes). A cookie rides along with any request to the site, so one is used
only from a request that shows it came from the application, by the rule
Yielded applies to its own mutations: an `Origin` it trusts and its CSRF
header (`x-effect-auth-csrf: 1`). From any other request it is refused, never
quietly ignored: a page elsewhere borrows no one's session, and a client of
the application's own that forgot the header learns so on its first call.

## Install

```sh
pnpm add effect @yielded/auth foldkit-remote foldkit-remote-server foldkit-auth
```

`@yielded/auth` is a peer, pinned exactly while Yielded is in beta. Yielded
needs `effect` 4.0.3 or later, while `foldkit` declares exactly `4.0.0`, so
until Foldkit widens its peer an application allows it in its `package.json`:

```json
{
  "pnpm": {
    "peerDependencyRules": { "allowedVersions": { "foldkit>effect": "4.0.4" } },
    "overrides": { "foldkit>@effect/platform-browser": "4.0.4" }
  }
}
```

## Sixty seconds

```ts
import { Effect } from 'effect'
import { AuthServer } from 'foldkit-auth/server'
import { serveFetch } from 'foldkit-remote-server/fetch'

const http = { origin: 'https://app.example' } as const // the options given Http.make(AppAuth, http)

export const remote = serveFetch({
  server, // RemoteServer.make(…)
  resolvePrincipal: AuthServer.resolver({
    auth: AppAuth, // Auth.make(…)
    http,
    principal: session => Effect.succeed({ id: session.subjectId }),
  }),
  layer: () => AppAuthLive, // AppAuth.layer, with its persistence
})
```

- `AuthServer.resolver(config)` is a declaration: it returns the function
  `serveFetch` calls per request, and throws at once if `http` names an
  origin that is not one (`null`, a trailing slash). Each call reads headers
  and asks the session store; it writes nothing.
- `auth` is the `Auth.make(…)` value; the resolver yields it as a service, so
  the host's `layer` must provide it. That is the one store, shared with the
  routes that set the cookie.
- `http` is the same object given `Http.make`: the cookie's name, the trusted
  origins and the CSRF header are read from it, so the two agree.
- `principal` builds the application's principal from the verified session,
  per request. Read memberships fresh here, from `session.subjectId`; a
  session's claims are a snapshot taken at sign-in. It may refuse, with
  `RemoteServer.unauthenticated(reason)`.

## The client's side

Remote's transport posts every call, so a browser sends `Origin` on its own;
the CSRF header is the client's to add:

```ts
import { Remote } from 'foldkit-remote'

const transport = Remote.httpWithLive('/remote', {
  headers: () => ({ 'x-effect-auth-csrf': '1' }),
})
```

A refusal reaches the Model as a failure whose error has `_tag:
'Unauthenticated'` and the `reason` below.

## Sync's socket

A browser's `WebSocket` sends no header of the page's, so an upgrade cannot
carry the CSRF header. `AuthServer.socket` takes the same config and reads
the cookie of an upgrade whose `Origin`, which every browser sends on one,
is trusted; the rest is `resolver`'s. `defineDocumentHost` takes the `Auth`
service from its `layer`, kept while the socket is open, so `revalidate`
can ask the session store again and close a socket whose session ended
(4401):

```ts
export class SyncHost extends defineDocumentHost(DurableObject, {
  sync, // Sync.make(…)
  openJournal,
  resolvePrincipal: AuthServer.socket({
    auth: AppAuth,
    http,
    principal: session => Effect.succeed({ id: session.subjectId }),
  }),
  layer: () => AppAuthLive,
  revalidate: { every: '1 minute' },
}) {}
```

## Refusals

| Request | Answer |
| --- | --- |
| No session cookie | a visitor |
| A cookie, from a request without a trusted `Origin` and the CSRF header | 401, `The request did not show it came from this application.` |
| A cookie that no longer verifies (signed out, expired, idle, revoked) | 401, `Your session ended.` |
| Two session cookies | 401, `Sign in again.` |
| `x-foldkit-subject` naming someone other than the session | 401, `Who is signed in changed.` |
| A session store that fails | a defect (500), never a visitor |

**Remote's calls do not keep a session alive.** The resolver verifies with
`verifySession`, which renews nothing. A stateful session with an
`idleTimeout` ends that long after its last renewal however busy Remote is,
and every call then answers `Your session ended.` Renew through Yielded's
session renew operation (`renewSession`) while the reader is active, or
choose an idle timeout that fits.

The `x-foldkit-subject` header (`SUBJECT_HEADER`, from `foldkit-auth`, which
imports nothing of Yielded's and so suits a browser bundle) is what the
client believes it is: `subjectSaid(Option.none())` (`visitor`) or
`subjectSaid(Option.some(id))` (`subject:<id>`). A server that would answer
as anyone else refuses, so a sign-out or a switch of account in another tab,
or an expiry, never fills the client's cache with someone else's answers. The
header carries no secret. A client that sends none is answered as whoever the
session says. Nothing yet tells a client its own subject id: the `Me` Entity
that will is planned (auth-DESIGN §6.1), and until then an application sends
the header only if it learned the id itself.

## Limits

- SSR's posted forms and agents are planned (auth-DESIGN §9). A Sync replica
  reconnects after a 4401 today, refused at each upgrade, until the client
  learns to stop (slice 8).
- Cookie sessions only; a bearer credential is not read.
- A session cookie with a `domain` trusts every subdomain, as Yielded
  documents: one that sets its own cookie of the same name makes every
  request `Sign in again.` until it is cleared.
