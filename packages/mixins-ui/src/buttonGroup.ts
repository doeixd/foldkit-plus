import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A button group publishes one slot; it owns no state, messages, or bundles.
 * The buttons stay the caller's (their labels, styles, and Messages), drawn
 * as the group's children; the group owns only the join. It is `role="group"`
 * with a name, not a segmented control: no option is pressed, nothing
 * selects, and arrow keys stay out of it (see `Segmented` for that).
 */
export const ButtonGroupSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
})

/**
 * A button group in one call: its name, its buttons, a style for its slot,
 * and mixins beside the style. No upstream component stands behind it.
 */
export interface ButtonGroupView {
  /** What the group is for, read as its accessible name. */
  readonly label: string
  readonly items: ReadonlyArray<Html>
  /** A style of `ButtonGroupSlots`, for the group's look. */
  readonly style?: NamedStyle<typeof ButtonGroupSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: ButtonGroupView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    ButtonGroupSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.div(builders.root.attrs([h.Role('group'), h.AriaLabel(options.label)]), [
    ...options.items,
  ])
}
