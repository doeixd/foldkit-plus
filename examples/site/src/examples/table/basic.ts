import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { invoices, money, type Invoice } from '../../snippets/invoices.js'

// A table is columns and rows; a column's `value` is text or markup. The row
// header (`th scope="row"`) is what a screen reader names a row by.
export default example({
  title: 'Basic',
  slots: TableSlots,
  recipe: Recipes.Table,
  view: ({ style, h }) =>
    Table.view(
      {
        caption: 'Recent invoices',
        columns: [
          { header: 'Invoice', rowHeader: true, value: (row: Invoice) => row.id },
          { header: 'Status', value: row => row.status },
          { header: 'Amount', numeric: true, value: row => money(row.amount) },
        ],
        rows: invoices,
        style,
      },
      h,
    ),
})
