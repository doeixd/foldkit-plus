import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { Return } from 'foldkit/update'
import { toggled } from './toggled.js'

/** The ids of the open sections, in the order they opened. */
export const Model = Schema.Struct({ open: Schema.Array(Schema.String) })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A section's trigger was pressed. */
  Toggled: { id: Schema.String },
})
export type Message = typeof Message.Type

/** What decides how a press changes the open sections, the same for the life of a placement. */
export const Args = Schema.Struct({
  /** The ids open at the start; none when not given. */
  open: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Any number open at once; default one at a time. */
  multiple: Schema.optionalKey(Schema.Boolean),
  /** A single accordion can shut its open section; default true. */
  collapsible: Schema.optionalKey(Schema.Boolean),
})
export type Args = typeof Args.Type

export const init = (args: Args = {}): Model => ({ open: args.open ?? [] })

/** The sections after `message`; the Model it was given when the press changes nothing. */
export const update = (model: Model, message: Message, args: Args = {}): Return<Model, Message> =>
  Message.match(message, {
    Toggled: ({ id }) => {
      const open = toggled(model.open, id, args)
      return { model: open === model.open ? model : { open } }
    },
  })

/**
 * The view's `open` and `onToggle` for a placed Model:
 * `Accordion.view({ id, items, ...Accordion.controls(model, onMessage) }, h)`.
 */
export const controls = <Outer>(model: Model, onMessage: (message: Message) => Outer) => ({
  open: model.open,
  onToggle: (id: string) => onMessage(Message.Toggled({ id })),
})
