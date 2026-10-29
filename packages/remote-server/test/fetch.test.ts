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
import {
  REMOTE_PROTOCOL_VERSION,
  Mutation,
  Remote,
  type RemoteUnauthenticated,
} from 'foldkit-remote'
import { Surface, type Diagnostic } from 'foldkit-surface'
import { describe, expect, it, vi } from 'vitest'
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
  resolvePrincipal: request =>
    Effect.succeed<Principal>({ isAdmin: request.headers.get('x-admin') === 'yes' }),
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

  describe('a principal the resolver refuses or breaks on', () => {
    const resolvedBy = (
      resolvePrincipal: () => Effect.Effect<Principal, RemoteUnauthenticated>,
    ): Promise<Response> =>
      serveFetch({
        server: backend.server,
        resolvePrincipal,
        layer: () => Layer.empty as Layer.Layer<never>,
      })(
        new Request('http://worker.test/remote', {
          method: 'POST',
          body: JSON.stringify({ operation: 'read', payload: readA }),
        }),
        {},
      )

    it.each([
      [
        'with its reason',
        RemoteServer.unauthenticated('Your session ended.'),
        { error: 'Your session ended.', unauthenticated: { reason: 'Your session ended.' } },
      ],
      [
        'saying nothing of why',
        RemoteServer.unauthenticated(),
        { error: 'Unauthenticated', unauthenticated: {} },
      ],
    ])('answers a refusal %s with a 401', async (_, refusal, answer) => {
      const response = await resolvedBy(() => Effect.fail(refusal))
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual(answer)
    })

    it('answers a resolver that breaks with a 500 that says nothing of it', async () => {
      const response = await resolvedBy(() => Effect.die(new Error('the session store password')))
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ error: 'Internal error' })
    })
  })

  it('answers a broken layer with a 500 that says nothing of it', async () => {
    const broken = serveFetch({
      server: backend.server,
      resolvePrincipal: () => Effect.succeed({ isAdmin: true }),
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

  it('provides the environment to the Sources and the resolver through the layer', async () => {
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
      // The resolver needs the layer too: a refusal here would be a 401, not a read.
      resolvePrincipal: () =>
        Effect.flatMap(Greeting, greeting =>
          greeting.hello === 'from D1'
            ? Effect.succeed(null)
            : Effect.fail(RemoteServer.unauthenticated()),
        ),
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

describe('serveFetch, headers for whom it answered', () => {
  const said = serveFetch({
    server: backend.server,
    resolvePrincipal: request =>
      request.headers.get('x-admin') === 'refused'
        ? Effect.fail(RemoteServer.unauthenticated('No.'))
        : Effect.succeed<Principal>({ isAdmin: request.headers.get('x-admin') === 'yes' }),
    layer: () => Layer.empty,
    headers: principal => ({ 'x-answered-as': principal.isAdmin ? 'admin' : 'guest' }),
  })
  const send = (body: string, admin: string) =>
    said(
      new Request('http://worker.test/remote', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin': admin },
        body,
      }),
      {},
    )

  it.each([
    ['an answer', JSON.stringify({ operation: 'read', payload: readA }), 200],
    ['a body that is not JSON', '{', 400],
    ['a live open', JSON.stringify({ operation: 'live', payload: { bogus: true } }), 400],
    [
      'a live stream',
      JSON.stringify({
        operation: 'live',
        payload: { version: REMOTE_PROTOCOL_VERSION, requirements: [], after: 0 },
      }),
      200,
    ],
  ])('names the principal on %s', async (_, body, status) => {
    const admin = await send(body, 'yes')
    const guest = await send(body, 'no')
    expect([admin.status, guest.status]).toEqual([status, status])
    expect(admin.headers.get('x-answered-as')).toBe('admin')
    expect(guest.headers.get('x-answered-as')).toBe('guest')
    await Promise.all([admin.body?.cancel(), guest.body?.cancel()])
  })

  it.each([
    ['an answer', JSON.stringify({ operation: 'read', payload: readA }), 'yes'],
    ['a body that is not JSON', '{', 'yes'],
    [
      'a live stream',
      JSON.stringify({
        operation: 'live',
        payload: { version: REMOTE_PROTOCOL_VERSION, requirements: [], after: 0 },
      }),
      'yes',
    ],
    ['a refusal', JSON.stringify({ operation: 'read', payload: readA }), 'refused'],
  ])('lets no cache keep %s, which is one principal’s (#284)', async (_, body, admin) => {
    const response = await send(body, admin)
    expect(response.headers.get('cache-control')).toBe('no-store')
    await response.body?.cancel()
  })

  it('keeps a cache-control the application gives', async () => {
    const response = await serveFetch({
      server: backend.server,
      resolvePrincipal: () => Effect.succeed<Principal>({ isAdmin: false }),
      layer: () => Layer.empty,
      headers: () => ({ 'cache-control': 'private, no-store', vary: 'cookie' }),
    })(
      new Request('http://worker.test/remote', {
        method: 'POST',
        body: JSON.stringify({ operation: 'read', payload: readA }),
      }),
      {},
    )
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })

  it('lets no cache keep a path it does not serve either', async () => {
    expect(
      (await fetch(new Request('http://worker.test/remote'), {})).headers.get('cache-control'),
    ).toBe('no-store')
  })

  it('names nobody on a refusal, which answered no one', async () => {
    const refused = await send(JSON.stringify({ operation: 'read', payload: readA }), 'refused')
    expect(refused.status).toBe(401)
    expect(refused.headers.has('x-answered-as')).toBe(false)
  })
})

describe('a failure answered "Internal error"', () => {
  const ask = (
    serve: (request: Request, env: {}) => Promise<Response>,
    payload: unknown = { operation: 'read', payload: readA },
  ) =>
    serve(
      new Request('http://worker.test/remote', { method: 'POST', body: JSON.stringify(payload) }),
      {},
    )
  const brokenLayer = (
    diagnostics?: (diagnostic: Diagnostic, request: Request) => Effect.Effect<void>,
  ) =>
    serveFetch({
      server: backend.server,
      resolvePrincipal: () => Effect.succeed({ isAdmin: true }),
      layer: () => Layer.effectDiscard(Effect.die(new Error('the D1 password'))) as never,
      diagnostics,
    })

  it('reports a ServerDefect with the request, and tells the caller nothing of it', async () => {
    const reported: Array<string> = []
    const response = await ask(
      brokenLayer((diagnostic, request) =>
        Effect.sync(() => reported.push(`${diagnostic._tag} ${request.url} ${diagnostic.message}`)),
      ),
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Internal error' })
    expect(reported).toEqual([
      expect.stringMatching(
        /^ServerDefect http:\/\/worker\.test\/remote [^]*Error: the D1 password/,
      ),
    ])
  })

  it('logs the cause when no reporter is given', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect((await ask(brokenLayer())).status).toBe(500)
      expect(logged.mock.calls.flat().join('\n')).toContain('Error: the D1 password')
    } finally {
      logged.mockRestore()
    }
  })

  it('reports a resolver that breaks, and a handler that does', async () => {
    const reported: Array<string> = []
    const diagnostics = (diagnostic: Diagnostic) =>
      Effect.sync(() => reported.push(diagnostic.message))
    await ask(
      serveFetch({
        server: backend.server,
        resolvePrincipal: () => Effect.die(new Error('the session store password')),
        layer: () => Layer.empty as Layer.Layer<never>,
        diagnostics,
      }),
    )
    const broken = RemoteServer.make<Principal, never>({
      entities: [],
      mutations: [
        RemoteServer.mutation(Mutation.make('Boom', { Input: {}, Output: {} }), () =>
          Effect.die(new Error('a handler bug')),
        ),
      ],
    })
    await ask(
      serveFetch({
        server: broken,
        resolvePrincipal: () => Effect.succeed({ isAdmin: true }),
        layer: () => Layer.empty as Layer.Layer<never>,
        diagnostics,
      }),
      { operation: 'mutate', payload: { requestId: 'r1', mutation: 'Boom', input: {} } },
    )
    expect(reported).toEqual([
      expect.stringContaining('Error: the session store password'),
      expect.stringContaining('Error: a handler bug'),
    ])
  })

  it('keeps answering when the reporter itself breaks', async () => {
    const response = await ask(brokenLayer(() => Effect.die(new Error('the hook is broken'))))
    expect(response.status).toBe(500)
  })
})
