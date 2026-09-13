/**
 * The Quick start from this package's README, type-checked so the
 * documentation cannot drift from the API. `Route` and `rpcClient` stand in
 * for what an application supplies.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import * as Subscription from 'foldkit/subscription'
import type * as Update from 'foldkit/update'
import { Surface } from 'foldkit-surface'
import {
  Entity,
  Mutation,
  Query,
  Remote,
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
