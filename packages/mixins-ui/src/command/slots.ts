import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * A command menu, shadcn's Command and Fluid Functionalism's CommandMenu: a
 * search field that keeps focus while the keys move through the rows and
 * points at the highlighted one through `aria-activedescendant`, over a list
 * of grouped rows. (A press on a row runs it; foldkit has no default-preventing
 * mousedown to keep the field focused through the press, so a menu that stays
 * open after a pressed row refocuses its field in the Command `onRun` starts.) ↑ and ↓
 * wrap through the enabled rows, Enter runs the highlighted one, a press
 * runs the one pressed, and the pointer moves the highlight. Rows never
 * re-sort as the query grows, so nothing moves under the pointer; whenever
 * the highlighted row is filtered away, the first enabled row takes it, so
 * Enter always has a target. The query, the highlighted value and the page
 * are the application's; `filtered` is what the view shows for a query.
 *
 * Nested pages are the application's too: a row that `opensPage` steps in
 * when run (the application pushes the page and clears the query), and
 * Backspace in an empty field sends `page.onBack`. In a dialog, `hotkey`
 * opens it on ⌘K or Ctrl+K, and the Dialog component draws it: the field,
 * the first thing in the panel that takes focus, has it when it opens.
 */
export const CommandSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The row of the field, after the page's crumbs. */
  search: Slot.make({ capability: Capability.Container }),
  /** The trail of pages stepped into, before the field, and each page's name. */
  crumbs: Slot.make({ capability: Capability.Container }),
  crumb: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaExpanded],
  }),
  list: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  group: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  heading: Slot.make({ capability: Capability.Container }),
  item: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.AriaDisabled],
  }),
  /** A row's picture, before its words, hidden from assistive technology. */
  icon: Slot.make({ capability: Capability.Container }),
  /** A row's words: its `label` and, below it, its `description`. */
  text: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /** The keys that run a row elsewhere, at its end, drawn as `Kbd.combo`. */
  shortcut: Slot.make({ capability: Capability.Container }),
  /** The mark that a row opens a page. */
  chevron: Slot.make({ capability: Capability.Container }),
  /** What the list says while it is loading or when nothing matches: a polite live region. */
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  empty: Slot.make({ capability: Capability.Container }),
  loading: Slot.make({ capability: Capability.Container }),
  /** The box around the list that holds its overlay `bar`, which `overlayBars` drives, and the bar's `thumb`. */
  frame: Slot.make({ capability: Capability.Container }),
  bar: Slot.make({ capability: Capability.Container }),
  thumb: Slot.make({ capability: Capability.Container }),
  /** The strip under the list naming the keys, and each `hint` in it. */
  footer: Slot.make({ capability: Capability.Container }),
  hint: Slot.make({ capability: Capability.Container }),
})
