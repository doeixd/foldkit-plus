import type { RenderInfo } from '@foldkit/ui/hoverIntent'
import { Capability, Event, Slot, Slots } from 'foldkit-mixins'
import { resolveFor, type MixinList, type ResolveContext } from './resolve.js'

/**
 * HoverIntent is a Submodel: open and close delays with intent, for a hover
 * card or a menu that should not flicker. Both bundles are `ChildAttribute`
 * groups: `trigger` owns the pointer and focus entry points, `panel` owns
 * its own so moving into the panel keeps it open. `resolve` preserves each
 * group by identity.
 */
export const HoverIntentSlots = Slots.define({
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Hover, Event.Focus, Event.Blur],
  }),
  panel: Slot.make({
    capability: Capability.Container,
    events: [Event.Hover, Event.Focus, Event.Blur],
  }),
})

/** Resolves the hover-intent render groups; `isVisible` passes through unchanged. */
export const resolve = <Input, Message>(
  render: RenderInfo,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
) => resolveFor(HoverIntentSlots, mixins, context)(render)
