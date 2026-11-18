import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/** The panel's pieces: a header (drag trigger and controls), the body, and the edges and corners that resize it. */
export const FloatingPanelSlots = Slots.define({
  /** Around the panel and its measure; drawn as no box. */
  root: Slot.make({ capability: Capability.Container }),
  /** A box the viewport's size that `Bounds` measures; never seen. */
  boundary: Slot.make({ capability: Capability.Container }),
  panel: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown, Event.PointerDown, Event.Focus],
    attributes: [Attr.Role],
  }),
  /** The bar along the top: the drag trigger and the controls. */
  header: Slot.make({ capability: Capability.Container }),
  /**
   * The part of the header a drag moves the panel by, and the arrows from
   * focus: apart from the controls, whose presses a captured drag would take.
   */
  dragTrigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown, Event.PointerDown],
    attributes: [Attr.AriaLabel],
  }),
  title: Slot.make({ capability: Capability.Container }),
  controls: Slot.make({ capability: Capability.Container }),
  minimize: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  maximize: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  restore: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  close: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  body: Slot.make({ capability: Capability.Container }),
  /** An edge or corner a drag resizes from, named by `data-edge`; the bottom-end corner takes the arrows too. */
  handle: Slot.make({
    capability: Capability.Interactive,
    events: [Event.KeyDown],
    attributes: [Attr.AriaLabel],
  }),
})
