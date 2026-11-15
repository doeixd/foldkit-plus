// @vitest-environment node
/**
 * What the shop's Domain Api imports into Remote, as `Imported.describe` says
 * it, kept as text in `IMPORTED.md` (`vitest -u` writes it; a changed schema
 * shows as a diff): `ReserveStock`
 * lowered from a declared write, and `ListProduct`, a command nothing here
 * declared a write for.
 */
import { Effect, Layer, Option } from 'effect'
import { Footprint } from 'foldkit-entity'
import { Product, reservedWithinStock } from 'foldkit-example-writes/domain'
import { Refusal, Remote, RemoteClient } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'
import { Imported } from 'foldkit-remote-domain/imported'
import { describe, expect, it } from 'vitest'
import { ReserveStock } from '../src/domain.js'
import { host, ProductReads, ReserveBinding, ShopApi } from '../src/model.js'
import { Data } from '../src/shop.js'
import { adapted } from './lower/worlds.js'

/** `ListProduct` as a mutation that names nothing it writes. */
const Listed = Imported.mutation(ShopApi, 'ListProduct', { entity: Product })

const ListBinding = DomainRemote.command(Listed, ShopApi, 'ListProduct', {
  entity: Product,
  target: input => input.target,
  input: input => input.input,
})

const description = Imported.describe(ShopApi, {
  views: [ProductReads],
  commands: [ReserveBinding, ListBinding],
  fields: { ReserveStock: { Invalid: 'reserved' } },
})

describe('what the shop imports from its Domain Api', () => {
  it('is kept as text in IMPORTED.md', async () => {
    await expect(Imported.show(description)).toMatchFileSnapshot('../IMPORTED.md')
  })

  it('lists ReserveStock with a Derived footprint and ListProduct with an Unknown one', () => {
    const footprints = Object.fromEntries(
      description.operations.map(each => [each.id, each.footprint]),
    )
    expect(footprints).toEqual({
      'ShopApi/ListProduct': Footprint.unknown,
      'ShopApi/ReserveStock': Footprint.Derived({
        reads: ['status', 'reserved', 'revision'],
        writes: ['reserved', 'revision'],
      }),
    })
  })

  it('answers the opaque command through the adapter', async () => {
    const { layer, control } = host()
    const adapter = DomainRemote.layer(ShopApi, {
      views: [ProductReads],
      commands: [ReserveBinding, ListBinding],
      principal: Effect.succeed(Option.some('ada')),
      denied: () => 'Unauthenticated',
      confirmWithin: '50 millis',
    }).pipe(
      Layer.provideMerge(Layer.effect(ShopApi.Client, ShopApi.clientInProcess)),
      Layer.provideMerge(layer),
    )
    const nut = {
      id: 'p9',
      ownerId: 'ada',
      name: 'Nut',
      status: 'draft',
      stock: 3,
      reserved: 0,
      revision: 1,
    }
    const answered = await Effect.runPromise(
      Effect.flatMap(RemoteClient, client =>
        client.mutate({
          requestId: 'r1',
          operation: 'op-list',
          mutation: 'ListProduct',
          input: { target: 'p9', input: { row: nut } },
          principal: 'ada',
        }),
      ).pipe(Effect.scoped, Effect.provide(adapter)),
    )
    expect(answered.output).toEqual({})
    expect(answered.principal).toBe('ada')
    expect(control.commits.filter(({ aggregate }) => aggregate === 'Product')).toHaveLength(1)
  })

  it('reaches Data.refusal as Invalid over the reserved field, matched by the invariant it names', async () => {
    const started = Data.mutate({ remote: Remote.initial }, ReserveStock, {
      id: 'p1',
      revision: 1,
      quantity: 9,
    })
    const answer = await adapted(() => started.command.effect)
    const refusal = Data.refusal(
      Data.reduce(started.model, answer),
      started.requestId,
      ReserveStock,
    )
    expect(refusal).toEqual(
      Option.some(expect.objectContaining({ _tag: 'Invalid', path: ['reserved'] })),
    )
    expect(Option.map(refusal, held => Refusal.isInvalidBy(held, reservedWithinStock))).toEqual(
      Option.some(true),
    )
  })
})
