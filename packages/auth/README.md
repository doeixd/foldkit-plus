# foldkit-auth

Who is signed in, for a Foldkit Plus server: a [Yielded Auth](https://github.com/yielded-dev/auth)
session read from the request and handed to Remote's `serveFetch` and Sync's
document host as their principal.

## What it is

Yielded Auth signs people in and keeps their sessions. `serveFetch`, Remote's
Web handler, and `defineDocumentHost`, Sync's Durable Object, each ask "who
is this request?" through a `resolvePrincipal` Effect, as SSR's posted forms
do through their `resources`. `AuthServer.resolver` is
that Effect for an application on Yielded: it reads the session cookie
Yielded set, verifies it with the application's own `Auth` service, and
gives back the application's principal, a visitor, or a refusal the client
decodes.


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
header (`x-effect-auth-csrf: 1`), or, for what a browser sends on the page's
behalf, the `Origin` alone (below). From any other request it is refused, never
quietly ignored: a page elsewhere borrows no one's session, and a client of
the application's own that forgot the header learns so on its first call.

### Why the Origin, and not SameSite or a token

The check is made at the HTTP boundary, from what the browser sends and no
page can set, so there is no token to issue, store or rotate:

- **`Origin`**, compared with `http.origin` and `http.trustedOrigins`
  exactly. Where a browser sends none (a same-origin `GET`) or an opaque one
  (`Origin: null`, below), the Fetch Metadata header **`Sec-Fetch-Site`**
  must say `same-origin`. A request with neither is refused: a browser too
  old to send them, or a client that is not a browser and had better not be
  holding someone's cookie.
- **The CSRF header** is a constant, not a secret. A page on a trusted
  origin that can run a script can send it; markup alone, such as an HTML
  form injected into that page, cannot. `requests: 'browser'` drops it where
  the browser itself makes the request.
- **`SameSite`** is not relied on. Yielded sets `SameSite=Lax` explicitly
  (Chrome's default for a cookie that names none sends it on a cross-site
  `POST` for two minutes after it is set), but a site is not an origin:
  every subdomain of the registrable domain is same-site, so a sibling such
  as `user-content.app.example` would pass. Origins are compared instead, and a
  sibling is trusted only when `trustedOrigins` names it.

Remote posts every call, and Yielded's mutations are posts. Keep a `GET`
of any endpoint of your own that the resolver answers from changing
anything: the resolver refuses a cookie on a link followed from elsewhere (a
cross-site `GET`), and a safe `GET` makes a gap in that check cost nothing.

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

A refusal reaches the Model as a failure; `RemoteData.denied(error)` from
`foldkit-remote` reads it as `Unauthenticated` with the `reason` below.

## Who the client believes it is

The cookie is the browser's, shared by every tab: a sign-in in one tab
changes who another tab's next read is answered as. A broadcast between
tabs tells the others, but a read already on its way would land the new
account's answers in a cache that shows the old one. So the server says
whom it answered as, and the client repeats it:

```ts
import { believing } from 'foldkit-auth'

const resolving = { auth: AppAuth, http, principal, key: Policy.key }
serveFetch({
  server,
  resolvePrincipal: AuthServer.resolver(resolving),
  headers: AuthServer.answered(resolving), // `x-foldkit-subject` on each answer
  layer: () => AppAuthLive,
})

// The browser: Remote's transport through a fetch that repeats it.
export const belief = believing()
Remote.httpWithLive('/remote', {
  headers: () => ({ 'x-effect-auth-csrf': '1' }),
  fetch: belief.fetch,
})
```

- `AuthServer.answered` takes the resolver's own config, and needs its
  `key`, so the header names the principal as the check reads it:
  `subjectSaid(Option.some(key(user)))`, or `visitor`. The key is
  URI-encoded, as a header carries Latin-1 only.
- `believing()` holds what the last answer said, beside the cookie it
  describes, never in the Model. Once the cookie means someone else, the
  next request is refused with `SUBJECT_CHANGED` instead of answered.
- Any 401 makes it believe no one, so the reads asked after it learn who is
  signed in now. The application's `update` answers a read refused with
  `SUBJECT_CHANGED` with `Remote.forget`, which asks them; a refusal for any
  other reason (`Your session ended.`) is shown, since asking again would
  be refused again.
- Believing no one is a gap: after a 401 or `forget()`, the next request is
  answered as whoever the cookie names. An application that keeps what
  Remote holds through a 401 (a session that ended, its old rows still
  shown) should forget them before another tab could sign in, or the next
  read merges the new account's answers into them. An answer to a request
  sent before the last 401 or `forget()` is never believed.
- A sign-in or sign-out this tab makes calls `belief.forget()` in its
  Command, before `update` forgets what Remote holds, so the reads after
  it are not refused once first.

[`examples/auth`](../../examples/auth) wires all of it.

## Sync's socket

A browser's `WebSocket` sends no header of the page's, so an upgrade cannot
carry the CSRF header. `requests: 'browser'` says so: the resolver reads the
cookie of an upgrade whose `Origin`, which every browser sends on one, is
trusted, and asks for no header; the rest is unchanged. `defineDocumentHost`
takes the `Auth` service from its `layer`, kept while the socket is open, so
`revalidate` can ask the session store again and close a socket whose
session ended (4401):

```ts
import { DurableObject } from 'cloudflare:workers'
import { defineDocumentHost } from 'foldkit-sync/do'

export class SyncHost extends defineDocumentHost(DurableObject, {
  sync, // Sync.make(…)
  openJournal, // the document's journal, as foldkit-sync's README opens it
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

A form `foldkit-ssr` handles without scripts is a browser request too.
`SSR.entry`'s `origins` answers a post from anywhere else `403` before its
body is read; its `resources` give the post's Commands who posted, from a
resolver built once with `requests: 'browser'`:

```ts
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

That Layer cannot fail, so a post whose session ended is a `500` for now,
not a way back to sign-in. Resolve the session in the host before calling
`renderPage`, as `Site.access`'s 303 does, to answer it with a redirect.

## Refusals

| Request | Answer |
| --- | --- |
| No session cookie | a visitor |
| A cookie, from a request without a trusted `Origin` or, lacking one, `Sec-Fetch-Site: same-origin` (and, for `'scripted'`, the CSRF header) | 401, `The request did not show it came from this application.` |
| A cookie that no longer verifies (signed out, expired, idle, revoked) | 401, `Your session ended.` |
| Two session cookies | 401, `Sign in again.` |
| `x-foldkit-subject` naming someone other than the session | 401, `Who is signed in changed.` (`SUBJECT_CHANGED`) |
| A session store that fails | a defect (500), never a visitor |

A page served with `Referrer-Policy: no-referrer` sends `Origin: null` on its
own posts, and a same-origin `GET` sends no `Origin`; either counts as the
application's when its `Sec-Fetch-Site`, which no page can set, says
`same-origin`. Browsers send Fetch Metadata only to secure origins (`https:`
and `localhost`), so over plain `http:` elsewhere such a request is refused.

**A long-lived connection re-checks the cookie it opened with.** `revalidate`
asks again of the request a live stream or socket opened with, and Yielded's
renewal rotates the session's credential, so after the page renews, that
stream or socket ends refused (`Your session ended.`, a 4401) though the
session lives. The client opens it again with the new cookie; the first
refusal of a fresh request is the one that means signed out.

**Remote's calls do not keep a session alive.** The resolver verifies with
`verifySession`, which renews nothing. A stateful session with an
`idleTimeout` ends that long after its last renewal however busy Remote is,
and every call then answers `Your session ended.` Renew through Yielded's
session renew operation (`renewSession`) while the reader is active, or
choose an idle timeout that fits.

The `x-foldkit-subject` header (`SUBJECT_HEADER`, from `foldkit-auth`, which
imports nothing of Yielded's and so suits a browser bundle) carries no
secret: `visitor` or `subject:<key>`, what `Me` already shows the client. A
client that sends none is answered as whoever the session says. Without
`key` the resolver compares it with the session's `subjectId`, for a client
that writes the header itself; `AuthServer.answered` needs `key`.

## Limits

- MCP agents send a bearer credential, which no resolver here reads yet. A
  Sync replica reconnects after a 4401, refused at each upgrade, since a
  browser's `WebSocket` does not say why an upgrade failed.
- Cookie sessions only; a bearer credential is not read.
- A session cookie with a `domain` trusts every subdomain, as Yielded
  documents: one that sets its own cookie of the same name makes every
  request `Sign in again.` until it is cleared.
