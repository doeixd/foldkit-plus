/**
 * A contact preference's state: how we may reach you, one of the listed
 * channels. A value outside the list is refused with the Model untouched,
 * so a stale or crafted change renders nothing.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

export const CHANNELS = ['email', 'phone', 'mail'] as const
const isChannel = Schema.is(Schema.Literals(CHANNELS))

export const Model = Schema.Struct({
  value: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  SetValue: { value: Schema.String },
})
export type Message = typeof Message.Type

export const initial: Model = { value: 'email' }

export const update = (model: Model, message: Message): { readonly model: Model } =>
  Message.match(message, {
    SetValue: ({ value }) => {
      if (isChannel(value) === false || value === model.value) return { model }
      return { model: modifyFields(model, { value: () => value }) }
    },
  })
