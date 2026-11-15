/**
 * The roster as a Table: the name is the row's heading (`th scope="row"`), so
 * a screen reader announces a cell with it and its column's heading, and the
 * last column draws a Button, markup the Table is handed as a cell's value.
 */
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Style } from 'foldkit-mixins'
import { Button, ButtonSlots, Recipes, Table, TableSlots } from 'foldkit-mixins-ui'
import { Message, initial, sorted, update, type Member, type Model } from './app.js'

export const TableStyle = Style.forSlots(TableSlots)(Recipes.Table({}))
export const ButtonStyle = Style.forSlots(ButtonSlots)(
  Recipes.Button({ tone: 'neutral', variant: 'outline' }),
)

export const TableIsland = (model: Model, h: HtmlBuilder<Message>): Html =>
  Table.view(
    {
      caption: 'Team',
      rowKey: member => member.id,
      rows: sorted(model),
      sort: { by: model.sort, onSort: column => Message.Sorted({ column }) },
      columns: [
        { header: 'Name', rowHeader: true, sortKey: 'name', value: member => member.name },
        { header: 'Role', sortKey: 'role', value: member => member.role },
        { header: 'Standing', value: member => (member.active ? 'Active' : 'Archived') },
        {
          header: 'Action',
          value: member =>
            Button.view(
              {
                label: `${member.active ? 'Archive' : 'Restore'} ${member.name}`,
                onClick: Message.Toggled({ id: member.id }),
                style: ButtonStyle,
              },
              h,
            ),
        },
      ],
      style: TableStyle,
    },
    h,
  )

const names = (members: ReadonlyArray<Member>) => members.map(member => member.name).join(', ')

export const runDemo = (): ReadonlyArray<string> => {
  let model = initial
  const lines = [`start: ${names(sorted(model))}`]
  model = update(model, Message.Sorted({ column: 'name' })).model
  lines.push(`sorted by name: ${names(sorted(model))}`)
  model = update(model, Message.Sorted({ column: 'name' })).model
  lines.push(`pressed again: ${names(sorted(model))}`)
  model = update(model, Message.Toggled({ id: 'm2' })).model
  const ada = model.members.find(member => member.id === 'm2')
  lines.push(`archived Ada Lovelace: active=${ada?.active}`)
  return lines
}
