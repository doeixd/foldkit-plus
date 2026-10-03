import type { Columns, ColumnSpec } from './columns.js'

/**
 * Where each column stands: the start, center and end regions in display
 * order, and which columns are hidden. Hiding keeps a column's place, so
 * showing it again puts it back where it was. The grid owns this state; it
 * holds column ids only, so it can be saved and restored.
 */
export interface ColumnLayout<Id extends string> {
  /** Pinned to the start edge, outside horizontal scrolling. */
  readonly start: ReadonlyArray<Id>
  readonly center: ReadonlyArray<Id>
  /** Pinned to the end edge, outside horizontal scrolling. */
  readonly end: ReadonlyArray<Id>
  readonly hidden: ReadonlyArray<Id>
}

export const ColumnLayout = {
  /** The layout the columns declare: definition order, each in its `pinned` region. */
  initial: <Row, Specs extends Record<string, ColumnSpec<Row, unknown>>>(
    columns: Columns<Row, Specs>,
  ): ColumnLayout<keyof Specs & string> => {
    type Id = keyof Specs & string
    const start: Array<Id> = []
    const center: Array<Id> = []
    const end: Array<Id> = []
    const hidden: Array<Id> = []
    const pinned = { start, end }
    for (const id of columns.ids) {
      const column = columns.byId[id]
      ;(column.pinned === undefined ? center : pinned[column.pinned]).push(id)
      if (column.hidden === true) hidden.push(id)
    }
    return { start, center, end, hidden }
  },
}
