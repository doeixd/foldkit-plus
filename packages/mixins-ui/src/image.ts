import { Option, Schema } from 'effect'
import { SlotView, type NamedStyle } from 'foldkit-mixins'
import { Layout, Picture, type ImageAsset, type Provider } from 'foldkit-media'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import { imgAttributes } from './imageAttributes.js'
import { ImageSlots } from './image/slots.js'
import type { MixinList } from './resolve.js'

export { audit } from './image/audit.js'
export { ImageSlots } from './image/slots.js'
export { watchLoad } from './image/watchLoad.js'

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
export interface ImageView<Message = never, Asset extends ImageAsset = ImageAsset> {
  readonly asset: Asset
  /** Where its variants live: `Provider.hosted` takes only facts with a content hash. */
  readonly provider: Provider.Provider<NoInfer<Asset>>
  readonly layout: Layout.Layout
  /**
   * Required: an image either says something or is ornament, and the page
   * must say which: what it shows in words (as `described(text)`), or `decorative`.
   */
  readonly alt: string | Alt
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

export const view = <Message = never, Asset extends ImageAsset = ImageAsset>(
  options: ImageView<Message, Asset>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    ImageSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const alt = typeof options.alt === 'string' ? described(options.alt) : options.alt
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
          ...Alt.match(alt, {
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
            ...Alt.match(alt, {
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

/** What an Image is given once: its look and how it is laid out; the asset, provider and alt are each use's. */
export type ImagePreset = Pick<ImageView<never>, 'style' | 'layout' | 'sizes' | 'placeholder'> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Image: `base` for every use, `presets` chosen at a
 * use with `preset` (a hero, a thumbnail), and the call over both. `mixins`
 * such as `Image.watchLoad` are the application's to pass here, so a page
 * that never names one ships none.
 */
export const configure = <const Names extends string = never>(
  config: Presets<ImagePreset, Names>,
): {
  readonly view: <Outer, Asset extends ImageAsset = ImageAsset>(
    options: Omit<ImageView<Outer, Asset>, 'layout'> & {
      readonly layout?: Layout.Layout | undefined
    } & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => {
    const merged = layered(config, options)
    if (merged.layout === undefined) {
      throw new Error('Image.configure: a use needs a layout, from the call or a base or preset')
    }
    return view({ ...merged, layout: merged.layout }, h)
  },
})
