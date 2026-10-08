import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A card publishes its regions as slots; it owns no state, messages, or
 * bundles. Draw the parts the card has and skip the rest: a bare card is a
 * root with content, a full one adds a header, a footer, and an action.
 */
export const CardSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
  footer: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Container }),
})

/**
 * A card in one call: the content it always has, the regions it earns, a
 * style for its slots, and mixins beside the style. No upstream component
 * stands behind it; this is the whole implementation.
 */
export interface CardView {
  readonly content: Html
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly footer?: Html | undefined
  readonly action?: Html | undefined
  /** A style of `CardSlots`, for the card's look. */
  readonly style?: NamedStyle<typeof CardSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: CardView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    CardSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(builders.root.attrs(), [
    ...(options.title === undefined && options.description === undefined
      ? []
      : [
          h.div(builders.header.attrs(), [
            ...(options.title === undefined ? [] : [h.h3(builders.title.attrs(), [options.title])]),
            ...(options.description === undefined
              ? []
              : [h.p(builders.description.attrs(), [options.description])]),
          ]),
        ]),
    h.div(builders.content.attrs(), [options.content]),
    ...(options.footer === undefined && options.action === undefined
      ? []
      : [
          h.div(builders.footer.attrs(), [
            ...(options.footer === undefined ? [] : [options.footer]),
            ...(options.action === undefined
              ? []
              : [h.div(builders.action.attrs(), [options.action])]),
          ]),
        ]),
  ])
}
