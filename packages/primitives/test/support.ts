/**
 * Shared test support for the primitives: streams that fail fast with a
 * named message instead of hanging a test file when the stream under test
 * stalls.
 */
import { Duration, Effect, Stream } from 'effect'

/**
 * Collects `count` elements, failing after `timeout` so a stalled stream goes
 * red quickly. The timeout runs on the ambient clock: under TestClock, advance
 * past it with `TestClock.adjust`.
 */
export const takeMessages = <A, E>(
  stream: Stream.Stream<A, E>,
  count: number,
  timeout: Duration.Input = '2 seconds',
): Effect.Effect<ReadonlyArray<A>, E | Error> =>
  stream.pipe(
    Stream.take(count),
    Stream.runCollect,
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () => Effect.fail(new Error(`stream stalled: fewer than ${count} messages`)),
    }),
  )
