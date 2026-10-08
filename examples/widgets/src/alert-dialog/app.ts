/**
 * A delete confirmation's state: whether the dialog is open, and what the
 * last answer was. The stack placement exists because the Overlay behaviors
 * mark through it — but the explicit-response policy dismisses on neither
 * outside press nor Escape, so its `Dismiss` outmessage never closes: only
 * the dialog's own buttons answer.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer } from 'foldkit-primitives/interaction'

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const Model = Schema.Struct({
  ...Stack.fields,
  open: Schema.Boolean,
  answer: Schema.NullOr(Schema.Literals(['confirmed', 'cancelled'])),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Stack.cases,
  Opened: {},
  Confirmed: {},
  Cancelled: {},
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Stack, {
    // Explicit response only: a dismissal names the dialog and changes nothing.
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({ model }),
  }),
)

export const initial = assembly.initial({ open: false, answer: null })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'Opened':
      return { model: { ...model, open: true } }
    case 'Confirmed':
      return { model: { ...model, open: false, answer: 'confirmed' } }
    case 'Cancelled':
      return { model: { ...model, open: false, answer: 'cancelled' } }
  }
})
