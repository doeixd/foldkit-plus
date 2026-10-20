import { Option, Schema } from 'effect'
import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { Layout, Picture, type ImageAsset, type Provider } from 'foldkit-media'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An image publishes its frame (a `picture`), a `source` per format, and the
 * `img`; it owns no
 * state or messages, and the browser owns loading and which candidate to
 * fetch. The `img` carries the original's ratio as `--fk-image-ratio` and the
 * placeholder's background as `--fk-image-placeholder`, and `data-layout`
 * (`fixed`, `constrained`, `full`). A frame whose provider has no URL for the
 * image is drawn empty, marked `data-unavailable`.
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
  })
  return Option.match(picture, {
    onNone: () => h.picture(builders.frame.attrs([h.DataAttribute('unavailable', '')]), []),
    onSome: ({ sources, img, ratio, placeholder }) =>
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
            h.Loading(img.loading),
            ...Option.match(img.decoding, {
              onNone: () => [],
              onSome: value => [h.Decoding(value)],
            }),
            ...Option.match(img.fetchPriority, {
              onNone: () => [],
              onSome: value => [h.Fetchpriority(value)],
            }),
            h.Sizes(img.sizes),
            h.Srcset(img.srcset),
            h.Src(img.src),
            h.Width(String(img.width)),
            h.Height(String(img.height)),
            ...Alt.match(options.alt, {
              Described: ({ text }) => [h.Alt(text)],
              Decorative: () => [h.Alt(''), h.Role('presentation')],
            }),
            h.DataAttribute('layout', layoutName(options.layout)),
            h.Style({
              '--fk-image-ratio': ratio,
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
