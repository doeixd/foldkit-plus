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

- Remote's calls verify a session and never renew it: a session with an
  `idleTimeout` ends that long after its last renewal. Renew through Yielded
  (`renewSession`) while the reader is active.
- An application needs Foldkit's exact `effect: 4.0.0` peer allowed
  (`pnpm.peerDependencyRules.allowedVersions: { "foldkit>effect": "4.0.4" }`),
  since Yielded needs 4.0.3 or later.

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
- Only cookie sessions so far; `Me` is `foldkit-guard`'s (`Guards.me`), and
  the client's sign-in and sign-out are the application's Commands over
  Yielded's client (`examples/auth`).

## See also

- [foldkit-auth README](https://github.com/doeixd/foldkit-plus/blob/main/packages/auth/README.md)
- [examples/auth](https://github.com/doeixd/foldkit-plus/tree/main/examples/auth): sign-in, `Me`, the cross-tab broadcast and the subject echo, end to end.
- [guard.md](guard.md): deciding what the principal may do.
