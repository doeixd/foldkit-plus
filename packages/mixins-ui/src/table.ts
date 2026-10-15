import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { FluidHover, fluidHovered } from 'foldkit-primitives/dom'
import type { MixinList } from './resolve.js'

/**
 * A data table publishes its regions as slots; it owns no state, messages,
 * or bundles. Sorting, selection, and paging stay where the data lives
 * (see `foldkit-data-grid`); this is the plain table underneath them.
 * Drawn with `fluid`, it stands in a `frame` with one `highlight` behind the
 * rows, which follows the pointer to the nearest one: a highlight cannot be
 * a child of a `tbody`, so it is the frame's.
 */
export const TableSlots = Slots.define({
  frame: Slot.make({ capability: Capability.Container }),
  highlight: Slot.make({ capability: Capability.Container }),
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
export interface TableView<Row, Message = never> {
  readonly columns: ReadonlyArray<TableColumn<Row>>
  readonly rows: ReadonlyArray<Row>
  readonly caption?: string | undefined
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

export const view = <Row, Message = never>(
  options: TableView<Row, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const builders = SlotView.buildersFor(
    TableSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const table = h.table(builders.root.attrs(), [
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
  return options.fluid === true
    ? h.div(
        builders.frame.attrs([
          h.Style(resting),
          h.OnMount(
            FluidHover({ name: TABLE_HOVER, item: 'tbody > tr', axis: 'y', gapClick: false }),
          ),
        ]),
        [h.div(builders.highlight.attrs([h.AriaHidden(true)]), []), table],
      )
    : table
}
