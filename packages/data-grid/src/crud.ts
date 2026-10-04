/**
 * `foldkit-data-grid/crud` — a grid over a `foldkit-crud` list and the Remote
 * page it reads. The list says the columns, their labels and how each value
 * shows; Remote owns the page, its loading and its retries. This module only
 * reads both into the grid's terms: columns, a row model, and a status. It
 * fetches nothing and holds nothing.
 */
import { Option } from 'effect'
import { Display, type DisplayColumn, type DisplayWords } from 'foldkit-crud'
import { type Page, RemoteData } from 'foldkit-remote'
import { Columns, type ColumnSpec } from './columns.js'
import { RowCount, RowModel, RowStatus } from './rows.js'

/** What a grid adds to a listed member's column: where it stands, its size, and editing. */
type ColumnOptions<Row> = Partial<Omit<ColumnSpec<Row, string>, 'value'>>

/**
 * The grid's columns for a list: one per listed member, keyed by its member
 * key, headed by its label, its value the member's text as its Display says
 * it. A member whose Display is hidden (usually the id) starts hidden: it is
 * read, and can be shown, but is not drawn. `columns` adds what only the
 * grid knows to a member's column: pinning, widths, `edit`, or another
 * header; what it gives wins over what the list says.
 */
const columns = <
  Key extends string,
  Row extends { readonly [K in Key]: unknown },
  // Each member's options as written, so an edit's schema types its value.
  Options extends { readonly [K in Key]?: ColumnOptions<Row> },
>(
  list: { readonly columns: ReadonlyArray<DisplayColumn<Key>>; readonly Row: Row },
  options: { readonly words?: DisplayWords; readonly columns?: Options } = {},
): Columns<Row, { readonly [K in Key]: ColumnSpec<Row, string> & Options[K] }> => {
  // Filled for every listed key below, so the record holds each Key.
  const specs = {} as Record<Key, ColumnSpec<Row, string>>
  for (const column of list.columns) {
    specs[column.key] = {
      header: column.label,
      value: row => Display.show(column.display, row[column.key], options.words ?? {}),
      ...(column.display.shown ? {} : { hidden: true }),
      ...options.columns?.[column.key],
    }
  }
  // Each spec is the member's column with its options spread over it, so it
  // holds what `Options` says of it.
  return Columns.define<Row>()(
    specs as { readonly [K in Key]: ColumnSpec<Row, string> & Options[K] },
  )
}

/**
 * The rows of a page as the grid's row model, in the page's order. A page with
 * more after it counts as unknown, at least its rows; a failed read keeps the
 * rows it had. No answer yet, or none found, is no rows.
 */
// One row model per page value, so the projection built from it, and what is
// worked out from that, is kept across renders while the page is unchanged.
const pages = new WeakMap<object, RowModel<unknown>>()
const empty: ReadonlyArray<never> = []

const rows = <Row>(page: RemoteData<Page<Row>>, key: (row: Row) => string): RowModel<Row> => {
  const items = (value: Page<Row>): RowModel<Row> => {
    const known = pages.get(value)
    if (known !== undefined) return known as RowModel<Row>
    const model = RowModel.fromArray(value.items, key)
    const counted = value.hasNext
      ? { ...model, count: RowCount.Unknown({ atLeast: value.items.length }) }
      : model
    pages.set(value, counted)
    return counted
  }
  const none = RowModel.fromArray<Row>(empty, key)
  return RemoteData.match<Page<Row>, RowModel<Row>>(page, {
    Initial: () => none,
    Loading: () => none,
    NotFound: () => none,
    Ready: items,
    Refreshing: items,
    Failed: (_, previous) => Option.match(previous, { onNone: () => none, onSome: items }),
  })
}

/** Where a page stands, for the grid to say. */
const status = <Row>(page: RemoteData<Page<Row>>): RowStatus =>
  RemoteData.match<Page<Row>, RowStatus>(page, {
    Initial: () => RowStatus.Loading(),
    Loading: () => RowStatus.Loading(),
    NotFound: () => RowStatus.Ready(),
    Ready: () => RowStatus.Ready(),
    Refreshing: () => RowStatus.Refreshing(),
    Failed: error => RowStatus.Failed({ message: error.message }),
  })

export const GridCrud = { columns, rows, status }
