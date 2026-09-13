# DX prototypes (#69)

The application API from #69 on the five scenarios the issue names. The fixture
is [`packages/remote/test/dx.test-d.ts`](../../packages/remote/test/dx.test-d.ts).
Phases B, C, and D (items 1–12) are real there: `Remote.Model`, the bound
`Remote.make`, `Entity.select`/`patch`, `Data.get`/`live`/`query`/`next`/
`previous`/`fetch`/`plan`/`prefetch`/`mutate`/`reduce`/`inspect`/
`subscriptions`, `Remote.messages`/`reduces`, the fields sugar on
`Mutation.make`/`Query.make`, `App.surface`, and `Surface.at`. Each item was
first a `declare`d stub typed over the real kernel types, so inference, hover
shape, and error placement were checked before it landed; the scenarios stay
as the regression test.

The hover shapes below are what the compiler reports for the fixture's
declarations (`checker.typeToString`, no truncation), which is what an editor
shows.

## The five scenarios, current versus candidate

### 1. `Project` with a nested `owner` selection

```ts
// current
const UserSummary = Selection.make(User, { id: true, name: true })
const ProjectSummary = Selection.make(Project, { id: true, name: true, status: true, owner: UserSummary })
const project = Remote.select(AppRemote, ProjectSummary)(params.projectId)

// candidate
const UserSummary = User.select({ id: true, name: true })
const ProjectSummary = Project.select({ id: true, name: true, status: true, owner: UserSummary })
const project = Data.get(ProjectSummary, params.projectId)
```

Hover:

```text
ProjectSummary: Selection<{
  readonly id: string & Brand<"ProjectId">; readonly name: string;
  readonly owner: { readonly id: string; readonly name: string }; readonly status: string
}, "Project", "entity">

project: Projection<AppModel, RemoteData<{ …the same value… }>>
```

The method form infers exactly what `Selection.make` infers (the fixture
asserts `typeof ProjectSummary` against the kernel call), with no entity named
twice. Errors land where they should: an unknown field, a nested selection of
the wrong target, and a selection of an entity not registered with `Data` are
each one line.

### 2. A paginated list with `next`

```ts
// current
const ref = Query.first(25)(ProjectsByOwner.ref({ ownerId }))
const page = yield* Remote.query(ref)                          // Effect
dispatch(GotRemote({ message: Remote.queryMessage(ref, page) }))
Remote.visibleItems(model.remote, ref)                        // edges, not values

// landed (Phase D)
const projects = Data.query(ProjectsByOwner, { ownerId }, { select: ProjectSummary, first: 25 })
Data.next(model, projects)                                    // QueryRef | undefined
Data.fetch(next)                                              // Command: "load more"
```

Hover: `QueryProjection<AppModel, { …ProjectSummary value… }, 'ProjectsByOwner',
{ readonly ownerId: string }>`, a `Projection<AppModel, RemoteData<Page<…>>>`
with the `ref` `next` pages from.

The window type is a union whose members carry `undefined`-only keys for the
other side (`{ first?; after?; last?: undefined; before?: undefined } | { last;
before?; … }`). Without them TypeScript's excess-property check runs against
the union as a whole and `{ first: 25, last: 5 }` is accepted; with them,
`first` + `last` and `last` + `after` are each a one-line error, and an
explicit `after: undefined` still passes. `select` is constrained to the
query's entity through `Query.make`'s `Result` (`QueryEntity<Q>`), so `select:
UserSummary` on a `Project` query is an error at the option.

The projection reads `Initial` until every visible item is assembled under
`select`, not a partial page: an item on its way makes the page pending, so a
view never shows a list that is silently short. The cost is on optimistic
inserts: a patch that lacks a selected field puts the page back to `Initial`
until the read entry fetches that field, so an optimistic insert into a page
should carry every field the page selects.

### 3. An optimistic comment insert

```ts
// current
Data.update(model.remote, { _tag: 'MutationStarted', requestId, optimistic: [Entity.patch(…), ConnectionChange.prepend(…)] })
Remote.mutateInto(AppRemote, model, AddComment, input, requestId)

// candidate
const { model: started, command } = Data.mutate(model, AddComment, input, {
  optimistic: ({ tempId }) => [Comment.patch(tempId, { id: tempId, body }), ConnectionChange.prepend(…)],
})
// in update: return { model: started, commands: [command] }
Data.mutate(model, RenameProject, input, { requestId: 'req-1' })   // explicit, for a durable bridge or a test
```

Hover: `{ readonly model: AppModel; readonly requestId: string; readonly tempId: string; readonly command: Command<RemoteMessage, never, RemoteClient> }`.
`Data.mutate` takes the Model because it is what `update` calls: the id comes
from the Model's mutation sequence and `MutationStarted` is applied before the
Command runs (a Command yields exactly one Message, so the Command cannot be
where the id is made).

The mutation's input and output types come from the declaration; a wrong
input key and an unregistered mutation are each one-line errors.

### 4. A Surface with a Remote value and a restricted Message set

```ts
// current
const ProjectPage = Surface.make(App, 'ProjectPage', {
  Params: Schema.Struct({ projectId: ProjectId }),
  model: ({ params }) => Projection.struct({ project: Remote.select(AppRemote, ProjectSummary)(params.projectId) }),
  messages: [Message.ArchiveProject],
})
const subscriptions = (model: Model) => [
  Remote.observe(AppRemote, ProjectPage, { projectId: model.route }, m => Message.GotRemote({ message: m })),
  Remote.live(AppRemote, ProjectPage, { projectId: model.route }, m => Message.GotRemote({ message: m })),
  Remote.retain([ProjectPage.projection({ projectId: model.route })], m => Message.GotRemote({ message: m })),
]

// candidate
const ProjectPage = App.surface('ProjectPage', {
  params: { projectId: ProjectId },
  model: ({ params }) => ({
    project: Data.live(ProjectSummary, params.projectId),
    projects: Data.query(ProjectsByOwner, { ownerId }, { select: ProjectSummary, first: 25 }),
  }),
  messages: [Message.ArchiveProject],
})
const subscriptions = (model: Model) =>
  Data.subscriptions([{ surface: ProjectPage, params: { projectId: model.route } }], { grace: '5 seconds' })
```

Hover:

```text
ProjectPage: Surface<AppModel, {
  readonly project: RemoteData<{ …ProjectSummary value… }>;
  readonly projects: RemoteData<Page<{ …ProjectSummary value… }>>
}, { readonly _tag: "ArchiveProject"; readonly id: string & Brand<"ProjectId"> }, { readonly projectId: string & Brand<"ProjectId"> }>

subscriptions: (model: AppModel) => readonly EntryWithoutKeepAlive<AppModel, RemoteMessage, unknown, RemoteClient>[]
```

`params` given as plain fields infers the Params type; an object of
Projections infers the projected Model with each field's `RemoteData` value; a
Message constructor from another union is a one-line error at the constructor.
The kernel `Surface.make` accepts the same pieces unchanged.

### 5. The same Surface through Mixins and Agent

Nothing changes: the candidate `ProjectPage` is a plain `Surface`, so
`SurfaceView.define(ProjectPage, …)` and `Agent` consume it as they do today.
The fixture pins that with an assignment.

## Counts

| Scenario | Current | Candidate | Concepts removed |
| --- | --- | --- | --- |
| 1 nested selection | 3 lines, 4 concepts (`Selection`, `Remote.select`, bound remote, currying) | 3 lines, 2 concepts (`select`, `Data.get`) | bound remote, currying |
| 2 paginated list | 4 statements, 5 concepts (`QueryRef`, window combinator, Effect, Message, view helper) | 2 lines, 2 concepts (`Data.query`, `Data.next`) | `QueryRef`, cursor, `queryMessage`, `visibleItems` |
| 3 optimistic insert | 2 statements, 3 concepts (reducer Message, request id, bound remote) | 1 call, 1 concept | request id, `MutationStarted` |
| 4 Surface + subscriptions | 3 entries plus the wrapper Message, 6 concepts | 1 entry, 2 concepts | `GotRemote`, `Params` schema, `Projection.struct`, repeated Surface/params |

## Decisions

1. **`User.select({...})`.** Same inference as `Selection.make`, no second
   generic, the Entity is the receiver. `Selection.make` stays as the kernel
   constructor. `Remote.select` is not a selection constructor; it stays the
   read.
2. **The bound `Data`** is an object of methods typed by the registered names
   (`"User" | "Project" | "Comment"` in the hover) and the query and mutation
   tuples. Registration is by reference (`entities: [User, Project]`), and an
   unregistered descriptor is a one-line error. `Data.get`/`live`/`query`/
   `mutate`/`subscriptions`/`reduce` compile onto `Remote.select`,
   `Remote.observe`/`live`/`retain`, `MutationStarted`/`Remote.mutate`, and
   `Remote.update`.
3. **`App.surface(name, { params, model, messages })`** wins over `Surface.make`
   for application code: the fields-to-Struct and object-to-`Projection.struct`
   lifts each infer the same types as the explicit forms, and the hover shows
   Model, Params, and Message as user concepts. `Surface.make` stays and takes
   the explicit forms. `Surface.define(App)(…)` adds nothing over a method.
4. **Request ids** come from a monotonic sequence in `RemoteModel.mutations`
   (`<binding>-<n>`, e.g. `remote-1`), taken by `Data.mutate(model, …)` and
   advanced by the `MutationStarted` reducer, so `update` stays pure and the id
   exists before the Command runs. `{ requestId }` overrides it; `tempId` is
   `<requestId>.tmp`. `Data.mutate` returns `{ model, requestId, tempId,
   command }` for `update` to return as `{ model, commands: [command] }`.
5. **`Remote.messages`** is Remote's case record for `defineMessageUnion`
   (`{ ...Remote.messages, ArchiveProject: {…} }`); `Remote.reduces(message)`
   narrows and `Data.reduce(model, message)` updates the bound slice. No
   wrapper Message.
6. **Windows** use the `never`-keyed union above; the mutual exclusion is
   enforced by the type, not documented.

## Findings

- **Foldkit subscriptions are a static record.** `Subscription.make` builds
  entries once; each derives its dependencies from the Model on every change.
  So item 5's "one declaration" is not `(model) => [entries]` but a record whose
  Surfaces take their params from the Model: `Data.subscriptions({ page:
  Surface.at(ProjectPage, model => params | undefined) })`, keyed `page.read`,
  `page.live`, `retain`, and passed straight to `Subscription.make<Model,
  Message, RemoteClient>()`. The fixture pins that the record is accepted with
  the application's union as `Message`.

- **`update` needs a named result type.** `Data` is bound to `App.model.remote`,
  and `App` is built from `update`, which calls `Data.reduce`; inline in
  `Surface.application` without a return annotation TypeScript reports the
  cycle. A standalone `update: (model: Model, message: Message) =>
  Update.Return<Model, Message>` (the kitchen-sink) or an annotated inline
  arrow (the remote example) resolves it. Item 4's `App.surface` does not
  change this; a Phase C option is `Remote.make` accepting the `ModelRef`
  before `App` exists (`Model.fields.remote`), which `foldkit-surface` does not
  expose today.
- **Narrowing an application's union to Remote's cases is by tag.**
  `Remote.reduces` is `message is Extract<M, { _tag: RemoteMessageTag }>`, so
  the else branch is the application's own cases and `switch` stays
  exhaustive; a predicate typed `message is RemoteMessage` did not narrow the
  complement, because the union's `Hydrated`/`LiveReceived` cases type their
  runtime slots `unknown`. `Data.reduce` accepts either shape.

- **Branded ids expand in hovers.** `type ProjectId = typeof ProjectId.Type`
  shows as `string & Brand<"ProjectId">` inside the flattened selection value,
  because `Simplify` maps over the fields. It is readable but long; keeping the
  alias would mean not flattening branded intersections. Decided in the hover
  pass below: kept, since that is how Effect displays a brand everywhere else
  and a flattened value is what a view reads.
- **The entity name union does the registration check.** `Names` in `DxData`
  is `"User" | "Project" | "Comment"`, and `Data.get` requires
  `Selection<Value, Name extends Names>`. The error for an unregistered entity
  is at the selection argument and names the offending literal. A branded
  failure type (item 13) can make the message say "not registered with Data"
  outright.
- **`Data.next` needs the projection to carry its query.** The stub typed it
  as `Projection & { query: Q }`; the landed `QueryProjection` carries the
  `QueryRef` (`ref`) so `next`/`previous` build the neighbouring window from
  the Model's boundaries, keeping the page size.
- **Connections travel on the Projection.** `Projection.connections` is the
  fourth thing a Projection carries, next to `dependencies` and `requirements`,
  so a Surface that reads a page needs no second registration: the read entry
  plans a connection like a field (unknown or stale: run the query; known: the
  visible items' fields under `select`). The surface package only knows the
  shape (`ConnectionRequirement { identity, window, select }`); Remote adds the
  `ref`. `Requirement.mergeConnections` unions what one connection and window
  select, so two projections of one list plan one query.
- **Nothing in Mixins or Agent needs to change.** Scenario 5 is a plain
  assignment.

## Hover pass (item 14)

The compiler's own hover (`checker.typeToString` with `NoTruncation` over the
fixture's declarations, which is what an editor shows) for every public value
the scenarios produce:

| Declaration | Hover |
| --- | --- |
| `ProjectSummary` | `Selection<{ readonly id: string & Brand<"ProjectId">; readonly name: string; readonly owner: { readonly id: string; readonly name: string }; readonly status: string }, "Project", "entity">` |
| `Data.get(…)` | `Projection<AppModel, RemoteData<{ …the value… }>>` |
| `projects` | `QueryProjection<AppModel, { …the value… }, "ProjectsByOwner", { readonly ownerId: string }>` |
| `Data.next(…)` | `QueryRef<"ProjectsByOwner", { readonly ownerId: string }> \| undefined` |
| `Data.fetch(…)` | Foldkit's `Command<RemoteMessage, never, RemoteClient>` (displayed as its `Readonly<{ name; args?; key?; effect }>` body) |
| `ProjectPage` | `Surface<AppModel, { readonly project: RemoteData<{ …value… }>; readonly projects: RemoteData<Page<{ …value… }>> }, { readonly _tag: "ArchiveProject"; readonly id: string & Brand<"ProjectId"> }, { readonly projectId: string & Brand<"ProjectId"> }>` |
| `Home` | `Surface<AppModel, { readonly project: RemoteData<{ …value… }> }, never, void>` |
| `Data.subscriptions(…)` | `Readonly<Record<string, RemoteEntry<AppModel, any>>>` |
| `Data` | `RemoteDomain<AppModel, RemoteModel, readonly [EntityDescriptor<"User", {…fields…}>, …], readonly [QueryDescriptor<"ProjectsByOwner", …>], readonly [MutationDescriptor<…>, …]>` |

One fix came out of it: a Surface's Model showed as `StructValue<{ project:
Projection<…>; projects: QueryProjection<…> }>`, the internal alias over the
entries rather than the projected value. `StructValue` now resolves eagerly
(through `extends infer Value ? { [K in keyof Value]: Value[K] } : never`), so
the hover is the object of `RemoteData` values a view reads. Everything else
already read as user concepts: no phantom generic reaches a hover, `Invalid`
carries the one-line error message (item 13), and the two long shapes left are
Effect's brand display and `Data` itself, whose type arguments are the declared
descriptors (what a reader hovering the domain would want to see). The fixture
pins the shapes by assignment (`_page`, `_home`, `_bare`, `_projects`, `_next`,
`_loadMore`) and the branded messages by type equality.

## Status

Phase B implemented items 1, 2, 3, 9, 11, and 12 as decided above, replacing
the `Dx` stubs in the fixture with the real exports one by one; Phase C items
4–6; Phase D items 7–8 (the kernel change: the connection Projection, query
requirements in the planner, the read entry, the retain roots, and the
coalescer). Phase E is the polish and the docs rewrite.
