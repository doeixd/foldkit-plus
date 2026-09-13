/**
 * The application API from #69 on the five scenarios the issue names, checked
 * for inference, hover shape, and error placement. Every item of Phases B–D
 * (1–12) is the real export; this file is the compile-time contract they keep.
 */
import type { Effect } from 'effect'
import { Schema } from 'effect'
import type { Command } from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import { Surface, type Projection } from 'foldkit-surface'
import {
  ConnectionChange,
  Entity,
  Mutation,
  Query,
  Remote,
  Selection,
  type MutationDescriptor,
  type Page,
  type QueryDescriptor,
  type QueryRef,
  type RemoteClient,
  type RemoteData,
  type RemoteEntry,
  type RemoteMessage,
} from '../src/index.js'

// ===========================================================================
// Domain (shared by the scenarios) — the real API
// ===========================================================================

const ProjectId = Schema.String.pipe(Schema.brand('ProjectId'))
type ProjectId = typeof ProjectId.Type

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Comment = Entity.make('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: ProjectId,
    name: Schema.String,
    status: Schema.String,
    owner: Entity.ref(User),
    comments: Entity.refPage(Comment),
  }),
)
/** Declared but never registered: registration is by reference. */
const Team = Entity.make('Team', Schema.Struct({ id: Schema.String, name: Schema.String }))

// Item 3: the entity is the receiver of its selections.
const UserSummary = User.select({ id: true, name: true })
const ProjectSummary = Project.select({ id: true, name: true, status: true, owner: UserSummary })

// Item 12: fields where a Struct is expected; `Result: Project` is a connection over Project.
const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})
const RenameProject = Mutation.make('RenameProject', {
  Input: { id: ProjectId, name: Schema.String },
  Output: { id: ProjectId },
})
const AddComment = Mutation.make('AddComment', {
  Input: { projectId: ProjectId, body: Schema.String },
  Output: Schema.Struct({ id: Schema.String }),
})

// Item 1: the submodel schema exists before the domain is bound.
const Model = Schema.Struct({ route: Schema.String, remote: Remote.Model })
type AppModel = typeof Model.Type
// Item 11: Remote's Messages are the application's own cases.
const Message = defineMessageUnion({ ...Remote.messages, ArchiveProject: { id: ProjectId } })
const App = Surface.application({ Model, Message })

const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project, Comment],
  queries: [ProjectsByOwner],
  mutations: [RenameProject, AddComment],
})

// ===========================================================================
// Scenario 1 — Project with a nested owner selection
// ===========================================================================

type ProjectValue = {
  readonly id: ProjectId
  readonly name: string
  readonly status: string
  readonly owner: { readonly id: string; readonly name: string }
}

// Hover target: the selected value, flattened.
const _summary: Selection<ProjectValue, 'Project', 'entity'> = ProjectSummary

// Same inference as the kernel constructor, without naming the entity twice.
const _kernel: typeof ProjectSummary = Selection.make(Project, {
  id: true,
  name: true,
  status: true,
  owner: UserSummary,
})

const project = Data.get(ProjectSummary, 'p1')
const _project: Projection<AppModel, RemoteData<ProjectValue>> = project

// @ts-expect-error `nope` is not a field of User
User.select({ nope: true })
// @ts-expect-error a nested selection must be of the field's target entity
Project.select({ owner: Comment.select({ id: true }) })
// @ts-expect-error Team is declared but not registered with Data
Data.get(Team.select({ id: true }), 't1')
// @ts-expect-error nor may it be read live
Data.live(Team.select({ id: true }), 't1')

// ===========================================================================
// Scenario 2 — a paginated list with next() (items 7, 8)
// ===========================================================================

// Item 7: `select` is constrained to the query's entity (here `Project`), and
// the projection reads a page of the selection's value.
const projects = Data.query(
  ProjectsByOwner,
  { ownerId: 'u1' },
  { select: ProjectSummary, first: 25 },
)
const _projects: Projection<AppModel, RemoteData<Page<ProjectValue>>> = projects
const _projectsRef: QueryRef<'ProjectsByOwner', { readonly ownerId: string }> = projects.ref
// Item 8: the next page is a `QueryRef` of the same query, or nothing.
const _next: QueryRef<'ProjectsByOwner', { readonly ownerId: string }> | undefined = Data.next(
  { route: 'p1', remote: Remote.initial },
  projects,
)
const _previous: QueryRef<'ProjectsByOwner', { readonly ownerId: string }> | undefined =
  Data.previous({ route: 'p1', remote: Remote.initial }, projects)
const _loadMore: Command<RemoteMessage, never, RemoteClient> = Data.fetch(projects.ref)
// @ts-expect-error the input is the query's
Data.query(ProjectsByOwner, { owner: 'u1' }, { select: ProjectSummary })

// The query's input is typed from its fields today.
const _ref: QueryRef<'ProjectsByOwner', { readonly ownerId: string }> = ProjectsByOwner.ref({
  ownerId: 'u1',
})
// @ts-expect-error the query's input is typed from its declaration
ProjectsByOwner.ref({ owner: 'u1' })
// @ts-expect-error `select` must be of the query's entity
Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: UserSummary, first: 25 })
// @ts-expect-error `first` and `last` are exclusive
Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, first: 25, last: 5 })
// @ts-expect-error `after` pages forward only
Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, last: 5, after: 'c' })

// ===========================================================================
// Scenario 3 — optimistic comment insert (items 9, 10)
// ===========================================================================

const model: AppModel = { route: 'p1', remote: Remote.initial }

const added = Data.mutate(
  model,
  AddComment,
  { projectId: 'p1' as ProjectId, body: 'hi' },
  {
    optimistic: ({ tempId }) => [
      Comment.patch(tempId, { id: tempId, body: 'hi' }),
      ConnectionChange.prepend('Project:p1.comments', Comment.ref(tempId)),
    ],
  },
)
const _started: AppModel = added.model
const _requestId: string = added.requestId
const _command: Command<RemoteMessage, never, RemoteClient> = added.command
const _settles: Effect.Effect<RemoteMessage, never, RemoteClient> = added.command.effect

// Explicit id for a durable bridge or a test.
Data.mutate(model, RenameProject, { id: 'p1' as ProjectId, name: 'Apollo II' }, { requestId: 'r1' })

// @ts-expect-error the mutation's input is typed from its declaration
Data.mutate(model, RenameProject, { id: 'p1', title: 'x' })
const Other = Mutation.make('Other', { Input: {}, Output: {} })
// @ts-expect-error a mutation not registered with Data
Data.mutate(model, Other, {})

// ===========================================================================
// Scenario 4 — a Surface with a Remote value and a restricted Message set
// ===========================================================================

// Item 4: plain params fields become the Params Struct; the object of
// Projections becomes Projection.struct. Item 6: `live` where the value is declared.
const ProjectPage = App.surface('ProjectPage', {
  params: { projectId: ProjectId },
  model: ({ params }) => ({
    project: Data.live(ProjectSummary, params.projectId),
    projects: Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, first: 25 }),
  }),
  messages: [Message.ArchiveProject],
})
// A Surface without params, and one whose model is a single Projection.
const Home = App.surface('Home', { model: () => ({ project: Data.get(ProjectSummary, 'p1') }) })
const Bare = App.surface('Bare', {
  params: Schema.Struct({ projectId: ProjectId }),
  model: ({ params }) => Data.get(ProjectSummary, params.projectId),
})
const _home: Surface<AppModel, { readonly project: RemoteData<ProjectValue> }, never, void> = Home
const _bare: Surface<
  AppModel,
  RemoteData<ProjectValue>,
  never,
  { readonly projectId: ProjectId }
> = Bare

// Hover target: the projected Model and Params are user concepts.
const _page: Surface<
  AppModel,
  {
    readonly project: RemoteData<ProjectValue>
    readonly projects: RemoteData<Page<ProjectValue>>
  },
  { readonly _tag: 'ArchiveProject'; readonly id: ProjectId },
  { readonly projectId: ProjectId }
> = ProjectPage

// The kernel form takes the same pieces today.
Surface.make(App, 'ProjectPageKernel', {
  Params: Schema.Struct({ projectId: ProjectId }),
  model: ({ params }) => Data.get(ProjectSummary, params.projectId),
  messages: [Message.ArchiveProject],
})

const OtherMessage = defineMessageUnion({ Other: {} })
App.surface('Wrong', {
  model: () => ({}),
  // @ts-expect-error a Message constructor from another union
  messages: [OtherMessage.Other],
})

// Item 5: one declaration per feature. Activation is a Model fact: a Surface's
// params are a function of the Model (`undefined` while inactive), and the
// entries are what `Subscription.make` takes.
const subscriptions = Data.subscriptions(
  {
    page: Surface.at(ProjectPage, current =>
      current.route === '' ? undefined : { projectId: current.route as ProjectId },
    ),
    home: Home,
  },
  { grace: '5 seconds' },
)
const _entries: Readonly<Record<string, RemoteEntry<AppModel, any>>> = subscriptions
const _foldkit = Subscription.make<AppModel, typeof Message.Type, RemoteClient>()(
  () => subscriptions,
)
void _foldkit
// @ts-expect-error a Surface with params is activated through Surface.at
Data.subscriptions({ page: ProjectPage })

// Item 11: Remote's Messages are the application's own; `update` delegates by tag.
const update = (current: AppModel, message: typeof Message.Type): AppModel =>
  Remote.reduces(message) ? Data.reduce(current, message) : current
void update
// The union constructs them like any other case.
const _received: typeof Message.Type = Message.ReadReceived({
  requests: [],
  result: { entities: [] },
  now: 0,
})

// ===========================================================================
// Scenario 5 — the same Surface through Mixins and Agent needs nothing new
// ===========================================================================

// `ProjectPage` is a plain `Surface`, so `SurfaceView.define(ProjectPage, …)` and
// `Agent` consume it unchanged; nothing in this issue touches those seams.
const _plainSurface: Surface<AppModel, any, any, any> = ProjectPage
