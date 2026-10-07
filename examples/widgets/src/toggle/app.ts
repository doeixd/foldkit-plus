/**
 * A toggle's state: one boolean the parent owns. `ToggleState` says it in
 * ARIA; the view's click flips it. A native checkbox needs none of this —
 * this is for a toggle button.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const Model = Schema.Struct({
  on: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Toggled: {},
})
export type Message = typeof Message.Type

export const initial: Model = { on: false }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'Toggled':
      return { model: { ...model, on: !model.on } }
  }
}
