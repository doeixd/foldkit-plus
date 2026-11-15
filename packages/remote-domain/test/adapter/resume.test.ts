// @vitest-environment node
/**
 * First paint from a server render (A-WP9): the page render reads through
 * `pageReader`, as the principal its request resolves to; the browser's live
 * stream names the revisions it was handed, and the adapter sends no frame at
 * or before one.
 */
import * as InMemory from '@alchemy.run/domain/InMemory'
import { Effect, Fiber, Layer, Option, Result, Stream } from 'effect'
import { RemoteClient, REMOTE_PROTOCOL_VERSION, RemoteUnauthenticated } from 'foldkit-remote'
import { type CachedRead, PageReads } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { DomainRemote } from '../../src/index.js'
import { pageReader } from '../../src/adapter/resume.js'
import {
  CurrentActor,
  ProductEntity,
  ProductRowLive,
  Session,
  SessionLive,
  Shop,
  ShopApi,
  Unauthorized,
} from './fixture.js'
import { world as makeWorld, type World } from './transport.js'

const fields = ['ownerId', 'stock', 'reserved', 'note', 'revision']
const requirement = { entity: 'Product', id: 'p1', fields }

const touch = (note: string) =>
  Effect.flatMap(ShopApi.Client, client => client.Touch('p1', { note }))

/** Runs a body in a fresh world, with p1 seeded for ada (revision 1) and its View caught up. */
const run = <A, E>(body: (world: World) => Effect.Effect<A, E, Layer.Success<World['layer']>>) => {
  const world = makeWorld()
  return Effect.runPromise(
    Effect.gen(function* () {
      const client = yield* ShopApi.Client
      yield* client.Seed('p1', { ownerId: 'ada', stock: 10 })
      yield* world.control.drain
      return yield* body(world)
    }).pipe(Effect.scoped, Effect.provide(world.layer)),
  )
}

describe('a live stream that names the revisions it holds', () => {
  it('sends no frame at the revision held, and the first change after it', async () => {
    const events = await run(world =>
      Effect.gen(function* () {
        const client = yield* RemoteClient
        const watching = yield* client
          .live({
            requirements: [requirement],
            queries: [],
            after: 7,
            revisions: [{ entity: 'Product', id: 'p1', revision: 1 }],
          })
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
        yield* Effect.sleep('50 millis')
        yield* touch('hello')
        yield* world.control.drain
        return yield* Fiber.join(watching)
      }),
    )
    expect(events).toEqual([
      expect.objectContaining({
        _tag: 'EntityPatched',
        values: expect.objectContaining({ note: 'hello', revision: 2 }),
        revision: 2,
        cursor: 8,
      }),
    ])
  })

  it('sends a frame newer than the revision held at once', async () => {
    const events = await run(world =>
      Effect.gen(function* () {
        yield* touch('between')
        yield* world.control.drain
        const client = yield* RemoteClient
        return yield* client
          .live({
            requirements: [requirement],
            queries: [],
            after: 0,
            revisions: [{ entity: 'Product', id: 'p1', revision: 1 }],
          })
          .pipe(Stream.take(1), Stream.runCollect)
      }),
    )
    expect(events).toEqual([
      expect.objectContaining({
        values: expect.objectContaining({ note: 'between' }),
        revision: 2,
      }),
    ])
  })

  it('reads a row held to a receipt at it, whatever revision is named', async () => {
    const events = await run(world =>
      Effect.gen(function* () {
        const client = yield* RemoteClient
        const watching = yield* client
          .live({
            requirements: [requirement],
            queries: [],
            after: 0,
            floors: [{ entity: 'Product', id: 'p1', token: 'Product/p1@1' }],
            revisions: [{ entity: 'Product', id: 'p1', revision: 1 }],
          })
          .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
        yield* Effect.sleep('20 millis')
        yield* world.control.drain
        return yield* Fiber.join(watching)
      }),
    )
    expect(events).toEqual([expect.objectContaining({ _tag: 'EntityPatched', revision: 1 })])
  })
})

describe('pageReader', () => {
  const Reads = DomainRemote.view(ProductEntity, ShopApi, 'ProductRow', { revision: 'revision' })

  /** The session the render trusts: the principal decided, or none, which the middleware refuses. */
  const trusting = (principal: Option.Option<string>) =>
    Layer.succeed(Session, effect =>
      Option.match(principal, {
        onNone: () => Effect.fail(new Unauthorized()),
        onSome: id => Effect.provideService(effect, CurrentActor, { id }),
      }),
    )

  const reader = pageReader(ShopApi, {
    views: [Reads],
    // Who the request is, from its session cookie alone.
    resolvePrincipal: (request: Request) => {
      const cookie = request.headers.get('cookie') ?? ''
      if (cookie === 'session=revoked')
        return Effect.fail(new RemoteUnauthenticated({ message: 'The session ended' }))
      return Effect.succeed(Option.fromNullishOr(/session=(\w+)/.exec(cookie)?.[1]))
    },
    middleware: trusting,
    confirmWithin: '200 millis',
  })

  /**
   * Runs `body` through the reader of `request` against one hosted model, with
   * p1 seeded for ada and its View caught up. Fails as the reader or the body does.
   */
  const render = <A, E>(request: Request, body: Effect.Effect<A, E, RemoteClient>) => {
    const { layer: platform, control } = InMemory.make({ manual: true })
    return Effect.runPromise(
      Effect.gen(function* () {
        yield* Effect.scoped(
          Effect.flatMap(ShopApi.clientInProcess, client =>
            client.Seed('p1', { ownerId: 'ada', stock: 10 }),
          ),
        ).pipe(Effect.provide(SessionLive))
        yield* control.drain
        return yield* body.pipe(Effect.provide(reader(request, undefined)), Effect.result)
      }).pipe(Effect.provide(Shop.layer(ProductRowLive).pipe(Layer.provide(platform)))),
    )
  }

  /** `render`'s answer, which must succeed. */
  const rendered = <A, E>(request: Request, body: Effect.Effect<A, E, RemoteClient>) =>
    render(request, body).then(Result.getOrThrow)

  const readP1 = Effect.flatMap(RemoteClient, client =>
    client.read({ version: REMOTE_PROTOCOL_VERSION, requests: [requirement] }),
  )

  const page = (headers: Record<string, string>) =>
    new Request('https://shop.test/products/p1', { headers })

  it('reads as the principal the request resolves to', async () => {
    const answer = await rendered(page({ cookie: 'session=ada' }), readP1)
    expect(answer.principal).toBe('ada')
    expect(answer.entities).toEqual([
      expect.objectContaining({ id: 'p1', values: expect.objectContaining({ ownerId: 'ada' }) }),
    ])
  })

  it('reads as the principal decided, not as a header the request claims', async () => {
    const answer = await rendered(page({ cookie: 'session=grace', 'x-actor': 'ada' }), readP1)
    expect(answer.principal).toBe('grace')
    // p1 is ada's: grace reads it as absent.
    expect(answer.entities).toEqual([])
  })

  it('fails Unauthenticated when the request is refused, reading nothing', async () => {
    const answer = await render(page({ cookie: 'session=revoked' }), readP1)
    expect(Result.isFailure(answer) && answer.failure).toBeInstanceOf(RemoteUnauthenticated)
  })

  it('only reads: a write and a live stream are refused', async () => {
    const refused = await rendered(
      page({ cookie: 'session=ada' }),
      Effect.flatMap(RemoteClient, client =>
        Effect.all([
          Effect.flip(
            client.mutate({
              requestId: 'r1',
              operation: 'op1',
              mutation: 'ReserveStock',
              input: { id: 'p1', quantity: 1, revision: 1 },
              principal: 'ada',
            }),
          ),
          Effect.flip(
            Stream.runCollect(client.live({ requirements: [requirement], queries: [], after: 0 })),
          ),
        ]),
      ),
    )
    expect(refused.map(error => error._tag)).toEqual(['RemoteMutationError', 'RemoteLiveError'])
  })

  it('notes each read private, so a page read as someone is never kept for others', async () => {
    const notes: Array<CachedRead> = []
    await rendered(
      page({ cookie: 'session=ada' }),
      readP1.pipe(
        Effect.provideService(
          PageReads,
          Option.some(read => void notes.push(read)),
        ),
      ),
    )
    expect(notes).toEqual([expect.objectContaining({ _tag: 'Private', read: 'Product p1' })])
  })
})
