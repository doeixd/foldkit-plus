import { Option } from 'effect'
import type { ImageAsset } from './asset.js'
import { mimeType, type Encoding } from './format.js'
import * as Layout from './layout.js'
import { background, type Level } from './placeholder.js'
import type { Provider } from './provider.js'
import * as Widths from './widths.js'

/** A `source` element's attributes: one format's candidates. */
export interface Source {
  readonly type: string
  readonly srcset: string
}

/** The `img` element's attributes. */
export interface Img {
  readonly src: string
  readonly srcset: string
  readonly sizes: string
  readonly width: number
  readonly height: number
  readonly loading: 'lazy' | 'eager'
  readonly decoding: Option.Option<'async'>
  readonly fetchPriority: Option.Option<'high'>
}

/**
 * Everything an image's markup says, derived from its facts, its provider and
 * its layout. A view writes these; it decides nothing.
 */
export interface Picture {
  /** One per format the provider offers before the `img`'s own; none, a bare `img`. */
  readonly sources: ReadonlyArray<Source>
  readonly img: Img
  /** The original's aspect ratio, as CSS writes one. */
  readonly ratio: string
  /** Where a crop keeps the subject, as `object-position` writes it. */
  readonly focus: Option.Option<string>
  /**
   * The CSS `background` to paint behind the image until it loads. None for
   * an image with transparent pixels, which would show it through them.
   */
  readonly placeholder: Option.Option<string>
}

/** An image's facts, and a provider that takes them: a hashed one for `Provider.hosted`. */
export interface Input<Asset extends ImageAsset = ImageAsset> {
  readonly asset: Asset
  readonly provider: Provider<NoInfer<Asset>>
  readonly layout: Layout.Layout
  /** The page's largest image: fetched first, not lazily. */
  readonly priority?: boolean
  /** In place of the layout's `sizes`, when the page knows the drawn width better. */
  readonly sizes?: string
  /**
   * How much of a ThumbHash to paint. By default its picture for a `priority`
   * image, the one a reader waits on, and its average color for the rest, so
   * a grid of thumbnails adds colors to the HTML, not pictures.
   */
  readonly placeholder?: Level
}

/**
 * The attributes of one image, or none when the provider has no URL for any
 * of its candidates in the `img`'s own encoding (a build table that never made
 * this image). Candidates the provider lacks are left out, never written as a
 * broken URL.
 */
export const derive = <Asset extends ImageAsset>(input: Input<Asset>): Option.Option<Picture> => {
  const { asset, provider, layout, priority = false } = input
  const candidates = Layout.candidates(layout, provider.widths, asset.width)

  const entries = (encoding: Encoding) =>
    candidates.flatMap(candidate =>
      Option.match(provider.url(asset, { width: candidate.request, encoding }), {
        onNone: () => [],
        onSome: url => [{ url, described: candidate.described }],
      }),
    )
  const srcsetOf = (list: ReadonlyArray<{ readonly url: string; readonly described: number }>) =>
    list.map(({ url, described }) => `${url} ${described}w`).join(', ')

  const own = entries(provider.fallback)
  if (own.length === 0) return Option.none()

  // A browser that ignores `srcset` fetches `src`: the first width at least
  // as wide as the image is drawn, or the largest there is.
  const drawn = Layout.Schema.match(layout, {
    Fixed: ({ width }) => width,
    Constrained: ({ width }) => width,
    FullWidth: () => Number.POSITIVE_INFINITY,
  })
  const src = (own.find(entry => entry.described >= drawn) ?? own[own.length - 1]!).url

  const sources = provider.sources.flatMap(format => {
    const list = entries(format)
    return list.length === 0 ? [] : [{ type: mimeType(format), srcset: srcsetOf(list) }]
  })

  const sizes = input.sizes ?? Layout.sizes(layout)
  const box = Layout.box(layout, asset)
  return Option.some({
    sources,
    img: {
      src,
      srcset: srcsetOf(own),
      // A lazy image may let the browser use its laid-out width instead.
      sizes: priority || sizes.startsWith('auto') ? sizes : `auto, ${sizes}`,
      width: box.width,
      height: box.height,
      loading: priority ? 'eager' : 'lazy',
      decoding: priority ? Option.none() : Option.some('async'),
      fetchPriority: priority ? Option.some('high') : Option.none(),
    },
    ratio: Layout.ratio(asset),
    focus: Option.map(asset.focus, ({ x, y }) => `${x * 100}% ${y * 100}%`),
    placeholder: asset.alpha
      ? Option.none()
      : background(asset, provider, input.placeholder ?? (priority ? 'detail' : 'average')),
  })
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** What a preload names: the candidates the browser will choose from, at the `img`'s sizes. */
export interface Preloaded {
  /** A `source`'s media type, so a browser that cannot show it skips the preload. */
  readonly type: Option.Option<string>
  readonly srcset: string
  readonly sizes: string
}

/** The `<link rel="preload">` naming `preloaded`, its values escaped for the attribute. */
export const preloadLink = ({ type, srcset, sizes }: Preloaded): string => {
  const attributes: ReadonlyArray<readonly [string, string]> = [
    ['rel', 'preload'],
    ['as', 'image'],
    ...Option.match(type, { onNone: () => [], onSome: value => [['type', value] as const] }),
    ['imagesrcset', srcset],
    ['imagesizes', sizes],
    ['fetchpriority', 'high'],
  ]
  return `<link ${attributes.map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(' ')}>`
}

/**
 * A `<link rel="preload">` for a page's `head`, so the browser fetches its
 * largest image before it reaches the `img`. It names the candidates the
 * browser will choose from: the first `source`'s, with its `type`, so a
 * browser that cannot show that format skips the preload rather than fetching
 * a file it will not use; the `img`'s when there is no `source`. Only for the
 * image drawn with `priority`.
 */
export const preload = ({ sources, img }: Picture): string => {
  const [first] = sources
  return preloadLink({
    type: Option.map(Option.fromNullishOr(first), source => source.type),
    srcset: first === undefined ? img.srcset : first.srcset,
    sizes: img.sizes,
  })
}

// Link-preview fetchers read JPEG; many read WebP and PNG; not all read AVIF.
const OPEN_GRAPH_ENCODINGS = ['jpeg', 'webp', 'png'] as const

/**
 * An image for a page's Open Graph `og:image`: at the first ladder width of
 * at least 1200, as JPEG when the provider makes it, else WebP or PNG, never
 * AVIF, as an absolute URL against `origin`. None when the provider has no
 * such variant.
 */
export const ogImage = <Asset extends ImageAsset>(
  asset: Asset,
  provider: Provider<NoInfer<Asset>>,
  origin: string,
): Option.Option<string> => {
  const width = Widths.atLeast(provider.widths, 1200)
  // A provider that picks the format reads the fetcher's `Accept`; the rest are asked in turn.
  const encodings: ReadonlyArray<Encoding> =
    provider.fallback === 'auto' ? ['auto'] : OPEN_GRAPH_ENCODINGS
  return Option.map(
    Option.firstSomeOf(encodings.map(encoding => provider.url(asset, { width, encoding }))),
    url => new URL(url, origin).href,
  )
}
