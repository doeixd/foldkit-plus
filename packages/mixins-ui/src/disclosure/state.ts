import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'

/** Whether the panel is open. */
export const Model = Schema.Struct({ isOpen: Schema.Boolean })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** The button was pressed: the state it asks for. */
  Toggled: { isOpen: Schema.Boolean },
})
export type Message = typeof Message.Type

export const Args = Schema.Struct({
  /** Open at the start; default shut. */
  isOpen: Schema.optionalKey(Schema.Boolean),
})
export type Args = typeof Args.Type

export const init = (args: Args = {}): Model => ({ isOpen: args.isOpen ?? false })

/** The disclosure after `message`; the same Model when it already says so. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Toggled: ({ isOpen }) =>
      isOpen === model.isOpen
        ? { model }
        : { model: modifyFields(model, { isOpen: () => isOpen }) },
  })

/**
 * The view's `isOpen` and `onToggle` for a placed Model:
 * `Disclosure.view({ id, label, content, ...Disclosure.controls(model, onMessage) }, h)`.
 */
export const controls = <Outer>(model: Model, onMessage: (message: Message) => Outer) => ({
  isOpen: model.isOpen,
  onToggle: (isOpen: boolean) => onMessage(Message.Toggled({ isOpen })),
})
