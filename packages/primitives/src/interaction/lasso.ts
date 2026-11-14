/**
 * `Lasso` as a Behavior: attaches the `foldkit-primitives/dom` Mount to a
 * surface slot and maps what it reports into the view's Messages. No Bundle:
 * the rectangle and the items under it are facts. The parent keeps the
 * rectangle to draw it, and gives the ids to `Selection` (`replace`, or a
 * union with what is selected when Shift is held).
 */
import * as Mount from 'foldkit/mount'
import { Behavior, Capability } from 'foldkit-mixins'
import { Lasso as LassoMount, type LassoFact } from '../dom/lasso.js'

export {
  Lasso as mount,
  LassoCancelled,
  LassoEnded,
  LassoMoved,
  LassoRect,
  LassoStarted,
  touches,
  type LassoFact,
} from '../dom/lasso.js'

export interface BehaviorOptions<Slots, ParentMessage> {
  /** The slot the rectangle is drawn on; it holds the items. */
  readonly surface: keyof Slots & string
  /** The attribute that marks an item, holding its id. */
  readonly attribute: string
  /** Turns each fact into the view's Message. */
  readonly toMessage: (fact: LassoFact) => ParentMessage
}

export const behavior =
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(
    options: BehaviorOptions<Slots, ParentMessage>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.surface]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: () =>
            Mount.mapMessage(LassoMount({ attribute: options.attribute }), options.toMessage),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Lasso' },
    )
