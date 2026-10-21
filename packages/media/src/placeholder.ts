import { Option } from 'effect'
import { thumbHashToAverageRGBA, thumbHashToDataURL } from 'thumbhash'
import { Placeholder, type ImageAsset } from './asset.js'
import type { Provider } from './provider.js'

// A list redraws the same images, and decoding draws a PNG each time; a few
// hundred recent ones cover a page without growing for the life of the app.
const DECODED_LIMIT = 256
const decoded = new Map<string, string>()

const bytesOf = (hash: string) => Uint8Array.from(atob(hash), char => char.charCodeAt(0))

const decode = (hash: string): string => {
  const cached = decoded.get(hash)
  if (cached !== undefined) return cached
  const url = thumbHashToDataURL(bytesOf(hash))
  if (decoded.size >= DECODED_LIMIT) decoded.delete(decoded.keys().next().value!)
  decoded.set(hash, url)
  return url
}

// Percent-encode what would end or escape a quoted CSS `url()`.
const cssUrl = (url: string): string =>
  `url("${url.replace(/["\\\n\r]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)}")`

// A ThumbHash's average color, which costs a few bytes of HTML where its picture costs kilobytes.
const average = (hash: string): string => {
  const { r, g, b, a } = thumbHashToAverageRGBA(bytesOf(hash))
  const channel = (value: number) => Math.round(value * 255)
  return `rgb(${channel(r)} ${channel(g)} ${channel(b)} / ${Math.round(a * 100) / 100})`
}

/**
 * How much of a ThumbHash a placeholder paints: its blurred picture
 * (`detail`), or its average color (`average`).
 */
export type Level = 'detail' | 'average'

/**
 * The CSS `background` an image's placeholder paints, whatever the image: a
 * color, a ThumbHash at `level`, or the provider's smallest width of the
 * image. None when the image has no placeholder, or the provider has no URL
 * for the smallest width.
 */
export const background = <Asset extends ImageAsset>(
  asset: Asset,
  provider: Provider<Asset>,
  level: Level,
): Option.Option<string> =>
  Option.flatMap(asset.placeholder, placeholder =>
    Placeholder.match(placeholder, {
      Color: ({ value }) => Option.some(value),
      ThumbHash: ({ hash }) =>
        Option.some(level === 'detail' ? cssUrl(decode(hash)) : average(hash)),
      LowRes: () =>
        Option.map(
          provider.url(asset, { width: provider.widths.values[0]!, encoding: provider.fallback }),
          cssUrl,
        ),
    }),
  )
