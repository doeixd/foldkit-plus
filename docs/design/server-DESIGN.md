Yes. I’d add server routes to the revised design, but as a **parallel topology graph**, not as part of `Site` and not as another data/runtime system.

Affe’s strong idea is that server entry points are first-class, composable values. Foldkit Plus should steal that. The part I would *not* steal is making those values reimplement everything Effect HttpApi, RemoteServer, and SSR already know how to do.

### `foldkit-server`

I’d introduce something like:

```ts
import { Server, ServerRoute } from "foldkit-server"
```

with this responsibility:

> **Describe how independently-owned server capabilities are mounted, nested, layered, inspected, and dispatched.**

So the complete architecture becomes:

```text
CLIENT / APPLICATION                    SERVER

URL                                     Request
 │                                         │
 ▼                                         ▼
Foldkit Router                         Server graph
 │                                         │
 ▼                          ┌──────────────┼──────────────┐
AppRoute                    ▼              ▼              ▼
 │                         SSR           Remote          HttpApi
 ▼                      documents         RPC          endpoints
Site                       │               │              │
 │                         │               ▼              ▼
 ▼                         │         RemoteServer     application
SurfaceSources             │
 │                         │
 ▼                         │
Remote ────────────────────┘
```

The two graphs are related, but different:

```text
Site
= deployed browser/document topology

Server
= deployed request topology
```

## What a server graph might look like

I would want something close to:

```ts
const Api = Server.group("/api", [
  Server.mount("/remote", Remote.rpc(RemoteApp)),

  Server.mount("/webhooks", Webhooks),

  Server.mount("/health", HealthApi),
])

const Web = Server.document(
  AppSite,
  SSR.entry(config, plan, {
    buildId,
    template,
  }),
)

export const AppServer = Server.make([
  Api,
  Web,
])
```

Then:

```ts
AppServer.handle(request)
```

is ultimately just a Web `Request → Response` Effect.

It does **not start a server**. Same philosophy as RemoteServer.

---

## The important thing: adapters, not reinvention

I'd make the server graph accept different server capabilities through a small common protocol.

Conceptually:

```ts
interface ServerMount<R = never> {
  readonly id: string

  readonly handle:
    (request: Request) =>
      Effect<Response | NotMatched, Error, R>

  readonly manifest: ServerManifest
}
```

Then different packages provide adapters.

```ts
Server.document(...)
```

adapts `foldkit-ssr`.

```ts
Remote.server(...)
```

adapts Remote RPC / RemoteServer.

```ts
Server.httpApi(...)
```

adapts Effect HttpApi.

Potentially:

```ts
Server.handler(...)
```

is the low-level escape hatch for an arbitrary Web handler.

This means Foldkit Plus doesn't invent yet another representation of:

```text
path params
query schema
headers
request body
response body
status errors
```

because Effect HttpApi already owns that problem.

---

# This is where I’d differ from Affe `ServerRoute`

Affe lets you write something approximately like:

```ts
ServerRoute.action({ key: "save-user" }).pipe(
  ServerRoute.method("POST"),
  ServerRoute.path("/api/users/:id"),
  ServerRoute.params(UserParams),
  ServerRoute.body(UpdateUser),
  ServerRoute.response(User),
  ServerRoute.handle(saveUser),
)
```

That's pleasant.

But in Foldkit Plus, I'd rather write the schema-rich generic HTTP endpoint using **Effect HttpApi**, then mount it:

```ts
const SaveUser = /* Effect HttpApi endpoint */

const UsersApi =
  Server.httpApi(UserApi)
```

Because otherwise Foldkit Plus has created:

```text
Effect HttpApi
       +
Foldkit ServerRoute HTTP schema DSL
```

with two abstractions representing exactly the same fact.

That violates the project's existing instinct:

> use Effect for infrastructure; add Plus semantics where Effect doesn't already supply them.

---

# What `foldkit-server` adds that HttpApi does not

This is the useful layer:

```text
stable server node identity
nesting / mounting
prefix inheritance
whole-application topology
cross-package composition
Effect Layer requirements
middleware inheritance
collision validation
manifest / inspection
links between Site and document handlers
DevTools visualization
test dispatch
```

For example:

```ts
const Internal = Server.group("/internal", [
  Metrics,
  AdminApi,
]).pipe(
  Server.middleware(requireEmployee),
)

const Api = Server.group("/api", [
  PublicApi,
  RemoteApi,
  Internal,
])
```

compiles to:

```text
/api
├── public
├── remote
└── internal
    ├── metrics
    └── admin
```

The server topology is now inspectable in the same way the Site topology is.

---

# Stable identity again matters

I'd use the same Affe lesson:

```ts
export const RemoteEndpoint =
  Server.mount("/remote", Remote.rpc(...))

export const ServerApp =
  Server.make([
    Server.group("/api", [
      RemoteEndpoint,
    ]),
  ])
```

`RemoteEndpoint` remains the same node.

Its structural position is supplied by the mount tree.

Then you can ask:

```ts
Server.parentOf(AppServer, RemoteEndpoint)
Server.pathOf(AppServer, RemoteEndpoint)
Server.ancestorsOf(AppServer, RemoteEndpoint)

Server.inspect(AppServer)
```

Exactly like the proposed `Site`.

---

# `Server.mount` should compose prefixes

This is one place Affe's current flat `ServerRoute` story could actually be improved.

You should be able to write:

```ts
const Users = Server.group("/users", [
  UserList,
  UserDetail,

  Server.group("/:userId", [
    UserAvatar,
    UserSessions,
  ]),
])
```

producing:

```text
/users
/users/:userId
/users/:userId/avatar
/users/:userId/sessions
```

Even if the leaves happen to be Effect HttpApi endpoints.

The server graph owns topology.

The leaves own request semantics.

---

# Middleware and Layers should compose structurally

This could be particularly nice with Effect.

```ts
const Admin = Server.group("/admin", [
  Reports,
  Users,
]).pipe(
  Server.layer(DatabaseLive),
  Server.middleware(requireAdmin),
)
```

Now descendants inherit:

```text
/admin
  requires Database
  requires admin principal
```

but the actual Effects still declare their requirements normally.

I would be careful not to make `Server.layer` silently build long-lived Layers per request. It should compile into explicit Effect Layer provisioning semantics, with application-scoped vs request-scoped lifetime remaining clear.

---

# Authentication should stay outside RemoteServer

This boundary is already correct.

```text
HTTP/auth middleware
      ↓
Principal
      ↓
RemoteServer.handlers(Server, principal)
      ↓
semantic authorization
```

A server graph can help wire this:

```ts
Server.mount(
  "/remote",
  Remote.server(RemoteApp, {
    principal: request => Auth.principal(request),
  }),
)
```

but `foldkit-server` should not define what a principal means.

And RemoteServer must still independently enforce:

```text
field authorization
entity visibility
query visibility
mutation authorization
```

A `/admin` server middleware isn't a replacement for data authorization.

---

# SSR becomes a first-class server node

This cleans up one awkward part of the current system.

Today:

```ts
const { renderPage } =
  SSR.entry(...)

handleRequest(request, {
  renderPage,
  template,
})
```

works, but the application server topology is implicit.

With `foldkit-server`:

```ts
const Documents = Server.document(
  AppSite,
  SSR.entry(config, plan, {
    buildId,
    template,
  }),
)
```

Now the server graph explicitly knows:

```text
GET /*
HEAD /*
POST /*     ← SSR Message fallback when enabled
```

belong to document rendering.

That node can sit **last** as the fallback after more specific server endpoints:

```ts
const AppServer = Server.make([
  Server.group("/api", [
    RemoteApi,
    PublicApi,
  ]),

  Server.group("/webhooks", [
    Stripe,
    GitHub,
  ]),

  Documents,
])
```

This gives you:

```text
/api/*       → API
/webhooks/*  → webhook handlers
everything else → Site/SSR
```

cleanly.

---

# SSR no-JS Messages do not need a separate "action route"

This is important.

Affe has explicit server actions.

Foldkit already has something rather elegant:

```text
form
 ↓
encoded Foldkit Message
 ↓
POST current document URL
 ↓
SSR.handle
 ↓
update
 ↓
Commands
 ↓
Messages
 ↓
update
 ↓
render
```

So don't introduce:

```ts
Server.action(Message.SaveUser)
```

for this use case.

The application **Message already is the action protocol**.

That's one place Foldkit is stronger.

---

# Remote mutations also don't need server-action routes

Likewise:

```ts
Data.mutate(
  model,
  RenameProject,
  input,
)
```

already names a schema-validated semantic mutation.

The server side has:

```ts
RemoteServer.mutation(
  RenameProject,
  handler,
)
```

So mounting Remote into the server graph should expose the whole semantic protocol:

```text
Remote Client
     ↓
Remote RPC endpoint
     ↓
RemoteServer
     ├── reads
     ├── queries
     ├── mutations
     └── live
```

Don't create:

```text
POST /api/rename-project
```

as a second representation unless you actually need a public REST endpoint.

---

# Single-flight fits here nicely too

The eventual Affe-style improvement I described would remain a **Remote protocol feature**:

```text
mutation
+
currently required revalidation
=
one Remote RPC
```

The server graph merely mounts that protocol:

```ts
Server.mount(
  "/_foldkit/remote",
  Remote.server(RemoteApp),
)
```

No Site coupling.

No special server action coupling.

The chain becomes:

```text
Site / Composition
       ↓
SurfaceInstances
       ↓
Remote requirements
       ↓
Data.mutate(... refresh active requirements ...)
       ↓
ONE REQUEST
       ↓
Server graph
       ↓
RemoteServer
       ↓
mutation + refresh
       ↓
normalized result
```

That's the cleanest Affe single-flight analogue.

---

# Ordinary server APIs still matter

There will always be endpoints that are neither Remote nor page Messages.

Examples:

```text
Stripe webhooks
OAuth callbacks
file uploads
signed download URLs
external REST API
health checks
robots / feeds
third-party callbacks
```

Those are where Effect HttpApi or a raw handler belongs.

Then the server graph simply composes them:

```ts
const AppServer = Server.make([
  Server.mount("/api", Server.httpApi(Api)),

  Server.mount(
    "/_remote",
    Remote.server(RemoteApp),
  ),

  Server.mount(
    "/oauth/callback",
    OAuthCallback,
  ),

  Server.mount(
    "/webhooks/stripe",
    StripeWebhook,
  ),

  Server.document(
    AppSite,
    SiteSsr,
  ),
])
```

Now Foldkit Plus has a coherent **full-stack topology** without pretending every request is the same kind of thing.

---

# Site and Server should be cross-referenceable, not merged

I'd want:

```text
Site graph

/
├── projects
│   └── :projectId
└── :cmsSlug
```

and:

```text
Server graph

/
├── api
│   ├── remote
│   └── upload
├── webhooks
│   └── stripe
└── documents
```

DevTools can present both:

```text
APPLICATION

Browser / Document topology
├── Home
├── Projects
│   └── Project
└── CmsPage

Server topology
├── Remote RPC
├── Upload API
├── Stripe webhook
└── SSR documents
```

The document node can point at:

```text
SSR Documents
    serves
       ↓
    AppSite
```

but `Site` doesn't become a server router and `Server` doesn't become a client router.

---

# There may be a useful server equivalent of `Wiring`

This actually fits Foldkit Plus very well.

On the client/application side you have `Wiring` as:

> how does this integration join the application?

On the server you could eventually have:

```ts
Remote.server(...)
Cms.server(...)
SSR.server(...)
```

return server contributions.

Then:

```ts
const ServerApp = Server.assemble(
  Cms.server(...),
  Remote.server(...),
  SSR.server(...),
  Uploads.server(...),
)
```

Each contributes:

```text
routes/mounts
Layer requirements
middleware requirements
manifest metadata
```

That could be more synergistic with Plus than making users manually build a route tree.

I would probably prototype explicit `Server.make` first and see whether repeated assembly patterns justify `Server.assemble`.

---

# Revised full architecture

So I would now expand the design to three principal graphs:

```text
                    DEPLOYED TOPOLOGY

            ┌────────────┼─────────────┐
            │            │             │
            ▼            ▼             ▼
          Site      Surface graph     Server
       URL/pages     capabilities    requests
            │            │             │
            │            │      ┌──────┼─────────┐
            │            │      ▼      ▼         ▼
            │            │     SSR   Remote    HttpApi
            │            │             │
            └────────────┼─────────────┘
                         ▼
                       Model
                         │
                         ▼
                       update
```

With Composition dynamically extending the Surface graph:

```text
Site
 ↓
CmsPage Surface
 ↓
Composition.Document
 ↓
Surface.each
 ↓
dynamic SurfaceInstances
```

and Server being the execution boundary:

```text
Server
 ├── document → SSR → Site/Surface graph
 ├── remote   → RemoteServer
 └── api      → Effect HttpApi
```

That, to me, is the proper version of **“best of Affe on top of Foldkit.”**

Affe was right that both client routes and server routes deserve first-class composable topology. Foldkit Plus can adopt that idea while making the more Foldkit-native distinction that **topology does not imply ownership**: Site doesn't own data, and Server doesn't own endpoint semantics.


Yes. Streaming should be part of the revised architecture, but I’d split it into **three distinct capabilities** rather than a generic `streaming: true` flag:

```text
1. SSR / HTML streaming
2. Remote data streaming
3. arbitrary server-response streaming
```

They share cancellation/backpressure/topology, but their semantics are very different.

The current repo already reflects this distinction: Remote has live streams and cursor/replay semantics, while the current SSR design explicitly says rendering remains synchronous and data is prepared before rendering. [`ssr-PLAN.md`](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/ssr-PLAN.md) Remote's design also correctly notes that streaming transport is **not** reliability; cursor/replay semantics are separate. [`REVISION_PLAN.md`](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/REVISION_PLAN.md)

## 1. `foldkit-server` should be streaming-transparent

I would **not** introduce:

```ts
Server.stream(...)
```

as the fundamental primitive.

A server node should fundamentally produce a Web `Response`:

```ts
interface ServerNode<R = never> {
  handle(
    request: Request
  ): Effect.Effect<Response | NotMatched, ServerError, R>
}
```

If:

```ts
response.body
```

is a `ReadableStream`, the Server graph simply preserves it.

So these all compose normally:

```ts
Server.make([
  Server.mount("/remote", Remote.server(DataServer)),
  Server.mount("/events", Server.httpApi(EventsApi)),
  Server.document(Site, SSR.stream(...)),
])
```

The server graph owns:

```text
where the stream lives
middleware
authentication
Layers
inspection
```

but **not what the frames mean**.

That belongs to SSR, Remote, HttpApi, etc.

---

# 2. The server runtime has to understand stream lifetime

There is one important infrastructure requirement here.

This is wrong:

```text
request
 ↓
build Layer scope
 ↓
handler returns Response
 ↓
close scope
 ↓
Response.body continues streaming   ← oops
```

The Effect scope servicing a streamed response has to remain alive until:

```text
stream completes
stream fails
client disconnects
request is aborted
```

So:

```text
Request AbortSignal
       │
       ▼
Effect fiber / Stream
       │
       ▼
ReadableStream
       │
       ├── backpressure
       │
       ├── cancel → interrupt fiber
       │
       └── close → release scope
```

That should be a foundational `foldkit-server` invariant.

It also means middleware should not accidentally materialize the body:

```ts
await response.text() // BAD generic middleware
```

unless buffering is explicitly the middleware's purpose.

---

# 3. Remote streaming already has the right conceptual foundation

Remote currently has:

```text
requirements
+
after cursor
    ↓
live stream
    ↓
patches with cursors
```

and records gaps when a stream breaks.

That's exactly the right model.

The useful extension is to allow **initial reads** to stream too.

Today conceptually:

```text
requirement set
     ↓
server resolves everything
     ↓
ReadResult
     ↓
client reduce
```

could optionally become:

```text
requirement set
     ↓
server
     ├── EntityPatch
     ├── QueryPatch
     ├── EntityPatch
     ├── QuerySettled
     └── Complete
          ↓
     client reduces each
```

Something conceptually like:

```ts
type ReadFrame =
  | EntityPatch
  | ConnectionPatch
  | Settled
  | Failed
  | Complete
```

The key is: **the frames remain normalized Remote facts**.

Not:

```text
"loader 3 finished"
```

That keeps streaming independent of routing.

---

# 4. `SurfaceSource` makes streaming much more powerful

Suppose the page has:

```text
Project Surface
Activity Surface
Comments Surface
Recommendations Surface
```

Their requirements can be sent together:

```text
SurfaceInstances
       ↓
Remote planning
       ↓
ONE request
       ↓
server
 ┌─────┼────────────┐
 ▼     ▼            ▼
Project Comments   Recommendations
 20ms    80ms          600ms
 │       │              │
 ▼       ▼              ▼
patch   patch           patch
```

Instead of waiting 600 ms for one combined result, Remote can reduce each patch as it arrives.

That gives Foldkit naturally:

```text
Message
 ↓
update
 ↓
Model
 ↓
view
```

for every arriving piece.

No special React Suspense-like runtime required.

---

# 5. Single-flight gets better with streaming

This is particularly attractive for the Affe-inspired mutation idea.

Instead of:

```text
mutation
 ↓
wait for mutation
 ↓
rerun all affected reads
 ↓
wait
 ↓
one giant response
```

you could have:

```text
ONE REQUEST

RenameProject
     │
     ▼
mutation committed
     │
     ├── MutationApplied
     │
     ├── Project patch
     │
     ├── ProjectsQuery patch
     │
     ├── SearchQuery patch
     │
     └── Complete
```

The client can regard the mutation as settled as soon as:

```text
MutationApplied
```

arrives.

Expensive secondary revalidation can continue streaming afterward.

That's arguably nicer than Affe single-flight because:

> mutation completion and cache refresh completion do not have to be artificially identical moments.

---

# 6. SSR streaming is trickier

This is where I would be conservative.

The current Foldkit Plus SSR invariant is very strong:

> the browser's first Model renders the same page the server sent.

And resumability adds another strong invariant:

> all preboot bindings are validated against declared Surface Messages before they're allowed to dispatch.

Naive streaming can break both.

For example:

```text
send shell
 ↓
browser boots
 ↓
later server sends interactive ProductGrid HTML
```

Now that ProductGrid markup may contain:

```text
bindings
state reads
Surface Messages
```

that were not part of the browser's original validated page.

That's dangerous architecturally.

---

# 7. So distinguish **static streamed HTML** from **interactive streamed data**

This is the design I think fits Foldkit Plus especially well.

```text
                       SERVER
                         │
           ┌─────────────┴─────────────┐
           │                           │
      STATIC CONTENT             INTERACTIVE CONTENT
           │                           │
           ▼                           ▼
    stream HTML chunks           stream Remote facts
           │                           │
           ▼                           ▼
      SSR.static                  Messages/update
           │                           │
           ▼                           ▼
   browser adopts HTML              Model
                                      │
                                      ▼
                                    view
```

That division matches ownership.

### Static content

If a Composition block is genuinely server-owned:

```text
Heading
Text
Image
Markdown
static Product prose
```

it can eventually be streamed as HTML.

No Messages.

No client state.

No Remote resume state.

No hydration contract.

Perfect fit for:

```ts
SSR.static(...)
```

### Interactive content

If something belongs to a Surface:

```text
Cart
ProductGrid with actions
Search
Carousel state
live feed
```

I'd prefer streaming **its data into Foldkit**, not injecting arbitrary server-rendered DOM after boot.

That preserves:

```text
server fact
 ↓
Remote Message
 ↓
Data.reduce
 ↓
Model
 ↓
normal Foldkit view
```

One state machine.

---

# 8. This suggests explicit SSR delivery policy

And critically, **delivery policy should not live on `Surface` itself**.

A Surface means:

> what this feature observes and may cause.

It should not mean:

> whether my server wants to wait 200 ms before sending me.

Instead, SSR should interpret a SurfaceSource with a delivery policy.

Something like:

```ts
SSR.plan(App, {
  sources: {
    page:
      SSR.critical(CmsPage),

    navigation:
      SSR.critical(Navigation),

    recommendations:
      SSR.defer(Recommendations),

    activity:
      SSR.defer(Activity),
  },

  parts: [
    Remote.resume(Data),
  ],
})
```

or:

```ts
SSR.sources({
  critical: [
    CmsPage,
    Navigation,
  ],

  deferred: [
    Recommendations,
    Activity,
  ],
})
```

I slightly prefer the wrapper form because each declaration stays locally named.

---

# 9. `critical` should mean dependency closure

This matters with `Surface.each`.

Suppose:

```text
CmsPage
  ↓
Document
  ↓
ProductGrid Surface.each
```

If:

```ts
SSR.critical(CmsPage)
```

then only the Page itself is critical.

But perhaps ProductGrid isn't.

So:

```text
ROUND 1
CmsPage → fetch document
```

allows the shell to become known.

Then:

```text
ROUND 2
Document reveals:
 ProductGrid
 Recommendations
 RelatedArticles
```

and their policies decide whether to continue blocking.

Something like:

```text
CmsPage              CRITICAL

ProductGrid family   CRITICAL

Recommendations      DEFERRED

RelatedArticles      DEFERRED
```

Thus `Data.satisfy` evolves naturally into:

```ts
Data.satisfy(model, sources, {
  policy: source =>
    Critical | Deferred
})
```

or perhaps SSR handles that policy over lower-level `Data.satisfy`.

---

# 10. The SSR pipeline becomes

```text
request
  │
  ▼
route
  │
  ▼
SitePlan
  │
  ▼
critical SurfaceSources
  │
  ▼
Data.satisfy critical closure
  │
  ▼
Critical Model
  │
  ▼
render shell
  │
  ├──────────────► flush
  │
  ▼
deferred SurfaceSources
  │
  ├── Remote frames
  │      ↓
  │    browser update
  │
  └── static HTML regions
         ↓
       stream HTML
```

This is basically Affe's:

```text
critical loaders
deferred loaders
```

but generalized to the Foldkit architecture:

```text
critical capabilities
deferred capabilities
```

Much better.

---

# 11. Composition becomes a killer use case

Imagine the CMS document:

```text
Page
├── Hero
├── Text
├── ProductGrid
├── Testimonials
└── Recommendations
```

The deployed Catalog might classify these as:

```text
Hero              static
Text              static
ProductGrid       critical Surface
Testimonials      static/deferred
Recommendations   deferred Surface
```

Then SSR could behave like:

```text
0 ms
↓
load Page Document

50 ms
↓
ProductGrid critical data ready

55 ms
↓
flush:
  shell
  Hero
  Text
  ProductGrid
  placeholders

120 ms
↓
stream Testimonials static HTML

500 ms
↓
Recommendations Remote result arrives
browser Model updates
Recommendations renders
```

This is very compelling for the kind of CMS architecture you're building.

And the Document still doesn't get to decide:

```text
"I am critical"
```

as arbitrary stored executable policy.

The **Catalog/deployed application** owns delivery defaults.

---

# 12. There are two reasonable generations of SSR streaming

I would explicitly stage this.

### Phase 1 — safe streaming

Keep current resumability guarantees intact.

```text
critical data
    ↓
render known interactive page
    ↓
stream shell/static regions
    ↓
finish deferred server rendering
    ↓
terminal complete envelope
    ↓
boot
```

This improves:

```text
TTFB
first content
large static pages
```

but doesn't make interactivity available before the stream completes.

Relatively small conceptual jump.

### Phase 2 — early resumable shell

Later:

```text
critical state
   ↓
critical resume envelope
   ↓
browser boots
   ↓
deferred Remote frames continue
```

After that point:

- **interactive deferred content arrives as Messages/data**, not unchecked HTML;
- later server HTML must be restricted to `SSR.static` regions.

This preserves the core capability/security invariant.

That's the version I'd ultimately want.

---

# 13. This actually works nicely with `SSR.static`

A deferred static region can start as:

```html
<div data-foldkit-plus-static="testimonials">
  <!-- placeholder -->
</div>
```

The browser runtime knows:

> I do not own inside this boundary.

Then later the server stream can deliver:

```text
region testimonials
+
HTML
```

and a tiny SSR transport replaces the contents.

Since the Foldkit browser view deliberately doesn't own that subtree, you're not fighting hydration.

That is an unusually good foundation for HTML streaming.

---

# 14. Don't stream arbitrary post-boot HTML into Surface-owned regions

I would make this a hard rule.

```text
SSR.static region
→ server may stream DOM

Surface-owned region
→ server may stream facts/Messages
→ Foldkit renders DOM
```

This gives a clean ownership test for every streaming optimization.

It also prevents ending up with two concurrent renderers mutating the same subtree.

---

# 15. Remote live streaming remains separate from SSR deferred streaming

They can use the same transport technology but have different semantics.

### SSR deferred

Finite:

```text
page request
 ↓
some late data
 ↓
complete
```

### Remote live

Potentially unbounded:

```text
subscribe
 ↓
patch
 ↓
patch
 ↓
patch
 ↓
...
```

Remote live already has the important concept:

```text
cursor
```

so reconnection can say:

```text
resume after cursor X
```

The existing design is correct that a streaming connection alone does not provide reliability.

---

# 16. The Server graph can expose this in its manifest

Not to execute it differently, but for inspection:

```text
/api/remote
  kind: RPC
  response: stream
  resumable: cursor

/
  kind: document
  response: stream
  resume: Foldkit SSR

/webhooks/stripe
  kind: HttpApi
  response: unary
```

Potential internal metadata:

```ts
type Delivery =
  | { kind: "unary" }
  | { kind: "stream"; protocol?: string }
```

But this is descriptive.

`Server` must not interpret Remote frames or SSR chunks.

---

# 17. Cancellation should connect all the way down

With the combined design:

```text
user navigates away
       │
       ▼
old SurfaceSources disappear
       │
       ▼
Remote subscriptions no longer needed
       │
       ▼
cancel client stream
       │
       ▼
HTTP/RPC cancellation
       │
       ▼
Request AbortSignal
       │
       ▼
interrupt server Effect fibers
       │
       ▼
release DB/API resources
```

This is the right place to recover Affe's strong navigation supersession behavior.

Again, not through a `RouterRuntime`.

It falls out of:

```text
Surface lifetime
+
Remote stream lifetime
+
Effect structured concurrency
```

which is much more Foldkit-native.

---

# 18. And it gives `Site.prefetch` a useful streaming mode

Eventually:

```ts
Site.prefetch(target, {
  delivery: "progressive"
})
```

could mean:

```text
target SitePlan
 ↓
critical target Sources first
 ↓
cache them
 ↓
deferred Sources continue opportunistically
```

If navigation happens halfway through:

```text
already received data stays in Remote.Model
remaining streams become the active page's streams
```

ideally without restarting if identities match.

That's where semantic Remote request identity/coalescing really pays off.

---

## So I would add streaming to the design like this

```text
                              Server
                                │
             ┌──────────────────┼───────────────────┐
             ▼                  ▼                   ▼
          Document            Remote              HttpApi
             │                  │                   │
          SSR.stream       Effect RPC Stream     Web Response
             │                  │                   │
       ┌─────┴─────┐            │                   │
       ▼           ▼            ▼                   ▼
 static HTML   deferred     normalized         arbitrary
   regions       data         patches            stream
       │           │            │
       │           └──────┬─────┘
       │                  ▼
       │                Model
       │                  │
       │                  ▼
       │                update
       │                  │
       └──────────────► browser
```

The rule I'd write into the architecture document is:

> **Foldkit Plus streams according to ownership. Server-owned presentation may stream as HTML. Browser-owned application behavior streams as semantic state changes and is rendered by Foldkit. Server topology transports both but interprets neither.**

That gives you Affe's very useful **critical/deferred streaming** capability, but in a way that lines up much better with `SurfaceSource`, Remote normalization, Composition, `SSR.static`, resumability, and Foldkit's single explicit Model/update loop.

---

# 19. What the CMS example taught the server (2026-09-27)

`examples/cms` is the first application here with a real server: a CMS over
SQLite, published as a static demo whose server runs in each visitor's
browser, and whose public site is rendered at build time. Nothing in it used a
server graph, because there is none yet; so each of these is a need the graph
has to meet, with the code that met it by hand.

## 19.1 A server is a function before it is a route

The example's server is one function, `answer(backend, chair, body)` in
`endpoint.ts`: a decoded envelope (`{ operation, payload }`) in, an answer
(`{ ok, result }` or `{ ok: false, error }`) out. Three hosts call it:

- `http.ts`, over HTTP, for `pnpm dev`;
- `browser.ts`, in the page, over SQLite compiled to WebAssembly, for the
  published demo, where each visitor has a server of their own;
- `prerender.ts`, at build time, to read every page's data before rendering it.

So the graph must be runnable without a listener: `Server.handle(graph,
request)` as an Effect, with Node's `http`, a Worker's `fetch`, an in-page
transport and a build step as adapters around it. A graph that can only be
served over HTTP would have ruled out two of the three.

The same function took its clock and its database as arguments
(`openServer(clock, sqlite)`), which is what let the build, the tests and the
sandbox run it. The graph's Layers should keep both injectable, not read from
the environment.

## 19.2 Time is an input, and scheduled work is a node

The CMS owns no timer: a scheduled post is published when a host asks what is
due (`publishDue`). `http.ts` asks on an interval, and the in-page sandbox asks
every five seconds. That is a scheduled job, and every host wrote its own.

- `Server.every(name, interval, effect)` as a node beside routes, so the graph
  lists it and each host maps it: an interval in Node and in the page, Cron
  Triggers or a Durable Object alarm on Workers.
- The job reads the clock through the graph's Layer, so a test moves it with
  `TestClock` and a build runs none.

## 19.3 A build is a host too

The build ran the server over the seed, enumerated what exists from its data
(every published post is a page), and wrote each page as a file. That is the
server graph evaluated at build time: a document node rendered for a list of
paths, where the paths come from a query ([router-DESIGN.md](./router-DESIGN.md)
§33.9's `Site.paths`).

- A document node declares how its paths are listed, and `Server.generate(graph,
  { origin })` renders each through the same SSR node a request would reach.
- What cannot be generated (an API, a live stream) stays a request-time node,
  and the manifest (§16) says which is which, so a deploy knows whether it needs
  a runtime at all.

## 19.4 A static deploy has semantics the graph should emit

Deploying the generated site to a static host needed rules that nothing
produced; they were written by hand or left to the host's defaults:

- **File layout.** `/site/blog/x` is served from `site/blog/x.html` on
  Cloudflare Pages, and `/site/blog/x/` redirects to it with a 308. Another
  host wants `x/index.html`. The layout is a property of the host adapter.
- **Headers.** `public/_headers` makes `/assets/*` immutable for a year, by
  hand. Generated HTML should be short-lived and revalidated; the adapter should
  write both from the graph.
- **Not found.** An address no page answers (`/site/missing`) is served the
  studio's shell with a 200, because the host falls back to `index.html` for
  the studio's own client routes. A crawler reads that as a page. The graph
  knows which prefixes are client-routed (the studio) and which are generated
  (the site), so it can emit a 404 page for the second and a fallback for the
  first.
- **Redirects** (a renamed slug, a moved page) belong in the same emitted
  rules; the CMS's slug history (cms-DESIGN §14) is their source.

## 19.5 Where a principal comes from, per host

The demo names its reader in the address (`?as=edda`), sent as an `x-chair`
header over HTTP and as an argument in the page. `RemoteServer` still refuses
what the policy refuses: a writer who asks to publish is told "This author may
not publish this entry", whichever host carried the request. That confirms
§"Authentication should stay outside RemoteServer", and adds:

- The principal function is per host, not per graph: a cookie session over
  HTTP, the signed-in user in the page, nobody at build time.
- A cookie-authenticated mutation, and SSR's `fallback: 'server'` form posts,
  need CSRF protection (`SameSite` plus a token the page carries). That is the
  graph's middleware, applied to every node that changes state.

## 19.6 Answers that do not leak

`answer` decodes its envelope with a Schema before anything runs, and reports
every failure as `{ ok: false, error }` with a message, never a stack. The
graph's nodes should share that shape: decode at the boundary, one error
channel, internals logged and not returned.

## 19.7 Inline content and a content security policy

Each generated page carries inline JSON (the resume envelope, a post's
JSON-LD) and inline styles (the foundations and the page's own). A strict
content security policy refuses all of them unless it names their hashes, or a
nonce per request. The document node knows every inline block it writes, so it
can emit the policy: hashes for a generated page, a nonce for one rendered per
request.

## 19.8 Caching and the reader

A generated page is the same for everyone, so it can be cached publicly. A
page rendered for a signed-in reader is not. The demo met the static form of
this: a visitor whose sandbox changed must not be shown the seed's page as
theirs, so the browser draws afresh (ssr-PLAN Phase S5). The server form:

- A document node declares whether it depends on the principal. If it does,
  it is rendered per request with `Cache-Control: private` (or `Vary` on the
  session), never generated.
- Public data under a personal page (a post, and whether this reader saved it)
  splits into a public generated page and a small private read.

## 19.9 Locales at the edge

A localized site (see [i18n-DESIGN.md](./i18n-DESIGN.md)) negotiates a locale
once, at an entry with none in its address, from `Accept-Language` or a
stored choice, and redirects to the localized address. Every other page has its
locale in its route, so it is generated and cached per locale with no `Vary`.
A static host does the negotiation with its redirect rules, which §19.4's
emitted rules include.

## 19.10 What to build first

1. `Server.handle` in-process, with the Node, Worker, in-page and build
   adapters (19.1). The example's three hosts become its first users.
2. Scheduled jobs (19.2), which the CMS needs today.
3. Static emission: files, headers, redirects and a 404 for generated prefixes
   (19.3, 19.4), with SSR Phase S7's Vite step as its build adapter.
4. Principal and CSRF middleware (19.5), then the content security policy
   (19.7) and caching (19.8), as the first signed-in pages need them.
