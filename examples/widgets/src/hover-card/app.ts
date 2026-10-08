/**
 * A hover card's state: whether the card shows, beside the `DismissLayer`
 * stack the Overlay behaviors mark through. Hovering or focusing the trigger
 * opens immediately; leaving (with a real pointer), blurring, or Escape
 * closes. Intent delays stay upstream's `HoverIntent`: this card carries no
 * interactive content, so nothing flickers between trigger and panel.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Bundle } from 'foldkit-bundle'
import { DismissLayer } from 'foldkit-primitives/interaction'

export const Stack = Bundle.declare(DismissLayer.bundle, 'layers')

export const Model = Schema.Struct({
  ...Stack.fields,
  open: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ...Stack.cases,
  Entered: {},
  Left: {},
  Focused: {},
  Blurred: {},
  Toggled: {},
})
export type Message = typeof Message.Type

const Parent = Bundle.parent({ Model, Message })

const assembly = Parent.assemble(
  Parent.at(Stack, {
    onOut: (_out: DismissLayer.Dismiss) => (model: Model) => ({
      model: model.open ? { ...model, open: false } : model,
    }),
  }),
)

export const initial = assembly.initial({ open: false })

export const update = assembly.update((model, message) => {
  switch (message._tag) {
    case 'Entered':
      return model.open ? { model } : { model: { ...model, open: true } }
    case 'Left':
      return model.open ? { model: { ...model, open: false } } : { model }
    case 'Focused':
      return model.open ? { model } : { model: { ...model, open: true } }
    case 'Blurred':
      return model.open ? { model: { ...model, open: false } } : { model }
    case 'Toggled':
      return { model: { ...model, open: !model.open } }
  }
})
