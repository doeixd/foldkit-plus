/**
 * `Targets` as a Behavior: attaches the `foldkit-primitives/dom` Mount to a
 * container slot and maps what it reports into the view's Messages. No Bundle:
 * which descendant is under the pointer, or was pressed, is already a fact, and
 * what it means is the parent's `update`.
 */
import * as Mount from 'foldkit/mount'
import { Behavior, Capability, SlotView } from 'foldkit-mixins'
import { boundSlots, type Unbound } from '../internal.js'
import { Targets as TargetsMount, type TargetFact } from '../dom/targets.js'

export {
  TargetHovered,
  TargetPressed,
  Targets as mount,
  targetOf,
  type TargetFact,
} from '../dom/targets.js'

export interface BehaviorOptions<Slots, ParentMessage> {
  /** The slot holding the marked descendants. */
  readonly container: keyof Slots & string
  /** The attribute that marks a descendant, holding its id. */
  readonly attribute: string
  /** Prevent a press's default, such as a link navigating. Default `false`. */
  readonly preventDefault?: boolean
  /** Turns each fact into the view's Message. */
  readonly toMessage: (fact: TargetFact) => ParentMessage
}

export function behavior<Slots, Input, ParentMessage>(
  bound: SlotView.Bound<Slots, Input, ParentMessage>,
): (
  options: BehaviorOptions<Slots, ParentMessage>,
) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(
  slots: Unbound<Slots>,
): <Input, ParentMessage>(
  options: BehaviorOptions<Slots, ParentMessage>,
) => Behavior.NamedBehavior<Slots, Input, ParentMessage>
export function behavior<Slots>(given: Slots | SlotView.Bound<Slots, any, any>) {
  const slots = boundSlots(given)
  return <Input, ParentMessage>(
    options: BehaviorOptions<Slots, ParentMessage>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> =>
    Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.container]: Behavior.slot({
          requires: { capability: Capability.Container },
          mount: () =>
            Mount.mapMessage(
              TargetsMount({
                attribute: options.attribute,
                preventDefault: options.preventDefault ?? false,
              }),
              options.toMessage,
            ),
        }),
        // Keyed by a value the caller chose; `forSlots` checks the key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'Targets' },
    )
}
