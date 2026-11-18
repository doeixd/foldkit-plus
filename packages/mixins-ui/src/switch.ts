import type { SwitchAttributes } from '@foldkit/ui/switch'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'
import { SwitchSlots } from './switch/slots.js'

export { SwitchSlots } from './switch/slots.js'
export { draggable } from './switch/draggable.js'
export { configure, view, type SwitchPreset, type SwitchView } from './switch/view.js'

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
