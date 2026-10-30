/**
 * How long a call to `RemoteClient` waits for its answer: the caller's own
 * deadline (`ObserveOptions.timeout`, `Data.mutate`'s `timeout`), or else the
 * client's (`ClientOptions.timeout`). The wrapper `Remote.clientLayer` puts
 * around a transport applies it, per caller, so one caller giving up does not
 * fail another that joined the same read.
 */
import { Context, Duration, Effect, Option } from 'effect'
import { RemoteUnreachable } from './wire.js'

/** The deadline the running caller set for its own calls. */
export const CallTimeout = Context.Reference<Option.Option<Duration.Input>>(
  'foldkit-remote/CallTimeout',
  { defaultValue: () => Option.none() },
)

/** `effect` with the caller's deadline set to `timeout`, when one is given. */
export const withCallTimeout = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  timeout: Duration.Input | undefined,
): Effect.Effect<A, E, R> =>
  timeout === undefined ? effect : Effect.provideService(effect, CallTimeout, Option.some(timeout))

/**
 * `effect` interrupted once the caller's deadline, or else `client`'s, passes,
 * failing `RemoteUnreachable`: no answer came, and a write may have reached
 * the server. With neither deadline, `effect` as it is.
 */
export const withDeadline = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  client: Duration.Input | undefined,
): Effect.Effect<A, E | RemoteUnreachable, R> =>
  Effect.gen(function* () {
    const timeout = Option.getOrUndefined(yield* CallTimeout) ?? client
    if (timeout === undefined) return yield* effect
    const duration = Duration.fromInputUnsafe(timeout)
    return yield* Effect.timeoutOrElse(effect, {
      duration,
      orElse: () =>
        Effect.fail(
          new RemoteUnreachable({ message: `No answer within ${Duration.format(duration)}` }),
        ),
    })
  })
