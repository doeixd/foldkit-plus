/**
 * The fake server, through the client the app uses: each case fetches with
 * `Data.prefetch` and reads the result the way a view does. Latency runs on
 * the TestClock.
 */
import { Effect, Exit, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import type { RemoteClient } from 'foldkit-remote'
import { expect, test } from 'vitest'

import { FLAKY_POST_ID, api } from '../src/data.js'
import { Data, type Model, postDetail, postList, stats } from '../src/main.js'
import { loadingPostsModel } from './fixtures.js'

/** Runs `effect` against the fake server, a virtual second per round trip. */
const againstServer = <A, E>(effect: Effect.Effect<A, E, RemoteClient>): Promise<Exit.Exit<A, E>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Effect.exit(effect))
      for (let roundTrip = 0; roundTrip < 3; roundTrip++) {
        for (let i = 0; i < 100; i++) yield* Effect.yieldNow
        yield* TestClock.adjust('1 second')
      }
      return yield* Fiber.join(fiber)
    }).pipe(Effect.provide(api), Effect.provide(TestClock.layer())),
  )

const fetched = async (projection: Parameters<typeof Data.prefetch>[1]): Promise<Model> => {
  const exit = await againstServer(Data.prefetch(loadingPostsModel, projection))
  if (Exit.isFailure(exit)) throw new Error(`The fetch failed: ${String(exit.cause)}`)
  return exit.value
}

test('the list holds every post, the flaky one included', async () => {
  const model = await fetched(postList)
  const posts = postList.read(model)
  expect(posts._tag).toBe('Ready')
  expect(posts._tag === 'Ready' && posts.value.items.map(post => post.id)).toEqual([
    'model-is-the-cache',
    'stale-while-revalidate',
    'query-keys-are-names',
    'invalidation-is-a-message',
    FLAKY_POST_ID,
  ])
})

test('a regular post resolves with its detail', async () => {
  const model = await fetched(postDetail('model-is-the-cache'))
  expect(postDetail('model-is-the-cache').read(model)).toMatchObject({
    _tag: 'Ready',
    value: { title: 'The Model Is the Cache', author: 'Maya Okafor' },
  })
})

test('the flaky post fails on the first fetch and succeeds on retry', async () => {
  const first = await againstServer(Data.prefetch(loadingPostsModel, postDetail(FLAKY_POST_ID)))
  expect(first).toMatchObject({
    _tag: 'Failure',
    cause: {
      reasons: [{ error: { message: 'The connection dropped. Retry to fetch this post again.' } }],
    },
  })

  const model = await fetched(postDetail(FLAKY_POST_ID))
  expect(postDetail(FLAKY_POST_ID).read(model)).toMatchObject({
    _tag: 'Ready',
    value: { author: 'Flaky McNetwork' },
  })
})

test('an unknown post id is not found', async () => {
  const model = await fetched(postDetail('does-not-exist'))
  expect(postDetail('does-not-exist').read(model)).toEqual({ _tag: 'NotFound' })
})

test('stats are sampled within their ranges, dated by the server clock', async () => {
  const model = await fetched(stats)
  const reading = stats.read(model)
  expect(reading._tag).toBe('Ready')
  if (reading._tag !== 'Ready') return
  expect(reading.value.activeUsers).toBeGreaterThanOrEqual(80)
  expect(reading.value.activeUsers).toBeLessThanOrEqual(140)
  expect(reading.value.requestsPerSecond).toBeGreaterThanOrEqual(900)
  expect(reading.value.requestsPerSecond).toBeLessThanOrEqual(1600)
  expect(reading.value.cacheHitRatePercent).toBeGreaterThanOrEqual(86)
  expect(reading.value.cacheHitRatePercent).toBeLessThanOrEqual(99)
  // Sampled after one round trip of latency on the TestClock, which starts at 0.
  expect(reading.value.sampledAt).toBe(700)
})
