import { Attr, Capability, Slot, Slots } from 'foldkit-mixins'

/**
 * The `viewport` scrolls; the `root` around it holds an overlay `bar` per
 * axis, each with its `thumb`, which `overlayBars` drives.
 */
export const ScrollAreaSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  viewport: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabel],
  }),
  bar: Slot.make({ capability: Capability.Container }),
  thumb: Slot.make({ capability: Capability.Container }),
})
