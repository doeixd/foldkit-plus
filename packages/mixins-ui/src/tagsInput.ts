import { Effect, Option, Schema } from 'effect'
import {
  Attr,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type Diagnostic,
  type NamedStyle,
} from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import type { MixinList } from './resolve.js'

/**
 * A field of tags, Zag's tags input: the tags as a list of chips, each with
 * a remove button, and a text input for the next one. Enter or the
 * delimiter adds the draft, split at the delimiter and trimmed, refusing
 * empty parts, tags already there and tags past `max`; Backspace on an empty
 * draft removes the last tag at once. A refusal is shown: the `message`
 * slot, a polite status region drawn always, says why, and the `control`
 * shakes once (not under reduced motion). The tags and the draft are a small Model of this
 * module's, which the application keeps and folds with `update`; `Typed`
 * carries the drawing it read the text from, so a frame behind the keys loses
 * no draft.
 *
 * The chips are one tab stop. ArrowLeft and ArrowRight move among them (and
 * ArrowRight past the last returns to the input), Home and End go to the
 * ends, Backspace and Delete remove the focused one, and ArrowLeft in the
 * input at the start of its text enters the last. Text keys stay the
 * browser's.
 */
export const TagsInputSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  label: Slot.make({ capability: Capability.Container }),
  control: Slot.make({ capability: Capability.Container }),
  list: Slot.make({ capability: Capability.Container }),
  tag: Slot.make({ capability: Capability.Container }),
  remove: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
  input: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.Disabled],
  }),
  message: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  /** One per tag, drawn when the field has a `name`, so a form submits the tags and not the draft. */
  hiddenInput: Slot.make({ capability: Capability.Base, attributes: [Attr.Value] }),
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
  /** Commits that added tags; each drawing of the input sends the count it drew with what it reads. */
  commits: Schema.Number,
  /**
   * The chip holding the tab stop: the one focus last moved to by an arrow
   * key, and the last chip until then.
   */
  chip: Schema.OptionFromNullOr(Schema.String),
  /**
   * The drafts of the latest commits, oldest first, back to the oldest
   * drawing a key has come from: an input drawn before a commit still holds
   * its draft, in front of the keys typed after it.
   */
  added: Schema.Array(Schema.String),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /**
   * The input holds `text`; `drawn` is the `commits` of the Model it was
   * drawn from, so `update` knows which added drafts are still in front.
   */
  Typed: { text: Schema.String, drawn: Schema.Number },
  /** Enter or the delimiter was pressed. */
  Committed: {},
  /**
   * Backspace was pressed in an input holding no text. `update` checks the
   * draft again, since the input read at the press may be a frame ahead of the
   * Model.
   */
  BackspacedEmpty: {},
  /** A tag's remove button was pressed; the tag names it, as tags are unique. */
  Removed: { tag: Schema.String },
  /** Focus moved to a chip by a key, or, with `none`, back to the input. */
  FocusMoved: { chip: Schema.OptionFromNullOr(Schema.String) },
  CompletedFocus: {},
})
export type Message = typeof Message.Type

const DEFAULT_DELIMITER = ','

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
  delimiter: options.delimiter ?? DEFAULT_DELIMITER,
  max: Option.fromUndefinedOr(options.max),
  refusal: Option.none(),
  refusals: 0,
  commits: 0,
  chip: Option.none(),
  added: [],
})

const inputId = (id: string) => `${id}-input`
const messageId = (id: string) => `${id}-message`
const chipId = (id: string, tag: string) => `${id}-chip-${tag}`

// A removed tag's button leaves the page with the focus on it. The id is a
// tag's for a chip, and a tag may hold any text, so it is no bare `#id`.
const Focus = Command.define('Focus', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ id }) =>
    Dom.focus(RovingTabindex.idSelector(id)).pipe(
      Effect.ignore,
      Effect.as(Message.CompletedFocus()),
    ),
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
    Typed: ({ text, drawn }) => {
      // Which drawing read the text says what is in front of it, never the
      // text itself: a frame drawn mid-burst can show a draft that starts
      // like the tag just added.
      const behind = model.commits - drawn
      const unseen = behind > 0 ? model.added.slice(-behind) : []
      const front = unseen.join('')
      const typed = text.startsWith(front) ? text.slice(front.length) : text
      return typed === model.draft &&
        Option.isNone(model.refusal) &&
        unseen.length === model.added.length
        ? { model }
        : {
            model: modifyFields(model, {
              draft: () => typed,
              refusal: () => Option.none(),
              added: () => unseen,
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
          commits: commits => (fresh.length === 0 ? commits : commits + 1),
          added: added => (fresh.length === 0 ? added : [...added, model.draft]),
        }),
      }
    },
    BackspacedEmpty: () =>
      model.draft === '' && model.tags.length > 0
        ? {
            model: modifyFields(model, {
              tags: () => model.tags.slice(0, -1),
              refusal: () => Option.none(),
            }),
          }
        : { model },
    Removed: ({ tag }) => {
      const at = model.tags.indexOf(tag)
      if (at === -1) return { model }
      const tags = model.tags.filter(each => each !== tag)
      // The chip that takes its place, else the one before it, else the input.
      const next = Option.fromNullishOr(tags[Math.min(at, tags.length - 1)])
      return {
        model: modifyFields(model, {
          tags: () => tags,
          refusal: () => Option.none(),
          chip: () => next,
        }),
        commands: [
          Focus({
            id: Option.match(next, {
              onNone: () => inputId(model.id),
              onSome: each => chipId(model.id, each),
            }),
          }),
        ],
      }
    },
    FocusMoved: ({ chip }) =>
      Option.getOrNull(chip) === Option.getOrNull(model.chip)
        ? { model }
        : { model: modifyFields(model, { chip: () => chip }) },
    CompletedFocus: () => ({ model }),
  })

export type Route<Message> = Behaviors.Keys.Route<Model, Message>

export interface TagsInputWords {
  /** A chip's remove button's accessible name; default `Remove <tag>`. */
  readonly remove?: ((tag: string) => string) | undefined
  /** What the remove button draws; default `×`. */
  readonly mark?: string | undefined
}

export interface TagsInputView<Message> {
  readonly model: Model
  /** Lifts the field's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** The input's visible label, which also names the list of tags. */
  readonly label: string
  readonly placeholder?: string | undefined
  /** Submits each tag under this name, one hidden input apiece, in order; the draft is not submitted. */
  readonly name?: string | undefined
  readonly disabled?: boolean | undefined
  /**
   * Adds the draft when the input loses focus, as Enter does, so text left in
   * it is not thrown away. A refused draft stays, and says why. Default
   * `false`: moving to a chip with the arrow keys is a blur too.
   */
  readonly addOnBlur?: boolean | undefined
  /** Default `ltr`; `rtl` swaps the arrows that move among the chips and out of the input. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /**
   * Keys the application answers in the input, beside Enter, the delimiter and
   * Backspace in an empty field: a route on one of those is a diagnostic naming both.
   */
  readonly routes?: ReadonlyArray<Route<NoInfer<Message>>> | undefined
  /** The remove button's words. */
  readonly words?: TagsInputWords | undefined
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

/**
 * The input as the browser has it at this press, which `fieldIsEmpty` and
 * `caretAtStart` read: the Model's draft is a frame behind keys typed in a
 * burst, so a key judged from it would act on text that is gone or miss text
 * that is there. The Model answers where no input is drawn (a Scene test).
 */
const fieldOf = (model: Model): Option.Option<HTMLInputElement> => {
  const field = document.getElementById(inputId(model.id))
  return field instanceof HTMLInputElement ? Option.some(field) : Option.none()
}

const fieldIsEmpty = (model: Model): boolean =>
  Option.match(fieldOf(model), {
    onNone: () => model.draft === '',
    onSome: field => field.value === '',
  })

/** Whether the caret is at the start of the input with nothing selected. */
const caretAtStart = (model: Model): boolean =>
  Option.match(fieldOf(model), {
    onNone: () => model.draft === '',
    onSome: field => field.selectionStart === 0 && field.selectionEnd === 0,
  })

/** What a clash with the input's own keys depends on: the delimiter, and the arrow `rtl` swaps. */
type OwnKeysInput<Outer> = Pick<Model, 'delimiter'> & Pick<TagsInputView<Outer>, 'direction'>

/** The input's own keys: Enter and the delimiter, Backspace in an empty field, and the arrow into the chips. */
const ownRoutes = <Outer>(
  keys: OwnKeysInput<Outer>,
  answers: Readonly<
    Record<
      'Commit' | 'RemoveLast' | 'ToChips',
      (model: Model) => Option.Option<Outer | Behaviors.Keys.Focus<Outer>>
    >
  >,
): ReadonlyArray<Route<Outer>> => [
  Behaviors.Keys.route<Model, Outer>('Commit', {
    on: [Behaviors.Keys.chord('Enter'), Behaviors.Keys.chord(keys.delimiter)],
    handle: ({ input }) => answers.Commit(input),
  }),
  Behaviors.Keys.route<Model, Outer>('RemoveLast', {
    on: [Behaviors.Keys.chord('Backspace')],
    handle: ({ input }) => answers.RemoveLast(input),
  }),
  Behaviors.Keys.route<Model, Outer>('ToChips', {
    on: [Behaviors.Keys.chord(keys.direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft')],
    handle: ({ input }) => answers.ToChips(input),
  }),
]

/**
 * The `mixins:key-conflict` that drawing the input with `routes` would throw,
 * or none: the application's routes against the input's own and against each
 * other. `delimiter` is the Model's (default `,`) and `direction` the view's.
 */
export const conflict = <Outer>(
  routes: ReadonlyArray<Route<Outer>>,
  input: Partial<OwnKeysInput<Outer>> = {},
): Option.Option<Diagnostic> => {
  const none = () => Option.none()
  return Behaviors.Keys.conflict(
    [
      ...ownRoutes<Outer>(
        { delimiter: input.delimiter ?? DEFAULT_DELIMITER, direction: input.direction },
        { Commit: none, RemoveLast: none, ToChips: none },
      ),
      ...routes,
    ],
    Option.some('input'),
  )
}

export const view = <Outer>(options: TagsInputView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const { model, name } = options
  const lift = options.onMessage
  const disabled = options.disabled === true
  const direction = options.direction ?? 'ltr'
  const moved = (tag: Option.Option<string>) => lift(Message.FocusMoved({ chip: tag }))
  const keys = Behaviors.Keys.behavior(TagsInputSlots)<Model, Outer>({
    slot: 'input',
    name: 'TagsInputKeys',
    routes: [
      ...ownRoutes<Outer>(
        { delimiter: model.delimiter, direction },
        {
          Commit: () => Option.some(lift(Message.Committed())),
          RemoveLast: input =>
            input.tags.length > 0 && fieldIsEmpty(input)
              ? Option.some(lift(Message.BackspacedEmpty()))
              : Option.none(),
          ToChips: input =>
            Option.flatMap(Option.fromNullishOr(input.tags.at(-1)), last =>
              caretAtStart(input)
                ? Option.some(
                    Behaviors.Keys.focus(chipId(input.id, last), moved(Option.some(last))),
                  )
                : Option.none(),
            ),
        },
      ),
      ...(options.routes ?? []),
    ],
  })
  const indices = model.tags.map((_, index) => index)
  // The tags this drawing's keys have removed: the Model reaches the next drawing only, so a
  // second Backspace before it would take the chip the first one left, not the one after.
  const removed = new Set<string>()
  const forwardKey = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
  const chipKeys = Behaviors.Keys.attribute<string, Outer>(
    [
      Behaviors.Keys.route<string, Outer>('Chips', {
        on: [
          ...Behaviors.Keys.withShift('Home'),
          ...Behaviors.Keys.withShift('End'),
          ...RovingTabindex.arrowChords('horizontal'),
        ],
        handle: ({ key, modifiers, input: tag }) => {
          const at = model.tags.indexOf(tag)
          // Past the last chip is the input, which `move` would clamp to the chip itself.
          if (key === forwardKey && at === indices.length - 1) {
            return Option.some(Behaviors.Keys.focus(inputId(model.id), moved(Option.none())))
          }
          const next = RovingTabindex.move(indices, at, key, modifiers, {
            orientation: 'horizontal',
            loop: false,
            direction,
          })
          return Option.map(
            Option.fromNullishOr(next === undefined ? undefined : model.tags[next]),
            target => Behaviors.Keys.focus(chipId(model.id, target), moved(Option.some(target))),
          )
        },
      }),
      Behaviors.Keys.route<string, Outer>('Remove', {
        on: [Behaviors.Keys.chord('Backspace'), Behaviors.Keys.chord('Delete')],
        handle: ({ input: tag }) => {
          removed.add(tag)
          const at = model.tags.indexOf(tag)
          const standing = (tags: ReadonlyArray<string>) => tags.filter(each => !removed.has(each))
          // As `update` picks it: the chip that takes its place, else the one before, else the input.
          const next = Option.fromNullishOr(
            standing(model.tags.slice(at + 1))[0] ?? standing(model.tags.slice(0, at)).at(-1),
          )
          return Option.some(
            Behaviors.Keys.focus(
              Option.match(next, {
                onNone: () => inputId(model.id),
                onSome: each => chipId(model.id, each),
              }),
              lift(Message.Removed({ tag })),
            ),
          )
        },
      }),
    ],
    { slot: 'remove' },
  )
  const stop = Option.getOrElse(
    Option.filter(model.chip, tag => model.tags.includes(tag)),
    () => model.tags.at(-1) ?? '',
  )
  const builders = SlotView.buildersFor(
    TagsInputSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      ...(disabled ? [] : [keys.mixin]),
      ...(options.mixins ?? []),
    ],
    { input: model, h },
  )
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
                      h.Id(chipId(model.id, tag)),
                      h.Type('button'),
                      h.Tabindex(tag === stop ? 0 : -1),
                      h.AriaLabel(options.words?.remove?.(tag) ?? `Remove ${tag}`),
                      ...(disabled
                        ? [h.Disabled(true)]
                        : [h.OnClick(lift(Message.Removed({ tag }))), chipKeys({ input: tag, h })]),
                    ]),
                    [options.words?.mark ?? '×'],
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
                h.OnInput(text => lift(Message.Typed({ text, drawn: model.commits }))),
                ...(options.addOnBlur === true ? [h.OnBlur(lift(Message.Committed()))] : []),
              ]),
        ]),
      ),
    ]),
    // Drawn always, so the region is in place before it speaks.
    h.p(
      builders.message.attrs([h.Id(messageId(model.id)), h.Role('status')]),
      Option.toArray(said),
    ),
    ...(name === undefined
      ? []
      : model.tags.map(tag =>
          h.keyed('input')(
            `submit-${tag}`,
            builders.hiddenInput.attrs([h.Type('hidden'), h.Name(name), h.Value(tag)]),
            [],
          ),
        )),
  ])
}
