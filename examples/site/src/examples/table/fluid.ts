import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { invoices, money, type Invoice } from './invoices.js'

// One highlight behind the rows follows the pointer to the nearest one. It is
// a value you pass: a table that does not draws none and ships none of it.
export default example({
  title: 'Following highlight',
  slots: TableSlots,
  recipe: Recipes.Table,
  view: ({ style, h }) =>
    Table.view(
      {
        columns: [
          { header: 'Invoice', rowHeader: true, value: (row: Invoice) => row.id },
          { header: 'Status', value: row => row.status },
          { header: 'Amount', numeric: true, value: row => money(row.amount) },
        ],
        rows: invoices,
        style,
        fluid: Table.fluid,
      },
      h,
    ),
})
