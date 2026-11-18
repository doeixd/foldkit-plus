import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { CheckboxSlots, Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { example } from '../../gallery/example.js'
import { forSlots } from '../../snippets/theme.js'
import { invoices, money, type Invoice } from './invoices.js'

const Model = Schema.Struct({ chosen: Schema.Array(Schema.String) })
const Message = defineMessageUnion({
  Chose: { id: Schema.String, selected: Schema.Boolean },
  ChoseAll: { ids: Schema.Array(Schema.String) },
})

const Boxes = forSlots(CheckboxSlots)(Recipes.Checkbox({}))

// The rows chosen are the application's. `control` is the one place Checkbox
// is imported: a table that selects nothing never loads it.
export default example({
  title: 'Row selection',
  slots: TableSlots,
  recipe: Recipes.Table,
  state: {
    Model,
    Message,
    init: () => ({ model: { chosen: ['INV-002'] } }),
    update: (model, message) => ({
      model: Message.match(message, {
        Chose: ({ id, selected }) =>
          modifyFields(model, {
            chosen: chosen => [...chosen.filter(each => each !== id), ...(selected ? [id] : [])],
          }),
        ChoseAll: ({ ids }) => modifyFields(model, { chosen: () => ids }),
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
        selection: {
          id: 'invoices-chosen',
          isSelected: row => model.chosen.includes(row.id),
          onToggle: (row, selected) => onMessage(Message.Chose({ id: row.id, selected })),
          onToggleAll: all =>
            onMessage(Message.ChoseAll({ ids: all ? invoices.map(row => row.id) : [] })),
          rowLabel: row => `Select ${row.id}`,
          control: Table.checkboxes(Boxes),
        },
        style,
      },
      h,
    ),
})
