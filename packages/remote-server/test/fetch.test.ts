/**
 * `RemoteServer` over `Request`/`Response`: `serveFetch` answers the same
 * bodies `RemoteServer.answer` does, resolves the principal per request, and
 * provides the Sources' requirements per request from the environment. A
 * route it does not serve is a 404 that reaches nothing; principal and layer
 * failures stay on this side.
 */
import { Context, Effect, Layer, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { REMOTE_PROTOCOL_VERSION, Mutation, Remote } from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const RenameItem = Mutation.make('RenameItem', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})
const Model = Schema.Struct({ remote: Remote.Model })
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const domain = Remote.make({ model: App.model.remote, entities: [Item], mutations: [RenameItem] })

type Principal = { readonly isAdmin: boolean }

const backend = RemoteServer.memory({
  domain,
  rows: { Item: [{ id: 'a', name: 'Anchor' }] },
  mutations: store => [
    RemoteServer.mutation(RenameItem, ({ input }) => {
      store.write('Item', input.id, { name: input.name })
      return Effect.succeed({
        output: { id: input.id },
        entities: [Remote.patch(Item, input.id, { name: input.name })],
      })
    }),
  ],
  principal: { isAdmin: false },
  authorize: {
    Item: (principal: Principal, fields) =>
      fields.filter(field => field !== 'name' || principal.isAdmin),
  },
})

const readA = {
  version: REMOTE_PROTOCOL_VERSION,
  requests: [{ entity: 'Item', id: 'a', fields: ['name'] }],
}

const fetch = serveFetch({
  server: backend.server,
  resolvePrincipal: (request): Principal => ({
    isAdmin: request.headers.get('x-admin') === 'yes',
  }),
  layer: (_env: { readonly note?: string }) => Layer.empty as Layer.Layer<never>,
})

const post = (body: unknown, init?: RequestInit) =>
  fetch(
    new Request('http://worker.test/remote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
      ...init,
    }),
    {},
  )

describe('serveFetch', () => {
  it('answers a read through its handler, authorized as the request principal', async () => {
    const admin = await post(
      { operation: 'read', payload: readA },
      { headers: { 'content-type': 'application/json', 'x-admin': 'yes' } },
    )
    expect(admin.status).toBe(200)
    expect(await admin.json()).toEqual({
      result: {
        entities: [{ entity: 'Item', id: 'a', values: { name: 'Anchor' } }],
        settled: [],
      },
    })
    const guest = await post({ operation: 'read', payload: readA })
    expect(guest.status).toBe(200)
    expect(await guest.json()).toEqual({
      result: {
        entities: [],
        settled: [{ entity: 'Item', id: 'a', fields: ['name'] }],
      },
    })
  })

  it('answers a mutation and the next read sees the write', async () => {
    const renamed = await post(
      {
        operation: 'mutate',
        payload: {
          requestId: 'fetch-test:1',
          mutation: 'RenameItem',
          input: { id: 'a', name: 'Anchor II' },
        },
      },
      { headers: { 'content-type': 'application/json', 'x-admin': 'yes' } },
    )
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toEqual({
      result: {
        output: { id: 'a' },
        entities: [{ entity: 'Item', id: 'a', values: { name: 'Anchor II' } }],
        connections: [],
        deleted: [],
      },
    })
    const reread = await post(
      { operation: 'read', payload: readA },
      { headers: { 'content-type': 'application/json', 'x-admin': 'yes' } },
    )
    expect((await reread.json()).result.entities).toEqual([
      { entity: 'Item', id: 'a', values: { name: 'Anchor II' } },
    ])
  })

  it('serves only its path and method', async () => {
    const elsewhere = await fetch(
      new Request('http://worker.test/other', {
        method: 'POST',
        body: JSON.stringify({ operation: 'read', payload: readA }),
      }),
      {},
    )
    expect(elsewhere.status).toBe(404)
    const gotten = await fetch(new Request('http://worker.test/remote'), {})
    expect(gotten.status).toBe(404)
  })

  it('refuses a body that is not JSON, or not a request, without reaching a handler', async () => {
    const text = await post('this is not json')
    expect(text.status).toBe(400)
    expect(await text.json()).toHaveProperty('error')
    const unknown = await post({ operation: 'drop', payload: readA })
    expect(unknown.status).toBe(400)
    expect(await unknown.json()).toHaveProperty('error')
  })

  it('answers a failing principal resolution with a 401 carrying its message', async () => {
    const guarded = serveFetch({
      server: backend.server,
      resolvePrincipal: (): Principal => {
        throw new Error('bad token')
      },
      layer: () => Layer.empty as Layer.Layer<never>,
    })
    const response = await guarded(
      new Request('http://worker.test/remote', {
        method: 'POST',
        body: JSON.stringify({ operation: 'read', payload: readA }),
      }),
      {},
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'bad token' })
  })

  it('answers a broken layer with a 500 that says nothing of it', async () => {
    const broken = serveFetch({
      server: backend.server,
      resolvePrincipal: () => ({ isAdmin: true }),
      layer: () => Layer.effectDiscard(Effect.die(new Error('the D1 password'))) as never,
    })
    const response = await broken(
      new Request('http://worker.test/remote', {
        method: 'POST',
        body: JSON.stringify({ operation: 'read', payload: readA }),
      }),
      {},
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal error' })
  })

  it('provides the environment to the Sources through the layer', async () => {
    class Greeting extends Context.Service<Greeting, { readonly hello: string }>()(
      'fetch-test/Greeting',
    ) {}
    const Who = RemoteServer.entity(
      { name: 'Who' },
      {
        read: ({ ids }) =>
          Effect.map(Greeting, greeting =>
            ids.map(id => ({ id, values: { name: greeting.hello } })),
          ),
      },
    )
    const server = RemoteServer.make({ entities: [Who] })
    const served = serveFetch({
      server,
      resolvePrincipal: () => null,
      layer: (env: { readonly hello: string }) => Layer.succeed(Greeting, { hello: env.hello }),
    })
    const response = await served(
      new Request('http://worker.test/remote', {
        method: 'POST',
        body: JSON.stringify({
          operation: 'read',
          payload: {
            version: REMOTE_PROTOCOL_VERSION,
            requests: [{ entity: 'Who', id: 'w', fields: ['name'] }],
          },
        }),
      }),
      { hello: 'from D1' },
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      result: {
        entities: [{ entity: 'Who', id: 'w', values: { name: 'from D1' } }],
        settled: [],
      },
    })
  })
})
