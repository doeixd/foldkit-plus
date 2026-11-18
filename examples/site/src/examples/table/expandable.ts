import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { invoices, money, type Invoice } from '../../snippets/invoices.js'

const Model = Schema.Struct({ open: Schema.Array(Schema.String) })
const Message = defineMessageUnion({ Opened: { id: Schema.String, expanded: Schema.Boolean } })

// A row opens on a press to show its detail in a row below it. Which rows are
// open is the application's.
export default example({
  title: 'Expandable rows',
  slots: TableSlots,
  recipe: Recipes.Table,
  state: {
    Model,
    Message,
    init: () => ({ model: { open: ['INV-004'] } }),
    update: (model, { id, expanded }) => ({
      model: modifyFields(model, {
        open: open => [...open.filter(each => each !== id), ...(expanded ? [id] : [])],
      }),
    }),
  },
  view: ({ style, model, onMessage, h }) =>
    Table.view(
      {
        columns: [
          { header: 'Invoice', value: (row: Invoice) => row.id },
          { header: 'Status', value: row => row.status },
          { header: 'Amount', numeric: true, value: row => money(row.amount) },
        ],
        rows: invoices,
        rowKey: row => row.id,
        expansion: {
          id: 'invoices-open',
          isExpanded: row => model.open.includes(row.id),
          onToggle: (row, expanded) => onMessage(Message.Opened({ id: row.id, expanded })),
          detail: row =>
            h.p([], [`${row.id} was sent on the 1st and is ${row.status.toLowerCase()}.`]),
          label: row => `Details of ${row.id}`,
        },
        style,
      },
      h,
    ),
})
