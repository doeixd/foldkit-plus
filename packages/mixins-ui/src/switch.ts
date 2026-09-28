import type { SwitchAttributes } from '@foldkit/ui/switch'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/** Mirrors the checkbox contract: both the control and its label own `click`. */
export const SwitchSlots = Slots.define({
  button: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Role, Attr.AriaDisabled, Attr.Disabled, Attr.Value],
  }),
  label: Slot.make({
    capability: Capability.Container,
    events: [Event.Click],
  }),
  description: Slot.make({ capability: Capability.Container }),
  hiddenInput: Slot.make({
    capability: Capability.Base,
    attributes: [Attr.Value],
  }),
})

/** The switch's bundles with the attached Mixins applied. */
export type ResolvedSwitch<Message> = Resolved<
  SwitchAttributes<Message>,
  typeof SwitchSlots,
  Message
>

/** Applies `mixins` to the switch's bundles. */
export const resolve = <Input, Message>(
  attributes: SwitchAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedSwitch<Message> => resolveFor(SwitchSlots, mixins, context)(attributes)

/** The switch's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedSwitch<Message>) => Html,
  ) =>
  (attributes: SwitchAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))
