/**
 * Shared test support for the primitives: streams that fail fast with a
 * named message instead of hanging a test file when the stream under test
 * stalls.
 */
import { Effect, Stream } from 'effect'

/** Collects `count` elements, failing after 2 seconds so a stalled stream goes red quickly. */
export const takeMessages = <A, E>(
  stream: Stream.Stream<A, E>,
  count: number,
): Effect.Effect<ReadonlyArray<A>, E | Error> =>
  stream.pipe(
    Stream.take(count),
    Stream.runCollect,
    Effect.timeoutOrElse({
      duration: '2 seconds',
      orElse: () =>
        Effect.fail(new Error(`stream stalled: fewer than ${count} messages in 2 seconds`)),
    }),
  )
