import { Context, Effect, Layer, Option } from 'effect'
import type { Variant } from '../variant.js'
import { OriginalNotFound, type QuotaExhausted, type TransformFailed } from './errors.js'

/** An original's bytes, as the store hands them over, and how many there are. */
export interface Original {
  readonly body: ReadableStream<Uint8Array>
  readonly size: number
}

/** A variant made: its bytes and their media type. */
export interface Encoded {
  readonly bytes: Uint8Array
  readonly contentType: string
}

/** Where originals live, by their content hash. Authoritative: the server never writes it. */
export class Originals extends Context.Service<
  Originals,
  { readonly get: (hash: string) => Effect.Effect<Original, OriginalNotFound> }
>()('foldkit-media/Originals') {}

/**
 * Resizes and encodes an original into a variant, never larger than the
 * original (a width above it answers with the original's width).
 */
export class Transformer extends Context.Service<
  Transformer,
  {
    readonly transform: (
      original: Original,
      variant: Variant,
    ) => Effect.Effect<Encoded, TransformFailed | QuotaExhausted>
  }
>()('foldkit-media/Transformer') {}

/**
 * Variants already made, by the encoded request. A cache: losing it costs
 * time, and on a host that bills transformations, money; never data.
 */
export class Variants extends Context.Service<
  Variants,
  {
    readonly get: (key: string) => Effect.Effect<Option.Option<Encoded>>
    readonly put: (key: string, encoded: Encoded) => Effect.Effect<void>
  }
>()('foldkit-media/Variants') {}

/** Keeps nothing: every request transforms. For a host with a cache of its own in front. */
export const variantsNone: Layer.Layer<Variants> = Layer.succeed(Variants, {
  get: () => Effect.succeed(Option.none()),
  put: () => Effect.void,
})

/** Keeps every variant in memory, for tests and a single long-lived process. */
export const variantsMemory = (): Layer.Layer<Variants> => {
  const kept = new Map<string, Encoded>()
  return Layer.succeed(Variants, {
    get: key => Effect.sync(() => Option.fromNullishOr(kept.get(key))),
    put: (key, encoded) => Effect.sync(() => void kept.set(key, encoded)),
  })
}

/** Originals held in memory, by hash: for tests. */
export const originalsMemory = (
  originals: ReadonlyMap<string, Uint8Array<ArrayBuffer>>,
): Layer.Layer<Originals> =>
  Layer.succeed(Originals, {
    get: hash =>
      Option.match(Option.fromNullishOr(originals.get(hash)), {
        onNone: () => Effect.fail(new OriginalNotFound({ hash })),
        onSome: bytes =>
          Effect.succeed({ body: new Blob([bytes]).stream(), size: bytes.byteLength }),
      }),
  })
