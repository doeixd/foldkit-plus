import { Context, Duration, Effect, Layer, Match, Schema } from 'effect'
import { RateLimiter } from 'effect/persistence'

/** The client has made too many variants lately; it may try again after `retryAfterSeconds`. */
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  'RateLimited',
  { retryAfterSeconds: Schema.Number },
  { httpApiStatus: 429 },
) {}

/**
 * Whether a client may have a variant made now. Asked only on a miss, after
 * the store and before the original is read: a variant already made costs a
 * read, and only making one costs work. Optional: without it, every miss is
 * admitted.
 */
export class Admission extends Context.Service<
  Admission,
  { readonly admit: (client: string) => Effect.Effect<void, RateLimited> }
>()('foldkit-media/Admission') {}

/**
 * Admission through Effect's `RateLimiter`, `limit` misses a client per
 * `window`, over the limiter's store (`RateLimiter.layerStoreMemory` for one
 * process, Redis for several). A store that fails admits the request, logged:
 * a limiter that is down should not take the images down with it.
 */
export const admissionRateLimiter = (options: {
  readonly limit: number
  readonly window: Duration.Input
  readonly algorithm?: 'fixed-window' | 'token-bucket'
}): Layer.Layer<Admission, never, RateLimiter.RateLimiter> =>
  Layer.effect(
    Admission,
    Effect.gen(function* () {
      const limiter = yield* RateLimiter.RateLimiter
      return {
        admit: (client: string) =>
          limiter
            .consume({
              key: `foldkit-media:${client}`,
              limit: options.limit,
              window: options.window,
              algorithm: options.algorithm ?? 'token-bucket',
              onExceeded: 'fail',
            })
            .pipe(
              Effect.asVoid,
              Effect.catch(error =>
                Match.valueTags(error.reason, {
                  RateLimitExceeded: ({ retryAfter }) =>
                    Effect.fail(
                      new RateLimited({
                        retryAfterSeconds: Math.max(1, Math.ceil(Duration.toSeconds(retryAfter))),
                      }),
                    ),
                  RateLimitStoreError: () =>
                    Effect.logWarning('Media: the rate limiter failed; admitting', error),
                }),
              ),
            ),
      }
    }),
  )
