import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * Dialog is a Submodel: each published bundle is a `ChildAttribute` group that
 * carries the dialog boundary's dispatcher. The resolver treats those as opaque
 * and preserves their identity, so spreading a resolved bundle into the parent's
 * markup keeps routing through the dialog's `toParentMessage`.
 *
 * `dialog` owns `cancel` (the native Escape handler); `backdrop` and
 * `closeButton` own `click`. A Behavior adding its own handler to one of those
 * is a conflict, not a second silent owner.
 *
 * `body`, `scroll`, `scrollBar`, `scrollThumb` and `footer` are this
 * package's, with no upstream bundle: a panel taller than the viewport
 * scrolls its `scroll` (inside `body`, between the title and the footer)
 * while the title and the `footer`'s answers stay in view. `overlayBars`
 * draws the overlay bar, `scrollBar` with its `scrollThumb`, inside `body`.
 */
export const DialogSlots = Slots.define({
  dialog: Slot.make({
    capability: Capability.Container,
    events: [Event.Cancel],
    attributes: [Attr.AriaDescribedby],
  }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  panel: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  initialFocus: Slot.make({ capability: Capability.Focusable }),
  closeButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled],
  }),
  /**
   * The Sheet's grabber, drawn in the panel: this package's, with no upstream
   * bundle, and hidden from assistive technology unless the Sheet has more than
   * one point, when it is a separator the arrow keys move. Draw it in a Sheet's
   * panel only: the Sheet recipe hides it unless `handle: 'bar'`.
   */
  handle: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, Attr.AriaValuenow],
  }),
  /** The part between the heading and the footer, holding `scroll` and its bar. */
  body: Slot.make({ capability: Capability.Container }),
  /** What scrolls when the panel would outgrow the viewport. */
  scroll: Slot.make({ capability: Capability.Container }),
  scrollBar: Slot.make({ capability: Capability.Container }),
  scrollThumb: Slot.make({ capability: Capability.Container }),
  /** The answers, below `body`, in view however far it scrolls. */
  footer: Slot.make({ capability: Capability.Container }),
})
