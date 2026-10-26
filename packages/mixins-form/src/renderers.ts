/**
 * The renderers this package ships, by kind. They live apart from the view so
 * the `/ui` entry can draw the same elements through another component's
 * Slots.
 */
import { Input } from 'foldkit-form'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { FieldAttrs, Option, RenderContext, Renderer } from './index.js'

/** A renderer for every kind of control `foldkit-form` ships and shows. */
export type Shipped<Message> = {
  readonly [
    Kind in
      | 'Text'
      | 'Multiline'
      | 'Number'
      | 'Toggle'
      | 'Select'
      | 'RelationOne'
      | 'Choices'
      | 'RelationMany'
  ]: Renderer<Message>
}

/** What a `Select` or a `Choices` control offers: the options its schema spells out. */
export const literalOptions = (control: RenderContext<unknown>['control']): ReadonlyArray<Option> =>
  (Input.Select.is(control) || Input.Choices.is(control) ? control.data.options : []).map(
    option => ({ value: String(option), label: String(option) }),
  )

/** Types whose text is an address or a number, which a keyboard must not capitalize or correct. */
export const LITERAL_TYPES: ReadonlySet<string> = new Set(['email', 'tel', 'url'])

/**
 * The choices, and after them each chosen value they lack, as `? value`: a
 * stored id whose row is gone, or a value the choices have not loaded yet,
 * stays shown and can be let go, rather than dropped from sight.
 */
export const withChosen = (
  options: ReadonlyArray<Option>,
  chosen: ReadonlyArray<string>,
): ReadonlyArray<Option> => {
  const known = new Set(options.map(option => option.value))
  return [
    ...options,
    ...chosen
      .filter(value => value !== '' && !known.has(value))
      .map(value => ({ value, label: `? ${value}` })),
  ]
}

/**
 * The renderers this package ships, by kind. They are entries like any other: an
 * application adds `Date`, or replaces `RelationOne` with a combobox, by passing
 * its own beside them.
 */
export const plainRenderers = <Message>(): Shipped<Message> => {
  const typed = ({ state, draft, change, blurred, h }: RenderContext<Message>) => [
    ...state,
    h.Value(String(draft)),
    h.OnInput(change),
    h.OnBlur(blurred),
  ]
  // A blank option whenever nothing is chosen, required or not: without one the
  // browser shows its first option as chosen while the draft is still empty.
  const pick = (
    { state, draft, change, blurred, input, slots, h }: RenderContext<Message>,
    options: ReadonlyArray<Option>,
    blank: boolean,
  ): Html =>
    h.select(slots.select.attrs([...state, h.OnChange(change), h.OnBlur(blurred)]), [
      ...(blank || draft === ''
        ? [
            h.option(slots.option.attrs([h.Value(''), h.Selected(draft === '')]), [
              input.noneWord ?? '',
            ]),
          ]
        : []),
      ...withChosen(options, typeof draft === 'string' ? [draft] : []).map(option =>
        h.option(slots.option.attrs([h.Value(option.value), h.Selected(draft === option.value)]), [
          option.label,
        ]),
      ),
    ])
  /** What a phone's keyboard and the browser's autofill should offer, from the key's attrs. */
  const keyboard = <M>({
    attrs,
    h,
  }: {
    readonly attrs: FieldAttrs
    readonly h: HtmlBuilder<M>
  }) => {
    const literal = attrs.type !== undefined && LITERAL_TYPES.has(attrs.type)
    const capitalize = attrs.autocapitalize ?? (literal ? 'none' : undefined)
    const spellcheck = attrs.spellcheck ?? (literal ? false : undefined)
    return [
      ...(attrs.autocomplete === undefined
        ? []
        : [h.Attribute('autocomplete', attrs.autocomplete)]),
      ...(attrs.enterKeyHint === undefined
        ? []
        : [h.Attribute('enterkeyhint', attrs.enterKeyHint)]),
      ...(capitalize === undefined ? [] : [h.Attribute('autocapitalize', capitalize)]),
      ...(spellcheck === undefined ? [] : [h.Attribute('spellcheck', String(spellcheck))]),
    ]
  }
  return {
    Text: context =>
      context.h.input(
        context.slots.text.attrs([
          ...typed(context),
          ...keyboard(context),
          ...(context.attrs.inputMode === undefined
            ? []
            : [context.h.InputMode(context.attrs.inputMode)]),
          context.h.Type(context.attrs.type ?? 'text'),
          ...(context.attrs.placeholder === undefined
            ? []
            : [context.h.Placeholder(context.attrs.placeholder)]),
        ]),
      ),
    Multiline: context =>
      // A textarea's attributes exclude `InnerHTML`, which a slot's type admits
      // and no mixin can supply, so the narrowing loses nothing.
      context.h.textarea(
        context.slots.multiline.attrs([
          ...typed(context),
          ...keyboard(context),
          ...(context.attrs.placeholder === undefined
            ? []
            : [context.h.Placeholder(context.attrs.placeholder)]),
          ...(context.attrs.rows === undefined
            ? []
            : [context.h.Attribute('rows', String(context.attrs.rows))]),
        ]) as Parameters<typeof context.h.textarea>[0],
      ),
    // A number is a text input because its draft is text: `"4."` is a fine thing to
    // have typed, and `type="number"` would refuse to report it.
    Number: context =>
      context.h.input(
        context.slots.number.attrs([
          ...typed(context),
          ...keyboard(context),
          context.h.Type('text'),
          // `decimal` has no minus on iOS: a field that takes negatives says `text`, and one of
          // whole numbers `numeric`.
          context.h.InputMode(context.attrs.inputMode ?? 'decimal'),
          ...(context.attrs.placeholder === undefined
            ? []
            : [context.h.Placeholder(context.attrs.placeholder)]),
        ]),
      ),
    Toggle: ({ state, draft, change, blurred, slots, h }) =>
      h.input(
        slots.toggle.attrs([
          ...state,
          h.Type('checkbox'),
          h.Checked(draft === true),
          h.OnClick(change(draft !== true)),
          h.OnBlur(blurred),
        ]),
      ),
    Select: context =>
      pick(context, literalOptions(context.control), !context.input.control.required),
    RelationOne: context => pick(context, context.input.options, true),
    // A key of any number of choices, whether the options come from the schema
    // (`Choices`) or from the application's own list (`RelationMany`).
    Choices: context => choiceGroup(context, literalOptions(context.control)),
    RelationMany: context => choiceGroup(context, context.input.options),
  }
}

const GROUP_STATE: ReadonlySet<string> = new Set([
  'Id',
  'AriaInvalid',
  'AriaBusy',
  'AriaDescribedBy',
])

/**
 * A group's share of the control's state: its id, validity and descriptions.
 * The name and `disabled` go on each checkbox, and a group takes no `aria-required`.
 */
export const groupState = <Message>(
  state: RenderContext<Message>['state'],
): RenderContext<Message>['state'] => state.filter(attribute => GROUP_STATE.has(attribute._tag))

/** The values a choice draft holds. */
export const chosenOf = (draft: RenderContext<unknown>['draft']): ReadonlyArray<string> =>
  Array.isArray(draft) ? (draft as ReadonlyArray<string>) : []

/** The values chosen after a press on `value`: let go if it was chosen, added if not. */
export const pressed = (chosen: ReadonlyArray<string>, value: string): ReadonlyArray<string> =>
  chosen.includes(value) ? chosen.filter(held => held !== value) : [...chosen, value]

/** A key of any number of choices: each one a checkbox in its own label. */
export const choiceGroup = <Message>(
  { input, draft, change, state, slots, h }: RenderContext<Message>,
  options: ReadonlyArray<Option>,
): Html => {
  const chosen = chosenOf(draft)
  const isChosen = new Set(chosen)
  return h.div(
    slots.choices.attrs([...groupState(state), h.Role('group'), h.AriaLabel(input.control.label)]),
    withChosen(options, chosen).map(option =>
      h.label(slots.choiceLabel.attrs(), [
        h.input(
          slots.choice.attrs([
            h.Type('checkbox'),
            h.Name(input.control.key),
            h.Value(option.value),
            h.Checked(isChosen.has(option.value)),
            ...(input.locked === true ? [h.Disabled(true)] : []),
            h.OnClick(change(pressed(chosen, option.value))),
          ]),
        ),
        option.label,
      ]),
    ),
  )
}
