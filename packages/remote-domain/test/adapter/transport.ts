/**
 * The Api's in-process client, wrapped as a transport the tests steer: each
 * call carries the current actor's headers (what a session cookie does over
 * HTTP), is counted, and may have its reply held back (`holdReply`) or lost
 * after it ran (`loseReply`); a watch may be sent a frame the transport
 * delivers late (`deliverLate`).
 */
import { Deferred, Duration, Effect, Layer, Option, Queue, Ref, Stream } from 'effect'
import { RpcClientDefect, RpcClientError } from 'effect/rpc/RpcClientError'
import { DomainRemote, type Outcome } from '../../src/index.js'
import { Reserve, ShopApi, host, invalidOf } from './fixture.js'

type Client = Effect.Success<typeof ShopApi.clientInProcess>

type Steer =
  | { readonly _tag: 'Hold'; readonly released: Deferred.Deferred<void> }
  | { readonly _tag: 'Lose' }

const lost = () =>
  new RpcClientError({
    reason: new RpcClientDefect({ message: 'the reply was lost', cause: null }),
  })

/** A test's world: the host, the steerable client, and who is signed in. */
export const world = (options: { readonly confirmWithin?: Duration.Input } = {}) => {
  const { layer: hosted, control } = host()
  const actor = Ref.makeUnsafe<Option.Option<string>>(Option.some('ada'))
  const calls = new Map<string, number>()
  const commandIds: Array<string | undefined> = []
  const steering = new Map<string, Array<Steer>>()
  const late = Effect.runSync(Queue.unbounded<{ readonly key: string; readonly frame: unknown }>())

  const headers = Effect.map(
    Ref.get(actor),
    Option.match({
      onNone: (): Readonly<Record<string, string>> => ({}),
      onSome: id => ({ 'x-actor': id }),
    }),
  )

  /** Runs `call` as the transport would: counted, with the current headers, steered if asked. */
  const through = <A, E, R>(
    name: string,
    call: (headers: Readonly<Record<string, string>>) => Effect.Effect<A, E, R>,
  ) =>
    Effect.gen(function* () {
      calls.set(name, (calls.get(name) ?? 0) + 1)
      const steer = steering.get(name)?.shift()
      const answer = yield* call(yield* headers).pipe(Effect.exit)
      if (steer?._tag === 'Hold') yield* Deferred.await(steer.released)
      if (steer?._tag === 'Lose') return yield* Effect.fail(lost())
      return yield* answer
    })

  const steered = (client: Client): Client => {
    const view = client.ProductRow
    return {
      ...client,
      Seed: (target, input, options) =>
        through('Seed', headers => client.Seed(target, input, { ...options, headers })),
      ReserveStock: (target, input, options) => {
        commandIds.push(options?.commandId)
        return through('ReserveStock', headers =>
          client.ReserveStock(target, input, { ...options, headers }),
        )
      },
      Touch: (target, input, options) =>
        through('Touch', headers => client.Touch(target, input, { ...options, headers })),
      ProductRow: {
        ...view,
        snapshot: (key, options) =>
          through('ProductRow.snapshot', headers => view.snapshot(key, { ...options, headers })),
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

  const clientLayer = Layer.effect(ShopApi.Client, Effect.map(ShopApi.clientInProcess, steered))

  return {
    control,
    actor,
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
    clientLayer,
    hosted,
    confirmWithin: options.confirmWithin ?? ('200 millis' as Duration.Input),
  }
}

export type World = ReturnType<typeof world>

/** The adapter over a world, as the tests bind it; `notOwner` is how a non-owner's Rejection is answered. */
export const bound = (
  world: World,
  notOwner: Outcome<never> = DomainRemote.forbid('Only its owner reserves its stock'),
) => {
  const Reads = DomainRemote.view(Reserve.write.input.entity, ShopApi, 'ProductRow', {
    revision: 'revision',
  })
  const Reserving = DomainRemote.command(Reserve, ShopApi, 'ReserveStock', {
    target: input => input.id,
    input: input => ({ quantity: input.quantity, revision: input.revision }),
    refusals: {
      Moved: () => DomainRemote.refuse({ _tag: 'Conflict' }),
      Invalid: rejection => DomainRemote.refuse(invalidOf(rejection)),
      NotOwner: () => notOwner,
      Missing: () => DomainRemote.fail('No such product'),
    },
    written: reply => reply,
  })
  return DomainRemote.layer(ShopApi, {
    views: [Reads],
    commands: [Reserving],
    principal: Ref.get(world.actor),
    denied: () => 'Unauthenticated',
    confirmWithin: world.confirmWithin,
  }).pipe(Layer.provideMerge(world.clientLayer), Layer.provideMerge(world.hosted))
}
