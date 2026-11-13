/**
 * `FocusRecovery` as a Behavior: attaches the `foldkit-primitives/dom` Mount to
 * a container slot. No Bundle, because which element has focus is a DOM fact.
 */
import { Behavior, Capability } from 'foldkit-mixins'
import { FocusRecovery as FocusRecoveryMount } from '../dom/focus-recovery.js'

export {
  FOCUS_RECOVERY_PART,
  FOCUS_RECOVERY_TO,
  FocusRecovery as mount,
  part,
} from '../dom/focus-recovery.js'

export interface BehaviorOptions<Slots> {
  /** The slot whose subtree holds the parts; it must be a Container. */
  readonly container: keyof Slots & string
}

/**
 * When the focused descendant of a marked part leaves this container, focus
 * goes to the part's named fallback, else its next sibling, else its previous
 * sibling, else the enclosing part. Mark parts with `part(h, { to })`.
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
          mount: () => FocusRecoveryMount(),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
      { name: 'FocusRecovery' },
    )
