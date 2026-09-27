I think the right target is now much clearer.

**Do not put Affe's runtime on top of Foldkit. Put Affe's *declarative page graph* on top of Foldkit, and compile it into the Foldkit Plus primitives you already have.**

That distinction matters because, after looking through the current `foldkit-plus` tree, a surprising amount of Affe's runtime behavior already exists—just distributed across `Surface`, `Remote`, `Wiring`, `Bundle`, and `SSR`.

Your own design docs almost predicted this. `data-query-DESIGN.md` says a `Page/RouteContract` would become justified once several things repeatedly needed one route-associated value: Surface activation, head metadata, SSR/preload policy, actions, layout metadata. I think you've now crossed that threshold. [See §31.11](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/data-query-DESIGN.md).

# The architecture I would aim for

```text
                         FOLDKIT

                   URL ↔ typed AppRoute
                         │
                         ▼
                     Model.route
                         │
                         │
               ┌─────────▼─────────┐
               │   foldkit-page    │
               │                   │
               │ pure page graph   │
               │ no runtime/state  │
               └─────────┬─────────┘
                         │
       ┌─────────────────┼──────────────────┐
       │                 │                  │
       ▼                 ▼                  ▼
   Surfaces           layouts           metadata
       │                                    │
       ▼                              SSR / head /
 Projections                         preload / agent
       │
       ▼
  ReadContracts
       │
       ▼
     Remote
       │
   ┌───┼──────────┐
   ▼   ▼          ▼
 read query     live
   │
   └──── coalesced ────┐
                       ▼
                 RemoteClient
```

`foldkit-page`—name tentative—would be **pure declarative structure**.

No cache.

No reducer.

No loader-result state.

No second navigation runtime.

No global registry.

No hidden fetches.

Instead, it says:

> This route belongs here in the page hierarchy. These Surfaces are active for it. This view/layout renders them. These are its metadata and preload/SSR policies.

Everything then lowers into things that Foldkit Plus already understands.

---

# The realization: you already have most of Affe's data runtime

Affe says:

```text
matched routes
    ↓
matched loaders
    ↓
parallel execution
    ↓
cache
```

Foldkit Plus already says:

```text
Model.route
    ↓
active Surfaces
    ↓
Projection requirements
    ↓
Data.subscriptions
    ↓
Remote planner
    ↓
concurrent/coalesced reads
    ↓
Remote.Model
```

And you've actually tested this end-to-end in [`packages/remote/test/route.test.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/remote/test/route.test.ts).

That test proves:

```text
URL
→ AppRoute
→ Model.route
→ Surface
→ QueryRef
→ Remote requirements

navigate elsewhere
→ Surface inactive
→ requirements disappear
→ retention root disappears
```

So **don't introduce `Page.loader()`**.

You already have a better representation of what a loader means.

Affe has opaque code:

```ts
Route.loader(() => fetchProject(...))
```

and therefore has to discover/capture dependencies.

Plus has:

```ts
const ProjectPage = App.surface("ProjectPage", {
  params: { projectId: ProjectId },

  model: ({ params }) => ({
    project: Data.get(ProjectDetail, params.projectId),

    comments: Data.query(
      CommentsForProject,
      { projectId: params.projectId },
      { select: CommentRow, first: 50 },
    ),
  }),
})
```

The declaration itself tells you exactly what the page needs.

That's stronger.

---

# So add the thing Affe has that Plus doesn't: a real page tree

This is the biggest missing primitive.

I'd want something roughly like:

```ts
const Root = Page.layout({
  id: "root",
  view: RootLayout,
})

const Projects = Page.path(
  literal("projects"),
).pipe(
  Page.layout(ProjectsLayout),
  Page.surface(ProjectsPage),
)

const Project = Page.path(
  schemaSegment("projectId", ProjectId),
).pipe(
  Page.to(AppRoute.Project),
  Page.surface(
    ProjectPage,
    route => ({
      projectId: route.projectId,
    }),
  ),
  Page.view(ProjectPageView),
)

const Settings = Page.path(
  literal("settings"),
).pipe(
  Page.to(AppRoute.ProjectSettings),
  Page.surface(
    ProjectSettings,
    route => ({
      projectId: route.projectId,
    }),
  ),
  Page.view(ProjectSettingsView),
)

const Pages = Page.tree(
  Root,
  Page.mount(Projects, [
    Page.mount(Project, [
      Settings,
    ]),
  ]),
)
```

That creates a real structural graph:

```text
Root
└── Projects                /projects
    └── Project             /projects/:projectId
        └── Settings        /projects/:projectId/settings
```

But unlike Affe, that tree does **not** become the owner of data.

It's a composition graph.

That means you can ask:

```ts
Pages.router
Pages.parse(url)

Pages.href(Project, {
  projectId: "p1"
})

Pages.chain(AppRoute.ProjectSettings(...))

Pages.surfaces(model)

Pages.render(model, h)

Pages.inspect()
```

This is the part I'd steal most aggressively from Affe.

---

# Nested routing gets dramatically better

Core Foldkit's:

```ts
pipe(
  literal("projects"),
  slash(schemaSegment("projectId", ProjectId)),
  slash(literal("settings")),
  ...
)
```

is elegant as a URL algebra, but it doesn't capture the fact that:

```text
/projects
/projects/:projectId
/projects/:projectId/settings
```

form an application hierarchy.

The Page graph can add that without changing Foldkit Router.

Internally, it can **compile the tree back into Foldkit biparsers**.

Conceptually:

```text
Page.path("projects")
     │
     └─ child Page.path(ProjectId)
                │
                └─ child Page.path("settings")
```

compiles into:

```ts
literal("projects")

pipe(
  literal("projects"),
  slash(schemaSegment("projectId", ProjectId)),
)

pipe(
  literal("projects"),
  slash(schemaSegment("projectId", ProjectId)),
  slash(literal("settings")),
)
```

Then `Route.oneOf(...)`.

So Foldkit still owns URL semantics.

`foldkit-page` owns structural composition.

That's a very clean boundary.

---

# Preserve node identity like Affe does

This is one Affe detail worth copying directly.

A page shouldn't stop being the same page because someone later mounts children underneath it.

So:

```ts
export const Project = Page.path(...)

export const Pages = Page.tree(
  Page.mount(Project, [
    ProjectSettings,
    ProjectActivity,
  ])
)
```

`Project` remains a stable first-class value.

You can use it for:

```ts
Pages.href(Project, params)

Page.surface(Project, ...)
Page.meta(Project, ...)
Page.prefetch(Project, ...)
```

while mounting establishes its structural context.

That avoids conflating:

```text
the page's identity
```

with:

```text
the place where this application mounted it
```

Affe gets this right with `Route.mount`.

---

# But don't make nested routing imply data waterfalls

Here Foldkit Plus can arguably do better than Affe.

Suppose the matched chain is:

```text
Organization
    ↓
Project
        ↓
Settings
```

and each has a Surface:

```text
OrganizationSurface
ProjectSurface
SettingsSurface
```

The active page graph can simply expose:

```ts
[
  OrganizationSurface(...),
  ProjectSurface(...),
  SettingsSurface(...),
]
```

to:

```ts
Data.wiring(...)
```

Then all their declared requirements are active simultaneously.

You already have Remote coalescing. Current `Remote.clientLayer` wraps **both reads and queries** in coalescers; overlapping reads union their fields and in-flight identical work is joined. See [`packages/remote/src/client.ts`](https://github.com/doeixd/foldkit-plus/blob/main/packages/remote/src/client.ts) and the current Remote changelog.

So:

```text
            Project page activates

       ┌──────────┼───────────┐
       ▼          ▼           ▼
 Organization   Project     Settings
  Surface       Surface      Surface
       │          │           │
       └──────────┼───────────┘
                  ▼
             requirements
                  │
                  ▼
          Remote coalescing
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
 combined entity read      query(s)
```

No special:

```ts
concurrency: "unbounded"
```

page scheduler is necessary.

The declaration graph already exposes enough information for Remote to schedule it.

---

# And Plus already has a nicer answer to many dependent loaders

Affe needs:

```ts
{ dependsOnParent: true }
```

because a child loader may need the parent's opaque result.

Plus's Entity/Projection graph often knows the relationship declaratively.

Your `local-execution-DESIGN.md` explicitly notes this: relation references are recursively expanded by `plan`; the stages fall out of **data dependencies rather than route dependencies**.

That's better.

```text
Project
  owner -> User
             ↓
          avatar -> Asset
```

becomes:

```text
Projection asks for Project.owner
             ↓
planner discovers User ref
             ↓
planner asks required User fields
             ↓
etc.
```

not:

```text
Project route loader
     ↓
wait
     ↓
User child loader
```

I would preserve that.

For the remaining genuine case:

```text
fetch Organization
→ response contains billingAccountId
→ unrelated Billing query needs billingAccountId
```

I'd eventually add a general data primitive such as:

```ts
Projection.flatMap(...)
```

or:

```ts
Read.then(...)
```

rather than `Page.dependsOnParent`.

Because the same dependency can arise from a selection, modal, wizard, agent operation, etc. It isn't fundamentally routing.

---

# Page rendering can solve the Outlet problem cleanly

I wouldn't add a magic `<Outlet>`.

You can make the page chain compile into ordinary Foldkit view composition.

For example:

```text
RootLayout
    ↓
ProjectsLayout
    ↓
ProjectLayout
    ↓
SettingsView
```

becomes essentially:

```ts
RootLayout(
  ProjectsLayout(
    ProjectLayout(
      SettingsView(...)
    )
  )
)
```

The nice synergy is with `SurfaceView`.

A page can bind a Surface to its renderer:

```ts
const Project = Page.path(...).pipe(
  Page.surface(ProjectPage, paramsFromRoute),
  Page.view(ProjectPageView),
)
```

where `ProjectPageView` is already constrained by the Surface's model/message contract.

A layout could similarly be:

```ts
Page.layout(ProjectShell, ProjectShellView)
```

and receive:

```ts
(data, child, h) => Html
```

So structural page composition **strengthens Surface capability boundaries** instead of bypassing them by giving route components the whole application Model.

That's very Foldkit Plus.

---

# `Surface.when` is almost the exact bridge you need

You already added this after the original design discussion.

Current `Surface.when` records:

```ts
{
  path,
  tag,
}
```

so activation is inspectable instead of being hidden in:

```ts
model => model.route._tag === ...
```

That's excellent for this.

I'd have the Page compiler produce `Surface.when`-style activations automatically.

For a leaf:

```ts
Page.surface(
  ProjectPage,
  route => ({ projectId: route.projectId }),
)
```

lowers conceptually to:

```ts
Surface.when(
  ProjectPage,
  App.model.route,
  AppRoute.Project,
  route => ({
    projectId: route.projectId,
  }),
)
```

The one extension I'd consider is a generalized `Surface.whenAny` or activation predicate metadata, because a layout Surface may be active for multiple descendants:

```text
ProjectsLayout is active for:

Projects
Project
ProjectSettings
ProjectActivity
```

That shouldn't be a router-specific special case inside Surface.

Something like:

```ts
Surface.whenAny(
  ProjectsLayoutSurface,
  App.model.route,
  [
    AppRoute.Projects,
    AppRoute.Project,
    AppRoute.ProjectSettings,
    AppRoute.ProjectActivity,
  ],
  route => ...
)
```

could remain a generic tagged-state feature.

---

# This gives you static manifests for free

Affe's route tree is useful not just at runtime.

It's inspectable.

Your Page graph could expose:

```ts
Pages.inspect()
```

with something approximately like:

```text
ProjectSettings

path:
  /projects/:projectId/settings

ancestors:
  Root
  Projects
  Project

surfaces:
  AppShell
  ProjectsShell
  ProjectPage
  ProjectSettings

messages:
  RenamedProject
  DeletedProject
  ChangedSetting

remote:
  Project:p1 [id, name, owner]
  ProjectSettings(p1)

layout:
  Root → Projects → Project → Settings

ssr:
  eager

prefetch:
  hover
```

This becomes immediately useful to:

```text
DevTools
SSR
agents
prefetching
architecture validation
documentation
route visualizers
```

And importantly, this information comes from declarations that are already real architectural contracts.

No runtime instrumentation necessary.

---

# Prefetch becomes especially nice

Today you already have:

```ts
Data.prefetch(
  model,
  ProjectPage.projection({ projectId }),
)
```

for SSR, route prefetch, hover prefetch, and tests.

A Page graph lets you lift that from:

> “I know which Surface I need”

to:

> “I know where the user may navigate.”

For example:

```ts
const next = Pages.target(Project, {
  projectId: "p1",
})

const model = yield* Pages.prefetch(Data, currentModel, next)
```

Internally:

```text
target page
    ↓
route chain
    ↓
all active Surfaces for target
    ↓
compose their Projections
    ↓
Data.prefetch(...)
```

No new fetching system.

And because `Projection.struct` already merges metadata, deduplicates dependencies, and Remote merges overlapping requirements, **prefetch gets the same behavior as actual navigation**.

That's a very strong property:

```text
navigation planning
SSR planning
hover prefetch
tests
```

all evaluate the same page contract.

---

# This should feed directly into `foldkit-ssr`

Your SSR work makes this substantially more valuable than it would be in vanilla Foldkit.

Today an SSR plan contains things like:

```ts
SSR.plan(App, {
  state: ...,
  surfaces: [...],
  parts: [
    Remote.resume(Data),
  ],
})
```

A Page node could carry **SSR policy metadata**, while `foldkit-ssr` remains the runtime.

Something like:

```ts
Project.pipe(
  Page.ssr({
    start: "now",
  }),
)
```

or simply:

```ts
Page.preload("server")
```

The Page graph can derive:

```text
route
+
active Surface chain
+
Remote requirements
+
SSR policy
```

and hand those into your existing `SSR.plan`.

Don't make Page serialize anything itself.

`Remote.resume(Data)` already captures the Remote state required by the active Surfaces and restores it client-side so the browser doesn't fetch it again.

That's basically route-loader hydration, but in a form much more compatible with your architecture.

---

# Wiring is probably the integration seam

This is where your existing design gets very synergistic.

`Wiring` already means:

> How does an integration join this application?

It contributes:

```text
Message routing
startup
URL behavior
Subscriptions
resources
contracts
```

and `Bundle` assembly compiles those pieces into ordinary Foldkit configuration.

So ultimately I'd like to be able to write something like:

```ts
const Routing = Pages.bind(App, {
  route: App.model.route,
  changed: Message.ChangedUrl,
})

const assembly = Shell.assemble(
  Routing.wiring(),
  Data.wiring(Routing.surfaces()),
  Preferences.wiring(),
  Editor.at(...),
)
```

I'm less attached to those exact names than I am to this property:

> **Adding the page graph should remove wiring, not create another runtime configuration alongside wiring.**

`Pages.bind(...)` can generate the Foldkit URL behavior, active Surface set, route manifest, and perhaps route transition helpers.

And then your current `assemble(...)` remains the place where application integrations come together.

---

# Single flight is the genuinely missing Affe idea

This is the one part I would actually add to Remote eventually.

But I would implement it very differently from Affe.

Affe has to do:

```text
loader runs
   ↓
capture semantic keys read

mutation runs
   ↓
capture keys invalidated

intersection
   ↓
rerun affected loaders
```

Plus doesn't need this.

You already know:

```text
what a Surface reads
what fields a Selection reads
what QueryDefinition means
what Entity a mutation patches/deletes
what connection changes it returns
```

Your own [`effect-atom-jsx-LESSONS.md`](https://github.com/doeixd/foldkit-plus/blob/main/docs/design/effect-atom-jsx-LESSONS.md) makes exactly this point.

And Remote mutations already return:

```ts
{
  output,
  entities,
  connections,
  deleted,
}
```

That's basically **direct loader seeding done correctly at normalized cache granularity**.

If rename returns:

```text
Project:p1.name = "New"
```

every active Surface asking for `Project:p1.name` sees it immediately.

There is no need to rerun two page loaders that both contained copies of Project.

That's better than Affe.

### The remaining single-flight problem

Suppose the mutation changes the membership of an expensive query whose exact post-mutation result can't be derived locally.

Today:

```text
REQUEST 1
mutation
   ↓
patch/invalidate cache
   ↓
response

REQUEST 2
active read/query sees invalidation
   ↓
refetch
```

Affe can turn that into:

```text
REQUEST 1
mutation
+
necessary revalidation
   ↓
combined response
```

That's worth stealing.

I'd eventually extend the Remote protocol toward:

```ts
MutationRequest {
  requestId
  mutation
  input

  refresh?: {
    reads
    queries
  }
}

MutationResult {
  output
  entities
  connections
  deleted

  refreshed?: {
    reads
    queries
  }
}
```

The critical difference from Affe is:

> **The refresh plan comes from declared Surface/Projection/Query semantics, not dynamic loader key capture.**

The server performs:

```text
mutation
    ↓
apply authoritative change
    ↓
answer affected active read requirements
    ↓
one response
```

The client reduces the whole thing through `Data.reduce`.

That would be a genuinely excellent Foldkit-native version of single flight.

---

# Don't put single-flight onto `Page`

This is important.

The Page graph can help answer:

```text
which Surfaces are currently active?
```

but Remote should still own:

```text
which server facts those Surfaces require?
which facts the mutation already returned?
which queries need revalidation?
how do results enter the normalized cache?
```

So I'd want the eventual relationship to look like:

```text
Page graph
   │
   └── active Surfaces
             │
             ▼
           Remote
      ┌──────┴──────┐
      │             │
 current reads    mutation
      │             │
      └──── single-flight planner
                     │
                     ▼
                  server
```

rather than:

```ts
Page.action(...).singleFlight(...)
```

That keeps ownership extremely clean.

---

# Supersession mostly already exists too

Affe's navigation cancellation was one of its nicest details:

```text
navigation A
loader fibers

navigation B
→ interrupt A
→ prevent stale result commit
```

But route-driven Remote work already lives in **Foldkit Subscriptions**.

When Surface dependencies change, the relevant subscription stream changes/restarts. Your Remote implementation also has per-field and per-connection refresh generations specifically so refreshing one piece of data restarts the entries observing it rather than every read.

So for Remote-backed page data:

```text
route p1
→ ProjectPage(p1)
→ read p1

route p2
→ ProjectPage(p2)
→ old dependency disappears
→ subscription work changes
→ new p2 requirements
```

You already have the structural lifetime mechanism Affe had to implement in `RouterRuntime`.

I wouldn't add page-navigation task IDs unless a concrete race remains after exercising the whole Page→Surface→Remote path.

---

# ServerRoute is one Affe idea I would *not* copy

Affe's `ServerRoute` is convenient, but Plus already has better-established ownership:

```text
page documents
    → foldkit-ssr

entity/query/mutation data
    → foldkit-remote-server
    → Effect RPC

general APIs
    → Effect HttpApi
```

Creating:

```ts
Page.serverAction(...)
```

would blur layers you currently keep nicely separated.

The thing worth stealing from `ServerRoute` is the **compositional declaration style**, not the ownership of HTTP.

---

# What the final developer experience could feel like

I'd aim for code approximately this concise:

```ts
const ProjectPage = App.surface("ProjectPage", {
  params: { projectId: ProjectId },

  model: ({ params }) => ({
    project: Data.get(ProjectDetail, params.projectId),

    activity: Data.query(
      ActivityForProject,
      { projectId: params.projectId },
      { select: ActivityRow, first: 25 },
    ),
  }),

  messages: [
    Message.RenamedProject,
    Message.ArchivedProject,
  ],
})

export const Project = Page.path(
  schemaSegment("projectId", ProjectId),
).pipe(
  Page.to(AppRoute.Project),

  Page.surface(
    ProjectPage,
    ({ projectId }) => ({ projectId }),
  ),

  Page.view(ProjectView),
)

export const Projects = Page.path(
  literal("projects"),
).pipe(
  Page.layout(ProjectsLayout),
  Page.children([
    Project,
    ProjectSettings,
  ]),
)

export const Pages = Page.make({
  route: App.model.route,
  routes: [
    Home,
    Projects,
  ],
})
```

And then:

```ts
const wiring = Shell.assemble(
  Pages.wiring(Message.ChangedUrl),
  Data.wiring(Pages.surfaces),
)
```

Now that one page declaration is useful for:

```text
typed URLs
nested hierarchy
layouts
active Surfaces
parallel/coalesced data
retention
hover prefetch
SSR prefetch/resume
DevTools tree
agent manifest
head metadata
future single-flight revalidation
```

while **every state transition still goes through Foldkit**.

That's the sweet spot.

---

## Mapping Affe onto Foldkit Plus

| Affe idea                         | Foldkit Plus-native equivalent                               | What I'd do                 |
| --------------------------------- | ------------------------------------------------------------ | --------------------------- |
| `Route` tree                      | Foldkit biparsers + new pure Page graph                      | **Add**                     |
| `Route.mount`                     | Stable Page node + structural mount                          | **Add**                     |
| `<Outlet>`                        | Pure nested view/layout composition                          | **Add, no magic component** |
| `Route.loader`                    | Surface Projection + Remote                                  | **Already better**          |
| Loader cache                      | `Remote.Model`                                               | **Already exists**          |
| Parallel loaders                  | simultaneous active Surface requirements + Remote coalescing | **Already exists**          |
| `dependsOnParent`                 | recursive data planning / future staged Projection           | **Keep out of router**      |
| Loader SWR                        | `RemotePolicy.staleWhileRevalidate`                          | **Already exists**          |
| Loader prefetch                   | `Data.prefetch` over target-page Surfaces                    | **Add Page sugar**          |
| Route supersession                | Subscription lifecycle + generation tracking                 | **Mostly exists**           |
| Reactivity keys                   | Entity/Projection/Query dependencies                         | **Already stronger**        |
| `seedLoader`                      | normalized mutation entity/connection result                 | **Already stronger**        |
| Single-flight mutation+revalidate | Remote mutation response + active read plan                  | **Add later**               |
| ServerRoute                       | RemoteServer / HttpApi / SSR                                 | **Don't copy**              |
| Route head metadata               | pure Page metadata → Document                                | **Add when useful**         |
| Route manifest                    | Page tree + Surface metadata                                 | **Add**                     |
| Route DevTools                    | Page inspect manifest                                        | **Add**                     |

---

# I would build it in this order

1. **Build `foldkit-page` as pure data only.** Nested page nodes, stable identity, mount/children, compilation into current Foldkit biparsers, URL building, `parent/ancestors/depth/chain`, validation, and an inspectable manifest. No Remote dependency yet.

2. **Attach existing Surfaces.** Let nodes bind `Surface + route→params`; derive the active Surface chain from `Model.route`. Add a generic `Surface.whenAny` only if layout activation proves it necessary.

3. **Add pure layout/view composition.** Bind `SurfaceView`s to nodes and recursively compose layouts. No `<Outlet>`, no hidden Model reads.

4. **Integrate Wiring and Remote without adding new semantics.** `Pages.wiring(...)`, `Pages.surfaces`, and target-page Projection composition. Prove that three nested page Surfaces fetch in parallel/coalesce and that leaving the route releases retention.

5. **Integrate `foldkit-ssr` and prefetch.** Derive active Surfaces from the page graph; make hover/SSR prefetch use the exact same target-page Projection; let `Remote.resume(Data)` continue owning cache transport.

6. **Only then prototype single-flight Remote mutations.** Benchmark an actual mutation→invalidated-query case first. If the extra round trip matters, extend the Remote RPC envelope with post-mutation reads rather than creating loader semantics.

7. **Expose the graph to DevTools and Agent.** By then `Pages.inspect()` becomes extraordinarily useful: route hierarchy, active chain, Surfaces, Messages, Remote requirements, SSR policy, and links can all be represented without runtime introspection.

The architectural test I would keep applying is:

> **Can this new feature compile down to ordinary Foldkit Model, Message, update, Command, Subscription, Surface, Remote, Wiring, or SSR semantics?**

If yes, it belongs in the Page graph.

If it requires the Page graph to become another store, async runtime, reducer, or cache, the abstraction has started drifting toward Affe's implementation rather than taking the part of Affe that actually complements Foldkit.

The result could be stronger than either design alone: **Foldkit's explicit state/effect architecture + Affe's declarative application topology + Foldkit Plus's inspectable Surface/data graph.**


Yes. This actually makes the Affe/Foldkit plan cleaner, because `foldkit-composition` already occupies the meaning I was giving to part of `foldkit-page`.

The key is to treat them as **two orthogonal graphs**:

```text
DEPLOYED APPLICATION TOPOLOGY           STORED PAGE TOPOLOGY

Route tree / Site                       Composition.Document
(code)                                  (data)

 /                                      Section
 ├─ /products                           ├─ Heading
 │  └─ /products/:id                    ├─ ProductGrid
 └─ /about                              └─ CTA
       │                                      │
       └─────────────────┬────────────────────┘
                         ▼
                  active Surface graph
                         │
                  ┌──────┼───────┐
                  ▼      ▼       ▼
                Remote  Bundle  Actions
```

`foldkit-composition` should remain exactly what its README says it is: the Catalog defines what *may* exist, the Document records what *does* exist, and the package itself performs no I/O, holds no state, and renders nothing. :chatgpt-content-reference{index="0"}

That suggests several changes to my previous plan.

## 1. I would **not** call the new routing abstraction `foldkit-page`

That's now the wrong name.

Your composition package already has a strong claim on “page”:

> the stored page is a Document of Blocks in Regions.

And its ownership split is very good: Blocks/Catalog are deployed code; the actual arrangement is stored data. :chatgpt-content-reference{index="1"}

So the Affe-inspired layer should describe something else:

```text
foldkit-site
foldkit-route-tree
foldkit-navigation
```

I like **`foldkit-site`** most if this is an optional Plus package.

Then:

```ts
const Site = RouteSite.make({
  routes: [
    Home,
    Products,
    Product,
    CmsPage,
  ],
})
```

Whereas:

```ts
const Marketing = Catalog.make({
  blocks: [Hero, Section, Text, ProductGrid, CTA],
  roots: [Content.Section],
})
```

They answer completely different questions.

```text
RouteSite
"What application location are we at?"

Catalog + Document
"What content exists at this location?"
```

Don't merge them.

---

# 2. The really interesting common layer is **Surface**

This is where the two worlds should converge.

For a code-authored route:

```text
route
 ↓
Surface
 ↓
Projection
 ↓
Remote requirements
```

For a content-authored page:

```text
Document
 ↓
Block
 ↓
Surface
 ↓
Projection
 ↓
Remote requirements
```

That is extremely elegant.

And your Composition design is already headed there.

For example, imagine this stored document:

```ts
{
  nodes: {
    hero: {
      block: "Hero",
      props: { title: "Our products" },
    },

    products: {
      block: "ProductGrid",
      props: { category: "shoes" },
    }
  }
}
```

The stored data **does not contain a query**.

Instead deployed code says:

```ts
const ProductGrid = Block.fromSurface(
  ProductGridSurface,
  {
    Props: Schema.Struct({
      category: CategoryId,
    }),

    params: props => ({
      category: props.category,
    }),

    provides: [Content.Data],
  },
)
```

Then:

```text
stored node

ProductGrid
category = shoes
      │
      ▼
deployed Block definition
      │
      ▼
ProductGridSurface({
  category: "shoes"
})
      │
      ▼
Data.query(...)
```

That preserves the central security/architecture property of Composition:

**stored data selects capabilities that deployed code has made available; it never stores executable behavior.**

That's consistent with the fact that Document props are plain JSON checked against the Block schema. :chatgpt-content-reference{index="2"}

---

# 3. This reveals a missing general primitive: dynamic Surface instances

This might be the most important architectural consequence.

Right now route activation is easy because you have a statically known thing:

```ts
Surface.when(
  ProjectPage,
  App.model.route,
  AppRoute.Project,
  route => ({ projectId: route.projectId }),
)
```

But Composition means the Model can contain:

```text
0 ProductGrid blocks
3 ProductGrid blocks
5 Weather blocks
1 ShoppingCart block
...
```

and each can instantiate a Surface with different params.

You really want something conceptually like:

```ts
Surface.each(
  ProductGridSurface,

  document => Composition.nodesOf(
    document,
    ProductGrid,
  ),

  node => ({
    key: node.id,
    params: {
      category: node.props.category,
    },
  }),
)
```

Producing:

```text
ProductGrid@node-a(category = shoes)
ProductGrid@node-f(category = hats)
ProductGrid@node-x(category = coats)
```

Each is an ordinary Surface instance.

That primitive isn't Composition-specific.

It would also help:

```text
dynamic dashboards
tabs generated from Model data
plugin systems
arbitrary row features
CMS widgets
per-document tools
```

So I would add something to `foldkit-surface`, not hack it into Composition.

Maybe:

```ts
Surface.each(...)
```

or:

```ts
Surface.collection(...)
```

I prefer `Surface.each`.

---

# 4. Then Composition's Foldkit renderer can expose its Surface plan

Your core package should remain pure.

I'd keep the boundary suggested by the README:

```text
foldkit-composition
    Block
    Catalog
    Document
    Operation
    validation

foldkit-composition/foldkit
    Renderer
    dynamic Surface activation
    Action dispatch
    Bundle-backed Blocks
    SSR integration
```

The core Document has a normalized node graph and derived index; that's ideal input for an interpreter. :chatgpt-content-reference{index="3"}

I'd make the Foldkit-side renderer produce something richer than just HTML.

Something like:

```ts
const SiteRenderer = Renderer.make(MarketingCatalog, {
  Hero: HeroView,
  Section: SectionView,
  ProductGrid: ProductGridView,
  Cart: CartView,
})
```

And then:

```ts
const plan = SiteRenderer.plan({
  document,
  context,
})
```

Conceptually returning:

```ts
{
  roots,
  surfaces,
  stateful,
  actions,
  staticNodes,
  diagnostics,
}
```

Not necessarily literally that public type, but that mental model.

The important move is:

> **rendering and data planning interpret the same resolved Document.**

So you never have:

```text
renderer thinks ProductGrid exists

but

Remote planner doesn't
```

---

# 5. Composition gives us a concrete reason for the fixed-point loader I mentioned earlier

This is where the Affe work becomes genuinely valuable.

Consider a CMS route:

```text
/case-studies/acme
```

Initially you know the route.

You don't yet know the document.

So:

```text
route
  ↓
Page Surface
  ↓
fetch Page.document
```

Suppose that document contains:

```text
Hero
ProductGrid(category = industrial)
Testimonials(company = acme)
```

Now new requirements appear:

```text
ProductGridSurface(category = industrial)
TestimonialsSurface(company = acme)
```

So loading is naturally staged:

```text
PASS 1

route
 ↓
Page.document requirement
 ↓
fetch document


PASS 2

document arrives
 ↓
Composition resolves Blocks
 ↓
new active Surfaces appear
 ↓
ProductGrid query
Testimonials query
 ↓
fetch concurrently


PASS 3

all requirements satisfied
 ↓
render
```

This is **exactly** the general dependency process we were discussing before.

But Composition gives you a very concrete use case for it.

I'd formalize a generic concept like:

```ts
Surface.plan(...)
```

and:

```ts
Data.satisfy(model, plan)
```

where `satisfy` means:

```text
derive active projections
      ↓
plan missing requirements
      ↓
execute them
      ↓
reduce resulting Messages
      ↓
derive again
      ↓
repeat until stable
```

The client runtime almost already behaves this way because Foldkit Subscriptions re-evaluate after Model changes.

The new primitive is most important for:

```text
SSR
hover prefetch
static generation
tests
server rendering
```

where you want to imperatively drive the Model to the same fixed point that the live runtime would eventually reach.

That's a much better abstraction than Affe's explicit:

```ts
dependsOnParent: true
```

because the dependency can arise from **anything in state**, not just the route hierarchy.

---

# 6. This makes CMS routes especially clean

Don't make every CMS page a route node.

For example, don't generate:

```text
Home
About
Pricing
Foo
Bar
...
```

into the application's route tree.

Instead have one deployed route:

```ts
const CmsPage = Site.route(
  wildcard("slug"),
).pipe(
  Site.to(AppRoute.CmsPage),
  Site.surface(
    PublishedPage,
    route => ({
      slug: route.slug,
    }),
  ),
)
```

`PublishedPage` reads:

```ts
const PublishedPage = App.surface("PublishedPage", {
  params: {
    slug: Slug,
  },

  model: ({ params }) => ({
    page: Data.query(
      PageBySlug,
      { slug: params.slug },
      {
        select: PublishedPageSelection,
      },
    ),
  }),
})
```

The result includes the stored `Composition.Document`.

Then:

```text
RouteSite
    ↓
CmsPage("/about")
    ↓
PublishedPage Surface
    ↓
Page Entity
    ↓
Composition.Document
    ↓
Composition Foldkit plan
    ↓
dynamic Block Surfaces
```

This is a very clean division between application URLs and authored content.

---

# 7. Route layouts and Composition Regions should remain different

This distinction will prevent a lot of future confusion.

### Route layout

```text
ApplicationShell
 └─ StoreShell
     └─ ProductPage
```

These are deployed application concerns.

Navigation.

Auth boundaries.

Providers/services.

Persistent navigation.

Application-level Surfaces.

### Composition Regions

```text
Hero
 └─ actions:
     ├─ Button
     └─ Button
```

These are stored content structure.

Your Composition package explicitly defines a Region as a stored location within a Block where other Blocks go. :chatgpt-content-reference{index="4"}

So don't use:

```text
Composition.Region = router outlet
```

or:

```text
route layout = Composition Block
```

by default.

Instead:

```text
Route Layout
     │
     ├─ header
     │
     ├─ navigation
     │
     ▼
 Composition Renderer
     │
     └─ Document Regions
     │
     ▼
 route footer
```

An application *can* deliberately make its whole shell editable later, but that should be a product choice rather than the foundational architecture.

---

# 8. The `Action` work becomes shared infrastructure

This upcoming package has `actions` reserved on each node already. :chatgpt-content-reference{index="5"}

That fits beautifully with the Affe-inspired manifest idea.

I would make:

```ts
Action.define({
  name: "addToCart",
  Input: Schema.Struct({
    productId: ProductId,
  }),
  toMessage: input =>
    Message.AddedToCart(input),
})
```

a `foldkit-surface` primitive.

Then the same `Action` can be exposed through:

```text
Composition Document
Agent
Page/route manifest
MCP
buttons
forms
devtools
```

while all of them ultimately emit the same Foldkit Message.

So:

```text
Action
   │
   ├── agent tool
   ├── Composition node
   ├── developer UI
   └── route manifest
          │
          ▼
       Message
          │
          ▼
        update
```

Very Foldkit.

I would **not** let the route graph invent its own action abstraction.

---

# 9. Stateful Blocks line up perfectly with Bundles

Composition should also not invent widget state.

A Carousel stored in a document might be:

```text
Node id: x81
Block: Carousel
Props:
  interval: 5000
```

Deployed code:

```ts
Block.fromBundle(CarouselBundle, {
  Props: CarouselProps,

  args: props => ({
    interval: props.interval,
  }),
})
```

and the runtime effectively gets:

```text
Document NodeId
      +
Block.fromBundle
      ↓
Bundle instance keyed by NodeId
```

That means `NodeId` becomes a very useful common identity:

```text
Composition Node
Renderer instance
Bundle instance
Surface instance
SSR static region
DevTools node
```

I would lean into this.

---

# 10. SSR could become exceptionally good

A mostly-static Composition document might be:

```text
Section
├─ Heading
├─ Text
├─ Image
└─ ProductGrid  ← dynamic
```

The renderer already knows which implementations are pure/static and which activate a Surface or Bundle.

So SSR can potentially produce:

```text
Section        SSR.static(nodeId)
Heading        SSR.static(nodeId)
Text           SSR.static(nodeId)
Image          SSR.static(nodeId)

ProductGrid
  ↓
Surface
  ↓
Remote.resume
```

That means a huge authored page could ship:

```text
server HTML for static content

+

only the Foldkit Model/data necessary for
interactive/dynamic Blocks
```

instead of serializing the whole `Composition.Document` to the browser.

That is extremely synergistic with the direction of `foldkit-ssr`.

And the stable Composition node IDs are perfect IDs for those static regions.

---

# 11. I would introduce one unifying internal concept: the **resolved plan**

Not another persisted thing.

Not another Model.

Just an ephemeral derivation:

```text
RouteSite
   +
Model.route
   +
Composition.Document
   +
Catalog
   +
Composition context
          │
          ▼
     Resolved Plan
```

Conceptually:

```ts
interface ResolvedPlan {
  routeChain
  compositionNodes
  surfaces
  bundles
  actions
  staticRegions
  metadata
}
```

Then multiple interpreters consume it:

```text
                     ResolvedPlan
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
       Renderer         Remote           SSR
          │               │               │
          ▼               ▼               ▼
        HTML         requirements      envelope
                          │
                          ▼
                       server
```

And later:

```text
                     ResolvedPlan
                          │
              ┌───────────┴──────────┐
              ▼                      ▼
           Agent                  DevTools
```

This gives you the best part of Affe: **one inspectable application graph**.

But unlike Affe, the graph is derived from Foldkit-native declarations rather than becoming a new runtime.

---

# The revised architecture

I'd now draw the entire system like this:

```text
                         URL
                          │
                          ▼
                  Foldkit Router
                          │
                          ▼
                     AppRoute
                          │
                          ▼
                       Model
                          │
                    RouteSite
                          │
                          ▼
                 active route chain
                          │
                          ▼
                route-level Surfaces
                          │
                          │
                Page Entity / Document
                          │
                          ▼
              foldkit-composition
                 Catalog + Document
                          │
                          ▼
               Composition renderer
                          │
             ┌────────────┼─────────────┐
             ▼            ▼             ▼
       static Blocks  Surface Blocks Bundle Blocks
                          │             │
                          ▼             ▼
                       Remote         Bundles
                          │
                          ▼
                   Remote.Model
                          │
             ┌────────────┴────────────┐
             ▼                         ▼
           view                       SSR
```

This is significantly better than my original `foldkit-page` proposal.

## The main concrete changes I'd make

I would therefore change the roadmap to:

1. **Do not create `foldkit-page`.** Let `foldkit-composition` own the term “page as content.” Call the Affe-derived topology abstraction `Site`/`RouteSite`, or consider extending the existing route layer if it stays small.

2. **Add dynamic Surface collections as a general Surface primitive.** This is what lets arbitrary stored Composition nodes participate normally in Remote, SSR, agents, and diagnostics.

3. **Make the Composition Foldkit renderer produce/derive a shared resolved plan**, not just HTML.

4. **Make Remote/SSR prefetch capable of satisfying a dynamic plan to a fixed point.** Route → Document → Blocks → more Surfaces is the killer use case.

5. **Use `NodeId` as the identity for dynamic Surface/Bundle/static-render instances.**

6. **Put `Action` in `foldkit-surface` and share it across Composition, Agent, and any eventual RouteSite manifest.**

7. **Keep route layouts and Composition Regions distinct.** One is deployed application topology; one is authored stored content.

8. **Let the final DevTools graph cross both boundaries.** This is where everything becomes unusually powerful:

```text
/about
└─ CmsPage
   └─ PublishedPage Surface
      └─ Document page_42
         ├─ Hero#n1
         ├─ Text#n2
         └─ ProductGrid#n3
            └─ ProductGridSurface(category=tools)
               └─ ProductsByCategory
```

That final tree is, I think, the real destination: **Affe's inspectable topology, Foldkit's explicit transitions, Remote's declarative data graph, and Composition's data-authored structure all meeting without any of them stealing ownership from the others.**

And importantly, the `Composition` core can stay exactly as disciplined as it is now: operations remain explicit `Document + Operation → Document/refusal`, rather than adding a hidden runtime to it. :chatgpt-content-reference{index="6"}

Yes. After tracing `foldkit-cms`, `foldkit-cms-drizzle`, the current resumability implementation, `foldkit-ssr`, `Remote.resume`, and `foldkit-remote-server`, the pieces fit together more tightly than the earlier architecture suggested.

The biggest conclusion is:

> **Composition should not become the place where CMS, loading, SSR, or resumability meet. Surface should.**

`foldkit-composition` can remain almost aggressively pure: its Document says what Blocks exist and where; it owns no I/O, state, or rendering. :chatgpt-content-reference{index="0"} The existing ownership table is exactly right: the Document owns page structure, while drafts/saving/revisions/publishing belong to Form/CMS and rendering belongs elsewhere. :chatgpt-content-reference{index="1"}

What I would change from my previous proposal is mainly the **integration layer around Composition**, not Composition itself.

## The whole architecture now looks like this

```text
                           REQUEST /about
                                │
                                ▼
                         Foldkit Router
                                │
                                ▼
                     AppRoute.CmsPage("about")
                                │
                                ▼
                    PublishedPage Surface
                                │
                                ▼
                    Cms.bySlug(PageContent)
                                │
                         Remote requirement
                                │
                                ▼
                  ┌──── foldkit-remote-server ────┐
                  │                               │
                  │ principal / authorization     │
                  │ cms audience visibility       │
                  │ query + entity resolution     │
                  └──────────────┬────────────────┘
                                 │
                                 ▼
                          Page Entity
                         ┌────────────┐
                         │ document   │
                         └─────┬──────┘
                               ▼
                    Composition.Document
                               │
                    Catalog interprets it
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
             ▼                 ▼                  ▼
        Static Block      Surface Block       Bundle Block
             │                 │                  │
             │                 ▼                  ▼
             │               Remote          keyed Submodel
             │                 │              by NodeId
             │                 ▼
             │          RemoteServer
             │
             └─────────────────┼──────────────────┘
                               ▼
                         Foldkit view
                               │
                               ▼
                          foldkit-ssr
                    ┌──────────┴──────────┐
                    ▼                     ▼
               server HTML         resume envelope
                                         │
                                     Remote.resume
                                         │
                                         ▼
                                       browser
```

That's a remarkably coherent stack.

---

# Composition + CMS is already almost perfectly aligned

The CMS model is especially compatible with Composition because a CMS draft is **an unsent Form**, not a partially published row.

For a Page entity, I'd expect essentially exactly what the page-builder design already sketches:

```ts
const Page = Entity.define("Page", Schema.Struct({
  id: PageId,
  title: Schema.String,
  slug: Schema.String,

  document: Composition.Document,

  publishedAt: Schema.NullOr(Schema.String),
})).pipe(
  Cms.roles({
    label: "title",
    slug: "slug",
    published: "publishedAt",
  }),
)
```

The important bit is that the entity stores the **tolerant** Document schema. Unknown/old Blocks survive reads, revisions, restores and editing. Then the value accepted by publishing uses the strict Catalog check:

```ts
const PageInput = Entity.input(Page, Schema.Struct({
  title: Page.fields.title.schema,
  slug: Page.fields.slug.schema,

  document:
    Composition.Document.check(
      Composition.valid(Site)
    ),
}))
```

That tolerant-storage / strict-publish distinction is already explicit in Composition. :chatgpt-content-reference{index="2"} The uploaded example even puts the tolerant codec on the Entity and the strict codec on the publish input. :chatgpt-content-reference{index="3"}

That gives you exactly the right CMS semantics:

```text
author editing
     │
     ▼
possibly-invalid Document
     │
     ▼
CMS autosaved draft
     │
     ├── restore later: okay
     ├── revision: okay
     └── publish
            │
            ▼
    Composition.valid(Site)
            │
       ┌────┴────┐
       │         │
     valid     invalid
       │         │
       ▼         ▼
   publish     stay draft
```

There should be **no special Composition draft model**.

The Builder being the Form control for `document` is the correct design. Its Operations update the control's Document; `Cms.editor` notices the form's authored value changed; CMS's existing rest/autosave mechanism saves it.

That means things like:

```text
insert Hero
move Section
edit Hero.title
undo
edit Text.body
```

are all just edits to one Form key from CMS's perspective.

Very nice.

---

# CMS revisions also require almost nothing special

CMS revisions already store the value that was published/saved.

Therefore a revision naturally includes:

```ts
{
  title,
  slug,
  document
}
```

Restoring revision 17 should do what CMS already says Restore does:

```text
revision value
     │
     ▼
replace current form draft
     │
     ▼
Composition.Document
```

It **does not publish**.

And this fits Composition's tolerance rule beautifully: an old revision containing:

```text
LegacyHero
```

can still load even if today's Catalog no longer knows `LegacyHero`.

The editor can display the unknown-Block placeholder, permit moving/removing it, and prevent publishing until it is migrated/replaced.

That's exactly why the tolerant codec is valuable.

### Migrations should stay outside CMS

I would not make CMS understand Composition migrations.

The boundary should remain:

```text
CMS:
"Here is revision value N."

Composition/application:
"Should I migrate this Document now?"
```

That might occur when opening, explicitly upgrading, or publishing. But CMS shouldn't know what a Block rename means.

---

# Preview is where the architecture becomes unusually elegant

This is perhaps the strongest integration.

`Cms.editor` already supports:

```ts
preview: (value, id) => [
  Remote.patch(...)
]
```

and its `PreviewShown` behavior overlays those patches into Remote **without a request**.

So for a Page:

```ts
const Pages = Cms.content("pages", {
  entity: Page,
  form: PageForm,
  publish: {
    create: CreatePage,
    update: UpdatePage,
  },

  preview: (value, id) => [
    Remote.patch(Page, id, value),
  ],
})
```

Now an author editing:

```text
document = draft version
```

turns Remote's visible Page entity into:

```text
Page:p42

published server value
        +
preview overlay
        =
draft Page
```

And then the application opens its **ordinary visitor route**.

```text
CMS Editor
   │
   │ PreviewShown
   ▼
Remote overlay
   │
   ▼
/about
   │
   ▼
same PublishedPage Surface
   │
   ▼
same Page Selection
   │
   ▼
same Composition renderer
   │
   ▼
same ProductGrid Surface
   │
   ▼
same visitor UI
```

No:

```text
PreviewPageRenderer
PreviewComposition
PreviewDataClient
preview-only route loader
```

That's excellent.

The current `Cms.editor` implementation specifically describes preview as laying the form's value over Remote's store so the application's own views draw it.

That should remain the rule for Composition.

---

# CMS and routing should stay separate

The CMS design explicitly rejected a registry of content types from which routes/navigation are automatically generated.

I agree with that even more after this work.

A code-authored route graph might simply contain:

```ts
const ContentPage = Site.route(
  wildcard("slug"),
).pipe(
  Site.to(AppRoute.ContentPage),

  Site.surface(
    PublishedPage,
    ({ slug }) => ({ slug }),
  ),
)
```

Then `PublishedPage` reads:

```ts
Data.query(
  Cms.bySlug(Pages),
  { slug },
  { select: PageForRendering }
)
```

So:

```text
Code decides:
  "/:slug is a CMS page location"

CMS data decides:
  "about currently names Page p42"

Composition decides:
  "p42 currently consists of these Blocks"
```

Those are three distinct facts.

Do not turn every stored Page row into a route node.

---

# `cms-drizzle` + Remote Server provides the security model Composition needs

This is a major strength of the existing architecture.

A Composition document may contain:

```ts
{
  block: "ProductGrid",
  props: {
    category: "internal-products"
  }
}
```

The existence of that block must **not** imply that its author has magically granted the visitor access to those products.

You already have the correct stacked security model:

```text
Layer 1: Composition Catalog
--------------------------------
Is "ProductGrid" an allowed Block?
Do the props decode?
Does it fit this Region?

Layer 2: CMS audience
--------------------------------
May this principal receive this Page
Document at all?

Layer 3: RemoteServer authorization
--------------------------------
May this principal receive the fields /
entities/query result that ProductGrid asks for?

Layer 4: SSR resumability coverage
--------------------------------
Does the client receive exactly enough
state/capabilities to reproduce the page?
```

These solve different problems.

And your page-builder design already states the critical rule:

> `when` is presentation, not authorization.

That's exactly right.

A stored condition like:

```ts
when: {
  audience: "member"
}
```

may hide something visually.

It cannot secure the underlying content.

Sensitive page Documents belong behind the CMS audience boundary; sensitive Block data belongs behind RemoteServer authorization.

---

# CMS's audience boundary is particularly robust here

`foldkit-cms-drizzle` doesn't merely apply:

```sql
WHERE published = true
```

to one list endpoint.

Its `visible` rule is applied at the data binding so it covers:

```text
direct ID read
relation traversal
ref target
query
```

That matters enormously for Composition.

If a visitor loads `/about`, the public page should be fetched through:

```text
cms.sources
cms.queries
```

not through a raw Page entity Source that accidentally bypasses CMS visibility.

Your current CMS docs are emphatic about this:

```ts
RemoteServer.make({
  entities: [
    ...cms.sources,
  ],

  queries: [
    ...cms.queries,
  ],

  mutations: [
    ...cms.mutations,
  ],
})
```

not:

```ts
source(Db.Page)
```

for the CMS-controlled entity.

So the path becomes:

```text
/:slug
  │
  ▼
Cms.bySlug(Pages)
  │
  ▼
cms query source
  │
  ▼
binding.visible(principal)
  │
  ├── visitor → published only
  └── author  → allowed working content
```

That boundary is stronger than doing auth in a router guard.

---

# Remote Server also makes data Blocks safe by construction

Consider:

```ts
const ProductGrid = Block.fromQuery(
  ProductsByCategory,
  {
    Props: Schema.Struct({
      category: CategoryId,
    }),

    input: props => ({
      category: props.category,
    }),

    selection: ProductCard,
  },
)
```

The Document only stores:

```json
{
  "block": "ProductGrid",
  "props": {
    "category": "shoes"
  }
}
```

Then deployed code turns that into:

```text
ProductsByCategory({ category: "shoes" })
```

and RemoteServer gets semantic requirements.

It can then:

```text
decode Query input
      ↓
execute authorized Query Source
      ↓
get entity refs
      ↓
inspect Product selection
      ↓
authorize requested Product fields
      ↓
read only authorized fields
```

Crucially, `RemoteServer.entity(... authorize ...)` filters fields **before the Source reads them**.

That means a malicious/incorrect Document cannot turn:

```text
ProductGrid
```

into:

```text
SELECT * FROM products
```

unless your deployed Block definition and server authorization already permit that.

That is exactly the right trust boundary.

---

# Mutation results already give you part of Affe's "single flight"

This is another useful realization.

When CMS publishes, `cms-drizzle` performs the publication transaction and returns normalized Remote patches.

So after publishing a Page:

```text
Publish mutation
     │
     ├─ update Page row
     ├─ append Revision
     ├─ remove Draft
     └─ update Entry
            │
            ▼
       MutationResult
       ├─ Page patch
       ├─ Entry patch
       └─ Draft deletion
            │
            ▼
       Remote.Model
```

There doesn't need to be:

```text
POST publish
GET page again
GET entry again
GET draft again
```

just to discover the facts the mutation already knows.

That is basically the normalized-cache equivalent of Affe's `seedLoader`.

It's actually cleaner because it doesn't seed one route loader; it updates the canonical entities every Surface sees.

The remaining Affe-style single-flight opportunity is only for **derived queries that truly need recomputation** after the mutation.

---

# SSR is almost tailor-made for Composition

The page-builder design says:

```text
static Block
    → SSR.static

interactive Block
    → normal resumable Foldkit feature
```

That's the correct split.

For a completely static Composition:

```text
Document

Section
├── Heading
├── Text
└── Image
```

you can render:

```ts
SSR.static(pageId, () =>
  Renderer.render(Site, document)
)
```

Conceptually.

The important property of `SSR.static` is:

> The region belongs to the server.

The browser adopts the HTML and does not re-render the contents.

So for an all-static page:

```text
SERVER
Page Document
    ↓
Composition Renderer
    ↓
HTML
    ↓
SSR.static

                    CLIENT
                       │
                       ▼
                 adopts markup
                       │
             Document never sent
```

This validates the page-builder design's claim that a fully static composed page does **not** need its Document in the resume envelope.

And `foldkit-ssr` enforces that static really means static: it refuses Message bindings inside an `SSR.static` region with `BindingInStaticRegion`.

That's exactly the safety check you'd want.

---

# Mixed pages have one important nuance

Suppose:

```text
Section
├── Heading         static
├── Text            static
├── ProductGrid     Remote/data
└── Carousel        stateful Bundle
```

You cannot simply say:

> "never send the Document."

Because the browser needs enough structure to know that the interactive ProductGrid and Carousel exist and where they belong.

For **v1**, I would take the simple, correct route:

```text
fully static Composition
→ Document need not cross

mixed/interactive Composition
→ Page/document can cross through Remote.resume
```

Because the Page Surface already selected `document`, `Remote.resume(Data)` naturally captures it as part of the Remote state needed by the active Surface.

Later you could optimize this into a pruned client-side composition manifest:

```text
static subtree → server-owned opaque region
interactive ancestors/nodes → resumed
```

but I would absolutely **not build that initially**.

It is an optimization, and doing it prematurely risks introducing a second representation of the Document.

---

# Resumability makes Surface even more central

This is the strongest confirmation of the Surface-based architecture.

The current resumability implementation isn't just a design anymore. `packages/ssr/src/resumable.ts` and `listen.ts` implement:

```text
Resume.builder(h)
Resume.view(...)
Resume.listen(...)
```

The server renderer records event bindings like:

```html
<button data-foldkit-plus-on-click="12">
```

where the binding identifies an encoded Foldkit Message.

Before Foldkit boots:

```text
click/input
    ↓
delegated listener
    ↓
decode Message
    ↓
queue
    ↓
boot/hydrate
    ↓
replay Message through update
```

So the resumability model is **Message resumability**, not component resumability.

That is a particularly good fit for Composition actions.

A Block button can ultimately mean:

```text
stored ActionRef
      ↓
deployed Action
      ↓
existing Message
      ↓
Resume binding
      ↓
update
```

No serialized callback.

No component closure.

No block-specific hydration protocol.

---

# And SSR checks the Surface's other half too

This is easy to miss but very important.

A Surface says both:

```text
what I may read
+
what Messages I may cause
```

SSR uses those for resumability coverage.

For an interactive Composition Block:

```ts
Block.fromSurface(CartSummary, ...)
```

its Surface already says:

```text
reads:
  cart items
  prices

messages:
  RemovedItem
  CheckedOut
```

The Composition renderer can render using `Resume.view` / resumable `h`.

Then SSR can verify:

```text
the rendered button dispatches CheckedOut

AND

CartSummary actually allows CheckedOut
```

So the stored Composition does not gain arbitrary Message authority just because it can name a Button.

That's an excellent capability boundary.

---

# This reinforces the need for dynamic Surface instances

And now we get to what I think is the **main missing primitive**.

Current `SSR.plan` effectively takes:

```ts
surfaces: ReadonlyArray<ActiveSurface<Model>>
```

and `Data.wiring` similarly works from declared active Surfaces.

But a Composition Document might contain:

```text
ProductGrid#n4(category=shoes)
ProductGrid#n9(category=hats)
CartSummary#n12
```

Those are only known after reading the Document.

We need a first-class way to express:

```text
one Surface definition
       ×
zero-to-many instances derived from Model
```

I would now prioritize something along the lines of:

```ts
Surface.each(
  ProductGridSurface,
  {
    over: PageDocument,

    key: node => node.id,

    params: node => ({
      category: node.props.category,
    }),
  },
)
```

Conceptually producing:

```text
ProductGridSurface@n4({ category: shoes })
ProductGridSurface@n9({ category: hats })
```

This shouldn't live in Composition.

It should be a generic Surface concept because it also applies to:

```text
dashboard widgets
plugin instances
dynamic editors
per-row tools
tab workspaces
document nodes
```

And the identity should be the Composition `NodeId`.

---

# I would generalize SSR from "Surface array" to "Surface plan"

Something approximately like:

```ts
type SurfacePlan<Model> =
  | ActiveSurface<Model>
  | ActiveSurfaceCollection<Model>
```

or more abstractly:

```ts
interface SurfaceSource<Model> {
  active(model: Model): ReadonlyArray<SurfaceInstance<Model>>
}
```

Then all of these could consume the same thing:

```text
Data.wiring(...)
Remote retention
SSR coverage
Remote.resume
Agent manifest
DevTools
```

That would make Composition integration almost mechanical.

Instead of every subsystem learning about Documents:

```text
Composition
   ↓
SurfaceSource
   ↓
everyone else already speaks Surface
```

That's the seam I would invest in.

---

# Deferred boot is especially interesting for composed pages

Current SSR supports:

```ts
start: "now"
start: "idle"
start: "on-interaction"
```

Before boot, encoded Message bindings can already answer user events.

For a marketing page:

```text
Hero
Text
Image
ProductGrid
AddToCart button
```

the experience could be:

```text
server HTML appears
     │
     │ no Foldkit runtime yet
     │
user clicks Add To Cart
     │
     ▼
Resume.listen decodes AddedToCart(...)
     │
     ▼
boot application
     │
     ▼
replay AddedToCart through update
```

That's genuinely useful for Composition-heavy sites where 95% of a page is static.

And `Remote.resume` has a particularly good integration here: it advertises its own read/live/retention subscriptions as safe to start late when their semantics permit it.

So Remote doesn't make every page artificially fail `start: "on-interaction"` just because a read Subscription technically exists.

---

# Bundle-backed Blocks fit resumability very naturally too

Your page-builder design already proposes:

```ts
const Carousel = Block.fromBundle(
  CarouselBundle,
  ...
)
```

with each instance keyed by `NodeId`.

And you already have:

```ts
Bundle.lazy(...)
```

which keeps a Bundle's update/view body out of the boot chunk.

So a Composition document can naturally become:

```text
Catalog declaration
    │
    └─ knows Carousel exists
         │
         ▼
Document:
  Carousel#abc
         │
         ▼
Bundle instance:
  key = NodeId("abc")
         │
         ▼
lazy body loaded
only when needed
```

This is far more Foldkit-native than inventing a “hydrated block component” abstraction.

---

# No-JS/server fallback also composes

The resumability layer supports:

```ts
fallback: "server"
```

for forms whose `OnSubmit` names a Message.

The browserless path is:

```text
<form>
   │
   ▼
POST same URL
   │
   ▼
SSR.handle
   │
   ▼
decode Message
   │
   ▼
update(model, message)
   │
   ▼
run Commands
   │
   ▼
fold resulting Messages
   │
   ▼
render new page
```

This is important for Composition Blocks containing actual forms.

If a Block's behavior eventually ends in an application Message, it can use the same fallback.

No special:

```text
Composition Action endpoint
```

is required.

And if those Commands need `RemoteClient`, the SSR server resources provide that normal Effect capability.

One caveat: things like CMS's timer-based autosave obviously require a running runtime; the server fallback is for concrete posted actions, not for emulating long-lived Subscriptions on a scriptless page.

---

# There is one significant SSR gap revealed by Composition

This is the part I'd prioritize architecturally.

A CMS page can have **staged data discovery**:

```text
STEP 1
route says /about

STEP 2
fetch Page by slug

STEP 3
now we know its Composition.Document

STEP 4
Document reveals:
  ProductGrid(category=shoes)
  Testimonials(company=acme)

STEP 5
those reveal new Remote requirements

STEP 6
fetch them in parallel

STEP 7
render
```

The **browser runtime naturally handles this** because Subscriptions re-evaluate as the Model changes.

But server rendering is deliberately synchronous after its Model has been prepared.

The SSR design explicitly says:

> data is loaded before rendering, using `Data.prefetch`; SSR does not introduce an async render path.

That philosophy is good.

The missing piece is therefore not Suspense.

It's:

> **How do I prepare the server Model to the fixed point required by the page before calling the synchronous renderer?**

---

# I think `foldkit-ssr` needs a preparation seam

Something roughly like:

```ts
SSR.plan(App, {
  id: "cms-page",

  prepare: model =>
    Site.prepare(model),

  state: ...,
  surfaces: ...,
  parts: [
    Remote.resume(Data),
  ],
})
```

I'm not committed to that exact API.

The semantics matter more:

```text
init
 ↓
Model₀
 ↓
prepare Effect
 ↓
Model₁
 ↓
sync render
 ↓
resume envelope
```

Then the Composition-aware prepare operation can reach a fixed point:

```text
Model₀
 │
 │ Page document missing
 ▼
prefetch Page Surface
 │
 ▼
Model₁
 │
 │ Document now reveals Block Surfaces
 ▼
derive active Composition Surfaces
 │
 ▼
prefetch their Remote requirements
 │
 ▼
Model₂
 │
 │ no new requirements
 ▼
READY
```

Potentially:

```ts
Site.prepare(Data, model)
```

or:

```ts
Data.satisfy(model, surfaces)
```

would be an even better home if this becomes general.

---

# I prefer `Data.satisfy` over route loaders here

The general algorithm would be:

```ts
let model = initial

for (;;) {
  const surfaces = surfacePlan.active(model)

  const next =
    yield* Data.prefetch(
      model,
      projectionsOf(surfaces),
    )

  if (requirementsStable(model, next)) {
    return next
  }

  model = next
}
```

with a finite-round safety check.

That handles:

```text
route → page
page → composition
composition → block surface
block surface → relation
relation → another entity
```

without encoding those dependencies into a route hierarchy.

This is actually a more general version of Affe's loader waves.

Affe:

```text
route dependency graph
→ execution waves
```

Foldkit Plus:

```text
declarative state/data graph
→ satisfy until requirements close
```

I think the second is stronger.

---

# Remote Server should remain completely unaware of Composition

Very important.

Don't add:

```ts
RemoteServer.composition(...)
RemoteServer.block(...)
```

It doesn't need them.

The boundary should remain:

```text
Composition:
"this ProductGrid instance needs this Surface/Query"

Remote:
"these semantic requirements are missing"

RemoteServer:
"for this principal, here is what those requirements may resolve to"
```

RemoteServer already owns precisely the right things:

```text
semantic requirement interpretation
field authorization
batching/de-duplication
nested relation traversal
normalized results
```

while explicitly *not* owning:

```text
HTTP
authentication
database
rendering
routing
```

Composition should not disturb that.

---

# In fact, the security story becomes unusually strong

A visitor can never get data merely because a CMS author dragged a Block onto a page.

The full chain is:

```text
author inserts ProductGrid
        │
        ▼
Composition validates
"ProductGrid is allowed here"
        │
        ▼
CMS publishes document
"visitor may receive this page"
        │
        ▼
Block definition interprets props
"category = internal"
        │
        ▼
Remote creates semantic requirement
        │
        ▼
RemoteServer authorizes principal
        │
        ├── allowed → data
        │
        └── withheld → unavailable
```

That's exactly the kind of layered architecture you want for an extensible CMS.

---

# The revised role of the Affe-inspired `Site` layer

After looking at all this, I'd make the route-topology package **even thinner**.

It should probably own only:

```text
deployed route hierarchy
typed URLs
layouts
route-level active Surfaces
route metadata
route inspection
target-page prefetch hints
```

It should **not** own:

```text
loaders
cache
mutation invalidation
CMS page registry
Composition Document
server endpoints
SSR state
```

The entire downstream graph can then look like:

```text
                          Surface graph
                       /        |        \
                      /         |         \
               RouteSite   Composition    CRUD/CMS
                    \           |           /
                     \          |          /
                      └─────────┼─────────┘
                                ▼
                              Remote
                                │
                                ▼
                         RemoteServer
                                │
                                ▼
                               data
```

while:

```text
Surface graph
     │
     ├────────► SSR coverage/resume
     ├────────► Agent capabilities
     ├────────► DevTools
     └────────► Remote retention/fetch
```

That looks increasingly like the unifying architecture of Foldkit Plus.

---

## The one shared abstraction I'd work on next

If I had to choose one design problem before implementing the Affe-inspired router work, I would focus on this:

> **How do we represent an inspectable, dynamically derived collection of Surface instances?**

Because solving that gives you all of these at once:

| Consumer | What dynamic Surfaces unlock |
|---|---|
| Composition | Every stored Block can activate its real Surface with `NodeId` identity |
| Remote | Block requirements fetch/coalesce/retain normally |
| SSR | Coverage sees exactly the interactive Blocks the page contains |
| Resumability | Bindings are checked against the Messages those Blocks may cause |
| `Remote.resume` | Only data needed by those concrete Block instances crosses |
| Deferred boot | Remote can declare those entries safely deferrable |
| Agent | Tools can see what capabilities the current composed page exposes |
| DevTools | Route → Document → Block → Surface → data becomes inspectable |
| Site/router | Same abstraction expresses route-level Surface activation |

Once that exists, I would add the server-side **prepare/satisfy-to-fixed-point** operation.

Those two primitives—

```text
dynamic Surface families
+
server-side Surface/data satisfaction
```

—are, I think, the actual missing infrastructure needed to combine the best of Affe with the architecture you already have.

Everything else—CMS drafts, revisions, preview, audience policy, normalized mutation results, Remote authorization, SSR handoff, static erasure, lazy Bundles, preboot Messages—is surprisingly already in place.

I think the cleanest primitive is **`Surface.each`**, backed by a small generalization of the current `ActiveSurface` concept.

The important semantic distinction would be:

```text
Surface.at / Surface.when
    one Surface definition
    → 0 or 1 active instance

Surface.each
    one Surface definition
    → 0 to N keyed active instances
```

That fits the existing project extremely naturally. `Bundle.withEach` already gives you keyed dynamic state-machine instances; `Surface.each` would be the equivalent for **dynamic observation/capability instances**.

## The API I would want

For Composition, I'd like the normal path to look roughly like this:

```ts
const CmsPage = Surface.when(
  PublishedPage,
  App.model.route,
  AppRoute.Page,
  route => ({ slug: route.slug }),
)

const ProductGrids = Surface.each(
  ProductGridSurface,
  {
    from: CmsPage,

    instances: ({ page }) =>
      RemoteData.value(page)
        ? Composition.nodesOf(
            Site,
            page.value.document,
            ProductGrid,
          ).map(node => ({
            key: node.id,

            params: {
              category: node.props.category,
            },
          }))
        : [],
  },
)
```

Conceptually:

```text
CmsPage
  │
  │ projected value contains Composition.Document
  ▼
Surface.each
  │
  ├── ProductGrid#node-3
  │     params = { category: "shoes" }
  │
  ├── ProductGrid#node-8
  │     params = { category: "hats" }
  │
  └── ProductGrid#node-17
        params = { category: "sale" }
```

Every one is the **same Surface contract**, instantiated with different params.

No new state.

No fetching.

No runtime registry.

No renderer behavior.

Just pure derivation from the Model.

---

# Why `from:` should be another Surface

This is the part I think makes the design unusually good.

A naive API would be:

```ts
Surface.each(
  ProductGridSurface,
  model => ...
)
```

But that makes the source opaque.

You already deliberately improved:

```ts
Surface.at(...)
```

with:

```ts
Surface.when(...)
```

because `when` says *why* a Surface is active in inspectable data.

I wouldn't throw that property away for dynamic collections.

Instead:

```ts
Surface.each(ChildSurface, {
  from: ParentSurface,
  instances: parentModel => ...
})
```

means:

> These Surface instances exist because this other declared Surface produced this data.

That gives you a real dependency graph:

```text
Route
  ↓
PublishedPage Surface
  ↓
Page Entity
  ↓
Composition.Document
  ↓
ProductGrid Surface instances
```

And critically, it solves the loading problem.

If the Page isn't loaded yet:

```text
PublishedPage
    ↓
RemoteData.Loading
```

then:

```ts
instances(...)
```

returns `[]`.

But `Surface.each` knows that `PublishedPage` itself is the prerequisite.

So Remote still knows:

```text
first satisfy PublishedPage
```

even though no ProductGrid instances exist yet.

Once the Page arrives:

```text
Model changes
    ↓
Surface.each re-evaluates
    ↓
ProductGrid instances appear
    ↓
their requirements become active
```

That's essentially dependency-driven loader waves without introducing loaders.

---

# I would generalize the internal type slightly

Today you effectively have:

```ts
interface ActiveSurface<Root> {
  name: string
  owner: object
  messages: readonly string[]

  projectionOf(
    model: Root,
  ): Projection<Root, unknown> | undefined
}
```

That's inherently a **zero-or-one** abstraction.

I'd preserve it, but introduce a common abstraction above it:

```ts
interface SurfaceInstance<
  Root,
  Model = unknown,
  Params = unknown,
> {
  readonly key: string

  readonly surface: Surface<
    Root,
    Model,
    any,
    Params
  >

  readonly params: Params

  readonly projection: Projection<
    Root,
    Model
  >
}
```

and:

```ts
interface SurfaceSource<Root> {
  readonly name: string
  readonly owner: object

  readonly instancesOf: (
    model: Root,
  ) => ReadonlyArray<
    SurfaceInstance<Root>
  >
}
```

Then:

```text
ActiveSurface
    implements SurfaceSource
    with zero or one instance

SurfaceFamily
    implements SurfaceSource
    with zero or many instances
```

So you haven't really introduced a second concept.

You've generalized:

```text
ActiveSurface
```

into:

```text
source of active Surface instances
```

---

# Existing `Surface.at` becomes trivial

Conceptually:

```ts
Surface.at(ProjectPage, model => {
  if (model.route._tag !== "Project")
    return undefined

  return {
    projectId: model.route.projectId,
  }
})
```

would resolve as:

```ts
{
  instancesOf(model) {
    const params = ...

    if (params === undefined)
      return []

    return [{
      key: "default",
      surface: ProjectPage,
      params,
      projection:
        ProjectPage.projection(params),
    }]
  }
}
```

`Surface.when` is the same except its activation remains inspectable:

```text
route
path: ["route"]
tag: "Project"
```

Nothing breaks conceptually.

---

# And `Surface.each` becomes the obvious N case

Something close to:

```ts
Surface.each(
  ProductGridSurface,
  {
    from: CmsPage,

    instances: page => [
      {
        key: "node-a",
        params: {
          category: "shoes",
        },
      },

      {
        key: "node-b",
        params: {
          category: "hats",
        },
      },
    ],
  },
)
```

returning something like:

```ts
SurfaceFamily<
  AppModel,
  typeof ProductGridSurface
>
```

with:

```ts
family.instancesOf(model)
```

yielding:

```ts
[
  {
    key: "node-a",
    surface: ProductGridSurface,
    params: { category: "shoes" },
    projection: ...
  },

  {
    key: "node-b",
    surface: ProductGridSurface,
    params: { category: "hats" },
    projection: ...
  }
]
```

I'd require **stable string keys**.

For Composition:

```text
key = NodeId
```

which is exactly what you want.

---

# Don't concatenate identity into a magic string

Internally I would keep identity structured.

Something like:

```ts
interface SurfaceInstanceId {
  readonly surface: string
  readonly key?: string
}
```

or eventually:

```ts
interface SurfaceInstanceId {
  readonly surface: string
  readonly key: string | null
  readonly parent?: SurfaceInstanceId
}
```

rather than:

```text
"ProductGrid:node-123"
```

as the semantic representation.

DevTools can display that as:

```text
ProductGrid[node-123]
```

but consumers shouldn't parse strings.

This becomes useful later for:

```text
route/project
    ↓
composition/node-123
    ↓
surface/ProductGrid
```

---

# I would probably make `ActiveSurface` generic in its projected Model too

Right now it erases that to `unknown`.

I'd change:

```ts
ActiveSurface<Root>
```

to:

```ts
ActiveSurface<
  Root,
  Model = unknown,
>
```

so:

```ts
Surface.when(PublishedPage, ...)
```

can infer:

```ts
ActiveSurface<
  AppModel,
  PublishedPageModel
>
```

Then `Surface.each` gets the parent value strongly typed:

```ts
Surface.each(
  ProductGridSurface,
  {
    from: CmsPage,

    instances: page => {
      // page is exactly PublishedPage's projected Model
    },
  },
)
```

No manual type annotation.

That's a small API improvement with a large payoff.

---

# I'd make `Surface.each` explicitly dependent on its source

Internally its shape should probably be more like:

```ts
interface SurfaceFamily<
  Root,
  ChildModel = unknown,
> extends SurfaceSource<Root> {
  readonly from: ActiveSurface<
    Root,
    unknown
  >

  readonly messages: readonly string[]

  readonly instancesOf: (
    model: Root,
  ) => ReadonlyArray<
    SurfaceInstance<
      Root,
      ChildModel
    >
  >
}
```

The important bit is `from`.

That allows consumers to distinguish:

```text
requirements needed to discover instances
```

from:

```text
requirements of discovered instances
```

This is the basis of the fixed-point behavior.

---

# Remote integration could then be extremely small

Currently:

```ts
Data.subscriptions({
  project: ProjectAt,
  comments: CommentsAt,
})
```

could become:

```ts
Data.subscriptions({
  page: CmsPage,
  productGrids: ProductGrids,
  carts: CartBlocks,
})
```

where the value type becomes:

```ts
ActiveSurface<Root>
| SurfaceFamily<Root>
| Surface<Root, any, any, void>
```

or preferably:

```ts
SurfaceSource<Root>
| Surface<Root, any, any, void>
```

Then Remote does something approximately like:

```ts
for (const source of sources) {
  for (const instance of
    Surface.instances(source, model)) {

    requirements.push(
      instance.projection.metadata
    )
  }
}
```

with one important addition:

> A family must also include the requirements of its `from` Surface.

So before Page is loaded:

```text
ProductGrids.instances = []
```

but the family still contributes:

```text
CmsPage projection requirements
```

which causes the Page fetch.

After that fetch settles:

```text
ProductGrids.instances = [n1, n2, n3]
```

and their requirements join the plan.

---

# That naturally gives you the fixed-point algorithm

Now `Data.satisfy` becomes almost embarrassingly simple conceptually.

```ts
yield* Data.satisfy(
  model,
  {
    page: CmsPage,
    products: ProductGrids,
    cart: CartBlocks,
  },
)
```

means:

```text
resolve Surface sources
        ↓
collect requirements
        ↓
anything missing?
   │             │
  yes            no
   │             │
   ▼             ▼
prefetch         done
   │
   ▼
new Model
   │
   └────── repeat
```

For the CMS page:

```text
ROUND 1

CmsPage
  → PageBySlug

ProductGrids
  → depends on CmsPage
  → no instances yet

fetch Page


ROUND 2

CmsPage
  → satisfied

ProductGrids
  → document now exists
  → ProductGrid[n1]
  → ProductGrid[n2]

fetch products


ROUND 3

all satisfied
→ render
```

This is much more general than:

```ts
dependsOnParent: true
```

because this same mechanism works for things that aren't routes.

---

# SSR then consumes exactly the same source

Current SSR wants:

```ts
surfaces: [
  PostPageAt,
]
```

I'd let it accept:

```ts
surfaces: [
  CmsPage,
  ProductGrids,
  CartBlocks,
]
```

or perhaps a record for better naming:

```ts
surfaces: {
  page: CmsPage,
  productGrids: ProductGrids,
  carts: CartBlocks,
}
```

Then SSR coverage can inspect each **actual instance**.

For example:

```text
ProductGrid[node-7]

activation:
  via CmsPage
  via Page.document

reads:
  Remote.ProductsByCategory("shoes")

messages:
  ProductSelected
```

That is dramatically more useful than:

```text
ProductGrid
active = true
```

---

# `Remote.resume` benefits automatically

Because `Remote.resume(Data)` already captures what active Surface projections require.

With `Surface.each`, instead of:

```text
active Surfaces:
  ProductGrid
```

it gets:

```text
ProductGrid[n4]
ProductGrid[n9]
ProductGrid[n17]
```

and unions their Remote requirements.

Suppose two blocks ask for:

```text
ProductGrid[n4]
category = shoes

ProductGrid[n9]
category = shoes
```

Remote can still deduplicate/coalesce them.

Suppose the selections overlap:

```text
n4 → Product [id, name]
n9 → Product [id, price]
```

Remote's existing normalized/coalescing machinery can produce:

```text
Product [id, name, price]
```

Nothing about `Surface.each` needs to know this.

That's exactly the kind of compositional separation you want.

---

# Composition itself can then provide a very nice adapter

The low-level API should stay generic.

But `foldkit-composition/foldkit` could turn:

```ts
Block.fromSurface(...)
```

into these families automatically.

Imagine:

```ts
const ProductGrid = Block.fromSurface(
  ProductGridSurface,
  {
    Props: Schema.Struct({
      category: CategoryId,
      columns: Schema.Number,
    }),

    params: props => ({
      category: props.category,
    }),
  },
)
```

Then with:

```ts
const CmsPage = Surface.when(
  PublishedPage,
  App.model.route,
  AppRoute.Page,
  route => ({
    slug: route.slug,
  }),
)
```

you could potentially just write:

```ts
const PageSurfaces =
  Composition.surfaces(
    Site,
    CmsPage,
    page => page.page.document,
  )
```

or even eventually:

```ts
const Page =
  Composition.at(
    Site,
    CmsPage,
    page => page.page.document,
  )
```

and derive:

```ts
Page.surfaces
```

containing all the dynamic Surface-backed Blocks.

So the high-level developer never writes:

```ts
Surface.each(...)
```

for every CMS Block.

The Catalog already knows:

```text
ProductGrid → ProductGridSurface
CartSummary → CartSummarySurface
Carousel → CarouselBundle
Heading → static
```

The adapter can compile that.

---

# Something like this would be very compelling

```ts
const CmsPage = Surface.when(
  PublishedPage,
  App.model.route,
  AppRoute.Page,
  route => ({
    slug: route.slug,
  }),
)

const ComposedPage = Composition.at(Site, {
  from: CmsPage,

  document: ({ page }) =>
    RemoteData.value(page)?.document,
})
```

Then:

```ts
Data.wiring({
  page: CmsPage,
  ...ComposedPage.surfaces,
})
```

SSR:

```ts
SSR.plan(App, {
  id: "cms-page",

  state: Projection.pick(
    App.model.route,
  ),

  surfaces: [
    CmsPage,
    ...ComposedPage.surfaces,
  ],

  parts: [
    Remote.resume(Data),
  ],
})
```

Rendering:

```ts
ComposedPage.view(model, h)
```

And perhaps preparation:

```ts
yield* Data.satisfy(
  model,
  [
    CmsPage,
    ...ComposedPage.surfaces,
  ],
)
```

That's starting to look very seamless.

---

# It also works perfectly for CMS preview

This is important because no alternate abstraction is needed.

CMS preview overlays:

```text
draft Page.document
```

into Remote.

Then:

```text
CmsPage projection changes
       ↓
Surface.each sees new Document
       ↓
different Block instances appear
       ↓
different Remote requirements appear
       ↓
preview uses exact same infrastructure
```

Say the published Document contains:

```text
Hero
Text
```

and the draft adds:

```text
ProductGrid(category = shoes)
```

Then `PreviewShown` gives:

```text
Remote overlay
     ↓
CmsPage now projects draft document
     ↓
ProductGrids family:
  [] → [ProductGrid#n7]
     ↓
Remote starts ProductsByCategory(shoes)
```

No preview-specific loader logic whatsoever.

That's extremely good.

---

# It also makes Composition conditions trivial

Suppose:

```ts
node.when = {
  audience: "member"
}
```

`Composition.surfaces(...)` simply excludes that node if the supplied Composition context says it is hidden.

So:

```text
Document nodes
      +
context
      ↓
visible nodes
      ↓
Surface.each instances
```

No hidden Block means no Remote requirement.

Again, authorization remains server-side, but you also avoid unnecessary requests for presentation-hidden Blocks.

---

# Stateful Blocks should remain `Bundle.withEach`

This creates a pleasing symmetry.

```text
Composition node kind
       │
       ├── pure/static
       │      → ordinary renderer
       │
       ├── reads/app messages
       │      → Surface.each
       │
       └── owns state machine
              → Bundle.withEach
```

Both dynamic forms are keyed by:

```text
NodeId
```

So:

```text
ProductGrid#abc
Surface instance key = abc

Carousel#xyz
Bundle instance key = xyz
```

That makes NodeId the stable cross-system identity without adding another identity system.

---

# I would not make it `Surface.collection`

I thought about:

```ts
Surface.collection(...)
```

but I think `each` is better.

There's a nice vocabulary emerging:

```ts
Surface.at(...)
Surface.when(...)
Surface.each(...)

Bundle.withChild(...)
Bundle.withEach(...)
```

`each` immediately communicates:

> instantiate this same contract for each of these things.

`collection` sounds more like the Surface's *data* is a collection, which isn't what we mean.

---

# Nor would I return `ActiveSurface[]` directly

An API like:

```ts
(model) => [
  Surface.at(...),
  Surface.at(...),
]
```

looks easy but loses the most important information:

```text
why these instances exist
```

and:

```text
what must be loaded before they can exist
```

You want `Surface.each` to be an inspectable **relationship**.

Not merely an array factory.

---

# And I wouldn't fake it by combining everything into one Projection

Another tempting implementation is:

```text
three ProductGrids
        ↓
combine their projections
        ↓
one ActiveSurface
```

That would probably make Remote fetching work.

But you'd lose:

```text
NodeId identity
per-instance params
DevTools explanation
agent capability attribution
SSR diagnostics
which node caused which requirement
```

So I would keep actual instances first-class.

Remote can union them when it wants to.

---

# The deeper abstraction is a tiny Surface graph algebra

After this addition, Surface basically has three constructors for activity:

```text
Surface.at
──────────
Model → 0/1 Surface

Surface.when
────────────
tagged Model state → 0/1 Surface
with inspectable activation

Surface.each
────────────
active projected state → 0/N keyed Surfaces
```

Which lets you build:

```text
route
  │
  ▼
page
  │
  ▼
document
  │
  ├── block
  │    └── Surface
  │
  └── block
       └── Surface
```

without Surface ever becoming a runtime.

That's probably the right abstraction for this project.

## My concrete v1

I would start with only this:

```ts
Surface.each(
  childSurface,
  {
    from: activeParentSurface,

    instances:
      parentModel =>
        readonly {
          key: string
          params: ChildParams
        }[],
  },
)
```

plus the internal types:

```ts
SurfaceInstance
SurfaceSource
SurfaceFamily
```

and make:

```ts
Surface.at(...)
Surface.when(...)
Surface.each(...)
```

all consumable anywhere a `SurfaceSource` is accepted.

Then update only:

```text
Remote.subscriptions
Remote.wiring
Remote.resume

SSR.plan / inspect

Data.explain
DevTools / Module later
```

to resolve `SurfaceSource`s instead of assuming every declaration is zero-or-one.

**After that**, add:

```ts
Data.satisfy(model, surfaceSources)
```

for SSR/prefetch/static generation.

I think those two changes would create the exact seam the entire rest of `foldkit-plus` has been converging toward:

> **Surfaces aren't just named screens. They're inspectable, dynamically instantiated capability contracts derived from application state.**

And Composition becomes the first killer use case rather than a special case that distorts the abstraction.



# Foldkit Plus Routing / Site Design

## 1. Thesis

Foldkit Plus should take the parts of Affe that Foldkit is genuinely missing:

```text
real route hierarchy
stable route identity
nested layouts
route-chain inspection
target/prefetch planning
SSR route planning
route metadata
navigation coordination
single-flight mutation/revalidation
```

without taking the parts that would duplicate Foldkit Plus:

```text
route-owned loaders
route-owned cache
route-owned async state
route-owned data dependency graph
route-owned server APIs
second navigation runtime
```

The resulting architecture should be:

```text
                    URL
                     │
                     ▼
               Foldkit Router
          bidirectional URL semantics
                     │
                     ▼
                 AppRoute
                     │
                     ▼
                   Model
                     │
             ┌───────┴────────┐
             ▼                ▼
         RouteSite        Composition
      deployed topology    stored topology
             │                │
             └───────┬────────┘
                     ▼
               SurfaceSources
                     │
            ┌────────┼─────────┐
            ▼        ▼         ▼
          Remote    SSR      Agent/Tools
            │
            ▼
       RemoteServer
```

The core rule remains the one already emerging in Foldkit Plus:

> **Router says where the application is. Surface says what that state makes observable/capable. Remote says what server facts those observations require.**

Affe's biggest architectural win—the inspectable application graph—can therefore be reproduced without importing Affe's ownership model.

---

# 2. The new foundational abstraction: `SurfaceSource`

The addition of dynamic Surface instances is what makes the rest of the architecture fall into place.

Conceptually:

```ts
interface SurfaceInstance<Root> {
  readonly key: string
  readonly surface: Surface<Root, unknown, unknown, unknown>
  readonly params: unknown
  readonly projection: Projection<Root, unknown>
}

interface SurfaceSource<Root> {
  readonly owner: object

  instancesOf(
    model: Root
  ): ReadonlyArray<SurfaceInstance<Root>>
}
```

Then the current activation primitives become specializations:

```text
Surface.at
    Model → 0 or 1 instance

Surface.when
    tagged Model state → 0 or 1 instance
    + inspectable reason

Surface.each
    parent/state → 0 to N keyed instances
```

This gives Foldkit Plus an inspectable **dynamic capability graph**.

Everything downstream should progressively accept `SurfaceSource` rather than assuming that a declared Surface has at most one current instance.

That includes:

```text
Data.subscriptions
Data.wiring
Remote.resume
SSR.plan
SSR.inspect
Data.explain
Agent
DevTools
future Site planner
```

A static `ActiveSurface` remains useful and backwards-compatible; internally it is simply a `SurfaceSource` whose cardinality is 0/1.

---

# 3. Add `foldkit-site`, not `foldkit-page`

`Page` now has a strong meaning in the upcoming Composition/CMS system: stored page content.

The deployed route topology is a different thing.

I would introduce an optional package:

```text
foldkit-site
```

with:

```ts
import { Site } from "foldkit-site"
```

Its job is narrow:

> **Describe the deployed structural topology of an application and compile that description into existing Foldkit routing, Surface, rendering, prefetch, and SSR primitives.**

It must remain pure.

It owns no Model.

It owns no cache.

It runs no Effects.

It dispatches no Messages.

It starts no Commands.

It is essentially Affe's route graph stripped of runtime ownership.

---

# 4. A Site node

A node should be a stable first-class value.

Conceptually:

```ts
const Project = Site.page(
  AppRoute.Project,
  projectRoute,
).pipe(
  Site.surface(
    ProjectPage,
    route => ({
      projectId: route.projectId,
    }),
  ),

  Site.view(ProjectView),

  Site.title(({ project }) =>
    project.name
  ),
)
```

Its structure is roughly:

```ts
interface SiteNode {
  id
  route
  surfaceSources
  view
  layout
  metadata
  parent
}
```

But importantly, none of those fields become runtime state.

They're declarations.

---

# 5. Keep Foldkit Router as the URL algebra

Do not replace Foldkit's biparser.

This stays foundational:

```text
URL
 ⇅
typed AppRoute
```

The Site system should compile to—or refer to—Foldkit Router values.

The existing Foldkit strength remains:

```ts
literal("projects")
slash(schemaSegment("projectId", ProjectId))
Route.query(...)
Route.mapTo(AppRoute.Project)
```

This means Site gains Affe's hierarchy without recreating a URL parser.

There are two useful construction levels.

The explicit version:

```ts
const Project = Site.route(
  projectRouter,
  AppRoute.Project,
)
```

where `projectRouter` is an ordinary Foldkit Router.

And eventually a convenience tree syntax:

```ts
const Projects = Site.branch(
  literal("projects"),
).pipe(
  Site.children([
    Site.page(
      schemaSegment("projectId", ProjectId),
      AppRoute.Project,
    ),
  ]),
)
```

which simply compiles down to Foldkit biparsers.

The second API should only exist if it genuinely reduces repetition. The first gives the package a minimal foundation without creating another routing DSL.

---

# 6. Stable node identity and `Site.mount`

One Affe idea worth copying directly is separating:

```text
what this route is
```

from:

```text
where it is mounted
```

So:

```ts
export const Project = Site.route(...)

export const AppSite = Site.make(
  Site.mount(Project, [
    Settings,
    Activity,
  ]),
)
```

must not mutate `Project`.

The exported node remains usable for:

```ts
Site.href(Project, params)

Site.target(Project, params)

Site.parentOf(AppSite, Project)

Site.ancestorsOf(AppSite, Project)

Site.depthOf(AppSite, Project)

Site.chainOf(AppSite, route)
```

This gives Foldkit Plus the structural inspection Affe and `combi-router` do well.

---

# 7. Real nested route topology

Core Foldkit currently knows:

```text
/projects
/projects/:id
/projects/:id/settings
```

as URL alternatives.

`Site` adds:

```text
Projects
└── Project
    ├── Settings
    └── Activity
```

That hierarchy can now power:

```text
nested layouts
breadcrumbs
navigation
route metadata inheritance
prefetch planning
SSR planning
DevTools
agents
sitemaps
route-chain Surface activation
```

without changing the meaning of `AppRoute`.

This is one of the clearest Affe improvements to import.

---

# 8. Nested layouts, but no magical `<Outlet>`

Affe's eventual Outlet model is useful, but Foldkit can implement the same capability more cleanly.

A route chain:

```text
Root
→ Projects
→ Project
→ Settings
```

can resolve to:

```text
RootLayout(
  ProjectsLayout(
    ProjectLayout(
      SettingsView
    )
  )
)
```

using ordinary pure Foldkit rendering.

Something like:

```ts
const Projects = Site.branch(...).pipe(
  Site.layout((model, child, h) =>
    h.div([], [
      sidebar(model, h),
      child,
    ])
  ),
)
```

and:

```ts
const Settings = Site.page(...).pipe(
  Site.view(SettingsView),
)
```

Then:

```ts
Site.view(AppSite, model.route, model, h)
```

resolves the active chain and composes it.

No context provider.

No hidden route state.

No runtime Outlet component.

No child router.

The layout receives its child explicitly.

That gives you the ergonomic result of nested outlets while remaining Foldkit-shaped.

---

# 9. Route nodes should bind `SurfaceSource`s, not loaders

This is the largest departure from Affe.

Do not write:

```ts
Site.loader(...)
```

or:

```ts
Route.loader(...)
```

Instead:

```ts
const ProjectAt = Surface.when(
  ProjectPage,
  App.model.route,
  AppRoute.Project,
  route => ({
    projectId: route.projectId,
  }),
)
```

can simply be attached:

```ts
const Project = Site.route(...).pipe(
  Site.surfaces(ProjectAt),
)
```

Or Site can produce the `Surface.when` for you:

```ts
const Project = Site.route(
  projectRouter,
  AppRoute.Project,
).pipe(
  Site.surface(
    ProjectPage,
    route => ({
      projectId: route.projectId,
    }),
  ),
)
```

but that is only sugar.

Internally it lowers to an ordinary `SurfaceSource`.

Therefore:

```text
Site does not own data.

Site tells Surface:
"This route activates this capability."
```

That's the correct boundary.

---

# 10. Route hierarchy does not imply loader hierarchy

This lets Foldkit Plus improve upon Affe.

Suppose:

```text
Organization
└── Project
    └── Settings
```

and the matched chain contributes:

```text
OrganizationSurface
ProjectSurface
SettingsSurface
```

All three simply become active together:

```text
matched Site chain
       │
       ▼
SurfaceSources
       │
       ▼
instances
       │
       ▼
Projection metadata
       │
       ▼
Remote requirements
```

Remote can issue independent requirements concurrently and coalesce overlapping entity/query reads as it already does.

There is no implicit:

```text
Organization loader
      ↓ wait
Project loader
      ↓ wait
Settings loader
```

just because the routes are nested.

That is strictly better.

---

# 11. Dependent loading moves to `Surface.each`

Now consider the case Affe handles with:

```ts
dependsOnParent: true
```

A CMS route first needs:

```text
Page Document
```

before it knows that its Document contains:

```text
ProductGrid#7
ProductGrid#9
```

With `Surface.each`:

```ts
const ProductGrids = Surface.each(
  ProductGridSurface,
  {
    from: CmsPage,

    instances: ({ page }) =>
      RemoteData.value(page)
        ? Composition.nodesOf(
            SiteCatalog,
            page.value.document,
            ProductGrid,
          ).map(node => ({
            key: node.id,
            params: {
              category: node.props.category,
            },
          }))
        : [],
  },
)
```

the dependency becomes:

```text
CmsPage Surface
      │
      ▼
Page Document
      │
      ▼
Surface.each
      │
      ├── ProductGrid#7
      └── ProductGrid#9
```

This is a data/capability dependency, not a route dependency.

That means it works equally well for:

```text
CMS blocks
dashboard widgets
plugin systems
tabs
wizard state
selected entities
agent-selected tools
```

This is more general than Affe's loader scheduler.

---

# 12. Add `Data.satisfy`

Once dynamic SurfaceSources exist, the fixed-point operation the existing design documents anticipated finally has a concrete use case.

The API could be:

```ts
const prepared =
  yield* Data.satisfy(
    model,
    PageSources,
  )
```

where `PageSources` can contain:

```ts
[
  CmsPage,
  ProductGrids,
  CartBlocks,
]
```

Its semantic loop is:

```text
resolve SurfaceSources
       ↓
collect current instances
       ↓
collect Remote requirements
       ↓
plan missing requirements
       ↓
nothing missing? ─── yes ──→ return Model
       │
       no
       ▼
prefetch
       ↓
reduce Remote result
       ↓
new Model
       │
       └──────────── repeat
```

A bounded maximum number of expansion rounds prevents accidental infinite dependency generation.

This should not become a persistent runtime.

It is an Effectful **preparation operation** for places where the live Foldkit Subscription loop cannot naturally do the work first.

That primarily means:

```text
SSR
SSG
hover/link prefetch
tests
server agents
possibly explicit navigation preloading
```

---

# 13. Browser navigation stays Foldkit-native

Affe has a sophisticated router runtime because its router owns loaders.

Foldkit doesn't need that runtime.

The browser path remains:

```text
click
 ↓
Message
 ↓
update
 ↓
Navigate Command
 ↓
URL event
 ↓
ChangedUrl Message
 ↓
update
 ↓
Model.route
 ↓
SurfaceSources change
 ↓
Subscriptions change
```

That is one of Foldkit's strongest properties and should not be weakened.

The Site package can add helpers around it, but it must not secretly own navigation state.

For example:

```ts
Site.transition(site, previousRoute, nextRoute)
```

could return pure structural information:

```ts
{
  exited,
  stayed,
  entered,
  previousChain,
  nextChain,
}
```

building on Foldkit's existing `Transition` semantics.

This becomes useful for:

```text
scroll restoration
analytics
transition animations
resource lifecycle explanations
prefetch policy
breadcrumbs
```

without becoming a router state machine.

Scroll restoration turned out to need more than transition data: see §33.5.

---

# 14. Navigation supersession remains a data-runtime concern

Affe automatically interrupts superseded route-loader fibers.

In Foldkit Plus:

```text
route changes
      ↓
old Surface instances disappear
      ↓
Remote Subscriptions stop requiring them
      ↓
new Surface instances appear
```

That already provides the structural lifetime.

Any remaining race should be solved where it actually exists:

```text
Remote request generation
Command interruption
Subscription lifecycle
```

not by adding task IDs to `Site`.

If concrete testing later shows stale network work consuming meaningful resources, Remote can add request cancellation/coalescing at the semantic request layer.

Site should not own it.

---

# 15. Target objects: steal Affe's typed-link ergonomics

This is another place Affe is stronger.

Introduce a pure typed destination:

```ts
const target = Site.target(
  Project,
  {
    projectId: "p1",
  },
)
```

where:

```ts
target.route
target.url
target.node
target.chain
```

are all known.

This one value can power:

```ts
Site.href(target)

Site.navigate(target)

Site.prefetch(target)

Site.inspect(target)
```

That prevents link building, prefetching, and route analysis from each inventing slightly different representations.

---

# 16. Prefetch should operate on the target Site graph

With a target:

```ts
const target =
  Site.target(Project, {
    projectId: "p1",
  })
```

the Site can derive what **route-level SurfaceSources** would be active there.

So:

```ts
yield* Site.prefetch(
  AppSite,
  Data,
  model,
  target,
)
```

can conceptually:

```text
current Model
      +
target AppRoute
      ↓
temporary target Model
      ↓
target Site chain
      ↓
target SurfaceSources
      ↓
Data.satisfy(...)
      ↓
Model with target data cached
```

No route loader.

No separate prefetch protocol.

The exact same Surfaces that navigation will use are what prefetch uses.

That is a powerful invariant.

---

# 17. Composition joins naturally

The Site graph should stop at:

```text
CmsPage route
   ↓
PublishedPage Surface
```

Then Composition takes over:

```text
PublishedPage Surface
      ↓
Page.document
      ↓
Composition.at(...)
      ↓
dynamic SurfaceSources
```

For example:

```ts
const CmsPage = Site.route(...).pipe(
  Site.surface(
    PublishedPage,
    route => ({
      slug: route.slug,
    }),
  ),
)
```

and separately:

```ts
const CompositionPage =
  Composition.at(SiteCatalog, {
    from: CmsPage.surface,
    document: ({ page }) =>
      RemoteData.value(page)?.document,
  })
```

Conceptually:

```text
RouteSite
  CmsPage
     │
     ▼
PublishedPage Surface
     │
     ▼
Composition.Document
     │
     ├── static Blocks
     ├── Surface.each
     └── Bundle.withEach
```

Neither abstraction steals ownership from the other.

---

# 18. CMS preview automatically follows the same graph

CMS preview overlays the draft Page into Remote.

Therefore:

```text
PreviewShown
    ↓
Remote overlay changes Page.document
    ↓
PublishedPage projection changes
    ↓
Composition Surface families change
    ↓
new block requirements appear
    ↓
Remote fetches them
```

No Site preview mode.

No Composition preview loader.

No alternate renderer.

No preview-specific route graph.

This should be treated as a design requirement:

> **Anything that renders a published Composition page must automatically render a CMS preview when Remote exposes the preview value.**

---

# 19. SSR should accept `SurfaceSource`s

Current:

```ts
SSR.plan(App, {
  surfaces: [
    ProjectPageAt,
  ],
})
```

should generalize toward:

```ts
SSR.plan(App, {
  surfaces: [
    ProjectPageAt,
    ProductGrids,
    CartBlocks,
  ],
})
```

or potentially:

```ts
surfaces: {
  project: ProjectPageAt,
  products: ProductGrids,
  carts: CartBlocks,
}
```

for better diagnostics.

SSR then resolves actual instances for the server Model:

```text
ProjectPage

ProductGrid[node-7]
ProductGrid[node-18]

CartSummary[node-24]
```

and can perform coverage at instance granularity.

Diagnostics become much better:

```text
Surface ProductGrid[node-7]
  activated by:
    CmsPage
    document node node-7

  reads:
    Remote.ProductsByCategory("shoes")

  messages:
    ProductSelected
```

This is more informative than Affe's route-loader debugging because the explanation reaches down to the actual consumer.

---

# 20. Add SSR preparation, not async rendering

Foldkit SSR's synchronous rendering discipline is good.

Do not add Suspense-like asynchronous rendering.

Instead:

```text
init
 ↓
Model₀
 ↓
prepare/satisfy
 ↓
Modelₙ
 ↓
synchronous view
 ↓
HTML + resume envelope
```

The likely API is either:

```ts
SSR.plan(App, {
  prepare: model =>
    Data.satisfy(model, PageSources),
})
```

or preferably keep SSR ignorant and wrap the rendering input:

```ts
const model =
  yield* Data.satisfy(
    initialized.model,
    PageSources,
  )

yield* SSR.renderModel(...)
```

The exact integration should follow whichever API leaves package ownership cleanest.

The important capability is:

```text
route
→ page entity
→ composition document
→ dynamic block Surfaces
→ their data
→ fixed point
→ render
```

before synchronous render begins.

---

# 21. Static Composition remains server-owned

`SSR.static` is exactly the right mechanism for static Composition nodes.

A completely static document can render:

```text
Document
 ↓
Composition renderer
 ↓
SSR.static
 ↓
HTML
```

while the browser receives none of the Document.

A mixed page can initially keep things simpler:

```text
static subtrees
    → SSR.static

interactive structure
    → resumed normally
```

Do not introduce a second compact Composition representation just to save bytes in v1.

The architecture already gives you an optimization path later.

---

# 22. Resumability becomes route-independent

Another Affe advantage is that route actions/data remain available under SSR.

Foldkit Plus can do better because resumability is Message-based.

Site does not need:

```ts
Site.action(...)
```

A route Surface already declares its Messages.

A Composition Surface already declares its Messages.

The resumable builder serializes those existing application Messages.

So:

```text
Site route
   ↓
Surface
   ↓
Message capability
   ↓
Resume binding
   ↓
update
```

and:

```text
Composition Block
   ↓
Surface
   ↓
Message capability
   ↓
Resume binding
   ↓
update
```

are identical.

This is an extremely strong unification.

---

# 23. Head metadata should be pure Site metadata

Affe has excellent route-local title/meta support.

Foldkit Plus can add the ergonomic part without introducing a separate state system.

For example:

```ts
const Project = Site.route(...).pipe(
  Site.title(({ route, model }) =>
    model.project._tag === "Ready"
      ? model.project.value.name
      : "Project"
  ),

  Site.meta(({ model }) => ({
    description: ...
  })),
)
```

Or ideally metadata operates on a declared Surface projection rather than arbitrary Root Model access:

```ts
Site.head(
  ProjectPage,
  project => ({
    title: project.name,
  }),
)
```

The active route chain can merge metadata root-to-leaf.

But the final Foldkit `Document` remains the actual output.

So Site provides a **pure projection into Document metadata**, not a head runtime.

---

# 24. Route actions should not exist

Affe can attach actions to route nodes.

Foldkit Plus now has better primitives.

Application behavior should continue to be represented as:

```text
Messages
Actions
Bundles
Surfaces
```

If `Action` becomes a first-class Surface primitive, the same action can be exposed through:

```text
route
Composition
agent
button
form
MCP
```

without making route-local actions a special concept.

Site may reference them for inspection:

```ts
Site.actions(EditProject)
```

but should not define another action system.

---

# 25. Route guards need to be split into UX and authorization

Affe's guards are useful, especially because it enforces them consistently across navigation, SSR, and loader access.

Foldkit Plus should preserve that insight while being stricter about ownership.

A client-side route condition might be declared:

```ts
Site.access(Project, {
  from: SessionSurface,

  allow: session =>
    session.user !== null,

  otherwise: Login,
})
```

but its meaning must explicitly be:

```text
navigation/presentation policy
```

not:

```text
data authorization
```

Actual security remains:

```text
CMS audience
RemoteServer principal
field authorization
query visibility
mutation authorization
```

If Site access rules are added, SSR should honor the same policy for which page it renders, but RemoteServer must remain independently authoritative.

---

# 26. Don't copy `ServerRoute`

Affe's unified server-route declarations are convenient, but they clash with the architecture Foldkit Plus already has.

Keep:

```text
document requests
  → Foldkit / foldkit-ssr

semantic data
  → RemoteServer

generic HTTP APIs
  → Effect HttpApi / application

RPC
  → Effect RPC
```

The Site graph may describe the document topology.

It should not become an HTTP router.

---

# 27. Single flight belongs in Remote

This remains Affe's most valuable missing runtime feature.

But with SurfaceSources, Foldkit Plus can implement a stronger form.

The client already knows:

```text
active Surface instances
→ precise read/query requirements
```

and mutation results already directly patch:

```text
entities
connections
deleted entities
```

So a mutation can potentially send:

```ts
{
  mutation,
  refresh: remainingActiveRequirements,
}
```

in one request.

Conceptually:

```text
CURRENT SURFACES
      │
      ▼
current Remote requirements
      │
      │
mutation starts
      ▼
server mutation
      │
      ├── returns authoritative patches
      │
      └── evaluates remaining affected requirements
                    │
                    ▼
               one response
```

Unlike Affe, you don't need runtime key capture from loader executions.

The requirements are already declarative.

A possible future API:

```ts
Data.mutate(
  model,
  RenameProject,
  input,
  {
    refresh: PageSources,
  },
)
```

or:

```ts
Data.singleFlight(
  model,
  RenameProject,
  input,
  PageSources,
)
```

I would wait until the wire design is clear before naming it.

But the ownership is clear:

> `Site` supplies topology; `SurfaceSource` supplies active consumers; `Remote` decides what needs revalidation; `RemoteServer` executes it.

---

# 28. This gives Foldkit Plus a better notion of "route plan"

Affe normalizes routes to an internal `RouteEntry`.

Foldkit Plus could normalize a **target** into a richer pure `SitePlan`.

Conceptually:

```ts
interface SitePlan<Model> {
  readonly route: AppRoute
  readonly url: string

  readonly chain: readonly SiteNode[]

  readonly surfaceSources:
    readonly SurfaceSource<Model>[]

  readonly layouts: readonly SiteLayout[]

  readonly head: SiteHead

  readonly access: readonly SiteAccess[]

  readonly metadata: SiteMetadata
}
```

This is not runtime state.

It is:

```text
Site + target/current route
          ↓
       SitePlan
```

Consumers use it:

```text
renderer
prefetch
SSR
DevTools
agent
navigation UI
breadcrumbs
sitemap
```

This is probably the cleanest way to steal Affe's normalized-route strength.

---

# 29. Then add a resolved plan

For dynamic systems such as Composition there is one more level:

```text
SitePlan
   +
Model
   ↓
ResolvedPlan
```

Conceptually:

```ts
interface ResolvedPlan<Model> {
  readonly site: SitePlan<Model>

  readonly surfaces:
    readonly SurfaceInstance<Model>[]

  readonly compositions:
    readonly CompositionInstance[]

  readonly bundles:
    readonly BundleInstance[]

  readonly actions:
    readonly ActionInstance[]
}
```

This should initially be internal/inspection data rather than a giant public API.

But it gives DevTools a complete story:

```text
/projects/p1
└─ Project
   ├─ ProjectPage Surface
   │  └─ Project:p1 [id,name]
   │
   └─ CMS Composition
      ├─ Hero#n1
      ├─ ProductGrid#n7
      │  └─ ProductGrid Surface
      │     └─ ProductsByCategory(shoes)
      └─ Carousel#n9
         └─ Carousel Bundle
```

That is the Affe-style application graph I think you actually want.

---

# 30. Compared with Affe

| Concern | Affe | Revised Foldkit Plus |
|---|---|---|
| URL semantics | Route owns path | **Foldkit Router biparser** |
| Route hierarchy | `Route.mount/children` | **`Site.mount/children`** |
| Stable route identity | Yes | **Yes** |
| Nested layouts | Route tree / Outlet direction | **Pure chain composition** |
| Loader | Route loader | **Surface Projection** |
| Dynamic loader | loader callback | **`Surface.each` / SurfaceSource** |
| Loader dependency | `dependsOnParent` | **dependency emerges from Model/Surface graph** |
| Loader parallelism | router scheduler | **Remote requirement concurrency/coalescing** |
| Cache | router cache | **Remote.Model** |
| SWR | loader cache policy | **Remote policy** |
| Route prefetch | loader execution | **target SitePlan → `Data.satisfy`** |
| Navigation supersession | RouterRuntime | **Subscription/Remote lifecycle** |
| Guards | route guards | **optional Site UX access + server authorization** |
| Head | Route metadata | **pure Site metadata → Foldkit Document** |
| SSR data | matched loaders | **SitePlan/SurfaceSources → `Data.satisfy`** |
| Hydration | loader payload | **SSR Model slice + `Remote.resume`** |
| Resumability | conventional hydration | **Message-level preboot dispatch** |
| Static regions | conventional SSR | **`SSR.static` server ownership** |
| Server routes | built into framework | **RemoteServer / HttpApi stay separate** |
| Mutation seed | `setLoaderData` | **normalized entity/connection patches** |
| Single flight | mutation + loader reruns | **future mutation + declarative Remote requirement refresh** |
| CMS | external concept | **native via Remote overlay + Composition** |
| Dynamic page topology | route tree | **Composition Document + Surface.each** |
| Inspection | route/runtime graph | **SitePlan + Surface graph + Remote + Composition** |

The important point is that the revised Foldkit Plus version isn't merely reproducing Affe.

In several places it would have a stronger abstraction because it can distinguish:

```text
URL topology
application capability topology
stored content topology
data topology
state-machine ownership
```

rather than making Route absorb all five.

---

# 31. Recommended implementation sequence

1. **Generalize Surface activation.** Add `SurfaceSource`, `SurfaceInstance`, and `Surface.each`; adapt `Surface.at` and `Surface.when` conceptually to the same source-of-instances model while preserving the public APIs.

2. **Make Remote and SSR consume SurfaceSources.** `Data.subscriptions`, `Data.wiring`, `Remote.resume`, `SSR.plan`, and `SSR.inspect` should resolve actual keyed instances. Add excellent instance-aware diagnostics before doing anything more ambitious.

3. **Build the Composition adapter.** Use `NodeId` as the instance key. `Block.fromSurface` should automatically become a `Surface.each` family derived from the active Document. Prove CMS preview, Remote fetching, SSR coverage, and retention all follow the draft Document automatically.

4. **Implement `Data.satisfy`.** Start as a bounded Effectful fixed-point helper around existing `Data.prefetch`. Prove the actual chain `route → Page → Document → dynamic Block Surfaces → block data`.

5. **Introduce `foldkit-site`.** Initially only stable nodes, hierarchy, parent/ancestor/chain inspection, target/href generation, attached SurfaceSources, and pure metadata. Use existing full Foldkit Router definitions before considering relative-path sugar.

6. **Add nested layouts and Site rendering.** Compose route-chain layouts as ordinary Foldkit functions. Do not introduce an Outlet runtime.

7. **Connect Site target planning to prefetch.** `Site.target` → `SitePlan` → target Model → SurfaceSources → `Data.satisfy`. Use exactly the same mechanism for hover prefetch and programmatic preload.

8. **Connect Site to SSR.** The route SitePlan should determine route-level SurfaceSources; `Data.satisfy` prepares the server Model; Composition expands dynamic Sources; `Remote.resume` captures exactly what the resolved Surfaces require.

9. **Add Site head/access metadata only after real consumers exist.** Keep both pure. Access remains navigation/SSR policy, never the server's authorization mechanism.

10. **Prototype Remote single flight last.** By then the system has a precise active `SurfaceInstance → requirement` graph. Use that rather than designing a route-loader protocol.

---

# 32. Final architecture

The architecture I would now target is:

```text
                               URL
                                │
                                ▼
                         Foldkit Router
                                │
                                ▼
                            AppRoute
                                │
                                ▼
                              Model
                                │
               ┌────────────────┴────────────────┐
               │                                 │
               ▼                                 ▼
          foldkit-site                  foldkit-composition
      deployed route topology            stored page topology
               │                                 │
               └────────────────┬────────────────┘
                                ▼
                         SurfaceSources
                  at / when / each / families
                                │
                                ▼
                        SurfaceInstances
                                │
                ┌───────────────┼────────────────┐
                ▼               ▼                ▼
             Remote            SSR          Agent/DevTools
                │               │
                │        Remote.resume
                │               │
                ▼               ▼
          RemoteServer      Resume envelope
                │               │
                ▼               ▼
        authorized data       browser
```

And preparation is:

```text
route / target
     │
     ▼
SitePlan
     │
     ▼
SurfaceSources
     │
     ▼
resolve instances
     │
     ▼
Data.satisfy
     │
     ├─ Remote read
     │      ↓
     │   new Model
     │      ↓
     ├─ new Surface.each instances
     │      ↓
     │   more Remote reads
     │
     └─ stable
          ↓
      prepared Model
          ↓
     render / navigate /
     prefetch / generate
```

That gives Foldkit the things Affe was strongest at—**explicit topology, nested composition, inspection, target planning, SSR-aware data preparation, and eventually one-round-trip mutation/revalidation**—without paying for a second application runtime.

The most important conceptual change from the earlier design is that **Site is no longer the center of the system**.

`SurfaceSource` is.

Site is one producer of SurfaceSources. Composition is another. CMS can alter what Composition produces through Remote overlays. Bundles own stateful islands. Remote interprets their data requirements. SSR interprets their resumability requirements.

That feels much more like the architecture Foldkit Plus has already been converging toward than “an Affe router ported to Foldkit.”

---

# 33. What the CMS example taught (2026-09-27)

`examples/cms` is the first application here with navigation a reader would
notice: a studio of two applications (posts at `/`, pages at `/pages`) and a
public site at `/site`, each its own document, with addresses that open entries,
and a published demo people use on phones. Making its addresses, scroll and
loading states behave tested this design against a real case. This section says
what held, what it needs, and how §31's sequence changes. The code it cites is
in the repository; nothing here is a plan that was not tried.

## 33.1 What holds up

- **Navigation stays Foldkit-native (§13).** Every behaviour came down to
  `update` and a Subscription: the Model is authoritative, a Subscription writes
  the address, `UrlChanged` reads it back. Opening an entry, Back, Forward, a
  reload and a shared link needed no router runtime.
- **Guards are not authorization (§25).** In the demo the address's `?as=`
  picks which chair is signed in. What that chair may read and do is decided
  by `RemoteServer`'s policy, not by which screens the application shows: in
  `demo.ts` a writer who asks to publish anyway is refused ("This author may
  not publish this entry").

## 33.2 Two kinds of URL state share one Message

The address holds two kinds of state, and they reach it differently:

| State | Owner | Written by | Read back by |
| --- | --- | --- | --- |
| A search, a tab, a filter | the application's top-level field | a `foldkit-mirror` URL mirror | the mirror, on `UrlChanged` |
| The open entry; the Builder's selection, panel and preview width; the editor's preview | a child: the editor bundle, the Builder | the application's Subscription | the application, which asks the child through its own Messages |

A mirror installs fields; it cannot run a transition. Opening an entry saves
what was typed in the one being left, and a Builder's panel is the Builder's
to change, so both are routing, not mirroring.

The two kinds share `UrlChanged`, and that exposed a real bug:
`foldkit-bundle`'s assembly routed each Message to the first item that
answered, and a URL mirror answers every `UrlChanged`. An application with a
URL mirror never saw its own URL Message, so it could not route beside one,
and of two URL mirrors only the first read the URL. The fix settles
[wiring-DESIGN.md](./wiring-DESIGN.md)'s open question: a shared tag is
observed, not claimed. Every wiring sharing it folds it in list order, and
the application's `update` sees it after them, over the slices they already
installed.

For Site this means a node's params come in both kinds. A param that is a
plain field can be a mirror key; a param that asks an owner for something is
an intent (33.3).

## 33.3 Needs: an intent that waits for its owner

Both studio applications hand-wrote the same mechanism. The address asks
something of a child that has no Model yet: the Builder does not exist until
its page loads, and the editor's preview is reset when the post arrives, so a
preview asked for during the load is lost. So:

- `linked` (pages) and `previewAsked` (posts) hold the ask in the Model;
- a `follow` step applies it once the owner is ready, through the owner's own
  Messages, and then lets it go, so the address follows the owner again;
- `follow` runs outside the editor's `after`, because `after`'s `sync` is what
  installs a loaded value; inside it, the owner still looks unready;
- the address Subscription writes the pending ask while it waits, or a reload
  during the load loses it.

That is four rules two applications had to find. The last is the easiest to
miss.

Site should own it: a target (§15) is `{ route, intents }`, where an intent is
a request to an owner with a readiness predicate and an apply step. Prefetch
(§16) then satisfies the data half of a target while its intents wait for the
Models the data makes.

## 33.4 Needs: one declaration of history intent

Which changes add a history step, and which replace the current one, is
declared per key for a mirror (`history: 'push' | 'replace'`). The routed half
spells it in code instead: `writeAddress(params, entry)` pushes when the
entry's key changes and replaces otherwise. One rule has two spellings. A Site
node should declare it once: moving to another node, or another entry, is a
step; a param within a node replaces, unless it declares otherwise.

## 33.5 Needs: scroll is a navigation primitive, not transition data

§13 lists scroll restoration among the things `Site.transition` could power.
The example shows pure transition data is not enough, for three reasons found
the slow way:

1. **The offset has to be taken when the reader acts.** Foldkit draws the next
   screen before the Navigate Command pushes the address. By the time the URL
   changes, the window is already clamped to the new, shorter page, so a
   `navigate` or `popstate` listener records the wrong offset. The example
   records at the reader's click or key (capture phase), and at the start of
   Back and Forward, which begin in the browser before anything is drawn.
2. **A restore has to hold its place while the screen settles.** A restore
   made when the entry changes is undone by the loading state drawn right
   after it. The example holds the target on each frame for a moment, and
   stops at once when the reader scrolls, touches or types.
3. **Entries need a key that survives a reload.** Foldkit writes `{}` as every
   entry's history state, so it cannot key one. The Navigation API's
   `currentEntry.key` survives a reload and a full navigation. Offsets are
   kept in `sessionStorage`, so Back into another document restores too.

`examples/cms/src/scroll.ts` does this in about 130 lines, with a browser test
that a mutation of each rule fails. It belongs in `foldkit-primitives` as a
Subscription or Mount, or upstream in Foldkit's navigation. `Site.transition`
can add what only topology knows: which container scrolls, such as a nested
layout's panel rather than the window.

## 33.6 Needs: pending UI that does not flash, and never guesses

Loading states between screens looked broken in two ways:

- **A flash.** A "Loading…" drawn for one frame reads as a glitch.
- **A wrong fact.** An existing entry drew a "New" badge before its state was
  read, and a list said "Nothing yet." before it had been asked. `Initial` and
  `Loading` mean "unknown", not "empty" or "new".

The example's answer is a convention: a busy line carries `aria-busy`
(`foldkit-mixins-crud`'s status line now does), and a style shows it only after
a short delay, holding its space from the start. It belongs in
`foldkit-mixins` as a named Style. The better answer is to have no wait at all:
the demo's waits are a few hundred milliseconds, mostly the in-page sandbox
opening, and prefetching a Site target (§16) before navigation would remove
the rest.

## 33.7 Document boundaries: Vite and SSR

Posts, pages and the site are three applications, so moving between them is a
full document load. That load painted white with a line of text, because the
page's foundations (reset, tokens, theme) were a stylesheet the script wrote.
A small Vite plugin in `examples/cms/vite.config.ts` now compiles `sheet.ts` in
Node at build and dev time and writes it into the HTML. The first paint has
the theme's background, and Chrome's paint holding keeps the old page until
the new one draws content. Three needs follow:

- **A target must know its document.** Within one application `Site.href` is
  enough; across applications a link must be a full load. The example's
  `UrlRequested` loads every internal link because it cannot tell which
  application serves it. Site nodes should say which application, and so which
  document, serves them. `Site.navigate` then chooses between a Navigate
  Command and a load.
- **Foundations in the HTML is SSR for CSS alone.** It belongs in
  `foldkit-mixins` as a Vite plugin that writes `Style.stylesheet` into the
  page, and in `foldkit-ssr`'s head for a server-rendered page.
- **One blank frame remains.** With SSR the first paint could carry the data
  as well. Otherwise a studio could be one application with lazily loaded
  sections, which needs per-route code splitting.

## 33.8 How §31's sequence changes

Before step 5 (`foldkit-site`), two steps that the example has already shown
are needed:

- **4a.** Move scroll keeping (33.5) and the delayed busy reveal (33.6) into
  packages, with the example as their first user.
- **4b.** Give the routing package's first cut targets with intents (33.3) and
  one history declaration (33.4). Both studio applications need them now, and
  nested layouts do not depend on them.

Step 7's prefetch then has a measured reason: every loading state the demo
still shows is a wait prefetch removes.
