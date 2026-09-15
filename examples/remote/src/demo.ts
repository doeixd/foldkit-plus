/**
 * A worked Remote + Surface + Mixins trace. `ProjectPage` is a Surface that
 * selects a project out of the Remote store; a SurfaceView renders the
 * `RemoteData` through Style and Behavior. The demo runs the real path — plan,
 * prefetch, select, a stale-while-revalidate refresh, render, mutate,
 * retention, and a decode failure — against an in-process `RemoteClient`.
 */
import { Effect, Layer, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import {
  Attributes,
  Behavior,
  Capability,
  Slot,
  Slots,
  Style,
  type SlotAttributes,
} from 'foldkit-mixins'
import { SurfaceView } from 'foldkit-mixins-surface'
import {
  Entity,
  Mutation,
  Query,
  Remote,
  RemoteClient,
  RemoteData,
  RemotePolicy,
  Selection,
  entityKey,
  writeEntity,
  type EntityStore,
  type Page,
} from 'foldkit-remote'
import { Surface } from 'foldkit-surface'

const Project = Entity.make(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)

const ProjectSummary = Project.select({ id: true, name: true, status: true })

const RenameProject = Mutation.make('RenameProject', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})

// The Remote submodel's schema is the same for every domain, so the Model
// embeds it before the domain is bound; Remote's Messages are cases of the
// application's own union, and `update` hands them to `Data.reduce` by tag.
const Model = Schema.Struct({ remote: Remote.Model, projectId: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Ping: {} })

// `update` names its result: `Data` is bound to `App`, and `App` is built
// from `update`, so the annotation is what keeps the types acyclic.
const App = Surface.application({
  Model,
  Message,
  initial: { remote: Remote.initial, projectId: 'p1' },
  update: (model, message): { readonly model: Model } =>
    Remote.reduces(message) ? { model: Data.reduce(model, message) } : { model },
})

const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  mutations: [RenameProject],
  queries: [ProjectsByOwner],
})

// Params are plain fields and the model an object of Projections; `App.surface`
// lifts both into the Schema.Struct and Projection.struct `Surface.make` takes.
const ProjectPage = App.surface('ProjectPage', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({ project: Data.get(ProjectSummary, params.projectId) }),
  messages: [Message.Ping],
})

type ProjectValue = { readonly id: string; readonly name: string; readonly status: string }
type Projected = { readonly project: RemoteData<ProjectValue> }
type PageMessage = typeof Message.Ping.Type

const ProjectSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  name: Slot.make({ capability: Capability.Container }),
  status: Slot.make({ capability: Capability.Container }),
})

const ProjectStyle = Style.forSlots(ProjectSlots)(
  {
    root: Style.compose(
      Style.class('project-card'),
      Style.inline({ display: 'grid', gap: '0.25rem' }),
    ),
    status: Style.whenInput<Projected>(
      input => input.project._tag === 'Ready' && input.project.value.status === 'archived',
      Style.class('project-card-archived'),
    ),
  },
  { name: 'ProjectStyle' },
)

const StatusBehavior = Behavior.forSlots(ProjectSlots)<Projected, PageMessage>(
  {
    status: Behavior.slot({
      attributes: ({ input, h }) =>
        input.project._tag === 'Ready'
          ? [h.DataAttribute('status', input.project.value.status)]
          : [],
    }),
  },
  { name: 'StatusBehavior' },
)

const describeData = (data: RemoteData<ProjectValue>): string =>
  RemoteData.match(data, {
    Initial: () => 'Initial',
    Loading: () => 'Loading',
    Ready: value => `Ready ${JSON.stringify(value)}`,
    Refreshing: value => `Refreshing ${JSON.stringify(value)}`,
    Failed: error => `Failed ${error._tag}`,
    NotFound: () => 'NotFound',
  })

const describePage = (data: RemoteData<Page<ProjectValue>>): string =>
  RemoteData.match(data, {
    Initial: () => 'Initial',
    Loading: () => 'Loading',
    Ready: page => `Ready ${page.items.map(item => `${item.id} ${item.name}`).join(', ')}`,
    Refreshing: page => `Refreshing ${page.items.map(item => item.id).join(', ')}`,
    Failed: error => `Failed ${error._tag}`,
    NotFound: () => 'NotFound',
  })

const statusText = (data: RemoteData<ProjectValue>): string =>
  RemoteData.match(data, {
    Initial: () => '...',
    Loading: () => '...',
    Ready: value => value.status,
    Refreshing: value => value.status,
    Failed: () => 'error',
    NotFound: () => 'missing',
  })

const classTokens = (attributes: SlotAttributes<PageMessage>): ReadonlyArray<string> =>
  Attributes.find(attributes, 'Class')?.value.split(/\s+/) ?? []

const dataAttribute = (attributes: SlotAttributes<PageMessage>, key: string): string | undefined =>
  Attributes.filter(attributes, 'DataAttribute').find(attribute => attribute.key === key)?.value

const withStore = (model: typeof App.initial, store: EntityStore): typeof App.initial => ({
  ...model,
  remote: { ...model.remote, entities: store },
})

// The server's facts, which the refresh step changes behind the client's back.
const server: { names: Record<string, string>; owned: ReadonlyArray<string> } = {
  names: { p1: 'Apollo' },
  owned: ['p1'],
}

/** An in-process `RemoteClient`; no server, but the whole path is the real one. */
const FakeClient = Layer.succeed(RemoteClient, {
  read: batch =>
    Effect.sync(() => ({
      entities: batch.requests.map(request => ({
        entity: request.entity,
        id: request.id,
        values: { id: request.id, name: server.names[request.id], status: 'active' },
      })),
    })),
  query: () =>
    Effect.sync(() => ({
      edges: server.owned.map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
      start: { _tag: 'Terminal' as const },
      end: { _tag: 'Terminal' as const },
    })),
  mutate: request =>
    Effect.sync(() => {
      const input = request.input as { readonly id: string; readonly name: string }
      return {
        output: { id: input.id },
        entities: [{ entity: 'Project', id: input.id, values: { name: input.name } }],
      }
    }),
  live: () => Stream.empty,
})

const projects = Data.query(
  ProjectsByOwner,
  { ownerId: 'u1' },
  { select: ProjectSummary, first: 25 },
)

// A Surface without params, so `Data.refresh` takes it directly.
const Dashboard = App.surface('Dashboard', {
  model: () => ({ project: Data.get(ProjectSummary, 'p1'), projects }),
})

/** Runs the Dashboard's read entry, as the mounted Subscription would, until it plans nothing. */
const observeDashboard = async (
  model: Model,
): Promise<{ readonly model: Model; readonly tags: ReadonlyArray<string> }> => {
  const entry = Data.subscriptions({ dashboard: Dashboard })['dashboard.read']
  let current = model
  const tags: string[] = []
  // The page first, then the items it newly references; the cap only stops a runaway loop.
  for (let pass = 0; pass < 3; pass += 1) {
    const dependencies = entry.modelToDependencies(current)
    if (dependencies.requirements.length === 0 && dependencies.queries.length === 0) break
    const messages = await Effect.runPromise(
      Stream.runCollect(entry.dependenciesToStream(dependencies)).pipe(Effect.provide(FakeClient)),
    )
    tags.push(...Array.from(messages, message => message._tag))
    current = messages.reduce(Data.reduce, current)
  }
  return { model: current, tags }
}

export const runDemo = async (): Promise<ReadonlyArray<string>> => {
  server.names = { p1: 'Apollo' }
  server.owned = ['p1']
  const lines: string[] = ['surface: ProjectPage']

  const initial = App.initial
  const projection = Data.get(ProjectSummary, 'p1')
  const requirements = Data.plan(initial, ProjectPage.projection({ projectId: 'p1' }))
  lines.push(
    `plan: ${requirements.map(entry => `${entry.entity}:${entry.id} [${entry.fields.join(',')}]`).join(', ')}`,
  )
  lines.push(`before fetch: ${describeData(projection.read(initial))}`)

  // The store stamps each write with the clock it is given, so the refresh
  // below can decide staleness without waiting.
  const loaded = await Effect.runPromise(
    Data.prefetch(initial, projection, { now: () => 1_000 }).pipe(Effect.provide(FakeClient)),
  )
  lines.push(`after fetch: ${describeData(projection.read(loaded))}`)

  // A refreshing policy keeps the value visible while it refetches: the
  // Subscription emits RefreshStarted (the projection reads Refreshing) and
  // then the read result (Ready again). `Data.subscriptions` derives the entry
  // from the active Surface; it emits `RemoteMessage`s that `Data.reduce` takes.
  const refreshing = Data.subscriptions(
    { page: Surface.at(ProjectPage, { projectId: 'p1' }) },
    { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 30_000 }), now: () => 60_000 },
  )['page.read']
  const refreshMessages = await Effect.runPromise(
    Stream.runCollect(refreshing.dependenciesToStream(refreshing.modelToDependencies(loaded))).pipe(
      Effect.provide(FakeClient),
    ),
  )
  // The announcements first: `ReadStarted` marks what is being fetched and
  // `RefreshStarted` marks the present fields stale, so the value reads
  // `Refreshing` until the result lands.
  const midRefresh = refreshMessages
    .filter(message => message._tag !== 'ReadReceived')
    .reduce(Data.reduce, loaded)
  const refreshed = refreshMessages.reduce(Data.reduce, loaded)
  lines.push(
    `stale-while-revalidate: ${refreshMessages.map(message => message._tag).join(', ')}; ${describeData(projection.read(midRefresh))} -> ${describeData(projection.read(refreshed))}`,
  )

  // A query is a Projection too: the connection read as a page of the selected
  // items. The prefetch runs the query, then one read for whatever the page's
  // items still lack (nothing here: p1 is already known), and `Data.next` is
  // the following page, or nothing at the end.
  const queried = await Effect.runPromise(
    Data.prefetch(loaded, projects).pipe(Effect.provide(FakeClient)),
  )
  lines.push(
    `query page: ${describePage(projects.read(queried))}; next page: ${
      Data.next(queried, projects) === undefined ? 'none' : 'available'
    }`,
  )
  const inspection = Data.inspect(queried)
  lines.push(
    `inspect: ${inspection.entities.length} entities, ${inspection.connections.length} connection, ${Data.registry.queries.size} registered queries`,
  )

  let resolved:
    | {
        readonly root: SlotAttributes<PageMessage>
        readonly name: SlotAttributes<PageMessage>
        readonly status: SlotAttributes<PageMessage>
      }
    | undefined
  const ProjectView = SurfaceView.define(ProjectPage, ProjectSlots, (model, slots, h) => {
    resolved = {
      root: slots.root.attrs(),
      name: slots.name.attrs(),
      status: slots.status.attrs(),
    }
    return h.article(resolved.root, [
      h.h2(resolved.name, [describeData(model.project)]),
      h.span(resolved.status, [statusText(model.project)]),
    ])
  }).pipe(Style.attach(ProjectStyle), Behavior.attach(StatusBehavior))

  SurfaceView.render(ProjectView, ProjectPage, { projectId: 'p1' }, loaded)
  const view = resolved!
  lines.push(`rendered classes: ${classTokens(view.root).join(' ')}`)
  lines.push(`rendered status: ${String(dataAttribute(view.status, 'status'))}`)

  // `Data.mutate` is what `update` calls: the request starts in the Model with
  // an id from the Model's own sequence, and the returned Command's Message
  // settles it. Here the Command runs and its Message is reduced in place.
  const rename = Data.mutate(loaded, RenameProject, { id: 'p1', name: 'Apollo II' })
  const settled = await Effect.runPromise(rename.command.effect.pipe(Effect.provide(FakeClient)))
  const renamed = Data.reduce(rename.model, settled)
  lines.push(`mutation RenameProject (${rename.requestId}): ${settled._tag}`)
  lines.push(`after mutation: ${describeData(projection.read(renamed))}`)

  // Retention: the roots are what the active Surfaces reach. A project the page
  // does not select, and a connection nobody lists, are collected; the page's
  // project stays.
  const crowded = withStore(
    queried,
    writeEntity(renamed.remote.entities, entityKey('Project', 'p2'), { name: 'Borealis' }),
  )
  const retain = Remote.retain([ProjectPage.projection({ projectId: 'p1' })])
  const retention = await Effect.runPromise(
    Stream.runHead(retain.dependenciesToStream(retain.modelToDependencies(crowded))),
  )
  const kept = Data.inspect(Data.reduce(crowded, Option.getOrThrow(retention)))
  const before = Data.inspect(crowded)
  lines.push(
    `retained: ${kept.entities.map(entry => entry.key).join(', ')}; ${before.entities.length - kept.entities.length} entity and ${before.connections.length - kept.connections.length} connection collected`,
  )

  const corrupted = withStore(
    loaded,
    writeEntity(Data.storeOf(loaded), entityKey('Project', 'p1'), { status: 42 }),
  )
  lines.push(`corrupt store: ${describeData(projection.read(corrupted))}`)

  // The server renames p1 and moves the list to p2 alone. `Data.refresh` is what
  // a ClickedRefresh branch of `update` returns: no I/O, only marks. The read
  // entry then refetches the marked fields and the invalidated connection.
  server.names = { p1: 'Artemis', p2: 'Borealis' }
  server.owned = ['p2']
  const marked = Data.refresh(queried, Dashboard)
  lines.push(
    `refresh: ${describeData(projection.read(marked))}; list ${describePage(projects.read(marked))}; again unchanged: ${Data.refresh(marked, Dashboard) === marked}`,
  )
  const reloaded = await observeDashboard(marked)
  lines.push(
    `after refresh: ${reloaded.tags.join(', ')}; ${describeData(projection.read(reloaded.model))}; list ${describePage(projects.read(reloaded.model))}`,
  )

  return lines
}
