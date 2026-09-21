/**
 * The Quick start from this package's README, type-checked so the
 * documentation cannot drift from the API. `Route` and `rpcClient` stand in
 * for what an application supplies.
 */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Entity as DomainEntity, Expr, Order, type AnyQuery } from 'foldkit-entity'
import { Bundle } from 'foldkit-bundle'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Surface } from 'foldkit-surface'
import {
  Entity,
  Mutation,
  Query,
  Remote,
  RemoteData,
  RemoteClient,
  RemotePolicy,
  type RemoteRpcClient,
} from '../src/index.js'

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
        model.route._tag === 'project' ? { projectId: model.route.projectId } : undefined,
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
    case 'ClickedMore': {
      const next = Data.next(model, projects)
      return { model, commands: next === undefined ? [] : [Data.fetch(next)] }
    }
  }
}

// 6. Provide the client
const clientLayer = Remote.clientLayer(rpcClient)

void subscriptions
void clientLayer

// 7. One list instead of steps 2–6 by hand. This fixture's union has its own
// Messages with Commands, so its section-5 update stays on as `own` — and the
// parent declares `RemoteClient` for it — while the README's Remote-only union
// needs neither.
const Page = Bundle.parent({ Model, Message }).withServices<RemoteClient>()
const wiring = Page.assemble(
  Data.wiring({
    page: Surface.at(ProjectPage, model =>
      model.route._tag === 'project' ? { projectId: model.route.projectId } : undefined,
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
