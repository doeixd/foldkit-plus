import { Effect, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * A field of tags, Zag's tags input: the tags as a list of chips, each with
 * a remove button, and a text input for the next one. Enter or the
 * delimiter adds the draft, split at the delimiter and trimmed, refusing
 * empty parts, tags already there and tags past `max`; Backspace on an empty
 * draft removes the last tag at once. A refusal is shown: the `message`
 * slot, a polite status region drawn always, says why, and the `control`
 * shakes once (not under reduced motion). The tags and the draft are a small Model of this
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
  message: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

/** Why the last commit added nothing, or not all of the draft. */
export const Refusal = defineTaggedUnion({
  /** `tag` is there already. */
  Repeat: { tag: Schema.String },
  /** The draft held only spaces and delimiters. */
  Empty: {},
  /** The field holds `max` tags. */
  Full: { max: Schema.Number },
})
export type Refusal = typeof Refusal.Type

export const Model = Schema.Struct({
  /** Prefixes every id the field draws, unique on the page. */
  id: Schema.String,
  tags: Schema.Array(Schema.String),
  /** The text in the input, not yet a tag. */
  draft: Schema.String,
  /** The key that adds the draft beside Enter (one character), and where a pasted draft splits. */
  delimiter: Schema.String,
  /** The most tags the field holds; `null` when stored. */
  max: Schema.OptionFromNullOr(Schema.Number),
  /** Why the last commit refused, until the draft or the tags change. */
  refusal: Schema.OptionFromNullOr(Refusal),
  /** Refusals so far: the view alternates the shake by it, so each one replays. */
  refusals: Schema.Number,
  /**
   * The draft last added, until a key shows the input drawn without it: keys
   * typed before the emptied input is drawn arrive with it still in front.
   */
  added: Schema.OptionFromNullOr(Schema.String),
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
  /** The most tags the field holds; no limit when not given. */
  readonly max?: number | undefined
}): Model => ({
  id: options.id,
  tags: options.tags ?? [],
  draft: '',
  delimiter: options.delimiter ?? ',',
  max: Option.fromUndefinedOr(options.max),
  refusal: Option.none(),
  refusals: 0,
  added: Option.none(),
})

const inputId = (id: string) => `${id}-input`
const messageId = (id: string) => `${id}-message`

// A removed tag's button leaves the page with the focus on it.
const FocusInput = Command.define('FocusInput', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocusInput],
  execute: ({ id }) =>
    Dom.focus(`#${inputId(id)}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocusInput())),
})

/**
 * The parts of the draft to add, the new and non-empty ones up to `max`, and
 * why any part was left out: the first repeat, or the limit; a draft of
 * blanks alone is `Empty`, while blanks between parts are a pasted list's.
 */
const commit = (
  model: Model,
): { readonly fresh: ReadonlyArray<string>; readonly refusal: Option.Option<Refusal> } => {
  const parts = model.draft
    .split(model.delimiter)
    .map(part => part.trim())
    .filter(part => part !== '')
  if (parts.length === 0) return { fresh: [], refusal: Option.some(Refusal.Empty()) }
  const seen = new Set(model.tags)
  const room = Option.match(model.max, {
    onNone: () => Infinity,
    onSome: max => Math.max(0, max - model.tags.length),
  })
  const fresh: Array<string> = []
  let refusal: Option.Option<Refusal> = Option.none()
  for (const part of parts) {
    if (seen.has(part)) {
      if (Option.isNone(refusal)) refusal = Option.some(Refusal.Repeat({ tag: part }))
    } else if (fresh.length === room) {
      refusal = Option.map(model.max, max => Refusal.Full({ max }))
      break
    } else {
      seen.add(part)
      fresh.push(part)
    }
  }
  return { fresh, refusal }
}

/** The field after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Typed: ({ text }) => {
      const typed = Option.match(model.added, {
        onNone: () => text,
        onSome: added => (text.startsWith(added) ? text.slice(added.length) : text),
      })
      // A text without it in front was read from the emptied input.
      const drawn = typed === text && Option.isSome(model.added)
      return typed === model.draft && Option.isNone(model.refusal) && !drawn
        ? { model }
        : {
            model: modifyFields(model, {
              draft: () => typed,
              refusal: () => Option.none(),
              added: added => (drawn ? Option.none() : added),
            }),
          }
    },
    Committed: () => {
      // Enter on an empty field is no attempt at a tag.
      if (model.draft === '') return { model }
      const { fresh, refusal } = commit(model)
      return {
        model: modifyFields(model, {
          tags: tags => (fresh.length === 0 ? tags : [...tags, ...fresh]),
          // A draft refused whole stays, so the reader sees what was not added.
          draft: draft => (fresh.length === 0 ? draft : ''),
          refusal: () => refusal,
          refusals: refusals => (Option.isSome(refusal) ? refusals + 1 : refusals),
          added: added => (fresh.length === 0 ? added : Option.some(model.draft)),
        }),
      }
    },
    Pressed: ({ key }) =>
      key === 'Backspace' && model.draft === '' && model.tags.length > 0
        ? {
            model: modifyFields(model, {
              tags: () => model.tags.slice(0, -1),
              refusal: () => Option.none(),
            }),
          }
        : { model },
    Removed: ({ tag }) =>
      model.tags.includes(tag)
        ? {
            model: modifyFields(model, {
              tags: () => model.tags.filter(each => each !== tag),
              refusal: () => Option.none(),
            }),
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
  /** What the `message` slot says of a refusal; default English sentences. */
  readonly refusalText?: ((refusal: Refusal) => string) | undefined
  /** A style of `TagsInputSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof TagsInputSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const refusalText = (refusal: Refusal): string =>
  Refusal.match(refusal, {
    Repeat: ({ tag }) => `${tag} is already added`,
    Empty: () => 'Type a tag to add',
    Full: ({ max }) => `At most ${max} tags`,
  })

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
  const said = Option.map(model.refusal, options.refusalText ?? refusalText)
  // The shake's name alternates with each refusal, so a second one in a row replays it.
  const refused = Option.isSome(model.refusal)
    ? [h.DataAttribute('refused', model.refusals % 2 === 0 ? 'even' : 'odd')]
    : []
  return h.div(builders.root.attrs(), [
    h.label(builders.label.attrs([h.Id(labelId), h.For(inputId(model.id))]), [options.label]),
    h.div(builders.control.attrs([h.DataAttribute('disabled', String(disabled)), ...refused]), [
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
          ...(Option.isSome(said) ? [h.AriaDescribedBy(messageId(model.id))] : []),
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
    // Drawn always, so the region is in place before it speaks.
    h.p(
      builders.message.attrs([h.Id(messageId(model.id)), h.Role('status')]),
      Option.toArray(said),
    ),
  ])
}
