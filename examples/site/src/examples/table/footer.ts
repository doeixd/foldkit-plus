import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { invoices, money, type Invoice } from './invoices.js'

const total = invoices.reduce((sum, invoice) => sum + invoice.amount, 0)

// A column's `footer` draws a totals row after the body, and `header` takes
// markup as well as text.
export default example({
  title: 'Totals',
  slots: TableSlots,
  recipe: Recipes.Table,
  view: ({ style, h }) =>
    Table.view(
      {
        caption: 'Recent invoices',
        columns: [
          {
            header: 'Invoice',
            rowHeader: true,
            value: (row: Invoice) => row.id,
            footer: `${invoices.length} invoices`,
          },
          { header: 'Status', value: row => row.status },
          {
            header: h.span([], ['Amount (USD)']),
            numeric: true,
            value: row => money(row.amount),
            footer: money(total),
          },
        ],
        rows: invoices,
        style,
      },
      h,
    ),
})
