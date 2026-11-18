import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { invoices, money, type Invoice } from '../../snippets/invoices.js'

// The look is the recipe's: a sticky heading, striped rows, compact density.
// These three are held whatever the controls above pick.
export default example({
  title: 'Sticky header, striped',
  slots: TableSlots,
  recipe: Recipes.Table,
  pins: { header: 'sticky', rows: 'striped', density: 'compact' },
  view: ({ style, h }) =>
    h.div(
      [h.Style({ maxBlockSize: '9rem', overflowY: 'auto' })],
      [
        Table.view(
          {
            columns: [
              { header: 'Invoice', rowHeader: true, value: (row: Invoice) => row.id },
              { header: 'Status', value: row => row.status },
              { header: 'Amount', numeric: true, value: row => money(row.amount) },
            ],
            rows: [...invoices, ...invoices.map(row => ({ ...row, id: `${row.id}-B` }))],
            style,
          },
          h,
        ),
      ],
    ),
})
