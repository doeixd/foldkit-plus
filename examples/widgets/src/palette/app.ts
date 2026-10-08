/**
 * A command palette's state: the command island's query, navigation and
 * pick beside a `DismissLayer` stack, whether the palette is open, and what
 * last ran. Choosing a new command runs it: the palette closes over the
 * pick, computed in `update` from the selection change, not in the view.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, ListNavigation, Selection } from 'foldkit-primitives/interaction'
import { Nav, Sel, matching, navArgs, selArgs, selectedOf } from '../command/app.js'

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  query: Schema.String,
  open: Schema.Boolean,
  lastRan: Schema.NullOr(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Nav.cases,
  ...Sel.cases,
  ...Stack.cases,
  Queried: { text: Schema.String },
  Opened: {},
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  Parent.at(Sel, { args: selArgs }),
  Parent.at(Stack, {
    // A dismissal names the palette and closes it; the run stands.
    onOut: (out: DismissLayer.Dismiss) => (model: Model) => ({
      model:
        out.ids.includes('palette') && model.open
          ? { ...model, open: false, query: '', lastRan: model.lastRan }
          : model,
    }),
  }),
)

const apply = assembly.update((model, message) => {
  switch (message._tag) {
    case 'Queried':
      return { model: { ...model, query: message.text } }
    case 'Opened':
      return { model: { ...model, open: true } }
  }
})

export const initial = assembly.initial({ query: '', open: false, lastRan: null })

export const update = (model: Model, message: Message): { readonly model: Model } => {
  const before = model.open ? selectedOf(model) : null
  const next = apply(model, message).model
  const picked = selectedOf(next)
  if (model.open && picked !== null && picked !== before) {
    const label = matching(next.query).find(command => command.id === picked)?.label ?? picked
    return { model: { ...next, open: false, query: '', lastRan: label } }
  }
  return { model: next }
}
