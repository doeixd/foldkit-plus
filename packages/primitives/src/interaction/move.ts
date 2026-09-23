/**
 * `Move` as a Behavior: attaches the `foldkit-primitives/dom` Mount to a
 * draggable slot and maps its facts into the view's Messages. No Bundle: a
 * drag's meaning (a threshold, a snap, a reorder) is the parent's `update`,
 * and the deltas are already facts.
 */
import * as Mount from 'foldkit/mount'
import { Behavior, Capability } from 'foldkit-mixins'
import { Move as MoveMount, type Fact } from '../dom/move.js'

export { Move as mount, MoveEnded, MoveStarted, Moved, type Fact } from '../dom/move.js'

export interface BehaviorOptions<Slots, ParentMessage> {
  readonly handle: keyof Slots & string
  /** Turns each fact into the view's Message. */
  readonly toMessage: (fact: Fact) => ParentMessage
}

export const behavior =
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(
    options: BehaviorOptions<Slots, ParentMessage>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.handle]: Behavior.slot({
          requires: { capability: Capability.Draggable },
          mount: () => Mount.mapMessage(MoveMount(), options.toMessage),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Move' },
    )
