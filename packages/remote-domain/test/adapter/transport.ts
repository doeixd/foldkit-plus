/**
 * The adapter's `Fixture`, with its client wrapped as a transport the tests
 * steer: each call is counted, and may have its reply held back (`holdReply`) or lost
 * after it ran (`loseReply`); a watch may be sent a frame the transport
 * delivers late (`deliverLate`).
 */
import { Deferred, Duration, Effect, Option, Queue, Ref, Stream } from 'effect'
import { RpcClientDefect, RpcClientError } from 'effect/rpc/RpcClientError'
import { DomainRemote, type LayerConfig, type Outcome } from '../../src/index.js'
import { Fixture } from '../../src/testing.js'
import { Reserve, ProductRowLive, SessionLive, Shop, ShopApi, invalidOf } from './fixture.js'

type Client = Effect.Success<typeof ShopApi.clientInProcess>

type Steer =
  | { readonly _tag: 'Hold'; readonly released: Deferred.Deferred<void> }
  | { readonly _tag: 'Lose' }

const lost = () =>
  new RpcClientError({
    reason: new RpcClientDefect({ message: 'the reply was lost', cause: null }),
  })

/** A test's world: the fixture, the steerable client, and who is signed in. */
export const world = (
  options: {
    readonly confirmWithin?: Duration.Input
    /** How a non-owner's Rejection is answered. */
    readonly notOwner?: Outcome<never>
    /** The bindings to answer with instead of the reservation's. */
    readonly bindings?: Pick<LayerConfig<typeof ShopApi>, 'views' | 'commands'>
  } = {},
) => {
  const calls = new Map<string, number>()
  const commandIds: Array<string | undefined> = []
  const steering = new Map<string, Array<Steer>>()
  const late = Effect.runSync(Queue.unbounded<{ readonly key: string; readonly frame: unknown }>())

  /** Runs `call` as the transport would: counted, steered if asked. */
  const through = <A, E, R>(name: string, call: () => Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      calls.set(name, (calls.get(name) ?? 0) + 1)
      const steer = steering.get(name)?.shift()
      const answer = yield* call().pipe(Effect.exit)
      if (steer?._tag === 'Hold') yield* Deferred.await(steer.released)
      if (steer?._tag === 'Lose') return yield* Effect.fail(lost())
      return yield* answer
    })

  const steered = (client: Client): Client => {
    const view = client.ProductRow
    return {
      ...client,
      Seed: (target, input, options) => through('Seed', () => client.Seed(target, input, options)),
      ReserveStock: (target, input, options) => {
        commandIds.push(options?.commandId)
        return through('ReserveStock', () => client.ReserveStock(target, input, options))
      },
      Touch: (target, input, options) =>
        through('Touch', () => client.Touch(target, input, options)),
      ProductRow: {
        ...view,
        snapshot: (key, options) =>
          through('ProductRow.snapshot', () => view.snapshot(key, options)),
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

  const Reads = DomainRemote.view(Reserve.write.input.entity, ShopApi, 'ProductRow', {
    revision: 'revision',
  })
  const Reserving = DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
    target: input => input.id,
    input: input => ({ quantity: input.quantity, revision: input.revision }),
    refusals: {
      Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
      Invalid: rejection => DomainRemote.refuse(invalidOf(rejection)),
      NotOwner: () => options.notOwner ?? DomainRemote.forbid('Only its owner reserves its stock'),
      Missing: () => DomainRemote.fail('No such product'),
    },
    written: reply => reply,
  })
  const fixture = Fixture.make(ShopApi, {
    model: Shop,
    handlers: ProductRowLive,
    middleware: SessionLive,
    as: 'ada',
    through: steered,
    bindings: {
      views: options.bindings?.views ?? [Reads],
      commands: options.bindings?.commands ?? [Reserving],
      denied: () => 'Unauthenticated',
      confirmWithin: options.confirmWithin ?? ('200 millis' as Duration.Input),
    },
  })

  return {
    layer: fixture.layer,
    control: {
      drain: fixture.drain,
      get commits() {
        return fixture.commits()
      },
    },
    actor: fixture.as as Ref.Ref<Option.Option<string>>,
    /** How many times the client called `name` (a command's tag, or `ProductRow.snapshot`). */
    calls: (name: string) => calls.get(name) ?? 0,
    /** The `commandId` of each `ReserveStock` sent, in order. */
    commandIds,
    /** Holds the reply of the next call of `name` until `release` runs; the call itself runs at once. */
    holdReply: (name: string) => {
      const released = Deferred.makeUnsafe<void>()
      steering.set(name, [...(steering.get(name) ?? []), { _tag: 'Hold', released }])
      return Deferred.succeed(released, undefined)
    },
    /** Runs the next call of `name`, then fails it as a transport that lost the reply. */
    loseReply: (name: string) => {
      steering.set(name, [...(steering.get(name) ?? []), { _tag: 'Lose' }])
    },
    /** Sends every open watch of `key` a frame, as one the transport delivered late. */
    deliverLate: (key: string, frame: unknown) => Queue.offer(late, { key, frame }),
  }
}

export type World = ReturnType<typeof world>
