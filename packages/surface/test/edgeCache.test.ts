/**
 * What a cache store keeps (#428): an answer until it expires, until room
 * runs out, or until a write names one of its tags.
 */
import { Duration, Effect, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import { CacheStore, type WorkersCache } from '../src/index.js'

const run = <A>(effect: Effect.Effect<A>) =>
  Effect.runPromise(effect.pipe(Effect.provide(TestClock.layer())))

describe('a store in memory', () => {
  it('keeps an answer until its maxAge', () =>
    run(
      Effect.gen(function* () {
        const store = CacheStore.memory()
        yield* store.put('k', 'answer', { maxAge: Duration.seconds(10), tags: [] })
        expect(yield* store.match('k')).toEqual(Option.some('answer'))
        yield* TestClock.adjust('9 seconds')
        expect(yield* store.match('k')).toEqual(Option.some('answer'))
        yield* TestClock.adjust('1 second')
        expect(yield* store.match('k')).toEqual(Option.none())
      }),
    ))

  it('drops the oldest answer past its limit', () =>
    run(
      Effect.gen(function* () {
        const store = CacheStore.memory({ limit: 2 })
        for (const key of ['a', 'b', 'c'])
          yield* store.put(key, key, { maxAge: Duration.minutes(1), tags: [] })
        expect(store.size()).toBe(2)
        expect(yield* store.match('a')).toEqual(Option.none())
        expect(yield* store.match('c')).toEqual(Option.some('c'))
      }),
    ))

  it('drops every answer a purged tag names, and no other', () =>
    run(
      Effect.gen(function* () {
        const store = CacheStore.memory()
        yield* store.put('a', 'a', { maxAge: Duration.minutes(1), tags: ['row:A:1', 'list:A'] })
        yield* store.put('b', 'b', { maxAge: Duration.minutes(1), tags: ['row:B:1'] })
        yield* store.purge(['list:A'])
        expect(yield* store.match('a')).toEqual(Option.none())
        expect(yield* store.match('b')).toEqual(Option.some('b'))
      }),
    ))
})

/** A Workers `Cache` as the Cache API keeps one: by URL, and refusing anything but a GET. */
const fakeCache = () => {
  const kept = new Map<string, { readonly body: string; readonly control: string | null }>()
  const cache: WorkersCache = {
    match: async request => {
      const entry = kept.get(request.url)
      return entry === undefined ? undefined : new Response(entry.body)
    },
    put: async (request, response) => {
      if (request.method !== 'GET') throw new TypeError('Cache.put only takes a GET')
      kept.set(request.url, {
        body: await response.text(),
        control: response.headers.get('cache-control'),
      })
    },
    delete: async request => kept.delete(request.url),
  }
  return { cache, kept }
}

describe('a store over the Workers Cache', () => {
  it('keeps an answer by URL for its maxAge, and drops what a purged tag names', async () => {
    const { cache, kept } = fakeCache()
    const store = CacheStore.workers(cache)
    const key = 'https://shop.test/__foldkit/cache/remote/ab'
    await Effect.runPromise(
      store.put(key, 'answer', { maxAge: Duration.seconds(90), tags: ['row:A:1'] }),
    )
    expect(kept.get(key)?.control).toBe('max-age=90')
    expect(await Effect.runPromise(store.match(key))).toEqual(Option.some('answer'))
    await Effect.runPromise(store.purge(['row:A:1']))
    expect(await Effect.runPromise(store.match(key))).toEqual(Option.none())
  })
})
