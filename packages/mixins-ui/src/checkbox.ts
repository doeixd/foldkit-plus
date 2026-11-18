import type { CheckboxAttributes } from '@foldkit/ui/checkbox'
import type { Html } from 'foldkit/html'
import { CheckboxSlots } from './checkbox/slots.js'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

export { CheckboxSlots } from './checkbox/slots.js'
export { configure, view, type CheckboxPreset, type CheckboxView } from './checkbox/view.js'

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
