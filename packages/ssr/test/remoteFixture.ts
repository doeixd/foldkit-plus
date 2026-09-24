/**
 * An application Phase R's tests render: an author read from Remote, whose
 * server-side store also holds an email no view reads, with an in-process
 * client that records every request the browser makes.
 */
import { Effect, Layer, Schema, Stream } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Remote, RemoteClient, type RemoteMessage } from 'foldkit-remote'
import { Projection, Surface } from 'foldkit-surface'
import { SSR } from 'foldkit-ssr'

const User = Entity.make(
  'User',
  Schema.Struct({ id: Schema.String, name: Schema.String, email: Schema.String }),
)

export const Model = Schema.Struct({ theme: Schema.String, remote: Remote.Model })
export type Model = typeof Model.Type
export const Message = defineMessageUnion({ ...Remote.messages })
export type Message = typeof Message.Type
export const initial: Model = { theme: 'light', remote: Remote.initial }

export const App = Surface.application({ Model, Message, initial, update: model => ({ model }) })
export const Data = Remote.make({ model: App.model.remote, entities: [User] })

const author = Data.get(User.select({ name: true }), 'u1')
const Author = App.surface('Author', { model: () => ({ author }) })
export const authorSurface = Surface.at(Author, undefined)

/** Every read the browser asks the client for. */
export const requests: Array<ReadonlyArray<string>> = []

const client = Layer.succeed(RemoteClient, {
  read: batch => {
    requests.push(batch.requests.map(request => `${request.entity}:${request.id}`))
    return Effect.succeed({ entities: [], settled: [] })
  },
  query: () => Effect.die('no queries here'),
  mutate: () => Effect.die('no mutations here'),
  live: () => Stream.empty,
})

/** The server's store after its read: the author, and an email no view reads. */
export const loaded: Model = Data.reduce(initial, {
  _tag: 'ReadReceived',
  requests: [{ entity: 'User', id: 'u1', fields: ['name', 'email'] }],
  result: {
    entities: [{ entity: 'User', id: 'u1', values: { name: 'Ada', email: 'ada@example.test' } }],
    settled: [],
  },
  now: 0,
})

export const config = {
  Model,
  init: () => ({ model: loaded }),
  update: (model: Model, message: Message) => ({
    model: Data.reduce(model, message),
  }),
  subscriptions: Data.subscriptions({ page: authorSurface }),
  resources: client,
  view: (model: Model, h: HtmlBuilder<Message>) => {
    const read = author.read(model)
    return {
      title: 'Author',
      body: h.p([h.Id('author')], [read._tag === 'Ready' ? read.value.name : read._tag]),
    }
  },
  container: null,
}

export const plan = SSR.plan(App, {
  id: 'author',
  state: Projection.pick(App.model.theme),
  surfaces: [authorSurface],
  parts: [Remote.resume(Data)],
})
