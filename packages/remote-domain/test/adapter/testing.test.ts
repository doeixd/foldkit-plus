// @vitest-environment node
/** `Fixture.make`: the model seeded, held until drained, and called as one principal. */
import { Effect, Option, Ref, Stream } from 'effect'
import { RemoteClient, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { DomainRemote } from '../../src/index.js'
import { Fixture } from '../../src/testing.js'
import {
  ProductEntity,
  ProductRowLive,
  Reserve,
  Seeded,
  SessionLive,
  Shop,
  ShopApi,
  StockReserved,
  invalidOf,
} from './fixture.js'

const Reads = DomainRemote.view(ProductEntity, ShopApi, 'ProductRow', { revision: 'revision' })
const Reserving = DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
  target: input => input.id,
  input: input => ({ quantity: input.quantity, revision: input.revision }),
  refusals: {
    Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
    Invalid: rejection => DomainRemote.refuse(invalidOf(rejection)),
    NotOwner: () => DomainRemote.forbid('Only its owner reserves its stock'),
    Missing: () => DomainRemote.fail('No such product'),
  },
  written: reply => reply,
})

const fixture = (as?: string) =>
  Fixture.make(ShopApi, {
    model: Shop,
    handlers: ProductRowLive,
    middleware: SessionLive,
    given: [
      {
        aggregate: 'Product',
        id: 'p1',
        events: [
          new Seeded({ ownerId: 'ada', stock: 10 }),
          new StockReserved({ reservedAfter: 3, revision: 2 }),
        ],
      },
    ],
    ...(as === undefined ? {} : { as }),
    bindings: { views: [Reads], commands: [Reserving], denied: () => 'Unauthenticated' },
  })

const fields = ['ownerId', 'stock', 'reserved', 'revision']
const readP1 = Effect.flatMap(RemoteClient, client =>
  client.read({
    version: REMOTE_PROTOCOL_VERSION,
    requests: [{ entity: 'Product', id: 'p1', fields }],
  }),
)

describe('Fixture.make', () => {
  it('seeds the given events without a command, and holds the View until drained', async () => {
    const shop = fixture('ada')
    const seen = await Effect.runPromise(
      Effect.gen(function* () {
        const behind = yield* readP1
        yield* shop.drain
        return { behind, caught: yield* readP1, commits: shop.commits() }
      }).pipe(Effect.scoped, Effect.provide(shop.layer)),
    )
    expect(seen.behind.entities).toEqual([])
    expect(seen.caught.entities[0]?.values).toEqual({
      ownerId: 'ada',
      stock: 10,
      reserved: 3,
      revision: 2,
    })
    expect(seen.commits).toEqual([])
  })

  it('calls as the principal, who may be changed, and counts a command as a commit', async () => {
    const shop = fixture('ada')
    const seen = await Effect.runPromise(
      Effect.gen(function* () {
        yield* shop.drain
        const client = yield* RemoteClient
        const reserve = (principal: string | null) =>
          client.mutate({
            requestId: 'r',
            operation: `op-${principal}`,
            mutation: 'ReserveStock',
            input: { id: 'p1', quantity: 1, revision: 2 },
            principal,
          })
        const refused = yield* Effect.flip(reserve('grace'))
        yield* Ref.set(shop.as, Option.some('grace'))
        const asGrace = yield* Effect.flip(reserve('grace'))
        yield* Ref.set(shop.as, Option.some('ada'))
        const landed = yield* reserve('ada')
        const domain = yield* ShopApi.Client
        yield* Effect.sleep('50 millis')
        const held = (yield* domain.ProductRow.snapshot('p1')).state?.reserved
        yield* shop.drain
        const drained = (yield* domain.ProductRow.snapshot('p1')).state?.reserved
        return { refused, asGrace, landed, held, drained, commits: shop.commits() }
      }).pipe(Effect.scoped, Effect.provide(shop.layer)),
    )
    expect(seen.refused._tag).toBe('PrincipalChanged')
    expect(seen.asGrace._tag).toBe('Forbidden')
    expect(seen.landed.entities[0]?.values).toMatchObject({ reserved: 4 })
    expect(seen.held).toBe(3)
    expect(seen.drained).toBe(4)
    expect(seen.commits).toEqual([{ aggregate: 'Product', id: 'p1', index: 2 }])
  })

  it('answers a visitor Unauthenticated when no one is signed in', async () => {
    const shop = fixture()
    const refused = await Effect.runPromise(
      Effect.gen(function* () {
        yield* shop.drain
        return yield* Effect.flip(readP1)
      }).pipe(Effect.scoped, Effect.provide(shop.layer)),
    )
    expect(refused._tag).toBe('Unauthenticated')
  })

  it('carries the principal on a live read too', async () => {
    const shop = fixture('ada')
    const first = await Effect.runPromise(
      Effect.gen(function* () {
        yield* shop.drain
        const client = yield* ShopApi.Client
        const frames = yield* Stream.runCollect(client.ProductRow.watch('p1').pipe(Stream.take(1)))
        return frames[0]?.state
      }).pipe(Effect.scoped, Effect.provide(shop.layer)),
    )
    expect(first).toMatchObject({ ownerId: 'ada', reserved: 3 })
  })
})
