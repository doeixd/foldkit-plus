/**
 * The Quick start from this package's README, type-checked so the
 * documentation cannot drift from the API. `Route` and `rpcClient` stand in
 * for what an application supplies.
 */
import { Effect, Layer, Schema, Option } from 'effect'
import { FetchHttpClient } from 'effect/http'
import { RpcClient, RpcSerialization } from 'effect/rpc'
import { expectTypeOf } from 'vitest'
import { Entity as DomainEntity, Expr, Order, Write, type AnyQuery } from 'foldkit-entity'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Surface } from 'foldkit-surface'
import {
  Diagnostics,
  Entity,
  Freshness,
  Mutation,
  Query,
  Refusal,
  Remote,
  RemoteData,
  RemoteClient,
  RemotePolicy,
  RemoteRpc,
  type LiveDependencies,
  type MutationStarted,
  type ReadDependencies,
  type RemoteRpcClient,
  type RemoteMessage,
  type RetentionRoots,
} from '../src/index.js'
import { port } from '../src/port.js'

const Route = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('home') }),
  Schema.Struct({ _tag: Schema.Literal('project'), projectId: Schema.String }),
])
const home = (): typeof Route.Type => ({ _tag: 'home' })
declare const rpcClient: RemoteRpcClient

// 1. Declare the domain
const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Project = Entity.make(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    owner: Entity.ref(User),
  }),
)

const UserSummary = User.select({ id: true, name: true })
const ProjectSummary = Project.select({ id: true, name: true, status: true, owner: UserSummary })

const ProjectsByOwner = Query.make('ProjectsByOwner', {
  Input: { ownerId: Schema.String },
  Result: Project,
})
const RenameProject = Mutation.make('RenameProject', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})

// 2. Embed the submodel and bind the domain
const Model = Schema.Struct({ route: Route, remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({
  ...Remote.messages,
  ClickedRename: { id: Schema.String, name: Schema.String },
  ClickedMore: {},
})
type Message = typeof Message.Type

const App = Surface.application({
  Model,
  Message,
  initial: { route: home(), remote: Remote.initial },
  update,
})

const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Project],
  queries: [ProjectsByOwner],
  mutations: [RenameProject],
})

// 3. Read in a Surface
const projects = Data.query(
  ProjectsByOwner,
  { ownerId: 'u1' },
  { select: ProjectSummary, first: 25 },
)

const ProjectPage = App.surface('ProjectPage', {
  params: { projectId: Schema.String },
  model: ({ params }) => ({ project: Data.live(ProjectSummary, params.projectId), projects }),
  messages: [Message.ClickedRename, Message.ClickedMore],
})

// 4. Fetch, subscribe, and retain from the active Surfaces
const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() =>
  Data.subscriptions(
    {
      page: Surface.at(ProjectPage, model =>
        model.route._tag === 'project'
          ? Option.some({ projectId: model.route.projectId })
          : Option.none(),
      ),
    },
    { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 30_000 }), grace: '5 seconds' },
  ),
)

// 5. Mutate and page from update
function update(model: Model, message: Message): Update.Return<Model, Message, RemoteClient> {
  if (Remote.reduces(message)) return { model: Data.reduce(model, message) }
  switch (message._tag) {
    case 'ClickedRename': {
      const { id, name } = message
      const { model: started, command } = Data.mutate(
        model,
        RenameProject,
        { id, name },
        {
          optimistic: [Project.patch(id, { name })],
        },
      )
      return { model: started, commands: [command] }
    }
    case 'ClickedMore':
      return { model: Option.getOrElse(Data.more(model, projects), () => model), commands: [] }
  }
}

// 6. Provide the client
const clientLayer = Remote.clientLayer(rpcClient)

// …or the stock RpcClient over HTTP, handed over as it is.
const httpClientLayer = Layer.unwrap(
  Effect.map(RpcClient.make(RemoteRpc), rpcClient => Remote.clientLayer(rpcClient)),
).pipe(
  Layer.provide(RpcClient.layerProtocolHttp({ url: '/rpc' })),
  Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
)
expectTypeOf(httpClientLayer).toEqualTypeOf<Layer.Layer<RemoteClient>>()

// …or plain JSON over HTTP, for a server answering with `RemoteServer.answer`.
const overHttp = Remote.clientLayer(
  Remote.http('/remote', { headers: () => ({ 'x-session': 'the session token' }) }),
)
expectTypeOf(overHttp).toEqualTypeOf<Layer.Layer<RemoteClient>>()

void subscriptions
void clientLayer

// Policies: two calls, one retain entry
declare const model: Model
{
  const projectPage = Surface.at(ProjectPage, model =>
    model.route._tag === 'project'
      ? Option.some({ projectId: model.route.projectId })
      : Option.none(),
  )
  const owner = Data.active('Owner', () => Option.some(Data.get(UserSummary, 'u1')))

  // Preloading a destination from update.
  const preload = Data.preload(
    { ...model, route: { _tag: 'project', projectId: 'p2' } },
    { project: projectPage },
  )
  expectTypeOf(preload.effect).toEqualTypeOf<Effect.Effect<RemoteMessage, never, RemoteClient>>()

  // Refreshing from update: the record, one entry, or only what failed.
  const actives = { project: projectPage, owner }
  expectTypeOf(Data.refresh(model, actives)).toEqualTypeOf<Model>()
  expectTypeOf(Data.refresh(model, actives.project)).toEqualTypeOf<Model>()
  expectTypeOf(Data.refresh(model, actives, { failed: true })).toEqualTypeOf<Model>()

  // When a write fails: listed by its mutation, retried as itself, or dismissed.
  const failedRenames = Data.failedWrites(model, RenameProject)
  expectTypeOf(failedRenames[0]!.input).toEqualTypeOf<{
    readonly id: string
    readonly name: string
  }>()
  expectTypeOf(Data.retry(model, 'r1')).toEqualTypeOf<Option.Option<MutationStarted<Model>>>()
  expectTypeOf(Data.dismiss(model, 'r1')).toEqualTypeOf<Model>()
  const hearing = Data.wiring(actives, { shared: ['MutationFailed'] })
  expectTypeOf<(typeof hearing.shared)[number]>().toEqualTypeOf<'MutationFailed'>()
  const quiet = Data.wiring(actives)
  expectTypeOf<(typeof quiet.shared)[number]>().toEqualTypeOf<never>()
  // @ts-expect-error a wiring shares only Remote's own Messages
  Data.wiring(actives, { shared: ['ClickedRename'] })

  const pageEntries = Data.subscriptions({ page: projectPage })
  // Retention is the domain's: one `retain` roots every read, so the second
  // call's is left out rather than spread over the first's.
  const { retain: _domainRetain, ...ownerEntries } = Data.subscriptions(
    { owner },
    { policy: RemotePolicy.staleWhileRevalidate({ maxAge: 5_000 }) },
  )
  void _domainRetain

  const subscriptions = Subscription.make<Model, Message, RemoteClient>()(() => ({
    ...pageEntries,
    ...ownerEntries,
  }))

  // Each entry's dependencies are typed, not `any`.
  expectTypeOf(
    subscriptions['page.read'].modelToDependencies(model),
  ).toEqualTypeOf<ReadDependencies>()
  expectTypeOf(
    subscriptions['owner.live'].modelToDependencies(model),
  ).toEqualTypeOf<LiveDependencies>()
  expectTypeOf(subscriptions.retain.modelToDependencies(model)).toEqualTypeOf<RetentionRoots>()
  // @ts-expect-error a read entry's dependencies have no such field
  void subscriptions['page.read'].modelToDependencies(model).cursor
  const folded = Remote.fold(Data, message => message).subscriptions({ owner })
  expectTypeOf(folded['owner.read'].modelToDependencies(model)).toEqualTypeOf<ReadDependencies>()
  // @ts-expect-error a folded read entry's dependencies are typed too
  void folded['owner.read'].modelToDependencies(model).cursor
}

// 7. One list instead of steps 2–6 by hand. This fixture's union has its own
// Messages with Commands, so its section-5 update stays on as `own` — and the
// parent declares `RemoteClient` for it — while the README's Remote-only union
// needs neither.
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const wiring = Page.assemble(
  Data.wiring({
    page: Surface.at(ProjectPage, model =>
      model.route._tag === 'project'
        ? Option.some({ projectId: model.route.projectId })
        : Option.none(),
    ),
  }),
)
const wiredUpdate = wiring.update(update)

void wiredUpdate

// 8. Reading past what is only pending: the same projection over the
// server-derived store alone, for a reader that must not believe a change
// until the server has agreed to it.
declare const projectId: string
const project = Data.get(ProjectSummary, projectId)
const confirmedProject = Data.confirmed(project)
const confirmedProjects = Data.confirmed(projects)

expectTypeOf(confirmedProject.read).toEqualTypeOf<typeof project.read>()
// A query projection keeps the ref its pagination is asked for by.
expectTypeOf(confirmedProjects.ref).toEqualTypeOf<typeof projects.ref>()

// 9. Drawing a RemoteData: the three-way fold that keeps useful data on
// screen, with `notFound` as its own branch.
declare const ProjectSkeleton: () => string
declare const NoSuchProject: () => string
declare const ErrorView: (error: { readonly message: string }) => string
declare const ProjectView: (props: {
  readonly project: { readonly name: string }
  readonly dimmed: boolean
}) => string

declare const currentModel: Model

const drawnProject = RemoteData.render(project.read(currentModel), {
  loading: () => ProjectSkeleton(),
  notFound: () => NoSuchProject(),
  failed: error => ErrorView(error),
  data: (value, freshness) => ProjectView({ project: value, dimmed: freshness._tag !== 'Fresh' }),
})

expectTypeOf(drawnProject).toEqualTypeOf<string>()

// `Freshness` folds through its own exhaustive `match`; the stale one carries its error.
declare const freshness: Freshness
expectTypeOf(
  Freshness.match(freshness, {
    Fresh: () => '',
    Refreshing: () => '',
    Stale: ({ error }) => error.message,
  }),
).toEqualTypeOf<string>()
// @ts-expect-error every state is handled: `Stale` is missing
Freshness.match(freshness, { Fresh: () => '', Refreshing: () => '' })

// Whether nothing answered is asked of any RemoteError, not of a Freshness or a RemoteData.
expectTypeOf(
  RemoteData.isUnreachable({ _tag: 'Unreachable', message: 'x' }),
).toEqualTypeOf<boolean>()
// @ts-expect-error a RemoteData is not the error it may hold
RemoteData.isUnreachable(project.read(currentModel))

// 10. A query declared by what it means. The body is over a foldkit-entity
// Entity, which is what has addressable fields.
const Task = DomainEntity.define(
  'Task',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String, updatedAt: Schema.Number }),
)

const TasksByOwner = Query.define('TasksByOwner', { ownerId: Schema.String }, ({ input }) =>
  Query.from(Task).pipe(
    Query.where(Expr.eq(Task.fields.ownerId, input.ownerId)),
    Query.orderBy(Order.desc(Task.fields.updatedAt), Order.asc(Task.fields.id)),
  ),
)

expectTypeOf(TasksByOwner.name).toEqualTypeOf<'TasksByOwner'>()
expectTypeOf(TasksByOwner.body).toEqualTypeOf<AnyQuery | undefined>()

// 11. The sixty-second example as the README now writes it: the domain
// declared with `foldkit-entity`, which is what can also carry a query body.
const Ticket = DomainEntity.define(
  'Ticket',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const TicketSummary = DomainEntity.select(Ticket, { id: true, name: true })

const TicketModel = Schema.Struct({ remote: Remote.Model })
const TicketApp = Surface.application({ Model: TicketModel, Message })
const Tickets = Remote.make({ model: TicketApp.model.remote, entities: [Ticket] })

const ticket = Tickets.get(TicketSummary, 't1')
expectTypeOf(ticket.read).parameter(0).toEqualTypeOf<typeof TicketModel.Type>()

// Over a MessagePort: a new conversation each time the protocol connects.
declare const worker: SharedWorker
const overPort = port(() => {
  const channel = new MessageChannel()
  worker.port.postMessage({ open: 'remote' }, [channel.port2])
  return channel.port1
})
void overPort

// A refusal as data.
const SetPrice = Mutation.make('SetPrice', {
  Input: { id: Schema.String, price: Schema.Number },
  Output: {},
  Refusal: Schema.Union([Refusal.field('price', Schema.String), Refusal.conflict]),
})
declare const priced: typeof TicketModel.Type
const Priced = Remote.make({
  model: TicketApp.model.remote,
  entities: [Ticket],
  mutations: [SetPrice],
})
expectTypeOf(Priced.refusal(priced, 'SetPrice-1', SetPrice)).toEqualTypeOf<
  Option.Option<
    | { readonly _tag: 'Field'; readonly key: 'price'; readonly reason: string }
    | { readonly _tag: 'Conflict' }
  >
>()

// A mutation that is a declared write.
declare const editing: typeof TicketModel.Type
{
  const Project = DomainEntity.define(
    'Project',
    Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
  )
  const EditProjectInput = Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
  })
  const EditProject = Mutation.write(
    'EditProject',
    Write.update(DomainEntity.input(Project, EditProjectInput), { id: 'id' }),
  )
  const Edits = Remote.make({
    model: TicketApp.model.remote,
    entities: [Project],
    mutations: [EditProject],
  })
  Edits.mutate(
    model,
    EditProject,
    { id: 'p1', name: 'Apollo II', status: 'active' },
    { keys: ['name'] },
  )
  // @ts-expect-error the input is the write's
  Edits.mutate(editing, EditProject, { id: 'p1' })
}

// A time the write sets: the clock read where the action is, then the write started with it.
{
  const Post = DomainEntity.define(
    'Post',
    Schema.Struct({ id: Schema.String, body: Schema.String, createdAt: Schema.Number }),
  ).pipe(DomainEntity.sets({ createdAt: Expr.now }, { on: 'create' }))
  const NewPost = Schema.Struct({ id: Schema.String, body: Schema.String })
  const PostChirp = Mutation.write(
    'PostChirp',
    Write.insert(DomainEntity.input(Post, NewPost), { id: 'id' }),
  )
  const PostModel = Schema.Struct({ remote: Remote.Model })
  type PostModel = typeof PostModel.Type
  const PostMessage = defineMessageUnion({
    ...Remote.messages,
    Posted: { post: NewPost },
    Clocked: { post: NewPost, now: Schema.Number },
  })
  type PostMessage = typeof PostMessage.Type
  const PostApp = Surface.application({ Model: PostModel, Message: PostMessage })
  const Data = Remote.make({
    model: PostApp.model.remote,
    entities: [Post],
    mutations: [PostChirp],
  })
  const Message = PostMessage
  const Own = defineMessageUnion({
    Posted: { post: NewPost },
    Clocked: { post: NewPost, now: Schema.Number },
  })
  const update = (
    model: PostModel,
    message: typeof Own.Type,
  ): Update.Return<PostModel, PostMessage, RemoteClient> =>
    Own.match(message, {
      // the action asks for the time…
      Posted: ({ post }) => ({
        model,
        commands: [Remote.now(now => Message.Clocked({ post, now }))],
      }),
      // …and the Message it yields starts the write with it
      Clocked: ({ post, now }) => {
        const sent = Data.mutate(model, PostChirp, post, { now })
        return { model: sent.model, commands: [sent.command] }
      },
    })
  void update

  // A write that outlives the page: queued in the outbox, which sends it.
  const outbox = Data.outbox({ key: () => 'outbox:me', scope: () => 'me' })
  const durably = (model: PostModel, post: typeof NewPost.Type, now: number) => {
    const sent = Data.mutate(model, PostChirp, post, { now, durable: true })
    return { model: sent.model, commands: [sent.command] }
  }
  const waiting = (model: PostModel): string => {
    const { waiting } = Data.outboxStatus(model)
    return waiting === 0 ? '' : `${waiting} changes waiting`
  }
  expectTypeOf(outbox.restore).returns.toExtend<Effect.Effect<PostModel, never, unknown>>()
  void durably
  void waiting
}

// Diagnostics: another reporter in the runtime's resources.
export const diagnosticResources = Layer.mergeAll(
  Remote.clientLayer(Remote.http('/remote')),
  // Logged as by default, and sent on to the server.
  Layer.succeed(Diagnostics.Reporter, diagnostic =>
    Effect.andThen(
      Diagnostics.log(diagnostic),
      Effect.sync(() => navigator.sendBeacon('/diagnostics', diagnostic.message)),
    ),
  ),
)
