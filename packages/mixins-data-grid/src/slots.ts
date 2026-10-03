import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

const AriaRowCount = Attr.make('aria-rowcount')
const AriaColCount = Attr.make('aria-colcount')
const AriaRowIndex = Attr.make('aria-rowindex')
const AriaColIndex = Attr.make('aria-colindex')
const AriaActiveDescendant = Attr.make('aria-activedescendant')
const Tabindex = Attr.make('tabindex')
const Id = Attr.make('id')
const MouseDown = Event.make('mousedown')

// What the virtual window is worked out from: a Style that changed one of
// these would draw rows where the window math does not think they are.
const geometry = [
  'boxSizing',
  'width',
  'height',
  'minWidth',
  'maxWidth',
  'flex',
  'position',
  'insetInlineStart',
  'insetInlineEnd',
  'top',
]

export const GridSlots = Slots.define({
  /** The scroll container: `role="grid"`, the one tab stop, and the keyboard. */
  root: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel, AriaRowCount, AriaColCount, AriaActiveDescendant],
    protected: {
      events: [Event.KeyDown],
      attributes: [Attr.Role, Tabindex, Id, AriaRowCount, AriaColCount, AriaActiveDescendant],
      style: ['overflow', 'position'],
    },
  }),
  /** The header row's group; it stays at the top while the body scrolls. */
  header: Slot.make({
    capability: Capability.Container,
    protected: { attributes: [Attr.Role], style: ['position', 'top'] },
  }),
  headerRow: Slot.make({
    capability: Capability.Container,
    protected: { attributes: [Attr.Role, AriaRowIndex], style: geometry },
  }),
  /** One per drawn column; `--fk-grid-pinned` says `start`, `end` or nothing. */
  headerCell: Slot.make({
    capability: Capability.Base,
    protected: { attributes: [Attr.Role, AriaColIndex], style: geometry },
  }),
  body: Slot.make({
    capability: Capability.Container,
    protected: { attributes: [Attr.Role], style: geometry },
  }),
  /** One per drawn row; `aria-rowindex` is its place among every row, drawn or not. */
  row: Slot.make({
    capability: Capability.Container,
    protected: { attributes: [Attr.Role, AriaRowIndex], style: geometry },
  }),
  /** One per drawn cell; `data-focused` marks the current one, `data-pinned` a pinned one. */
  cell: Slot.make({
    capability: Capability.Base,
    events: [MouseDown],
    protected: {
      events: [MouseDown],
      attributes: [Attr.Role, Id, AriaColIndex],
      style: geometry,
    },
  }),
  /** A row counted but not loaded yet, drawn at its height for a skeleton to style. */
  placeholder: Slot.make({
    capability: Capability.Base,
    protected: { style: ['height', 'width'] },
  }),
  /** Said in place of rows when there are none. */
  status: Slot.make({ capability: Capability.Base }),
})
