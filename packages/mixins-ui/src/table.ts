import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A data table publishes its regions as slots; it owns no state, messages,
 * or bundles. Sorting, selection, and paging stay where the data lives
 * (see `foldkit-data-grid`); this is the plain table underneath them.
 */
export const TableSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  caption: Slot.make({ capability: Capability.Container }),
  head: Slot.make({ capability: Capability.Container }),
  headerRow: Slot.make({ capability: Capability.Container }),
  headerCell: Slot.make({ capability: Capability.Container }),
  body: Slot.make({ capability: Capability.Container }),
  row: Slot.make({ capability: Capability.Container }),
  cell: Slot.make({ capability: Capability.Container }),
})

/** One column: its heading, and each row's value for it. */
export interface TableColumn<Row> {
  readonly header: string
  /** Right-align values that read as numbers. */
  readonly numeric?: boolean | undefined
  readonly value: (row: Row) => string
}

/**
 * A plain table in one call: columns with per-row values, the rows, an
 * optional caption, a style for its slots, and mixins beside the style. No
 * upstream component stands behind it.
 */
export interface TableView<Row> {
  readonly columns: ReadonlyArray<TableColumn<Row>>
  readonly rows: ReadonlyArray<Row>
  readonly caption?: string | undefined
  /** A style of `TableSlots`, for the table's look. */
  readonly style?: NamedStyle<typeof TableSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<never> | undefined
}

export const view = <Row>(options: TableView<Row>, h: HtmlBuilder<never>): Html => {
  const builders = SlotView.buildersFor(
    TableSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  return h.table(builders.root.attrs(), [
    ...(options.caption === undefined
      ? []
      : [h.caption(builders.caption.attrs(), [options.caption])]),
    h.thead(builders.head.attrs(), [
      h.tr(builders.headerRow.attrs(), [
        ...options.columns.map(column =>
          h.th(
            builders.headerCell.attrs([
              ...(column.numeric === true ? [h.DataAttribute('numeric', '')] : []),
            ]),
            [column.header],
          ),
        ),
      ]),
    ]),
    h.tbody(builders.body.attrs(), [
      ...options.rows.map(row =>
        h.tr(builders.row.attrs(), [
          ...options.columns.map(column =>
            h.td(
              builders.cell.attrs([
                ...(column.numeric === true ? [h.DataAttribute('numeric', '')] : []),
              ]),
              [column.value(row)],
            ),
          ),
        ]),
      ),
    ]),
  ])
}
