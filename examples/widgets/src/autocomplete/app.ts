/**
 * An autocomplete's state: the query text, whether the popup is open, and
 * the last picked label — beside a `ListNavigation` placement (arrows,
 * typeahead, paging in one key owner), a `Selection` placement in single
 * mode (the highlighted option), and the `DismissLayer` stack the Overlay
 * behaviors mark through. Filtering is a function of the Model. Picking
 * fills the query, records the label, and closes; dismissing only closes.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, ListNavigation, Selection } from 'foldkit-primitives/interaction'

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

/** The fruits whose label contains the query, case-insensitively. */
export const matching = (query: string): ReadonlyArray<string> => {
  const needle = query.trim().toLocaleLowerCase()
  return needle === '' ? FRUITS : FRUITS.filter(fruit => fruit.includes(needle))
}

export const Nav = Bundle.declare(ListNavigation.bundle, 'fruitNav')
export const Sel = Bundle.declare(Selection.bundle, 'fruitPick')
export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

const navArgs = {
  orientation: 'vertical',
  loop: true,
  virtual: false,
  timeoutMs: 500,
  page: 3,
} as const
const selArgs = { mode: 'single', allowEmpty: true } as const

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  query: Schema.String,
  open: Schema.Boolean,
  picked: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Sel.cases,
  ...Stack.cases,
  Queried: { text: Schema.String },
  Opened: {},
  PickedOption: { id: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
  Parent.at(Stack, {
    // Dismissing closes the popup without picking: the query stays as typed.
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({
      model: model.open ? { ...model, open: false } : model,
    }),
  }),
)

export const initial = assembly.initial({ query: '', open: false, picked: null })

const pick = (model: Model, id: string): Model => ({
  ...model,
  query: id,
  open: false,
  picked: id,
  fruitPick: Selection.bundle.update(model.fruitPick, Selection.Message.Activated({ id }), selArgs)
    .model,
})

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'Queried':
      return { model: { ...model, query: message.text, open: true } }
    case 'Opened':
      return model.open ? { model } : { model: { ...model, open: true } }
    case 'PickedOption':
      return { model: pick(model, message.id) }
  }
})
