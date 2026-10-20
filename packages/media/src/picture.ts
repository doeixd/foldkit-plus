import { Option } from 'effect'
import type { ImageAsset } from './asset.js'
import { mimeType, type Encoding } from './format.js'
import * as Layout from './layout.js'
import { background } from './placeholder.js'
import type { Provider } from './provider.js'

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
  /**
   * The CSS `background` to paint behind the image until it loads. None for
   * an image with transparent pixels, which would show it through them.
   */
  readonly placeholder: Option.Option<string>
}

export interface Input {
  readonly asset: ImageAsset
  readonly provider: Provider
  readonly layout: Layout.Layout
  /** The page's largest image: fetched first, not lazily. */
  readonly priority?: boolean
  /** In place of the layout's `sizes`, when the page knows the drawn width better. */
  readonly sizes?: string
}

/**
 * The attributes of one image, or none when the provider has no URL for any
 * of its candidates in the `img`'s own encoding (a build table that never made
 * this image). Candidates the provider lacks are left out, never written as a
 * broken URL.
 */
export const derive = (input: Input): Option.Option<Picture> => {
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
    ratio: `${asset.width} / ${asset.height}`,
    placeholder: asset.alpha ? Option.none() : background(asset, provider),
  })
}

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

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
  const attributes: ReadonlyArray<readonly [string, string]> = [
    ['rel', 'preload'],
    ['as', 'image'],
    ...(first === undefined ? [] : [['type', first.type] as const]),
    ['imagesrcset', first === undefined ? img.srcset : first.srcset],
    ['imagesizes', img.sizes],
    ['fetchpriority', 'high'],
  ]
  return `<link ${attributes.map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(' ')}>`
}
