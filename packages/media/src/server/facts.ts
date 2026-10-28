import { Effect, Option, Schema } from 'effect'
import type { KeyValueStore } from 'effect/persistence'
import { Diagnostics } from 'foldkit-surface'
import { ImageAsset } from '../asset.js'
import { describe, type Inspector } from '../describe.js'
import { nonNegativeInteger } from '../limits.js'
import { storeFailed } from './diagnostics.js'

/** No facts could be read for the image at `url`; `reason` says why, for the build's report. */
export class FactsUnavailable extends Schema.TaggedError<FactsUnavailable>()('FactsUnavailable', {
  url: Schema.String,
  reason: Schema.String,
}) {}

const Cached = Schema.Struct({
  target: Schema.String,
  etag: Schema.OptionFromNullOr(Schema.String),
  asset: ImageAsset,
})
const CachedJson = Schema.fromJsonString(Cached)

// A redirect chain longer than this is refused, not followed.
const MAX_REDIRECTS = 3

const DEFAULT_MAX_BYTES = 20 * 1024 * 1024

export interface FactsOptions {
  /** The hosts an original may be read from, matched exactly: `cdn.example.com`, not a suffix. */
  readonly allow: ReadonlyArray<string>
  /** The largest original read, in bytes, counted as it streams. */
  readonly maxBytes?: number
  /**
   * Facts kept by URL and revalidated with the original's `ETag`. A read that
   * fails is a miss and a write that fails is dropped, each reported as
   * `StoreFailed`.
   */
  readonly cache?: KeyValueStore.KeyValueStore
  /** How to fetch; the platform's `fetch` by default. */
  readonly fetch?: (request: Request) => Promise<Response>
}

/**
 * The facts of an image a page names only by URL (a rich-text image, a CMS
 * block), so it is drawn with its box and placeholder like any other: its
 * original read from an allowed host and described (`describe`), with the
 * URL as its key. Only `https` on a host in `allow`, at its default port, is read, and every
 * redirect is checked again, so content cannot point the build at an
 * internal address. Kept in `cache`, an unchanged original is asked for
 * with its `ETag` and not read or inspected again.
 */
export const factsOf = (
  url: string,
  options: FactsOptions,
): Effect.Effect<ImageAsset, FactsUnavailable, Inspector> => {
  const unavailable = (reason: string) => new FactsUnavailable({ url, reason })
  const fetchOne = options.fetch ?? ((request: Request) => fetch(request))
  const maxBytes = nonNegativeInteger('maxBytes', options.maxBytes ?? DEFAULT_MAX_BYTES)
  // An allowed host on its own port alone: another port of it is another service.
  const allowed = (target: URL) =>
    target.protocol === 'https:' && target.port === '' && options.allow.includes(target.hostname)
  const cacheKey = `facts/${url}`

  const readCached = Option.match(Option.fromNullishOr(options.cache), {
    onNone: () => Effect.succeed(Option.none<typeof Cached.Type>()),
    onSome: store =>
      store.get(cacheKey).pipe(
        Effect.map(text =>
          Option.flatMap(Option.fromNullishOr(text), Schema.decodeUnknownOption(CachedJson)),
        ),
        Effect.catch(cause =>
          Diagnostics.report(
            storeFailed({ store: 'facts', operation: 'read', key: cacheKey, cause }),
          ).pipe(Effect.as(Option.none<typeof Cached.Type>())),
        ),
      ),
  })

  const request = (cached: Option.Option<typeof Cached.Type>) =>
    Effect.tryPromise({
      try: async () => {
        let target = new URL(url)
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          if (!allowed(target))
            return { refused: `${target.origin} is not an allowed host` } as const
          const etag = Option.flatMap(cached, entry =>
            entry.target === target.href ? entry.etag : Option.none(),
          )
          const headers = Option.match(etag, {
            onNone: () => ({}),
            onSome: tag => ({ 'if-none-match': tag }),
          })
          const response = await fetchOne(new Request(target, { headers, redirect: 'manual' }))
          const location = response.headers.get('location')
          if (
            response.status < 300 ||
            response.status >= 400 ||
            response.status === 304 ||
            location === null
          ) {
            return { response, target: target.href } as const
          }
          target = new URL(location, target)
        }
        return { refused: `more than ${MAX_REDIRECTS} redirects` } as const
      },
      catch: cause => unavailable(`the fetch failed: ${String(cause)}`),
    })

  // Counted as it streams: a missing or false Content-Length does not let a larger body through.
  const bytesOf = (response: Response) =>
    Effect.tryPromise({
      try: async () => {
        const chunks: Array<Uint8Array> = []
        let size = 0
        const reader = response.body?.getReader()
        for (
          let read = await reader?.read();
          read !== undefined && !read.done;
          read = await reader?.read()
        ) {
          size += read.value.byteLength
          if (size > maxBytes) {
            await reader?.cancel()
            return undefined
          }
          chunks.push(read.value)
        }
        const bytes = new Uint8Array(size)
        let at = 0
        for (const chunk of chunks) {
          bytes.set(chunk, at)
          at += chunk.byteLength
        }
        return bytes
      },
      catch: cause => unavailable(`the body could not be read: ${String(cause)}`),
    })

  return Effect.gen(function* () {
    const cached = yield* readCached
    const answer = yield* request(cached)
    if ('refused' in answer) return yield* unavailable(answer.refused)
    const { response, target } = answer
    const unchanged = Option.filter(cached, entry => entry.target === target)
    if (response.status === 304 && Option.isSome(unchanged)) return unchanged.value.asset
    if (response.status !== 200)
      return yield* unavailable(`the original answered ${response.status}`)
    const bytes = yield* bytesOf(response)
    if (bytes === undefined)
      return yield* unavailable(`the original is larger than ${maxBytes} bytes`)
    const asset = yield* describe(url, bytes).pipe(
      Effect.mapError(error => unavailable(`the original could not be inspected: ${error._tag}`)),
    )
    const store = options.cache
    if (store !== undefined) {
      const entry = Schema.encodeSync(CachedJson)({
        target,
        etag: Option.fromNullishOr(response.headers.get('etag')),
        asset,
      })
      yield* store
        .set(cacheKey, entry)
        .pipe(
          Effect.catch(cause =>
            Diagnostics.report(
              storeFailed({ store: 'facts', operation: 'write', key: cacheKey, cause }),
            ),
          ),
        )
    }
    return asset
  })
}
