/**
 * What a server keeps of an answer, and where (#428): how long it stays fresh
 * (`CachePolicy`), a store that keeps answers by key and drops each one
 * tagged with what a write names (`CacheStore`), and the note a page
 * render's reader makes of each read (`PageReads`), which `foldkit-ssr`
 * reads to decide whether a page may be kept. Whether an answer may be
 * shared is never decided here: `foldkit-remote-server` proves a read public.
 */
import { Clock, Context, Data, Duration, Effect, Option } from 'effect'

/** How long an answer stays fresh. */
export interface CachePolicy {
  readonly maxAge: Duration.Duration
}

/** A cache declaration as written: `{ maxAge: '60 seconds' }`. */
export interface CacheOptions {
  readonly maxAge: Duration.Input
}

/** The policy `options` says, refused where it is written when it keeps nothing. */
export const cachePolicy = (options: CacheOptions): CachePolicy => {
  const maxAge = Duration.fromInputUnsafe(options.maxAge)
  if (!Duration.isFinite(maxAge) || !Duration.isGreaterThanOrEqualTo(maxAge, Duration.seconds(1))) {
    throw new Error(
      `foldkit: a cache's maxAge must be a finite time of at least one second, as Cache-Control counts it; ${JSON.stringify(options.maxAge)} is not`,
    )
  }
  return { maxAge }
}

/** Whole seconds, as `Cache-Control: max-age` counts them. */
export const maxAgeSeconds = (policy: CachePolicy): number =>
  Math.floor(Duration.toMillis(policy.maxAge) / 1000)

/** The shorter of two policies: what an answer holding both stays fresh for. */
export const shorterPolicy = (a: CachePolicy, b: CachePolicy): CachePolicy =>
  Duration.isLessThan(b.maxAge, a.maxAge) ? b : a

/**
 * What a cache store keeps: an answer's text by key, for `maxAge`, dropped
 * early when a write names one of its `tags`.
 */
export interface CacheStore {
  readonly match: (key: string) => Effect.Effect<Option.Option<string>>
  readonly put: (
    key: string,
    body: string,
    options: { readonly maxAge: Duration.Duration; readonly tags: ReadonlyArray<string> },
  ) => Effect.Effect<void>
  readonly purge: (tags: ReadonlyArray<string>) => Effect.Effect<void>
}

/** What `CacheStore.workers` needs of a Workers `Cache` (`caches.default`). */
export interface WorkersCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
  delete(request: Request): Promise<boolean>
}

/**
 * Which keys each tag names, bounded: past `limit` keys the oldest tags are
 * forgotten, and a write naming one of them leaves its answers to expire.
 */
const tagIndex = (limit: number) => {
  const keysOf = new Map<string, Set<string>>()
  let size = 0
  return {
    add: (key: string, tags: ReadonlyArray<string>) => {
      for (const tag of tags) {
        const keys = keysOf.get(tag) ?? new Set<string>()
        if (!keys.has(key)) size += 1
        keys.add(key)
        keysOf.delete(tag)
        keysOf.set(tag, keys)
      }
      for (const [tag, keys] of keysOf) {
        if (size <= limit) break
        keysOf.delete(tag)
        size -= keys.size
      }
    },
    take: (tags: ReadonlyArray<string>): ReadonlySet<string> => {
      const taken = new Set<string>()
      for (const tag of tags) {
        const keys = keysOf.get(tag)
        if (keys === undefined) continue
        keysOf.delete(tag)
        size -= keys.size
        for (const key of keys) taken.add(key)
      }
      return taken
    },
  }
}

/** A store in this process's memory, holding at most `limit` answers. */
const memory = (options: { readonly limit?: number | undefined } = {}) => {
  const limit = options.limit ?? 1000
  const entries = new Map<string, { readonly body: string; readonly expires: number }>()
  const index = tagIndex(limit * 16)
  const store: CacheStore & { readonly size: () => number } = {
    size: () => entries.size,
    match: key =>
      Effect.map(Clock.currentTimeMillis, now => {
        const entry = entries.get(key)
        if (entry === undefined) return Option.none()
        if (entry.expires <= now) {
          entries.delete(key)
          return Option.none()
        }
        return Option.some(entry.body)
      }),
    put: (key, body, { maxAge, tags }) =>
      Effect.map(Clock.currentTimeMillis, now => {
        entries.delete(key)
        entries.set(key, { body, expires: now + Duration.toMillis(maxAge) })
        index.add(key, tags)
        // The oldest answer goes first: a flood of distinct reads costs only room.
        for (const oldest of entries.keys()) {
          if (entries.size <= limit) break
          entries.delete(oldest)
        }
      }),
    purge: tags =>
      Effect.sync(() => {
        for (const key of index.take(tags)) entries.delete(key)
      }),
  }
  return store
}

/**
 * A store over a Workers `Cache` (`caches.default`). Keys are URLs, as the
 * Cache API requires. Which answers a tag names is known to this isolate
 * alone: a write purges what this isolate stored, and another isolate's or
 * another data centre's copy stays until its `maxAge`.
 */
const workers = (cache: WorkersCache): CacheStore => {
  const index = tagIndex(16_000)
  return {
    match: key =>
      Effect.promise(async () => {
        const response = await cache.match(new Request(key))
        return response === undefined ? Option.none() : Option.some(await response.text())
      }),
    put: (key, body, { maxAge, tags }) =>
      Effect.promise(async () => {
        index.add(key, tags)
        await cache.put(
          new Request(key),
          new Response(body, {
            headers: { 'cache-control': `max-age=${maxAgeSeconds({ maxAge })}` },
          }),
        )
      }),
    purge: tags =>
      Effect.promise(() =>
        Promise.all([...index.take(tags)].map(key => cache.delete(new Request(key)))),
      ).pipe(Effect.asVoid),
  }
}

/**
 * One read a page render made, as the reader judged it: public and fresh for
 * `maxAge`, tagged with the rows and lists it holds, or private.
 */
export type CachedRead = Data.TaggedEnum<{
  Public: { readonly policy: CachePolicy; readonly tags: ReadonlyArray<string> }
  Private: {}
}>
export const CachedRead = Data.taggedEnum<CachedRead>()

/**
 * Where a page render's reader notes each read it made (`foldkit-ssr` gives
 * one per render it may cache; `pageReader` notes into it). None outside such
 * a render.
 */
export const PageReads = Context.Reference<Option.Option<(read: CachedRead) => void>>(
  'foldkit-surface/PageReads',
  { defaultValue: () => Option.none() },
)

export const CacheStore = {
  /** A store in this process's memory: for Node, a dev server and tests. */
  memory,

  /** A store over a Workers `Cache` (`caches.default`). */
  workers,
}
