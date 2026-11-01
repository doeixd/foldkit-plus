/**
 * A write made for someone (#405): every answer says whom it was for, its
 * `viewer`'s key, and a write naming one principal is refused, before it
 * runs, when another asks, over Effect RPC, JSON and HTTP alike. A replay of
 * an operation already run is answered only to whom it was made for.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { FetchHttpClient, HttpRouter, HttpServer } from 'effect/http'
import { RpcClient, RpcSerialization, RpcServer } from 'effect/rpc'
import { Entity } from 'foldkit-entity'
import {
  Mutation,
  Query,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  RemoteRpc,
} from 'foldkit-remote'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Items = Query.make('Items', { Input: {}, Result: Query.connection(Item) })
const Rename = Mutation.make('Rename', { Input: { id: Schema.String }, Output: {} })

/** Who asks: a user's id, or none for a visitor. */
type Principal = Option.Option<string>

/** Each run of Rename, by operation and who asked; a run's answer kept by operation alone. */
const runs: Array<{ readonly operation: string; readonly by: Principal }> = []
const recorded = new Map<string, { readonly output: {} }>()
beforeEach(() => {
  runs.length = 0
  recorded.clear()
})

const definition = (viewer: boolean) =>
  RemoteServer.make<Principal>({
    entities: [
      RemoteServer.entity(Item, {
        read: ({ ids }) => Effect.succeed(ids.map(id => ({ id, values: { name: 'Anchor' } }))),
      }),
    ],
    queries: [
      RemoteServer.query(Items, () =>
        Effect.succeed({
          edges: [],
          start: { _tag: 'Terminal' as const },
          end: { _tag: 'Terminal' as const },
        }),
      ),
    ],
    mutations: [
      // A record kept by operation alone, as a careless ledger would: only the
      // principal check keeps its answer from another person.
      RemoteServer.mutation(Rename, ({ operation, principal }) =>
        Effect.sync(() => {
          const id = Option.getOrElse(operation, () => '')
          const answer = recorded.get(id)
          if (answer !== undefined) return answer
          runs.push({ operation: id, by: principal })
          const ran = { output: {} }
          recorded.set(id, ran)
          return ran
        }),
      ),
    ],
    ...(viewer
      ? { viewer: (principal: Principal) => Option.map(principal, id => ({ entity: 'User', id })) }
      : {}),
  })
const server = definition(true)

const principalOf = (who: string): Principal =>
  who === 'visitor' ? Option.none() : Option.some(who)

/** Effect RPC over HTTP, one route per principal, as a session middleware would choose. */
const routeAs = (who: string) =>
  HttpRouter.toWebHandler(
    RpcServer.layer(RemoteRpc).pipe(
      Layer.provide(RemoteRpc.toLayer(RemoteServer.handlers(server, principalOf(who)))),
      Layer.provide(RpcServer.layerProtocolHttp({ path: '/rpc' })),
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  )
const webs = new Map<string, ReturnType<typeof routeAs>>()
const webAs = (who: string) => {
  const web = webs.get(who) ?? routeAs(who)
  webs.set(who, web)
  return web
}
afterAll(() => Promise.all([...webs.values()].map(web => web.dispose())))

const fetched = serveFetch({
  server,
  resolvePrincipal: request =>
    Effect.succeed(principalOf(request.headers.get('x-session') ?? 'visitor')),
  layer: () => Layer.empty,
})

/** Remote's client as `who`, over each transport. */
const transports: ReadonlyArray<readonly [string, (who: string) => Layer.Layer<RemoteClient>]> = [
  [
    'Effect RPC',
    who =>
      Layer.unwrap(
        Effect.map(RpcClient.make(RemoteRpc), rpcClient => Remote.clientLayer(rpcClient)),
      ).pipe(
        Layer.provide(Remote.rpcProtocolHttp('http://worker.test/rpc')),
        Layer.provide([RpcSerialization.layerJson, FetchHttpClient.layer]),
        Layer.provide(
          Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
            webAs(who).handler(new Request(String(input), init)),
          ),
        ),
      ),
  ],
  [
    'JSON',
    who =>
      Remote.clientLayer(
        Remote.json(async request => {
          const answered = await Effect.runPromise(
            RemoteServer.answer(
              RemoteServer.handlers(server, principalOf(who)),
              JSON.parse(request),
            ),
          )
          return answered.body
        }),
      ),
  ],
  [
    'HTTP',
    who =>
      Remote.clientLayer(
        Remote.http('http://worker.test/remote', {
          headers: () => ({ 'x-session': who }),
          fetch: (input, init) => fetched(new Request(input, init), {}),
        }),
      ),
  ],
]

const as = <A, E>(
  layer: Layer.Layer<RemoteClient>,
  use: (client: RemoteClient['Service']) => Effect.Effect<A, E>,
) => Effect.runPromise(Effect.flatMap(RemoteClient, use).pipe(Effect.provide(layer)))

const rename = (operation: string, principal?: string) => (client: RemoteClient['Service']) =>
  client.mutate({
    requestId: operation,
    operation,
    mutation: 'Rename',
    input: { id: 'a' },
    ...(principal === undefined ? {} : { principal }),
  })

describe.each(transports)('a write made for someone, over %s', (_, clientAs) => {
  it('is told whom each answer was for: the viewer’s key, or no one', async () => {
    const read = (client: RemoteClient['Service']) =>
      client.read({
        version: REMOTE_PROTOCOL_VERSION,
        requests: [{ entity: 'Item', id: 'a', fields: ['name'] }],
      })
    const query = (client: RemoteClient['Service']) =>
      client.query({ query: 'Items', input: {}, window: {} })
    expect((await as(clientAs('ada'), read)).principal).toBe('User:ada')
    expect((await as(clientAs('ada'), query)).principal).toBe('User:ada')
    expect((await as(clientAs('ada'), rename('o1'))).principal).toBe('User:ada')
    expect((await as(clientAs('visitor'), read)).principal).toBeNull()
  })

  it('runs when whom it names asks, and a resend is answered from its record', async () => {
    await as(clientAs('ada'), rename('o1', 'User:ada'))
    await as(clientAs('ada'), rename('o1', 'User:ada'))
    expect(runs).toEqual([{ operation: 'o1', by: Option.some('ada') }])
  })

  it('is refused before it runs when someone else asks', async () => {
    const error = await as(clientAs('grace'), client =>
      Effect.flip(rename('o1', 'User:ada')(client)),
    )
    expect(error._tag).toBe('PrincipalChanged')
    expect(runs).toEqual([])
  })

  it('is refused as a sign-in needed when a visitor asks', async () => {
    const error = await as(clientAs('visitor'), client =>
      Effect.flip(rename('o1', 'User:ada')(client)),
    )
    expect(error._tag).toBe('Unauthenticated')
    expect(runs).toEqual([])
  })

  it('is replayed to whom it was made for alone', async () => {
    await as(clientAs('ada'), rename('o1', 'User:ada'))
    const error = await as(clientAs('grace'), client =>
      Effect.flip(rename('o1', 'User:ada')(client)),
    )
    expect(error._tag).toBe('PrincipalChanged')
    expect(runs).toEqual([{ operation: 'o1', by: Option.some('ada') }])
  })

  it('runs as whoever asks when it names no one', async () => {
    await as(clientAs('grace'), rename('o1'))
    expect(runs).toEqual([{ operation: 'o1', by: Option.some('grace') }])
  })
})

describe('a server with no viewer', () => {
  const keyless = definition(false)
  const handlers = RemoteServer.handlers(keyless, principalOf('ada'))

  it('says of no answer whom it was for', async () => {
    const read = await Effect.runPromise(
      handlers.FoldkitRemoteRead({ version: REMOTE_PROTOCOL_VERSION, requests: [] }),
    )
    expect(read).not.toHaveProperty('principal')
  })

  it('refuses a write naming anyone, since it cannot tell', async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        handlers.FoldkitRemoteMutate({
          requestId: 'o1',
          operation: 'o1',
          mutation: 'Rename',
          input: { id: 'a' },
          principal: 'User:ada',
        }),
      ),
    )
    expect(error._tag).toBe('PrincipalChanged')
    expect(runs).toEqual([])
  })

  it('answers the refusal over JSON as a 409 its client reads back', async () => {
    const answered = await Effect.runPromise(
      RemoteServer.answer(handlers, {
        operation: 'mutate',
        payload: { requestId: 'o1', mutation: 'Rename', input: { id: 'a' }, principal: 'User:x' },
      }),
    )
    expect(answered.status).toBe(409)
    expect(answered.body).toMatchObject({ principalChanged: {} })
  })
})
