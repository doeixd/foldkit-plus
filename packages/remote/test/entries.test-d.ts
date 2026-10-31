/**
 * What left the domain for entries of its own (#378 phase 5): each is a
 * function of its entry over the domain, and the domain no longer has it.
 */
import { Effect, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { Mutation, Query, Remote } from '../src/index.js'
import { live, liveQuery, liveStatus, observeLive, type LiveStatus } from '../src/live.js'
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
const Projects = Query.define('Projects', {}, () => Query.from(Project))
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [Projects],
  mutations: [Rename],
})
const Row = Entity.select(Project, { id: true, name: true })

// @ts-expect-error `outbox(Data, …)` from foldkit-remote/outbox
void Data.outbox
// @ts-expect-error `outboxStatus(Data, model)` from foldkit-remote/outbox
void Data.outboxStatus
// @ts-expect-error `persistence(Data, …)` from foldkit-remote/persistence
void Data.persistence
// @ts-expect-error `live(Data, selection, id)` from foldkit-remote/live
void Data.live
// @ts-expect-error `liveStatus(Data, model, active)` from foldkit-remote/live
void Data.liveStatus
// @ts-expect-error `observeLive(Data, …)` from foldkit-remote/live
void Remote.live
// @ts-expect-error `httpWithLive` from foldkit-remote/live
void Remote.httpWithLive
// @ts-expect-error a list is read live with `liveQuery`, not an option of `query`
Data.query(Projects, {}, { select: Row, first: 10, live: true })
// @ts-expect-error a list read live needs `first`
liveQuery(Data, Projects, {}, { select: Row })

const durable = outbox(Data, { key: () => 'outbox:me', scope: () => 'me' })
const restored: Effect.Effect<Model, never, KeyValueStore.KeyValueStore> = durable.restore(model)
const status: OutboxStatus = outboxStatus(Data, model)
const cache = persistence(Data, { key: () => 'cache:me', scope: () => 'me' })
const hydrated: Effect.Effect<Model, never, KeyValueStore.KeyValueStore> = cache.restore(model)
const watched = live(Data, Row, 'p1')
const listed = liveQuery(Data, Projects, {}, { select: Row, first: 10 })
const Watched = Data.active('Watched', () => Option.some(watched))
const state: LiveStatus = liveStatus(Data, model, Watched)
const entry = observeLive(Data, App.surface('Board', { model: () => ({ listed }) }), undefined)
void [restored, status, hydrated, state, entry]
