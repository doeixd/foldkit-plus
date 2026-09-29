import { view as inputView, type InputAttributes } from '@foldkit/ui/input'
import { Attr, Capability, Event, Slot, Slots, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

export const InputSlots = Slots.define({
  input: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.Focus, Event.Blur],
    attributes: [Attr.AriaLabel, Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
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
  readonly onInput?: ((value: string) => Message) | undefined
  readonly disabled?: boolean | undefined
  readonly invalid?: boolean | undefined
  readonly described?: boolean | undefined
  readonly type?: string | undefined
  readonly placeholder?: string | undefined
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
      ...(options.onInput === undefined ? {} : { onInput: options.onInput }),
      ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
      ...(options.invalid === undefined ? {} : { isInvalid: options.invalid }),
      ...(options.described === undefined ? {} : { hasDescription: options.described }),
      ...(options.type === undefined ? {} : { type: options.type }),
      ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
      toView: toView(
        [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
        { input: options.input, h },
        resolved => options.draw(resolved, h),
      ),
    },
    h,
  )
