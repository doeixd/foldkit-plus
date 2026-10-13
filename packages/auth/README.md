# foldkit-auth

Who is signed in, for a Foldkit Plus server: a [Yielded Auth](https://github.com/yielded-dev/auth)
session read from the request and handed to every host as its principal.
[`auth-DESIGN.md`](../../docs/design/auth-DESIGN.md) explains the design and
why.

## What it is

Yielded Auth signs people in and keeps their sessions; Foldkit Plus hosts
(`serveFetch`, Sync's document host) ask "who is this request?" through a
`resolvePrincipal` Effect. This package is the one answer to that question
for an application on Yielded: it reads the session cookie Yielded set,
verifies it with the application's own `Auth` service, and gives back the
application's principal, or a visitor, or a refusal the client can act on.

## What it owns, and what it does not

| Fact | Owner |
| --- | --- |
| Credentials, sign-in, sessions, the cookie | Yielded Auth (`Auth.make`, `Http.make`) |
| Which session a request carries, and whether it is trusted | `AuthServer.resolver` |
| Who the session is in the application's terms (a guard set's `User`) | the application's `principal` function, per request |
| Who may do what | `foldkit-guard`, given the principal |

It does not sign anyone in, set or clear a cookie, or serve Yielded's routes:
the application mounts `Http.layer(AppAuth, http)` itself. It does not
authorize either: the principal it returns is what `foldkit-guard` decides on.

## Mental model

```text
request ─> session cookie ─> trusted? ─> verifySession ─> principal(session) ─> host answers as User
              none                no            │                 refused
               │                  │             └ ended: 401      │
               └──── visitor ─────┘                               └ 401
```

A request is one of three things: a visitor (`Option.none()`), someone
(`Option.some(user)`), or refused (`RemoteUnauthenticated`, a 401 the client
decodes). A cookie is only read from a request that shows it came from the
application, by the same rule Yielded applies to its own mutations: an
`Origin` it trusts and its CSRF header (`x-effect-auth-csrf: 1`). Any other
request is answered as a visitor, so a page elsewhere borrows no one's
session.

## Install

```sh
pnpm add effect @yielded/auth foldkit-remote foldkit-remote-server foldkit-auth
```

`@yielded/auth` is a peer, pinned exactly while Yielded is in beta.

## Sixty seconds

```ts
import { AuthServer } from 'foldkit-auth/server'
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
```

- `AuthServer.resolver(config)` is a pure declaration: it returns the
  function `serveFetch` calls per request. The call reads only headers.
- `auth` is the `Auth.make(…)` value; the resolver yields it as a service, so
  the host's `layer` must provide it. That is the one store, shared with the
  routes that set the cookie.
- `http` is the same object given `Http.make`: the cookie's name, the trusted
  origins and the CSRF header are read from it, so the two cannot disagree.
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

## Refusals

| Request | Answer |
| --- | --- |
| No session cookie | a visitor |
| A cookie, from a request without a trusted `Origin` and the CSRF header | a visitor |
| A cookie that no longer verifies (signed out, expired, revoked) | 401, `Your session ended.` |
| Two session cookies | 401, `Sign in again.` |
| `x-foldkit-subject` naming someone other than the session | 401, `Who is signed in changed.` |
| A session store that fails | a defect (500), never a visitor |

The `x-foldkit-subject` header (`SUBJECT_HEADER`, from `foldkit-auth`, which
imports nothing of Yielded's and so suits a browser bundle) is what the client
believes it is: `subjectSaid(Option.none())` (`visitor`) or `subjectSaid(Option.some(id))`
(`subject:<id>`). A server that would answer as anyone else refuses, so a
sign-out or a switch of account in another tab, or an expiry, never fills the
client's cache with someone else's answers. The header carries no secret. A
client that sends none is answered as whoever the session says.

## Limits

- `foldkit-auth` holds only the subject header so far. A WebSocket resolver for
  Sync's document host, the `Me` Entity, and the client's Commands are planned
  (auth-DESIGN §9).
- Cookie sessions only; a bearer credential is not read.
