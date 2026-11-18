import { Duration, Effect, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import { ClipboardMessage, copyText } from 'foldkit-primitives/dom'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { AdornmentSlots, GROUP_MARK, sidesOf, type Adornments } from './adornments.js'
import type { MixinList } from './resolve.js'
import { wordsOf } from './words.js'

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
  ...AdornmentSlots,
  input: Slot.make({ capability: Capability.Focusable, attributes: [Attr.Value] }),
  button: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  /** The button's words, set apart when `copyContent` stands in their place. */
  buttonText: Slot.make({ capability: Capability.Container }),
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
  /** The clipboard refused the last copy; never together with `copied`. */
  failed: Schema.Boolean,
  copies: Schema.Number,
  /** Milliseconds from a copy until the button says "Copy" again. */
  resetAfter: Schema.Number,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** The clipboard took the value: send it on `ClipboardMessage.Copied`. */
  Copied: {},
  /** The clipboard refused the value: send it on `ClipboardMessage.CopyFailed`. */
  Failed: {},
  /** A copy's `resetAfter` ran out; `copy` is the stamp it began with. */
  ElapsedReset: { copy: Schema.Number },
})
export type Message = typeof Message.Type

/** Not copied yet; `resetAfter` defaults to 2000 milliseconds. */
export const init = (options: { readonly resetAfter?: number | undefined } = {}): Model => ({
  copied: false,
  failed: false,
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
        model: modifyFields(model, {
          copied: () => true,
          failed: () => false,
          copies: () => copies,
        }),
        commands: [Reset({ ms: model.resetAfter, copy: copies })],
      }
    },
    Failed: () => {
      const copies = model.copies + 1
      return {
        model: modifyFields(model, {
          copied: () => false,
          failed: () => true,
          copies: () => copies,
        }),
        commands: [Reset({ ms: model.resetAfter, copy: copies })],
      }
    },
    ElapsedReset: ({ copy }) =>
      copy === model.copies && (model.copied || model.failed)
        ? { model: modifyFields(model, { copied: () => false, failed: () => false }) }
        : { model },
  })

export interface InputCopyWords {
  /** The button's text. */
  readonly copy: string
  /** The button's text once copied, and what the status region says. */
  readonly copied: string
  /** What the status region says when the copy failed. */
  readonly failed: string
}

/** The defaults, in English. */
export const words: InputCopyWords = { copy: 'Copy', copied: 'Copied', failed: 'Copy failed' }

export interface InputCopyView<Message> extends Adornments {
  /** Prefixes every id the field draws, unique on the page. */
  readonly id: string
  readonly label: string
  readonly value: string
  /** Whether the value was just copied, the application's to set and clear. */
  readonly copied: boolean
  /** Whether the clipboard refused the copy: the status region says so, and the button stays `Copy` to try again. */
  readonly failed?: boolean | undefined
  /** Sent by the button; answer it with `Copy`. */
  readonly onCopy: NoInfer<Message>
  readonly words?: Partial<InputCopyWords> | undefined
  /**
   * Drawn in the button in place of its words, an icon say. The words stay in
   * it for a screen reader, and the status region still speaks them.
   */
  readonly copyContent?: Html | undefined
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
  const text = wordsOf(words, options.words)
  const sides = sidesOf(
    h,
    { group: [], start: builders.start.attrs(), end: builders.end.attrs() },
    options,
  )
  const copied = h.DataAttribute('copied', String(options.copied))
  const failed = options.failed === true
  const word = options.copied ? text.copied : text.copy
  const failedAttribute = h.DataAttribute('failed', String(failed))
  return h.div(builders.root.attrs([copied, failedAttribute]), [
    h.label(builders.label.attrs([h.Id(labelId), h.For(inputId)]), [options.label]),
    h.div(builders.group.attrs([h.DataAttribute(GROUP_MARK, '')]), [
      ...sides.start,
      h.input(
        builders.input.attrs([
          h.Id(inputId),
          h.Type('text'),
          // An attribute, not the `readOnly` property, so server markup has it too.
          h.Attribute('readonly', ''),
          h.Value(options.value),
        ]),
      ),
      ...sides.end,
      h.button(
        builders.button.attrs([
          h.Id(buttonId),
          h.Type('button'),
          // "Copy API key": several copy buttons on a page each say what they copy.
          h.AriaLabelledBy(`${buttonId} ${labelId}`),
          copied,
          failedAttribute,
          h.OnClick(options.onCopy),
        ]),
        options.copyContent === undefined
          ? [word]
          : [options.copyContent, h.span(builders.buttonText.attrs(), [word])],
      ),
    ]),
    h.span(
      builders.status.attrs([h.Role('status')]),
      options.copied ? [text.copied] : failed ? [text.failed] : [],
    ),
  ])
}
