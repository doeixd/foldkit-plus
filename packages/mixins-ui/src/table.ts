import * as UiCheckbox from '@foldkit/ui/checkbox'
import { Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { FluidHover, fluidHovered } from 'foldkit-primitives/dom'
import * as Checkbox from './checkbox.js'
import type { MixinList } from './resolve.js'

/**
 * A presentational table: its regions are slots, and it owns no state. What
 * it draws (the sort, the rows chosen, the rows open) is the application's,
 * read from its Model; each press is a Message the application folds. That
 * is the boundary with `foldkit-data-grid`, which owns a grid's state:
 * filtering, reordering and resizing columns, editing cells, moving between
 * them with the keys, and virtualized rows belong there, not here.
 *
 * Drawn with `fluid`, it stands in a `frame` with one `highlight` behind the
 * rows, which follows the pointer to the nearest one: a highlight cannot be
 * a child of a `tbody`, so it is the frame's. An open row's detail and the
 * empty state are rows of their own, which the highlight passes over.
 */
export const TableSlots = Slots.define({
  frame: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  root: Slot.make({ capability: Capability.Container }),
  caption: Slot.make({ capability: Capability.Container }),
  head: Slot.make({ capability: Capability.Container }),
  headerRow: Slot.make({ capability: Capability.Container }),
  headerCell: Slot.make({ capability: Capability.Container }),
  /** The button a sortable heading is drawn as. */
  sortButton: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** The mark beside a sortable heading, turned by the header cell's `aria-sort`. */
  sortIcon: Slot.make({ capability: Capability.Container }),
  body: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  cell: Slot.make({ capability: Capability.Container }),
  /** The narrow cell holding a row's checkbox or its open button. */
  controlCell: Slot.make({ capability: Capability.Container }),
  /** A checkbox's name, for a screen reader alone. */
  checkboxLabel: Slot.make({ capability: Capability.Container }),
  expandButton: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaLabel],
  }),
  expandIcon: Slot.make({ capability: Capability.Container }),
  /** The row below an open row, holding its detail. */
  detailRow: Slot.make({ capability: Capability.Container }),
  detailCell: Slot.make({ capability: Capability.Container }),
  emptyRow: Slot.make({ capability: Capability.Container }),
  emptyCell: Slot.make({ capability: Capability.Container }),
})

/** One column: its heading, and each row's value for it. */
export interface TableColumn<Row> {
  readonly header: string
  /** Right-align values that read as numbers. */
  readonly numeric?: boolean | undefined
  readonly value: (row: Row) => string
  /** Makes the heading a button that sends `sort.onSort` with this key. */
  readonly sortKey?: string | undefined
}

/** The column the rows are sorted by, and which way. */
export interface TableSort {
  readonly column: string
  readonly direction: 'ascending' | 'descending'
}

/**
 * The sort after a press on `column`'s heading: ascending first, then
 * descending, then none. The rows are the application's to sort by it.
 */
export const nextSort = (
  sort: Option.Option<TableSort>,
  column: string,
): Option.Option<TableSort> =>
  Option.match(
    Option.filter(sort, current => current.column === column),
    {
      onNone: () => Option.some({ column, direction: 'ascending' as const }),
      onSome: current =>
        current.direction === 'ascending'
          ? Option.some({ column, direction: 'descending' as const })
          : Option.none(),
    },
  )

/** A checkbox on every row, the rows chosen being the application's. */
export interface TableSelection<Row, Message> {
  /** Prefixes the checkboxes' ids, unique on the page. */
  readonly id: string
  readonly isSelected: (row: Row) => boolean
  readonly onToggle: (row: Row, selected: boolean) => Message
  /** Sent by the heading's box: `true` to choose every row, `false` for none. */
  readonly onToggleAll: (selected: boolean) => Message
  /** A row's checkbox's name; default `"Select row"`. */
  readonly rowLabel?: ((row: Row) => string) | undefined
  /** The heading's checkbox's name; default `"Select all rows"`. */
  readonly allLabel?: string | undefined
  /** A style of `CheckboxSlots`, for the boxes' look. */
  readonly checkbox?: NamedStyle<typeof Checkbox.CheckboxSlots> | undefined
}

/** Rows that open on a press to show a detail below them. */
export interface TableExpansion<Row, Message> {
  /** Prefixes the details' ids, unique on the page. */
  readonly id: string
  readonly isExpanded: (row: Row) => boolean
  readonly onToggle: (row: Row, expanded: boolean) => Message
  readonly detail: (row: Row) => Html
  /** The open button's name; default `"Show details"`. */
  readonly label?: ((row: Row) => string) | undefined
}

/**
 * A plain table in one call: columns with per-row values, the rows, an
 * optional caption, a style for its slots, and mixins beside the style. No
 * upstream component stands behind it, except the checkboxes, which are
 * `@foldkit/ui`'s.
 */
export interface TableView<Row, Message = never> {
  readonly columns: ReadonlyArray<TableColumn<Row>>
  readonly rows: ReadonlyArray<Row>
  readonly caption?: string | undefined
  /** Each row's key, so a sorted row keeps its element; by default its place. */
  readonly rowKey?: ((row: Row) => string) | undefined
  /** The sort the rows are drawn in, and the Message a press on a sortable heading sends. */
  readonly sort?:
    | {
        readonly by: Option.Option<TableSort>
        readonly onSort: (column: string) => Message
      }
    | undefined
  /** A checkbox on every row, and one in the heading for all of them. */
  readonly selection?: TableSelection<Row, Message> | undefined
  readonly expansion?: TableExpansion<Row, Message> | undefined
  /** Drawn across the table while there are no rows: an `Empty.view`, say. */
  readonly empty?: Html | undefined
  /** A style of `TableSlots`, for the table's look. */
  readonly style?: NamedStyle<typeof TableSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
  /**
   * One highlight behind the body rows, following the pointer, and the lit
   * row marked `data-fluid-lit`. Off by default: its Mount sends no
   * Message, which a Scene test would have to resolve.
   */
  readonly fluid?: boolean | undefined
}

/** The name of the rows' highlight: its place is `--fk-table-hover-x`, `-y`, `-w`, `-h`. */
export const TABLE_HOVER = 'table-hover'

const hover = fluidHovered(TABLE_HOVER)

// Where the highlight rests until FluidHover first writes, so a page drawn
// without it reads defined values; the same each render, so none undoes a write.
const resting = {
  [hover.x]: '0px',
  [hover.y]: '0px',
  [hover.w]: '0px',
  [hover.h]: '0px',
  [hover.shown]: '0',
  [hover.moving]: '0',
}

// The detail and empty rows are not rows a reader picks out.
const dataRow = 'tbody > tr:not([data-detail], [data-empty])'

export const view = <Row, Message = never>(
  options: TableView<Row, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    TableSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { columns, rows, selection, expansion } = options
  const numeric = (column: TableColumn<Row>) =>
    column.numeric === true ? [h.DataAttribute('numeric', '')] : []
  const keyOf = (row: Row, index: number) => options.rowKey?.(row) ?? String(index)
  const span =
    columns.length + (selection === undefined ? 0 : 1) + (expansion === undefined ? 0 : 1)

  const checkbox = (
    id: string,
    label: string,
    state: { readonly checked: boolean; readonly indeterminate: boolean },
    onToggle: (checked: boolean) => Message,
    cell: 'th' | 'td',
  ) =>
    UiCheckbox.view(
      {
        id,
        isChecked: state.checked,
        isIndeterminate: state.indeterminate,
        onToggle,
        toView: Checkbox.toView(
          selection?.checkbox === undefined ? [] : [selection.checkbox.mixin],
          { h },
          resolved =>
            (cell === 'th' ? h.th : h.td)(builders.controlCell.attrs(), [
              h.button(resolved.checkbox, []),
              h.span(builders.checkboxLabel.attrs(resolved.label), [label]),
            ]),
        ),
      },
      h,
    )

  const heading = (column: TableColumn<Row>) => {
    if (column.sortKey === undefined || options.sort === undefined)
      return h.th(builders.headerCell.attrs([h.Scope('col'), ...numeric(column)]), [column.header])
    const key = column.sortKey
    const { onSort } = options.sort
    const direction = Option.match(
      Option.filter(options.sort.by, sort => sort.column === key),
      { onNone: () => [], onSome: sort => [h.AriaSort(sort.direction)] },
    )
    return h.th(builders.headerCell.attrs([h.Scope('col'), ...numeric(column), ...direction]), [
      h.button(builders.sortButton.attrs([h.Type('button'), h.OnClick(onSort(key))]), [
        column.header,
        h.span(builders.sortIcon.attrs([h.AriaHidden(true)]), []),
      ]),
    ])
  }

  const chosen = selection === undefined ? 0 : rows.filter(selection.isSelected).length
  const headerRow = h.tr(builders.headerRow.attrs(), [
    ...(expansion === undefined ? [] : [h.td(builders.controlCell.attrs(), [])]),
    ...(selection === undefined
      ? []
      : [
          checkbox(
            `${selection.id}-all`,
            selection.allLabel ?? 'Select all rows',
            {
              checked: rows.length > 0 && chosen === rows.length,
              indeterminate: chosen > 0 && chosen < rows.length,
            },
            selection.onToggleAll,
            'th',
          ),
        ]),
    ...columns.map(heading),
  ])

  const bodyRow = (row: Row, index: number): ReadonlyArray<Html> => {
    const key = keyOf(row, index)
    const selected = selection?.isSelected(row) === true
    const open = expansion?.isExpanded(row) === true
    const detailId = expansion === undefined ? '' : `${expansion.id}-${key}`
    const drawn = h.tr(
      builders.row.attrs([
        h.Key(key),
        ...(selected ? [h.DataAttribute('selected', '')] : []),
        ...(open ? [h.DataAttribute('expanded', '')] : []),
      ]),
      [
        ...(expansion === undefined
          ? []
          : [
              h.td(builders.controlCell.attrs(), [
                h.button(
                  builders.expandButton.attrs([
                    h.Type('button'),
                    h.AriaExpanded(open),
                    // Only while the detail is drawn is there an element to name.
                    ...(open ? [h.AriaControls(detailId)] : []),
                    h.AriaLabel(expansion.label?.(row) ?? 'Show details'),
                    h.OnClick(expansion.onToggle(row, !open)),
                  ]),
                  [h.span(builders.expandIcon.attrs([h.AriaHidden(true)]), [])],
                ),
              ]),
            ]),
        ...(selection === undefined
          ? []
          : [
              checkbox(
                `${selection.id}-${key}`,
                selection.rowLabel?.(row) ?? 'Select row',
                { checked: selected, indeterminate: false },
                checked => selection.onToggle(row, checked),
                'td',
              ),
            ]),
        ...columns.map(column => h.td(builders.cell.attrs(numeric(column)), [column.value(row)])),
      ],
    )
    if (!open || expansion === undefined) return [drawn]
    return [
      drawn,
      h.tr(
        builders.detailRow.attrs([
          h.Key(`${key}-detail`),
          h.Id(detailId),
          h.DataAttribute('detail', ''),
        ]),
        [h.td(builders.detailCell.attrs([h.Colspan(span)]), [expansion.detail(row)])],
      ),
    ]
  }

  const body =
    rows.length === 0 && options.empty !== undefined
      ? [
          h.tr(builders.emptyRow.attrs([h.DataAttribute('empty', '')]), [
            h.td(builders.emptyCell.attrs([h.Colspan(span)]), [options.empty]),
          ]),
        ]
      : rows.flatMap(bodyRow)

  const table = h.table(builders.root.attrs(), [
    ...(options.caption === undefined
      ? []
      : [h.caption(builders.caption.attrs(), [options.caption])]),
    h.thead(builders.head.attrs(), [headerRow]),
    h.tbody(builders.body.attrs(), body),
  ])
  return options.fluid === true
    ? h.div(
        builders.frame.attrs([
          h.Style(resting),
          h.OnMount(FluidHover({ name: TABLE_HOVER, item: dataRow, axis: 'y', gapClick: false })),
        ]),
        [h.div(builders.highlight.attrs([h.AriaHidden(true)]), []), table],
      )
    : table
}
