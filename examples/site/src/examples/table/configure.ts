import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'
import { invoices, money, type Invoice } from '../../snippets/invoices.js'

// Stated once, at module scope: the look, the words and the highlight every
// table of the application starts from, and a preset over it.
const Dense = forSlots(TableSlots)(Recipes.Table({ density: 'compact', rows: 'plain' }))
const Roomy = forSlots(TableSlots)(Recipes.Table({ density: 'comfortable' }))

const AppTable = Table.configure({
  base: { style: Roomy, fluid: Table.fluid, words: { selectRow: 'Pick this row' } },
  presets: { dense: { style: Dense } },
})

// Each use gives the columns and rows. The picked style at the call wins over both.
export default example({
  title: 'Configure once',
  slots: TableSlots,
  recipe: Recipes.Table,
  view: ({ style, h }) =>
    h.div(
      [h.Style({ display: 'grid', gap: '1.5rem' })],
      [
        AppTable.view(
          {
            caption: 'Roomy, from the base',
            columns: [{ header: 'Invoice', value: (row: Invoice) => row.id }],
            rows: invoices.slice(0, 2),
          },
          h,
        ),
        AppTable.view(
          {
            caption: 'Dense, from a preset',
            preset: 'dense',
            columns: [
              { header: 'Invoice', value: (row: Invoice) => row.id },
              { header: 'Amount', numeric: true, value: row => money(row.amount) },
            ],
            rows: invoices.slice(0, 2),
          },
          h,
        ),
        AppTable.view(
          {
            caption: 'The style picked above',
            columns: [{ header: 'Invoice', value: (row: Invoice) => row.id }],
            rows: invoices.slice(0, 2),
            style,
          },
          h,
        ),
      ],
    ),
})
