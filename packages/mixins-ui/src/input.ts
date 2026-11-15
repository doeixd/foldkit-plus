import { view as inputView, type InputAttributes } from '@foldkit/ui/input'
import { Option } from 'effect'
import { Attr, Capability, Event, Slot, Slots, type NamedStyle } from 'foldkit-mixins'
import { FieldValidation } from 'foldkit'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { descriptionOf, onInputOf, statusOf, type FieldParts, type OnInput } from './field.js'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

export const InputSlots = Slots.define({
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.Focus, Event.Blur, Event.KeyDown],
    attributes: [Attr.AriaLabel, Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

/** The input's bundles with the attached Mixins applied. */
export type ResolvedInput<Message> = Resolved<InputAttributes<Message>, typeof InputSlots, Message>

/** Applies `mixins` to the input's bundles. */
export const resolve = <Input, Message>(
  attributes: InputAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedInput<Message> => resolveFor(InputSlots, mixins, context)(attributes)

/** The input's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedInput<Message>) => Html,
  ) =>
  (attributes: InputAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))

/**
 * An input in one call: its value and Messages, a style for its slots, and
 * the rest of `@foldkit/ui`'s own config. `draw` places the resolved `input`,
 * `label`, and `description` bundles; this covers the common case, while
 * `toView` stays for one drawn as something else.
 */
export interface InputView<Message> {
  readonly id: string
  readonly value?: string | undefined
  /** What typing sends; a resumable builder's `OnInput` attribute names it in the server's markup. */
  readonly onInput?: OnInput<Message> | undefined
  readonly disabled?: boolean | undefined
  readonly invalid?: boolean | undefined
  readonly described?: boolean | undefined
  readonly type?: string | undefined
  readonly placeholder?: string | undefined
  /** The form field the value submits under. */
  readonly name?: string | undefined
  /** The value can be read and selected, not edited; no input is handled. */
  readonly readOnly?: boolean | undefined
  /** The field must be filled to submit: the native `required` and `aria-required`. */
  readonly required?: boolean | undefined
  /** What the browser may fill in, as the HTML `autocomplete` attribute takes it. */
  readonly autocomplete?: string | undefined
  /** The keyboard a phone offers, as the HTML `inputmode` attribute takes it. */
  readonly inputMode?:
    | 'none'
    | 'text'
    | 'decimal'
    | 'numeric'
    | 'tel'
    | 'search'
    | 'email'
    | 'url'
    | undefined
  /** The most characters it takes (`maxlength`). */
  readonly maxLength?: number | undefined
  /**
   * Attributes added to a Slot before the mixins resolve, as `Button.view`'s
   * and `PasswordInput.view`'s are: a blur handler, `aria-busy`. Plain attributes, as
   * the input's own bundle holds, not the child attributes a Button takes. A class among
   * them joins the recipe's, and an owned event or attribute among them is a conflict.
   */
  readonly attributes?:
    | { readonly [K in keyof typeof InputSlots]?: ReadonlyArray<Attribute<NoInfer<Message>>> }
    | undefined
  /** A style of `InputSlots`, for the input's own look. */
  readonly style?: NamedStyle<typeof InputSlots> | undefined
  /** Mixins beside the style, for state or behavior the style does not own. */
  readonly mixins?: MixinList<Message> | undefined
  /** What an input-driven Mixin reads; omit it when no attached Mixin reads one. */
  readonly input?: unknown
  readonly draw: (resolved: ResolvedInput<Message>, h: HtmlBuilder<Message>) => Html
}

export const view = <Message>(options: InputView<Message>, h: HtmlBuilder<Message>): Html =>
  inputView(
    {
      id: options.id,
      ...(options.value === undefined ? {} : { value: options.value }),
      ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
      ...(options.invalid === undefined ? {} : { isInvalid: options.invalid }),
      ...(options.described === undefined ? {} : { hasDescription: options.described }),
      ...(options.type === undefined ? {} : { type: options.type }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...(options.readOnly === undefined ? {} : { isReadOnly: options.readOnly }),
      toView: attributes =>
        options.draw(
          resolve(
            {
              ...attributes,
              input: [
                ...attributes.input,
                // Bound here: `@foldkit/ui`'s own `onInput` takes a closure alone.
                ...(options.onInput === undefined ||
                options.disabled === true ||
                options.readOnly === true
                  ? []
                  : [onInputOf(h, options.onInput)]),
                ...(options.required === true ? [h.Required(true), h.AriaRequired(true)] : []),
                ...(options.autocomplete === undefined
                  ? []
                  : [h.Autocomplete(options.autocomplete)]),
                ...(options.inputMode === undefined ? [] : [h.InputMode(options.inputMode)]),
                ...(options.maxLength === undefined ? [] : [h.Maxlength(options.maxLength)]),
                ...(options.attributes?.input ?? []),
              ],
              label: [...attributes.label, ...(options.attributes?.label ?? [])],
              description: [...attributes.description, ...(options.attributes?.description ?? [])],
            },
            [
              ...(options.style === undefined ? [] : [options.style.mixin]),
              ...(options.mixins ?? []),
            ],
            { input: options.input, h },
          ),
          h,
        ),
    },
    h,
  )

/**
 * A text field in one call: a field's state drawn through `view` with its
 * label, control, and description placed. The value is drawn with
 * `String()`, as the base field view draws any draft. `draw` places
 * the parts; the default stacks them. `type` and `placeholder` ride through
 * only where given. Custom drawers stay for controls with no shipped
 * renderer.
 */
export interface InputField<Message> {
  readonly id: string
  readonly label: string
  readonly field: FieldValidation.Field<unknown>
  readonly changed: (value: string) => Message
  readonly type?: string | undefined
  readonly placeholder?: string | undefined
  /** A style of `InputSlots`, for the field's own look. */
  readonly style?: NamedStyle<typeof InputSlots> | undefined
  /** Mixins beside the style, for state or behavior the style does not own. */
  readonly mixins?: MixinList<Message> | undefined
  readonly draw?: ((parts: FieldParts, h: HtmlBuilder<Message>) => Html) | undefined
}

export const field = <Message>(options: InputField<Message>, h: HtmlBuilder<Message>): Html => {
  const description = descriptionOf(options.field)
  return view(
    {
      id: options.id,
      value: String(options.field.value),
      onInput: options.changed,
      invalid: FieldValidation.isInvalid(options.field),
      described: Option.isSome(description),
      ...(options.type === undefined ? {} : { type: options.type }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      style: options.style,
      mixins: options.mixins,
      input: options.field,
      draw: (resolved, h) => {
        const parts: FieldParts = {
          label: h.label(resolved.label, [options.label]),
          control: h.input(resolved.input),
          description: statusOf(h, resolved.description, description),
        }
        return options.draw === undefined
          ? h.div([], [parts.label, parts.control, parts.description])
          : options.draw(parts, h)
      },
    },
    h,
  )
}
