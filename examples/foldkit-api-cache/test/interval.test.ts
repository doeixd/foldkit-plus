/**
 * The interval refetch is Remote's stale-while-revalidate timer: the stats
 * read sleeps, under the Effect clock, until the reading it holds is five
 * seconds old, then marks it stale, and its next plan fetches it again.
 * The fixtures are dated when the tests start, so the reading is fresh here,
 * and the sleep runs on the TestClock.
 */
import { Effect, Fiber, Stream } from 'effect'
import { TestClock } from 'effect/testing'
import { modifyFields } from 'foldkit/struct'
import { describe, expect, test } from 'vitest'

import { api } from '../src/data.js'
import { Message, type Model, stats, subscriptions, update } from '../src/main.js'
import { FETCHED_AT, loadedPostsModel, loadedStatsModel } from './fixtures.js'

const statsRead = subscriptions['stats.read']

/** What the stats read emits within `millis` of virtual time. */
const emittedWithin = (model: Model, millis: number): Promise<ReadonlyArray<Message>> =>
  Effect.runPromise(
    Effect.gen(function* () {
      const emitted: Array<Message> = []
      const fiber = yield* Effect.forkChild(
        Stream.runForEach(statsRead.dependenciesToStream(statsRead.modelToDependencies(model)), m =>
          Effect.sync(() => void emitted.push(m)),
        ),
      )
      for (let i = 0; i < 100; i++) yield* Effect.yieldNow
      yield* TestClock.adjust(millis)
      yield* Fiber.interrupt(fiber)
      return emitted
    }).pipe(Effect.provide(TestClock.layer()), Effect.provide(api)),
  )

describe('the stats read', () => {
  test('holds a fresh reading until it is five seconds old', () => {
    expect(statsRead.modelToDependencies(loadedStatsModel)).toMatchObject({
      requirements: [],
      expires: { at: FETCHED_AT + 5_000 },
    })
  })

  test('marks the reading stale when it ages out, and not before', async () => {
    // Less than a second of real time has passed since the fixtures were read.
    expect(await emittedWithin(loadedStatsModel, 4_000)).toEqual([])

    const [aged, ...rest] = await emittedWithin(loadedStatsModel, 5_000)
    expect(rest).toEqual([])
    expect(aged).toMatchObject({ _tag: 'GotRemoteMessage', message: { _tag: 'RefreshStarted' } })

    // Reduced, the old numbers stay on screen and the next plan fetches new ones.
    const refreshing = update(loadedStatsModel, aged!).model
    expect(stats.read(refreshing)).toMatchObject({
      _tag: 'Refreshing',
      value: { activeUsers: 120 },
    })
    expect(statsRead.modelToDependencies(refreshing).requirements).toHaveLength(1)
  })

  test('has no timer while the Stats tab is closed', () => {
    const onPosts = modifyFields(loadedStatsModel, { activeTab: () => 'Posts' as const })
    expect(statsRead.modelToDependencies(onPosts)).toMatchObject({
      requirements: [],
      expires: null,
    })
  })
})

test('the posts are cached, with no timer to revalidate them by age', () => {
  expect(subscriptions['posts.read'].modelToDependencies(loadedPostsModel)).toMatchObject({
    requirements: [],
    queries: [],
    expires: null,
  })
})
