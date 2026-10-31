/**
 * What left the domain for entries of its own (#378 phase 5): each is a
 * function of its entry over the domain, and the domain no longer has it.
 */
import { Effect, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Mutation, Remote } from '../src/index.js'
import { outbox, outboxStatus, type OutboxStatus } from '../src/outbox.js'
import { persistence } from '../src/persistence.js'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: {},
})
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
declare const model: Model
const Data = Remote.make({ model: App.model.remote, entities: [Project], mutations: [Rename] })

// @ts-expect-error `outbox(Data, …)` from foldkit-remote/outbox
void Data.outbox
// @ts-expect-error `outboxStatus(Data, model)` from foldkit-remote/outbox
void Data.outboxStatus
// @ts-expect-error `persistence(Data, …)` from foldkit-remote/persistence
void Data.persistence

const durable = outbox(Data, { key: () => 'outbox:me', scope: () => 'me' })
const restored: Effect.Effect<Model, never, KeyValueStore.KeyValueStore> = durable.restore(model)
const status: OutboxStatus = outboxStatus(Data, model)
const cache = persistence(Data, { key: () => 'cache:me', scope: () => 'me' })
const hydrated: Effect.Effect<Model, never, KeyValueStore.KeyValueStore> = cache.restore(model)
void [restored, status, hydrated]
