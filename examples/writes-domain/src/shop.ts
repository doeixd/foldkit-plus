/**
 * What the shop page holds on each side of the wire: its `Data` (the products
 * it reads and the reservation it sends, as the browser keeps them), and the
 * adapter that answers Remote's client from the Domain model, through the
 * bindings `Lower.write` derived (`model.ts`). The page declares no more than
 * `examples/writes` does; the model decides.
 */
import { Optic, Schema, type Duration, type Effect, type Option } from 'effect'
import { Product } from 'foldkit-example-writes/domain'
import { Remote } from 'foldkit-remote'
import { DomainRemote } from 'foldkit-remote-domain'
import { ModelRef } from 'foldkit-surface'
import { ReserveStock } from './domain.js'
import { ProductReads, ReserveBinding, ShopApi } from './model.js'

/** What the page keeps: Remote's slice, and nothing else. */
export const ShopModel = Schema.Struct({ remote: Remote.Model })
export type ShopModel = typeof ShopModel.Type

export const Data = Remote.make({
  model: ModelRef.fromOptic(Remote.Model, Optic.id<ShopModel>().key('remote'), ['remote']),
  entities: [Product],
  mutations: [ReserveStock],
})

/**
 * `RemoteClient` answered from the model: `principal` is who the page is signed
 * in as (the adapter keeps one write queue per principal), and `confirmWithin`
 * how long a read waits for a View that is behind.
 */
export const adapter = (
  principal: Effect.Effect<Option.Option<string>>,
  options: { readonly confirmWithin?: Duration.Input } = {},
) =>
  DomainRemote.layer(ShopApi, {
    views: [ProductReads],
    commands: [ReserveBinding],
    principal,
    denied: () => 'Unauthenticated',
    confirmWithin: options.confirmWithin ?? '50 millis',
  })
