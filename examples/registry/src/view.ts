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
import { Grid, Message, Products, exchangeOf, rowsOf, type Model } from './app.js'
import { ProductSort } from './operations.js'

const Registry = DataGridView<Message>()
  .define(Grid)
  .pipe(
    Style.attach(GridStyle),
    Style.attach(
      Style.forSlots(GridSlots)({
        root: Style.inline({ height: '70vh', border: '1px solid #d4d4d8', borderRadius: '6px' }),
      }),
    ),
  )

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
        },
        h,
      ),
    ],
  )
  return { title: 'Product registry', body }
}
