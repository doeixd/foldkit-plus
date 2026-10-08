import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An item publishes its regions as slots; it owns no state, messages, or
 * bundles. It is the common visual language for a row of anything: a menu
 * option, a command, a notification, a file, a contact. Draw the parts the
 * row has and skip the rest.
 */
export const ItemSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  media: Slot.make({ capability: Capability.Container }),
  content: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
})

/**
 * A row in one call: the content it always has, the regions it earns, a
 * style for its slots, and mixins beside the style. No upstream component
 * stands behind it.
 */
export interface ItemView {
  readonly content: Html
  readonly media?: Html | undefined
  readonly title?: string | undefined
  readonly description?: string | undefined
  readonly actions?: Html | undefined
  /** A style of `ItemSlots`, for the row's look. */
  readonly style?: NamedStyle<typeof ItemSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: ItemView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    ItemSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(builders.root.attrs(), [
    ...(options.media === undefined ? [] : [h.div(builders.media.attrs(), [options.media])]),
    h.div(builders.content.attrs(), [
      ...(options.title === undefined ? [] : [h.div(builders.title.attrs(), [options.title])]),
      ...(options.description === undefined
        ? []
        : [h.div(builders.description.attrs(), [options.description])]),
      options.content,
    ]),
    ...(options.actions === undefined ? [] : [h.div(builders.actions.attrs(), [options.actions])]),
  ])
}
