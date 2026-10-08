import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An alert publishes its regions as slots; it owns no state, messages, or
 * bundles. The tone comes from the recipe, the urgency from `assertive`:
 * an assertive alert interrupts (`role="alert"`), anything else reports
 * (`role="status"`).
 */
export const AlertSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  icon: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
})

/** A feedback family the alert can take. */
export type AlertTone = 'info' | 'success' | 'warning' | 'error'

/**
 * An alert in one call: what happened, what it means, an optional icon,
 * and how urgently it speaks. No upstream component stands behind it.
 */
export interface AlertView {
  readonly title: string
  readonly description?: string | undefined
  readonly icon?: Html | undefined
  readonly assertive?: boolean | undefined
  /** A style of `AlertSlots`, for the alert's look. */
  readonly style?: NamedStyle<typeof AlertSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: AlertView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    AlertSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(builders.root.attrs([h.Role(options.assertive === true ? 'alert' : 'status')]), [
    ...(options.icon === undefined ? [] : [h.div(builders.icon.attrs(), [options.icon])]),
    h.p(builders.title.attrs(), [options.title]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs(), [options.description])]),
  ])
}
