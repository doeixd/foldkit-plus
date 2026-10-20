import { Option, Schema, SchemaGetter } from 'effect'
import { Format } from './format.js'
import * as Widths from './widths.js'

/**
 * Where a hosted variant lives: the original's content hash, then the variant.
 * The server routes this path and `Provider.hosted` fills it in, so the two
 * read one string. It ends in the format's extension, so a variant written
 * out as a file is served with its type by any static host.
 */
export const PATH = '/_image/:hash/:variant'

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
  /** None: the encoder's own default. */
  readonly quality: Option.Option<number>
}

/**
 * Every variant a server will make: the widths, the formats and the qualities
 * it accepts, and the Schema that reads a variant's spelling against them. A
 * request outside it is refused before any work, so an original has at most
 * `size` variants, whoever asks.
 */
export interface Space {
  readonly widths: Widths.Widths
  readonly formats: ReadonlyArray<Format>
  /** Qualities a URL may name; empty, no URL names one. */
  readonly qualities: ReadonlyArray<number>
  /** `w640.avif` or `w640q75.webp`, decoded to a `Variant` inside this space. */
  readonly schema: Schema.Codec<Variant, string>
  /** How many variants one original can have. */
  readonly size: number
}

const distinct = <A>(label: string, values: ReadonlyArray<A>) => {
  if (new Set(values).size !== values.length)
    throw new Error(`Variant.space: a ${label} appears twice`)
}

/**
 * A space from its ladders. Refuses no formats, a repeated format or
 * quality, and a quality outside 1 to 100.
 */
export const space = (
  options: {
    readonly widths?: Widths.Widths
    readonly formats?: ReadonlyArray<Format>
    readonly qualities?: ReadonlyArray<number>
  } = {},
): Space => {
  const { widths = Widths.standard, formats = ['avif', 'webp'], qualities = [] } = options
  if (formats.length === 0) throw new Error('Variant.space: a space needs at least one format')
  distinct('format', formats)
  distinct('quality', qualities)
  for (const quality of qualities) {
    if (!Schema.is(Quality)(quality)) {
      throw new Error(`Variant.space: quality ${quality} is not an integer from 1 to 100`)
    }
  }
  const schema = Schema.String.check(Schema.isPattern(SPELLING)).pipe(
    Schema.decodeTo(
      Schema.Struct({
        width: widths.Schema,
        format: Schema.Literals(formats),
        quality: Schema.Option(Schema.Literals(qualities)),
      }),
      {
        decode: SchemaGetter.transform(spelling => {
          const [, width, quality, format] = SPELLING.exec(spelling)!
          return {
            width: Number(width),
            // The spelling's pattern admits only formats; the struct checks this space's.
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
  return {
    widths,
    formats,
    qualities,
    schema,
    size: widths.values.length * formats.length * (1 + qualities.length),
  }
}

/** The standard ladder, AVIF and WebP, and no quality in any URL: 16 variants an original. */
export const standard: Space = space()
