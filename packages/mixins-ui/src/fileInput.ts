import { Effect, Schema } from 'effect'
import {
  A11y,
  Attr,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
} from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import type { MixinList } from './resolve.js'

/**
 * A file picker: a native `type="file"` input, hidden but still the one
 * focusable control, and a `trigger` drawn as a button that is its `label`, so
 * the browser opens its dialog for a press on the button and for Enter or Space
 * on the input, with no script between. The chosen files are listed in a `list`
 * of `item`s, each with a `remove` button.
 *
 * The application owns the list. The input forgets what it was given (Foldkit
 * empties it after each pick, so the same file can be chosen again), which
 * would leave a surrounding form with no file; answer `onChange` and `onRemove`
 * with `Sync`, which writes the list back into the input, so a form submits
 * exactly what the list shows. A removed row takes its button and the focus it
 * held: answer `onRemove` with `Focus` as well, which puts focus on the input.
 */
export const FileInputSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  input: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaInvalid, Attr.AriaDescribedby, Attr.Disabled],
  }),
  trigger: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  item: Slot.make({ capability: Capability.Container }),
  name: Slot.make({ capability: Capability.Container }),
  remove: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
})

/** The input is a native file input and the trigger its label; a removable row needs a named control. */
export const FileInputPattern = A11y.pattern({
  input: {
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaInvalid],
    obligations: [A11y.Activation, A11y.FocusStrategy, A11y.Name],
  },
  trigger: { capability: Capability.Container },
  remove: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  },
})

/**
 * The Messages `Sync` and `Focus` answer with, to spread into the application's own:
 * `defineMessageUnion({ ..., ...FileInput.cases })`. Its `update` need do nothing for either.
 */
export const cases = {
  /** `Sync` ran; nothing to change. */
  CompletedSync: {},
  /** `Focus` ran; nothing to change. */
  CompletedFocus: {},
}

export const Message = defineMessageUnion(cases)
export type Message = typeof Message.Type

/** The id of the field's file input, for `id` given to `view`. */
export const inputId = (id: string): string => `${id}-input`

/**
 * Writes `files` into the input of the field with `id`, so a form submits the
 * list as the application keeps it, and an empty list resets the input, so a
 * removed file can be chosen again. Setting the files fires no `change`. A
 * missing input is not an error.
 */
export const Sync = Command.define('FileInput.Sync', {
  args: { id: Schema.String, files: Schema.Array(Schema.instanceOf(File)) },
  messages: [Message.CompletedSync],
  execute: ({ id, files }) =>
    Effect.sync(() => {
      const input = document.getElementById(inputId(id))
      if (!(input instanceof HTMLInputElement)) return
      const transfer = new DataTransfer()
      for (const file of files) transfer.items.add(file)
      input.files = transfer.files
    }).pipe(Effect.as(Message.CompletedSync())),
})

/** Focuses the input of the field with `id`; a missing input is not an error. */
export const Focus = Command.define('FileInput.Focus', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ id }) =>
    Dom.focus(`#${inputId(id)}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
})

/** What names a file when the browser hands the same one twice: a re-picked file is a new `File`. */
const keyOf = (file: File): string => `${file.name}:${file.size}:${file.lastModified}:${file.type}`

/**
 * The list after `picked` is chosen. A single field takes the newest pick; with
 * `multiple` the files join the list, and one the list already holds (the same
 * name, size, type and modification time, since a re-picked file is a new
 * `File`) is not added twice.
 */
export const added = (
  files: ReadonlyArray<File>,
  picked: ReadonlyArray<File>,
  options: { readonly multiple?: boolean | undefined } = {},
): ReadonlyArray<File> => {
  if (options.multiple !== true) return picked.length === 0 ? files : picked.slice(0, 1)
  const held = new Set(files.map(keyOf))
  return [
    ...files,
    ...picked.filter(file => {
      const key = keyOf(file)
      if (held.has(key)) return false
      held.add(key)
      return true
    }),
  ]
}

export interface FileInputWords {
  /** The remove button's name, with `{name}` for the file's; default `Remove {name}`. */
  readonly remove?: string | undefined
}

export interface FileInputView<Message> {
  /** Prefixes the ids the field draws, unique on the page. */
  readonly id: string
  /** The trigger's words, and the input's accessible name: what the files are for. */
  readonly label: string
  /** The chosen files, as the application keeps them. */
  readonly files: ReadonlyArray<File>
  /** Sent with the files a pick chose (none when the dialog is cancelled); fold them in with `added` and answer with `Sync`. */
  readonly onChange: (files: ReadonlyArray<File>) => NoInfer<Message>
  /** Sent with the file whose remove button was pressed, which the list holds by identity; answer with `Sync` and `Focus`. */
  readonly onRemove: (file: File) => NoInfer<Message>
  /** The form field the files submit under. */
  readonly name?: string | undefined
  /** The kinds the dialog offers, as the HTML `accept` attribute takes them. */
  readonly accept?: string | undefined
  readonly multiple?: boolean | undefined
  /** The input takes no pick, the trigger looks off, and the rows cannot be removed. */
  readonly disabled?: boolean | undefined
  /** The field must hold a file to submit: the native `required`. */
  readonly required?: boolean | undefined
  readonly invalid?: boolean | undefined
  /** Help or the reason it is invalid, read after the name. */
  readonly description?: string | undefined
  readonly words?: FileInputWords | undefined
  /** A style of `FileInputSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof FileInputSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Message>(options: FileInputView<Message>, h: HtmlBuilder<Message>): Html => {
  const disabled = options.disabled === true
  const builders = SlotView.buildersFor(
    FileInputSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const descriptionId = `${options.id}-description`
  const removeWords = options.words?.remove ?? 'Remove {name}'
  const state = [
    ...(disabled ? [h.DataAttribute('disabled', '')] : []),
    ...(options.invalid === true ? [h.DataAttribute('invalid', '')] : []),
  ]
  return h.div(builders.root.attrs(state), [
    // Before its label so the browser's `:focus-visible` can ring the label that follows.
    h.input(
      builders.input.attrs([
        h.Id(inputId(options.id)),
        h.Type('file'),
        ...(options.name === undefined ? [] : [h.Name(options.name)]),
        ...(options.accept === undefined ? [] : [h.Accept(options.accept)]),
        ...(options.multiple === true ? [h.Multiple(true)] : []),
        ...(options.required === true ? [h.Required(true)] : []),
        ...(options.invalid === true ? [h.AriaInvalid(true)] : []),
        ...(options.description === undefined ? [] : [h.AriaDescribedBy(descriptionId)]),
        ...(disabled ? [h.Disabled(true)] : [h.OnFileChange(options.onChange)]),
      ]),
    ),
    h.label(builders.trigger.attrs([h.For(inputId(options.id)), ...state]), [options.label]),
    ...(options.description === undefined
      ? []
      : [h.p(builders.description.attrs([h.Id(descriptionId)]), [options.description])]),
    ...(options.files.length === 0
      ? []
      : [
          h.ul(
            builders.list.attrs(),
            options.files.map((file, index) =>
              h.li(builders.item.attrs([h.Key(`${index}:${keyOf(file)}`)]), [
                h.span(builders.name.attrs([h.Title(file.name)]), [file.name]),
                h.button(
                  builders.remove.attrs([
                    h.Type('button'),
                    h.AriaLabel(removeWords.replace('{name}', file.name)),
                    ...(disabled ? [h.Disabled(true)] : [h.OnClick(options.onRemove(file))]),
                  ]),
                  [],
                ),
              ]),
            ),
          ),
        ]),
  ])
}
