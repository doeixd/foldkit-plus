import type { CheckboxAttributes } from '@foldkit/ui/checkbox'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/**
 * Both the control and its label carry the base toggle handlers, so both own
 * `click`. `hiddenInput` exists only when a form `name` is configured; its base
 * bundle is then empty.
 */
export const CheckboxSlots = Slots.define({
  checkbox: Slot.make({
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

/** The checkbox's bundles with the attached Mixins applied. */
export type ResolvedCheckbox<Message> = Resolved<
  CheckboxAttributes<Message>,
  typeof CheckboxSlots,
  Message
>

/** Applies `mixins` to the checkbox's bundles. */
export const resolve = <Input, Message>(
  attributes: CheckboxAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedCheckbox<Message> => resolveFor(CheckboxSlots, mixins, context)(attributes)

/** The checkbox's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedCheckbox<Message>) => Html,
  ) =>
  (attributes: CheckboxAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))
