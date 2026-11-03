/**
 * What a cache store keeps (#428): an answer until it expires, until room
 * runs out, or until a write names one of its tags.
 */
import { Duration, Effect, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import { CacheStore, type WorkersCache, type WorkersKv } from '../src/index.js'

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

/**
 * A KV namespace that refuses what Workers KV refuses: a key over 512 bytes,
 * a value over 25 MiB, an `expirationTtl` under 60, and every write once the
 * day's are spent. `failing` makes every call reject, as an outage would.
 */
const fakeKv = (options: { readonly writes?: number } = {}) => {
  const kept = new Map<string, { readonly value: string; readonly ttl: number }>()
  const state = { writes: options.writes ?? Infinity, failing: false, deleted: [] as Array<string> }
  const checkKey = (key: string) => {
    if (state.failing) throw new Error('KV is unavailable')
    if (new TextEncoder().encode(key).length > 512) throw new Error('KV key too long')
  }
  const namespace: WorkersKv = {
    get: async key => {
      checkKey(key)
      return kept.get(key)?.value ?? null
    },
    put: async (key, value, { expirationTtl }) => {
      checkKey(key)
      if (!Number.isInteger(expirationTtl) || expirationTtl < 60) {
        throw new Error(`Invalid expiration_ttl of ${expirationTtl}`)
      }
      if (new TextEncoder().encode(value).length > 25 * 1024 * 1024) throw new Error('too large')
      if (state.writes <= 0) throw new Error('KV put() limit exceeded for the day')
      state.writes -= 1
      kept.set(key, { value, ttl: expirationTtl })
    },
    delete: async key => {
      checkKey(key)
      state.deleted.push(key)
      kept.delete(key)
    },
  }
  return { namespace, kept, state }
}

const minute = { maxAge: Duration.minutes(1), tags: [] }

describe('a store over Workers KV', () => {
  it('writes an answer only when it is asked for a second time', () =>
    run(
      Effect.gen(function* () {
        const { namespace, kept } = fakeKv()
        const store = CacheStore.kv(namespace)
        yield* store.put('a', 'answer', minute)
        expect(kept.size).toBe(0)
        expect(yield* store.match('a')).toEqual(Option.none())
        yield* store.put('a', 'answer', minute)
        expect(yield* store.match('a')).toEqual(Option.some('answer'))
      }),
    ))

  it('forgets the oldest key asked for once past ten thousand', () =>
    run(
      Effect.gen(function* () {
        const { namespace, kept } = fakeKv()
        const store = CacheStore.kv(namespace)
        for (let n = 0; n <= 10_000; n++) yield* store.put(`k${n}`, 'answer', minute)
        yield* store.put('k1', 'answer', minute)
        yield* store.put('k0', 'answer', minute)
        expect([...kept.keys()]).toEqual(['k1'])
      }),
    ))

  it('serves an answer for its maxAge, though KV keeps it a minute at least', () =>
    run(
      Effect.gen(function* () {
        const { namespace, kept } = fakeKv()
        const store = CacheStore.kv(namespace)
        const brief = { maxAge: Duration.seconds(10), tags: [] }
        yield* store.put('a', 'answer', brief)
        yield* store.put('a', 'answer', brief)
        expect(kept.get('a')?.ttl).toBe(60)
        yield* TestClock.adjust('9 seconds')
        expect(yield* store.match('a')).toEqual(Option.some('answer'))
        yield* TestClock.adjust('1 second')
        expect(yield* store.match('a')).toEqual(Option.none())
      }),
    ))

  it('keeps an answer for `keep` when that is longer than its maxAge', () =>
    run(
      Effect.gen(function* () {
        const { namespace, kept } = fakeKv()
        const store = CacheStore.kv(namespace, { keep: '6 hours' })
        yield* store.put('a', 'answer', minute)
        yield* store.put('a', 'answer', minute)
        expect(kept.get('a')?.ttl).toBe(6 * 60 * 60)
        yield* TestClock.adjust('5 hours')
        expect(yield* store.match('a')).toEqual(Option.some('answer'))
        yield* TestClock.adjust('1 hour')
        expect(yield* store.match('a')).toEqual(Option.none())
      }),
    ))

  it('refuses a keep that never ends', () => {
    expect(() => CacheStore.kv(fakeKv().namespace, { keep: Infinity })).toThrow(/finite/)
  })

  it('deletes every answer a purged tag names, and no other', () =>
    run(
      Effect.gen(function* () {
        const { namespace, state } = fakeKv()
        const store = CacheStore.kv(namespace)
        for (const _ of [1, 2]) {
          yield* store.put('a', 'a', { maxAge: Duration.minutes(1), tags: ['row:A:1', 'list:A'] })
          yield* store.put('b', 'b', { maxAge: Duration.minutes(1), tags: ['row:B:1'] })
        }
        yield* store.purge(['list:A'])
        expect(state.deleted).toEqual(['a'])
        expect(yield* store.match('a')).toEqual(Option.none())
        expect(yield* store.match('b')).toEqual(Option.some('b'))
      }),
    ))

  it('fails open: a write KV refuses keeps nothing, and a read that fails is a miss', () =>
    run(
      Effect.gen(function* () {
        const { namespace, kept, state } = fakeKv({ writes: 0 })
        const store = CacheStore.kv(namespace)
        const long = `https://shop.test/${'x'.repeat(512)}`
        for (const key of ['a', 'a', long, long]) yield* store.put(key, 'answer', minute)
        expect(kept.size).toBe(0)
        expect(yield* store.match(long)).toEqual(Option.none())
        state.writes = 1
        const tagged = { ...minute, tags: ['row:B:1'] }
        yield* store.put('b', 'answer', tagged)
        yield* store.put('b', 'answer', tagged)
        state.failing = true
        expect(yield* store.match('b')).toEqual(Option.none())
        yield* store.purge(['row:B:1'])
        state.failing = false
        expect(yield* store.match('b')).toEqual(Option.some('answer'))
      }),
    ))
})
