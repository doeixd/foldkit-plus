import { Option } from 'effect'
import {
  Attr,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotAttributes,
} from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { FluidHover } from 'foldkit-primitives/dom'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'
import { wordsOf } from './words.js'

export { fluid, TABLE_HOVER } from './table/fluid.js'
export { checkboxes } from './table/checkboxes.js'

/**
 * A presentational table: its regions are slots, and it owns no state. What
 * it draws (the sort, the rows chosen, the rows open) is the application's,
 * read from its Model; each press is a Message the application folds. That
 * is the boundary with `foldkit-data-grid`, which owns a grid's state:
 * filtering, reordering and resizing columns, editing cells, moving between
 * them with the keys, and virtualized rows belong there, not here.
 *
 * It stands in a `frame`, which the recipe scrolls sideways when the table is wider than
 * the screen. Drawn with `fluid`, the frame holds one `highlight` behind the rows, which
 * follows the pointer to the nearest one: a highlight cannot be a child of a `tbody`, so it
 * is the frame's. An open row's detail and the
 * empty state are rows of their own, which the highlight passes over.
 */
export const TableSlots = Slots.define({
  frame: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
  root: Slot.make({ capability: Capability.Container }),
  caption: Slot.make({ capability: Capability.Container }),
  head: Slot.make({ capability: Capability.Container }),
  headerRow: Slot.make({ capability: Capability.Container }),
  /** The totals row, drawn after the body while a column has a `footer`. */
  foot: Slot.make({ capability: Capability.Container }),
  footerRow: Slot.make({ capability: Capability.Container }),
  footerCell: Slot.make({ capability: Capability.Container }),
  /** A column heading; a sortable one carries `aria-sort` while it sorts the rows. */
  headerCell: Slot.make({ capability: Capability.Container, attributes: [Attr.AriaSort] }),
  /** The button a sortable heading is drawn as. */
  sortButton: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** The mark beside a sortable heading, turned by the header cell's `aria-sort`. */
  sortIcon: Slot.make({ capability: Capability.Container }),
  body: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  cell: Slot.make({ capability: Capability.Container }),
  /** A control the application draws in a cell, marked a `FocusRecovery` part so a re-sort keeps its focus. */
  control: Slot.make({ capability: Capability.Container }),
  /** The narrow cell holding a row's checkbox or its open button. */
  controlCell: Slot.make({ capability: Capability.Container }),
  /** A name drawn for a screen reader alone: a checkbox's, or the expansion column's. */
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

/** One column: its heading, and each row's cell for it. `Key` is the type of its `sortKey`. */
export interface TableColumn<Row, Key extends string = string> {
  /** The heading: text, or markup for an icon beside it. */
  readonly header: string | Html
  /** Drawn under the column in a totals row: a sum, a count, a note. */
  readonly footer?: string | Html | undefined
  /** Right-align values that read as numbers. */
  readonly numeric?: boolean | undefined
  /** The cell's content: text, or markup for a link, a badge or an avatar. */
  readonly value: (row: Row) => Html | string
  /** Draws the cell as the row's heading (`th scope="row"`), so a screen reader names a row by it. */
  readonly rowHeader?: boolean | undefined
  /** Makes the heading a button that sends `sort.onSort` with this key. */
  readonly sortKey?: Key | undefined
}

/** The column the rows are sorted by, and which way. */
export interface TableSort<Key extends string = string> {
  readonly column: Key
  readonly direction: 'ascending' | 'descending'
}

/**
 * The sort after a press on `column`'s heading: ascending first, then
 * descending, then none. The rows are the application's to sort by it.
 */
export const nextSort = <Key extends string>(
  sort: Option.Option<TableSort<Key>>,
  column: Key,
): Option.Option<TableSort<Key>> =>
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
  /** A row's checkbox's name, from the row; default `words.selectRow`. */
  readonly rowLabel?: ((row: Row) => string) | undefined
  /** How a box is drawn: `Table.checkboxes()`. A page that selects nothing never imports Checkbox. */
  readonly control: TableSelectionControl
}

/** What a selection control is given to draw: one box, in the cell the table places it in. */
export interface TableSelectionInput<Message> {
  readonly id: string
  /** The box's accessible name. */
  readonly label: string
  readonly checked: boolean
  readonly indeterminate: boolean
  readonly onToggle: (checked: boolean) => Message
  /** `th` in the heading row, `td` in a row. */
  readonly cell: 'th' | 'td'
  /** The `controlCell` and `checkboxLabel` slots' attributes, for the cell and the name a screen reader reads. */
  readonly cellAttributes: (extra?: SlotAttributes<Message>) => SlotAttributes<Message>
  readonly labelAttributes: (extra?: SlotAttributes<Message>) => SlotAttributes<Message>
}

/**
 * Draws a row's selection box; `Table.checkboxes()` is the one shipped, and
 * one of your own (a radio, a switch) is an object with this `draw`.
 */
export interface TableSelectionControl {
  readonly draw: <Message>(input: TableSelectionInput<Message>, h: HtmlBuilder<Message>) => Html
}

/**
 * One highlight behind the body rows, following the pointer: `Table.fluid`.
 * `resting` is what the frame's custom properties hold until the Mount first
 * writes them, and `mount` is that Mount, which sends no Message.
 */
export interface TableFluid {
  readonly resting: Readonly<Record<string, string>>
  readonly mount: () => ReturnType<typeof FluidHover>
}

/** The text a table draws that is not a use's content. */
export interface TableWords {
  /** A row's selection box's name, where `selection.rowLabel` gives none. */
  readonly selectRow: string
  /** The heading box's name. */
  readonly selectAll: string
  /** The expansion column's heading, read by a screen reader alone. */
  readonly details: string
  /** An open button's name, where `expansion.label` gives none. */
  readonly showDetails: string
}

/** The words a table starts from; `words` overrides them one at a time. */
export const words: TableWords = {
  selectRow: 'Select row',
  selectAll: 'Select all rows',
  details: 'Details',
  showDetails: 'Show details',
}

/** Rows that open on a press to show a detail below them. */
export interface TableExpansion<Row, Message> {
  /** Prefixes the details' ids, unique on the page. */
  readonly id: string
  readonly isExpanded: (row: Row) => boolean
  readonly onToggle: (row: Row, expanded: boolean) => Message
  readonly detail: (row: Row) => Html
  /** The open button's name, from the row; default `words.showDetails`. */
  readonly label?: ((row: Row) => string) | undefined
}

/**
 * A plain table in one call: columns with per-row values, the rows, an
 * optional caption, a style for its slots, and mixins beside the style. No
 * upstream component stands behind it.
 */
export interface TableView<Row, Message = never, Key extends string = string> {
  readonly columns: ReadonlyArray<TableColumn<Row, Key>>
  readonly rows: ReadonlyArray<Row>
  readonly caption?: string | undefined
  /** Each row's key, so a sorted row keeps its element; by default its place. */
  readonly rowKey?: ((row: Row) => string) | undefined
  /** The sort the rows are drawn in, and the Message a press on a sortable heading sends. */
  readonly sort?:
    | {
        readonly by: Option.Option<TableSort<Key>>
        readonly onSort: (column: Key) => Message
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
   * row marked `data-fluid-lit`: `Table.fluid`. Without it the table draws
   * none and ships none of it; its Mount sends no Message, which a Scene test
   * would have to resolve.
   */
  readonly fluid?: TableFluid | undefined
  /** The table's text, over `Table.words`. */
  readonly words?: Partial<TableWords> | undefined
}

/**
 * Columns written once and used by name: `Table.defineColumns<Row>()([...])` keeps each `sortKey` as the
 * literal it was written, so `sort.onSort` receives `'name' | 'role'` and not `string`. Columns
 * written inline in `Table.view` need no helper.
 */
export const defineColumns =
  <Row>() =>
  <const Columns extends ReadonlyArray<TableColumn<Row>>>(each: Columns): NoInfer<Columns> =>
    each

export const view = <Row, Message = never, Key extends string = string>(
  options: TableView<Row, Message, Key>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    TableSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { columns, rows, selection, expansion } = options
  const text = wordsOf(words, options.words)
  const numeric = (column: TableColumn<Row, Key>) =>
    column.numeric === true ? [h.DataAttribute('numeric', '')] : []
  const keyOf = (row: Row, index: number) => options.rowKey?.(row) ?? String(index)
  const span =
    columns.length + (selection === undefined ? 0 : 1) + (expansion === undefined ? 0 : 1)

  const checkbox = (
    selected: NonNullable<typeof selection>,
    input: Pick<
      TableSelectionInput<Message>,
      'id' | 'label' | 'checked' | 'indeterminate' | 'onToggle' | 'cell'
    >,
  ) =>
    selected.control.draw(
      {
        ...input,
        cellAttributes: extra => builders.controlCell.attrs(extra),
        labelAttributes: extra => builders.checkboxLabel.attrs(extra),
      },
      h,
    )

  const heading = (column: TableColumn<Row, Key>) => {
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
    ...(expansion === undefined
      ? []
      : [
          h.th(builders.controlCell.attrs([h.Scope('col')]), [
            h.span(builders.checkboxLabel.attrs(), [text.details]),
          ]),
        ]),
    ...(selection === undefined
      ? []
      : [
          checkbox(selection, {
            id: `${selection.id}-all`,
            label: text.selectAll,
            checked: rows.length > 0 && chosen === rows.length,
            indeterminate: chosen > 0 && chosen < rows.length,
            onToggle: selection.onToggleAll,
            cell: 'th',
          }),
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
                    h.AriaLabel(expansion.label?.(row) ?? text.showDetails),
                    h.OnClick(expansion.onToggle(row, !open)),
                  ]),
                  [h.span(builders.expandIcon.attrs([h.AriaHidden(true)]), [])],
                ),
              ]),
            ]),
        ...(selection === undefined
          ? []
          : [
              checkbox(selection, {
                id: `${selection.id}-${key}`,
                label: selection.rowLabel?.(row) ?? text.selectRow,
                checked: selected,
                indeterminate: false,
                onToggle: checked => selection.onToggle(row, checked),
                cell: 'td',
              }),
            ]),
        ...columns.map(column =>
          column.rowHeader === true
            ? h.th(builders.cell.attrs([h.Scope('row'), ...numeric(column)]), [column.value(row)])
            : h.td(builders.cell.attrs(numeric(column)), [column.value(row)]),
        ),
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
    ...(columns.some(column => column.footer !== undefined)
      ? [
          h.tfoot(builders.foot.attrs(), [
            h.tr(builders.footerRow.attrs(), [
              ...Array.from({ length: span - columns.length }, (_, place) =>
                h.td(builders.footerCell.attrs([h.Key(`lead-${place}`)]), []),
              ),
              ...columns.map(column =>
                h.td(builders.footerCell.attrs(numeric(column)), [column.footer ?? '']),
              ),
            ]),
          ]),
        ]
      : []),
  ])
  const { fluid } = options
  return fluid !== undefined
    ? h.div(builders.frame.attrs([h.Style(fluid.resting), h.OnMount(fluid.mount())]), [
        h.div(builders.highlight.attrs([h.AriaHidden(true)]), []),
        table,
      ])
    : h.div(builders.frame.attrs(), [table])
}

/** What a Table is given once: its look, words and highlight; the columns and rows are each use's. */
export type TablePreset = Pick<TableView<never>, 'style' | 'words' | 'fluid'> & {
  readonly mixins?: MixinList<never>
}

/** The application's own Table: `base` for every use, `presets` chosen at a use, and the call over both. */
export const configure = <const Names extends string = never>(
  config: Presets<TablePreset, Names>,
): {
  readonly view: <Row, Outer = never, Key extends string = string>(
    options: TableView<Row, Outer, Key> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
