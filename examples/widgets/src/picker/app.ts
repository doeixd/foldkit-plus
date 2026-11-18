/**
 * A sort order, chosen with `foldkit-mixins-ui`'s Picker: a dropdown on a
 * desktop and a bottom sheet on a phone, with one Model whatever the width.
 * The order is the application's; the Picker's Model holds only what is
 * open. A choice the Picker reports outside the listed orders is ignored.
 */
import { Option, Schema } from 'effect'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Picker, type RowContent } from 'foldkit-mixins-ui'

export const ISLAND = 'picker'

export const SORTS = ['relevance', 'price', 'name'] as const
export const Sort = Schema.Literals(SORTS)
export type Sort = typeof Sort.Type

export const LABELS: Readonly<Record<Sort, string>> = {
  relevance: 'Most relevant',
  price: 'Lowest price',
  name: 'Name',
}

/** How the Picker reads the application's `Option<Sort>`. */
export const Sorts = Picker.one(SORTS)

const ROWS: Readonly<Record<Sort, RowContent>> = {
  relevance: { label: LABELS.relevance },
  price: { label: LABELS.price, description: 'The cheapest first' },
  name: { label: LABELS.name, description: 'A to Z' },
}

export const rowOf = (sort: Sort): RowContent => ROWS[sort]

export const Model = Schema.Struct({ picker: Picker.Model, sort: Schema.Option(Sort) })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({ GotPicker: { message: Picker.Message } })
export type Message = typeof Message.Type

export const initial: Model = { picker: Picker.init({ id: `${ISLAND}-sort` }), sort: Option.none() }

const isSort = Schema.is(Sort)

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    GotPicker: ({ message }) => {
      const next = Picker.update(model.picker, message)
      const chosen = Option.filter(
        Option.map(Option.fromNullishOr(next.outMessage), ({ value }) => value),
        isSort,
      )
      return {
        model:
          next.model === model.picker && Option.isNone(chosen)
            ? model
            : modifyFields(model, {
                picker: () => next.model,
                sort: sort => Option.orElse(chosen, () => sort),
              }),
        commands: Command.mapMessages(next.commands ?? [], inner =>
          Message.GotPicker({ message: inner }),
        ),
      }
    },
  })
