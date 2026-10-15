import { Effect, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * A field of tags, Zag's tags input: the tags as a list of chips, each with
 * a remove button, and a text input for the next one. Enter or the
 * delimiter adds the draft, split at the delimiter and trimmed, refusing
 * empty parts and tags already there; Backspace on an empty draft removes
 * the last tag at once. The tags and the draft are a small Model of this
 * module's, which the application keeps and folds with `update`: the keys
 * reach `update` as Messages, so it decides from the current draft rather
 * than the one the last frame drew.
 */
export const TagsInputSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  control: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  tag: Slot.make({ capability: Capability.Container }),
  remove: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  input: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.Disabled],
  }),
})

export const Model = Schema.Struct({
  /** Prefixes every id the field draws, unique on the page. */
  id: Schema.String,
  tags: Schema.Array(Schema.String),
  /** The text in the input, not yet a tag. */
  draft: Schema.String,
  /** The key that adds the draft beside Enter (one character), and where a pasted draft splits. */
  delimiter: Schema.String,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  Typed: { text: Schema.String },
  /** Enter or the delimiter was pressed. */
  Committed: {},
  /**
   * Every key pressed in the input. The view cannot tell whether the draft is
   * empty without reading a frame-old Model, so every key comes here and
   * `update` acts on Backspace alone.
   */
  Pressed: { key: Schema.String },
  /** A tag's remove button was pressed; the tag names it, as tags are unique. */
  Removed: { tag: Schema.String },
  CompletedFocusInput: {},
})
export type Message = typeof Message.Type

export const init = (options: {
  readonly id: string
  readonly tags?: ReadonlyArray<string> | undefined
  /** Default `,`. */
  readonly delimiter?: string | undefined
}): Model => ({
  id: options.id,
  tags: options.tags ?? [],
  draft: '',
  delimiter: options.delimiter ?? ',',
})

const inputId = (id: string) => `${id}-input`

// A removed tag's button leaves the page with the focus on it.
const FocusInput = Command.define('FocusInput', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocusInput],
  execute: ({ id }) =>
    Dom.focus(`#${inputId(id)}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocusInput())),
})

/** `tags` with each new, non-empty part of `draft` added; the same array when none is. */
const added = (
  tags: ReadonlyArray<string>,
  draft: string,
  delimiter: string,
): ReadonlyArray<string> => {
  const seen = new Set(tags)
  const fresh = draft
    .split(delimiter)
    .map(part => part.trim())
    .filter(part => {
      if (part === '' || seen.has(part)) return false
      seen.add(part)
      return true
    })
  return fresh.length === 0 ? tags : [...tags, ...fresh]
}

/** The field after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Typed: ({ text }) =>
      text === model.draft ? { model } : { model: modifyFields(model, { draft: () => text }) },
    // A draft refused whole stays, so the reader sees what was not added.
    Committed: () => {
      const tags = added(model.tags, model.draft, model.delimiter)
      return tags === model.tags
        ? { model }
        : { model: modifyFields(model, { tags: () => tags, draft: () => '' }) }
    },
    Pressed: ({ key }) =>
      key === 'Backspace' && model.draft === '' && model.tags.length > 0
        ? { model: modifyFields(model, { tags: () => model.tags.slice(0, -1) }) }
        : { model },
    Removed: ({ tag }) =>
      model.tags.includes(tag)
        ? {
            model: modifyFields(model, { tags: () => model.tags.filter(each => each !== tag) }),
            commands: [FocusInput({ id: model.id })],
          }
        : { model },
    CompletedFocusInput: () => ({ model }),
  })

export interface TagsInputView<Message> {
  readonly model: Model
  /** Lifts the field's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** The input's visible label, which also names the list of tags. */
  readonly label: string
  readonly placeholder?: string | undefined
  readonly disabled?: boolean | undefined
  /** A style of `TagsInputSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof TagsInputSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

export const view = <Outer>(options: TagsInputView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = SlotView.buildersFor(
    TagsInputSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model } = options
  const lift = options.onMessage
  const disabled = options.disabled === true
  const labelId = `${model.id}-label`
  return h.div(builders.root.attrs(), [
    h.label(builders.label.attrs([h.Id(labelId), h.For(inputId(model.id))]), [options.label]),
    h.div(builders.control.attrs([h.DataAttribute('disabled', String(disabled))]), [
      // An empty list would be read as one with no items; it is drawn once it has some.
      ...(model.tags.length === 0
        ? []
        : [
            h.ul(
              builders.list.attrs([h.AriaLabelledBy(labelId)]),
              model.tags.map(tag =>
                h.keyed('li')(tag, builders.tag.attrs(), [
                  tag,
                  h.button(
                    builders.remove.attrs([
                      h.Type('button'),
                      h.AriaLabel(`Remove ${tag}`),
                      ...(disabled
                        ? [h.Disabled(true)]
                        : [h.OnClick(lift(Message.Removed({ tag })))]),
                    ]),
                    ['×'],
                  ),
                ]),
              ),
            ),
          ]),
      h.input(
        builders.input.attrs([
          h.Id(inputId(model.id)),
          h.Type('text'),
          h.Value(model.draft),
          ...(options.placeholder === undefined ? [] : [h.Placeholder(options.placeholder)]),
          ...(disabled
            ? [h.Disabled(true)]
            : [
                h.OnInput(text => lift(Message.Typed({ text }))),
                // Enter adds a tag rather than submitting the form around the field.
                h.OnKeyDownPreventDefault(key =>
                  key === 'Enter' || key === model.delimiter
                    ? Option.some(lift(Message.Committed()))
                    : Option.none(),
                ),
                h.OnKeyDown(key => lift(Message.Pressed({ key }))),
              ]),
        ]),
      ),
    ]),
  ])
}
