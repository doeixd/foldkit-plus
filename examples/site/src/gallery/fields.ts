/**
 * The state of the field previews added with the key-route round: the
 * slider's brightness and the weekdays. The site's widgets hold one of these
 * and fold `Message` into it.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Segmented } from 'foldkit-mixins-ui'
import { Weekday } from '../snippets/components.js'

export const Model = Schema.Struct({
  /** The brightness as it moves and as last let go of. */
  brightness: Schema.Struct({ value: Schema.Number, saved: Schema.Number }),
  repeatOn: Schema.Array(Weekday),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  MovedBrightness: { value: Schema.Number },
  CommittedBrightness: { value: Schema.Number },
  ToggledDay: { day: Weekday },
})
export type Message = typeof Message.Type

export const init = (): Model => ({
  brightness: { value: 60, saved: 60 },
  repeatOn: ['mon', 'wed'],
})

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    MovedBrightness: ({ value }) =>
      value === model.brightness.value
        ? { model }
        : { model: modifyFields(model, { brightness: brightness => ({ ...brightness, value }) }) },
    CommittedBrightness: ({ value }) =>
      value === model.brightness.saved
        ? { model }
        : {
            model: modifyFields(model, {
              brightness: brightness => ({ ...brightness, saved: value }),
            }),
          },
    ToggledDay: ({ day }) => ({
      model: modifyFields(model, {
        repeatOn: days => Segmented.toggled(days, day, { multiple: true }),
      }),
    }),
  })
