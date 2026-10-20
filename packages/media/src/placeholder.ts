import { Option } from 'effect'
import { thumbHashToDataURL } from 'thumbhash'
import { Placeholder, type ImageAsset } from './asset.js'
import type { Provider } from './provider.js'

// A list redraws the same images, and decoding draws a PNG each time; a few
// hundred recent ones cover a page without growing for the life of the app.
const DECODED_LIMIT = 256
const decoded = new Map<string, string>()

const decode = (hash: string): string => {
  const cached = decoded.get(hash)
  if (cached !== undefined) return cached
  const url = thumbHashToDataURL(Uint8Array.from(atob(hash), char => char.charCodeAt(0)))
  if (decoded.size >= DECODED_LIMIT) decoded.delete(decoded.keys().next().value!)
  decoded.set(hash, url)
  return url
}

// Percent-encode what would end or escape a quoted CSS `url()`.
const cssUrl = (url: string): string =>
  `url("${url.replace(/["\\\n\r]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}")`

/**
 * The CSS `background` an image's placeholder paints, whatever the image: a
 * color, a decoded ThumbHash, or the provider's smallest width of the image.
 * None when the image has no placeholder, or the provider has no URL for the
 * smallest width.
 */
export const background = (asset: ImageAsset, provider: Provider): Option.Option<string> =>
  Option.flatMap(asset.placeholder, placeholder =>
    Placeholder.match(placeholder, {
      Color: ({ value }) => Option.some(value),
      ThumbHash: ({ hash }) => Option.some(cssUrl(decode(hash))),
      LowRes: () =>
        Option.map(
          provider.url(asset, { width: provider.widths.values[0]!, encoding: provider.fallback }),
          cssUrl,
        ),
    }),
  )
