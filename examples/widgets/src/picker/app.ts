/**
 * A sort order, chosen with `foldkit-mixins-ui`'s Picker: a dropdown on a
 * desktop and a bottom sheet on a phone, with one Model whatever the width.
 * The order is the application's; the Picker's Model holds only what is
 * open. A choice the Picker reports outside the listed orders is ignored.
 */
import { Option, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { modifyFields } from 'foldkit/struct'
import { Bundles, Picker, type RowContent } from 'foldkit-mixins-ui'

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

export const App = Bundle.compose({ sort: Schema.Option(Sort) }).pipe(
  Bundle.withChild('picker', Bundles.Picker, {
    args: { id: `${ISLAND}-sort` },
    onOut: out => model => ({
      model: modifyFields(model, { sort: sort => Sorts.picked(sort, out) }),
    }),
  }),
)
export const Model = App.Model
export type Model = typeof Model.Type
export const Message = App.Message
export type Message = typeof Message.Type

export const initial: Model = App.placements.initial({ sort: Option.none() }).model

export const update = App.placements.update()
