/**
 * A storage meter's state: bytes used of a quota. Clamped both ways; the
 * element itself is the accessible name's owner, so no slots beyond a
 * container and two buttons.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const QUOTA = 100

export const clamp = (value: number): number => Math.min(QUOTA, Math.max(0, value))

export const Model = Schema.Struct({
  used: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SetUsed: { used: Schema.Number },
})
export type Message = typeof Message.Type

export const initial: Model = { used: 62 }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'SetUsed': {
      const used = clamp(message.used)
      return used === model.used ? { model } : { model: { ...model, used } }
    }
  }
}
