/**
 * `ScrollLock` and `HideOutside` as Behaviors: each attaches its
 * `foldkit-primitives/dom` Mount to a container slot. No Bundle, because the
 * lock and the inert set are document facts Foldkit already refcounts and
 * keys.
 */
import type { MountAction } from 'foldkit/mount'
import { Behavior, Capability } from 'foldkit-mixins'
import { HideOutside as HideOutsideMount, ScrollLock as ScrollLockMount } from '../dom/layers.js'

export { HideOutside as hideOutsideMount, ScrollLock as scrollLockMount } from '../dom/layers.js'

const mountOn =
  (name: string, mount: () => MountAction<never>) =>
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(options: {
    readonly container: keyof Slots & string
  }): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
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

/** Locks the document's scroll while the container is mounted; nested locks release together. */
export const scrollLock = mountOn('ScrollLock', () => ScrollLockMount())

/** Marks everything outside the container inert while it is mounted. */
export const hideOutside = mountOn('HideOutside', () => HideOutsideMount())
