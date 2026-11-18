import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'

interface Fact {
  readonly name: string
  readonly value: string
}

const facts: ReadonlyArray<Fact> = [
  { name: 'Plan', value: 'Team' },
  { name: 'Seats', value: '12 of 15' },
  { name: 'Renews', value: '1 March' },
]

// A table read down its first column: that column is the row header, and
// `header: 'hidden'` keeps the headings for a screen reader alone.
export default example({
  title: 'Vertical, boxed cells',
  slots: TableSlots,
  recipe: Recipes.Table,
  pins: { header: 'hidden', borders: 'cells' },
  view: ({ style, h }) =>
    Table.view(
      {
        caption: 'Subscription',
        columns: [
          { header: 'Fact', rowHeader: true, value: (row: Fact) => row.name },
          { header: 'Value', value: row => row.value },
        ],
        rows: facts,
        style,
      },
      h,
    ),
})
