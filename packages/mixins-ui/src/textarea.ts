import type { TextareaAttributes } from '@foldkit/ui/textarea'
import { Attr, Capability, Event, Slot, Slots } from 'foldkit-mixins'
import type { ChildAttribute, Html, TextareaAttribute } from 'foldkit/html'
import { resolveFor, type MixinList, type ResolveContext, type Resolved } from './resolve.js'

export const TextareaSlots = Slots.define({
  textarea: Slot.make({
    capability: Capability.TextInput,
    events: [Event.Input, Event.Focus, Event.Blur],
    attributes: [Attr.AriaLabel, Attr.AriaInvalid, Attr.Disabled, Attr.Value],
  }),
  label: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
})

/**
 * The textarea's bundles with the attached Mixins applied. `textarea` is typed
 * for `h.textarea`, which refuses `InnerHTML`.
 */
export type ResolvedTextarea<Message> = Omit<
  Resolved<TextareaAttributes<Message>, typeof TextareaSlots, Message>,
  'textarea'
> & {
  readonly textarea: ReadonlyArray<TextareaAttribute<Message> | ChildAttribute>
}

/** Applies `mixins` to the textarea's bundles. */
export const resolve = <Input, Message>(
  attributes: TextareaAttributes<Message>,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedTextarea<Message> =>
  // The base bundle holds no `InnerHTML` (its type excludes it) and the resolver
  // refuses one from any Mixin (`mixins:structural-override`), so none is left.
  resolveFor(TextareaSlots, mixins, context)(attributes) as ResolvedTextarea<Message>

/** The textarea's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedTextarea<Message>) => Html,
  ) =>
  (attributes: TextareaAttributes<Message>): Html =>
    draw(resolve(attributes, mixins, context))
