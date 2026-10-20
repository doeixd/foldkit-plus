import { Effect, Option, Schema, Stream } from 'effect'
import { Behavior, Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { Layout, Picture, type ImageAsset, type Provider } from 'foldkit-media'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'
import { imgAttributes } from './imageAttributes.js'
import type { MixinList } from './resolve.js'

/**
 * An image publishes its frame (a `picture`), a `source` per format, and the
 * `img`; it owns no
 * state or messages, and the browser owns loading and which candidate to
 * fetch. The `img` carries the original's ratio as `--fk-image-ratio` and the
 * placeholder's background as `--fk-image-placeholder`, the focal point as
 * `--fk-image-focus`, and `data-layout` (`fixed`, `constrained`, `full`). A
 * frame whose provider has no URL for the image is drawn empty, marked
 * `data-unavailable`, holding the image's box (`--fk-image-ratio`,
 * `--fk-image-width`) and its alt text.
 */
export const ImageSlots = Slots.define({
  frame: Slot.make({ capability: Capability.Container }),
  source: Slot.make({ capability: Capability.Container }),
  image: Slot.make({ capability: Capability.Container }),
})

/** What an image says to someone who cannot see it, or that it says nothing. */
export const Alt = Schema.TaggedUnion({
  /** The picture's content, in words. */
  Described: { text: Schema.String },
  /** Ornament that a screen reader skips. */
  Decorative: {},
})
export type Alt = typeof Alt.Type

export const described = (text: string): Alt => Alt.cases.Described.make({ text })
export const decorative: Alt = Alt.cases.Decorative.make({})

/** An image in one call: its facts, where its variants live, how wide it is drawn, and what it says. */
export interface ImageView<Message = never> {
  readonly asset: ImageAsset
  readonly provider: Provider.Provider
  readonly layout: Layout.Layout
  /** Required: an image either says something or is ornament, and the page must say which. */
  readonly alt: Alt
  /** The page's largest image: fetched first, not lazily. */
  readonly priority?: boolean | undefined
  /** In place of the layout's `sizes`, when the page knows the drawn width better. */
  readonly sizes?: string | undefined
  /**
   * How much of a ThumbHash placeholder to paint: its picture or its average
   * color. By default the picture for a `priority` image, the color otherwise.
   */
  readonly placeholder?: 'detail' | 'average' | undefined
  /** A style of `ImageSlots`, for the image's look. */
  readonly style?: NamedStyle<typeof ImageSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const layoutName = Layout.Schema.match({
  Fixed: () => 'fixed',
  Constrained: () => 'constrained',
  FullWidth: () => 'full',
})

export const view = <Message = never>(
  options: ImageView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ImageSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const picture = Picture.derive({
    asset: options.asset,
    provider: options.provider,
    layout: options.layout,
    priority: options.priority ?? false,
    ...(options.sizes === undefined ? {} : { sizes: options.sizes }),
    ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
  })
  const layout = layoutName(options.layout)
  return Option.match(picture, {
    // Holds the box the image would have had, and still says what it shows.
    onNone: () =>
      h.picture(
        builders.frame.attrs([
          h.DataAttribute('unavailable', ''),
          h.DataAttribute('layout', layout),
          ...Alt.match(options.alt, {
            Described: ({ text }): ReadonlyArray<Attribute<Message>> => [
              h.Role('img'),
              h.AriaLabel(text),
            ],
            Decorative: (): ReadonlyArray<Attribute<Message>> => [h.AriaHidden(true)],
          }),
          h.Style({
            '--fk-image-ratio': Layout.ratio(options.asset),
            '--fk-image-width': `${Layout.box(options.layout, options.asset).width}px`,
          }),
        ]),
        [],
      ),
    onSome: ({ sources, img, ratio, focus, placeholder }) =>
      h.picture(builders.frame.attrs([]), [
        ...sources.map(source =>
          h.source(
            builders.source.attrs([
              h.Type(source.type),
              h.Srcset(source.srcset),
              h.Sizes(img.sizes),
            ]),
          ),
        ),
        h.img(
          builders.image.attrs([
            ...imgAttributes(img, h),
            ...Alt.match(options.alt, {
              Described: ({ text }) => [h.Alt(text)],
              Decorative: () => [h.Alt(''), h.Role('presentation')],
            }),
            h.DataAttribute('layout', layout),
            h.Style({
              '--fk-image-ratio': ratio,
              ...Option.match(focus, {
                onNone: () => ({}),
                onSome: position => ({ '--fk-image-focus': position }),
              }),
              ...Option.match(placeholder, {
                onNone: () => ({}),
                onSome: background => ({ '--fk-image-placeholder': background }),
              }),
            }),
          ]),
        ),
      ]),
  })
}

/**
 * Marks the `img` with what became of its file: `data-state` is `loading`
 * until it arrives, then `loaded`, or `failed`. An image already complete when
 * it mounts (from the cache, or loaded before the page hydrated) is marked at
 * once, so it never fades in a second time. A later `src` keeps the mark it
 * has until its own file settles.
 */
const WatchLoad = Mount.defineStream('ImageLoad', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const mark = (state: string) => element.setAttribute('data-state', state)
          const settle = () =>
            mark(
              element instanceof HTMLImageElement && element.naturalWidth > 0 ? 'loaded' : 'failed',
            )
          const failed = () => mark('failed')
          if (element instanceof HTMLImageElement && element.complete) settle()
          else mark('loading')
          element.addEventListener('load', settle)
          element.addEventListener('error', failed)
          return { settle, failed }
        }),
        ({ settle, failed }) =>
          Effect.sync(() => {
            element.removeEventListener('load', settle)
            element.removeEventListener('error', failed)
          }),
      ),
    ),
})

/**
 * Marks the `img`'s `data-state` (`loading`, `loaded`, `failed`), for a style
 * to read; `Recipes.Image` hides a failed image, keeping its box, so no
 * broken-image glyph or stray alt text shows. Pass it beside the style. It
 * sends no Message, so it is never on by default; without it (or before a page
 * hydrates) the browser draws a failed image as it does.
 */
export const watchLoad = [
  Behavior.forSlots(ImageSlots)<unknown, never>(
    {
      image: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => WatchLoad(),
      }),
    },
    { name: 'ImageLoad' },
  ).mixin,
]

// The images drawn with priority, across the page: more than one is a warning.
const prioritized = new Set<Element>()

// A file at least this much narrower than the drawn width reads blurry; this much wider, wasted.
const BLURRY_BELOW = 0.9
const WASTED_ABOVE = 2.5

const Audit = Mount.defineStream('ImageAudit', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (!(element instanceof HTMLImageElement)) return () => {}
          const image = element
          const warn = (message: string) => console.warn(`Image.audit: ${message}`, image)
          if (image.getAttribute('fetchpriority') === 'high') {
            prioritized.add(image)
            if (prioritized.size > 1) {
              warn(
                `${prioritized.size} images are drawn with priority; give it to the page's largest alone`,
              )
            }
          }
          const measure = () => {
            const drawn = image.getBoundingClientRect().width * devicePixelRatio
            if (image.naturalWidth === 0 || drawn === 0) return
            const fact = `drawn ${Math.round(drawn)} device pixels wide from a ${image.naturalWidth}px file`
            if (image.naturalWidth < drawn * BLURRY_BELOW)
              warn(`${fact}: blurry, offer a wider candidate`)
            if (image.naturalWidth > drawn * WASTED_ABOVE)
              warn(`${fact}: wasted bytes, check its sizes`)
          }
          if (image.complete) measure()
          image.addEventListener('load', measure)
          return () => {
            prioritized.delete(image)
            image.removeEventListener('load', measure)
          }
        }),
        release => Effect.sync(release),
      ),
    ),
})

/**
 * Warnings for a development build, in the console, about what the page
 * left to itself: an image drawn wider than its file (blurry) or far
 * narrower (wasted bytes), from its natural width, its drawn width and the
 * device's pixel ratio; and more than one image drawn with `priority`. It
 * logs and changes nothing; like `watchLoad`, it sends no Message, so pass it
 * beside the style, and only where a page is being built.
 */
export const audit = [
  Behavior.forSlots(ImageSlots)<unknown, never>(
    {
      image: Behavior.slot({
        requires: { capability: Capability.Container },
        mount: () => Audit(),
      }),
    },
    { name: 'ImageAudit' },
  ).mixin,
]

// The attribute values a server render wrote, double-quoted and escaped.
const attributeOf = (tag: string, name: string): Option.Option<string> =>
  Option.map(Option.fromNullishOr(new RegExp(`\\s${name}="([^"]*)"`).exec(tag)), ([, value]) =>
    value!
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&'),
  )

/**
 * The preloads of a rendered page, as `foldkit-ssr` takes a `Head`: one
 * `<link rel="preload">` for each image drawn with `priority`, read from the
 * markup, so the page says `priority` once, where it draws the image, and the
 * head follows. Each names its `picture`'s first `source`, typed, or the
 * `img`'s own candidates.
 */
export const preloadsIn = (rendered: { readonly html: string }): string => {
  const { html } = rendered
  const links: Array<string> = []
  for (const match of html.matchAll(/<img\b[^>]*\bfetchpriority="high"[^>]*>/g)) {
    const img = match[0]
    const at = match.index
    const picture = html.lastIndexOf('<picture', at)
    // A source counts only when it is in this image's own picture.
    const within = picture !== -1 && html.indexOf('</picture>', picture) > at
    const source = Option.filter(
      Option.fromNullishOr(
        within ? /<source\b[^>]*>/.exec(html.slice(picture, at))?.[0] : undefined,
      ),
      tag => Option.isSome(attributeOf(tag, 'srcset')),
    )
    const srcset = Option.match(source, {
      onNone: () => attributeOf(img, 'srcset'),
      onSome: tag => attributeOf(tag, 'srcset'),
    })
    if (Option.isNone(srcset)) continue
    links.push(
      Picture.preloadLink({
        type: Option.flatMap(source, tag => attributeOf(tag, 'type')),
        srcset: srcset.value,
        sizes: Option.getOrElse(attributeOf(img, 'sizes'), () => '100vw'),
      }),
    )
  }
  return links.join('')
}
