/**
 * Which fields a request may name, and how they come back. A requested field
 * is untrusted client input: it is answered only when the source declares and
 * holds it, settled otherwise, and never read off `Object.prototype`.
 */
import { Effect, Schema } from 'effect'
import { RpcTest } from 'effect/rpc'
import { defineMessageUnion } from 'foldkit/message'
import { Entity, Relation } from 'foldkit-entity'
import { REMOTE_PROTOCOL_VERSION, Remote, RemoteRpc, type Requirement } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { RemoteServer, type ServerDefinition } from '../src/index.js'

const UserBase = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectBase = Entity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String }),
)
const { User, Project } = Entity.relate(
  { User: UserBase, Project: ProjectBase },
  { Project: { owner: Relation.one(UserBase) } },
)

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const domain = Remote.make({ model: App.model.remote, entities: [Item] })
const memory = () => RemoteServer.memory({ domain, rows: { Item: [{ id: 'a', name: 'x' }] } })

const read = (server: ServerDefinition<undefined>, requests: ReadonlyArray<Requirement>) =>
  Effect.runPromise(
    RemoteServer.handlers(server, undefined).FoldkitRemoteRead({
      version: REMOTE_PROTOCOL_VERSION,
      requests,
    }),
  )

/** A source that answers every field it is asked for, from its own table. */
const answering = (
  entity: typeof Project | typeof User,
  table: Record<string, Record<string, unknown>>,
) =>
  RemoteServer.entity<undefined>(entity, {
    read: ({ ids, fields }) =>
      Effect.succeed(
        ids.flatMap(id => {
          const row = table[id]
          if (row === undefined) return []
          return [
            {
              id,
              values: Object.fromEntries(
                fields.flatMap(field => (Object.hasOwn(row, field) ? [[field, row[field]]] : [])),
              ),
            },
          ]
        }),
      ),
  })

describe('RemoteServer.entity with a related Entity', () => {
  const server = RemoteServer.make<undefined>({
    entities: [
      answering(Project, { p1: { name: 'Borealis', owner: 'User:u1' } }),
      answering(User, { u1: { name: 'Ada' } }),
    ],
  })

  it('declares the relation, so it is read and followed rather than withheld', async () => {
    const result = await read(server, [
      {
        entity: 'Project',
        id: 'p1',
        fields: ['name', 'owner'],
        relations: { owner: { entity: 'User', fields: ['name'] } },
      },
    ])
    expect(result.entities).toContainEqual({
      entity: 'Project',
      id: 'p1',
      values: { name: 'Borealis', owner: 'User:u1' },
    })
    expect(result.entities).toContainEqual({ entity: 'User', id: 'u1', values: { name: 'Ada' } })
    expect(result.settled).toEqual([])
  })

  it('still withholds a field the Entity does not declare', async () => {
    const result = await read(server, [{ entity: 'Project', id: 'p1', fields: ['budget'] }])
    expect(result.settled).toEqual([{ entity: 'Project', id: 'p1', fields: ['budget'] }])
  })
})

describe('a requested field named like an Object.prototype member', () => {
  const backend = memory()

  it('is settled, not read off the prototype', async () => {
    const result = await read(backend.server, [
      { entity: 'Item', id: 'a', fields: ['constructor', 'toString', 'name'] },
    ])
    expect(result.entities).toEqual([{ entity: 'Item', id: 'a', values: { name: 'x' } }])
    expect(result.settled).toEqual([
      { entity: 'Item', id: 'a', fields: ['constructor', 'toString'] },
    ])
  })

  it('comes back under its own name when a rename is absent', async () => {
    const server = RemoteServer.make<undefined>({
      entities: [
        RemoteServer.entity<undefined>(
          { name: 'Item' },
          {
            read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: { constructor: 1 } }))),
          },
        ),
      ],
    })
    const result = await read(server, [{ entity: 'Item', id: 'a', fields: ['constructor'] }])
    expect(result.entities).toEqual([{ entity: 'Item', id: 'a', values: { constructor: 1 } }])
  })
  it('answers a paged read under its alias even when the field is named __proto__', async () => {
    const server = RemoteServer.make<undefined>({
      entities: [
        RemoteServer.entity<undefined>(
          { name: 'Item' },
          {
            read: ({ ids }) =>
              Effect.succeed(
                ids.map(id => ({ id, values: Object.fromEntries([['__proto__', ['Item:b']]]) })),
              ),
          },
        ),
      ],
    })
    const alias = '__proto__@first=1'
    const result = await read(server, [
      { entity: 'Item', id: 'a', fields: [alias], windows: { [alias]: { first: 1 } } },
    ])
    expect(result.entities.map(entity => Object.keys(entity.values))).toEqual([[alias]])
  })
})

describe('RemoteServer.memory', () => {
  it('hands out its server definition, to serve over a real RpcServer', async () => {
    const backend = memory()
    const result = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcTest.makeClient(RemoteRpc)
          return yield* client.FoldkitRemoteRead({
            version: REMOTE_PROTOCOL_VERSION,
            requests: [{ entity: 'Item', id: 'a', fields: ['name'] }],
          })
        }),
      ).pipe(Effect.provide(RemoteRpc.toLayer(RemoteServer.handlers(backend.server, undefined)))),
    )
    expect(result.entities).toEqual([{ entity: 'Item', id: 'a', values: { name: 'x' } }])
  })
})
