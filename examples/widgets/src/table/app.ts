/**
 * A short roster drawn with `foldkit-mixins-ui`'s Table. The Table owns no
 * state: the sort and each member's standing are the Model's, and a press on
 * a heading or on a row's button is a Message `update` folds.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Table } from 'foldkit-mixins-ui'

export const ISLAND = 'table'

export const Member = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  role: Schema.String,
  active: Schema.Boolean,
})
export type Member = typeof Member.Type

/** The columns a heading sorts by, named as the heading's `sortKey`. */
export const SORT_COLUMNS = ['name', 'role'] as const
const SortColumn = Schema.Literals(SORT_COLUMNS)

export const Model = Schema.Struct({
  members: Schema.Array(Member),
  sort: Schema.Option(
    Schema.Struct({
      column: SortColumn,
      direction: Schema.Literals(['ascending', 'descending']),
    }),
  ),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Sorted: { column: SortColumn },
  Toggled: { id: Schema.String },
})
export type Message = typeof Message.Type

export const initial: Model = {
  members: [
    { id: 'm1', name: 'Grace Hopper', role: 'Engineer', active: true },
    { id: 'm2', name: 'Ada Lovelace', role: 'Analyst', active: true },
    { id: 'm3', name: 'Katherine Johnson', role: 'Analyst', active: false },
    { id: 'm4', name: 'Annie Easley', role: 'Engineer', active: true },
  ],
  sort: Option.none(),
}

export const update = (model: Model, message: Message): { readonly model: Model } =>
  Message.match(message, {
    Sorted: ({ column }) => ({
      model: modifyFields(model, { sort: sort => Table.nextSort(sort, column) }),
    }),
    Toggled: ({ id }) =>
      model.members.some(member => member.id === id)
        ? {
            model: modifyFields(model, {
              members: members =>
                members.map(member =>
                  member.id === id ? { ...member, active: !member.active } : member,
                ),
            }),
          }
        : { model },
  })

/** The members in the order the sort names; the Model keeps them as they were added. */
export const sorted = (model: Model): ReadonlyArray<Member> =>
  Option.match(model.sort, {
    onNone: () => model.members,
    onSome: ({ column, direction }) => {
      const order = [...model.members].sort((a, b) => a[column].localeCompare(b[column]))
      return direction === 'ascending' ? order : order.reverse()
    },
  })
