import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/** A tour's pieces: the layer with its dim and cutout, and the step's panel. */
export const TourSlots = Slots.define({
  /** The box in the top layer holding the dim, the cutout and the step. */
  layer: Slot.make({ capability: Capability.Container }),
  /** Over the page around the cutout, taking presses outside it. */
  blocker: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  /** The ring over the target, whose shadow dims the rest of the page. */
  spotlight: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.Role],
  }),
  arrow: Slot.make({ capability: Capability.Container }),
  /** The step's place, `2 of 5`. */
  progress: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  back: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  next: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  skip: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})
