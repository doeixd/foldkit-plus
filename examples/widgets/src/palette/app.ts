/**
 * A command palette's state: the command island's query, navigation and
 * pick beside a `DismissLayer` stack, whether the palette is open, and what
 * last ran. Choosing runs the command: only an explicit activation (Enter
 * or a click), and only when that id was not already the pick. An arrow
 * moves the pointer and runs nothing.
 */
import { Option, Schema, Match } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer } from 'foldkit-primitives/interaction'
import { Nav, Sel, matching, navArgs, selArgs, selectedOf } from '../command/app.js'

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
  /** Enter on the current row: the app picks it, which runs it. */
  Committed: { id: Schema.String },
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

// The selection's placement: a committed row is picked through its helpers.
const SelPlaced = Parent.at(Sel, { args: selArgs })

const assembly = Parent.assemble(
  Parent.at(Nav, { args: navArgs }),
  SelPlaced,
  Parent.at(Stack, {
    // A dismissal names the palette and closes it; the run stands.
    onOut: (out: DismissLayer.Dismiss) => (model: Model) => ({
      model:
        out.ids.includes('palette-layer') && model.open
          ? modifyFields(model, { open: () => false, query: () => '' })
          : model,
    }),
  }),
)

const apply = assembly.update((model, message) => {
  return Match.valueTags(message, {
    Queried: message => ({ model: modifyFields(model, { query: () => message.text }) }),
    Opened: () => ({ model: modifyFields(model, { open: () => true }) }),
    Committed: ({ id }) => SelPlaced.helpers.activate(id)(model),
  })
})

export const initial = assembly.initial({
  query: '',
  open: false,
  lastRan: Option.none(),
})

/** The row a Message picks: one committed by key, or one the selection took from a press. */
const pickedBy = (message: Message): Option.Option<string> =>
  Match.value(message).pipe(
    Match.tag('Committed', ({ id }) => Option.some(id)),
    Match.orElse(() =>
      Option.flatMap(Sel.wrapper.fromParentMessage(message), child =>
        Match.value(child).pipe(
          Match.tag('Activated', ({ id }) => Option.some(id)),
          Match.orElse(() => Option.none()),
        ),
      ),
    ),
  )

export const update = (model: Model, message: Message): { readonly model: Model } => {
  const next = apply(model, message).model
  const choice = pickedBy(message)
  if (Option.isNone(choice) || !model.open) return { model: next }
  const id = choice.value
  const previous = selectedOf(model)
  if (Option.isSome(previous) && previous.value === id) return { model: next }
  const label = matching(model.query).find(command => command.id === id)?.label ?? id
  return { model: { ...next, open: false, query: '', lastRan: Option.some(label) } }
}
