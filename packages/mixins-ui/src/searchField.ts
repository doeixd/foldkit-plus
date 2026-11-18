import { Effect, Option, Schema } from 'effect'
import {
  A11y,
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
import { AdornmentSlots, GROUP_MARK, type Adornments } from './adornments.js'
import { onInputOf, type OnInput } from './field.js'
import type { MixinList } from './resolve.js'

/**
 * A text field for searching: a native `type="search"` input (role
 * `searchbox`) in one box with a magnifier at its start (or your own `start`)
 * and a button that clears it, drawn only while there is text. The view holds
 * no state: the application owns the text, `onInput` reports typing and
 * `clear.onClear` is what the button and Escape send. Escape clears only a
 * field with text, so on an empty one it reaches an enclosing dialog.
 *
 * Pressing the button removes it, and the focus it held with it. Answer
 * `onClear` with `Focus`, which puts focus back on the input; a Mount could do
 * it without the application, but one that sends no Message cannot be
 * resolved by a Scene test of every page drawing the field.
 */
export const SearchFieldSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  ...AdornmentSlots,
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.AriaLabel, Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  clear: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
})

/** The input's role is native `searchbox`; the name has to be given, and clearing must be a control. */
export const SearchFieldPattern = A11y.pattern({
  input: {
    capability: Capability.TextInput,
    events: [Event.Input, Event.KeyDown],
    attributes: [Attr.AriaLabel],
  },
  clear: {
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  },
})

export const Message = defineMessageUnion({
  /** `Focus` ran; nothing to change. */
  CompletedFocus: {},
})
export type Message = typeof Message.Type

/** The id of the field's input, for `id` given to `view`. */
export const inputId = (id: string): string => `${id}-input`

/** Focuses the input of the field with `id`; a missing input is not an error. */
export const Focus = Command.define('SearchField.Focus', {
  args: { id: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ id }) =>
    Dom.focus(`#${inputId(id)}`).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
})

/** A key the field answers beside Escape; its input is the text. */
export type Route<Message> = Behaviors.Keys.Route<string, Message>

export interface SearchFieldWords {
  /** The clear button's name; default `Clear search`. */
  readonly clear?: string | undefined
}

export interface SearchFieldView<Message> extends Adornments {
  /** Prefixes the ids the field draws, unique on the page. */
  readonly id: string
  /** The input's accessible name: a search field wears no visible label. */
  readonly label: string
  readonly value: string
  /** What typing sends; a resumable builder's `OnInput` attribute names it in the server's markup. */
  readonly onInput: OnInput<NoInfer<Message>>
  /**
   * The clear button and Escape's clearing: with none, the field has neither.
   * `onClear` is sent by both on a field with text; answer it with `Focus`.
   * `content` is drawn in the button in place of the cross.
   */
  readonly clear?:
    | { readonly onClear: NoInfer<Message>; readonly content?: Html | undefined }
    | undefined
  /** A search is running: `aria-busy` on the input and `data-busy` on the field. Compose a spinner into `end`. */
  readonly busy?: boolean | undefined
  readonly placeholder?: string | undefined
  readonly invalid?: boolean | undefined
  /** A disabled field takes no text or keys and draws no clear button. */
  readonly disabled?: boolean | undefined
  readonly words?: SearchFieldWords | undefined
  /**
   * Keys the application answers in the field, such as ArrowDown opening
   * results. They share one keydown owner with Escape: a route on the same
   * gesture as another is a diagnostic naming both.
   */
  readonly routes?: ReadonlyArray<Route<NoInfer<Message>>> | undefined
  /** A style of `SearchFieldSlots`, for the field's look. */
  readonly style?: NamedStyle<typeof SearchFieldSlots> | undefined
  /** Mixins beside the style; an input-driven one reads the text. */
  readonly mixins?: MixinList<Message> | undefined
}

/** The field's own key: Escape clears the words it holds. */
const ownRoutes = <Message>(
  clear: (words: string) => Option.Option<Message>,
): ReadonlyArray<Route<Message>> => [
  Behaviors.Keys.route<string, Message>('Clear', {
    on: [Behaviors.Keys.chord('Escape')],
    handle: ({ input }) => clear(input),
  }),
]

/**
 * The `mixins:key-conflict` that drawing the field with `routes` would throw,
 * or none: the application's routes against Escape and against each other.
 */
export const conflict = <Message>(
  routes: ReadonlyArray<Route<Message>>,
): Option.Option<Diagnostic> =>
  Behaviors.Keys.conflict(
    [...ownRoutes<Message>(() => Option.none()), ...routes],
    Option.some('input'),
  )

export const view = <Message>(options: SearchFieldView<Message>, h: HtmlBuilder<Message>): Html => {
  const disabled = options.disabled === true
  const { clear } = options
  const keys = Behaviors.Keys.behavior(SearchFieldSlots)<string, Message>({
    slot: 'input',
    name: 'SearchFieldKeys',
    routes: [
      ...(clear === undefined
        ? []
        : ownRoutes<Message>(words => (words === '' ? Option.none() : Option.some(clear.onClear)))),
      ...(options.routes ?? []),
    ],
  })
  const builders = SlotView.buildersFor(
    SearchFieldSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      ...(disabled ? [] : [keys.mixin]),
      ...(options.mixins ?? []),
    ],
    { input: options.value, h },
  )
  return h.div(builders.root.attrs(options.busy === true ? [h.DataAttribute('busy', '')] : []), [
    h.div(builders.group.attrs([h.DataAttribute(GROUP_MARK, '')]), [
      // Always drawn: empty, the recipe puts a magnifier in it.
      h.span(builders.start.attrs(), options.start === undefined ? [] : [options.start]),
      h.input(
        builders.input.attrs([
          h.Id(inputId(options.id)),
          h.Type('search'),
          h.Value(options.value),
          h.AriaLabel(options.label),
          // Its own spelling checks and completions would draw over a query box.
          h.Autocomplete('off'),
          h.Spellcheck(false),
          ...(options.placeholder === undefined ? [] : [h.Placeholder(options.placeholder)]),
          ...(options.invalid === true ? [h.AriaInvalid(true)] : []),
          ...(options.busy === true ? [h.AriaBusy(true)] : []),
          ...(disabled ? [h.Disabled(true)] : [onInputOf(h, options.onInput)]),
        ]),
      ),
      ...(options.end === undefined ? [] : [h.span(builders.end.attrs(), [options.end])]),
      ...(clear === undefined || options.value === '' || disabled
        ? []
        : [
            h.button(
              builders.clear.attrs([
                h.Id(`${options.id}-clear`),
                h.Type('button'),
                h.AriaLabel(options.words?.clear ?? 'Clear search'),
                h.OnClick(clear.onClear),
                ...(clear.content === undefined ? [] : [h.DataAttribute('content', '')]),
              ]),
              clear.content === undefined ? [] : [clear.content],
            ),
          ]),
    ]),
  ])
}
