/**
 * The Domain model behind the adapter, as a scenario and the ordering tests
 * run it: hosted in memory with every View delivery held until `control.drain`,
 * signed in as whoever `as` holds (each call carries that user's header, as a
 * session cookie would), and steerable at the one call that matters: the
 * reply to a `ReserveStock` can be held back, or lost after the command ran,
 * and a View frame can be delivered late.
 */
import { Deferred, Effect, Layer, Option, Queue, Ref, Schema, Stream, type Duration } from 'effect'
import { RpcClientDefect, RpcClientError } from 'effect/rpc/RpcClientError'
import { Product } from 'foldkit-example-writes/domain'
import { host, ShopApi } from '../model.js'
import { adapter } from '../shop.js'
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
  const { layer: hosted, control } = host()
  const as = Ref.makeUnsafe<Option.Option<string>>(Option.none())
  const steering: Array<Steer> = []
  const commandIds: Array<string | undefined> = []
  const late = Effect.runSync(Queue.unbounded<{ readonly key: string; readonly frame: unknown }>())

  const headers = Effect.map(
    Ref.get(as),
    Option.match({
      onNone: (): Readonly<Record<string, string>> => ({}),
      onSome: id => ({ 'x-user': id }),
    }),
  )

  const steered = (client: Client): Client => {
    const view = client.ProductRow
    return {
      ...client,
      ReserveStock: (target, input, options) =>
        Effect.gen(function* () {
          commandIds.push(options?.commandId)
          const steer = steering.shift()
          const answer = yield* client
            .ReserveStock(target, input, { ...options, headers: yield* headers })
            .pipe(Effect.exit)
          if (steer?._tag === 'Hold') yield* Deferred.await(steer.released)
          if (steer?._tag === 'Lose') return yield* Effect.fail(lost())
          return yield* answer
        }),
      ProductRow: {
        ...view,
        snapshot: (key, options) =>
          Effect.flatMap(headers, headers => view.snapshot(key, { ...options, headers })),
        watch: (key, options) =>
          Stream.unwrap(
            Effect.map(headers, headers =>
              Stream.merge(
                view.watch(key, { ...options, headers }),
                Stream.fromQueue(late).pipe(
                  Stream.filter(each => each.key === key),
                  Stream.map(each => each.frame as never),
                ),
              ),
            ),
          ),
      },
    }
  }

  const layer = adapter(Ref.get(as), options).pipe(
    Layer.provideMerge(Layer.effect(ShopApi.Client, Effect.map(ShopApi.clientInProcess, steered))),
    Layer.provideMerge(hosted),
  )

  return {
    layer,
    control,
    /** Who the page is signed in as: none is a visitor. */
    as,
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
        yield* control.drain
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
