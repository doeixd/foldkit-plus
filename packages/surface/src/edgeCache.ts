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
 * What `CacheStore.kv` needs of a Workers KV namespace binding. KV refuses a
 * key over 512 bytes, a value over 25 MiB, an `expirationTtl` under 60
 * seconds, and, on the free plan, every write past 1,000 a day.
 */
export interface WorkersKv {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options: { readonly expirationTtl: number }): Promise<void>
  delete(key: string): Promise<void>
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

/** The shortest `expirationTtl` KV takes, in seconds. */
const KV_SHORTEST_TTL = 60

/** How many keys `CacheStore.kv` remembers asked for once, the oldest forgotten first. */
const KV_ASKED_ONCE = 10_000

/**
 * A store over a Workers KV namespace: one copy for every isolate and data
 * centre, which outlives the isolate that kept it (a `caches.default` copy
 * is one data centre's).
 *
 * KV's free plan allows 1,000 writes a day, so an answer is written only
 * when it is asked for a second time: a crawler asking a thousand distinct
 * URLs once each spends no write. This isolate's memory counts the asking,
 * since counting in KV would spend a write on every first ask, the write the
 * count exists to save; an answer asked twice in different isolates is
 * written later, or not at all.
 *
 * Nothing KV refuses or fails fails the request: a read that fails is a
 * miss, a write that fails (the day's writes spent, a key over 512 bytes)
 * keeps nothing, and a purge that fails leaves its answers to expire. Each
 * is logged as a warning.
 *
 * Which answers a tag names is known to this isolate alone, as with
 * `workers`: a write purges what this isolate kept.
 *
 * `keep` serves an answer that long after it was kept, past a shorter
 * `maxAge`, and is for pages alone (`foldkit-ssr`'s `cache`): a page carries
 * when each of its reads was made, and a browser whose Remote freshness has a
 * `maxAge` (`RemotePolicy.staleWhileRevalidate`) reads again what is past it.
 * Never give such a store to `serveFetch`: a read's answer carries no age,
 * so the browser would take a stale one as fresh, and read the same one again.
 */
const kv = (
  namespace: WorkersKv,
  options: { readonly keep?: Duration.Input | undefined } = {},
): CacheStore => {
  const keep = Duration.fromInputUnsafe(options.keep ?? Duration.zero)
  if (!Duration.isFinite(keep)) {
    throw new Error(
      `foldkit: CacheStore.kv's keep must be a finite time; ${JSON.stringify(options.keep)} is not`,
    )
  }
  const index = tagIndex(16_000)
  const askedOnce = new Set<string>()
  const warn = (doing: string) => (cause: unknown) =>
    Effect.logWarning(`foldkit: CacheStore.kv could not ${doing}`, cause)
  return {
    match: key =>
      Effect.tryPromise(() => namespace.get(key)).pipe(
        Effect.flatMap(value =>
          Effect.map(Clock.currentTimeMillis, now => {
            if (value === null) return Option.none<string>()
            // Kept as `<expiry in ms> <body>`: KV holds an entry at least a minute.
            const space = value.indexOf(' ')
            return space > 0 && Number(value.slice(0, space)) > now
              ? Option.some(value.slice(space + 1))
              : Option.none()
          }),
        ),
        Effect.catch(cause => Effect.as(warn(`read ${key}`)(cause), Option.none())),
      ),
    put: (key, body, { maxAge, tags }) =>
      Effect.gen(function* () {
        if (!askedOnce.delete(key)) {
          askedOnce.add(key)
          for (const oldest of askedOnce) {
            if (askedOnce.size <= KV_ASKED_ONCE) break
            askedOnce.delete(oldest)
          }
          return
        }
        const lasts = Duration.toMillis(Duration.max(maxAge, keep))
        const now = yield* Clock.currentTimeMillis
        yield* Effect.tryPromise(() =>
          namespace.put(key, `${now + lasts} ${body}`, {
            expirationTtl: Math.max(KV_SHORTEST_TTL, Math.ceil(lasts / 1000)),
          }),
        ).pipe(
          Effect.map(() => index.add(key, tags)),
          Effect.catch(warn(`keep ${key}`)),
        )
      }),
    purge: tags =>
      Effect.tryPromise(() =>
        Promise.all([...index.take(tags)].map(key => namespace.delete(key))),
      ).pipe(Effect.asVoid, Effect.catch(warn(`purge ${tags.join(', ')}`))),
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

  /**
   * A store over a Workers KV namespace, kept across isolates, writing an
   * answer on its second ask and failing open.
   */
  kv,
}
