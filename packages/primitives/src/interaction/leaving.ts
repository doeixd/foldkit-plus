/**
 * `Leaving` as a Behavior: attaches the `foldkit-primitives/dom` Mount to a
 * container slot. No Bundle: whether a part is leaving is the view's, and which
 * element has focus is the DOM's.
 */
import { Behavior, Capability } from 'foldkit-mixins'
import { Leaving as LeavingMount } from '../dom/leaving.js'

export { LEAVING, isLeaving, leaving, Leaving as mount } from '../dom/leaving.js'

export interface BehaviorOptions<Slots> {
  /** The slot whose subtree holds the parts; it must be a Container. */
  readonly container: keyof Slots & string
}

/**
 * While a part in this container is marked leaving, focus moves out of it by
 * `FocusRecovery`'s fallback rules and the part becomes inert; unmarking it
 * restores its own `inert` without taking focus back. Mark parts with
 * `leaving(h)`.
 */
export const behavior =
  <Slots>(slots: Slots) =>
  <Input, Message>(
    options: BehaviorOptions<Slots>,
  ): Behavior.NamedBehavior<Slots, Input, Message> =>
    Behavior.forSlots(slots)<Input, Message>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: () => LeavingMount(),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'Leaving' },
    )
