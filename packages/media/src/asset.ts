import { Schema } from 'effect'

// A placeholder's color lands in a style the page writes, so it is a color
// and nothing else: no `;`, no `url(`, no second declaration.
const CSS_COLOR =
  /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([0-9a-z%.,\s/+-]*\))$/i

// ThumbHash's bytes in base64; a real one is about 25 bytes.
const BASE64 = /^[A-Za-z0-9+/]{4,88}={0,2}$/

/** What stands in an image's place until it loads. */
export const Placeholder = Schema.TaggedUnion({
  /** A flat color, such as one taken from a logo. */
  Color: { value: Schema.String.check(Schema.isPattern(CSS_COLOR)) },
  /** A ThumbHash: a blurred likeness, alpha and aspect ratio included. */
  ThumbHash: { hash: Schema.String.check(Schema.isPattern(BASE64)) },
  /** The provider's smallest width of the image itself, scaled up. */
  LowRes: {},
})
export type Placeholder = typeof Placeholder.Type

const Pixels = Schema.Int.check(Schema.isGreaterThan(0))

const Share = Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))

/** Where an image's subject is, from its top left (0, 0) to its bottom right (1, 1). */
export const Focus = Schema.Struct({ x: Share, y: Share })
export type Focus = typeof Focus.Type

/**
 * The facts of one original image, derived from it once and stored beside it.
 * `key` is where the original lives, as its provider reads it. `hash` is the
 * original's content hash, absent for an image never read; `alpha` says
 * whether it has transparent pixels. `focus`, the one fact an editor sets
 * rather than one derived, is where a crop keeps the subject; a stored asset
 * without it reads as none.
 */
export const ImageAsset = Schema.Struct({
  key: Schema.String.check(Schema.isNonEmpty()),
  width: Pixels,
  height: Pixels,
  alpha: Schema.Boolean,
  hash: Schema.OptionFromNullOr(Schema.String),
  placeholder: Schema.OptionFromNullOr(Placeholder),
  focus: Schema.OptionFromOptionalNullOr(Focus),
})
export type ImageAsset = typeof ImageAsset.Type
