import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { invoices, money, type Invoice } from '../../snippets/invoices.js'

const Key = Schema.Literals(['id', 'status', 'amount'])
const Model = Schema.Struct({
  sort: Schema.Option(
    Schema.Struct({ column: Key, direction: Schema.Literals(['ascending', 'descending']) }),
  ),
})
const Message = defineMessageUnion({ Sorted: { column: Key } })

const order = {
  id: (a: Invoice, b: Invoice) => a.id.localeCompare(b.id),
  status: (a: Invoice, b: Invoice) => a.status.localeCompare(b.status),
  amount: (a: Invoice, b: Invoice) => a.amount - b.amount,
}

// The table draws the order it is given; the application sorts. A press on a
// heading sends the column, and `Table.nextSort` cycles ascending,
// descending, none.
export default example({
  title: 'Sortable headings',
  slots: TableSlots,
  recipe: Recipes.Table,
  state: {
    Model,
    Message,
    init: () => ({ model: { sort: Option.none() } }),
    update: (model, { column }) => ({
      model: modifyFields(model, { sort: sort => Table.nextSort(sort, column) }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    Table.view(
      {
        caption: 'Recent invoices',
        columns: [
          { header: 'Invoice', sortKey: 'id', value: (row: Invoice) => row.id },
          { header: 'Status', sortKey: 'status', value: row => row.status },
          { header: 'Amount', sortKey: 'amount', numeric: true, value: row => money(row.amount) },
        ],
        rows: Option.match(model.sort, {
          onNone: () => invoices,
          onSome: ({ column, direction }) =>
            [...invoices].sort(
              (a, b) => (direction === 'ascending' ? 1 : -1) * order[column](a, b),
            ),
        }),
        rowKey: row => row.id,
        sort: { by: model.sort, onSort: column => onMessage(Message.Sorted({ column })) },
        style,
      },
      h,
    ),
})
