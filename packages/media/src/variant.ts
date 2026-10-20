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

// No leading zero anywhere: one request has one spelling, so one cache key. The output's
// revision is written only above 0, so every URL written before revisions keeps its spelling.
const SPELLING = /^w([1-9]\d{0,4})(?:q([1-9]\d?|100))?(?:\.r([1-9]\d{0,3}))?\.(avif|webp|jpeg|png)$/

/**
 * The grammar every release reads, whatever its space: a spelling it matches
 * may be one another release offers, so refusing it says nothing for good.
 */
export const Spelling = Schema.String.check(Schema.isPattern(SPELLING))

/** The output revision a spelling names: `w640.r2.avif` is 2, and one naming none is 0. */
export const revisionOf = (spelling: string): number => Number(SPELLING.exec(spelling)?.[3] ?? 0)

/** `spelling` at `revision`: the same variant, as that revision writes it. */
export const respell = (spelling: string, revision: number): string =>
  spelling.replace(/(?:\.r\d+)?(\.[a-z]+)$/, revision === 0 ? '$1' : `.r${revision}$1`)

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
  /**
   * The generation of what its variants are: raised when the output changes (the encoder's
   * settings, its resizing), so a changed variant has a new URL rather than new bytes behind
   * an old one. 0 writes no revision.
   */
  readonly revision: number
  /** `w640.avif`, `w640q75.webp` or `w640.r1.avif`, decoded to a `Variant` of this space's revision. */
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
    readonly revision?: number
  } = {},
): Space => {
  const {
    widths = Widths.standard,
    formats = ['avif', 'webp'],
    qualities = [],
    revision = 0,
  } = options
  if (!(Number.isInteger(revision) && revision >= 0 && revision <= 9999)) {
    throw new Error(`Variant.space: revision ${revision} is not an integer from 0 to 9999`)
  }
  const unspellableWidth = widths.values.find(width => width > 99_999)
  if (unspellableWidth !== undefined) {
    throw new Error(`Variant.space: width ${unspellableWidth} cannot be spelled in a variant URL`)
  }
  if (formats.length === 0) throw new Error('Variant.space: a space needs at least one format')
  distinct('format', formats)
  distinct('quality', qualities)
  for (const quality of qualities) {
    if (!Schema.is(Quality)(quality)) {
      throw new Error(`Variant.space: quality ${quality} is not an integer from 1 to 100`)
    }
  }
  const schema = Spelling.check(
    Schema.makeFilter(spelling => revisionOf(spelling) === revision || `not revision ${revision}`),
  ).pipe(
    Schema.decodeTo(
      Schema.Struct({
        width: widths.Schema,
        format: Schema.Literals(formats),
        quality: Schema.Option(Schema.Literals(qualities)),
      }),
      {
        decode: SchemaGetter.transform(spelling => {
          const [, width, quality, , format] = SPELLING.exec(spelling)!
          return {
            width: Number(width),
            // The spelling's pattern admits only formats; the struct checks this space's.
            format: format as Format,
            quality: Option.map(Option.fromNullishOr(quality), Number),
          }
        }),
        encode: SchemaGetter.transform(
          ({ width, format, quality }) =>
            `w${width}${Option.match(quality, { onNone: () => '', onSome: value => `q${value}` })}${revision === 0 ? '' : `.r${revision}`}.${format}`,
        ),
      },
    ),
  )
  return {
    widths,
    formats,
    qualities,
    revision,
    schema,
    size: widths.values.length * formats.length * (1 + qualities.length),
  }
}

/** The standard ladder, AVIF and WebP, and no quality in any URL: 16 variants an original. */
export const standard: Space = space()
