import type { DisclosureAttributes } from '@foldkit/ui/disclosure'
import type { Html } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'
import { DisclosureSlots } from './disclosure/slots.js'

export { DisclosureSlots }
export { Args, Message, Model, controls, init, update } from './disclosure/state.js'
export { configure, view, type DisclosurePreset, type DisclosureView } from './disclosure/view.js'

/** The disclosure's bundles with the attached Mixins applied. */
export type ResolvedDisclosure<Message> = Resolved<
  DisclosureAttributes<Message>,
  typeof DisclosureSlots,
  Message
>

/** `animatePanel` is not an attribute bundle, so it passes through unchanged. */
export const resolve = <Input, Message>(
  attributes: DisclosureAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedDisclosure<Message> => resolveFor(DisclosureSlots, mixins, context)(attributes)

/** The disclosure's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedDisclosure<Message>) => Html,
  ) =>
  (attributes: DisclosureAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))
