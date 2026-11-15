/**
 * The Domain model behind the adapter, as a scenario and the ordering tests
 * run it: hosted in memory with every View delivery held until `fixture.drain`,
 * signed in as whoever `as` holds (each call carries that user's header, as a
 * session cookie would), and steerable at the one call that matters: the
 * reply to a `ReserveStock` can be held back, or lost after the command ran,
 * and a View frame can be delivered late.
 */
import { Deferred, Effect, Match, Option, Queue, Schema, Stream, type Duration } from 'effect'
import { RpcClientDefect, RpcClientError } from 'effect/rpc/RpcClientError'
import { Product } from 'foldkit-example-writes/domain'
import { Fixture } from 'foldkit-remote-domain/testing'
import { ProductRowLive, SessionLive, Shop, ShopApi } from '../model.js'
import { bindings } from '../shop.js'
import type { Row } from 'foldkit-entity'

type Client = Effect.Success<typeof ShopApi.clientInProcess>

type Steer =
  | { readonly _tag: 'Hold'; readonly released: Deferred.Deferred<void> }
  | { readonly _tag: 'Lose' }

const decodeRow = Schema.decodeUnknownSync(Product.schema)

const lost = () =>
  new RpcClientError({
    reason: new RpcClientDefect({ message: 'the reply was lost', cause: null }),
  })

export const world = (options: { readonly confirmWithin?: Duration.Input } = {}) => {
  const steering: Array<Steer> = []
  const commandIds: Array<string | undefined> = []
  const late = Effect.runSync(Queue.unbounded<{ readonly key: string; readonly frame: unknown }>())

  const steered = (client: Client): Client => {
    const view = client.ProductRow
    return {
      ...client,
      ReserveStock: (target, input, options) =>
        Effect.gen(function* () {
          commandIds.push(options?.commandId)
          const steer = Option.fromUndefinedOr(steering.shift())
          const answer = yield* client.ReserveStock(target, input, options).pipe(Effect.exit)
          yield* Option.match(steer, {
            onNone: () => Effect.void,
            onSome: each =>
              Match.valueTags(each, {
                Hold: ({ released }) => Deferred.await(released),
                Lose: () => Effect.fail(lost()),
              }),
          })
          return yield* answer
        }),
      ProductRow: {
        ...view,
        watch: (key, options) =>
          Stream.merge(
            view.watch(key, options),
            Stream.fromQueue(late).pipe(
              Stream.filter(each => each.key === key),
              Stream.map(each => each.frame as never),
            ),
          ),
      },
    }
  }

  const fixture = Fixture.make(ShopApi, {
    model: Shop,
    handlers: ProductRowLive,
    middleware: SessionLive,
    headers: id => ({ 'x-user': id }),
    through: steered,
    bindings: bindings(options),
  })
  return {
    layer: fixture.layer,
    control: {
      drain: fixture.drain,
      get commits() {
        return fixture.commits()
      },
    },
    /** Who the page is signed in as: none is a visitor. */
    as: fixture.as,
    /** The `commandId` of each `ReserveStock` sent, in order. */
    commandIds,
    /** Sends every open watch of `key` a frame, as one the transport delivered late. */
    deliverLate: (key: string, frame: unknown) => Queue.offer(late, { key, frame }),
    /** Lists these rows as products, and lets every View catch up. */
    seed: (rows: ReadonlyArray<Row>) =>
      Effect.gen(function* () {
        const client = yield* ShopApi.clientInProcess
        for (const row of rows)
          yield* client.ListProduct(String(row['id']), { row: decodeRow(row) })
        yield* fixture.drain
      }),
    /** Holds the reply of the next `ReserveStock` until `release` runs; the command itself runs at once. */
    holdReply: () => {
      const released = Deferred.makeUnsafe<void>()
      steering.push({ _tag: 'Hold', released })
      return Deferred.succeed(released, undefined)
    },
    /** Runs the next `ReserveStock`, then fails it as a transport that lost the reply. */
    loseReply: () => {
      steering.push({ _tag: 'Lose' })
    },
  }
}

export type World = ReturnType<typeof world>
