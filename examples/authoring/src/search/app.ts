/**
 * A search field's state: the query, the result the keyboard is on (a
 * `ListNavigation` placement, virtual: DOM focus stays in the input), and the
 * last pick. The results are a function of the query, never stored. Every
 * instance carries an `id`, which prefixes the id of each element it draws,
 * so two on one page share none.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { ListNavigation } from 'foldkit-primitives/interaction'

export const FRUITS: ReadonlyArray<string> = [
  'apple',
  'apricot',
  'avocado',
  'banana',
  'blackberry',
  'blueberry',
  'cherry',
  'coconut',
]

export const Nav = Bundle.declare(ListNavigation.bundle, 'results')

export const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: true,
  timeoutMs: 500,
  page: 3,
} as const

export const Model = Schema.Struct({
  ...Nav.fields,
  id: Schema.String,
  query: Schema.String,
  picked: Schema.Option(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  Typed: { text: Schema.String },
  Cleared: {},
  Picked: { id: Schema.String },
})
export type Message = typeof Message.Type

/** The element id of a result: the instance's `id`, then the fruit. */
export const resultId = (instance: string, fruit: string): string => `${instance}:${fruit}`

/** The fruit a result id names, for the instance that drew it. */
export const fruitOf = (instance: string, id: string): string => id.slice(instance.length + 1)

/** The fruits whose name contains the query, empty for an empty query and once one is picked. */
export const resultsOf = (model: Pick<Model, 'query' | 'picked'>): ReadonlyArray<string> => {
  const needle = model.query.trim().toLocaleLowerCase()
  return needle === '' || Option.isSome(model.picked)
    ? []
    : FRUITS.filter(fruit => fruit.includes(needle))
}

const Parent = Bundle.parent({ Model, Message })
const assembly = Parent.assemble(Parent.at(Nav, { args: navArgs }))

export const initialOf = (id: string) => assembly.initial({ id, query: '', picked: Option.none() })

export const update = assembly.update((model, message) =>
  Match.valueTags(message, {
    Typed: ({ text }) =>
      text === model.query && Option.isNone(model.picked)
        ? { model }
        : { model: modifyFields(model, { query: () => text, picked: () => Option.none() }) },
    Cleared: () =>
      model.query === '' && Option.isNone(model.picked)
        ? { model }
        : { model: modifyFields(model, { query: () => '', picked: () => Option.none() }) },
    Picked: ({ id }) => {
      const fruit = fruitOf(model.id, id)
      // A result id of another instance or of a result since gone names no fruit here.
      return !FRUITS.includes(fruit) || Option.exists(model.picked, picked => picked === fruit)
        ? { model }
        : { model: modifyFields(model, { query: () => fruit, picked: () => Option.some(fruit) }) }
    },
  }),
)
