/**
 * Public reads kept at the edge (#428): a read is kept only where every
 * source it passes through has no rule about who asks and declares how long
 * it stays fresh; it is answered as the visitor, so one answer is right for
 * everyone; a write purges what it names; and the checker answers each
 * public read as two principals and refuses a difference.
 */
import { Effect, Layer, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import {
  CachedRead,
  CacheStore,
  EdgeCache,
  Mutation,
  PageReads,
  Query,
  REMOTE_PROTOCOL_VERSION,
  Remote,
  RemoteClient,
  terminal,
} from 'foldkit-remote'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { checkCache, pageReader, serveFetch } from '../src/fetch.js'
import {
  RemoteServer,
  RemoteServerError,
  type EntitySource,
  type ServerDefinition,
} from '../src/index.js'

const Price = Entity.define(
  'Price',
  Schema.Struct({ id: Schema.String, amount: Schema.Number }),
).pipe(Entity.annotate(EdgeCache.of({ maxAge: '60 seconds' })))
const Seller = Entity.define('Seller', Schema.Struct({ id: Schema.String, name: Schema.String }))

const SetPrice = Mutation.make('SetPrice', {
  Input: { id: Schema.String, amount: Schema.Number },
  Output: {},
})
const Cheap = Query.make('Cheap', {
  Input: {},
  Result: Price,
  cache: { maxAge: '30 seconds' },
})

/** Who asks: a user's id, none for a visitor. */
type Who = Option.Option<string>

/** A store of prices, counting the reads that reach it. */
const world = () => {
  const rows = new Map([
    ['a', 1],
    ['b', 2],
  ])
  const counts = { price: 0, query: 0 }
  const price: EntitySource<Who> = RemoteServer.entity<Who>(Price, {
    read: ({ ids }) =>
      Effect.sync(() => {
        counts.price += 1
        return ids.flatMap(id =>
          Option.toArray(
            Option.map(Option.fromUndefinedOr(rows.get(id)), amount => ({
              id,
              values: { id, amount },
            })),
          ),
        )
      }),
  })
  const query = RemoteServer.query(Cheap, () =>
    Effect.sync(() => {
      counts.query += 1
      return {
        edges: [...rows.keys()].map(id => ({ entity: 'Price', id, key: id })),
        start: terminal,
        end: terminal,
      }
    }),
  )
  const setPrice = RemoteServer.mutation(SetPrice, ({ input }) =>
    Effect.sync(() => {
      rows.set(input.id, input.amount)
      return {
        output: {},
        entities: [Remote.patch(Price, input.id, { amount: input.amount })],
      }
    }),
  )
  return { rows, counts, price, query, setPrice }
}

const visitor: Who = Option.none()

const App = Surface.application({
  Model: Schema.Struct({ remote: Remote.Model }),
  Message: defineMessageUnion({ ...Remote.messages }),
})

const served = (server: ServerDefinition<Who>, cache = true) => {
  const store = CacheStore.memory()
  const serve = serveFetch({
    server,
    resolvePrincipal: request =>
      Effect.succeed(Option.fromNullishOr(request.headers.get('x-user'))),
    layer: () => Layer.empty,
    ...(cache ? { cache: { store, visitor } } : {}),
  })
  const post = (body: unknown, user?: string) =>
    serve(
      new Request('https://shop.test/remote', {
        method: 'POST',
        headers: user === undefined ? {} : { 'x-user': user },
        body: JSON.stringify(body),
      }),
      undefined,
    )
  return { store, post }
}

const read = (ids: ReadonlyArray<string>, extra: object = {}) => ({
  operation: 'read',
  payload: {
    version: REMOTE_PROTOCOL_VERSION,
    requests: ids.map(id => ({ entity: 'Price', id, fields: ['amount'], ...extra })),
  },
})
const cheap = {
  operation: 'query',
  payload: { query: 'Cheap', input: {}, window: { first: 10 } },
}
const setPrice = (id: string, amount: number) => ({
  operation: 'mutate',
  payload: { requestId: 'r1', mutation: 'SetPrice', input: { id, amount } },
})

describe('a public read', () => {
  it('is served from the store on the second request, for someone else too', async () => {
    const { counts, price } = world()
    const { post } = served(RemoteServer.make({ entities: [price] }))
    const first = await post(read(['a']))
    const second = await post(read(['a']), 'u1')
    expect(counts.price).toBe(1)
    expect(await second.json()).toEqual(await first.json())
    expect(second.headers.get('cache-control')).toBe('public, max-age=60')
  })

  it('is answered as the visitor, whoever asks first', async () => {
    const personal = RemoteServer.entity<Who>(Price, {
      read: ({ ids, principal }) =>
        Effect.succeed(
          ids.map(id => ({ id, values: { id, amount: Option.isSome(principal) ? 2 : 1 } })),
        ),
    })
    const { post } = served(RemoteServer.make({ entities: [personal] }))
    const amounts = async (user?: string) => {
      const answer: { readonly result: { readonly entities: ReadonlyArray<unknown> } } = await (
        await post(read(['a']), user)
      ).json()
      return answer.result.entities
    }
    const asVisitor = [{ entity: 'Price', id: 'a', values: { amount: 1 } }]
    expect(await amounts('u1')).toEqual(asVisitor)
    expect(await amounts()).toEqual(asVisitor)
  })

  it('keeps nothing without a store', async () => {
    const { counts, price } = world()
    const { post } = served(RemoteServer.make({ entities: [price] }), false)
    const answer = await post(read(['a']))
    await post(read(['a']))
    expect(counts.price).toBe(2)
    expect(answer.headers.get('cache-control')).toBe('private, no-store')
  })

  it('names nobody it was for, from a server that names everyone', async () => {
    const { price } = world()
    const server = RemoteServer.make({
      entities: [price],
      viewer: who => Option.map(who, id => ({ entity: 'Price', id })),
    })
    const { post } = served(server)
    const answer: { readonly result: object } = await (await post(read(['a']), 'u1')).json()
    expect(Object.hasOwn(answer.result, 'principal')).toBe(false)
  })

  it('is kept for the shortest freshness it reaches', async () => {
    const { counts, price, query } = world()
    const { post } = served(RemoteServer.make({ entities: [price], queries: [query] }))
    const answer = await post(cheap)
    await post(cheap)
    expect(counts.query).toBe(1)
    expect(answer.headers.get('cache-control')).toBe('public, max-age=30')
  })

  it('keeps no failure', async () => {
    let calls = 0
    const flaky = RemoteServer.entity<Who>(Price, {
      read: ({ ids }) => {
        calls += 1
        return calls === 1
          ? Effect.fail(new RemoteServerError({ message: 'The store went away' }))
          : Effect.succeed(ids.map(id => ({ id, values: { id, amount: 1 } })))
      },
    })
    const { post } = served(RemoteServer.make({ entities: [flaky] }))
    expect((await post(read(['a']))).status).toBe(500)
    expect((await post(read(['a']))).status).toBe(200)
    expect(calls).toBe(2)
  })
})

describe('a read that may depend on who asks is never kept', () => {
  const rules: ReadonlyArray<readonly [string, Partial<EntitySource<Who>>]> = [
    ['an authorize', { authorize: (_who, fields) => fields }],
    ['a filter', { filter: (_who, fields) => Effect.succeed({ fields, apply: record => record }) }],
    ['a visible rule', { visible: 'owner = viewer' }],
    ['a member answered per viewer', { perViewer: ['amount'] }],
  ]
  it.each(rules)('under %s', async (_, rule) => {
    const { counts, price } = world()
    const server = RemoteServer.make({
      entities: [{ ...price, ...rule }],
      viewer: who => Option.map(who, id => ({ entity: 'Price', id })),
    })
    const { post, store } = served(server)
    const answer = await post(read(['a']), 'u1')
    await post(read(['a']), 'u1')
    expect(counts.price).toBe(2)
    expect(store.size()).toBe(0)
    expect(answer.headers.get('cache-control')).toBe('private, no-store')
  })

  it('without a freshness of its own', async () => {
    const { counts, price } = world()
    const { post } = served(RemoteServer.make({ entities: [{ ...price, cache: undefined }] }))
    await post(read(['a']))
    await post(read(['a']))
    expect(counts.price).toBe(2)
  })

  it('through a relation to a source that is not public', async () => {
    const { counts, price } = world()
    const seller = RemoteServer.entity<Who>(Seller, { read: () => Effect.succeed([]) })
    const { post } = served(RemoteServer.make({ entities: [price, seller] }))
    const reaching = read(['a'], { relations: { seller: { entity: 'Seller', fields: ['name'] } } })
    await post(reaching)
    await post(reaching)
    expect(counts.price).toBe(2)
  })

  it('a query whose selection reaches a source that is not public', async () => {
    const { counts, price, query } = world()
    const seller = RemoteServer.entity<Who>(Seller, { read: () => Effect.succeed([]) })
    const { post } = served(RemoteServer.make({ entities: [price, seller], queries: [query] }))
    const selecting = {
      ...cheap,
      payload: {
        ...cheap.payload,
        select: {
          entity: 'Price',
          fields: ['amount'],
          relations: { seller: { entity: 'Seller', fields: ['name'] } },
        },
      },
    }
    await post(selecting)
    await post(selecting)
    expect(counts.query).toBe(2)
  })

  it('a query under a visible rule', async () => {
    const { counts, price, query } = world()
    const { post } = served(
      RemoteServer.make({ entities: [price], queries: [{ ...query, visible: 'owner = viewer' }] }),
    )
    await post(cheap)
    await post(cheap)
    expect(counts.query).toBe(2)
  })

  it('a query over rows that are not public', async () => {
    const { counts, price, query } = world()
    const { post } = served(
      RemoteServer.make({ entities: [{ ...price, cache: undefined }], queries: [query] }),
    )
    await post(cheap)
    await post(cheap)
    expect(counts.query).toBe(2)
  })

  it('a memory backend whose rows a principal may read or not', async () => {
    const domain = Remote.make({ model: App.model.remote, entities: [Price] })
    const backend = RemoteServer.memory<Who>({
      domain,
      rows: { Price: [{ id: 'a', amount: 1 }] },
      readable: who => Effect.succeed(() => Option.isSome(who)),
    })
    const { post, store } = served(backend.server)
    await post(read(['a']), 'u1')
    expect(store.size()).toBe(0)
  })

  it('but a memory backend with no rule keeps its declared Entities', async () => {
    const domain = Remote.make({ model: App.model.remote, entities: [Price] })
    const backend = RemoteServer.memory<Who>({ domain, rows: { Price: [{ id: 'a', amount: 1 }] } })
    const { post, store } = served(backend.server)
    await post(read(['a']))
    expect(store.size()).toBe(1)
  })
})

describe('a write', () => {
  it('purges the kept reads holding a row it names, and no other', async () => {
    const { counts, price, setPrice: mutation } = world()
    const { post } = served(RemoteServer.make({ entities: [price], mutations: [mutation] }))
    await post(read(['a']))
    await post(read(['b']))
    expect((await post(setPrice('a', 9), 'u1')).status).toBe(200)
    const after: { readonly result: { readonly entities: ReadonlyArray<unknown> } } = await (
      await post(read(['a']))
    ).json()
    await post(read(['b']))
    expect(counts.price).toBe(3)
    expect(after.result.entities).toEqual([{ entity: 'Price', id: 'a', values: { amount: 9 } }])
  })

  it('purges a kept read of a row that was not there yet', async () => {
    const { counts, price, setPrice: mutation } = world()
    const { post } = served(RemoteServer.make({ entities: [price], mutations: [mutation] }))
    await post(read(['z']))
    await post(setPrice('z', 5))
    await post(read(['z']))
    expect(counts.price).toBe(2)
  })

  it("purges every kept list of its rows' entity", async () => {
    const { counts, price, query, setPrice: mutation } = world()
    const { post } = served(
      RemoteServer.make({ entities: [price], queries: [query], mutations: [mutation] }),
    )
    await post(cheap)
    await post(setPrice('c', 1))
    await post(cheap)
    expect(counts.query).toBe(2)
  })

  it('says private, no-store', async () => {
    const { price, setPrice: mutation } = world()
    const { post } = served(RemoteServer.make({ entities: [price], mutations: [mutation] }))
    expect((await post(setPrice('a', 3))).headers.get('cache-control')).toBe('private, no-store')
  })
})

describe('the visitor', () => {
  it('is refused when the server names a row for it', () => {
    const { price } = world()
    const server = RemoteServer.make({
      entities: [price],
      viewer: (_who: Who) => Option.some({ entity: 'Price', id: 'a' }),
    })
    const config = {
      server,
      resolvePrincipal: () => Effect.succeed(visitor),
      layer: () => Layer.empty,
      cache: { store: CacheStore.memory(), visitor },
    }
    expect(() => serveFetch(config)).toThrow(/cache.visitor must be no one/)
    expect(() => pageReader(config)).toThrow(/cache.visitor must be no one/)
  })
})

describe('checkCache', () => {
  const asks = (user?: string) => () =>
    new Request('https://shop.test/remote', {
      method: 'POST',
      headers: user === undefined ? {} : { 'x-user': user },
      body: JSON.stringify(read(['a'])),
    })
  const config = (server: ServerDefinition<Who>) => ({
    server,
    resolvePrincipal: (request: Request) =>
      Effect.succeed(Option.fromNullishOr(request.headers.get('x-user'))),
    layer: () => Layer.empty,
    cache: { visitor },
  })

  it('passes a read that is the same for everyone', async () => {
    const { price } = world()
    await checkCache(config(RemoteServer.make({ entities: [price] })), [asks(), asks('u1')], {})
  })

  it('refuses a public read whose source answers by who asks', async () => {
    const personal = RemoteServer.entity<Who>(Price, {
      read: ({ ids, principal }) =>
        Effect.succeed(
          ids.map(id => ({ id, values: { id, amount: Option.isSome(principal) ? 2 : 1 } })),
        ),
    })
    await expect(
      checkCache(config(RemoteServer.make({ entities: [personal] })), [asks(), asks('u1')], {}),
    ).rejects.toThrow(/answered otherwise for who asked/)
  })

  it('refuses to check nothing', async () => {
    const { price } = world()
    await expect(
      checkCache(
        config(RemoteServer.make({ entities: [{ ...price, cache: undefined }] })),
        [asks(), asks('u1')],
        {},
      ),
    ).rejects.toThrow(/nothing was checked/)
  })
})

describe('pageReader', () => {
  const noted = (server: ServerDefinition<Who>, cache: boolean, user?: string) => {
    const reads: Array<CachedRead> = []
    const reader = pageReader({
      server,
      resolvePrincipal: () => Effect.succeed(Option.fromNullishOr(user)),
      layer: () => Layer.empty,
      ...(cache ? { cache: { store: CacheStore.memory(), visitor } } : {}),
    })(new Request('https://shop.test/'), undefined)
    return Effect.runPromise(
      Effect.gen(function* () {
        const client = yield* RemoteClient
        return yield* client.read(read(['a']).payload)
      }).pipe(
        Effect.provide(reader),
        Effect.provideService(
          PageReads,
          Option.some(read => reads.push(read)),
        ),
        Effect.exit,
        Effect.map(exit => ({ exit, reads })),
      ),
    )
  }

  it('notes a public read, answered for nobody', async () => {
    const { price } = world()
    const server = RemoteServer.make({
      entities: [price],
      viewer: who => Option.map(who, id => ({ entity: 'Price', id })),
    })
    const { exit, reads } = await noted(server, true, 'u1')
    expect(reads).toEqual([
      CachedRead.Public({
        policy: Option.getOrThrow(EdgeCache.policyOf(Price)),
        tags: ['row:Price:a'],
      }),
    ])
    expect(exit._tag === 'Success' && Object.hasOwn(exit.value, 'principal')).toBe(false)
  })

  it('notes a read private without a cache', async () => {
    const { price } = world()
    const { reads } = await noted(RemoteServer.make({ entities: [price] }), false)
    expect(reads).toEqual([CachedRead.Private()])
  })

  it('notes a read private under a rule', async () => {
    const { price } = world()
    const { reads } = await noted(
      RemoteServer.make({ entities: [{ ...price, authorize: (_, fields) => fields }] }),
      true,
    )
    expect(reads).toEqual([CachedRead.Private()])
  })

  it('notes a read that failed private', async () => {
    const failing = RemoteServer.entity<Who>(Price, {
      read: () => Effect.fail(new RemoteServerError({ message: 'gone' })),
    })
    const { reads } = await noted(RemoteServer.make({ entities: [failing] }), true)
    expect(reads).toEqual([CachedRead.Private()])
  })
})
