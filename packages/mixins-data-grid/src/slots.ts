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
const AriaHasPopup = Attr.make('aria-haspopup')

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
    events: [Event.Input, Event.KeyDown, Event.Blur],
    protected: { events: [Event.Input, Event.KeyDown, Event.Blur] },
  }),
  /**
   * Why the column refused a draft, shown below the field while the edit
   * lasts; the field names it with `aria-describedby`.
   */
  editorError: Slot.make({ capability: Capability.Base }),
  /**
   * The editor of a column whose schema's text is one of a few literals,
   * drawn in place of the cell's content while the edit lasts, like
   * `editor`: a `role="combobox"` showing the draft, its options in
   * `choiceList` (or, with `choiceEditor: 'native'`, a `select`).
   */
  choice: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Change, Event.KeyDown, Event.Blur],
    protected: {
      events: [Event.Change, Event.KeyDown, Event.Blur],
      attributes: [Attr.Role, Tabindex, AriaActiveDescendant],
    },
  }),
  /**
   * A choice's options, `role="listbox"`, below the cell, or above it when
   * the cell is low in the view (`data-place="above"`).
   */
  choiceList: Slot.make({
    capability: Capability.Base,
    protected: { attributes: [Attr.Role, Id], style: ['position'] },
  }),
  /** One literal a `choice` offers: `role="option"`, `aria-selected` on the draft. */
  choiceOption: Slot.make({
    capability: Capability.Base,
    events: [Event.Click],
    protected: { events: [Event.Click], attributes: [Attr.Role, Id] },
  }),
  /** Said in place of rows when there are none: empty, loading, or failed. */
  status: Slot.make({ capability: Capability.Base }),
  /**
   * The button on a column's header that opens its menu, when the view is
   * given `columnMenu`: `aria-haspopup="menu"` and `aria-expanded`, out of
   * the tab order like the grid's other controls.
   */
  menuButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
    protected: { events: [Event.Click], attributes: [AriaHasPopup, Attr.AriaExpanded, Tabindex] },
  }),
  /**
   * A column's open menu, below its header: a `role="menu"` that takes focus
   * and points at its active item with `aria-activedescendant`, as the grid
   * points at its cell. Focus leaving it closes it.
   */
  menu: Slot.make({
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    protected: {
      events: [Event.KeyDown],
      attributes: [Attr.Role, Tabindex, AriaActiveDescendant],
      style: ['position'],
    },
  }),
  /** One of a menu's items; `data-active` marks the one the keyboard is on. */
  menuItem: Slot.make({
    capability: Capability.Base,
    events: [Event.Click],
    protected: { events: [Event.Click], attributes: [Attr.Role, Id] },
  }),
  /**
   * The button on a sortable column's header: a click sends its sort Message.
   * `data-sort` is `asc` or `desc` while the column is sorted.
   */
  sort: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** Below the rows: a failure that left them on screen, and the More button. */
  footer: Slot.make({ capability: Capability.Container }),
  retry: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  more: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})
