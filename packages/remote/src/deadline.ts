/**
 * How long a call to `RemoteClient` waits for its answer: the caller's own
 * deadline (`ObserveOptions.timeout`, `Data.mutate`'s `timeout`), or else the
 * client's (`ClientOptions.timeout`). The wrapper `Remote.clientLayer` puts
 * around a transport applies it, per caller, so one caller giving up does not
 * fail another that joined the same read.
 */
import { Context, Duration, Effect, Option } from 'effect'

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
 * failing with `onTimeout`'s error; with neither, `effect` as it is.
 */
export const withDeadline = <A, E, R, E2>(
  effect: Effect.Effect<A, E, R>,
  client: Duration.Input | undefined,
  onTimeout: (message: string) => E2,
): Effect.Effect<A, E | E2, R> =>
  Effect.gen(function* () {
    const timeout = Option.getOrUndefined(yield* CallTimeout) ?? client
    if (timeout === undefined) return yield* effect
    const duration = Duration.fromInputUnsafe(timeout)
    return yield* Effect.timeoutOrElse(effect, {
      duration,
      orElse: () => Effect.fail(onTimeout(`No answer within ${Duration.format(duration)}`)),
    })
  })
