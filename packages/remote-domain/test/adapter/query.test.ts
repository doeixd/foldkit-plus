// @vitest-environment node
/**
 * Lists through `DomainRemote.query`: a Remote query answered by the paged
 * `InStock` Domain Query, each listed row read through its View. The Query
 * lists every product in stock, whoever owns it; ada reads only hers, so
 * grace's p3 is listed by Domain and never by the adapter.
 */
import { type Duration, Effect, Fiber, Layer, Option, Ref, type Scope, Stream } from 'effect'
import { RemoteClient, Remote, type LiveEvent, type QueryRequest } from 'foldkit-remote'
import { liveQuery } from 'foldkit-remote/live'
import { Law } from 'foldkit-remote/testing'
import { defineMessageUnion } from 'foldkit/message'
import { Entity } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { DomainRemote } from '../../src/index.js'
import {
  calls,
  Data,
  PageModel,
  Products,
  Related,
  Reserve,
  shop,
  ShopApi,
  Stocked,
  Suppliers,
} from './lists.js'

type Shop = ReturnType<typeof shop>

/** Runs a body against the seeded shop, its View and Query caught up first. */
const run = <A, E>(
  body: (shop: Shop) => Effect.Effect<A, E, Layer.Success<Shop['layer']> | Scope.Scope>,
  options: Parameters<typeof shop>[0] = {},
) => {
  const seeded = shop(options)
  return Effect.runPromise(
    Effect.gen(function* () {
      yield* seeded.drain
      return yield* body(seeded)
    }).pipe(Effect.scoped, Effect.provide(seeded.layer)),
  )
}

const productFields = ['ownerId', 'stock', 'reserved', 'revision']
const select = { entity: 'Product', fields: productFields }

const ask = (
  window: {
    readonly first?: number
    readonly last?: number
    readonly after?: string
    readonly before?: string
  },
  options: {
    readonly select?: typeof select
    readonly input?: unknown
    readonly query?: string
  } = {},
) =>
  Effect.flatMap(RemoteClient, client =>
    client.query({
      query: options.query ?? 'Stocked',
      input: options.input ?? { shelf: 'main' },
      window,
      ...(options.select === undefined ? {} : { select: options.select }),
    }),
  )

const ids = (edges: ReadonlyArray<{ readonly id: string }>) => edges.map(edge => edge.id)

const identity = Stocked.ref({ shelf: 'main' }).identity

describe('a list', () => {
  it('pages forward to its last page, and Remote merges the pages into one list', async () => {
    const pages = await run(() =>
      Effect.gen(function* () {
        const first = yield* ask({ first: 2 })
        const second = yield* ask({ first: 2, after: 'p2' })
        const third = yield* ask({ first: 2, after: 'p4' })
        return [first, second, third]
      }),
    )
    expect(pages.map(page => ids(page.edges))).toEqual([['p1', 'p2'], ['p4'], ['p5']])
    expect(pages.map(page => [page.start, page.end])).toEqual([
      [{ _tag: 'Terminal' }, { _tag: 'Cursor', cursor: 'p2' }],
      [
        { _tag: 'Cursor', cursor: 'p2' },
        { _tag: 'Cursor', cursor: 'p4' },
      ],
      [{ _tag: 'Cursor', cursor: 'p4' }, { _tag: 'Terminal' }],
    ])
    expect(pages[0]!.edges[0]).toEqual({ entity: 'Product', id: 'p1', key: 'Product:p1' })
    const merged = pages.reduce(
      (model, page) =>
        Data.reduce(model, {
          _tag: 'ConnectionMerged',
          connection: identity,
          page: {
            edges: page.edges.map(edge => ({
              key: edge.key,
              ref: { entity: edge.entity, id: edge.id },
            })),
            start: page.start,
            end: page.end,
          },
        }),
      { remote: Remote.initial },
    )
    expect(Data.visibleItems(Data.store.get(merged), identity).map(edge => edge.ref.id)).toEqual([
      'p1',
      'p2',
      'p4',
      'p5',
    ])
  })

  it('names only rows the View lets who asks see, and reads each with its revision', async () => {
    const page = await run(() => ask({ first: 10 }, { select }))
    expect(ids(page.edges)).toEqual(['p1', 'p2', 'p4', 'p5'])
    expect(page.entities?.map(row => row.id)).toEqual(['p1', 'p2', 'p4', 'p5'])
    expect(page.entities?.[0]).toEqual({
      entity: 'Product',
      id: 'p1',
      values: { ownerId: 'ada', stock: 10, reserved: 0, revision: 1 },
      revision: 1,
    })
    expect(page.principal).toBe('ada')
  })

  it('carries no rows for a select of another Entity, and none unasked', async () => {
    const pages = await run(() =>
      Effect.all([
        ask({ first: 2 }, { select: { entity: 'Supplier', fields: ['name'] } }),
        ask({ first: 2 }),
      ]),
    )
    expect(pages[0]).toMatchObject({ entities: [], settled: [] })
    expect(ids(pages[0].edges)).toEqual(['p1', 'p2'])
    expect(pages[1].entities).toBeUndefined()
  })

  it.each([
    { window: { last: 2 }, refused: /pages forward only/ },
    { window: { first: 2, before: 'p4' }, refused: /pages forward only/ },
    { window: { first: 0 }, refused: /at least one row/ },
    { window: { first: 2, after: 'p'.repeat(1025) }, refused: /longer than 1024/ },
    { window: { first: 1.5 }, refused: /did not decode/ },
  ])('refuses the window $window by name, asking Domain nothing', async ({ window, refused }) => {
    const error = await run(() => Effect.flip(ask(window)))
    expect(error).toMatchObject({
      _tag: 'RemoteQueryError',
      message: expect.stringMatching(refused),
    })
  })

  it.each([
    { options: { input: { shelf: 3 } }, refused: /Stocked's input did not decode/ },
    { options: { query: 'Elsewhere' }, refused: /No Domain Query is bound to Elsewhere/ },
    { options: { input: { shelf: 'back' } }, refused: /InStock refused who asks/ },
  ])('refuses $options by name', async ({ options, refused }) => {
    const error = await run(() => Effect.flip(ask({ first: 2 }, options)))
    expect(error).toMatchObject({
      _tag: 'RemoteQueryError',
      message: expect.stringMatching(refused),
    })
  })

  it('is refused to a visitor as unauthenticated', async () => {
    const error = await run(seeded =>
      Effect.andThen(Ref.set(seeded.as, Option.none()), Effect.flip(ask({ first: 2 }))),
    )
    expect(error._tag).toBe('Unauthenticated')
  })
})

describe("a write's answer", () => {
  const reserve = (quantity: number, lists: ReadonlyArray<typeof QueryRequest.Type>) =>
    Effect.flatMap(RemoteClient, client =>
      client.mutate({
        requestId: 'r1',
        operation: 'op1',
        mutation: 'ReserveStock',
        input: { id: 'p2', quantity, revision: 1 },
        principal: 'ada',
        lists,
      }),
    )
  const listRequest = { query: 'Stocked', input: { shelf: 'main' }, window: { first: 10 }, select }

  it('carries the list read at its receipt, once the Query catches up', async () => {
    const answer = await run(seeded =>
      Effect.gen(function* () {
        const writing = yield* Effect.forkChild(reserve(5, [listRequest]))
        yield* Effect.sleep('30 millis')
        yield* seeded.drain
        return yield* Fiber.join(writing)
      }),
    )
    // p2 is now fully reserved: out of the list read after the write.
    expect(answer.lists?.map(({ result }) => ids(result.edges))).toEqual([['p1', 'p4', 'p5']])
    expect(answer.lists?.[0]?.request).toEqual(listRequest)
  })

  it('leaves out a list whose Query has not caught up, for the client to ask again', async () => {
    const answer = await run(() => reserve(5, [listRequest]), { confirmWithin: '50 millis' })
    expect(answer.lists).toBeUndefined()
    expect(answer.entities[0]).toMatchObject({ id: 'p2', values: { reserved: 5, revision: 2 } })
  })
})

describe('a live list', () => {
  /** What the list's live stream sends within a moment of opening. */
  const watch = (take: number, within: Duration.Input = '300 millis') =>
    Effect.flatMap(RemoteClient, client =>
      client
        .live({
          requirements: [],
          queries: [{ query: 'Stocked', input: { shelf: 'main' }, window: { first: 10 } }],
          after: 7,
        })
        .pipe(
          Stream.take(take),
          Stream.interruptWhen(Effect.sleep(within)),
          Stream.runCollect,
          Effect.forkChild,
        ),
    )
  const invalidated = (cursor: number): LiveEvent => ({
    _tag: 'ConnectionInvalidate',
    connection: identity,
    cursor,
  })

  it('is invalidated as it opens, then when a change of a row it lists moves what it lists', async () => {
    const events = await run(seeded =>
      Effect.gen(function* () {
        const watching = yield* watch(2)
        yield* Effect.sleep('50 millis')
        const client = yield* ShopApi.Client
        // p1 changes and stays listed: nothing to say of the list.
        yield* client.ReserveStock('p1', { quantity: 1, revision: 1 })
        yield* seeded.drain
        yield* Effect.sleep('30 millis')
        // p2 changes and leaves it.
        yield* client.ReserveStock('p2', { quantity: 5, revision: 1 })
        yield* seeded.drain
        return yield* Fiber.join(watching)
      }),
    )
    expect(events).toEqual([invalidated(8), invalidated(9)])
  })

  it('says nothing after it opens while the rows it lists change and stay listed', async () => {
    const events = await run(seeded =>
      Effect.gen(function* () {
        const watching = yield* watch(2)
        yield* Effect.sleep('50 millis')
        yield* (yield* ShopApi.Client).ReserveStock('p1', { quantity: 1, revision: 1 })
        yield* seeded.drain
        return yield* Fiber.join(watching)
      }),
    )
    expect(events).toEqual([invalidated(8)])
  })

  it('asks the list again once for a burst of frames of the rows it lists', async () => {
    const listings = await run(seeded =>
      Effect.gen(function* () {
        const watching = yield* watch(2)
        yield* Effect.sleep('50 millis')
        const before = calls.listed
        const client = yield* ShopApi.Client
        // Three rows change and stay listed, delivered together.
        for (const id of ['p1', 'p4', 'p5'])
          yield* client.ReserveStock(id, { quantity: 1, revision: 1 })
        yield* seeded.drain
        yield* Effect.sleep('150 millis')
        yield* Fiber.interrupt(watching)
        return calls.listed - before
      }),
    )
    expect(listings).toBe(1)
  })

  // Reopening every watch would judge each kept row again for its first frame,
  // and a row that left would still be watched.
  it('keeps the watches of the rows that stay listed when it moves', async () => {
    const { moved, asked, relisted } = await run(seeded =>
      Effect.gen(function* () {
        const watching = yield* watch(3, '2 seconds')
        yield* Effect.sleep('50 millis')
        const before = calls.judged
        // p2 leaves: its frame is judged, and the list asked again.
        yield* (yield* ShopApi.Client).ReserveStock('p2', { quantity: 5, revision: 1 })
        yield* seeded.drain
        yield* Effect.sleep('150 millis')
        const moved = calls.judged - before
        const askedFrom = calls.judged
        yield* ask({ first: 10 })
        const asked = calls.judged - askedFrom
        // p2 left, so a change of it is no reason to ask the list again.
        const listedFrom = calls.listed
        yield* (yield* ShopApi.Client).Transfer('p2', { ownerId: 'grace' })
        yield* seeded.drain
        yield* Effect.sleep('150 millis')
        yield* Fiber.interrupt(watching)
        return { moved, asked, relisted: calls.listed - listedFrom }
      }),
    )
    expect(moved).toBe(asked + 1)
    expect(relisted).toBe(0)
  })

  // A server render listed p1, p2, p4 and p5; p3 joined (grace gave it to ada)
  // before the browser opened its stream. No row the page holds changed, so
  // only the invalidation at the start reaches the page, which reads p3.
  it('brings a row that joined before the stream opened, as a page resumed from a render', async () => {
    const { events, after } = await run(seeded =>
      Effect.gen(function* () {
        expect(ids((yield* ask({ first: 10 })).edges)).toEqual(['p1', 'p2', 'p4', 'p5'])
        yield* (yield* ShopApi.Client).Transfer('p3', { ownerId: 'ada' })
        yield* seeded.drain
        const events = yield* Fiber.join(yield* watch(2))
        return { events, after: ids((yield* ask({ first: 10 })).edges) }
      }),
    )
    expect(events).toEqual([invalidated(8)])
    expect(after).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
  })

  // The stream broke, p3 joined in the gap, and Remote's restart re-reads the
  // rows it follows, not its lists: the restarted stream's start asks the list again.
  it('asks the list again when Remote restarts its stream after a join in the gap', async () => {
    // A page's domain, made from an application's field so it has reads.
    const App = Surface.application({
      Model: PageModel,
      Message: defineMessageUnion({ ...Remote.messages }),
    })
    const Page = Remote.make({
      model: App.model.remote,
      entities: [Related.Product, Related.Supplier],
      queries: [Stocked],
    })
    const entry = Page.subscriptions({
      list: Page.active('Stocked', () =>
        Option.some(
          liveQuery(
            Page,
            Stocked,
            { shelf: 'main' },
            { select: Entity.select(Related.Product, { stock: true }), first: 10 },
          ),
        ),
      ),
    })['list.live']
    const held = Page.reduce(
      { remote: Remote.initial },
      {
        _tag: 'ConnectionMerged',
        connection: identity,
        page: {
          edges: ['p1', 'p2', 'p4', 'p5'].map(id => ({
            key: `Product:${id}`,
            ref: { entity: 'Product', id },
          })),
          start: { _tag: 'Terminal' },
          end: { _tag: 'Terminal' },
        },
      },
    )
    const sent = await run(seeded =>
      Effect.gen(function* () {
        yield* (yield* ShopApi.Client).Transfer('p3', { ownerId: 'ada' })
        yield* seeded.drain
        const restarted = { ...entry.modelToDependencies(held), restarts: 1, failures: 1 }
        return yield* entry
          .dependenciesToStream(restarted)
          .pipe(Stream.take(3), Stream.interruptWhen(Effect.sleep('500 millis')), Stream.runCollect)
      }),
    )
    expect(sent.map(message => message._tag)).toEqual([
      'RefreshStarted',
      'GapCleared',
      'LiveReceived',
    ])
    const after = sent.reduce((model, message) => Page.reduce(model, message), held)
    expect(after.remote.connections[identity]?.stale).toBe(true)
  })
})

describe('the law over the write, with the list', () => {
  it('finds no disagreement between the list the page places and the one Domain answers', async () => {
    const report = await run(seeded =>
      Effect.gen(function* () {
        // The read models catch up whenever they are behind, as hosted ones do.
        yield* Effect.forkChild(
          Effect.forever(Effect.andThen(seeded.drain, Effect.sleep('5 millis'))),
        )
        return yield* Law.check(Data, {
          model: { remote: Remote.initial },
          holds: [{ entity: Products.entity, ids: ['p1', 'p2', 'p4', 'p5'] }],
          lists: [Stocked.ref({ shelf: 'main' })],
          mutation: Reserve,
          input: { id: 'p2', quantity: 5, revision: 1 },
          now: 0,
        })
      }),
    )
    expect(report.disagreed).toEqual([])
    expect(report.agreed).toContain(identity)
  })
})

describe('a binding', () => {
  it('refuses a Query the Api does not serve, and one that answers no pages', () => {
    expect(() =>
      // @ts-expect-error: the Api serves no Query of that name
      DomainRemote.query(Stocked, ShopApi, 'Nowhere', { input: () => ({}), id: () => '' }),
    ).toThrow(/serves no Query named Nowhere/)
    expect(() =>
      // @ts-expect-error: Count answers no pages
      DomainRemote.query(Stocked, ShopApi, 'Count', { input: () => ({}), id: () => '' }),
    ).toThrow(/Count answers no pages/)
  })

  it('is refused by a layer that binds no View for the rows it lists', async () => {
    const Listed = DomainRemote.query(Stocked, ShopApi, 'InStock', {
      input: input => input,
      id: entry => entry.id,
    })
    const layer = DomainRemote.layer(ShopApi, {
      views: [Suppliers],
      commands: [],
      queries: [Listed],
      principal: Effect.succeedNone,
      denied: () => 'Unauthenticated',
    })
    await expect(run(() => Layer.build(layer))).rejects.toThrow(
      /Stocked lists Product, which no View given to the layer serves/,
    )
  })
})
