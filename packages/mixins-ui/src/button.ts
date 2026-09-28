import type { ButtonAttributes } from '@foldkit/ui/button'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
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
