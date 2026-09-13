/**
 * Phase A of #69: the candidate application API, declared but not implemented,
 * exercised on the five scenarios the issue names. Every `Dx.*` value below is
 * a `declare`d stub over the real kernel types, so what this file proves is
 * inference, hover shape, and error placement — not behavior. When an item
 * lands, its stub is replaced by the real export and the scenario stays.
 */
import type { Effect } from 'effect'
import { Schema } from 'effect'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import { defineMessageUnion } from 'foldkit/message'
import { Surface, type Application, type ModelRef, type Projection } from 'foldkit-surface'
import {
  Entity,
  Remote,
  Selection,
  type EntityDescriptor,
  type EntityPatch,
  type MutationDescriptor,
  type OptimisticOperation,
  type Page,
  type QueryDescriptor,
  type QueryRef,
  type RemoteClient,
  type RemoteData,
  type RemoteMessage,
  type RemoteModel,
  type RemoteMutationError,
  type SelectionOf,
  type SelectionValue,
} from '../src/index.js'

// ===========================================================================
// Candidate API (stubs)
// ===========================================================================

/** Item 3: the Entity is the receiver of its selections and patches. */
interface DxEntity<Name extends string, F extends Schema.Struct.Fields> extends EntityDescriptor<
  Name,
  F
> {
  select<const Sel extends SelectionOf<F>>(
    selection: Sel,
  ): Selection<SelectionValue<F, Sel>, Name, 'entity'>
  patch(id: string, values: Partial<Schema.Struct.Encoded<F>>): EntityPatch<Name, F>
}

/** Item 7: a query declared with its result entity, so `select` can be constrained to it. */
interface DxQuery<Name extends string, Input, Entity extends string> extends QueryDescriptor<
  Name,
  Input,
  { readonly entity: Entity }
> {}

type NameOf<D> =
  D extends DxEntity<infer N, any> ? N : D extends EntityDescriptor<infer N, any> ? N : never
type QueryInput<Q> = Q extends DxQuery<any, infer I, any> ? I : never
type QueryEntity<Q> = Q extends DxQuery<any, any, infer E> ? E : never
type MutationInput<M> = M extends MutationDescriptor<any, infer I, any> ? I : never
type MutationOutput<M> = M extends MutationDescriptor<any, any, infer O> ? O : never

/** Items 7/8: one side or the other, never both; `never` keys make the mix an error. */
type DxWindow =
  | {
      readonly first: number
      readonly after?: string
      readonly last?: never
      readonly before?: never
    }
  | {
      readonly last: number
      readonly before?: string
      readonly first?: never
      readonly after?: never
    }

interface DxMutateOptions {
  readonly requestId?: string
  readonly optimistic?:
    | ReadonlyArray<OptimisticOperation>
    | ((ids: {
        readonly requestId: string
        readonly tempId: string
      }) => ReadonlyArray<OptimisticOperation>)
}

/** Item 5: a Surface plus the params it is active with. */
interface DxActive<AppModel> {
  readonly surface: { readonly projection: (params: any) => Projection<AppModel, unknown> }
  readonly params: unknown
}

/** Items 1, 2, 5–9: the bound domain. */
interface DxData<
  AppModel,
  Names extends string,
  Queries extends readonly DxQuery<any, any, any>[],
  Mutations extends readonly MutationDescriptor<any, any, any>[],
> {
  readonly Model: Schema.Schema<RemoteModel>
  readonly store: ModelRef<AppModel, RemoteModel>
  get<Value, Name extends Names>(
    selection: Selection<Value, Name, 'entity'>,
    id: string,
  ): Projection<AppModel, RemoteData<Value>>
  live<Value, Name extends Names>(
    selection: Selection<Value, Name, 'entity'>,
    id: string,
  ): Projection<AppModel, RemoteData<Value>>
  query<Q extends Queries[number], Value>(
    query: Q,
    input: QueryInput<Q>,
    options: { readonly select: Selection<Value, QueryEntity<Q>, 'entity'> } & DxWindow,
  ): Projection<AppModel, RemoteData<Page<Value>>>
  next<Q extends Queries[number]>(
    model: AppModel,
    projection: Projection<AppModel, RemoteData<Page<unknown>>> & { readonly query: Q },
  ): QueryRef<Q['name'], QueryInput<Q>> | undefined
  mutate<M extends Mutations[number]>(
    mutation: M,
    input: MutationInput<M>,
    options?: DxMutateOptions,
  ): Effect.Effect<
    { readonly output: MutationOutput<M>; readonly model: AppModel },
    RemoteMutationError,
    RemoteClient
  >
  subscriptions(
    active: ReadonlyArray<DxActive<AppModel>>,
    options?: { readonly grace?: string },
  ): ReadonlyArray<EntryWithoutKeepAlive<AppModel, RemoteMessage, unknown, RemoteClient>>
  reduce(model: AppModel, message: RemoteMessage): AppModel
}

declare const Dx: {
  /** Item 1: the submodel schema is entity-independent, so it exists before the domain is bound. */
  readonly Model: Schema.Schema<RemoteModel>
  readonly initial: RemoteModel
  /** Item 11: Remote's Message cases, spreadable into an application's union. */
  readonly messages: {
    readonly ReadReceived: Schema.Struct.Fields
    readonly MutationSucceeded: Schema.Struct.Fields
  }
  readonly reduces: (message: { readonly _tag: string }) => message is RemoteMessage
  entity<const Name extends string, F extends Schema.Struct.Fields>(
    name: Name,
    schema: Schema.Struct<F>,
  ): DxEntity<Name, F>
  query<const Name extends string, Input extends Schema.Struct.Fields, E extends string>(
    name: Name,
    config: { readonly input: Input; readonly entity: { readonly name: E } },
  ): DxQuery<Name, Schema.Struct.Type<Input>, E>
  mutation<
    const Name extends string,
    Input extends Schema.Struct.Fields,
    Output extends Schema.Struct.Fields,
  >(
    name: Name,
    config: { readonly input: Input; readonly output: Output },
  ): MutationDescriptor<Name, Schema.Struct.Type<Input>, Schema.Struct.Type<Output>>
  make<
    AppModel,
    const Entities extends readonly EntityDescriptor<any, any>[],
    const Queries extends readonly DxQuery<any, any, any>[] = readonly [],
    const Mutations extends readonly MutationDescriptor<any, any, any>[] = readonly [],
  >(config: {
    readonly model: ModelRef<AppModel, RemoteModel>
    readonly entities: Entities
    readonly queries?: Queries
    readonly mutations?: Mutations
  }): DxData<AppModel, NameOf<Entities[number]>, Queries, Mutations>
}

/** Item 4: `App.surface` with plain params fields and an object of Projections. */
type ProjectionValue<P> = P extends Projection<any, infer V> ? V : never
declare const dxSurface: <
  Root,
  F extends Schema.Struct.Fields,
  Cases extends Record<string, Schema.Struct.Fields>,
  const Params extends Schema.Struct.Fields = {},
  Fields extends Record<string, Projection<Root, unknown>> = Record<
    string,
    Projection<Root, unknown>
  >,
  const Ms extends readonly ((
    ...args: never[]
  ) => Schema.Schema.Type<Application<Root, F, Cases>['Message']>)[] = readonly [],
>(
  app: Application<Root, F, Cases>,
  name: string,
  config: {
    readonly params?: Params
    readonly model: (context: { readonly params: Schema.Struct.Type<Params> }) => Fields
    readonly messages?: Ms
  },
) => Surface<
  Root,
  { readonly [K in keyof Fields]: ProjectionValue<Fields[K]> },
  Ms[number] extends (...args: never[]) => infer M ? M : never,
  Schema.Struct.Type<Params>
>

// ===========================================================================
// Domain (shared by the scenarios)
// ===========================================================================

const ProjectId = Schema.String.pipe(Schema.brand('ProjectId'))
type ProjectId = typeof ProjectId.Type

const User = Dx.entity('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Comment = Dx.entity('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Project = Dx.entity(
  'Project',
  Schema.Struct({
    id: ProjectId,
    name: Schema.String,
    status: Schema.String,
    owner: Entity.ref(User),
    comments: Entity.refPage(Comment),
  }),
)
/** Declared the kernel way, never bound: registration is by reference. */
const Team = Entity.make('Team', Schema.Struct({ id: Schema.String, name: Schema.String }))

const UserSummary = User.select({ id: true, name: true })
const ProjectSummary = Project.select({ id: true, name: true, status: true, owner: UserSummary })

const ProjectsByOwner = Dx.query('ProjectsByOwner', {
  input: { ownerId: Schema.String },
  entity: Project,
})
const RenameProject = Dx.mutation('RenameProject', {
  input: { id: ProjectId, name: Schema.String },
  output: { id: ProjectId },
})
const AddComment = Dx.mutation('AddComment', {
  input: { projectId: ProjectId, body: Schema.String },
  output: { id: Schema.String },
})

const Model = Schema.Struct({ route: Schema.String, remote: Dx.Model })
const Message = defineMessageUnion({ ...Dx.messages, ArchiveProject: { id: ProjectId } })
const App = Surface.application({ Model, Message })
type AppModel = typeof Model.Type

const Data = Dx.make({
  model: App.model.remote,
  entities: [User, Project, Comment],
  queries: [ProjectsByOwner],
  mutations: [RenameProject, AddComment],
})

// ===========================================================================
// Scenario 1 — Project with a nested owner selection
// ===========================================================================

// Hover target: the selected value, flattened.
const _summary: Selection<
  {
    readonly id: ProjectId
    readonly name: string
    readonly status: string
    readonly owner: { readonly id: string; readonly name: string }
  },
  'Project',
  'entity'
> = ProjectSummary

// Same inference as the kernel constructor, without naming the entity twice.
const _kernel: typeof ProjectSummary = Selection.make(Project, {
  id: true,
  name: true,
  status: true,
  owner: UserSummary,
})

const project = Data.get(ProjectSummary, 'p1')
const _project: Projection<
  AppModel,
  RemoteData<{
    readonly id: ProjectId
    readonly name: string
    readonly status: string
    readonly owner: { readonly id: string; readonly name: string }
  }>
> = project

// @ts-expect-error `nope` is not a field of User
User.select({ nope: true })
// @ts-expect-error a nested selection must be of the field's target entity
Project.select({ owner: Project.select({ id: true }) })
// @ts-expect-error Team is declared but not registered with Data
Data.get(Team.select({ id: true }), 't1')

// ===========================================================================
// Scenario 2 — a paginated list with next()
// ===========================================================================

const projects = Data.query(
  ProjectsByOwner,
  { ownerId: 'u1' },
  { select: ProjectSummary, first: 25 },
)
const _projects: Projection<
  AppModel,
  RemoteData<
    Page<{
      readonly id: ProjectId
      readonly name: string
      readonly status: string
      readonly owner: { readonly id: string; readonly name: string }
    }>
  >
> = projects

// @ts-expect-error the query's input is typed from its declaration
Data.query(ProjectsByOwner, { owner: 'u1' }, { select: ProjectSummary, first: 25 })
// @ts-expect-error `select` must be of the query's entity
Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: UserSummary, first: 25 })
// @ts-expect-error `first` and `last` are exclusive
Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, first: 25, last: 5 })
// @ts-expect-error `after` pages forward only
Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, last: 5, after: 'c' })

// ===========================================================================
// Scenario 3 — optimistic comment insert
// ===========================================================================

const added = Data.mutate(
  AddComment,
  { projectId: 'p1' as ProjectId, body: 'hi' },
  {
    optimistic: ({ tempId }) => [
      Comment.patch(tempId, { id: tempId, body: 'hi' }),
      // The kernel constructor; a `Project.comments.prepend(...)` sugar is out of scope.
      {
        _tag: 'Insert',
        connection: 'Project:p1.comments',
        position: 'prepend',
        edge: { key: `Comment:${tempId}`, ref: { entity: 'Comment', id: tempId } },
      },
    ],
  },
)
const _added: Effect.Effect<
  { readonly output: { readonly id: string }; readonly model: AppModel },
  RemoteMutationError,
  RemoteClient
> = added

// Explicit id for a durable bridge or a test.
Data.mutate(RenameProject, { id: 'p1' as ProjectId, name: 'Apollo II' }, { requestId: 'req-1' })

// @ts-expect-error the mutation's input is typed from its declaration
Data.mutate(RenameProject, { id: 'p1', title: 'x' })
// @ts-expect-error a mutation not registered with Data
Data.mutate(Remote.make({ entities: [] }) as never as MutationDescriptor<'Other', {}, {}>, {})

// ===========================================================================
// Scenario 4 — a Surface with a Remote value and a restricted Message set
// ===========================================================================

const ProjectPage = dxSurface(App, 'ProjectPage', {
  params: { projectId: ProjectId },
  model: ({ params }) => ({
    project: Data.live(ProjectSummary, params.projectId),
    projects: Data.query(ProjectsByOwner, { ownerId: 'u1' }, { select: ProjectSummary, first: 25 }),
  }),
  messages: [Message.ArchiveProject],
})

// Hover target: the projected Model and Params are user concepts.
const _page: Surface<
  AppModel,
  {
    readonly project: RemoteData<{
      readonly id: ProjectId
      readonly name: string
      readonly status: string
      readonly owner: { readonly id: string; readonly name: string }
    }>
    readonly projects: RemoteData<
      Page<{
        readonly id: ProjectId
        readonly name: string
        readonly status: string
        readonly owner: { readonly id: string; readonly name: string }
      }>
    >
  },
  { readonly _tag: 'ArchiveProject'; readonly id: ProjectId },
  { readonly projectId: ProjectId }
> = ProjectPage

// The kernel form still accepts the same pieces.
Surface.make(App, 'ProjectPageKernel', {
  Params: Schema.Struct({ projectId: ProjectId }),
  model: ({ params }) => Data.get(ProjectSummary, params.projectId),
  messages: [Message.ArchiveProject],
})

const OtherApp = Surface.application({
  Model: Schema.Struct({ n: Schema.Number }),
  Message: defineMessageUnion({ Other: {} }),
})
const OtherMessage = defineMessageUnion({ Other: {} })
dxSurface(App, 'Wrong', {
  model: () => ({}),
  // @ts-expect-error a Message constructor from another union
  messages: [OtherMessage.Other],
})
void OtherApp

// Item 5: one declaration per feature; the entries are real Subscription entries.
const subscriptions = (model: AppModel) =>
  Data.subscriptions([{ surface: ProjectPage, params: { projectId: model.route as ProjectId } }], {
    grace: '5 seconds',
  })
const _entries: ReadonlyArray<
  EntryWithoutKeepAlive<AppModel, RemoteMessage, unknown, RemoteClient>
> = subscriptions({ route: 'p1', remote: Dx.initial })

// Item 11: Remote's Messages are the application's own; the reducer delegates by tag.
const update = (model: AppModel, message: typeof Message.Type) =>
  Dx.reduces(message) ? Data.reduce(model, message) : model
void update

// ===========================================================================
// Scenario 5 — the same Surface through Mixins and Agent needs nothing new
// ===========================================================================

// `ProjectPage` is a plain `Surface`, so `SurfaceView.define(ProjectPage, …)` and
// `Agent` consume it unchanged; nothing in this issue touches those seams.
const _plainSurface: Surface<AppModel, any, any, any> = ProjectPage
