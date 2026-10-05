/**
 * Compile-time expectations for `EditableEntity`: members are the entity's
 * fields, a value is its own member's type, and an overlay needs the rows'
 * revision. Type-checked, not executed; every `@ts-expect-error` must stay one.
 */
import { Option, Schema } from 'effect'
import { EditableEntity, type Change } from 'foldkit-sync/entity'

const Item = {
  fields: {
    id: { schema: Schema.String },
    name: { schema: Schema.String },
    price: { schema: Schema.Number },
    status: { schema: Schema.Literals(['Active', 'Paused']) },
  },
}
const Edits = EditableEntity.make(Item, { members: ['price', 'status'] })

// @ts-expect-error a member is one of the entity's fields
EditableEntity.make(Item, { members: ['colour'] })
// @ts-expect-error id names the row; it is no member
EditableEntity.make(Item, { members: ['id'] })

type ItemChange = Change<typeof Item, 'price' | 'status'>
const price: ItemChange = { id: 'a', member: 'price', value: 3 }
const status: ItemChange = { id: 'a', member: 'status', value: 'Paused' }
// @ts-expect-error a price is a number, not a status
const crossed: ItemChange = { id: 'a', member: 'price', value: 'Paused' }
// @ts-expect-error a status is one of its literals
const unknownStatus: ItemChange = { id: 'a', member: 'status', value: 'Gone' }
// @ts-expect-error name is not an edited member
const notEdited: ItemChange = { id: 'a', member: 'name', value: 'x' }
void [price, status, crossed, unknownStatus, notEdited]

Edits.merge([], [price, status], Option.none(), Option.none())

const overlay = Edits.overlay([])
overlay({ id: 'a', name: 'a', price: 1, status: 'Active', revision: 0 })
// @ts-expect-error a row needs the revision the table read it at
overlay({ id: 'a', name: 'a', price: 1, status: 'Active' })
// @ts-expect-error a row's member is its member's type
overlay({ id: 'a', name: 'a', price: '1', status: 'Active', revision: 0 })
