/**
 * A contact preference's state: how we may reach you, one of the listed
 * channels. A value outside the list is refused with the Model untouched,
 * so a stale or crafted change renders nothing.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'

export const CHANNELS = ['email', 'phone', 'mail'] as const
export type Channel = (typeof CHANNELS)[number]

export const isChannel = (value: string): value is Channel =>
  (CHANNELS as ReadonlyArray<string>).includes(value)

export const Model = Schema.Struct({
  value: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SetValue: { value: Schema.String },
})
export type Message = typeof Message.Type

export const initial: Model = { value: 'email' }

export const update = (model: Model, message: Message): { readonly model: Model } => {
  switch (message._tag) {
    case 'SetValue': {
      if (isChannel(message.value) === false || message.value === model.value) return { model }
      return { model: { ...model, value: message.value } }
    }
  }
}
