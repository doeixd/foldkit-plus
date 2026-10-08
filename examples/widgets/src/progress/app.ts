/**
 * An upload progress's state: bytes sent of a total, or unknown while the
 * server stays silent. Clamped both ways; a no-op returns the Model it was
 * given, so the page does not render for nothing.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const TOTAL = 100

export const clamp = (value: number): number => Math.min(TOTAL, Math.max(0, value))

export const Model = Schema.Struct({
  sent: Schema.Number,
  known: Schema.Boolean,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SetSent: { sent: Schema.Number },
  SetKnown: { known: Schema.Boolean },
})
export type Message = typeof Message.Type

export const initial: Model = { sent: 34, known: true }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'SetSent': {
      const sent = clamp(message.sent)
      return sent === model.sent ? { model } : { model: { ...model, sent } }
    }
    case 'SetKnown': {
      return message.known === model.known
        ? { model }
        : { model: { ...model, known: message.known } }
    }
  }
}
