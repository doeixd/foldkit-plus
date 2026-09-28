import type { FieldsetAttributes } from '@foldkit/ui/fieldset'
import { Attr, Capability, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

export const FieldsetSlots = Slots.define({
  fieldset: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Disabled],
  }),
  legend: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
})

/** The fieldset's bundles with the attached Mixins applied. */
export type ResolvedFieldset<Message> = Resolved<
  FieldsetAttributes<Message>,
  typeof FieldsetSlots,
  Message
>

/** Applies `mixins` to the fieldset's bundles. */
export const resolve = <Input, Message>(
  attributes: FieldsetAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedFieldset<Message> => resolveFor(FieldsetSlots, mixins, context)(attributes)

/** The fieldset's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedFieldset<Message>) => Html,
  ) =>
  (attributes: FieldsetAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))
