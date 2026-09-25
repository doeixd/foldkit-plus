/**
 * `PointerDrag` as a Behavior: attaches the `foldkit-primitives/dom` Mount to
 * a container slot and maps what it reports into the view's Messages. No
 * Bundle: what is dragged and where the pointer is are facts, and what a drop
 * means, and whether it is allowed, is the parent's `update`.
 */
import * as Mount from 'foldkit/mount'
import { Behavior, Capability } from 'foldkit-mixins'
import { PointerDrag as PointerDragMount, type DragFact } from '../dom/pointer-drag.js'

export {
  DRAG_THRESHOLD,
  DragCancelled,
  DragDropped,
  DragPlace,
  DragStarted,
  DragZone,
  DraggedOver,
  PointerDrag as mount,
  boxOf,
  zoneOf,
  type DragFact,
} from '../dom/pointer-drag.js'

export interface BehaviorOptions<Slots, ParentMessage> {
  /** The slot holding the marked descendants. */
  readonly container: keyof Slots & string
  /** The attribute that marks a descendant, holding its id. */
  readonly attribute: string
  /** Turns each fact into the view's Message. */
  readonly toMessage: (fact: DragFact) => ParentMessage
}

export const behavior =
  <Slots>(slots: Slots) =>
  <Input, ParentMessage>(
    options: BehaviorOptions<Slots, ParentMessage>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: () =>
            Mount.mapMessage(PointerDragMount({ attribute: options.attribute }), options.toMessage),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'PointerDrag' },
    )
