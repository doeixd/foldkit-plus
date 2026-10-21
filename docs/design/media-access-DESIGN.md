# Media access: who may upload, whose facts are stored, who may read

**Status:** Proposed, 2026-10-21. Nothing here is built.
**Target:** a new subpath, `foldkit-guard/media`, and small changes in `foldkit-media/server`.
**Related:** [media-DESIGN.md](./media-DESIGN.md) §9.5 (facts at upload), [guard-DESIGN.md](./guard-DESIGN.md) §5 (one subpath per seam), [auth-DESIGN.md](./auth-DESIGN.md) (the resolver).

Snippets are the design as proposed. Names may change when built; the package READMEs will hold the ones that compile.

---

## 0. The decision in one page

`foldkit-media` has one authorization point, `UploadPolicy`, asked before an upload or a facts
lookup reads a byte, with no default. `foldkit-auth` turns a request into `Option<User>`, and
`foldkit-guard` decides what that user may do. Nothing connects them: an application writes its
`UploadPolicy` by hand, and media-DESIGN §9.5's sentence, "who may upload is a `foldkit-guard`
policy on that mutation and the route", is true of the mutation and not of the route.

Three things change, in this order:

1. **`foldkit-guard/media`: an `UploadPolicy` built from a guard set.** `GuardMedia.uploadPolicy`
   resolves the principal from the request's headers with whatever resolver the application
   already gives Remote (`AuthServer.resolver` is one), and decides principal guards for each
   route. Media gains a typed route on `admit` and a 401 of its own.
2. **Facts the server read, kept beside the bytes.** The upload route already describes every
   original; it keeps those facts under the hash too, and `StoredFacts.get(hash)` reads them
   back on the server. A registration mutation then takes a hash from the client, never facts,
   and guard governs it as any other write.
3. **Private variants: not now.** The variant route stays readable by whoever holds a URL. §5
   records the two designs that would change that and what each costs, so the choice is made
   when an application needs it.

| Route | Decides today | Decides after |
| --- | --- | --- |
| `POST /_media/upload` | a hand-written `UploadPolicy` | `GuardMedia.uploadPolicy`: principal guards for `Upload` |
| `GET /_media/facts?url=` | the same `UploadPolicy` | the same, for `DescribeUrl`, which may differ |
| registering an upload (a Remote mutation) | guard, over facts the client sent | guard, over a hash; the facts are the server's |
| `GET /_image/…` | nobody: whoever holds the URL | unchanged (§5) |

---

## 1. Who owns what

| Package | Owns | Does not own |
| --- | --- | --- |
| `foldkit-auth` | which session a request carries, and whether the request may use it (cookie, trusted `Origin`, CSRF header) | who the session is in the application's terms (its `principal` function), what they may do |
| `foldkit-guard` | who may do what, declared once; principal guards decided on the server | who is asking (handed in) |
| `foldkit-media` | image facts, variant URLs, the routes that serve and accept images | who may call them (`UploadPolicy`, the application's) |

The seam stays where it is. Media asks one question, `UploadPolicy.admit`, and knows no session
and no guard. Guard answers it through a subpath, as it answers Remote (`/server`), Drizzle
(`/drizzle`), Sync (`/sync`) and agents (`/agent`). Auth is not a dependency of either: its
resolver is a function `(request: Request) => Effect<Option<User>, RemoteUnauthenticated, R>`
(the error's tag is `'Unauthenticated'`),
which is all `GuardMedia` takes.

---

## 2. What must hold

These are the invariants the design is checked against, each with the test that would show it
broken.

- **The policy runs before a byte is read.** The upload route promises it, and
  `upload.test.ts` asserts it with a body that records being pulled. So the resolver is given a
  `Request` built from the headers alone, never `HttpServerRequest.toWeb`, which in a Worker
  hands back the original request, body and all. A session lives in a cookie or a header; nothing the policy needs is in the body.
- **A visitor uploads nothing unless a guard says so.** A principal of `Option.none()` passes no
  principal guard that reads the principal, as everywhere in guard (`Guards.declare`'s
  `unguarded: 'deny'` covers a route given no guards at all).
- **A cookie alone cannot upload from another site.** Media already ensures it: an `image/*`
  body needs a preflight the route never answers. Auth's resolver adds its own check (a trusted
  `Origin`, or `Sec-Fetch-Site: same-origin`, and the CSRF header unless `requests: 'browser'`).
  Both stay; neither relies on the other.
- **A refusal says its kind and nothing more.** Media's rule (README, "A refusal answers its kind
  and nothing more") stands: a guard's `explain` sentence is not sent. A refused upload is a
  `403`, an unauthenticated one a `401`, neither kept by a browser.
- **Stored facts are the server's.** A client can change a width or name another original's
  hash, and decoding with `HashedAsset` checks only shape. After §4, no route or mutation stores
  facts a client supplied.
- **Variants stay public by URL** until §5 is chosen, and the README says so.

---

## 3. `foldkit-guard/media`

### 3.1 The call

```ts
// server.ts
import { GuardMedia } from 'foldkit-guard/media'
import { AuthServer } from 'foldkit-auth/server'

const resolve = AuthServer.resolver({ auth: AppAuth, http, principal }) // what Remote is given

export default {
  fetch: serveFetch<Env>({
    images: { provider: media, layer: env => imageLayers(env) },
    uploads: {
      layer: env =>
        Layer.mergeAll(
          uploadsR2(env.MEDIA),
          inspectorImages(env.IMAGES),
          GuardMedia.uploadPolicy(Policy, {
            resolve,
            Upload: [G.isEditor],
            DescribeUrl: [G.isEditor, G.isAdmin],
          }),
        ).pipe(Layer.provide(AppAuthLive)),
    },
    otherwise: app,
  }),
}
```

- `Policy` is the implemented guard set (`G.implement(bodies)`), given what its bodies need with
  `Policy.provide(context)` once, as the other read seams require.
- `Upload` and `DescribeUrl` each list principal guards, a disjunction, as an `attach` list is.
  A route omitted is refused for everyone: the set's `unguarded: 'deny'` default, applied here
  too, so a new route media adds is closed until named.
- Only principal guards are accepted. No row exists yet, so a row guard has nothing to read; a
  row guard in either list is a type error (guard's `PrincipalGuard` versus `RowGuard` tags) and
  refused at definition.
- The resolver's requirements (`AppAuth` above) are the layer's, provided where the layer is
  built.

### 3.2 What media changes

`UploadPolicy.admit(request)` serves two routes, and a policy can only tell them apart by
reading the URL. It gains the route:

```ts
export type UploadRoute = 'Upload' | 'DescribeUrl'

readonly admit: (
  request: HttpServerRequest.HttpServerRequest,
  route: UploadRoute,
) => Effect.Effect<void, UploadForbidden | UploadUnauthenticated>
```

- `UploadUnauthenticated` is new: a `401`, `no-store`, its kind only, for a request whose
  session the resolver refused (an untrusted origin, an ended session). `UploadForbidden` stays
  the `403` for a principal the guards refuse. Without it, an expired session reads as "not
  allowed", and a client cannot tell to sign in again.
- `uploadPolicyBearer` ignores the route, as before.
- Breaking for a hand-written policy (a second parameter it may ignore) and for an exhaustive
  match on the route's refusals. Media is 0.x.

### 3.3 Inside

```ts
const uploadPolicy = <User, R>(policy: Policy<User>, config: Config<User, R>) =>
  Layer.effect(UploadPolicy, Effect.gen(function* () {
    const context = yield* Effect.context<R>()
    return {
      admit: (request, route) =>
        Effect.gen(function* () {
          const principal = yield* config.resolve(headersOnly(request)).pipe(
            Effect.catchTag('Unauthenticated', () => new UploadUnauthenticated({})),
          )
          const guards = config[route] ?? []
          const allowed = yield* anyAllowed(policy, guards, { principal, interaction: route })
          if (!allowed) return yield* new UploadForbidden({})
        }).pipe(Effect.provide(context)),
    }
  }))
```

- `headersOnly(request)` is `new Request(url, { method, headers })`, the URL from
  `HttpServerRequest.toURL`: what the resolver reads, no body.
- `anyAllowed` decides each guard with `policy.decide(guard, { principal, interaction })`, the
  route's name as the interaction, in order, and stops at the first that allows. A `Decision` of `{ allowed: false, reason }` counts as refused; the
  reason stays on the server (logged at debug), per §2.
- A resolver defect (the session store down) is a defect, a `500`, as auth's own table says.

### 3.4 Composing with a deployment secret

A script that uploads with a token and an editor who uploads with a session are both real. The
first answer is two policies tried in turn, the first to admit winning:

```ts
uploadPolicyAny(uploadPolicyBearer(env.UPLOAD_TOKEN), GuardMedia.uploadPolicy(Policy, …))
```

It lives in media, next to `UploadPolicy`: it knows nothing of guard. A `401` from the
first does not stop the second; the last refusal is the answer.

*As built: named `uploadPolicyAny`, beside `uploadPolicyBearer`, rather than `UploadPolicy.either`
(the package names its policies so, and `either` reads as Effect's `Either`); it takes two
policies or more.*

---

## 4. Facts the server read

### 4.1 The problem

The upload route answers the facts as a `HashedAsset`, and today the client carries them into
the application's data: the CMS-style flow is "upload, then a Remote mutation registers the
answer as an `Asset` row". Once the facts pass through a client they are its word. A client can
send a smaller width, a wrong `alpha` (and so a placeholder over transparent pixels), or another
original's hash. Guard decides whether the user may create an `Asset` row; it cannot tell that
the row's facts are true.

### 4.2 Keep the facts beside the bytes

The upload route already has them: it describes every original before keeping it. It keeps both:

- `Uploads.put(hash, bytes, facts)`: the stores write the facts, encoded, under
  `facts/<hash>` beside the bytes (`uploadsKeyValueStore`, `uploadsR2`).
- A new service, `StoredFacts`, with `get(hash): Effect<Option<HashedAsset>>`, over the same
  store (`storedFactsKeyValueStore`, `storedFactsR2`).
- An original uploaded before this change has no stored facts; `StoredFacts.get` answers none,
  and the application describes it again (`describe` over `Originals`) or refuses.

The registration mutation then takes a hash and what only an editor knows:

```ts
const RegisterAsset = Remote.mutation('RegisterAsset', {
  input: Schema.Struct({ hash: ContentHash, focus: Schema.OptionFromNullOr(Focus) }),
  success: AssetRow,
})

GuardServer.mutation(
  RegisterAsset,
  // No `id`: a create, decided against `Create` for who is asking.
  { entity: Asset, policy: Policy, interaction: 'Create', source: source(Db.Asset) },
  ({ input }) =>
    Effect.gen(function* () {
      const facts = yield* StoredFacts.get(input.hash).pipe(
        Effect.flatMap(Option.match({ onNone: () => notUploaded, onSome: Effect.succeed })),
      )
      return yield* insertAsset({ ...facts, focus: input.focus })
    }),
)
```

- Guard governs the write as any other: the `Asset` Entity's `Create` rules, presets such as
  `ownerId: user => user.id`.
- A hash the client names that nobody uploaded is refused: the facts are not there.
- Naming another user's upload by its hash registers the same bytes under a new row. That gives
  nothing away: the bytes are readable by their URL already (§5), and the same upload would
  give the same hash. An application that must tie an upload to its uploader records the
  principal in its row (a preset), not in the facts.

### 4.3 Not chosen: register inside the upload

The route could write the row itself (`uploadLayer({ register })`), so the facts never leave
the server. It would make media call the application's write path with a principal it does not
model, and two requests (upload, register) is the shape every client already handles. Keeping
the facts beside the bytes gives the same guarantee with media owning only storage.

---

## 5. Private variants: two designs, neither now

The variant route checks no permission. A content hash cannot be guessed, but every page that
shows the image hands it out. For most images that is the point: the URL is cached for a year
by every layer, and that is what makes them cheap. An application with images that must stay
private has two ways forward, and both give up that caching.

| | Signed URLs | A guarded route |
| --- | --- | --- |
| The check | an HMAC over the path and an expiry, made when the page is drawn | the reader's session, and guard's Read rule on the `Asset` row whose hash it is |
| Caching | a URL per expiry window: the edge keeps each briefly, browsers privately | `Cache-Control: private`; nothing shared |
| Revoking | waits for the expiry | at once |
| Cost per request | a hash comparison | a session lookup and a row read |
| Who must change | `Provider.hosted` writes signatures (a secret on the server that draws pages) | a second route with its own policy; `Provider` gains a private variant |

The guarded route fits this repository better, since the rule already exists: an `Asset` row
has a Read rule, and "may read this variant" is "may Read the row with this hash". Signed URLs
fit a static or CDN-heavy site whose pages are drawn by a trusted server. Either would be a
separate route and space, so public images keep their caching. Decide when an application asks.

---

## 6. Failure and denial

| Request | Answer |
| --- | --- |
| No session, guards that need one | `403` `{ "error": "Forbidden" }` |
| A cookie from an untrusted origin, an ended session, two session cookies | `401` `{ "error": "Unauthenticated" }` (the resolver's refusal; its sentence stays on the server) |
| A principal the guards refuse, an `explain` among them | `403` `{ "error": "Forbidden" }` |
| A route given no guards | `403` for everyone |
| The resolver's store fails, a guard body's service fails | defect, `500` |
| A registration naming a hash with no stored facts | the mutation's own refusal (`NotUploaded`), through Remote |

Every refusal is `no-store` and kept by no browser, as media's refusals are now.

---

## 7. What changes, package by package

- **`foldkit-media/server`:** `UploadPolicy.admit` takes the route; `UploadUnauthenticated`
  (`401`, `Answer.cases.Unauthenticated`); `uploadPolicyAny`; `Uploads.put` keeps facts;
  `StoredFacts` and its stores. README: §3's call under Uploads, §4's flow replacing "the
  application registers the facts".
- **`foldkit-guard`:** the `/media` subpath, with `foldkit-media` an optional peer, as
  `foldkit-sync` is for `/sync`. `GuardServer.validate` gains nothing: media has no Entity of
  its own.
- **`foldkit-auth`:** nothing. Its resolver already has the shape.
- **`examples/cloudflare`:** keeps `uploadPolicyBearer` (it has no sessions). `examples/auth` or
  the CMS gains the guarded upload once one draws an upload control.
- **The skill:** `references/media.md` and `references/guard.md` each name the seam.

---

## 8. Build order

Each slice lands with its README, skill and changelog lines, and its mutations declared.

1. **The route on `admit`, and the 401.** Media only. Tests: each route passes its name; a
   policy refusing `DescribeUrl` alone still admits an upload; a `401` is `no-store` and its
   kind only. Mutations: the route swapped; the 401 mapped to 403.
2. **`uploadPolicyAny`.** Tests: the second admits after the first refuses; both refusing
   answers the last refusal; the first admitting never asks the second.
3. **`foldkit-guard/media`.** Tests, with a resolver fake that rejects a `Request` with a body,
   so reading it fails the test: a visitor refused; an editor admitted for `Upload` and refused
   for `DescribeUrl` when only an admin may; an unnamed route refused; a resolver refusal a
   `401`; a resolver defect a `500`; the body never pulled (the existing assertion, now through
   guard). Type tests: a row guard rejected; a misspelled route rejected. Mutations: the
   disjunction made a conjunction; the visitor admitted; the body passed through.
4. **Stored facts.** Tests: an upload's facts read back equal its answer; a hash never
   uploaded is none; an original kept before the change is none. The CMS-style mutation in a
   test fixture: facts from the store, not the input; a forged width in the input is not
   stored (the input has no width).
5. **Docs: the README's Uploads section rewritten around §3 and §4**, and media-DESIGN §9.5's
   sentence made true.

§5 is not in the order.

---

## 9. Open questions

- **Rate limits on uploads.** The upload route has no admission control; README tells the
  application to limit in its policy. Guard decides who, not how often. Should media's
  `Admission` (now asked only on variant misses) be asked on uploads too, keyed by principal
  rather than address?
- **Quotas.** "An editor may upload 1 GB" needs a count the guard body reads (a service), and a
  write after the upload to move it. That is the application's, but §4's stored facts give it a
  size to add up. Worth an example, not an API.
- **Deleting an original.** Neither media nor this design deletes: `Originals` is
  authoritative and the server never writes it. A delete needs a route, a guard (`Delete` on
  the row, and no other row naming the hash), and an answer for the variants already cached for
  a year. Its own design.
- **The `401`'s body.** Media sends `{ "error": "Unauthenticated" }`; auth's own `401` carries a
  sentence for the reader ("Your session ended."). Should media pass that sentence on, since it
  is meant for the reader and leaks nothing?
