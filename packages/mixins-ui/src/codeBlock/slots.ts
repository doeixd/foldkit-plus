import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

/**
 * A code block publishes its regions as slots, down to each line and each
 * highlighted token; it owns no state. Highlighting is the caller's: pass the
 * tokens a tokenizer found (`foldkit-richtext-code`, `foldkit-richtext-code-shiki`)
 * and each is drawn with its `kind` as `data-kind`, which the recipe colors
 * from the theme's `syntax` group.
 */
export const CodeBlockSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  header: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  copy: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** Always drawn, so it is in place before it speaks: says `words.copied` once copied. */
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  body: Slot.make({ capability: Capability.Container }),
  code: Slot.make({ capability: Capability.Container }),
  line: Slot.make({ capability: Capability.Container }),
  /**
   * The start of a line: its number or `gutter` text, drawn by the recipe from
   * `data-number` so it stays out of the text; a button under `onLineSelect`.
   */
  gutter: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.AriaPressed],
  }),
  token: Slot.make({ capability: Capability.Container }),
  /** What `lineAction` draws at a line's end. */
  lineAction: Slot.make({ capability: Capability.Container }),
  /** Under a `collapsed` block, the button that asks for the rest. */
  expand: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
})
