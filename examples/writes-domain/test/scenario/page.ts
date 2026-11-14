/**
 * The shop page as the ordering tests drive it: Remote's reducer over the
 * adapter's client, one delivery at a time. A delivery is a read, a reply (the
 * mutation's Command run against the client) or a live frame from a stream
 * opened when the page started; each lands in the Model through `Data.reduce`,
 * as `update` would apply it, and `seen` records what the page shows after it.
 */
import { Effect, Option, Ref, Stream } from 'effect'
import { Entity } from 'foldkit-entity'
import { live } from 'foldkit-remote/live'
import { Product } from 'foldkit-example-writes/domain'
import {
  REMOTE_PROTOCOL_VERSION,
  entityKey,
  Remote,
  RemoteClient,
  type RemoteMessage,
} from 'foldkit-remote'
import { ReserveStock } from '../../src/domain.js'
import { Data, type ShopModel } from '../../src/shop.js'

const fields = ['status', 'stock', 'reserved', 'revision']
const selection = Entity.select(Product, {
  status: true,
  stock: true,
  reserved: true,
  revision: true,
})

/** What the page showed after a delivery, and what Remote knew of the write then. */
export interface Seen {
  readonly after: string
  readonly shows: unknown
  readonly write: string
}

/** Polls `read` until `until` holds of it: waiting on evidence the step happened, never a sleep. */
export const poll = <A, R>(
  read: Effect.Effect<A, never, R>,
  until: (value: A) => boolean,
  what: string,
) =>
  Effect.gen(function* () {
    for (let tries = 0; tries < 400; tries++) {
      const value = yield* read
      if (until(value)) return value
      yield* Effect.sleep('5 millis')
    }
    return yield* Effect.die(new Error(`waited for ${what}`))
  })

export const page = (id: string) =>
  Effect.gen(function* () {
    // Reading it live installs the live capability, which applies the stream's frames.
    live(Data, selection, id)
    const client = yield* RemoteClient
    const model = Ref.makeUnsafe<ShopModel>({ remote: Remote.initial })
    const seen: Array<Seen> = []
    let requestId: string | undefined

    const shows = (current: ShopModel): unknown => {
      const shown = Data.get(selection, id).read(current)
      return 'value' in shown
        ? { reserved: shown.value.reserved, revision: shown.value.revision }
        : shown._tag
    }
    const write = (current: ShopModel): string =>
      requestId === undefined ? 'none' : Data.mutation(current, requestId)._tag

    const deliver = (after: string, message: RemoteMessage) =>
      Effect.gen(function* () {
        const next = yield* Ref.updateAndGet(model, current => Data.reduce(current, message))
        seen.push({ after, shows: shows(next), write: write(next) })
      })

    /** The row's read-after token while Remote holds one: a read carries it, as the read entry's does. */
    const floors = Effect.map(Ref.get(model), current =>
      Data.inspect(current).floors.flatMap(({ key, token }) =>
        key === entityKey('Product', id) ? [{ entity: 'Product', id, token }] : [],
      ),
    )

    const read = Effect.gen(function* () {
      const requests = [{ entity: 'Product', id, fields }]
      const after = yield* floors
      const result = yield* client.read({
        version: REMOTE_PROTOCOL_VERSION,
        requests,
        ...(after.length === 0 ? {} : { after }),
      })
      yield* deliver('read', {
        _tag: 'ReadReceived',
        requests,
        result,
        now: 0,
        ...(after.length === 0 ? {} : { after }),
      })
    })

    /**
     * Opens the live stream, delivering each frame as it arrives, and waits for
     * its first: the View's state when it subscribed, which the adapter sends
     * as it is, since it holds nothing to compare it with.
     */
    let frames = -1
    const opened = client
      .live({ requirements: [{ entity: 'Product', id, fields }], queries: [], after: 0 })
      .pipe(
        Stream.runForEach(event =>
          Effect.suspend(() => {
            frames += 1
            return deliver(frames === 0 ? 'subscribed' : `live frame ${frames}`, {
              _tag: 'LiveReceived',
              stream: `${entityKey('Product', id)}:${[...fields].sort().join(',')}`,
              event,
              now: 0,
            })
          }),
        ),
        Effect.forkChild,
      )
    const watch = Effect.tap(opened, () =>
      poll(
        Effect.sync(() => frames),
        delivered => delivered >= 0,
        'the subscription',
      ),
    )

    return {
      seen,
      read,
      floors,
      watch,
      /** Waits until the live stream has delivered `count` frames. */
      framesDelivered: (count: number) =>
        poll(
          Effect.sync(() => frames),
          delivered => delivered >= count,
          `${count} live frames`,
        ),
      current: Ref.get(model),
      /** Starts a reservation: the Model shows it pending, and the Command that settles it is returned. */
      start: (input: {
        readonly id: string
        readonly revision: number
        readonly quantity: number
      }) =>
        Effect.gen(function* () {
          const started = Data.mutate(yield* Ref.get(model), ReserveStock, input)
          requestId = started.requestId
          yield* Ref.set(model, started.model)
          seen.push({ after: 'start', shows: shows(started.model), write: write(started.model) })
          return started.command.effect as Effect.Effect<RemoteMessage, never, RemoteClient>
        }),
      /** Runs the Command and delivers what it settled with. */
      reply: (settle: Effect.Effect<RemoteMessage, never, RemoteClient>, label = 'reply') =>
        Effect.flatMap(settle, message => deliver(label, message)),
      /** Sends the failed write again as itself, and returns the Command that settles it. */
      retry: Effect.gen(function* () {
        const started = Data.retry(yield* Ref.get(model), requestId as string)
        if (Option.isNone(started)) return yield* Effect.die(new Error('nothing to retry'))
        yield* Ref.set(model, started.value.model)
        seen.push({
          after: 'retry',
          shows: shows(started.value.model),
          write: write(started.value.model),
        })
        return started.value.command.effect as Effect.Effect<RemoteMessage, never, RemoteClient>
      }),
    }
  })
