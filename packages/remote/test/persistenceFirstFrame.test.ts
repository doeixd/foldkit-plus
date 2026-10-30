/**
 * A reload draws the stored list from its first frame (#262): `init` starts
 * from `Data.persistence`'s `restore`, so the list never reads `Loading`
 * while the stored rows are on their way. Traced, with a domain of its own.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Entity, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Query,
  Remote,
  RemotePersistence,
  isRemoteMessage,
  terminal,
  type RemoteClient,
} from '../src/index.js'
import { Respond, Trace } from '../src/testing.js'

const Project = Entity.define('Project', Schema.Struct({ id: Schema.String, name: Schema.String }))
const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)

const Model = Schema.Struct({ remote: Remote.Model, actor: Schema.String })
type Model = typeof Model.Type
const Message = defineMessageUnion({ ...Remote.messages })
type Message = typeof Message.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [All],
  verifyPredictions: true,
})

const list = Data.query(All, {}, { select: Entity.select(Project, { name: true }), first: 25 })
const active = { list: Data.active('list', () => Option.some(list)) }
const persistence = Data.persistence({
  key: model => `cache:${model.actor}`,
  scope: model => model.actor,
  connections: [list.ref],
})

const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> =>
  isRemoteMessage(message) ? { model: Data.reduce(model, message) } : { model }

const rows: Readonly<Record<string, string>> = { p1: 'One', p2: 'Two' }
const server: RemoteClient['Service'] = {
  read: () => Effect.succeed({ settled: [], entities: [] }),
  query: () =>
    Effect.succeed({
      edges: Object.keys(rows).map(id => ({ entity: 'Project', id, key: `Project:${id}` })),
      start: terminal,
      end: terminal,
      entities: Object.entries(rows).map(([id, name]) => ({
        entity: 'Project',
        id,
        values: { name },
      })),
    }),
  mutate: () => Effect.die('unused'),
  live: () => Stream.empty,
}

const fresh: Model = { remote: Remote.initial, actor: 'ada' }

/** The last visit: the list loaded, and its snapshot stored for ada. */
const stored = Effect.runSync(
  Effect.gen(function* () {
    const visited = Data.reduce(fresh, {
      _tag: 'ConnectionMerged',
      connection: list.ref.identity,
      page: {
        edges: Object.keys(rows).map(id => ({
          key: `Project:${id}`,
          ref: { entity: 'Project', id },
        })),
        start: terminal,
        end: terminal,
      },
      select: { entity: 'Project', fields: ['name'] },
      entities: Object.entries(rows).map(([id, name]) => ({
        entity: 'Project',
        id,
        values: { name },
      })),
      now: 0,
    })
    yield* RemotePersistence.save(
      RemotePersistence.snapshotOf(visited.remote, { connections: [list.ref] }),
      { key: 'cache:ada', scope: 'ada' },
    )
    return yield* KeyValueStore.KeyValueStore
  }).pipe(Effect.provide(KeyValueStore.layerMemory)),
)

const reload = (start: Model) =>
  Trace.run(Data, { start, update, active, client: server, steps: [Respond.all] })

describe('A reload that restores in init', () => {
  it('draws the stored rows first, then the server’s, and never Loading', async () => {
    const start = await Effect.runPromise(
      persistence.restore(fresh).pipe(Effect.provideService(KeyValueStore.KeyValueStore, stored)),
    )
    const trace = await reload(start)

    expect(Trace.tags(trace, list)).toEqual(['Refreshing', 'Ready'])
    expect(Trace.regressions(trace, { list })).toEqual([])
  })

  it('without it, draws Loading until the page lands', async () => {
    expect(Trace.tags(await reload(fresh), list)).toEqual(['Initial', 'Loading', 'Ready'])
  })
})
