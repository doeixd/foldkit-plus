import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A keyboard key publishes one slot; it owns no state, messages, or
 * bundles. It names the key to press, never an action: pair it with words.
 */
export const KbdSlots = Slots.define({
  key: Slot.make({ capability: Capability.Container }),
})

/**
 * A key in one call: the key it names, a style for its slot, and mixins
 * beside the style. No upstream component stands behind it.
 */
export interface KbdView {
  readonly key: string
  /** A style of `KbdSlots`, for the key's look. */
  readonly style?: NamedStyle<typeof KbdSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = (options: KbdView, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    KbdSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.kbd(builders.key.attrs(), [options.key])
}
