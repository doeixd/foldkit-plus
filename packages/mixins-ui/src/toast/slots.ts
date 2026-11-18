import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * Toast is a nested Submodel: one live-region `container` plus an `entry`
 * per toast. The resolver runs once per bundle and each base attribute
 * passes through by identity.
 *
 * Entries own hover and (when swipe is configured) pointer handlers, none
 * of which has an Event token — but the resolver still refuses a second
 * owner by event name. The dismiss control is drawn by the consumer's
 * `entryToView` and is not a slot: its `dismiss` bundle passes through
 * inside the entry's content.
 *
 * The component draws the rest: the stack's `list`, each toast's `icon`,
 * its `body` (`title` and `description`, where a swipe starts), its
 * `actions` (each `action` button, then the `cancel` one) and `close`
 * button, and the `status` and `alert` live regions.
 */
export const ToastSlots = Slots.define({
  container: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role],
  }),
  entry: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role],
  }),
  list: Slot.make({ capability: Capability.Container }),
  /** The type's mark, with `data-type`, hidden from assistive technology. */
  icon: Slot.make({ capability: Capability.Container }),
  body: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /** The row holding a toast's `action` buttons and its `cancel`, drawn when it has any. */
  actions: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** A button that only dismisses the toast, in the `actions` row after the actions. */
  cancel: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  close: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  alert: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})
