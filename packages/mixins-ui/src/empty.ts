import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An empty state publishes its regions as slots; it owns no state,
 * messages, or bundles. It says what is not here, why that is fine, and
 * what creates the first one.
 */
export const EmptySlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  icon: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Container }),
})

/**
 * An empty state in one call: the title it always has, the regions it
 * earns, a style for its slots, and mixins beside the style. No upstream
 * component stands behind it.
 */
export interface EmptyView {
  readonly title: string
  readonly description?: string | undefined
  readonly icon?: Html | undefined
  readonly action?: Html | undefined
  /** A style of `EmptySlots`, for the empty state's look. */
  readonly style?: NamedStyle<typeof EmptySlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: EmptyView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    EmptySlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(builders.root.attrs(), [
    ...(options.icon === undefined ? [] : [h.div(builders.icon.attrs(), [options.icon])]),
    h.p(builders.title.attrs(), [options.title]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs(), [options.description])]),
    ...(options.action === undefined ? [] : [h.div(builders.action.attrs(), [options.action])]),
  ])
}
