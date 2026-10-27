/** What `Trace.run` and `Respond` accept. */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Order } from 'foldkit-entity'
import {
  Query,
  Remote,
  RemoteMutationError,
  RemoteQueryError,
  isRemoteMessage,
  type RemoteClient,
} from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { Surface } from 'foldkit-surface'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages, Pinged: {} })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({ model: App.model.remote, entities: [Project], queries: [All] })
const list = Data.query(All, {}, { select: Entity.select(Project, { name: true }), first: 5 })
const active = { list: Data.active('list', () => Option.some(list)) }

const client: RemoteClient['Service'] = {
  read: () => Effect.die('unused'),
  query: () => Effect.die('unused'),
  mutate: () => Effect.die('unused'),
  live: () => Stream.empty,
}
const update = (model: Model, message: Message) => ({
  model: isRemoteMessage(message) ? Data.reduce(model, message) : model,
})
const start: Model = { remote: Remote.initial }

void Trace.run(Data, { start, update, active, client, steps: [Message.Pinged(), Respond.all] })

// The application's own Messages only: Remote's Subscriptions would send it
// Messages it cannot handle.
const Own = defineMessageUnion({ Pinged: {} })
void Trace.run(Data, {
  start,
  // @ts-expect-error update must take Remote's Messages
  update: (model: Model, _: typeof Own.Type) => ({ model }),
  active,
  client,
  steps: [],
})

void Trace.run(Data, {
  start,
  update,
  active,
  client,
  // @ts-expect-error a step is the application's Message or a Respond
  steps: [{ _tag: 'Unknown' }],
})

// @ts-expect-error a query fails with a query's error, not a mutation's
Respond.query(list.ref, { fail: new RemoteMutationError({ message: 'no' }) })
Respond.query(list.ref, { fail: new RemoteQueryError({ message: 'down' }) })
// @ts-expect-error a query is answered by its ref, not its name
Respond.query('All')
