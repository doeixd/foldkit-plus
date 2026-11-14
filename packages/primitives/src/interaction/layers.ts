/**
 * `ScrollLock` and `HideOutside` as Behaviors: each attaches its
 * `foldkit-primitives/dom` Mount to a container slot. No Bundle, because the
 * lock and the inert set are document facts Foldkit already refcounts and
 * keys.
 */
import type { MountAction } from 'foldkit/mount'
import { Behavior, Capability, SlotView } from 'foldkit-mixins'
import { HideOutside as HideOutsideMount, ScrollLock as ScrollLockMount } from '../dom/layers.js'

export { HideOutside as hideOutsideMount, ScrollLock as scrollLockMount } from '../dom/layers.js'

export interface ContainerOptions<Slots> {
  readonly container: keyof Slots & string
}

const mountOn = (name: string, mount: () => MountAction<never>) => {
  function place<Slots, Input, ParentMessage>(
    bound: SlotView.Bound<Slots, Input, ParentMessage>,
  ): (options: ContainerOptions<Slots>) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(
    slots: SlotView.Unbound<Slots>,
  ): <Input, ParentMessage>(
    options: ContainerOptions<Slots>,
  ) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
  function place<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
    const slots = SlotView.boundSlots(given)
    return <Input, ParentMessage>(
      options: ContainerOptions<Slots>,
    ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
      Behavior.forSlots(slots)<Input, ParentMessage>(
        {
          [options.container]: Behavior.slot({
            requires: { capability: Capability.Container },
            mount,
          }),
          // Keyed by a value the caller chose; `forSlots` checks the key exists.
        } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
        { name },
      )
  }
  return place
}

/** Locks the document's scroll while the container is mounted; nested locks release together. */
export const scrollLock = mountOn('ScrollLock', () => ScrollLockMount())

/** Marks everything outside the container inert while it is mounted. */
export const hideOutside = mountOn('HideOutside', () => HideOutsideMount())
