import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type { Return } from 'foldkit/update'
import { toggled } from '../accordion/toggled.js'

/**
 * Whether the trace is open as the reader asked (none: it follows the work),
 * and the steps whose detail is open.
 */
export const Model = Schema.Struct({
  open: Schema.OptionFromNullOr(Schema.Boolean),
  openSteps: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** The trigger was pressed, asking for this state. */
  Toggled: { open: Schema.Boolean },
  /** A step's row was pressed. */
  ToggledStep: { id: Schema.String },
})
export type Message = typeof Message.Type

/** What decides how a step's press changes the open details, the same for the life of a placement. */
export const Args = Schema.Struct({
  /** The steps open at the start; none when not given. */
  openSteps: Schema.optionalKey(Schema.Array(Schema.String)),
  /** Any number of details open at once; default one at a time. */
  multiple: Schema.optionalKey(Schema.Boolean),
})
export type Args = typeof Args.Type

export const init = (args: Args = {}): Model => ({
  open: Option.none(),
  openSteps: args.openSteps ?? [],
})

/** The Model after `message`; the one it was given when the press changes nothing. */
export const update = (model: Model, message: Message, args: Args = {}): Return<Model, Message> =>
  Message.match(message, {
    Toggled: ({ open }) =>
      Option.contains(model.open, open)
        ? { model }
        : { model: { ...model, open: Option.some(open) } },
    ToggledStep: ({ id }) => {
      const openSteps = toggled(model.openSteps, id, { multiple: args.multiple })
      return { model: openSteps === model.openSteps ? model : { ...model, openSteps } }
    },
  })

/**
 * The view's four options for a placed Model:
 * `ThinkingSteps.view({ id, steps, ...ThinkingSteps.controls(model, onMessage) }, h)`.
 */
export const controls = <Outer>(model: Model, onMessage: (message: Message) => Outer) => ({
  open: model.open,
  onToggle: (open: boolean) => onMessage(Message.Toggled({ open })),
  openSteps: model.openSteps,
  onToggleStep: (id: string) => onMessage(Message.ToggledStep({ id })),
})
