import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'

const AriaRowCount = Attr.make('aria-rowcount')
const AriaColCount = Attr.make('aria-colcount')
const AriaRowIndex = Attr.make('aria-rowindex')
const AriaColIndex = Attr.make('aria-colindex')
const AriaActiveDescendant = Attr.make('aria-activedescendant')
const Tabindex = Attr.make('tabindex')
const AriaValueNow = Attr.make('aria-valuenow')
const AriaValueMin = Attr.make('aria-valuemin')
const AriaValueMax = Attr.make('aria-valuemax')
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
  /**
   * One per drawn column. `data-pinned` is `start` or `end` on a pinned
   * column; while a header is dragged it has `data-dragging` and follows the
   * pointer by a `transform`, and the shown neighbour it would land beside
   * has `data-drop`, `before` or `after`.
   */
  headerCell: Slot.make({
    capability: Capability.Base,
    protected: { attributes: [Attr.Role, AriaColIndex], style: [...geometry, 'transform'] },
  }),
  /**
   * A column's resize handle at its end edge: a `role="separator"` with its
   * width as `aria-valuenow`, dragged with the pointer, or stepped with the
   * arrow keys once focused. It is out of the tab order, so the grid stays
   * one tab stop. Only resizable columns have one.
   */
  resizeHandle: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    protected: {
      events: [Event.KeyDown],
      attributes: [Attr.Role, Tabindex, AriaValueNow, AriaValueMin, AriaValueMax],
      style: ['position', 'insetInlineEnd', 'top', 'bottom'],
    },
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
  /**
   * The text field a cell is edited in, drawn in place of its content while
   * the edit lasts; `aria-invalid` when the column refused the draft.
   */
  editor: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.KeyDown],
    protected: { events: [Event.Input, Event.KeyDown] },
  }),
  /** Said in place of rows when there are none: empty, loading, or failed. */
  status: Slot.make({ capability: Capability.Base }),
  /** The button on a sortable column's header: a click sends its sort Message. */
  sort: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** Below the rows: a failure that left them on screen, and the More button. */
  footer: Slot.make({ capability: Capability.Container }),
  retry: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  more: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})
