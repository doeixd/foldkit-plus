/**
 * The page: a status line and the grid over the list's page. The rows, their
 * status and the order are read from Remote and the Model on every render;
 * the grid draws only what is in view.
 */
import type { Document, HtmlBuilder } from 'foldkit/html'
import { RowCount } from 'foldkit-data-grid'
import { GridCrud } from 'foldkit-data-grid/crud'
import { Style } from 'foldkit-mixins'
import { DataGridView, GridSlots, GridStyle } from 'foldkit-mixins-data-grid'
import { Grid, Message, Products, exchangeOf, marksOf, rowsOf, type Model } from './app.js'
import { ProductSort } from './operations.js'

const Registry = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(GridStyle),
    Style.attach(
      Style.forSlots(GridSlots)({
        root: Style.inline({ height: '70vh', border: '1px solid #d4d4d8', borderRadius: '6px' }),
        // An edit's state on its cell: not yet sent is the grid's own dot; one
        // the journal has and the table does not yet, a hollow dot; one the
        // server refused, a red edge until its line is dismissed.
        cell: Style.compose(
          Style.nest('&[data-mark="saved"]', {
            backgroundImage:
              'radial-gradient(circle at calc(100% - 6px) 6px, transparent 2px, #71717a 2.5px, #71717a 3.5px, transparent 4px)',
          }),
          Style.nest('&[data-mark="refused"]', {
            backgroundImage: 'none',
            boxShadow: 'inset 0 0 0 2px #dc2626',
          }),
          // Another device's later edit won: an amber edge until its line is dismissed.
          Style.nest('&[data-mark="replaced"]', {
            backgroundImage: 'none',
            boxShadow: 'inset 0 0 0 2px #d97706',
          }),
        ),
      }),
    ),
  )

const columnName = (column: 'description' | 'cents') =>
  column === 'cents' ? 'Price' : 'Description'

/** The refused edits, one per operation, naming the cells each had changed. */
const refusedEdits = (model: Model) => {
  const byOperation = new Map<string, { cells: Array<string>; reason: string }>()
  for (const refusal of model.refused) {
    const entry = byOperation.get(refusal.opId) ?? { cells: [], reason: refusal.reason }
    entry.cells.push(`${columnName(refusal.column)} of ${refusal.id}`)
    byOperation.set(refusal.opId, entry)
  }
  return [...byOperation].map(([opId, { cells, reason }]) => ({
    opId,
    cells: cells.join(', '),
    reason,
  }))
}

export const view = (model: Model, h: HtmlBuilder<Message>): Document => {
  const page = Products.page(model)
  const rows = rowsOf(model)
  const body = h.main(
    [h.Style({ padding: '1.5rem', fontFamily: 'system-ui, sans-serif' })],
    [
      h.h1([], ['Product registry']),
      h.p(
        [],
        [
          // Read, not counted: the server has more until a page says it has none.
          RowCount.match(rows.count, {
            Known: ({ total }) => `${total.toLocaleString()} products.`,
            Unknown: ({ atLeast }) => `${atLeast.toLocaleString()} products read, more to come.`,
          }),
        ],
      ),
      h.p([h.Id('exchange'), h.Role('status')], [exchangeOf(model)]),
      h.label(
        [],
        [
          h.input([
            h.Type('checkbox'),
            h.Checked(model.offline),
            h.OnChange(() => Message.OfflineToggled()),
          ]),
          ' Work offline',
        ],
      ),
      // What the server refused, said once per edit with its reason; the cells
      // it had changed show the server's value again, edged in red.
      h.ul(
        [h.Id('refused'), h.AriaLabel('Edits not saved')],
        refusedEdits(model).map(({ opId, cells, reason }) =>
          h.li(
            [],
            [
              `${cells} not saved: ${reason}. `,
              h.button(
                [h.Type('button'), h.OnClick(Message.RefusalDismissed({ opId }))],
                ['Dismiss'],
              ),
            ],
          ),
        ),
      ),
      // What another device's later commit replaced: last writer wins, said here.
      h.ul(
        [h.Id('replaced'), h.AriaLabel('Edits replaced')],
        model.replaced.map(({ id, column, by, was }) =>
          h.li(
            [],
            [
              `${columnName(column)} of ${id}: ${by}’s later edit replaced yours (${was}). `,
              h.button(
                [h.Type('button'), h.OnClick(Message.ReplacementDismissed({ id, column }))],
                ['Dismiss'],
              ),
            ],
          ),
        ),
      ),
      Registry(
        {
          state: model.grid,
          rows,
          wrap: message => Message.GotGridMessage({ message }),
          label: 'Products',
          rowHeight: 32,
          headerHeight: 36,
          overscan: { rows: 6, columns: 1 },
          status: GridCrud.status(page),
          onRetry: Message.RetriedProducts(),
          onMore: Message.RequestedMoreProducts(),
          moreOnScroll: true,
          // The orders the query offers; a header asks for one, and the Model reads it.
          // The column clicked, not the order it leads to: two clicks in one frame
          // toggle twice, from the Model as it is, not the order last drawn.
          sort: ProductSort.inputs(model.sort, (_, column) => Message.SortedProducts({ column })),
          columnMenu: true,
          marks: marksOf(model),
        },
        h,
      ),
    ],
  )
  return { title: 'Product registry', body }
}
