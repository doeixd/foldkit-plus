import type { SelectAttributes } from '@foldkit/ui/select'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'
import { SelectSlots } from './select/slots.js'

export { SelectSlots } from './select/slots.js'
export {
  configure,
  view,
  type SelectOption,
  type SelectPreset,
  type SelectView,
} from './select/view.js'

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
