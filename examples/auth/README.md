# Auth example

A Foldkit application where who is signed in decides what the server answers:
a password sign-in through [Yielded Auth](https://github.com/yielded-dev/auth),
a list of notes the guards narrow to the reader, a notes page a visitor is sent
away from, server-rendered as the request's reader, and a sign-out in one tab
that the other tabs follow without a reload.

## Who owns what

| Fact | Owner | Here |
| --- | --- | --- |
| Accounts, passwords, sessions, the cookie | Yielded Auth | `server.ts`: `Auth.make`, its routes under `/auth` |
| Which principal a request is answered as | `foldkit-auth/server` | `AuthServer.resolver` in `serveFetch`, per request |
| Who that principal is (`User`: `id`, `role`) | the application | `principalOf`, looked up from the session's subject |
| Who may read a note, who may open the admin area | `foldkit-guard` | `G`, `Note`'s Read rule, `Me`'s `OpenAdmin` |
| Who the page believes it is | the server, through Remote | the `Me` row, read like any other |
| Which page a reader may be shown | `foldkit-site` | `NotesNode`'s `access`, asked by `accessOf` in `update` and in the host |
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

A page request is read the same way before it is drawn:

```text
GET /notes ─> page.ts: Data.satisfy through the reader the host attached
                (PageContext): in process from host.ts, as the cookie's reader,
                or, under Vite's dev server, over HTTP to the auth server
           ─> accessOf(model): Site.accessOf(AppSite, route, Me)
                Denied({ url })  ─> 303 to /?returnTo=%2Fnotes, nothing rendered
                Allowed, Pending ─> SSR renders the page from what was read
browser    ─> SSR.hydrate starts from that Model; update asks accessOf after
              every Message, and a Denied replaces the address (sign-out on /notes)
```

`access` is presentation, not authorization: a visitor sent to `/notes` by
some other route still gets no notes, because the server's Read rule answers
for them. `accessOf` is one function both sides ask, so the browser and the
host cannot disagree on who may be shown a page.

## Run it

```bash
pnpm install
pnpm --filter foldkit-example-auth dev
```

Open <http://127.0.0.1:5176/notes>: as a visitor you land on the home page,
and a sign-in goes on to the notes. Sign in as `ada@example.invalid` /
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
3. [`src/host.ts`](src/host.ts) and [`src/http.ts`](src/http.ts). The host
   is the site behind one fetch handler, as one Worker serves it: `/auth/…`
   to Yielded, `/remote` to `serveFetch`, and every other request a page,
   handed its reader through `PageContext`: `pageReader`, made from the same
   config as `/remote`, which reads in this process as the request's cookie
   says (`requests: 'navigation'`, since a page carries no CSRF header) and
   never writes. `http.ts` serves the host on Node, with an upgrade to
   `/sync` going to the board's `documentHost`. In development Vite draws the
   pages and proxies the rest there ([`vite.config.ts`](vite.config.ts)), so
   the page, its cookie and its requests share one origin.
4. [`src/app.ts`](src/app.ts). The Model, the Messages and `update`. `SignIn`
   and `SignOut` are Commands that run Yielded's client (`yield* AppClient`)
   and answer with the application's Messages. `AppSite` holds two pages,
   `Home` (with an optional `returnTo`) and `Notes`, whose `access` sends a
   reader `Me` says is not signed in home; `accessOf` asks it, and `update`
   replaces the address on `Denied`. `Session` reads `Me` on every page and
   `NoteList` the query on the notes page. The `principal` Subscription
   turns another tab's post on `PRINCIPAL_CHANNEL` into a Message.
5. [`src/page.ts`](src/page.ts) and [`src/entry.server.ts`](src/entry.server.ts).
   The page: each page request is read through the reader the host
   attached, answered `303` when `accessOf` refuses it, and otherwise
   rendered by `SSR.entry` from that Model, so the decision and the page
   come from one read. A cookie the server no longer holds reads nothing,
   and the browser reads again and says why; a request with no reader is a
   500. Vite renders in a process of its own, so `entry.server.ts` attaches
   `httpReader`, Remote over HTTP with the cookie, the page's origin and
   the CSRF header.
6. [`src/view.ts`](src/view.ts) and [`src/client.ts`](src/client.ts). The page,
   and `SSR.hydrate` with its two services: `Remote.http('/remote')`,
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
- `postBroadcast` is a one-shot Command that opens a channel of its own, so
  every channel of that name hears it, this tab's `principal` Subscription
  included. The post carries the tab's id (`TAB`), and a tab ignores its own:
  it already forgot when it changed.
- The password is sent as a `Redacted` Command argument, since a Command's
  args become its span's attributes and DevTools' record. The form's draft
  still holds it in the Model until the sign-in succeeds, so DevTools' Model
  history shows it.
- `http = { origin }` is the page's origin: Yielded trusts a sign-in from it
  alone, and the resolver takes its cookie name, trusted origins and CSRF
  header from the same object.

## The board's socket

`PinBoard` (`domain.ts`) is a Sync document every signed-in reader shares: a
replica pins lines offline, and the server orders them. Its socket is opened
with the session cookie, as Remote's reads are, through the same resolver:

```text
upgrade /sync ─> documentHost: AuthServer.resolver({ requests: 'browser' })
                   cookie from a foreign Origin, or ended ─> 401, no socket opens
                   no cookie ─> a visitor, whom `opens` refuses every exchange
                   a session ─> the socket opens, exchanging as that User
open socket   ─> every SYNC_REVALIDATE the resolver asks again:
                   the session ended (a sign-out in any tab) ─> closed with 4401
```

- A browser's `WebSocket` sends no header of the page's, so no CSRF header
  can vouch for the cookie: its `Origin`, which every browser sends on an
  upgrade and no page can forge, does (`requests: 'browser'`).
- `documentHost` (`foldkit-sync/journal`) answers the upgrade request
  before a socket opens; `http.ts` writes a refusal on the raw connection,
  or hands an accepted one to `ws` and serves it.
- Yielded's renewal rotates the credential, so a socket opened before a
  renewal is closed with 4401 at the next revalidation though the session
  lives; a replica reconnects with the new cookie.

No page draws the board yet: `test/sync.test.ts` drives it with replicas
over real sockets.

## When something fails

| What happens | What the page shows |
| --- | --- |
| A visitor asks for `/notes` | the host's `303` to `/?returnTo=%2Fnotes`; a sign-in goes on to the notes |
| Signed out while on `/notes` | `update` replaces the address with the home page's |
| A wrong password | the sign-in form, with "That email and password do not match." |
| A sign-in or sign-out that fails otherwise (the network, the server) | "Could not sign in. Try again." (or sign out); after a failed sign-out the page asks `Me` again, as the server may have signed out |
| Signed out in another tab | the broadcast: this tab lets go of its belief (`ForgetBelief`), then forgets and reads `Me` again, as a visitor |
| A read that left before that broadcast arrived | refused (`SUBJECT_CHANGED`), never answered as the other account; this tab forgets and reads again |
| A cookie the server no longer knows (a restart, an expired session) | the read fails as `Unauthenticated` (`RemoteData.denied`): "Your session ended. Sign in again." and the form |
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
  ada through the server's handlers, and the page `access` sends a reader
  from.
- `test/sync.test.ts`: the board's socket over real `ws` sockets: a
  visitor's exchange refused, a foreign Origin and an ended session `401`
  before any socket opens, one reader's pin ordered for another, and an
  open socket closed with 4401 once its session ends.
- `test/page.test.ts`: pages read over HTTP from the real server, as the
  dev server reads them: a visitor's `303`, a reader's notes rendered into
  the page, a session that ended left to the browser.
- `test/host.test.ts`: the one fetch handler with no network at all: a
  reader's notes read in process, from a link on another site; a visitor's
  `303`; `/remote` still refusing a script's cookie without the CSRF header;
  a page with no reader a 500.
- `test/auth.mutations.ts`: `pnpm mutate examples/auth/test/auth.mutations.ts`
  breaks what `update` and the server decide in turn; what only a page shows
  is the e2e test's.
- `e2e/auth.e2e.ts` (`pnpm e2e examples/auth`): two tabs of one Chromium,
  sign-in, sign-out reaching the other tab, a member's notes, the refusal
  after a restart, the host's `303` and a sign-in returning to the notes, a
  reader's notes in the page before any script runs, and a sign-out on
  `/notes` replacing the address.

## Limits

- `@yielded/auth-persistence/Testing` is Yielded's test store: in memory,
  seeded, lost on restart. A deployment uses its SQL persistence.
- Remote's reads never renew the session: it ends an hour after its last
  renewal, however busy the page is. Yielded's `renewSession` is not wired.
- `host.ts` is the production shape, but nothing builds and serves it: a
  build's `fetch.js` needs Foldkit's `renderDocument` pipeline, which this
  example does not use, so its test serves pages with `handleRequest` and
  `index.html`.
- No page draws the board: its socket and host are tested with replicas, and
  mounting Sync beside Remote and the Site's routing in this page is not
  shown here (`examples/registry` mounts both).
