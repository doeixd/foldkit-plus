import { Context, Effect, Layer, Option, Semaphore } from 'effect'
import { positiveInteger } from '../limits.js'
import type { Variant } from '../variant.js'
import type {
  OriginalNotFound,
  OriginalTooLarge,
  QuotaExhausted,
  TransformFailed,
} from './errors.js'

/** An original's bytes, as the store hands them over, and how many there are. */
export interface Original {
  readonly body: ReadableStream<Uint8Array>
  readonly size: number
}

/** A variant made: its bytes and their media type. */
export interface Encoded {
  readonly bytes: Uint8Array<ArrayBuffer>
  readonly contentType: string
}

/** A variant found kept, and which layer had it. */
export interface Kept {
  readonly encoded: Encoded
  readonly from: 'edge' | 'store'
}

/** Where originals live, by their content hash. Authoritative: the server never writes it. */
export class Originals extends Context.Service<
  Originals,
  { readonly get: (hash: string) => Effect.Effect<Original, OriginalNotFound> }
>()('foldkit-media/Originals') {}

/**
 * Resizes and encodes an original into a variant, never larger than the
 * original (a width above it answers with the original's width). An original
 * too large to decode is `OriginalTooLarge`, a 413, as one too large to read.
 */
export class Transformer extends Context.Service<
  Transformer,
  {
    readonly transform: (
      original: Original,
      variant: Variant,
    ) => Effect.Effect<Encoded, TransformFailed | QuotaExhausted | OriginalTooLarge>
  }
>()('foldkit-media/Transformer') {}

/**
 * Variants already made, by the encoded request. A cache: losing it costs
 * time, and on a host that bills transformations, money; never data.
 */
export class Variants extends Context.Service<
  Variants,
  {
    readonly get: (key: string) => Effect.Effect<Option.Option<Kept>>
    readonly put: (key: string, encoded: Encoded) => Effect.Effect<void>
  }
>()('foldkit-media/Variants') {}

/** Keeps nothing: every request transforms. For a host with a cache of its own in front. */
export const variantsNone: Layer.Layer<Variants> = Layer.succeed(Variants, {
  get: () => Effect.succeed(Option.none()),
  put: () => Effect.void,
})

/**
 * A `Transformer` that runs at most `concurrency` transforms at once, the
 * rest waiting their turn: encoding is CPU work, and a burst of misses should
 * queue, not starve every other request. For a transformer that encodes in
 * this process (sharp, WebAssembly); a host's binding does the work elsewhere.
 */
export const limitTransforms = (concurrency: number) => {
  const permitsCount = positiveInteger('limitTransforms: concurrency', concurrency)
  return <E, R>(transformer: Layer.Layer<Transformer, E, R>): Layer.Layer<Transformer, E, R> =>
    Layer.effect(
      Transformer,
      Effect.gen(function* () {
        const inner = yield* Transformer
        const permits = yield* Semaphore.make(permitsCount)
        return {
          transform: (original: Original, variant: Variant) =>
            Semaphore.withPermit(permits)(inner.transform(original, variant)),
        }
      }),
    ).pipe(Layer.provide(transformer))
}
