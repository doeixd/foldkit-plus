/**
 * `Marquee` as a Behavior: a lasso over the container's marked descendants.
 * No Bundle: the rectangle is for the view to draw in a Slot of its own, and
 * the ids it touches are for the parent's `update` to select, through
 * `Selection`'s `Replaced` (`Marquee.selected` combines them with what was
 * selected when the press was additive). It composes with `PointerDrag` on the
 * same container: a press on a marked descendant is the drag's, a press on
 * empty space is the lasso's.
 */
import * as Mount from 'foldkit/mount'
import { Behavior, Capability, SlotView } from 'foldkit-mixins'
import type { EdgeScroll } from '../dom/edge-scroll.js'
import { Marquee as MarqueeMount, type MarqueeFact } from '../dom/marquee.js'

export {
  MarqueeCancelled,
  MarqueeChanged,
  MarqueeEnded,
  MarqueeRect,
  MarqueeStarted,
  Marquee as mount,
  type MarqueeFact,
} from '../dom/marquee.js'

export interface BehaviorOptions<Slots, ParentMessage> {
  /** The slot holding the marked descendants; it must be a box (not `display: contents`). */
  readonly container: keyof Slots & string
  /** The attribute that marks a descendant, holding its id. */
  readonly attribute: string
  /** Scroll the nearest scrolling ancestor while the pointer is held near its edge. Absent: nothing scrolls. */
  readonly edgeScroll?: EdgeScroll
  /** Turns each fact into the view's Message. */
  readonly toMessage: (fact: MarqueeFact) => ParentMessage
}

/**
 * The selection a lasso makes: the ids it touches, or, when the press was
 * additive, those after what was selected before it (the parent keeps that
 * from `MarqueeStarted`'s Message, as the Model before the first change).
 */
export const selected = (
  before: ReadonlyArray<string>,
  fact: { readonly ids: ReadonlyArray<string>; readonly additive: boolean },
): ReadonlyArray<string> =>
  fact.additive ? [...before, ...fact.ids.filter(id => !before.includes(id))] : fact.ids

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
              MarqueeMount({
                attribute: options.attribute,
                ...(options.edgeScroll === undefined ? {} : { edgeScroll: options.edgeScroll }),
              }),
              options.toMessage,
            ),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Marquee' },
    )
}
