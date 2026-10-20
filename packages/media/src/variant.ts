import { Option, Schema, SchemaGetter } from 'effect'
import { Format } from './format.js'
import type { Widths } from './widths.js'

/**
 * Where a hosted variant lives: the variant, then the original's content hash.
 * The server routes this path and `Provider.hosted` fills it in, so the two
 * read one string.
 */
export const PATH = '/_image/:variant/:hash'

/** An original's SHA-256, in lowercase hex: its name in the store. */
export const ContentHash = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))

/** A quality from 1 to 100. */
export const Quality = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))

// No leading zero anywhere: one request has one spelling, so one cache key.
const SPELLING = /^w([1-9]\d{0,4})(?:q([1-9]\d?|100))?\.(avif|webp|jpeg|png)$/

/** A variant as its server reads it. */
export interface Variant {
  readonly width: number
  readonly format: Format
  readonly quality: Option.Option<number>
}

/**
 * A variant as the path spells it, `w640.avif` or `w640q75.webp`, decoding to
 * its width, format and quality. Its width must be on `widths`, so a server
 * decoding with it refuses every other width before any work.
 */
export const schema = (widths: Widths): Schema.Codec<Variant, string> =>
  Schema.String.check(Schema.isPattern(SPELLING)).pipe(
    Schema.decodeTo(
      Schema.Struct({ width: widths.Schema, format: Format, quality: Schema.Option(Quality) }),
      {
        decode: SchemaGetter.transform(spelling => {
          const [, width, quality, format] = SPELLING.exec(spelling)!
          return {
            width: Number(width),
            format: format as Format,
            quality: Option.map(Option.fromNullishOr(quality), Number),
          }
        }),
        encode: SchemaGetter.transform(
          ({ width, format, quality }) =>
            `w${width}${Option.match(quality, { onNone: () => '', onSome: value => `q${value}` })}.${format}`,
        ),
      },
    ),
  )
