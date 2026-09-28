import type { SelectAttributes } from '@foldkit/ui/select'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

/**
 * The base bundle installs `OnChange` only when `onChange` is configured and
 * the control is enabled, so a Behavior that adds its own handler is a
 * conflict rather than a second silent owner.
 */
export const SelectSlots = Slots.define({
  select: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
})

/** The select's bundles with the attached Mixins applied. */
export type ResolvedSelect<Message> = Resolved<
  SelectAttributes<Message>,
  typeof SelectSlots,
  Message
>

/** Applies `mixins` to the select's bundles. */
export const resolve = <Input, Message>(
  attributes: SelectAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedSelect<Message> => resolveFor(SelectSlots, mixins, context)(attributes)

/** The select's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedSelect<Message>) => Html,
  ) =>
  (attributes: SelectAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))
