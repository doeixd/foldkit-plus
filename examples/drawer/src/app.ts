/**
 * A settings drawer proving the Overlay policy: one modal policy value,
 * one behavior list, one stack placement. Escape and outside press reach
 * the app as the stack's `Dismiss` outmessage, which closes the drawer;
 * focus is contained and restored, scroll locks, and the rest inerts while
 * open. Presence is CSS (`data-open`): no JS transition state.
 */
import { Match, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import type { DismissLayer } from 'foldkit-primitives/interaction'
import { Message, Stack } from './message.js'

export const Model = Schema.Struct({
  open: Schema.Boolean,
  ...Stack.fields,
})
export type Model = typeof Model.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Stack, {
    onOut: (out: DismissLayer.Dismiss) => (model: Model) => ({
      model: out.ids.includes('drawer') && model.open ? { ...model, open: false } : model,
    }),
  }),
)

export const initial = assembly.initial({ open: false })

export const update = assembly.update((model, message) => {
  return Match.valueTags(message, {
    Opened: () => ({ model: { ...model, open: true } }),
    Closed: () => ({ model: { ...model, open: false } }),
    Toggled: () => ({ model: { ...model, open: !model.open } }),
  })
})
