/**
 * `PointerDrag` as a Behavior: attaches the `foldkit-primitives/dom` Mount to
 * a container slot and maps what it reports into the view's Messages. No
 * Bundle: what is dragged and where the pointer is are facts, and what a drop
 * means, and whether it is allowed, is the parent's `update`.
 */
import * as Mount from 'foldkit/mount'
import { Behavior, Capability, SlotView } from 'foldkit-mixins'
import type { EdgeScroll } from '../dom/edge-scroll.js'
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
  /**
   * Where a drag may land when not among the container's own: elements marked
   * by `attribute` inside the one `within` selects, such as a page for a palette.
   */
  readonly targets?: { readonly attribute: string; readonly within: string }
  /** An attribute naming a part of what a drop lands on, which the place then carries. */
  readonly part?: string
  /**
   * Scroll the nearest scrolling ancestor while the drag is held near its
   * edge (`{}` for the defaults), and report the place under the still pointer
   * after each step. Absent: nothing scrolls. `Reorder` turns it on itself.
   */
  readonly edgeScroll?: EdgeScroll
  /** Turns each fact into the view's Message. */
  readonly toMessage: (fact: DragFact) => ParentMessage
}

export function behavior<Slots, Input, ParentMessage>(
  bound: SlotView.Bound<Slots, Input, ParentMessage>,
): (
  options: BehaviorOptions<Slots, ParentMessage>,
) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(
  slots: SlotView.Unbound<Slots>,
): <Input, ParentMessage>(
  options: BehaviorOptions<Slots, ParentMessage>,
) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
  const slots = SlotView.boundSlots(given)
  return <Input, ParentMessage>(
    options: BehaviorOptions<Slots, ParentMessage>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: () =>
            Mount.mapMessage(
              PointerDragMount({
                attribute: options.attribute,
                ...(options.targets === undefined ? {} : { targets: options.targets }),
                ...(options.part === undefined ? {} : { part: options.part }),
                ...(options.edgeScroll === undefined ? {} : { edgeScroll: options.edgeScroll }),
              }),
              options.toMessage,
            ),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'PointerDrag' },
    )
}
