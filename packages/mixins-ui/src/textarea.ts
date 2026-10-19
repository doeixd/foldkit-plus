import { descriptionId, view as textareaView, type TextareaAttributes } from '@foldkit/ui/textarea'
import { Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, type NamedStyle } from 'foldkit-mixins'
import { FieldValidation } from 'foldkit'
import type { Attribute, ChildAttribute, Html, HtmlBuilder, TextareaAttribute } from 'foldkit/html'
import { descriptionOf, type FieldParts } from './field.js'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

export const TextareaSlots = Slots.define({
  textarea: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.Focus, Event.Blur],
    attributes: [Attr.AriaLabel, Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  /** How many characters are written, and of how many when there is a `maxLength`. */
  count: Slot.make({ capability: Capability.Container }),
  /** The box a field with a footer draws around its text and the footer. */
  frame: Slot.make({ capability: Capability.Container }),
  /** A row of controls under the text, inside the frame. */
  footer: Slot.make({ capability: Capability.Container }),
  /** The row under the field holding its description and its count. */
  meta: Slot.make({ capability: Capability.Container }),
})

/** `12 / 280`, or `12` with no limit: characters as `maxlength` counts them, in UTF-16 units. */
export const countOf = (value: string, maxLength?: number): string =>
  maxLength === undefined ? String(value.length) : `${value.length} / ${maxLength}`

/** How near `value` is to `maxLength`: `near` from nine tenths of it, `at` once it is reached. */
const limitOf = (value: string, maxLength: number): 'under' | 'near' | 'at' => {
  if (value.length >= maxLength) return 'at'
  return value.length >= maxLength * 0.9 ? 'near' : 'under'
}

/**
 * The textarea's bundles with the attached Mixins applied. `textarea` is typed
 * for `h.textarea`, which refuses `InnerHTML`.
 */
export type ResolvedTextarea<Message> = Omit<
  Resolved<TextareaAttributes<Message>, typeof TextareaSlots, Message>,
  'textarea'
> & {
  readonly textarea: ReadonlyArray<TextareaAttribute<Message> | ChildAttribute>
}

/** Applies `mixins` to the textarea's bundles: upstream's, and any of this package's own slots given. */
export const resolve = <Input, Message>(
  attributes: TextareaAttributes<Message> &
    Partial<Record<'count' | 'frame' | 'footer' | 'meta', ReadonlyArray<Attribute<Message>>>>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedTextarea<Message> =>
  // The base bundle holds no `InnerHTML` (its type excludes it) and the resolver
  // refuses one from any Mixin (`mixins:structural-override`), so none is left.
  resolveFor(TextareaSlots, mixins, context)(attributes) as ResolvedTextarea<Message>

/** The textarea's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedTextarea<Message>) => Html,
  ) =>
  (attributes: TextareaAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))

/**
 * A textarea in one call: its value and Messages, a style for its slots, and
 * the rest of `@foldkit/ui`'s own config. `draw` places the resolved
 * bundles: `textarea`, `label` and `description`, and where the field has
 * them `count` (its text is `countOf`), `frame` and `footer` (the box around
 * the text and a row of controls under it), and `meta` (the row under the field).
 */
export interface TextareaView<Message> {
  readonly id: string
  readonly value?: string | undefined
  readonly onInput?: ((value: string) => Message) | undefined
  readonly disabled?: boolean | undefined
  readonly readOnly?: boolean | undefined
  readonly invalid?: boolean | undefined
  readonly described?: boolean | undefined
  /** The lines it shows; under the recipe's `resize: 'auto'`, the fewest it shrinks to. */
  readonly rows?: number | undefined
  /** Under the recipe's `resize: 'auto'`, the most lines it grows to before it scrolls. */
  readonly maxRows?: number | undefined
  /** The most characters it takes (`maxlength`). */
  readonly maxLength?: number | undefined
  /** Whether a `count` is drawn: the textarea is then described by it as well. */
  readonly count?: boolean | undefined
  readonly name?: string | undefined
  readonly placeholder?: string | undefined
  /** A style of `TextareaSlots`, for the textarea's own look. */
  readonly style?: NamedStyle<typeof TextareaSlots> | undefined
  /** Mixins beside the style, for state or behavior the style does not own. */
  readonly mixins?: MixinList<Message> | undefined
  /** What an input-driven Mixin reads; omit it when no attached Mixin reads one. */
  readonly input?: unknown
  readonly draw: (resolved: ResolvedTextarea<Message>, h: HtmlBuilder<Message>) => Html
}

const whole = (name: string, value: number | undefined, least: number) => {
  if (value !== undefined && (!Number.isInteger(value) || value < least)) {
    throw new Error(`Textarea: ${name} must be a whole number from ${least}, not ${value}`)
  }
}

export const view = <Message>(options: TextareaView<Message>, h: HtmlBuilder<Message>): Html => {
  whole('rows', options.rows, 1)
  whole('maxRows', options.maxRows, options.rows ?? 1)
  whole('maxLength', options.maxLength, 0)
  const counted = options.count === true
  const { maxLength } = options
  const countId = `${options.id}-count`
  // Upstream links the description alone, so with a count both are linked here.
  const describedBy = [
    ...(options.described === true ? [descriptionId(options.id)] : []),
    ...(counted ? [countId] : []),
  ]
  // The lines `resize: 'auto'` grows between, for the recipe to read.
  const lines = {
    ...(options.rows === undefined ? {} : { '--fk-textarea-rows': String(options.rows) }),
    ...(options.maxRows === undefined ? {} : { '--fk-textarea-max-rows': String(options.maxRows) }),
  }
  const extra: ReadonlyArray<TextareaAttribute<Message>> = [
    ...(maxLength === undefined ? [] : [h.Maxlength(maxLength)]),
    ...(counted ? [h.AriaDescribedBy(describedBy.join(' '))] : []),
    ...(Object.keys(lines).length === 0 ? [] : [h.Style(lines)]),
  ]
  const mixins = [
    ...(options.style === undefined ? [] : [options.style.mixin]),
    ...(options.mixins ?? []),
  ]
  return textareaView(
    {
      id: options.id,
      ...(options.value === undefined ? {} : { value: options.value }),
      ...(options.onInput === undefined ? {} : { onInput: options.onInput }),
      ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
      ...(options.readOnly === undefined ? {} : { isReadOnly: options.readOnly }),
      ...(options.invalid === undefined ? {} : { isInvalid: options.invalid }),
      ...(options.described === undefined || counted ? {} : { hasDescription: options.described }),
      ...(options.rows === undefined ? {} : { rows: options.rows }),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      toView: attributes =>
        options.draw(
          resolve(
            {
              ...attributes,
              textarea: [...attributes.textarea, ...extra],
              count: [
                h.Id(countId),
                ...(maxLength === undefined
                  ? []
                  : [h.DataAttribute('limit', limitOf(options.value ?? '', maxLength))]),
              ],
              frame: [h.DataAttribute('textarea-frame', '')],
            },
            mixins,
            { input: options.input, h },
          ),
          h,
        ),
    },
    h,
  )
}

/** A textarea field's pieces, drawn: a text field's, and its count (`h.empty` where it is not drawn). */
export interface TextareaParts extends FieldParts {
  readonly count: Html
}

/**
 * A textarea field in one call: a field's state drawn through `view` with
 * its label, control, and description placed. The value is drawn with
 * `String()`, as the base field view draws any draft. `draw` places the
 * parts; the default stacks them, the description and the count sharing the
 * row under the field. With a `footer`, the control is a frame holding the
 * text and the footer under it, the count at the footer's end. `rows`,
 * `maxRows`, `maxLength` and `placeholder` ride through only where given.
 */
export interface TextareaField<Message> {
  readonly id: string
  readonly label: string
  readonly field: FieldValidation.Field<unknown>
  readonly changed: (value: string) => Message
  readonly rows?: number | undefined
  readonly maxRows?: number | undefined
  readonly maxLength?: number | undefined
  /** Whether to draw how many characters are written; default whether there is a `maxLength`. */
  readonly count?: boolean | undefined
  /** Controls in a row under the text, inside the field's box: a toolbar, a send button. */
  readonly footer?: ReadonlyArray<Html> | undefined
  readonly placeholder?: string | undefined
  /** A style of `TextareaSlots`, for the field's own look. */
  readonly style?: NamedStyle<typeof TextareaSlots> | undefined
  /** Mixins beside the style, for state or behavior the style does not own. */
  readonly mixins?: MixinList<Message> | undefined
  /** Places the parts: `control` holds the footer, and the count when the footer does. */
  readonly draw?: ((parts: TextareaParts, h: HtmlBuilder<Message>) => Html) | undefined
}

export const field = <Message>(options: TextareaField<Message>, h: HtmlBuilder<Message>): Html => {
  const description = descriptionOf(options.field)
  const value = String(options.field.value)
  const counted = options.count ?? options.maxLength !== undefined
  const { footer } = options
  return view(
    {
      id: options.id,
      value,
      onInput: options.changed,
      invalid: FieldValidation.isInvalid(options.field),
      described: Option.isSome(description),
      count: counted,
      ...(options.rows === undefined ? {} : { rows: options.rows }),
      ...(options.maxRows === undefined ? {} : { maxRows: options.maxRows }),
      ...(options.maxLength === undefined ? {} : { maxLength: options.maxLength }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      style: options.style,
      mixins: options.mixins,
      input: options.field,
      draw: (resolved, h) => {
        const count = counted
          ? h.span(resolved.count, [countOf(value, options.maxLength)])
          : h.empty
        const text = h.textarea(resolved.textarea)
        const parts: TextareaParts = {
          label: h.label(resolved.label, [options.label]),
          control:
            footer === undefined
              ? text
              : h.div(resolved.frame, [text, h.div(resolved.footer, [...footer, count])]),
          description: Option.match(description, {
            onNone: () => h.empty,
            onSome: text => h.span(resolved.description, [text]),
          }),
          count: footer === undefined ? count : h.empty,
        }
        if (options.draw !== undefined) return options.draw(parts, h)
        // A count under the field shares its row with the description.
        const under =
          counted && footer === undefined
            ? h.div(resolved.meta, [parts.description, parts.count])
            : parts.description
        return h.div([], [parts.label, parts.control, under])
      },
    },
    h,
  )
}
