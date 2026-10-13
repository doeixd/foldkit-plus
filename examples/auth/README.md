# Auth example

A Foldkit application where who is signed in decides what the server answers:
a password sign-in through [Yielded Auth](https://github.com/yielded-dev/auth),
a list of notes the guards narrow to the reader, and a sign-out in one tab that
the other tabs follow without a reload.

## Who owns what

| Fact | Owner | Here |
| --- | --- | --- |
| Accounts, passwords, sessions, the cookie | Yielded Auth | `server.ts`: `Auth.make`, its routes under `/auth` |
| Which principal a request is answered as | `foldkit-auth/server` | `AuthServer.resolver` in `serveFetch`, per request |
| Who that principal is (`User`: `id`, `role`) | the application | `principalOf`, looked up from the session's subject |
| Who may read a note, who may open the admin area | `foldkit-guard` | `G`, `Note`'s Read rule, `Me`'s `OpenAdmin` |
| Who the page believes it is | the server, through Remote | the `Me` row, read like any other |
| The sign-in form's draft, a line saying what failed | the application's Model | `email`, `password`, `notice` |

The browser holds no session: the cookie is HttpOnly, and everything the page
shows about who is signed in is the `Me` row the server answered. The page
runs no rule either: "Admin" is drawn from `Me`'s `may`, which the server
decided, and the notes it lists are the ones the server returned.

## The model

```text
sign in or out ─> Yielded's route sets or clears the cookie
               ─> update: Data.forget, and a broadcast to the other tabs
               ─> every active read asks again ─> serveFetch
                    ─> AuthServer.resolver: cookie ─> session ─> User, or a visitor
                    ─> guards: Me as that User, the notes that User may read
```

Everything Remote holds was read as someone, so any change of principal
forgets all of it. `update` does that in one place for both causes: this
tab's own sign-in or sign-out, and another tab's broadcast.

## Run it

```bash
pnpm install
pnpm --filter foldkit-example-auth dev
```

Open <http://127.0.0.1:5176> and sign in as `ada@example.invalid` /
`ada password` (an admin) or `grace@example.invalid` / `grace password` (a
member). Open a second tab, sign out there, and the first drops to a visitor.

The sessions and notes are in memory, so a restart signs everyone out. A tab
that then reads again sends a cookie the server no longer knows, and is told
"Your session ended. Sign in again." rather than shown as a visitor.

## How the pieces connect

Read the files in this order.

1. [`src/domain.ts`](src/domain.ts), shared by browser and server. The
   principal `User`; the guard set `G` with `isAdmin` (a principal guard, whose
   body only the server has) and `isAuthor` (a row guard over a note's
   `authorId`); `Note` with `Read: [G.isAuthor, G.isAdmin]`; `Me` with
   `OpenAdmin` answered in its `may`; the `Notes` query; Yielded's contract
   `AuthApi` (password sign-in, plus the `signOut` every contract has).
2. [`src/server.ts`](src/server.ts). `Policy` gives `isAdmin` its body. The
   notes are served from memory through `GuardServer.memory`, `Me` through
   `GuardServer.me`, and `GuardServer.validate` refuses to start a server whose
   Sources skip a Read rule. `openServer(origin)` builds Yielded's routes and
   Remote's `serveFetch` over one store, so the sign-in route and the resolver
   see the same sessions.
3. [`src/http.ts`](src/http.ts). One Node server: `/auth/…` to Yielded,
   everything else to `serveFetch` (which answers `/remote`). Vite proxies both
   ([`vite.config.ts`](vite.config.ts)), so the page, its cookie and its
   requests share one origin.
4. [`src/app.ts`](src/app.ts). The Model, the Messages and `update`. `SignIn`
   and `SignOut` are Commands that run Yielded's client (`yield* AppClient`)
   and answer with the application's Messages. `Session` reads `Me` and
   `NoteList` the query, both always active. The `principal` Subscription
   turns another tab's post on `PRINCIPAL_CHANNEL` into a Message.
5. [`src/view.ts`](src/view.ts) and [`src/client.ts`](src/client.ts). The page,
   and the runtime with its two services: `Remote.httpWithLive('/remote')`,
   sending Yielded's CSRF header through `belief.fetch`, and
   `AppClient.layerFetch`.

What some calls do, and do not:

- `AuthServer.resolver` reads the cookie only from a request that shows it
  came from the page: a trusted `Origin` and `x-effect-auth-csrf: 1`. It
  verifies the session and never renews it, and writes nothing. `principalOf`
  builds the principal from the session's subject on every request, not from
  claims taken at sign-in (the contract's claims are empty on purpose).
- Each answer from `/remote` says whom it was for (`AuthServer.answered`),
  and `belief.fetch` repeats it on the next read. A read after the cookie
  changed hands is refused with `SUBJECT_CHANGED`, which `update` answers
  with `Data.forget`, rather than answered as the new account. The sign-in
  and sign-out Commands call `belief.forget()` first, so this tab's own
  change is not refused once.
- `Data.forget` performs no I/O: it drops what Remote holds and every active
  read starts again, `Me` included.
- `postBroadcast` is a one-shot Command; by spec a tab never hears its own
  post, so only the other tabs forget.
- `http = { origin }` is the page's origin: Yielded trusts a sign-in from it
  alone, and the resolver takes its cookie name, trusted origins and CSRF
  header from the same object.

## When something fails

| What happens | What the page shows |
| --- | --- |
| A wrong password | the sign-in form, with "That email and password do not match." |
| Signed out in another tab | the broadcast: this tab forgets and reads `Me` again, as a visitor |
| A read that left before that broadcast arrived | refused (`SUBJECT_CHANGED`), never answered as the other account; this tab forgets and reads again |
| A cookie the server no longer knows (a restart, an expired session) | the read fails as `Unauthenticated` (`RemoteData.refused`): "Your session ended. Sign in again." and the form |
| A browser without `BroadcastChannel` | the other tabs are not told until they read again; this tab says so |

## The cookie on plain http

The server keeps Yielded's default cookie, `__Host-effect-auth-session`,
which is `Secure`, though `pnpm dev` serves plain http. Chromium counts
`127.0.0.1` as a secure origin and keeps it; the e2e test signs in that way.
A browser that refuses a `Secure` cookie over http needs
`{ origin, cookie: { secure: false } }` in `openServer`, which Yielded accepts
only for an `http:` origin.

## Tests

- `test/server.test.ts`: the server over real HTTP, through Yielded's own
  sign-in and sign-out routes: `Me` and the notes as a visitor, ada and grace,
  and a signed-out cookie refused.
- `test/app.test.ts`: `update` on a change of principal, from a Model read as
  ada through the server's handlers.
- `test/auth.mutations.ts`: `pnpm mutate examples/auth/test/auth.mutations.ts`
  breaks each claim above in turn.
- `e2e/auth.e2e.ts` (`pnpm e2e examples/auth`): two tabs of one Chromium,
  sign-in, sign-out reaching the other tab, a member's notes, and the refusal
  after a restart.

## Limits

- `@yielded/auth-persistence/Testing` is Yielded's test store: in memory,
  seeded, lost on restart. A deployment uses its SQL persistence.
- Remote's reads never renew the session: it ends an hour after its last
  renewal, however busy the page is. Yielded's `renewSession` is not wired.
- Not yet here: a server render (SSR) signed in as the request's principal,
  and a Sync socket opened with the session (`requests: 'browser'`). Both are
  the next steps of auth-DESIGN §9, item 9.
