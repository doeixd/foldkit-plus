import { Empty, EmptySlots, Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'
import type { Invoice } from '../../snippets/invoices.js'

const Quiet = forSlots(EmptySlots)(Recipes.Empty({ size: 'compact' }))

// While there are no rows, `empty` stands across the table: an `Empty.view`.
export default example({
  title: 'Empty',
  slots: TableSlots,
  recipe: Recipes.Table,
  view: ({ style, h }) =>
    Table.view(
      {
        columns: [
          { header: 'Invoice', value: (row: Invoice) => row.id },
          { header: 'Status', value: row => row.status },
        ],
        rows: [],
        empty: Empty.view(
          {
            title: 'No invoices yet',
            description: 'Invoices you send show up here.',
            style: Quiet,
          },
          h,
        ),
        style,
      },
      h,
    ),
})
