import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Mutation, Remote, type RemoteJsonSend } from '../src/index.js'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String }))
const Ping = Mutation.make('Ping', { Input: {}, Output: {} })
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({ model: App.model.remote, entities: [Item], mutations: [Ping] })
declare const model: Model

// A client's deadline and the server's limits, together.
Remote.clientLayer(Remote.http('/remote'), {
  timeout: '20 seconds',
  maxIdsPerEntity: 500,
  maxBodyBytes: 64 * 1024,
  window: '5 millis',
})
// @ts-expect-error a byte limit is a number of bytes
Remote.clientLayer(Remote.http('/remote'), { maxBodyBytes: '64 KiB' })
// @ts-expect-error a deadline is a duration
Remote.clientLayer(Remote.http('/remote'), { timeout: true })

// Per call: a read entry's deadline and one send's.
Data.subscriptions({}, { timeout: '5 seconds' })
Data.mutate(model, Ping, {}, { timeout: '5 seconds' })
// @ts-expect-error a send's deadline is a duration
Data.mutate(model, Ping, {}, { timeout: 'soon' })

// A send that stops when the call is abandoned, and one that ignores it.
const abortable: RemoteJsonSend = (request, signal) =>
  fetch('/remote', { method: 'POST', body: request, signal }).then(response => response.json())
const ignoring: RemoteJsonSend = async request => JSON.parse(request)
Remote.json(abortable)
Remote.json(ignoring)
