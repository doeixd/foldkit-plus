/**
 * Two Segmented controls and a Slider. The single-choice Segmented keeps one
 * value, the multiple one a list of them. The Slider's Model holds the live
 * value, which every step of a drag or key moves, apart from the committed
 * one, which only the release (or a key press) sets.
 */
import { Match, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { Segmented } from 'foldkit-mixins-ui'

export const SIZES = [
  { value: 's', label: 'Small' },
  { value: 'm', label: 'Medium' },
  { value: 'l', label: 'Large' },
] as const

export const STYLES = [
  { value: 'bold', label: 'Bold' },
  { value: 'italic', label: 'Italic' },
  { value: 'underline', label: 'Underline' },
] as const

export const Model = Schema.Struct({
  size: Schema.String,
  styles: Schema.Array(Schema.String),
  live: Schema.Number,
  /** How many steps the live value has taken. */
  moves: Schema.Number,
  committed: Schema.Number,
  /** How many times the reader committed a value. */
  commits: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  PickedSize: { value: Schema.String },
  ToggledStyle: { value: Schema.String },
  Slid: { value: Schema.Number },
  Committed: { value: Schema.Number },
})
export type Message = typeof Message.Type

export const initial: Model = {
  size: 'm',
  styles: [],
  live: 50,
  moves: 0,
  committed: 50,
  commits: 0,
}

export const update = (model: Model, message: Message): Return<Model, Message> =>
  Match.valueTags(message, {
    PickedSize: ({ value }) =>
      value === model.size ? { model } : { model: modifyFields(model, { size: () => value }) },
    ToggledStyle: ({ value }) => ({
      model: modifyFields(model, {
        styles: styles => Segmented.toggled(styles, value, { multiple: true }),
      }),
    }),
    Slid: ({ value }) =>
      value === model.live
        ? { model }
        : { model: modifyFields(model, { live: () => value, moves: moves => moves + 1 }) },
    Committed: ({ value }) => ({
      model: modifyFields(model, { committed: () => value, commits: commits => commits + 1 }),
    }),
  })
