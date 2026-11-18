import { Capability, Slot, Slots } from 'foldkit-mixins'

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
