/** What `verifyPredictions.expected`, `Trace.run`'s `regresses` and `Trace.record` accept. */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Entity, Order } from 'foldkit-entity'
import { Mutation, Query, Remote, isRemoteMessage, type RemoteClient } from 'foldkit-remote'
import { Trace } from 'foldkit-remote/testing'
import { Surface } from 'foldkit-surface'
import { expectTypeOf } from 'vitest'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)
const Rename = Mutation.make('Rename', { Input: { id: Schema.String }, Output: {} })
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const domain = { model: App.model.remote, entities: [Project], queries: [All], mutations: [Rename] }

Remote.make({
  ...domain,
  verifyPredictions: {
    on: true,
    expected: {
      mutations: { Rename: { Value: 'the server trims names', Gap: 'it answers ids alone' } },
      queries: { All: { Placement: 'the server ranks rows' } },
    },
  },
})

Remote.make({
  ...domain,
  verifyPredictions: {
    on: true,
    // @ts-expect-error a mutation the domain does not register
    expected: { mutations: { Delete: { Value: 'a reason' } } },
  },
})

Remote.make({
  ...domain,
  verifyPredictions: {
    on: true,
    // @ts-expect-error a query the domain does not register
    expected: { queries: { Mine: { Placement: 'a reason' } } },
  },
})

Remote.make({
  ...domain,
  verifyPredictions: {
    on: true,
    // @ts-expect-error a mutation's parts are Value and Gap; Placement is a query's
    expected: { mutations: { Rename: { Placement: 'a reason' } } },
  },
})

// @ts-expect-error `on` says the mode: it is not left to a default
Remote.make({ ...domain, verifyPredictions: { expected: {} } })

const Data = Remote.make({ ...domain, verifyPredictions: true })
const list = Data.query(All, {}, { select: Entity.select(Project, { name: true }), first: 5 })
const active = { list: Data.active('list', () => Option.some(list)) }
const client: RemoteClient['Service'] = {
  read: () => Effect.die('unused'),
  query: () => Effect.die('unused'),
  mutate: () => Effect.die('unused'),
  live: () => Stream.empty,
}
const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> => ({
  model: isRemoteMessage(message) ? Data.reduce(model, message) : model,
})
const start: Model = { remote: Remote.initial }
const traced = { start, update, active, client, steps: [] }

void Trace.run(Data, { ...traced, reads: { list }, regresses: { list: 'on purpose' } })
// @ts-expect-error `regresses` names a read of `reads`
void Trace.run(Data, { ...traced, reads: { list }, regresses: { feed: 'on purpose' } })

const recording = Trace.record(Data, update, { reads: { list }, regresses: { list: 'on purpose' } })
// The runtime takes the recording's `update` as it took the application's.
expectTypeOf(recording.update).toEqualTypeOf<
  (model: Model, message: Message) => Update.Return<Model, Message, RemoteClient>
>()
// @ts-expect-error `regresses` names a read of `reads`
Trace.record(Data, update, { reads: { list }, regresses: { feed: 'on purpose' } })
