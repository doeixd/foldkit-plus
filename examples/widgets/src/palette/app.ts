/**
 * A command palette's state: the command island's query, navigation and
 * pick beside a `DismissLayer` stack, whether the palette is open, and what
 * last ran. Choosing runs the command: only an explicit activation (Enter
 * or a click), and only when that id was not already the pick. An arrow
 * moves the pointer and runs nothing.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer, ListNavigation, Selection } from 'foldkit-primitives/interaction'
import { Nav, Sel, matching, navArgs, selArgs, selectedOf, textOf } from '../command/app.js'

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const Model = Schema.Struct({
  ...Nav.fields,
  ...Sel.fields,
  ...Stack.fields,
  query: Schema.String,
  open: Schema.Boolean,
  lastRan: Schema.Option(Schema.String),
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
        out.ids.includes('palette-layer') && model.open
          ? { ...model, open: false, query: '' }
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

export const initial = assembly.initial({
  query: '',
  open: false,
  lastRan: Option.none(),
})

export const update = (model: Model, message: Message): { readonly model: Model } => {
  const next = apply(model, message).model
  const choice = Sel.wrapper.fromParentMessage(message)
  if (Option.isNone(choice) || choice.value._tag !== 'Activated' || !model.open) {
    return { model: next }
  }
  const id = choice.value.id
  const previous = selectedOf(model)
  if (Option.isSome(previous) && previous.value === id) return { model: next }
  const label = matching(model.query).find(command => command.id === id)?.label ?? id
  return { model: { ...next, open: false, query: '', lastRan: Option.some(label) } }
}
