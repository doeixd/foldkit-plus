import { view as textareaView, type TextareaAttributes } from '@foldkit/ui/textarea'
import { Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, type NamedStyle } from 'foldkit-mixins'
import { FieldValidation } from 'foldkit'
import type { ChildAttribute, Html, HtmlBuilder, TextareaAttribute } from 'foldkit/html'
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
})

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

/** Applies `mixins` to the textarea's bundles. */
export const resolve = <Input, Message>(
  attributes: TextareaAttributes<Message>,
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
 * `textarea`, `label`, and `description` bundles.
 */
export interface TextareaView<Message> {
  readonly id: string
  readonly value?: string | undefined
  readonly onInput?: ((value: string) => Message) | undefined
  readonly disabled?: boolean | undefined
  readonly invalid?: boolean | undefined
  readonly described?: boolean | undefined
  readonly rows?: number | undefined
  readonly placeholder?: string | undefined
  /** A style of `TextareaSlots`, for the textarea's own look. */
  readonly style?: NamedStyle<typeof TextareaSlots> | undefined
  /** Mixins beside the style, for state or behavior the style does not own. */
  readonly mixins?: MixinList<Message> | undefined
  /** What an input-driven Mixin reads; omit it when no attached Mixin reads one. */
  readonly input?: unknown
  readonly draw: (resolved: ResolvedTextarea<Message>, h: HtmlBuilder<Message>) => Html
}

export const view = <Message>(options: TextareaView<Message>, h: HtmlBuilder<Message>): Html =>
  textareaView(
    {
      id: options.id,
      ...(options.value === undefined ? {} : { value: options.value }),
      ...(options.onInput === undefined ? {} : { onInput: options.onInput }),
      ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
      ...(options.invalid === undefined ? {} : { isInvalid: options.invalid }),
      ...(options.described === undefined ? {} : { hasDescription: options.described }),
      ...(options.rows === undefined ? {} : { rows: options.rows }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      toView: toView(
        [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
        { input: options.input, h },
        resolved => options.draw(resolved, h),
      ),
    },
    h,
  )

/**
 * A textarea field in one call: a field's state drawn through `view` with
 * its label, control, and description placed. The value is drawn with
 * `String()`, as the base field view draws any draft. `draw`
 * places the parts; the default stacks them. `rows` and `placeholder` ride
 * through only where given. Custom drawers stay for controls with no
 * shipped renderer.
 */
export interface TextareaField<Message> {
  readonly id: string
  readonly label: string
  readonly field: FieldValidation.Field<unknown>
  readonly changed: (value: string) => Message
  readonly rows?: number | undefined
  readonly placeholder?: string | undefined
  /** A style of `TextareaSlots`, for the field's own look. */
  readonly style?: NamedStyle<typeof TextareaSlots> | undefined
  /** Mixins beside the style, for state or behavior the style does not own. */
  readonly mixins?: MixinList<Message> | undefined
  readonly draw?: ((parts: FieldParts, h: HtmlBuilder<Message>) => Html) | undefined
}

export const field = <Message>(options: TextareaField<Message>, h: HtmlBuilder<Message>): Html => {
  const description = descriptionOf(options.field)
  return view(
    {
      id: options.id,
      value: String(options.field.value),
      onInput: options.changed,
      invalid: FieldValidation.isInvalid(options.field),
      described: Option.isSome(description),
      ...(options.rows === undefined ? {} : { rows: options.rows }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      style: options.style,
      mixins: options.mixins,
      input: options.field,
      draw: (resolved, h) => {
        const parts: FieldParts = {
          label: h.label(resolved.label, [options.label]),
          control: h.textarea(resolved.textarea),
          description: Option.match(description, {
            onNone: () => h.empty,
            onSome: text => h.span(resolved.description, [text]),
          }),
        }
        return options.draw === undefined
          ? h.div([], [parts.label, parts.control, parts.description])
          : options.draw(parts, h)
      },
    },
    h,
  )
}
