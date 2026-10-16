import { Duration, Effect, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { ClipboardMessage, copyText } from 'foldkit-primitives/dom'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * A read-only field showing a value beside a copy button, Zag's clipboard.
 * The view holds no state: the button sends `onCopy`, the application's
 * `update` returns `Copy` with the value, and the `ClipboardMessage` it
 * yields (`Copied` or `CopyFailed`, from `foldkit-primitives/dom`) is where
 * the application sets the `copied` flag it passes back. To have it go back
 * to "Copy" on its own, keep this module's `Model` and fold `Copied` into it
 * with `update`, which answers with `Reset` after the Model's `resetAfter`.
 * Copied, the button reads "Copied" and a polite
 * status region, drawn always so it is in place before it speaks, says so:
 * a screen reader does not reliably announce a focused button's new name.
 */
export const InputCopySlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
  input: Slot.make({ capability: Capability.Focusable, attributes: [Attr.Value] }),
  button: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

/** Puts `text` on the clipboard; a refusal or no clipboard yields `CopyFailed`, never a throw. */
export const Copy = Command.define('InputCopy.Copy', {
  args: { text: Schema.String },
  messages: [ClipboardMessage.Copied, ClipboardMessage.CopyFailed],
  execute: ({ text }) => copyText(text).effect,
})

/**
 * Whether the value shows as copied, and for how long. `copies` stamps each
 * copy, so a reset begun by an earlier one does not cut a later one short.
 */
export const Model = Schema.Struct({
  copied: Schema.Boolean,
  copies: Schema.Number,
  /** Milliseconds from a copy until the button says "Copy" again. */
  resetAfter: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** The clipboard took the value: send it on `ClipboardMessage.Copied`. */
  Copied: {},
  /** A copy's `resetAfter` ran out; `copy` is the stamp it began with. */
  ElapsedReset: { copy: Schema.Number },
})
export type Message = typeof Message.Type

/** Not copied yet; `resetAfter` defaults to 2000 milliseconds. */
export const init = (options: { readonly resetAfter?: number | undefined } = {}): Model => ({
  copied: false,
  copies: 0,
  resetAfter: options.resetAfter ?? 2000,
})

/** Waits `ms`, then yields `ElapsedReset` for the copy stamped `copy`. */
export const Reset = Command.define('InputCopy.Reset', {
  args: { ms: Schema.Number, copy: Schema.Number },
  messages: [Message.ElapsedReset],
  execute: ({ ms, copy }) =>
    Effect.sleep(Duration.millis(ms)).pipe(Effect.as(Message.ElapsedReset({ copy }))),
})

/** The field after `message`: copied and a `Reset` begun, or copied no more; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Copied: () => {
      const copies = model.copies + 1
      return {
        model: modifyFields(model, { copied: () => true, copies: () => copies }),
        commands: [Reset({ ms: model.resetAfter, copy: copies })],
      }
    },
    ElapsedReset: ({ copy }) =>
      copy === model.copies && model.copied
        ? { model: modifyFields(model, { copied: () => false }) }
        : { model },
  })

export interface InputCopyView<Message> {
  /** Prefixes every id the field draws, unique on the page. */
  readonly id: string
  readonly label: string
  readonly value: string
  /** Whether the value was just copied, the application's to set and clear. */
  readonly copied: boolean
  /** Sent by the button; answer it with `Copy`. */
  readonly onCopy: NoInfer<Message>
  /** The button's text; default `Copy`. */
  readonly copyLabel?: string | undefined
  /** The button's text once copied, and what the status region says; default `Copied`. */
  readonly copiedLabel?: string | undefined
  /** A style of `InputCopySlots`, for the field's look. */
  readonly style?: NamedStyle<typeof InputCopySlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message>(options: InputCopyView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    InputCopySlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const inputId = `${options.id}-input`
  const labelId = `${options.id}-label`
  const buttonId = `${options.id}-button`
  const copiedLabel = options.copiedLabel ?? 'Copied'
  const copied = h.DataAttribute('copied', String(options.copied))
  return h.div(builders.root.attrs([copied]), [
    h.label(builders.label.attrs([h.Id(labelId), h.For(inputId)]), [options.label]),
    h.div(builders.group.attrs(), [
      h.input(
        builders.input.attrs([
          h.Id(inputId),
          h.Type('text'),
          // An attribute, not the `readOnly` property, so server markup has it too.
          h.Attribute('readonly', ''),
          h.Value(options.value),
        ]),
      ),
      h.button(
        builders.button.attrs([
          h.Id(buttonId),
          h.Type('button'),
          // "Copy API key": several copy buttons on a page each say what they copy.
          h.AriaLabelledBy(`${buttonId} ${labelId}`),
          copied,
          h.OnClick(options.onCopy),
        ]),
        [options.copied ? copiedLabel : (options.copyLabel ?? 'Copy')],
      ),
    ]),
    h.span(builders.status.attrs([h.Role('status')]), options.copied ? [copiedLabel] : []),
  ])
}
