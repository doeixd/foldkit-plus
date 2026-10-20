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

/**
 * The facts of one original image, derived from it once and stored beside it.
 * `key` is where the original lives, as its provider reads it. `hash` is the
 * original's content hash, absent for an image never read; `alpha` says
 * whether it has transparent pixels.
 */
export const ImageAsset = Schema.Struct({
  key: Schema.String.check(Schema.isNonEmpty()),
  width: Pixels,
  height: Pixels,
  alpha: Schema.Boolean,
  hash: Schema.OptionFromNullOr(Schema.String),
  placeholder: Schema.OptionFromNullOr(Placeholder),
})
export type ImageAsset = typeof ImageAsset.Type
