import type { InputAttributes } from '@foldkit/ui/input'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { Html } from 'foldkit/html'
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
