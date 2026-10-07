/**
 * A quantity field's state: one number the parent owns, inside its bounds.
 * Stepping clamps; the bounds live here so `update` and the view agree.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const BOUNDS = { min: 0, max: 10, step: 1 } as const

export const clamp = (value: number): number => Math.min(BOUNDS.max, Math.max(BOUNDS.min, value))

export const Model = Schema.Struct({
  value: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SetValue: { value: Schema.Number },
})
export type Message = typeof Message.Type

export const initial: Model = { value: 3 }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'SetValue': {
      const value = clamp(message.value)
      return value === model.value ? { model } : { model: { ...model, value } }
    }
  }
}
