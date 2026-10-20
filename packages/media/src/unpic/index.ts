/**
 * Images on a host that resizes them itself (Shopify, Cloudinary, imgix,
 * Contentful, and the rest unpic knows), as a `Provider`: each candidate is
 * the host's own URL for that width, so no server of ours runs and nothing is
 * stored. unpic, an optional peer, reads the host from the URL and writes it.
 */
import { Option } from 'effect'
import { getProviderForUrl, transformUrl, type ImageCdn } from 'unpic'
import type { Encoding, Format } from '../format.js'
import type { Provider } from '../provider.js'
import * as Widths from '../widths.js'

export interface DetectOptions {
  /** The widths offered: `Widths.standard` unless given. */
  readonly widths?: Widths.Widths | undefined
  /**
   * Formats offered as `source`s, most preferred first. None unless given: the
   * `img` asks for `auto`, and the host picks the format from `Accept`.
   */
  readonly sources?: ReadonlyArray<Format> | undefined
  /** What the `img` asks for: `auto` unless given. */
  readonly fallback?: Encoding | undefined
  /** The encoder's quality, where the host takes one. */
  readonly quality?: number | undefined
}

/**
 * The provider of `url`'s host, or none when unpic knows no host for it. The
 * provider answers only for an asset on a host of the same kind (its `key` is
 * the image's URL, written on its own host), and none for a format the host does not take: unpic writes no
 * format for some hosts (Shopify's chooses from `Accept`), and a `source`
 * naming AVIF over a JPEG would be a lie.
 */
export const detect = (url: string, options: DetectOptions = {}): Option.Option<Provider> => {
  const cdn: ImageCdn | false = getProviderForUrl(url)
  if (cdn === false) return Option.none()
  const quality = options.quality === undefined ? {} : { quality: options.quality }
  const write = (key: string, width: number, format: Format | undefined) =>
    transformUrl({
      url: key,
      provider: cdn,
      width,
      ...quality,
      ...(format === undefined ? {} : { format }),
    })
  // A host that takes a format writes two formats differently.
  const takesFormat = write(url, 640, 'avif') !== write(url, 640, 'webp')
  return Option.some({
    widths: options.widths ?? Widths.standard,
    sources: options.sources ?? [],
    fallback: options.fallback ?? 'auto',
    url: (asset, { width, encoding }) => {
      if (getProviderForUrl(asset.key) !== cdn) return Option.none()
      if (encoding !== 'auto' && !takesFormat) return Option.none()
      return Option.fromNullishOr(
        write(asset.key, width, encoding === 'auto' ? undefined : encoding),
      )
    },
  })
}
