import { view as buttonView, type ButtonAttributes } from '@foldkit/ui/button'
import { Attr, Capability, Event, Slot, Slots, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/**
 * The button publishes one slot. `click` is owned by the base `OnClick` when
 * the button is interactive, so a Behavior that adds its own click handler is a
 * conflict rather than a second silent owner.
 */
export const ButtonSlots = Slots.define({
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaDisabled, Attr.Disabled],
  }),
})

/** The button's bundles with the attached Mixins applied. */
export type ResolvedButton<Message> = Resolved<
  ButtonAttributes<Message>,
  typeof ButtonSlots,
  Message
>

/** Applies `mixins` to the button's bundles. */
export const resolve = <Input, Message>(
  attributes: ButtonAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedButton<Message> => resolveFor(ButtonSlots, mixins, context)(attributes)

/** The button's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedButton<Message>) => Html,
  ) =>
  (attributes: ButtonAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))

/**
 * A button in one call: the label, a style for its slot, and the rest of
 * `@foldkit/ui`'s own config. `toView` stays for a button drawn as something
 * else (an `a`, a split control); this covers the common case.
 */
export interface ButtonView<Message> {
  /** The button's text. */
  readonly label: string
  /** A style of `ButtonSlots`, for the button's own look. */
  readonly style?: NamedStyle<typeof ButtonSlots> | undefined
  /** Mixins beside the style, for state or behavior the style does not own. */
  readonly mixins?: MixinList<Message> | undefined
  /** What an input-driven Mixin reads; omit it when no attached Mixin reads one. */
  readonly input?: unknown
  readonly type?: 'button' | 'submit' | 'reset' | undefined
  readonly disabled?: boolean | undefined
  readonly onClick?: Message | undefined
}

export const view = <Message>(options: ButtonView<Message>, h: HtmlBuilder<Message>): Html =>
  buttonView(
    {
      ...(options.type === undefined ? {} : { type: options.type }),
      ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
      ...(options.onClick === undefined ? {} : { onClick: options.onClick }),
      toView: toView(
        [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
        { input: options.input, h },
        ({ button }) => h.button(button, [options.label]),
      ),
    },
    h,
  )
