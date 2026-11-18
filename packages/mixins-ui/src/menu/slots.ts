import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * Menu is a nested Submodel: one `button`/`backdrop`/`items` group plus an
 * `item` per entry (and `group`/`heading`/`separator` where the caller
 * groups), so the resolver runs once per bundle and each base attribute
 * passes through by identity.
 *
 * The button owns `click` (and `pointerdown`/`keydown` while enabled); an
 * item owns `click` while interactive. A Behavior adding its own handler to
 * one of those is a conflict, not a second silent owner. Disabled buttons
 * and items publish no click, so the contract still lists it as allowed.
 */
export const MenuSlots = Slots.define({
  wrapper: Slot.make({ capability: Capability.Container }),
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.PointerDown, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaExpanded, Attr.Disabled, Attr.AriaDisabled],
  }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
  items: Slot.make({
    capability: Capability.Container,
    events: [Event.KeyDown, Event.PointerUp, Event.Blur],
    attributes: [Attr.Role],
  }),
  scroll: Slot.make({ capability: Capability.Container }),
  /** The `header` option's Html, in the panel above the rows: an account, a title. Not a row, so keys pass over it. */
  header: Slot.make({ capability: Capability.Container }),
  /** The `footer` option's Html, in the panel below the rows. */
  footer: Slot.make({ capability: Capability.Container }),
  item: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.Disabled, Attr.AriaDisabled],
  }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  heading: Slot.make({ capability: Capability.Container }),
  separator: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  rows: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  scrollBar: Slot.make({ capability: Capability.Container }),
  scrollThumb: Slot.make({ capability: Capability.Container }),
  /** A row's words, which `view` draws. */
  label: Slot.make({ capability: Capability.Container }),
  /**
   * A row's content, laid out as the row's own (`display: contents`); a
   * submenu row's says whether its submenu shows (`data-open`).
   */
  sub: Slot.make({ capability: Capability.Container }),
  /** The mark that a row opens a submenu. */
  chevron: Slot.make({ capability: Capability.Container }),
  /**
   * A checkbox or radio row's mark, before its words, with `data-kind` and
   * `data-checked`; every row of a menu holding one draws one, empty, so
   * the words line up.
   */
  check: Slot.make({ capability: Capability.Container }),
  /** The keys that run a row elsewhere, at its end, drawn as `Kbd.combo`. */
  shortcut: Slot.make({ capability: Capability.Container }),
  /** A row's picture, before its words. */
  icon: Slot.make({ capability: Capability.Container }),
  /** A row's quiet note at its end, before its shortcut: a count, a plan, a state. */
  hint: Slot.make({ capability: Capability.Container }),
})
